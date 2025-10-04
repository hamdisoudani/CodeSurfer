import asyncio
import os
import traceback
from datetime import datetime
import threading

from loguru import logger
import hashlib
import chromadb

from .config import Config
from .logger import setup_logging
from .nats_consumer import NATSConsumer
from .grpc_backend import BackendClient
from .grpc_server import GRPCServer
from .git_clone import clone_repo, cleanup_repo
from .indexing import index_repository


async def handle_job(cfg: Config, nats: NATSConsumer, backend: BackendClient, payload: dict) -> None:
	job_data = payload.get('data')
	if not isinstance(job_data, dict):
		logger.error(f"Received malformed job payload (data key is not a dict): {payload}")
		return

	workspace_id = job_data.get('workspace_id')
	user_id = job_data.get('user_id')
	installation_id = job_data.get('installation_id')
	repo = job_data.get('repo')
	branch = job_data.get('branch') or 'main'
	job_type = job_data.get('type') or 'index'

	if not all([workspace_id, user_id, installation_id, repo]):
		logger.error(f"Missing required fields in job payload: {job_data}")
		return

	async def update(status: str, progress: int, phase: str, error: str | None = None):
		try:
			await nats.publish_progress(workspace_id, {
				"workspace_id": workspace_id,
				"status": status,
				"progress": progress,
				"phase": phase,
				"error": error,
				"timestamp": datetime.utcnow().isoformat() + 'Z',
			})
			# Durable status message for recovery
			await nats.publish_status(workspace_id, {
				"workspace_id": workspace_id,
				"status": status,
				"progress": progress,
				"phase": phase,
				"error": error,
				"timestamp": datetime.utcnow().isoformat() + 'Z',
			})
			backend.update_workspace_status(workspace_id, status, progress, phase, error)
		except Exception:
			logger.warning("Failed to push progress update")

	try:
		await update('building', 5, 'starting')

		# Get GitHub token via gRPC
		token = backend.get_github_token(installation_id, workspace_id, repo)
		if not token:
			raise Exception('Failed to get GitHub token from backend')

		# Preflight: if collection already exists and has vectors, treat as already indexed
		try:
			chroma_cfg = Config.parse_chroma(cfg.CHROMA_URL)
			client = chromadb.HttpClient(host=chroma_cfg["host"], port=chroma_cfg["port"], ssl=chroma_cfg["ssl"])  # type: ignore
			try:
				collection = client.get_collection(name=f"ws_{workspace_id}")
				if collection.count() > 0:
					await update('ready', 100, 'already_indexed')
					logger.info(f"Workspace {workspace_id} already indexed; skipping re-index.")
					return
			except Exception:
				pass
		except Exception:
			logger.warning("Chroma preflight check failed; proceeding with indexing")

		# Derive a stable hashed working directory for temporary clone (repo:branch:user -> sha256)
		try:
			unique_key = f"{repo}:{branch}:{user_id}".encode()
			hashed_id = hashlib.sha256(unique_key).hexdigest()[:16]
		except Exception:
			hashed_id = workspace_id  # fallback

		repo_path, commit_sha = clone_repo(token, repo, branch, hashed_id, cfg.WORK_DIR)
		await update('building', 10, 'parsing')

		def pb(ev: dict):
			try:
				phase = ev.get('phase')
				if phase == 'parsing':
					total = int(ev.get('total_files') or 0)
					done = int(ev.get('processed_files') or 0)
					pct = 10 + int((done / total) * 20) if total > 0 else 15
					nats_payload = {
						"workspace_id": workspace_id,
						"status": 'building',
						"phase": 'parsing',
						"progress": pct,
						"total_files": total,
						"processed_files": done,
					}
					# publish granular
					asyncio.create_task(nats.publish_progress(workspace_id, nats_payload))
					backend.update_workspace_status(workspace_id, 'building', pct, 'parsing', None)
				elif phase == 'embedding':
					total = int(ev.get('total_nodes') or 0)
					done = int(ev.get('embedded_nodes') or 0)
					pct = 30 + int((done / total) * 60) if total > 0 else 60
					nats_payload = {
						"workspace_id": workspace_id,
						"status": 'building',
						"phase": 'embedding',
						"progress": pct,
						"total_nodes": total,
						"embedded_nodes": done,
					}
					asyncio.create_task(nats.publish_progress(workspace_id, nats_payload))
					backend.update_workspace_status(workspace_id, 'building', pct, 'embedding', None)
			except Exception:
				pass

		count = index_repository(cfg, repo_path, workspace_id, repo, branch, commit_sha, progress_cb=pb)
		await update('building', 95, 'finalizing')

		cleanup_repo(repo_path)
		await update('ready', 100, 'complete')
		logger.info(f"Indexing complete for workspace {workspace_id}, nodes: {count}")

	except Exception as e:
		logger.error(f"Indexing failed for workspace {workspace_id}: {e}\n{traceback.format_exc()}")
		await update('failed', 0, 'error', str(e))


async def main() -> None:
	cfg = Config()
	setup_logging(cfg.LOG_LEVEL)

	# Initialize NATS consumer
	nats = NATSConsumer(cfg.NATS_URL)
	await nats.connect()

	# Initialize backend gRPC client
	backend = BackendClient(cfg.BACKEND_GRPC_URL)
	backend.connect()

	# Start gRPC server in a separate thread
	grpc_server = GRPCServer(cfg, port=50051)
	grpc_thread = threading.Thread(target=grpc_server.start, daemon=True)
	grpc_thread.start()

	# Subscribe to NATS jobs
	await nats.subscribe_jobs('indexing.jobs.queue', lambda payload: handle_job(cfg, nats, backend, payload))

	logger.info('Python indexer microservice is running:')
	logger.info('- NATS consumer: Listening for indexing jobs')
	logger.info('- gRPC server: Ready for query requests on port 50051')
	
	# Keep the service running to listen for NATS messages and handle gRPC requests
	try:
		while True:
			await asyncio.sleep(60)  # Check every minute
	except KeyboardInterrupt:
		logger.info('Shutting down gracefully...')
		grpc_server.stop()
		await nats.close()
		backend.close()


if __name__ == '__main__':
	asyncio.run(main())


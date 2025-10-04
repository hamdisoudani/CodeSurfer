import os
from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass(frozen=True)
class Config:
	# External services
	NATS_URL: str = os.getenv("NATS_URL", "nats://localhost:4222")
	CHROMA_URL: str = os.getenv("CHROMA_URL", "http://localhost:8000")
	BACKEND_GRPC_URL: str = os.getenv("BACKEND_GRPC_URL", "backend:50052")

	# NVIDIA embeddings
	NVIDIA_API_KEY: str = os.getenv("NVIDIA_API_KEY", "")
	NVIDIA_EMBED_MODEL: str = os.getenv("NVIDIA_EMBED_MODEL", "nvidia/nv-embedcode-7b-v1")

	# Indexing parameters
	INDEX_CHUNK_SIZE: int = int(os.getenv("INDEX_CHUNK_SIZE", "512"))
	INDEX_CHUNK_OVERLAP: int = int(os.getenv("INDEX_CHUNK_OVERLAP", "80"))
	EMBED_BATCH_SIZE: int = int(os.getenv("EMBED_BATCH_SIZE", "3"))

	# Workspace
	WORK_DIR: str = os.getenv("WORK_DIR", "/tmp/indexer")

	# Logging
	LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

	@staticmethod
	def parse_chroma(chroma_url: str):
		parsed = urlparse(chroma_url)
		if parsed.scheme in {"http", "https"}:
			# chromadb.HttpClient(host, port, ssl) expects host/port
			return {
				"scheme": parsed.scheme,
				"host": parsed.hostname or "localhost",
				"port": parsed.port or 8000,
				"ssl": parsed.scheme == "https",
			}
		# Default fallback
		return {"scheme": "http", "host": "localhost", "port": 8000, "ssl": False}


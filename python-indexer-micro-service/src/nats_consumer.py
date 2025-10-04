import asyncio
import json
from typing import Awaitable, Callable

from loguru import logger
from nats.aio.client import Client as NATS


class NATSConsumer:
	def __init__(self, nats_url: str):
		self._url = nats_url
		self._nc = NATS()
		self._js = None

	async def connect(self) -> None:
		logger.info(f"Connecting to NATS at {self._url}")
		backoff = 1
		while True:
			try:
				await self._nc.connect(
					servers=[self._url],
					allow_reconnect=True,
					max_reconnect_attempts=-1,
					reconnect_time_wait=2,
					connect_timeout=5,
					ping_interval=10,
				)
				break
			except Exception as e:
				logger.error(f"NATS connect failed ({e}); retrying in {backoff}s ...")
				await asyncio.sleep(backoff)
				backoff = min(backoff * 2, 30)

		self._js = self._nc.jetstream()
		# Ensure stream for durable status updates exists
		try:
			await self._js.add_stream(name="INDEXING_STATUS", subjects=["indexing.status.*"])
		except Exception:
			pass
		logger.info("Connected to NATS")

	async def subscribe_jobs(self, subject: str, handler: Callable[[dict], Awaitable[None]]) -> None:
		async def _cb(msg):
			try:
				payload = json.loads(msg.data.decode())
				logger.info(f"Received job on {subject}: {payload}")
				await handler(payload)
			except Exception as e:
				logger.exception(f"Failed to handle message: {e}")

		await self._nc.subscribe(subject, cb=_cb)
		logger.info(f"Subscribed to {subject}")

	async def publish_progress(self, workspace_id: str, data: dict) -> None:
		subject = f"indexing.progress.{workspace_id}"
		await self._safe_publish(subject, data)

	async def publish_status(self, workspace_id: str, data: dict) -> None:
		# Publish durable status updates via JetStream so backend can catch up after restarts
		subject = f"indexing.status.{workspace_id}"
		await self._safe_js_publish(subject, data)

	async def _safe_publish(self, subject: str, data: dict, retries: int = 5) -> None:
		payload = json.dumps(data).encode()
		backoff = 0.5
		for _ in range(retries):
			try:
				await self._nc.publish(subject, payload)
				return
			except Exception as e:
				logger.warning(f"NATS publish error on {subject}: {e}; retrying in {backoff}s")
				await asyncio.sleep(backoff)
				backoff = min(backoff * 2, 5)

	async def _safe_js_publish(self, subject: str, data: dict, retries: int = 5) -> None:
		payload = json.dumps(data).encode()
		backoff = 0.5
		for _ in range(retries):
			try:
				if self._js is None:
					self._js = self._nc.jetstream()
				await self._js.publish(subject, payload)
				return
			except Exception as e:
				logger.warning(f"JetStream publish error on {subject}: {e}; retrying in {backoff}s")
				await asyncio.sleep(backoff)
				backoff = min(backoff * 2, 5)

	async def close(self) -> None:
		if self._nc.is_connected:
			await self._nc.drain()




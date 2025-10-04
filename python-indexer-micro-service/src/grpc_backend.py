from __future__ import annotations

import grpc
from dataclasses import dataclass
from typing import Optional

backend_pb2 = None
backend_pb2_grpc = None

# Stubs are expected to be in PYTHONPATH (in /app/generated)
# Run `npm run proto:gen:python` from the root of the project for local dev.
try:
	import backend_pb2
	import backend_pb2_grpc
	backend_pb2, backend_pb2_grpc = backend_pb2, backend_pb2_grpc
except ImportError:
	# This will be caught by the connect check
	pass

@dataclass
class BackendClient:
	address: str
	channel: Optional[grpc.Channel] = None
	stub: Optional[object] = None

	def connect(self) -> None:
		self.channel = grpc.insecure_channel(self.address)
		if backend_pb2_grpc is None:
			raise RuntimeError(
				"gRPC stubs not found. Please run `npm run proto:gen:python` from the project root."
			)
		self.stub = backend_pb2_grpc.BackendServiceStub(self.channel)

	def close(self) -> None:
		if self.channel:
			self.channel.close()

	def get_github_token(self, installation_id: str, workspace_id: str, repo: str) -> str:
		if not self.stub or backend_pb2 is None:
			raise RuntimeError("BackendClient not connected or stubs missing")
		resp = self.stub.GetGitHubToken(
			backend_pb2.GetGitHubTokenRequest(
				installation_id=installation_id,
				workspace_id=workspace_id,
				repo=repo,
				repositories=[],
			)
		)
		return getattr(resp, "token", "")

	def update_workspace_status(
		self,
		workspace_id: str,
		status: str,
		progress: Optional[int] = None,
		phase: Optional[str] = None,
		error: Optional[str] = None,
		last_indexed_at: Optional[str] = None,
		commit_sha: Optional[str] = None,
	) -> bool:
		if not self.stub or backend_pb2 is None:
			raise RuntimeError("BackendClient not connected or stubs missing")
		req = backend_pb2.UpdateWorkspaceStatusRequest(
			workspace_id=workspace_id,
			status=status,
		)
		if progress is not None:
			req.progress = int(progress)
		if phase is not None:
			req.phase = phase
		if error is not None and error != "":
			req.error = error
		if last_indexed_at is not None and last_indexed_at != "":
			req.last_indexed_at = last_indexed_at
		if commit_sha is not None and commit_sha != "":
			req.commit_sha = commit_sha

		resp = self.stub.UpdateWorkspaceStatus(req)
		return bool(getattr(resp, "success", False))


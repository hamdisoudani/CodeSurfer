import os
import shutil
from pathlib import Path
from typing import Tuple

from git import Repo
from loguru import logger


def clone_repo(token: str, repo_full_name: str, branch: str, workspace_id: str, work_dir: str) -> Tuple[str, str]:
	base_dir = Path(work_dir) / workspace_id
	# Ensure the target directory is clean before cloning to avoid git error 128
	if base_dir.exists():
		try:
			shutil.rmtree(base_dir)
			logger.info(f"Removed existing directory {base_dir} before cloning")
		except Exception as e:
			logger.warning(f"Failed to remove existing directory {base_dir}: {e}")
	base_dir.mkdir(parents=True, exist_ok=True)
	repo_url = f"https://x-access-token:{token}@github.com/{repo_full_name}.git"
	logger.info(f"Cloning repo {repo_full_name}@{branch} -> {base_dir}")
	repo = Repo.clone_from(repo_url, base_dir, branch=branch)
	commit_sha = repo.head.commit.hexsha
	return str(base_dir), commit_sha


def cleanup_repo(path: str) -> None:
	try:
		shutil.rmtree(path, ignore_errors=True)
		logger.info(f"Cleaned up {path}")
	except Exception as e:
		logger.warning(f"Failed to cleanup {path}: {e}")



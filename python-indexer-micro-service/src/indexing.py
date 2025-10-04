from __future__ import annotations

import time
import os
from typing import List, Dict, Any, Optional, Callable

from loguru import logger
from llama_index.core import SimpleDirectoryReader, VectorStoreIndex, Settings, StorageContext
from llama_index.core.node_parser import SimpleNodeParser
from llama_index.embeddings.nvidia import NVIDIAEmbedding
from llama_index.vector_stores.chroma import ChromaVectorStore
import chromadb

from .config import Config


def index_repository(
    cfg: Config,
    repo_path: str,
    workspace_id: str,
    repo_full_name: str,
    branch: str,
    commit_sha: str,
    progress_cb: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> int:
	# Embedding model (pass explicitly to Index) and disable default LLM
	embed_model = NVIDIAEmbedding(
		model=cfg.NVIDIA_EMBED_MODEL,
		api_key=cfg.NVIDIA_API_KEY,
		truncate="END",
	)
	Settings.llm = None
	Settings.embed_model = embed_model

	# Chunking tuned for code
	parser = SimpleNodeParser.from_defaults(chunk_size=cfg.INDEX_CHUNK_SIZE, chunk_overlap=cfg.INDEX_CHUNK_OVERLAP)

	# Read repository (restrict to sensible code/text extensions)
	required_exts = [
		".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".go", ".rb", ".php", ".cs",
		".md", ".yml", ".yaml", ".json", ".toml", ".cfg", ".ini", ".sh", ".bash"
	]
	reader = SimpleDirectoryReader(
		repo_path,
		recursive=True,
		exclude=["**/node_modules/**", "**/.git/**", "**/__pycache__/**", "**/*.lock", "**/.env"],
		required_exts=required_exts,
	)
	documents = reader.load_data()
	total_files = len(documents)
	if progress_cb:
		try:
			progress_cb({
				"phase": "parsing",
				"total_files": total_files,
				"processed_files": 0,
			})
		except Exception:
			pass

	# Map file paths to VM path and enrich metadata
	repo_abs = os.path.abspath(repo_path)
	vm_root = "/home/daytona/repo"
	for doc in documents:
		meta = doc.metadata or {}
		orig_path = meta.get("file_path") or meta.get("filepath") or meta.get("source")
		try:
			rel_path = os.path.relpath(orig_path, repo_abs) if orig_path else None
		except Exception:
			rel_path = None
		vm_path = os.path.join(vm_root, rel_path).replace("\\", "/") if rel_path else meta.get("file_path")
		meta.update({
			"workspace_id": workspace_id,
			"repo_full_name": repo_full_name,
			"branch": branch,
			"commit_sha": commit_sha,
			"indexed_at": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
			"local_path": orig_path or "",
			"file_name": os.path.basename(orig_path) if orig_path else meta.get("file_name", ""),
			"file_path": vm_path or meta.get("file_path", ""),
		})
		doc.metadata = meta

	# Parse and drop empty nodes; update progress per document to reflect file-level progress
	nodes: List[Any] = []
	for idx, doc in enumerate(documents):
		try:
			doc_nodes = parser.get_nodes_from_documents([doc])
			nodes.extend([n for n in doc_nodes if getattr(n, "text", None) and getattr(n, "text").strip()])
		finally:
			if progress_cb:
				try:
					progress_cb({
						"phase": "parsing",
						"total_files": total_files,
						"processed_files": idx + 1,
					})
				except Exception:
					pass

	# Chroma client and vector store
	chroma_cfg = Config.parse_chroma(cfg.CHROMA_URL)
	client = chromadb.HttpClient(host=chroma_cfg["host"], port=chroma_cfg["port"], ssl=chroma_cfg["ssl"])  # type: ignore
	collection_name = f"ws_{workspace_id}"

	# Ensure fresh collection with COSINE distance: delete then create
	try:
		try:
			client.delete_collection(collection_name)
		except Exception:
			pass
		collection = client.create_collection(
			name=collection_name,
			metadata={"hnsw:space": "cosine"}
		)
	except Exception as e:
		raise RuntimeError(f"Failed to recreate Chroma collection '{collection_name}': {e}")

	vector_store = ChromaVectorStore(chroma_collection=collection)
	storage_context = StorageContext.from_defaults(vector_store=vector_store)

	# Build index from nodes and persist to Chroma in batches so we can report embedding progress
	total_nodes = len(nodes)
	embedded = 0

	def chunk(items: List[Any], size: int) -> List[List[Any]]:
		for i in range(0, len(items), size):
			yield items[i:i + size]

	batch_size = max(1, int(os.getenv("INDEX_EMBED_BATCH", str(max(8, cfg.EMBED_BATCH_SIZE * 64)))))
	for batch in chunk(nodes, batch_size):
		VectorStoreIndex(
			nodes=batch,
			storage_context=storage_context,
			embed_model=embed_model,
		)
		embedded += len(batch)
		if progress_cb:
			try:
				progress_cb({
					"phase": "embedding",
					"total_nodes": total_nodes,
					"embedded_nodes": embedded,
				})
			except Exception:
				pass

	# Heartbeat to ensure server processed writes (optional)
	try:
		client.heartbeat()
	except Exception:
		pass

	# Debug: how many vectors present
	try:
		count = collection.count()
		logger.info(f"Indexed vector count in '{collection_name}': {count}")
	except Exception:
		pass

	return len(nodes)


def query_repository(cfg: Config, workspace_id: str, query: str, limit: int = 10, similarity_threshold: float = 0.0) -> List[Dict[str, Any]]:
	"""Query indexed repository using semantic search"""
	# Embedding model for query and disable default LLM
	embed_model = NVIDIAEmbedding(
		model=cfg.NVIDIA_EMBED_MODEL,
		api_key=cfg.NVIDIA_API_KEY,
		truncate="END",
	)
	Settings.llm = None
	Settings.embed_model = embed_model

	# Connect to existing Chroma collection
	chroma_cfg = Config.parse_chroma(cfg.CHROMA_URL)
	client = chromadb.HttpClient(host=chroma_cfg["host"], port=chroma_cfg["port"], ssl=chroma_cfg["ssl"])  # type: ignore
	collection_name = f"ws_{workspace_id}"
	
	try:
		collection = client.get_collection(name=collection_name)
		logger.info(f"Collection '{collection_name}' vector count: {collection.count()}")
	except Exception as e:
		logger.error(f"Collection {collection_name} not found or not accessible: {e}")
		return []

	# Use the canonical LlamaIndex flow to query an existing vector store
	vector_store = ChromaVectorStore(chroma_collection=collection)
	index = VectorStoreIndex.from_vector_store(
		vector_store=vector_store,
		embed_model=embed_model,
	)
	
	query_engine = index.as_query_engine(
		similarity_top_k=limit,
		response_mode="no_text", # We only want source nodes, not a synthesized response
	)
	
	response = query_engine.query(query)
	logger.debug(f"Raw LlamaIndex response: {response.source_nodes}")

	# Process results from the query engine's source nodes (no threshold filtering here)
	results: List[Dict[str, Any]] = []
	if hasattr(response, 'source_nodes') and response.source_nodes:
		for node_with_score in response.source_nodes:
			# Extract score directly from NodeWithScore object
			score = float(node_with_score.score) if hasattr(node_with_score, 'score') and node_with_score.score is not None else 0.0
			
			# Extract node and its properties
			node = node_with_score.node if hasattr(node_with_score, 'node') else None
			if not node:
				continue
				
			content = node.text if hasattr(node, 'text') else ''
			metadata = node.metadata if hasattr(node, 'metadata') else {}
			file_path = metadata.get("file_path", "") or metadata.get("file_name", "")
			chunk_id = node.node_id if hasattr(node, 'node_id') else ''
			
			# Extract line information if available (for chunked content)
			start_line = metadata.get("start_line")
			end_line = metadata.get("end_line")
			
			result_item = {
				"content": content,
				"file_path": file_path,
				"similarity_score": score,
				"chunk_id": chunk_id,
			}
			
			# Add line info if available
			if start_line is not None:
				result_item["start_line"] = start_line
			if end_line is not None:
				result_item["end_line"] = end_line
				
			results.append(result_item)

	logger.info(f"Query '{query}' returned {len(results)} results for workspace {workspace_id}")
	logger.debug(f"Final results from query_repository: {results}")
	return results


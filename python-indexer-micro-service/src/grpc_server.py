from __future__ import annotations

import grpc
from concurrent import futures
import threading
from typing import Optional

from loguru import logger

from .config import Config
from .indexing import query_repository

# Import generated protobuf stubs - these will be available after proto generation
backend_pb2 = None
backend_pb2_grpc = None

try:
    import backend_pb2
    import backend_pb2_grpc
except ImportError:
    # This will be caught by the server startup check
    pass


class IndexerServicer(backend_pb2_grpc.BackendServiceServicer):
    """gRPC servicer for handling query requests from backend"""
    
    def __init__(self, config: Config):
        self.config = config

    def QueryWorkspace(self, request, context):
        """Handle workspace query requests"""
        if backend_pb2 is None:
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details("gRPC stubs not available")
            return backend_pb2.QueryWorkspaceResponse(success=False, error="gRPC stubs not available")

        try:
            workspace_id = request.workspace_id
            query = request.query
            limit = request.limit if request.limit > 0 else 10
            similarity_threshold = request.similarity_threshold if request.similarity_threshold > 0 else 0.7

            logger.info(f"Received query request for workspace {workspace_id}: '{query}'")
            
            # DEBUG: List all available workspaces in Chroma
            try:
                import chromadb
                from .config import Config
                chroma_cfg = Config.parse_chroma(self.config.CHROMA_URL)
                debug_client = chromadb.HttpClient(host=chroma_cfg["host"], port=chroma_cfg["port"], ssl=chroma_cfg["ssl"])
                
                all_collections = debug_client.list_collections()
                collection_names = [col.name for col in all_collections]
                logger.info(f"🔍 DEBUG: Available Chroma collections: {collection_names}")
                
                target_collection = f"ws_{workspace_id}"
                if target_collection in collection_names:
                    logger.info(f"✅ DEBUG: Target workspace collection '{target_collection}' EXISTS")
                else:
                    logger.warning(f"❌ DEBUG: Target workspace collection '{target_collection}' NOT FOUND")
                
            except Exception as debug_error:
                logger.error(f"❌ DEBUG: Failed to list Chroma collections: {debug_error}")
            
            # Query the repository
            search_results = query_repository(
                self.config, 
                workspace_id, 
                query, 
                limit=limit, 
                similarity_threshold=similarity_threshold
            )

            # Convert results to protobuf format
            pb_results = []
            for result in search_results:
                pb_result = backend_pb2.SearchResult(
                    content=result.get("content", ""),
                    file_path=result.get("file_path", ""),
                    similarity_score=result.get("similarity_score", 0.0),
                    chunk_id=result.get("chunk_id", "")
                )
                
                # Add line numbers if available
                if "start_line" in result:
                    pb_result.start_line = result["start_line"]
                if "end_line" in result:
                    pb_result.end_line = result["end_line"]
                
                pb_results.append(pb_result)

            logger.info(f"Returning {len(pb_results)} results for workspace {workspace_id}")
            logger.debug(f"Sending pb_results to backend: {pb_results}")
            return backend_pb2.QueryWorkspaceResponse(
                success=True,
                results=pb_results
            )

        except Exception as e:
            logger.error(f"Error processing query for workspace {request.workspace_id}: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return backend_pb2.QueryWorkspaceResponse(
                success=False,
                error=str(e)
            )


class GRPCServer:
    """gRPC server for handling backend requests"""
    
    def __init__(self, config: Config, port: int = 50051):
        self.config = config
        self.port = port
        self.server = None
        self._stop_event = threading.Event()

    def start(self) -> None:
        """Start the gRPC server"""
        if backend_pb2_grpc is None:
            raise RuntimeError(
                "gRPC stubs not found. Please run `npm run proto:gen:python` from the project root."
            )

        self.server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
        
        # Add the indexer servicer
        servicer = IndexerServicer(self.config)
        backend_pb2_grpc.add_BackendServiceServicer_to_server(servicer, self.server)
        
        # Listen on all interfaces
        listen_addr = f'0.0.0.0:{self.port}'
        self.server.add_insecure_port(listen_addr)
        
        self.server.start()
        logger.info(f"gRPC server started on {listen_addr}")

    def stop(self) -> None:
        """Stop the gRPC server"""
        if self.server:
            logger.info("Stopping gRPC server...")
            self.server.stop(grace=30)
            self._stop_event.set()

    def wait_for_termination(self) -> None:
        """Wait for the server to terminate"""
        if self.server:
            self.server.wait_for_termination()

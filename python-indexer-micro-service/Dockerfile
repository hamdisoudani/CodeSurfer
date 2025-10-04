# syntax=docker/dockerfile:1

FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
	PYTHONUNBUFFERED=1

# System deps for git, build tools (grpcio-tools), and ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
	git \
	build-essential \
	curl \
	ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
COPY python-indexer-micro-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy proto files and generate stubs into a top-level `generated` directory
COPY python-indexer-micro-service/proto ./proto
RUN mkdir -p /app/generated && \
    python -m grpc_tools.protoc \
    -I proto \
    --python_out=/app/generated \
    --grpc_python_out=/app/generated \
    --pyi_out=/app/generated \
    proto/backend.proto

# Copy application source
COPY python-indexer-micro-service/src ./src

# Add both /app (for src) and /app/generated to PYTHONPATH
ENV PYTHONPATH=/app:/app/generated

# Default envs (override via compose)
ENV NATS_URL=nats://nats:4222 \
	CHROMA_URL=http://chroma:8000 \
	BACKEND_GRPC_URL=backend:50052

# Development stage
FROM base AS development
CMD ["python", "-m", "src.main"]

# Production stage
FROM base AS production
CMD ["python", "-m", "src.main"]

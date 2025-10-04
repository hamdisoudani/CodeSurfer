# Agent Service Dockerfile - Optimized Multi-Stage Build
FROM node:22-alpine AS base

# Production dependencies stage
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* ./
RUN npm ci --only=production && npm cache clean --force

# Development dependencies stage  
FROM base AS dev-deps
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* ./
RUN npm install && npm install -g @langchain/langgraph-cli && npm cache clean --force

# Development stage - Full environment with all dependencies
FROM base AS development
WORKDIR /app

# Install protoc for proto compilation
RUN apk add --no-cache protobuf-dev

# Copy package files first (needed for npm scripts)
COPY package.json package-lock.json* yarn.lock* ./

# Copy all dependencies for development
COPY --from=dev-deps /app/node_modules ./node_modules

# Install LangGraph CLI for development
RUN npm install -g @langchain/langgraph-cli

# Copy proto files and generate types
COPY proto ./proto
RUN npm run proto:gen

# Copy source code and config
COPY src ./src
COPY tsconfig.json ./
COPY langgraph.json ./

EXPOSE 2024
ENV NODE_ENV=development

# Development command
CMD ["npm", "run", "dev"]

# Build stage - Compile the application
FROM base AS builder
WORKDIR /app

# Install protoc for proto compilation
RUN apk add --no-cache protobuf-dev

# Copy all dependencies for building
COPY --from=dev-deps /app/node_modules ./node_modules

# Copy package files for build scripts
COPY package.json package-lock.json* yarn.lock* ./

# Copy proto files and generate types first
COPY proto ./proto
RUN npm run proto:gen

# Copy source code and config
COPY src ./src
COPY tsconfig.json ./
COPY langgraph.json ./

# Build the TypeScript code (includes generated proto files)
RUN npm run build

# Production stage - Minimal runtime image
FROM base AS production
WORKDIR /app

ENV NODE_ENV=production

# Install global LangGraph CLI for production
RUN npm install -g @langchain/langgraph-cli && npm cache clean --force

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy built application and config
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/langgraph.json ./

# Copy proto files and generated types for runtime imports
COPY --from=builder /app/proto ./proto
COPY --from=builder /app/src/generated ./src/generated

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S agent -u 1001 && \
    chown -R agent:nodejs /app

USER agent

# The agent runs on LangGraph's default port
EXPOSE 2024

# Production startup command
CMD ["npm", "start"]

# Default to production stage
FROM production AS default

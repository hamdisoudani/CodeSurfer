# Backend Service Dockerfile - Optimized Multi-Stage Build
FROM node:22-alpine AS base

# Install protoc (required for proto compilation)
RUN apk add --no-cache protobuf-dev

# Production dependencies stage
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production --legacy-peer-deps && npm cache clean --force

# Development dependencies stage
FROM base AS dev-deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps && npm cache clean --force

# Development stage - Full environment with all dependencies
FROM base AS development
WORKDIR /app

# Copy package files first (needed for npm scripts)
COPY package.json package-lock.json* ./

# Copy all dependencies for development
COPY --from=dev-deps /app/node_modules ./node_modules

# Copy proto files first (needed for compilation)
COPY proto ./proto

# Copy source code
COPY src ./src
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY supabase-schema.sql ./

# Generate proto files for development
RUN npm run proto:gen:ts

EXPOSE 3001
ENV NODE_ENV=development

# Development command
CMD ["npm", "run", "start:dev"]

# Build stage - Compile the application
FROM base AS builder
WORKDIR /app

# Copy all dependencies for building
COPY --from=dev-deps /app/node_modules ./node_modules

# Copy proto files first (needed for compilation)
COPY proto ./proto

# Copy source code
COPY src ./src
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY supabase-schema.sql ./

# Build the application (includes proto generation)
RUN npm run build

# Production stage - Minimal runtime image
FROM base AS production
WORKDIR /app

ENV NODE_ENV=production

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy proto files (needed at runtime)
COPY proto ./proto

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/supabase-schema.sql ./

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 && \
    chown -R nestjs:nodejs /app

USER nestjs

# Expose port
EXPOSE 3001

# Production startup command
CMD ["node", "dist/main"]

# Default to production stage
FROM production AS default

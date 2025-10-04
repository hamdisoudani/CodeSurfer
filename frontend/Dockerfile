# Frontend Service Dockerfile - Optimized Multi-Stage Build
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files for dependency resolution
COPY package.json package-lock.json* ./
# Install dependencies with clean cache
RUN npm ci --only=production --legacy-peer-deps && npm cache clean --force

# Development dependencies for building
FROM base AS dev-deps  
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps && npm cache clean --force

# Development stage - Full environment with all dependencies
FROM base AS development
WORKDIR /app

# Copy dependencies from dev-deps stage
COPY --from=dev-deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

# Development command
CMD ["npm", "run", "dev"]

# Build stage - Compile the application  
FROM base AS builder
WORKDIR /app

# Copy all dependencies for building
COPY --from=dev-deps /app/node_modules ./node_modules
COPY . .

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# Production stage - Minimal runtime image
FROM base AS production
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create system user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application from builder stage
COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next && chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# Production startup command
CMD ["node", "server.js"]

# Default to production stage
FROM production AS default

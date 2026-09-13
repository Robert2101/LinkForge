# Multi-stage production Dockerfile for LinkForge Backend
# 1. Base stage
FROM node:24-alpine AS base
WORKDIR /app
RUN apk add --no-cache curl

# 2. Dependencies stage
FROM base AS dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# 3. Production runtime stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5001

# Run as non-privileged node user for security hardening
USER node

# Copy dependencies from dependencies stage
COPY --chown=node:node --from=dependencies /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node drizzle.config.js ./
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node src ./src

EXPOSE 5001

# Container healthcheck against deep health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5001/health || exit 1

CMD ["node", "src/server.js"]

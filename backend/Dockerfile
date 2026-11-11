# syntax=docker/dockerfile:1

# ---- Stage 1: install production dependencies -------------------------------
# Done in its own stage so the final image holds no npm cache or build tools.
# Copying only the two package files first means Docker reuses this layer
# until a dependency actually changes.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Stage 2: the image that runs ------------------------------------------
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=5001
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY migrations ./migrations
COPY src ./src

# Never run as root: if the app is compromised, the attacker is an
# unprivileged user inside the container.
USER node

EXPOSE 5001

# Docker marks the container unhealthy (and compose/orchestrators react) when
# the API or its database stops answering.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Run node directly (not through npm) so it receives SIGTERM and can shut down cleanly.
CMD ["node", "src/server.js"]

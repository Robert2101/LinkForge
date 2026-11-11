# syntax=docker/dockerfile:1

# ---- Stage 1: build the static site ----------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Stage 2: serve it with nginx ------------------------------------------
# The final image contains nginx and the built files only: no Node.js, no
# source code, no node_modules. The "unprivileged" image runs as a non-root
# user and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Where nginx forwards /api and short-link requests. Override when the API
# is not reachable as "backend" (the docker compose service name).
ENV BACKEND_URL=http://backend:5001

# The nginx image fills ${BACKEND_URL} into this template when it starts.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY proxy-headers.inc /etc/nginx/conf.d/proxy-headers.inc
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/nginx-health || exit 1

# ADR 006: One deployable service, organised in modules

**Status:** accepted

## Context

The API could be one service or several (auth, links, analytics). Separate services bring network calls between them, distributed tracing, and several deployments to coordinate. Nothing about this application's size needs that yet.

## Decision

One Express application, split into modules under `backend/src/modules`:

- `auth` — accounts and sessions
- `urls` — creating, managing and resolving links, QR codes, the redirect
- `analytics` — recording clicks and reporting on them
- `health` — the health endpoint

Every module has the same three layers, and a request passes through them in one direction:

```
routes  →  service  →  repository  →  PostgreSQL
(HTTP)     (rules)     (SQL)
```

- **routes**: URL, middleware (auth, rate limit, validation), status code. Handlers are a line or two.
- **service**: what the application does. Knows nothing about HTTP.
- **repository**: every SQL statement for that module's tables. Nothing else talks to the database.

Shared code lives in `lib/` (logger, Redis client, error type) and `middleware/`.

## Why

- A new reader can find anything by asking "which module, which layer".
- Services are testable without HTTP, and SQL is all in one place per module when a query needs tuning.
- Express 5 forwards rejected promises to the error handler, so handlers `throw` and need no `try/catch`. That removed a separate controller layer: route files stay short without it.

## Consequences

- Modules call each other's services directly (analytics asks the urls service who owns a link). That is fine in one process; it is the seam along which a module could later become its own service.
- All modules scale together. If redirects ever need far more capacity than the dashboard, the redirect path is the first candidate to split out.

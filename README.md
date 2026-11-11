# LinkForge

A URL shortener with click analytics. Paste a long URL, get a short link, and see who clicked it.

[![CI](https://github.com/Robert2101/LinkForge/actions/workflows/ci.yml/badge.svg)](https://github.com/Robert2101/LinkForge/actions/workflows/ci.yml)

**Stack:** Node.js · Express 5 · PostgreSQL · Redis · React · Docker

---

## What it does

- **Short links** with a random 7-character code or a name you choose (`/spring-sale`).
- **Redirects served from Redis.** Popular links are answered from memory; PostgreSQL is only asked on a cache miss.
- **Click analytics**: clicks per day, unique visitors, device, browser, operating system, country and referring site.
- **Link management**: edit the destination, pause, set an expiry date, delete, download a QR code.
- **Accounts** with short-lived access tokens and rotating, single-use refresh tokens.
- **Rate limiting** in Redis, enforced atomically across any number of servers.

## How it is built

```
                        ┌───────────────────────────────┐
  browser ─────────────►│  nginx  (web container :8080) │
                        │  • serves the React app       │
                        │  • forwards /api and /:code   │
                        └──────────────┬────────────────┘
                                       ▼
                        ┌───────────────────────────────┐
                        │  Express API  (backend :5001) │
                        │  auth · links · analytics     │
                        └───────┬───────────────┬───────┘
                                ▼               ▼
                        ┌──────────────┐  ┌──────────────┐
                        │  PostgreSQL  │  │    Redis     │
                        │  source of   │  │  link cache  │
                        │  truth       │  │  rate limits │
                        └──────────────┘  └──────────────┘
```

**What happens on a click (`GET /aZ3kP0q`)**

1. The rate limiter checks the visitor's counter in Redis (one atomic Lua script).
2. The code is looked up in Redis. On a hit, PostgreSQL is not contacted at all.
3. On a miss, one indexed lookup in PostgreSQL finds the link, and the result is cached.
4. The visitor is redirected with `302` straight away.
5. The click is added to an in-memory buffer. Every two seconds the buffer is written to PostgreSQL in a single statement, however many clicks it holds.

The response header `X-Cache: HIT | MISS` shows which path a redirect took.

## Run it

You need Node.js 22 or newer. From the project folder, pick one:

### One command, no Docker

```bash
npm run dev
```

This installs dependencies if needed, applies database migrations, and starts the API (http://localhost:5001) and the web app (**http://localhost:5173**) together. Press Ctrl+C to stop both.

It needs `backend/.env` with a PostgreSQL connection string (a free [Neon](https://neon.tech) database works):

```bash
cp backend/.env.example backend/.env    # then set DATABASE_URL
```

Redis is optional here. Without `REDIS_URL` the API still runs: redirects read from PostgreSQL and rate limits are counted per process. `GET /health` reports which mode it is in.

**If the database connection fails with `ECONNRESET`:** some college and office networks reset PostgreSQL traffic on port 5432. Add `DATABASE_DRIVER=neon-websocket` to `backend/.env` to reach Neon over port 443 instead.

### One command, everything in Docker

```bash
npm run docker
```

This starts PostgreSQL, Redis, the migration job, the API and the web app, production style, at **http://localhost:8080**. The first run creates a `.env` file with freshly generated secrets. Only port 8080 is exposed. Stop with Ctrl+C. `npm run docker:stop` removes the containers and keeps your data; `npm run docker:reset` also erases the local database and the generated secrets.

Without npm, the same thing is `docker compose up --build` after creating `.env` as described in `.env.example`.

### Tests

```bash
docker compose -f docker-compose.test.yml up -d    # throwaway PostgreSQL + Redis
cd backend
cp .env.test.example .env.test
npm run test:migrate
npm test                    # 64 unit and integration tests

cd ../frontend
npm test                    # 16 unit tests
```

The integration tests run against a real PostgreSQL and a real Redis. Among other things they prove that a cache hit never touches the database, that 30 simultaneous logins let exactly 10 through, that one user cannot read another user's link, and that the analytics queries use their index.

## API

All API routes are under `/api/v1`. Errors have one shape: `{ "error": { "code", "message", "details" } }`.

| Method | Path | Sign-in | What it does |
|---|---|---|---|
| `GET` | `/:code` | no | Redirect to the long URL (`302`) and count the click |
| `GET` | `/health` | no | Status of the API, PostgreSQL and Redis |
| `POST` | `/api/v1/auth/register` | no | Create an account and start a session |
| `POST` | `/api/v1/auth/login` | no | Start a session |
| `POST` | `/api/v1/auth/refresh` | cookie | Swap the refresh cookie for a new access token |
| `POST` | `/api/v1/auth/logout` | cookie | End the session |
| `GET` | `/api/v1/auth/me` | yes | The signed-in user |
| `POST` | `/api/v1/urls` | optional | Create a short link |
| `GET` | `/api/v1/urls` | yes | List your links (`page`, `limit`, `search`) |
| `GET` | `/api/v1/urls/:id` | yes | One link |
| `PATCH` | `/api/v1/urls/:id` | yes | Change destination, pause/resume, set or clear expiry |
| `DELETE` | `/api/v1/urls/:id` | yes | Delete a link and its click history |
| `GET` | `/api/v1/qr/:code` | no | QR code image (`?format=svg` or `png`) |
| `GET` | `/api/v1/analytics/overview` | yes | Totals and daily clicks across all your links (`days`) |
| `GET` | `/api/v1/analytics/links/:id` | yes | Totals, daily clicks and breakdowns for one link (`days`) |

The full specification is in [docs/api/openapi.yaml](docs/api/openapi.yaml).

## Project layout

```
backend/
  migrations/             SQL migrations, applied in filename order
  scripts/                bench-redirect.js: cached vs uncached lookup timing
  src/
    app.js                Express app: middleware order and routes
    server.js             starts the server, shuts it down cleanly
    config/env.js         every environment variable, validated at startup
    db/                   connection (two transports), pool, table definitions, migration runner
    lib/                  logger, Redis client, error type, shutdown
    middleware/           authenticate, rateLimit, validate, errorHandler
    modules/
      auth/               routes → service → repository (+ validation)
      urls/               routes, service, repository, cache, short codes, redirect
      analytics/          routes, service, repository, click recorder
      health/             GET /health
  tests/                  unit/ and integration/
frontend/
  nginx.conf.template     production web server and reverse proxy
  src/
    lib/                  api client (token refresh), data hooks, formatting
    auth/                 who is signed in
    components/           form, chart, dialogs, toasts
    pages/                Landing, sign in / create account, Dashboard, LinkDetail
scripts/                  dev.mjs and docker.mjs: the two single-command starters
docs/
  api/openapi.yaml        API specification
  architecture/           how requests flow, how it would scale
  decisions/              why each significant choice was made (ADRs)
```

Each backend module follows the same three layers: **routes** (HTTP in and out), **service** (the rules), **repository** (the SQL).

## Database indexes

Every index exists for one named query.

| Table | Index | Query it serves |
|---|---|---|
| `urls` | `UNIQUE (short_code)` | Every redirect: one exact-match lookup |
| `urls` | `(user_id, created_at DESC) WHERE user_id IS NOT NULL` | Dashboard list: a user's links, newest first, one page at a time |
| `clicks` | `(url_id, clicked_at)` | Every analytics query: clicks of one link inside a time range |
| `users` | `UNIQUE (email)` | Sign-in |
| `refresh_tokens` | `UNIQUE (token_hash)` | Refresh: find the presented token |
| `refresh_tokens` | `(family_id)` | Revoke every token from one login |
| `refresh_tokens` | `(user_id)` | Cascade on user delete, expired-session cleanup |

## Security

- Passwords hashed with **Argon2id**. Refresh tokens stored only as SHA-256 hashes.
- Access token (15 minutes) held in browser memory; refresh token (7 days) in an `httpOnly`, `SameSite=Strict` cookie scoped to `/api/v1/auth`.
- Refresh tokens are single-use. Replaying a used one revokes every token from that login.
- Every link query includes the owner's id, so another user's link is simply "not found".
- All input validated with Zod before it reaches a handler; unknown fields are dropped.
- Destinations must be public `http(s)` URLs: no `javascript:`, no private or loopback addresses, no credentials in the URL.
- Rate limits per IP and per account on sign-in, per user on link creation, per IP on redirects.
- Visitor IPs are stored only as salted hashes; referrers are reduced to the hostname.
- Security headers on every response (Helmet on the API, CSP and friends in nginx).
- Containers run as non-root with a read-only filesystem and no Linux capabilities.

## Measuring the cache

```bash
cd backend && npm run bench
```

This times 1,000 lookups of one link straight from PostgreSQL and 1,000 from Redis. On a laptop with both running locally in Docker the Redis path was about 1.5× faster at the median (0.29 ms vs 0.43 ms). The gap grows when the database is on another machine, and under load, because a cache hit also frees a database connection for work that needs one. Run it against your own setup; do not quote these numbers as production figures.

## Limitations

- Clicks buffered in memory (up to two seconds' worth) are lost if a server is killed without warning. A normal shutdown flushes them.
- Access tokens stay valid until they expire (at most 15 minutes) after sign-out.
- Country comes from the `CF-IPCountry` header, so it is only filled in behind Cloudflare or a similar CDN.
- There is no check of destinations against malware or phishing lists.

## License

MIT

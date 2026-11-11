# System overview

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
                        └──────────────┘  └──────────────┘
```

## Components

| Component | Job | If it fails |
|---|---|---|
| **nginx** | Single public entry point. Serves the built React app, forwards `/api/*` and short codes to the API, sets the real client IP. | The site is down. |
| **Express API** | Accounts, link management, redirects, analytics. Stateless: any instance can serve any request. | Run more than one behind a load balancer. |
| **PostgreSQL** | Source of truth for users, links, sessions and clicks. | The API reports `503` on `/health`; cached links still redirect. |
| **Redis** | Cache of link lookups; rate-limit counters. Holds nothing that cannot be rebuilt. | Redirects read PostgreSQL; rate limits count per process. `/health` reports `degraded`. |

## Why the browser sees one origin

nginx serves the web app and proxies the API under the same host. So in production there is no CORS, and the refresh-token cookie is a same-site cookie. The Vite dev server proxies `/api` the same way, so development behaves like production.

nginx decides what a path is:

| Path | Goes to |
|---|---|
| `/`, `/login`, `/register`, `/dashboard`, `/links/…` | the React app (`index.html`) |
| `/assets/…`, `/favicon.svg` | static files |
| `/api/…`, `/health` | the API |
| anything else (`/aZ3kP0q`) | the API, as a short code |

Those page names are reserved, so nobody can create a short link called `login`.

## Request path inside the API

```
helmet (security headers)
→ request logging with a request id
→ /health
→ /api/v1:  CORS → general rate limit → JSON body parser (10 kB) → cookies
            → route:  auth check → route rate limit → validation → handler
→ /:code:   rate limit → redirect
→ 404 handler → error handler
```

Every error leaves through the one error handler as `{ "error": { "code", "message", "details" } }`.

## Data model

```
users ──< urls ──< clicks
  └──< refresh_tokens
```

- `users`: id, email (unique), password_hash, name
- `urls`: id, user_id (null for anonymous links), original_url, short_code (unique), is_custom, click_count, is_active, expires_at
- `clicks`: id, url_id, clicked_at, ip_hash, browser, os, device, referrer, country
- `refresh_tokens`: id, user_id, token_hash (unique), family_id, expires_at, revoked_at

Deleting a user deletes their sessions and leaves their links ownerless. Deleting a link deletes its clicks.

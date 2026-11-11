# How requests flow

## 1. Following a short link — `GET /:code`

```
visitor          nginx            API                     Redis              PostgreSQL
  │ GET /aZ3kP0q   │                │                        │                    │
  │───────────────►│───────────────►│                        │                    │
  │                │                │ rate limit (Lua) ─────►│                    │
  │                │                │◄──────────── allowed ──│                    │
  │                │                │ GET link:aZ3kP0q ─────►│                    │
  │                │                │◄─────────────── HIT ───│                    │
  │                │                │                                             │
  │                │                │   on a MISS only:                           │
  │                │                │   SELECT … WHERE short_code = $1 ──────────►│
  │                │                │◄──────────────────────────────── the link ──│
  │                │                │   SET link:aZ3kP0q … EX 3600 ─►│            │
  │                │                │                                             │
  │                │                │ push click onto in-memory buffer            │
  │◄── 302, Location: long URL ─────│                                             │
  │                                 │                                             │
  │                        every 2 s│ one INSERT + UPDATE for the whole buffer ──►│
```

A cache hit involves no PostgreSQL query. The click never delays the redirect.

## 2. Creating a link — `POST /api/v1/urls`

```
1. optionalAuth      read the access token if one was sent
2. rate limit        30 per 15 minutes per user (or per IP when anonymous)
3. validate          public http(s) URL, alias rules, future expiry
4. service           generate a 7-character code (or use the alias)
5. repository        INSERT … ON CONFLICT (short_code) DO NOTHING RETURNING *
                       no row returned → code taken → new code (random) or 409 (alias)
6. cache             SET link:<code> so the first visitor is a cache hit
7. respond           201 with the link and its short URL
```

## 3. Signing in and staying signed in

```
browser                               API                                PostgreSQL
  │ POST /auth/login {email, password}  │                                     │
  │────────────────────────────────────►│ SELECT user by email ──────────────►│
  │                                     │ argon2.verify(hash, password)       │
  │                                     │ INSERT refresh_tokens (hash, family)►│
  │◄── 200 { user, accessToken } ───────│                                     │
  │    Set-Cookie: refresh_token (httpOnly, SameSite=Strict)                  │
  │                                                                           │
  │ GET /urls  Authorization: Bearer <accessToken>                            │
  │────────────────────────────────────►│ verify JWT signature (no DB query)  │
  │                                                                           │
  │        … 15 minutes later the access token has expired …                  │
  │                                                                           │
  │ POST /auth/refresh  (cookie sent by the browser)                          │
  │────────────────────────────────────►│ UPDATE refresh_tokens               │
  │                                     │   SET revoked_at = now()            │
  │                                     │   WHERE token_hash = $1             │
  │                                     │     AND revoked_at IS NULL          │
  │                                     │     AND expires_at > now()          │
  │                                     │   RETURNING * ─────────────────────►│
  │                                     │ row returned → INSERT replacement   │
  │◄── 200 { user, accessToken }, new cookie                                  │
  │                                     │                                     │
  │                                     │ no row → was this token used        │
  │                                     │ more than 10 s ago?                 │
  │                                     │   yes → revoke the whole family     │
  │◄── 401 ─────────────────────────────│                                     │
```

In the web app this is invisible: a request that gets `401` triggers one refresh and is then repeated.

## 4. Reading analytics — `GET /api/v1/analytics/links/:id?days=30`

```
1. requireAuth       valid access token needed
2. validate          id is a UUID, days is 1–90
3. ownership         SELECT … WHERE id = $1 AND user_id = $2   (not yours → 404)
4. three queries in parallel, all on the (url_id, clicked_at) index:
     totals          count(*), count(DISTINCT ip_hash), count(*) FILTER (last 24 h)
     by day          GROUP BY day
     breakdowns      GROUP BY GROUPING SETS ((device), (browser), (os), (referrer), (country))
5. fill empty days with zero, keep the top 6 of each breakdown, respond
```

# ADR 004: Caching short-link lookups in Redis

**Status:** accepted

## Context

Redirects are by far the most frequent request, and a link almost never changes after it is created. Asking PostgreSQL on every redirect spends a database connection on work whose answer was the same a second ago.

## Decision

**Cache-aside**, implemented in `modules/urls/url.cache.js` and `urlService.resolveShortCode`.

```
key    link:<short code>
value  {"id":…,"originalUrl":…,"isActive":…,"expiresAt":…}   or the word "missing"
```

1. **Read:** `GET link:<code>`. A hit is answered without touching PostgreSQL.
2. **Miss:** one indexed lookup in PostgreSQL, then the result is written to Redis.
3. **Write-through on create:** a new link is cached immediately, so its first visitor is already a hit.
4. **Invalidation:** editing or deleting a link deletes its key, so the change is visible on the next redirect.

The response header `X-Cache: HIT | MISS` reports which path was taken.

### Problems this design handles

| Problem | What it is | Handling |
|---|---|---|
| Cache penetration | Requests for codes that do not exist always miss and always reach the database | The miss itself is cached as `"missing"` for 60 seconds. Malformed codes are rejected by a regex before any lookup. |
| Cache stampede | A popular key expires and many requests query the database at once | An in-process map of lookups in progress: concurrent requests for one code share a single database query. |
| Cache avalanche | Many keys expire in the same moment | TTLs get ±10% random jitter. |
| Stale entries | Cached data outlives a change | Explicit delete on update and delete. As a backstop, every entry expires after one hour, and never later than the link's own expiry time. |
| Redis outage | The cache is unreachable | Every cache call catches its errors and reports "nothing cached". Redirects fall back to PostgreSQL. The Redis client fails fast (1 s command timeout, no offline queue) so an outage does not add latency. |

## Why a JSON string and not a Redis hash

The whole object is always read together and never updated field by field, so one `GET` of a small string is the cheapest shape.

## Consequences

- If a delete fails during a Redis blip, a stale entry can live until its TTL runs out (at most about an hour).
- The stampede protection is per process. With several app instances, each can run one query for the same cold key.
- Redis runs with `maxmemory` and `allkeys-lru`, so it evicts the least recently used links when full.

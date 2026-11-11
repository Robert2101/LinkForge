# ADR 005: Rate limiting with a sliding window counter in Redis

**Status:** accepted

## Context

A public shortener attracts password guessing, link spam and scraping. A counter held in one Node.js process stops working as soon as there are two processes, so the counters live in Redis.

## Algorithm

| Algorithm | Storage per caller | Weakness |
|---|---|---|
| Fixed window | 1 counter | A burst at the end of one window plus a burst at the start of the next lets through twice the limit |
| Sliding window log (sorted set) | 1 entry per request | Exact, but memory grows with traffic: a 600/minute limit stores up to 600 entries per IP |
| **Sliding window counter** (chosen) | 2 counters | An estimate, not exact; assumes requests were spread evenly across the previous window |
| Token bucket | 2 values | Allows bursts by design, which is not wanted on a login route |

Time is cut into fixed windows. The estimate of "requests in the last window-length" is:

```
previous window's count × (share of that window still inside the sliding window) + current window's count
```

Example with a 60-second window, 15 seconds in: `42 × 0.75 + 18 = 49`.

## Atomicity

Reading two counters, deciding, and incrementing must not interleave with another request doing the same, or two servers can both read 49 and both allow request number 50. The whole step is one **Lua script**, which Redis runs without interruption. Rejected requests are not counted, so hammering a blocked endpoint does not extend the block.

Keys look like `ratelimit:{auth:203.0.113.7}:1930584`. The braces are a Redis Cluster hash tag: both windows of one caller land on the same node, which a multi-key script requires. Each counter expires after two window lengths.

## Limits

| Name | Limit | Counted per |
|---|---|---|
| `api` | 300 / minute | IP address |
| `auth` (register, login) | 10 / 15 minutes | IP address |
| `login-account` | 20 / 15 minutes | email address |
| `create-link` | 30 / 15 minutes | user, or IP address when anonymous |
| `redirect` | 600 / minute | IP address |
| `qr` | 60 / minute | IP address |

Responses carry `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` for the tightest limit that applied. A blocked request gets `429` and `Retry-After`.

## The caller's IP address

Behind nginx every request arrives from nginx's address. Express is told how many proxies to trust (`TRUST_PROXY`), and nginx overwrites `X-Forwarded-For` with the real client address, so a client cannot forge the header to get a fresh counter.

## If Redis is down

The same algorithm runs on an in-process map. Limits are then per server instead of shared: weaker, but not absent. The limiter never blocks traffic because Redis is unavailable.

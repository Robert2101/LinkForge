# ADR 004: Redis Caching Strategy, Cache Stampede, and Graceful Fallback

## Status
Accepted

## Context
URL redirection is a read-heavy workload (estimated 100:1 read-to-write ratio). Direct database lookups for every redirect would bottleneck PostgreSQL connections and introduce unnecessary latency.

## Decision
We implement a **Cache-Aside (Lazy Loading) Architecture** with Redis:
1. **Lookup Flow:**
   - Client requests `GET /:code`.
   - Application checks Redis key `cache:url:{code}`.
   - **Cache HIT:** Return cached destination URL immediately (~2ms response time).
   - **Cache MISS:** Query PostgreSQL. If found and active, store in Redis with a 24-hour TTL (with $\pm 10\%$ jitter) and redirect.
2. **Negative Caching:**
   - If a short-code does not exist in PostgreSQL, cache a sentinel `__NOT_FOUND__` entry with a short TTL (e.g. 60 seconds) to prevent malicious cache penetration attacks (querying random non-existent URLs to overwhelm the database).
3. **Cache Invalidation:**
   - When a URL is updated, deactivated, or deleted by its owner, the corresponding Redis key is explicitly invalidated via `DEL cache:url:{code}`.
4. **Resilience & Fallback:**
   - PostgreSQL is the single source of truth.
   - If Redis connection drops or times out, the application logs a warning and queries PostgreSQL directly without returning 500 errors to users.

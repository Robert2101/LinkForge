# 🎓 LinkForge: 20 LPA System Design & Technical Interview Guide

This manual is engineered to prepare you to discuss, explain, and defend every design decision in LinkForge during top-tier engineering interviews (e.g., SDE-1 / SDE-2 roles offering ₹18–25+ LPA).

---

## 1. The Core Architecture & Database Selection

### Q: "Why did you choose PostgreSQL + Drizzle ORM instead of MongoDB or Prisma?"
- **Model Answer:**
  > "Many beginner projects default to MongoDB because it's schema-less, but a URL Shortener has inherently relational characteristics and strict consistency requirements.
  >
  > First, **uniqueness guarantees and race condition handling**: We require strict ACID guarantees on `short_code`, `custom_alias`, and user emails. PostgreSQL provides B-Tree unique indexes that enforce constraints at the engine level with immediate consistency, preventing duplicate alias claims.
  >
  > Second, **relational integrity**: Users own URLs, URLs own clicks and refresh token families. With PostgreSQL, foreign keys with `ON DELETE CASCADE` prevent orphaned records without needing application-level cleanup logic.
  >
  > Third, **Drizzle ORM vs Prisma**: Prisma compiles queries through an external C++ query engine binary, which introduces latency and heavy memory overhead. Drizzle is a lightweight TypeScript/JavaScript SQL builder with zero runtime binary overhead, emitting clean SQL queries. This gives us full visibility over execution plans (`EXPLAIN ANALYZE`), composite index usage, and connection pool sizing."

---

## 2. Short-Code Generation & Collision Resistance

### Q: "How do you generate short codes? Why not just use auto-incrementing IDs or MD5 hashes?"
- **Model Answer:**
  > "We evaluated three strategies:
  > 1. **Auto-increment ID encoded in Base62 (`/1`, `/2`, `/10001`):** While collision-free, sequential IDs introduce severe security and privacy risks. Attackers can enumerate all stored links, discover unlisted links, and calculate business metrics (e.g., daily growth rate).
  > 2. **Hash-based (MD5/SHA-256 truncated to 7 chars):** Deterministic hashing produces identical codes for the same destination URL unless salted per user, and truncating a 128-bit hash to 7 Base62 characters increases collision probability due to the Birthday Paradox.
  > 3. **Cryptographically Secure Random Base62 (Our Choice):** We use Node's `crypto.randomBytes` with **rejection sampling** to prevent modulo bias. A 7-character Base62 string provides $62^7 \approx 3.52 \text{ Trillion}$ combinations.
  >
  > **Collision Handling:** At application startup, we attempt insertion into PostgreSQL. If a collision occurs, PostgreSQL raises error code `23505` (`unique_violation`). Our service catches this error and triggers a deterministic retry loop (up to 5 attempts). At 100 million stored URLs, the mathematical probability of a single collision is approximately $0.0028\%$ ($10^8 / 3.52 \times 10^{12}$), making retries virtually instant."

---

## 3. Custom Alias Race Conditions

### Q: "What happens if two users request the same custom alias at the exact same millisecond?"
- **Model Answer:**
  > "If you only perform an application-level check (`if (await findByAlias(alias)) throw Error`), you have a classic **Time-of-Check to Time-of-Use (TOCTOU)** race condition. Both concurrent requests check the database, both see that the alias doesn't exist, and both attempt to insert.
  >
  > In LinkForge, we rely on **defense-in-depth**:
  > 1. Application-level check for fast client feedback.
  > 2. A PostgreSQL engine-level `UNIQUE` index constraint on `custom_alias`.
  > 3. When two concurrent transactions attempt insertion, PostgreSQL serializes the write to the index. One succeeds, and the other fails with error code `23505`. Our centralized error handler intercepts code `23505` and translates it into a clean HTTP 409 Conflict."

---

## 4. HTTP Redirection Semantics

### Q: "Why did you use HTTP 302 Found instead of HTTP 301 Moved Permanently?"
- **Model Answer:**
  > "HTTP 301 indicates a permanent relocation. When a browser receives a 301, modern browsers aggressively cache the redirect destination indefinitely. If a user clicks the short link 50 times, their browser only contacts the LinkForge server on the first click.
  >
  > This causes two fatal problems:
  > 1. **Analytics Integrity:** 49 out of 50 clicks would never reach our server, corrupting our analytics data.
  > 2. **Dynamic Control:** If the link owner updates the destination URL, deactivates the link, or sets an expiration date, existing users would continue to be redirected to the old URL from their browser cache.
  >
  > By returning **HTTP 302 Found** with `Cache-Control: private, no-cache, no-store`, we ensure every click hits our server for accurate click logging and real-time expiration enforcement."

---

## 5. Authentication & Refresh Token Rotation

### Q: "Explain your authentication architecture. How do you prevent token replay attacks?"
- **Model Answer:**
  > "We use **JWT Access Tokens (short-lived, 15m) paired with Refresh Token Rotation (long-lived, 7d)** using secure `httpOnly`, `SameSite=Lax` cookies.
  >
  > **Token Rotation & Token Family Tracking:**
  > 1. When a user logs in, we generate an access token and a refresh token tied to a `familyId` UUID.
  > 2. Refresh tokens are single-use. When used to refresh, the current token is marked `is_revoked = true` in PostgreSQL, and a new refresh token is issued under the **same family ID**.
  > 3. To guarantee uniqueness even under rapid concurrent requests, every refresh token includes a cryptographically random `jti` (JWT ID) claim.
  >
  > **Breach Detection:**
  > If a compromised refresh token is replayed by an attacker after the legitimate user has already refreshed, the server finds `is_revoked === true`. The system detects this as an active breach and **immediately revokes all tokens belonging to that `familyId`**, terminating sessions for both the attacker and the victim and forcing a secure re-login."

---

## 6. Redis Caching & Cache Stampede Mitigation

### Q: "How does your Redis cache work, and how do you handle cache stampede and negative lookups?"
- **Model Answer:**
  > "We use a **Cache-Aside** pattern for URL resolution:
  > 1. `GET /:code` checks Redis key `cache:url:{code}`. On cache hit, resolution takes ~2ms.
  > 2. On cache miss, we query PostgreSQL, warm up Redis with a 24-hour TTL, and redirect.
  >
  > **Mitigations:**
  > - **Cache Stampede / Hot Keys:** To prevent thousands of concurrent requests hitting the database simultaneously when a hot link's TTL expires, we apply TTL jitter ($\pm 10\%$).
  > - **Negative Caching (Cache Penetration):** If an attacker queries non-existent short codes (`/fake123`), querying the database repeatedly could exhaust connection pools. We cache a sentinel `__NOT_FOUND__` string in Redis with a short 60-second TTL to shield the database.
  > - **Cache Invalidation:** When a link owner updates, deactivates, or deletes a URL, we explicitly execute `DEL cache:url:{code}`.
  > - **Graceful Fallback:** PostgreSQL is the source of truth. If Redis goes down, our client catches the connection error and falls back directly to PostgreSQL without 500 errors."

---

## 7. Distributed Rate Limiting

### Q: "Why not use an in-memory rate limiter like `express-rate-limit`?"
- **Model Answer:**
  > "In-memory rate limiters store request counters in Node process memory. As soon as you scale horizontally across multiple instances or ECS Fargate containers behind an Application Load Balancer, the state is fragmented. An attacker with a limit of 10 requests could send 10 requests to Container A and 10 to Container B.
  >
  > We implemented a **Sliding-Window Rate Limiter backed by Redis sorted sets (`ZSET`)**:
  > - Each request timestamp is added with `ZADD`.
  > - Outdated timestamps outside the window are trimmed with `ZREMRANGEBYSCORE`.
  > - `ZCARD` retrieves the current count atomically in a single Redis `multi` transaction.
  > - If Redis is offline, our adapter falls back to an in-memory sliding window, ensuring zero downtime."

---

## 8. Asynchronous Click Analytics

### Q: "Why don't you wait for the click analytics database write before redirecting?"
- **Model Answer:**
  > "Redirection throughput is the primary SLA of a URL shortener. Inserting a click record, parsing the User-Agent, and updating counters in PostgreSQL takes 30–80ms. Forcing the redirect to wait would more than double latency.
  >
  > We decouple the write:
  > 1. The HTTP 302 response is sent immediately to the user.
  > 2. Analytics logging is handed off asynchronously using `setImmediate` (or in AWS Level 3, pushed to an **AWS SQS FIFO Queue** consumed by worker fleets).
  > 3. Raw IP addresses are **never** stored; we hash them with a salt using SHA-256 for GDPR-compliant unique visitor tracking."

---

## 9. Hyperscale Scaling (10,000 req/sec)

### Q: "How does your architecture evolve to handle 10,000 requests/sec on AWS?"
- **Model Answer:**
  > "We evolve from **Level 2** (ALB + ECS Fargate + RDS + Upstash Redis) to **Level 3**:
  > 1. **CloudFront CDN + AWS WAF at the Edge:** CloudFront handles SSL termination and DDoS mitigation.
  > 2. **Auto-Scaling ECS Fargate:** Tasks scale horizontally based on target tracking (CPU > 70% and request count per target).
  > 3. **Redis Cluster with Read Replicas:** Read-heavy redirects hit multi-AZ Redis replicas with sub-millisecond latencies.
  > 4. **Decoupled Queue Architecture:** Redirection tasks push click events to Amazon SQS. A background worker fleet batches clicks and writes them to Amazon RDS or ClickHouse in bulk (e.g. 500 clicks per `COPY` query).
  > 5. **Read-Write Split:** User dashboard queries read from RDS Read Replicas, while mutations write to Primary."

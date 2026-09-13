# ADR 002: Authentication Strategy and Refresh Token Rotation

## Status
Accepted

## Context
LinkForge requires authentication to allow users to manage custom URLs, review click analytics, and configure expiration. We evaluated authentication schemes:
1. Stateful Server-Side Sessions with Redis
2. Basic JWT stored in browser `localStorage`
3. JWT Access Tokens + Database-backed Refresh Token Rotation with secure HTTP-only cookies

## Decision
We chose **JWT Access Tokens (short-lived, 15m) paired with Refresh Token Rotation (long-lived, 7d)** using secure `httpOnly` cookies.

### Key Mechanisms:
1. **Token Family Tracking:** Every refresh token belongs to a `familyId`.
2. **One-Time Use:** When a refresh token is used to generate a new access token, the old refresh token is marked as revoked/used, and a new refresh token is issued within the same family.
3. **Breach / Reuse Detection:** If an already-revoked refresh token is presented (indicating a replay or stolen token scenario), the system automatically revokes the **entire family** of tokens, immediately invalidating the attacker and the legitimate user sessions.
4. **Password Hashing:** Argon2id is used instead of bcrypt because of its superior resistance to GPU/ASIC-based brute-force attacks and memory-hard design (winner of the Password Hashing Competition).

## Consequences & Trade-offs
* **Pros:**
  * Stateless verification of requests via access token (fast, no database query needed on each authorized API request).
  * Robust protection against XSS (refresh tokens cannot be read by JavaScript because of `httpOnly`).
  * Instant mitigation against stolen refresh tokens through family invalidation.
* **Cons:**
  * Requires a database lookup during token refresh (mitigated because refreshes happen once every 15 minutes, not on every API call).

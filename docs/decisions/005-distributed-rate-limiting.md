# ADR 005: Distributed Rate Limiting Strategy

## Status
Accepted

## Context
A public URL shortener is susceptible to enumeration, resource exhaustion (DoS), credential brute-forcing, and link spam. In-memory rate limiting within single Node.js processes fails when horizontally scaling across multiple instances or containers.

## Decision
We implement a **Sliding-Window Distributed Rate Limiting** middleware backed by Redis:

### Rate Limiting Policies:
1. **URL Creation (Anonymous / Guest):** 10 creations per 15 minutes per IP address.
2. **URL Creation (Authenticated User):** 100 creations per 15 minutes per User ID.
3. **Authentication Endpoints (`/login`, `/register`):** 5 attempts per 15 minutes per IP to mitigate credential stuffing.
4. **Redirect Endpoints (`/:code`):** 1,000 requests per minute per IP to prevent rapid automated scraping while permitting high viral click rates.

### Response Headers:
Compliant with RFC 6585 and draft IETF rate-limit standards:
- `X-RateLimit-Limit`: Maximum requests permitted in window.
- `X-RateLimit-Remaining`: Remaining request quota.
- `X-RateLimit-Reset`: Epoch timestamp when quota resets.
- HTTP 429 Too Many Requests with `Retry-After` header when limit exceeded.

### In-Memory Fallback:
If Redis is temporarily unreachable or unconfigured in local development, the rate limiter falls back to an in-memory sliding window using timestamps to maintain basic protection without crashing.

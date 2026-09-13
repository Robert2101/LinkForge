# ADR 003: Short-Code Generation and Collision Handling

## Status
Accepted

## Context
Short-codes represent the unique identifiers in short URLs (e.g., `https://linkforge.com/aB7xK9`). We analyzed three primary generation approaches:
1. **Auto-Incrementing Sequence ID / Snowflake ID encoded to Base62:**
   - Pros: Guaranteed uniqueness without collisions.
   - Cons: Predictable (`/10001`, `/10002`) allowing malicious actors to enumerate links, estimate platform volume, or target private/unlisted links.
2. **MD5 / SHA-256 Hash of Destination URL truncated to 7 characters:**
   - Pros: Deterministic.
   - Cons: Two users shortening the same URL produce the same short-code unless salt is added. More importantly, high collision probability at truncation.
3. **Cryptographically Random Base62 String (Length 7):**
   - Characters: `[0-9a-zA-Z]` (62 possible characters).
   - Space: $62^7 \approx 3.52 \times 10^{12}$ (over 3.5 trillion unique permutations).

## Decision
We chose **Cryptographically Random Base62 (Length 7) generated using `crypto.randomBytes`**, backed by a PostgreSQL unique index and a deterministic collision-retry loop.

### Collision Handling Algorithm:
1. Generate a candidate 7-character Base62 string using CSPRNG bytes.
2. Attempt insertion into PostgreSQL.
3. If PostgreSQL returns error code `23505` (`unique_violation`), increment retry counter (up to 5 attempts) and generate a new candidate.
4. If retries exhaust (probability $< 10^{-15}$ at current scale), return an operational error.

## Custom Alias Handling
Custom aliases (e.g. `/my-brand`) bypass random generation but undergo:
- Alphanumeric + hyphen/underscore validation (`^[a-zA-Z0-9_-]{3,30}$`).
- Reserved word blocking (e.g., `api`, `health`, `auth`, `admin`, `dashboard`).
- PostgreSQL `UNIQUE` constraint enforcement to eliminate race conditions between concurrent requests.

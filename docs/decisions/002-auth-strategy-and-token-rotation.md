# ADR 002: Access tokens plus rotating refresh tokens

**Status:** accepted

## Context

Users sign in to manage links and read analytics. The options were server-side sessions, a long-lived JWT in `localStorage`, or a short-lived access token with a refresh token.

## Decision

| | Access token | Refresh token |
|---|---|---|
| What it is | JWT signed with HS256 | 32 random bytes (not a JWT) |
| Lifetime | 15 minutes | 7 days |
| Where the browser keeps it | JavaScript memory only | `httpOnly`, `SameSite=Strict` cookie, path `/api/v1/auth` |
| How the server checks it | Verifies the signature; no database query | Looks up its SHA-256 hash in `refresh_tokens` |

- Passwords are hashed with **Argon2id** (19 MiB memory, 2 iterations, the OWASP recommendation).
- **Rotation:** a refresh token works exactly once. Using it revokes it and issues a replacement in the same *family* (all tokens descended from one login).
- **Reuse detection:** if a token that was used more than 10 seconds ago is presented again, someone holds a copy they should not have, so the whole family is revoked. Within 10 seconds a repeat is treated as a duplicate request and simply refused.
- The "check it is unused, then mark it used" step is a single `UPDATE … WHERE revoked_at IS NULL RETURNING`, so two simultaneous requests with the same token cannot both succeed.

## Why

- A 15-minute access token keeps API requests free of database lookups, and limits the damage of a leaked token.
- The refresh token never reaches JavaScript, so a cross-site-scripting bug cannot steal the long-lived credential.
- `SameSite=Strict` plus a path limited to the auth routes means the cookie is not sent on requests triggered by other sites (CSRF).
- Storing only a hash means a database leak does not hand out working sessions.
- An opaque random refresh token is simpler than a JWT here: it has to be looked up in the database anyway, so a signature adds nothing.

## Consequences

- Sign-out cannot recall an access token already issued; it stays valid for up to 15 minutes.
- Two browser tabs refreshing at once would race for the single-use token. The web app serialises refreshes across tabs with the Web Locks API, and the 10-second grace period covers what is left.
- Sign-in also throttles guessing: 10 attempts per 15 minutes per IP address and 20 per account.

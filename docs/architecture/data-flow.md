# LinkForge Data Flow Architecture

## 1. URL Redirection Flow (`GET /:code`)

```
Client             LinkForge Backend            Redis                PostgreSQL
  │                       │                       │                      │
  │─── GET /:code ───────►│                       │                      │
  │                       │─── GET cache:url:code►│                      │
  │                       │◄── (MISS) ────────────│                      │
  │                       │                                              │
  │                       │─── SELECT * FROM urls WHERE short_code = ? ─►│
  │                       │◄── [URL record, active, not expired] ────────│
  │                       │                                              │
  │                       │─── SETEX cache:url:code 86400 dest ─────────►│
  │                       │                                              │
  │◄── 302 Found ─────────│                                              │
  │    Location: dest     │                                              │
  │                       │                                              │
  │                       │─── (Async Background Click Ingestion) ───────│
  │                       │─── INSERT INTO clicks ... ──────────────────►│
  │                       │─── UPDATE urls SET click_count = count + 1 ──►│
```

## 2. Authentication & Refresh Token Rotation Flow

```
Client                  LinkForge Backend                       PostgreSQL
  │                             │                                    │
  │─── POST /auth/login ───────►│                                    │
  │    (email, password)        │─── SELECT * FROM users WHERE email►│
  │                             │◄── [user record + argon2id hash] ──│
  │                             │                                    │
  │                             │ (verify argon2id hash)             │
  │                             │ (generate access token [15m])      │
  │                             │ (generate refresh token [7d])      │
  │                             │─── INSERT INTO refresh_tokens ────►│
  │◄── 200 OK ──────────────────│    (hash, family_id, expires_at)   │
  │    Set-Cookie: refreshToken │                                    │
  │    Body: { accessToken }    │                                    │
  │                             │                                    │
  │─── POST /auth/refresh ─────►│                                    │
  │    Cookie: refreshToken     │─── SELECT * FROM refresh_tokens ──►│
  │                             │◄── [token record] ─────────────────│
  │                             │                                    │
  │                             │ If is_revoked === true:            │
  │                             │   ⚠️ POTENTIAL TOKEN REUSE DETECTED!
  │                             │   ─── UPDATE refresh_tokens ──────►│
  │                             │       SET is_revoked = true        │
  │                             │       WHERE family_id = family     │
  │                             │   ◄── 401 Unauthorized             │
  │                             │                                    │
  │                             │ If valid:                          │
  │                             │   ─── Revoke old token ───────────►│
  │                             │   ─── Issue new token in family ──►│
  │◄── 200 OK ──────────────────│                                    │
  │    Set-Cookie: newRefresh   │                                    │
  │    Body: { newAccessToken } │                                    │
```

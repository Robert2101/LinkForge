# ADR 007: Redirect with 302, never cached by the browser

**Status:** accepted

## Context

| Code | Meaning | Browser behaviour |
|---|---|---|
| 301 Moved Permanently | The address changed for good | Cached indefinitely. Later visits go straight to the destination without contacting us. |
| 302 Found | Temporary | Not cached unless headers say so |
| 307 Temporary Redirect | Temporary, and the method must not change | Same as 302 for `GET` |
| 308 Permanent Redirect | Like 301, method preserved | Cached indefinitely |

## Decision

`302 Found` with `Cache-Control: no-store`.

## Why

- **Click counts stay true.** With a 301, a visitor's second click never reaches the server, so it is never counted.
- **The owner stays in control.** Editing the destination, pausing the link, or letting it expire must take effect for everyone. A cached 301 keeps sending people to the old place.

## Consequences

- Every click costs one request to LinkForge. That is the price of analytics, and the reason the redirect path is built to be cheap (Redis lookup, no database write).
- 301 passes more search-ranking credit to the destination. A shortener that cared about SEO more than analytics would choose it.

## Other responses on `GET /:code`

| Situation | Status |
|---|---|
| Code does not exist, or is not a valid code | 404 |
| Link is paused | 404 |
| Link has expired | 410 Gone |

Browsers receive a small HTML page for these; API clients (`Accept: application/json`) receive the JSON error shape.

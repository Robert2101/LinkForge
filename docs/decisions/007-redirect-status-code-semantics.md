# ADR 007: HTTP Redirect Status Code Semantics (302 vs 301 vs 307)

## Status
Accepted

## Context
Short URL redirection relies on HTTP redirection codes. We evaluated:
- **301 Moved Permanently:** Cached aggressively by user browsers and intermediate proxies. Browsers never hit LinkForge's server on subsequent clicks.
- **302 Found:** Temporary redirect. Browsers do not aggressively cache the target permanently, ensuring future clicks hit the server.
- **307 Temporary Redirect:** Like 302, but guarantees the HTTP method remains unchanged (e.g., POST stays POST).

## Decision
We use **HTTP 302 Found** (with `Cache-Control: private, max-age=90` or `no-cache` depending on analytics requirements).

### Rationale:
1. **Analytics Integrity:** If a 301 redirect is returned, the client's browser caches the target URL indefinitely. The user can click the short link 100 times, but LinkForge only ever records 1 click.
2. **Dynamic Control:** The link owner may edit the destination URL, pause/deactivate the link, or set an expiration timestamp. A 301 cache makes changes impossible to enforce on existing clients.

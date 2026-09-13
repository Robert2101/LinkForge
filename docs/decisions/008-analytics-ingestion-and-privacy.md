# ADR 008: Asynchronous Analytics Ingestion and Privacy Strategy

## Status
Accepted

## Context
High redirect throughput is the primary performance SLA of a URL shortener. Inserting analytics synchronously into the database before returning the HTTP 302 response would double redirect latency and bind database write connections. Furthermore, GDPR / CCPA requires responsible handling of Personally Identifiable Information (PII).

## Decision
1. **Asynchronous Non-Blocking Logging:**
   - The redirect response (HTTP 302) is sent to the client immediately.
   - Click analytics event logging runs asynchronously in the background (`setImmediate` / un-awaited async task) without delaying the client.
   - For massive scale (Level 3 architecture), this event is published to an SQS queue or Redis Stream and consumed by a separate worker.
2. **Privacy & Anonymization:**
   - Raw IP addresses are **never** stored in plain text.
   - IP addresses are salted and hashed using `SHA-256` (first 16 hex characters) for unique visitor tracking without storing PII.
   - User-Agent strings are parsed at ingestion using `ua-parser-js` into structured categories: Browser, OS, and Device family.
3. **Data Access & Aggregation:**
   - Read queries for dashboards utilize composite indexes on `(url_id, timestamp)` for fast date-range filtering.

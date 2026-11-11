# ADR 008: Batched click recording and visitor privacy

**Status:** accepted

## Context

Each click should be recorded, but the visitor must not wait for that. Writing to PostgreSQL inside the redirect would add a database round trip to every click and tie redirect capacity to write capacity.

## Decision

### Recording (`modules/analytics/clickRecorder.js`)

1. The redirect pushes a small object onto an in-memory array and returns. No I/O.
2. Every **2 seconds**, or as soon as **500** clicks are waiting, the array is written to PostgreSQL in **one statement** that:
   - turns the JSON batch into rows (`jsonb_to_recordset`),
   - adds the per-link totals to `urls.click_count`,
   - inserts the click rows, skipping links deleted in the meantime.
3. If the write fails, the batch goes back on the front of the buffer and is retried. The buffer is capped at 20,000 clicks so a database outage cannot exhaust memory.
4. On `SIGTERM` the server stops accepting requests, flushes the buffer, then exits.

`click_count` is stored on the link as well as being derivable from `clicks`, so the dashboard list never has to count the large table. Both are written in the same statement, so they cannot drift apart.

### What is not counted

Requests whose user-agent identifies a crawler or a link-preview fetcher (WhatsApp, Slack and similar), and `HEAD` requests.

### Privacy

- The IP address is stored only as `SHA-256(secret salt + ip)`, truncated. It can tell "same visitor again" from "new visitor" and cannot be reversed without the salt.
- The referrer is reduced to its hostname (`news.ycombinator.com`); the full address can contain private details.
- The raw user-agent string is not stored, only the parsed browser, operating system and device type.

## Trade-off

A process killed without warning (crash, `kill -9`, power loss) loses the clicks buffered in the last two seconds. A missing click is acceptable; a slow or failed redirect is not.

## At larger scale

The in-memory buffer becomes a durable queue (Redis Streams, SQS or Kafka) written by the redirect servers and drained by separate workers, and the click rows move to a store built for analytics (partitioned PostgreSQL tables, or ClickHouse). The redirect path stays the same: enqueue, then respond.

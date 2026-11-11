# ADR 001: PostgreSQL, two transports and Drizzle

**Status:** accepted

## Context

LinkForge stores users, links, sessions and click events. The data is relational (a click belongs to a link, a link belongs to a user), uniqueness matters (short codes, emails), and the analytics are aggregations over time ranges.

## Decision

- **PostgreSQL** as the only source of truth.
- The standard **`pg` (node-postgres)** driver with one connection pool per process, and Neon's WebSocket driver as an opt-in alternative transport.
- **Drizzle** as a thin, typed query builder on top of it. No Prisma.
- **Hand-written SQL migrations** in `backend/migrations`, applied in filename order by `src/db/migrate.js`.

## Why

- **PostgreSQL over MongoDB.** Short-code uniqueness is enforced by a `UNIQUE` constraint, which is what makes "two requests for the same alias" safe without application locks. Foreign keys with `ON DELETE CASCADE` remove a link's clicks with it. Analytics need `GROUP BY`, `count(DISTINCT …)`, `FILTER` and `GROUPING SETS`, which are one query each in SQL.
- **`pg` by default, Neon's WebSocket driver as an option.** The first version used only Neon's WebSocket driver, which can talk to nothing but Neon, so it could not connect to the PostgreSQL in Docker Compose or CI. The standard `pg` driver works with every PostgreSQL and is the default. The WebSocket driver is kept behind `DATABASE_DRIVER=neon-websocket` for one real situation: networks that reset PostgreSQL traffic on port 5432. It carries the same protocol inside a WebSocket on port 443. Both expose the same pool API, and the choice is made in one file, `src/db/connect.js`.
- **Drizzle over Prisma.** Drizzle generates the SQL you would have written and has no query-engine binary. Where the builder gets in the way (batched click insert, `GROUPING SETS`) the code drops to raw SQL through the same connection.
- **SQL migrations over generated ones.** Index changes, column renames and backfills are easier to review as plain SQL, and each file states why it exists.

## Consequences

- The pool size (`DATABASE_POOL_MAX`, default 10) caps concurrent queries per process. With many app instances, a pooler such as PgBouncer (or Neon's pooled endpoint) is needed in front of PostgreSQL.
- The table definitions in `src/db/schema.js` and the SQL migrations must be kept in step by hand.
- The automated tests run on the `pg` driver. The WebSocket transport is exercised by connecting to a real Neon database, since it cannot talk to a plain PostgreSQL.

# ADR 001: Database Selection and Data Access Strategy

## Status
Accepted

## Context
LinkForge requires a reliable, ACID-compliant persistence layer for storing users, shortened URLs, and click events. We evaluated multiple database options (local Docker Postgres, AWS RDS Free Tier, Neon Serverless Postgres) and data access layers (Prisma ORM, Drizzle ORM, raw SQL with `pg`).

## Decision
1. **Database:** PostgreSQL hosted on **Neon Serverless**.
2. **Data Access Layer:** Direct SQL execution using the native Node.js **`pg` (node-postgres)** driver with connection pooling.

## Consequences & Trade-offs
* **Why Neon over AWS RDS (at this stage):**
  * AWS RDS free tier carries hidden cost risks (automated snapshots, egress, forgetting instances active).
  * Neon offers a true serverless PostgreSQL instance with zero credit card risk, separation of storage and compute, and branchable databases.
* **Why raw `pg` over Prisma:**
  * Prisma abstracts SQL generation behind a heavy compiled query engine binary.
  * Writing raw SQL with `pg` and connection pools provides complete visibility over query performance, indexes, and execution plans (`EXPLAIN ANALYZE`), which is critical for mastering production database design and 20 LPA interview discussions.
  * Higher-level query builders or ORMs (e.g., Drizzle) can be introduced later if schema complexity demands it.

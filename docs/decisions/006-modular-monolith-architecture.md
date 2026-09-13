# ADR 006: Modular Monolith Architecture

## Status
Accepted

## Context
Distributed microservices introduce substantial operational complexity: distributed transactions, network latency, distributed tracing overhead, message broker coordination, and container orchestration overhead. For LinkForge's initial development and placement defense, a clean architectural boundary inside a single deployable unit is optimal.

## Decision
We structure the application as a **Modular Monolith**:
- Single Express application and process deployment.
- Domain modules isolated in `src/modules/`:
  - `auth/`: User credentials, token rotation, sessions.
  - `urls/`: URL generation, resolution, expiration, QR codes.
  - `analytics/`: Click event ingestion, aggregation, metrics.
- Strict layered architecture inside each module:
  ```
  HTTP Request ──► Controller ──► Service ──► Repository ──► Database
  ```
  - **Controller:** Express routing, HTTP status codes, deserialization.
  - **Service:** Core business rules (entropy, collision checks, token issuance).
  - **Repository:** Drizzle ORM / SQL query execution.
  - **Validation:** Zod schemas.

## Benefits:
- Single deployment artifact (ECS container or local Node process).
- Zero network latency between domains.
- Clear domain boundaries that can be cleanly refactored into microservices if volume justifies it.

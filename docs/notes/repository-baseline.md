# LinkForge Repository Baseline & Initial Notes

## Context & Repository History
- **Project Name:** LinkForge
- **Objective:** Production-grade URL shortener and analytics platform built for high-performance scale and technical depth suitable for ~20 LPA placements/interviews.
- **Node.js Environment:** v24.6.0 with native ES Modules (`"type": "module"`).
- **Core Framework:** Express 5.2.1.
- **Database:** PostgreSQL 16.15 hosted on Neon Serverless.
- **ORM / Query Engine:** Drizzle ORM + `@neondatabase/serverless` connection pool. Direct SQL and type-safe query builders are chosen over heavy binary ORMs (like Prisma) for direct control over query execution plans and lower memory footprints.

## Baseline Analysis
1. **Separation of Concerns:**
   - `src/app.js`: Configures middleware (Helmet, CORS, Pino HTTP, JSON parsers, deep health check) without binding to a network port.
   - `src/server.js`: Listens on the configured port, enabling integration testing using `supertest` without port collisions.
2. **Database Connectivity:**
   - WebSocket transport via `neonConfig.webSocketConstructor = ws;` with fallback to `globalThis.WebSocket`.
   - Verified active connection to `neondb` on Neon serverless PostgreSQL 16.
3. **Configuration:**
   - Validated at startup using Zod in `src/config/env.js`.
   - Fails fast on invalid environment configuration before serving traffic.

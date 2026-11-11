# How LinkForge would scale

Level 1 is what is built and tested in this repository. Levels 2 and 3 are a plan for growth, not something that has been deployed or load-tested. The request figures are design targets.

---

## Architecture Evolution Levels

### Level 1: What exists today (Docker Compose)
- **Entry:** nginx serving the web app and proxying the API.
- **Compute:** one Node.js process running Express. It is stateless, so more can be added behind a load balancer without code changes.
- **Database:** one PostgreSQL (Docker locally, Neon or any managed PostgreSQL when hosted), reached through a connection pool.
- **Cache / rate limits:** one Redis (Docker locally, Upstash or ElastiCache when hosted).
- **Analytics:** clicks buffered in process memory and written in batches every two seconds.

What already makes Level 2 possible: sessions are not held in server memory, rate limits and cache are shared through Redis, the redirect path does no database writes, and shutdown is graceful.

### Level 2: Several instances on a cloud platform
- **DNS & CDN:** Route 53 pointing to Application Load Balancer (ALB).
- **Compute:** AWS ECS Fargate (2 tasks for high availability across Availability Zones).
- **Database:** AWS RDS PostgreSQL (Single-AZ or Neon Serverless).
- **Cache:** Upstash Redis or ElastiCache Redis.
- **Budget-Conscious Choice:** Low footprint, minimal idle charges.
- **Design target:** about 1,000 requests per second.
- **Needed first:** a connection pooler (PgBouncer or Neon's pooled endpoint), because each instance holds its own pool.

```
Internet ──► ALB ──► ECS Fargate (Task A & Task B)
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
      Upstash Redis              RDS PostgreSQL
```

### Level 3: Large scale
- **Edge Layer:** AWS CloudFront with AWS WAF for edge caching, DDoS mitigation, and SSL termination.
- **API Gateway & Routing:** Regional ALB with auto-scaling ECS Fargate clusters (scaling on CPU > 70% and request count per target).
- **Caching Layer:** Redis Cluster (Multi-AZ with read replicas) caching 95% of active short URLs.
- **Asynchronous Decoupled Analytics:**
  - Redirection nodes publish click events to **AWS SQS** or **Kafka**.
  - Background ECS worker tasks consume batches from SQS and execute bulk inserts into PostgreSQL (or ClickHouse / Amazon Timestream for ultra-fast analytics).
- **Database Tier:**
  - Multi-AZ RDS PostgreSQL primary with Read Replicas.
  - Read-write split: user management writes to Primary; dashboard queries read from Replicas.

```
                    Internet
                       │
                       ▼
                   CloudFront + WAF
                       │
                       ▼
                      ALB
                  ┌────┴────┐
                  ▼         ▼
                ECS 1     ECS 2 (Auto-scaling)
                  │         │
        ┌─────────┴─────────┼─────────────────┐
        ▼                   ▼                 ▼
   Redis Cluster       AWS SQS Queue     RDS Read Replica
   (link cache)             │            (Dashboard queries)
                            ▼
                      Worker Fleet
                            │
                            ▼
                     RDS Primary (Writes)
```

# LinkForge Scaling Strategy: Evolution from Level 1 to Level 3

LinkForge is architected to scale predictably from a lightweight single-node deployment to high-throughput multi-region AWS cloud infrastructure capable of handling 10,000 requests/sec.

---

## Architecture Evolution Levels

### Level 1: Developer Monolith (Current Local Setup)
- **Compute:** Single Node.js 24 process running Express.
- **Database:** PostgreSQL on Neon Serverless with connection pooling.
- **Cache / Rate Limit:** Redis (or in-memory sliding window adapter).
- **Target Load:** ~50 req/sec development and functional verification.

### Level 2: Production Containerized (Target AWS Deployment)
- **DNS & CDN:** Route 53 pointing to Application Load Balancer (ALB).
- **Compute:** AWS ECS Fargate (2 tasks for high availability across Availability Zones).
- **Database:** AWS RDS PostgreSQL (Single-AZ or Neon Serverless).
- **Cache:** Upstash Redis or ElastiCache Redis.
- **Budget-Conscious Choice:** Low footprint, minimal idle charges.
- **Target Load:** ~1,000 req/sec with sub-50ms p95 latency.

```
Internet ──► ALB ──► ECS Fargate (Task A & Task B)
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
      Upstash Redis              RDS PostgreSQL
```

### Level 3: Hyperscale Architecture (System Design Defense)
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
   (Sub-2ms cache)          │            (Dashboard queries)
                            ▼
                      Worker Fleet
                            │
                            ▼
                     RDS Primary (Writes)
```

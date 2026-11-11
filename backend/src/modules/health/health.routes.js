import { Router } from "express";
import { pool } from "../../db/client.js";
import { redis, isRedisReady } from "../../lib/redis.js";

// GET /health — used by Docker, load balancers and uptime monitors.
//
//   200 "ok"           everything works
//   200 "degraded"     Redis is down; the app still serves traffic without the cache
//   503 "unavailable"  Postgres is down; take this instance out of rotation
const router = Router();

router.get("/health", async (req, res) => {
  const startedAt = performance.now();
  let database;
  try {
    await pool.query("SELECT 1");
    database = { status: "up", latencyMs: Math.round(performance.now() - startedAt) };
  } catch {
    database = { status: "down" };
  }

  let redisStatus = "disabled";
  if (redis) redisStatus = isRedisReady() ? "up" : "down";

  let status = "ok";
  if (redisStatus === "down") status = "degraded";
  if (database.status === "down") status = "unavailable";

  res
    .status(status === "unavailable" ? 503 : 200)
    .set("Cache-Control", "no-store")
    .json({
      status,
      uptimeSeconds: Math.floor(process.uptime()),
      database,
      redis: { status: redisStatus },
    });
});

export default router;

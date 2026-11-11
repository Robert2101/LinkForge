import Redis from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

// Redis does two jobs here: it caches short-link lookups and it stores the
// rate-limit counters. Both are optimisations, not sources of truth, so the
// client is tuned to FAIL FAST. If Redis is slow or down, a command errors
// within a second and the caller falls back (Postgres for lookups, an
// in-process counter for rate limits) instead of making visitors wait.

function createClient() {
  if (!env.REDIS_URL) {
    logger.warn("REDIS_URL is not set: caching is off and rate limits are per process");
    return null;
  }

  // One connection is shared by every request (ioredis pipelines commands
  // over it), so there is no per-request connection cost.
  const client = new Redis(env.REDIS_URL, {
    connectTimeout: 3_000,
    commandTimeout: 1_000,
    maxRetriesPerRequest: 1,
    // While disconnected, reject commands immediately rather than queueing them.
    enableOfflineQueue: false,
    // Keep trying to reconnect forever, waiting a little longer each time (max 5s).
    retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
  });

  let wasReady = false;
  client.on("ready", () => {
    wasReady = true;
    logger.info("Redis connected");
  });
  client.on("error", (err) => {
    // ioredis emits an error on every failed reconnect. Log the transition only.
    if (wasReady) logger.warn({ err: err.message }, "Redis connection lost, running in fallback mode");
    wasReady = false;
  });

  return client;
}

export const redis = createClient();

export function isRedisReady() {
  return redis?.status === "ready";
}

// Resolves once the first connection attempt has finished, one way or the other.
// Lets the server (and tests) start in a known state instead of racing the handshake.
export function waitForRedis(timeoutMs = 3_000) {
  if (!redis || isRedisReady()) return Promise.resolve(isRedisReady());
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      redis.off("ready", finish);
      resolve(isRedisReady());
    };
    const timer = setTimeout(finish, timeoutMs);
    redis.once("ready", finish);
  });
}

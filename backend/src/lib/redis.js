import Redis from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// In-Memory Fallback Adapter
// Provides seamless operation when Redis is not deployed / offline
// ---------------------------------------------------------------------------
class InMemoryCache {
  constructor() {
    this.store = new Map();
    this.rateLimits = new Map();
    logger.info("⚡ Using In-Memory Cache & Rate Limiting Fallback (Redis not configured or offline)");
  }

  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value, mode, durationSeconds) {
    let expiresAt = null;
    if (mode === "EX" && durationSeconds) {
      expiresAt = Date.now() + durationSeconds * 1000;
    }
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async del(key) {
    return this.store.delete(key) ? 1 : 0;
  }

  // Sliding-window rate limiting in-memory
  async slidingWindow(key, limit, windowSeconds) {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const cutoff = now - windowMs;

    let timestamps = this.rateLimits.get(key) || [];
    // Evict timestamps outside the window
    timestamps = timestamps.filter((ts) => ts > cutoff);

    if (timestamps.length >= limit) {
      const oldest = timestamps[0];
      const resetTime = Math.ceil((oldest + windowMs) / 1000);
      return {
        allowed: false,
        total: timestamps.length,
        remaining: 0,
        resetTime,
      };
    }

    timestamps.push(now);
    this.rateLimits.set(key, timestamps);

    return {
      allowed: true,
      total: timestamps.length,
      remaining: limit - timestamps.length,
      resetTime: Math.ceil((now + windowMs) / 1000),
    };
  }

  async ping() {
    return "PONG";
  }

  isHealthy() {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Redis Client Wrapper with Dual Mode
// ---------------------------------------------------------------------------
let redisClient = null;
let isRedisConnected = false;
const fallbackCache = new InMemoryCache();

if (env.REDIS_URL) {
  try {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: false,
      retryStrategy(times) {
        if (times > 3) {
          logger.warn("Redis reconnect attempts exhausted. Using fallback.");
          return null; // stop reconnecting
        }
        return Math.min(times * 500, 2000);
      },
    });

    redisClient.on("connect", () => {
      isRedisConnected = true;
      logger.info("Connected to Redis server successfully");
    });

    redisClient.on("error", (err) => {
      isRedisConnected = false;
      logger.warn({ err: err.message }, "Redis connection error; operating with fallback");
    });
  } catch (error) {
    logger.warn({ err: error.message }, "Failed to initialize Redis client; operating with fallback");
  }
}

export const redis = {
  async get(key) {
    if (isRedisConnected && redisClient) {
      try {
        return await redisClient.get(key);
      } catch (err) {
        logger.warn({ key, err: err.message }, "Redis GET failed, trying fallback");
      }
    }
    return fallbackCache.get(key);
  },

  async set(key, value, mode = "EX", duration = 86400) {
    if (isRedisConnected && redisClient) {
      try {
        return await redisClient.set(key, value, mode, duration);
      } catch (err) {
        logger.warn({ key, err: err.message }, "Redis SET failed, storing in fallback");
      }
    }
    return fallbackCache.set(key, value, mode, duration);
  },

  async del(key) {
    if (isRedisConnected && redisClient) {
      try {
        return await redisClient.del(key);
      } catch (err) {
        logger.warn({ key, err: err.message }, "Redis DEL failed");
      }
    }
    return fallbackCache.del(key);
  },

  async slidingWindow(key, limit, windowSeconds) {
    if (isRedisConnected && redisClient) {
      try {
        const now = Date.now();
        const windowMs = windowSeconds * 1000;
        const cutoff = now - windowMs;

        // Atomic Redis sliding window via pipeline
        const multi = redisClient.multi();
        multi.zremrangebyscore(key, 0, cutoff);
        multi.zadd(key, now, `${now}-${Math.random()}`);
        multi.zcard(key);
        multi.expire(key, windowSeconds);

        const results = await multi.exec();
        const count = results[2][1];

        const allowed = count <= limit;
        const resetTime = Math.ceil((now + windowMs) / 1000);

        return {
          allowed,
          total: count,
          remaining: Math.max(0, limit - count),
          resetTime,
        };
      } catch (err) {
        logger.warn({ key, err: err.message }, "Redis rate-limit check failed, using fallback");
      }
    }
    return fallbackCache.slidingWindow(key, limit, windowSeconds);
  },

  async isHealthy() {
    if (isRedisConnected && redisClient) {
      try {
        const pong = await redisClient.ping();
        return pong === "PONG";
      } catch {
        return false;
      }
    }
    return fallbackCache.isHealthy();
  },
};

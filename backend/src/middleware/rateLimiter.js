import { redis } from "../lib/redis.js";
import { TooManyRequestsError } from "../lib/errors.js";

/**
 * Creates an Express rate-limiting middleware backed by Redis sliding window.
 *
 * @param {Object} options
 * @param {number} options.limit - Max number of requests allowed in window
 * @param {number} options.windowSeconds - Window size in seconds
 * @param {Function} [options.keyGenerator] - Custom key generator function (defaults to IP)
 * @param {string} [options.prefix] - Redis key prefix
 */
export function rateLimiter({
  limit = 60,
  windowSeconds = 60,
  keyGenerator = (req) => req.ip || req.connection.remoteAddress || "unknown",
  prefix = "rl",
} = {}) {
  return async (req, res, next) => {
    try {
      const identifier = keyGenerator(req);
      const key = `${prefix}:${identifier}`;

      const result = await redis.slidingWindow(key, limit, windowSeconds);

      // Set standard RFC rate-limit headers
      res.setHeader("X-RateLimit-Limit", limit);
      res.setHeader("X-RateLimit-Remaining", result.remaining);
      res.setHeader("X-RateLimit-Reset", result.resetTime);

      if (!result.allowed) {
        const retryAfter = Math.max(1, result.resetTime - Math.ceil(Date.now() / 1000));
        res.setHeader("Retry-After", retryAfter);
        return next(
          new TooManyRequestsError(
            `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
            { retryAfter, limit, windowSeconds }
          )
        );
      }

      next();
    } catch (error) {
      // Fail open so rate limiter glitches don't bring down core traffic
      next();
    }
  };
}

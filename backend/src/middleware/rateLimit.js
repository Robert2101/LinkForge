import { redis, isRedisReady } from "../lib/redis.js";
import { tooManyRequests } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

// Rate limiting with a SLIDING WINDOW COUNTER stored in Redis.
//
// Time is cut into fixed windows (for example 60 seconds). Each caller has one
// counter per window. To estimate "requests in the last 60 seconds" we take the
// current window's count plus a share of the previous window's count:
//
//   previous window        current window
//   |-------- 42 ---------|---- 18 ----.            now is 25% into the window,
//                                      ^ now        so 75% of the previous one still counts
//
//   estimate = 42 * 0.75 + 18 = 49
//
// That removes the weakness of a plain fixed window (a burst at the end of one
// window plus a burst at the start of the next = double the limit), while
// storing only two small numbers per caller instead of one entry per request.
//
// The check-and-increment runs as one Lua script, which Redis executes
// atomically. Two app servers handling the same caller at the same moment can
// therefore never both read "49" and both let request number 50 through.
// Rejected requests are not counted, so hammering the API does not extend a block.

const SLIDING_WINDOW_SCRIPT = `
  local current = tonumber(redis.call("GET", KEYS[1]) or "0")
  local previous = tonumber(redis.call("GET", KEYS[2]) or "0")
  local limit = tonumber(ARGV[1])
  local previousWeight = tonumber(ARGV[2])

  local used = math.floor(previous * previousWeight) + current
  if used >= limit then
    return {0, used}
  end

  redis.call("INCR", KEYS[1])
  redis.call("PEXPIRE", KEYS[1], ARGV[3])
  return {1, used + 1}
`;

redis?.defineCommand("slidingWindowHit", { numberOfKeys: 2, lua: SLIDING_WINDOW_SCRIPT });

async function hitInRedis(key, windowIndex, limit, previousWeight, windowMs) {
  // The {braces} keep both counters on the same node if Redis runs as a cluster.
  const [allowed, used] = await redis.slidingWindowHit(
    `ratelimit:{${key}}:${windowIndex}`,
    `ratelimit:{${key}}:${windowIndex - 1}`,
    limit,
    previousWeight,
    windowMs * 2 // a counter is needed for its own window and the one after it
  );
  return { allowed: allowed === 1, used };
}

// Fallback used only while Redis is unreachable: the same algorithm with the
// counters held in this process. Limits are then per server rather than
// shared, which is weaker but far better than no protection at all.
const localCounters = new Map();

function hitInMemory(key, windowIndex, limit, previousWeight) {
  let entry = localCounters.get(key);
  if (!entry || entry.windowIndex < windowIndex - 1) {
    entry = { windowIndex, current: 0, previous: 0 };
  } else if (entry.windowIndex === windowIndex - 1) {
    entry = { windowIndex, current: 0, previous: entry.current };
  }

  const used = Math.floor(entry.previous * previousWeight) + entry.current;
  const allowed = used < limit;
  if (allowed) entry.current += 1;

  localCounters.set(key, entry);
  return { allowed, used: allowed ? used + 1 : used };
}

// Keep the fallback map from growing forever.
setInterval(() => {
  if (localCounters.size > 50_000) localCounters.clear();
}, 60_000).unref();

/**
 * Creates a rate-limit middleware.
 * @param {object} options
 * @param {string} options.name            Label for this limit, e.g. "auth". Each name counts separately.
 * @param {number} options.limit           Requests allowed per window.
 * @param {number} options.windowSeconds   Window length.
 * @param {Function} [options.keyBy]       What to count per. Default: the signed-in user, else the IP address.
 */
export function rateLimit({ name, limit, windowSeconds, keyBy = (req) => req.user?.id ?? req.ip }) {
  const windowMs = windowSeconds * 1000;

  return async function rateLimitMiddleware(req, res, next) {
    const key = `${name}:${keyBy(req)}`;

    const now = Date.now();
    const windowIndex = Math.floor(now / windowMs);
    const elapsedShare = (now % windowMs) / windowMs;
    const previousWeight = 1 - elapsedShare;

    let result;
    if (isRedisReady()) {
      try {
        result = await hitInRedis(key, windowIndex, limit, previousWeight, windowMs);
      } catch (err) {
        logger.warn({ err: err.message }, "Rate limit check failed in Redis, using local counter");
      }
    }
    result ??= hitInMemory(key, windowIndex, limit, previousWeight);

    const secondsUntilReset = Math.ceil((windowMs - (now % windowMs)) / 1000);
    const remaining = Math.max(0, limit - result.used);

    // A request can pass through several limits (the general API limit, then a
    // stricter one for the route). The headers describe whichever limit the
    // caller is closest to hitting.
    const alreadyReported = res.get("RateLimit-Remaining");
    if (alreadyReported === undefined || remaining < Number(alreadyReported)) {
      res.set({
        "RateLimit-Limit": String(limit),
        "RateLimit-Remaining": String(remaining),
        "RateLimit-Reset": String(secondsUntilReset),
      });
    }

    if (!result.allowed) {
      res.set("Retry-After", String(secondsUntilReset));
      throw tooManyRequests(secondsUntilReset);
    }
    next();
  };
}

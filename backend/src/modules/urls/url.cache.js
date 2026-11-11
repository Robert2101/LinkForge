import { redis, isRedisReady } from "../../lib/redis.js";
import { logger } from "../../lib/logger.js";

// Redis cache for short-link lookups (the "cache-aside" pattern).
//
//   key    link:<short code>
//   value  JSON of { id, originalUrl, isActive, expiresAt }, or "missing"
//
// Redirects are by far the most frequent request and almost never change, so
// popular links are answered from memory without asking Postgres at all.
//
// Every function here swallows Redis errors on purpose: the cache is an
// optimisation, and a cache outage must never break a redirect.

const LINK_TTL_SECONDS = 60 * 60;

// Codes that do not exist are cached too, briefly. Otherwise someone
// requesting random codes would send every single one to the database.
const MISSING = "missing";
const MISSING_TTL_SECONDS = 60;

const keyFor = (shortCode) => `link:${shortCode}`;

// Spread expiry times by ±10% so links cached in the same moment
// do not all expire, and hit the database, in the same moment later.
const withJitter = (seconds) => Math.round(seconds * (0.9 + Math.random() * 0.2));

// Returns:
//   a link object  the code is cached
//   null           the code is cached as "does not exist"
//   undefined      nothing cached (or Redis is unavailable): ask the database
export async function readCachedLink(shortCode) {
  if (!isRedisReady()) return undefined;
  try {
    const value = await redis.get(keyFor(shortCode));
    if (value === null) return undefined;
    return value === MISSING ? null : JSON.parse(value);
  } catch (err) {
    logger.debug({ err: err.message }, "Cache read failed");
    return undefined;
  }
}

// Stores a link, or remembers that the code does not exist when `link` is null.
export async function cacheLink(shortCode, link) {
  if (!isRedisReady()) return;
  try {
    if (!link) {
      await redis.set(keyFor(shortCode), MISSING, "EX", MISSING_TTL_SECONDS);
      return;
    }

    // Never keep a link in the cache past its own expiry time.
    let ttl = LINK_TTL_SECONDS;
    if (link.expiresAt) {
      const secondsLeft = Math.floor((new Date(link.expiresAt) - Date.now()) / 1000);
      ttl = Math.min(ttl, Math.max(secondsLeft, 1));
    }
    await redis.set(keyFor(shortCode), JSON.stringify(link), "EX", withJitter(ttl));
  } catch (err) {
    logger.debug({ err: err.message }, "Cache write failed");
  }
}

// Called whenever a link is edited or deleted, so no stale copy is served.
export async function forgetCachedLink(shortCode) {
  if (!isRedisReady()) return;
  try {
    await redis.del(keyFor(shortCode));
  } catch (err) {
    // The entry will still disappear on its own when the TTL runs out.
    logger.warn({ err: err.message, shortCode }, "Cache invalidation failed");
  }
}

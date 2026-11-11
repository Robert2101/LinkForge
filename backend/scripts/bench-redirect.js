// Measures what the Redis cache saves on the redirect path.
//
//   npm run bench
//
// It creates one link, then times the two ways a redirect can find it:
// straight from Postgres (what every redirect costs without a cache) and from
// Redis (a cache hit). Numbers depend on where your database and Redis run,
// so run it against your own setup instead of quoting someone else's.

import { performance } from "node:perf_hooks";
import { waitForRedis, isRedisReady } from "../src/lib/redis.js";
import { closeResources } from "../src/lib/shutdown.js";
import { readCachedLink } from "../src/modules/urls/url.cache.js";
import { urlRepository } from "../src/modules/urls/url.repository.js";
import { urlService } from "../src/modules/urls/url.service.js";

const ROUNDS = 1_000;

async function time(lookup) {
  const samples = [];
  for (let i = 0; i < ROUNDS; i++) {
    const startedAt = performance.now();
    await lookup();
    samples.push(performance.now() - startedAt);
  }
  samples.sort((a, b) => a - b);
  const at = (share) => samples[Math.floor(samples.length * share)].toFixed(2);
  const average = (samples.reduce((sum, ms) => sum + ms, 0) / samples.length).toFixed(2);
  return { "avg ms": average, "p50 ms": at(0.5), "p95 ms": at(0.95), "p99 ms": at(0.99) };
}

await waitForRedis();
if (!isRedisReady()) {
  console.error("Redis is not reachable. Set REDIS_URL to compare cached and uncached lookups.");
  await closeResources();
  process.exit(1);
}

const link = await urlService.createLink({ originalUrl: "https://example.com/benchmark" });

// Warm both paths up so connection setup is not part of the measurement.
await urlRepository.findByShortCode(link.shortCode);
await readCachedLink(link.shortCode);

const results = {
  "Postgres (no cache)": await time(() => urlRepository.findByShortCode(link.shortCode)),
  "Redis (cache hit)": await time(() => readCachedLink(link.shortCode)),
};

console.log(`\nShort-link lookup, ${ROUNDS} sequential lookups each:\n`);
console.table(results);

await closeResources();

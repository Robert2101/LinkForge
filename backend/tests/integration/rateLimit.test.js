import crypto from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { isRedisReady, redis } from "../../src/lib/redis.js";
import { newClient, useApp } from "../helpers.js";

useApp();

// A failed login. Each call uses a different email unless one is given, so
// these tests exercise the per-IP limit without tripping the per-account one.
const login = (client, email = `nobody-${crypto.randomUUID()}@example.com`) =>
  client.post("/api/v1/auth/login").send({ email, password: "Wrong-Horse-1" });

test("the 11th login attempt in 15 minutes is blocked with 429", async () => {
  const attacker = newClient();

  for (let attempt = 1; attempt <= 10; attempt++) {
    const res = await login(attacker);
    assert.equal(res.status, 401, `attempt ${attempt} should reach the login handler`);
    assert.equal(res.headers["ratelimit-limit"], "10");
    assert.equal(res.headers["ratelimit-remaining"], String(10 - attempt));
  }

  const blocked = await login(attacker);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, "RATE_LIMITED");
  assert.equal(blocked.headers["ratelimit-remaining"], "0");

  const retryAfter = Number(blocked.headers["retry-after"]);
  assert.ok(retryAfter >= 1 && retryAfter <= 900);
  assert.equal(blocked.body.error.details.retryAfterSeconds, retryAfter);
});

test("limits are counted per visitor", async () => {
  const attacker = newClient();
  for (let i = 0; i < 11; i++) await login(attacker);
  assert.equal((await login(attacker)).status, 429);

  // A different IP address is unaffected.
  assert.equal((await login(newClient())).status, 401);
});

test("one account cannot be attacked from many addresses", async () => {
  const email = `victim-${Date.now()}@example.com`;
  const attempt = () => login(newClient(), email); // a new IP address every time

  for (let i = 0; i < 20; i++) assert.equal((await attempt()).status, 401);
  assert.equal((await attempt()).status, 429);

  // Other accounts are unaffected.
  assert.equal((await login(newClient())).status, 401);
});

test("blocked requests do not extend the block", async (t) => {
  if (!isRedisReady()) return t.skip("Redis is not available");

  const attacker = newClient();
  let ip;
  attacker.use((req) => (ip = req.get("X-Forwarded-For")));
  for (let i = 0; i < 25; i++) await login(attacker);

  // The counter lives in Redis and stopped at the limit: 15 rejected
  // requests were not added to it.
  const windowIndex = Math.floor(Date.now() / (15 * 60 * 1000));
  const current = Number(await redis.get(`ratelimit:{auth:${ip}}:${windowIndex}`));
  const previous = Number(await redis.get(`ratelimit:{auth:${ip}}:${windowIndex - 1}`));
  assert.equal(current + previous, 10);

  const ttlMs = await redis.pttl(`ratelimit:{auth:${ip}}:${windowIndex}`);
  assert.ok(ttlMs > 0 && ttlMs <= 30 * 60 * 1000, "counters must expire on their own");
});

test("concurrent requests cannot slip past the limit", async (t) => {
  if (!isRedisReady()) return t.skip("Redis is not available");

  // 30 logins at the same instant from one address: exactly 10 may pass.
  const ip = "10.99.99.99";
  await redis.del(
    ...[0, -1].map((offset) => `ratelimit:{auth:${ip}}:${Math.floor(Date.now() / 900_000) + offset}`)
  );

  const responses = await Promise.all(
    Array.from({ length: 30 }, () => {
      const client = newClient();
      client.set("X-Forwarded-For", ip);
      return login(client);
    })
  );

  const allowed = responses.filter((res) => res.status === 401).length;
  const blocked = responses.filter((res) => res.status === 429).length;
  assert.equal(allowed, 10);
  assert.equal(blocked, 20);
});

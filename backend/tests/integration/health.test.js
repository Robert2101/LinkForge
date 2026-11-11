import test from "node:test";
import assert from "node:assert/strict";
import { isRedisReady } from "../../src/lib/redis.js";
import { newClient, useApp } from "../helpers.js";

useApp();

test("GET /health reports the database and Redis", async () => {
  const res = await newClient().get("/health");

  assert.equal(res.status, 200);
  assert.equal(res.body.database.status, "up");
  assert.equal(typeof res.body.database.latencyMs, "number");
  assert.equal(res.body.redis.status, isRedisReady() ? "up" : "disabled");
  assert.equal(res.body.status, "ok");
});

test("every response carries security headers and a request id", async () => {
  const res = await newClient().get("/health");

  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.equal(res.headers["x-frame-options"], "SAMEORIGIN");
  assert.ok(res.headers["content-security-policy"]);
  assert.ok(res.headers["strict-transport-security"]);
  assert.equal(res.headers["x-powered-by"], undefined, "do not advertise the framework");
  assert.match(res.headers["x-request-id"], /^[0-9a-f-]{36}$/);
});

test("unknown routes return a JSON 404", async () => {
  const res = await newClient().get("/api/v1/does-not-exist");
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, "NOT_FOUND");
});

test("only the configured web origin may call the API from a browser", async () => {
  const allowed = await newClient().get("/api/v1/auth/me").set("Origin", "http://localhost:5173");
  assert.equal(allowed.headers["access-control-allow-origin"], "http://localhost:5173");
  assert.equal(allowed.headers["access-control-allow-credentials"], "true");

  const other = await newClient().get("/api/v1/auth/me").set("Origin", "https://evil.example");
  assert.equal(other.headers["access-control-allow-origin"], undefined);
});

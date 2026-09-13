import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../../src/app.js";

test("Integration GET /health — returns status 200 with database connectivity", async () => {
  const res = await request(app).get("/health");

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.equal(res.body.database.status, "connected");
  assert.equal(typeof res.body.database.latencyMs, "number");
  assert.ok(res.body.timestamp);
});

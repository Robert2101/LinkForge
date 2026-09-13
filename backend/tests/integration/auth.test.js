import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../../src/app.js";

const testUser = {
  email: `test_${Date.now()}@example.com`,
  password: "Password123!",
  name: "LinkForge Tester",
};

let accessToken = "";
let refreshTokenCookie = "";

test("Auth Integration — registers a new user with Argon2id", async () => {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send(testUser);

  assert.equal(res.status, 201);
  assert.ok(res.body.user);
  assert.equal(res.body.user.email, testUser.email);
  assert.ok(res.body.accessToken);
  assert.equal(res.body.user.passwordHash, undefined); // password hash must NOT be leaked
});

test("Auth Integration — duplicate registration returns HTTP 409 Conflict", async () => {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send(testUser);

  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, "ConflictError");
});

test("Auth Integration — logs in user and returns tokens with HTTP-only cookie", async () => {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({
      email: testUser.email,
      password: testUser.password,
    });

  assert.equal(res.status, 200);
  assert.ok(res.body.accessToken);
  accessToken = res.body.accessToken;

  // Verify Set-Cookie header contains refreshToken and HttpOnly
  const cookies = res.headers["set-cookie"];
  assert.ok(cookies, "Expected set-cookie header");
  const refreshCookie = cookies.find((c) => c.startsWith("refreshToken="));
  assert.ok(refreshCookie, "Expected refreshToken cookie");
  assert.ok(refreshCookie.includes("HttpOnly"));
  refreshTokenCookie = refreshCookie.split(";")[0];
});

test("Auth Integration — accesses protected /api/v1/auth/me", async () => {
  const res = await request(app)
    .get("/api/v1/auth/me")
    .set("Authorization", `Bearer ${accessToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.user.email, testUser.email);
});

test("Auth Integration — refreshes token and rotates refresh token", async () => {
  const res = await request(app)
    .post("/api/v1/auth/refresh")
    .set("Cookie", [refreshTokenCookie]);

  assert.equal(res.status, 200);
  assert.ok(res.body.accessToken);

  // New refresh token should be issued in set-cookie
  const cookies = res.headers["set-cookie"];
  assert.ok(cookies);
  const newRefreshCookie = cookies.find((c) => c.startsWith("refreshToken="));
  assert.ok(newRefreshCookie);

  // BREACH DETECTION TEST: Replaying the old (now revoked) refresh token must fail
  const replayRes = await request(app)
    .post("/api/v1/auth/refresh")
    .set("Cookie", [refreshTokenCookie]);

  assert.equal(replayRes.status, 401);
  assert.ok(replayRes.body.error.message.includes("Token reuse detected"));
});

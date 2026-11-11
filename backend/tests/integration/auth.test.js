import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../src/db/client.js";
import { newClient, signUp, uniqueEmail, useApp } from "../helpers.js";

useApp();

const refreshCookieOf = (res) =>
  (res.headers["set-cookie"] ?? []).find((cookie) => cookie.startsWith("refresh_token="));

test("register creates an account and starts a session", async () => {
  const client = newClient();
  const email = uniqueEmail();
  const res = await client.post("/api/v1/auth/register").send({ email, password: "Correct-Horse-1" });

  assert.equal(res.status, 201);
  assert.equal(res.body.user.email, email);
  assert.ok(res.body.accessToken);
  assert.equal(res.body.user.passwordHash, undefined, "the password hash must never leave the server");
  assert.equal(res.body.refreshToken, undefined, "the refresh token belongs in the cookie only");

  const cookie = refreshCookieOf(res);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\/api\/v1\/auth/);
});

test("register validates its input", async () => {
  const client = newClient();
  const attempt = (body) => client.post("/api/v1/auth/register").send(body);

  const weak = await attempt({ email: uniqueEmail(), password: "password" });
  assert.equal(weak.status, 422);
  assert.equal(weak.body.error.code, "VALIDATION_FAILED");
  assert.ok(weak.body.error.details.some((issue) => issue.field === "password"));

  assert.equal((await attempt({ email: "not-an-email", password: "Correct-Horse-1" })).status, 422);
  assert.equal((await attempt({})).status, 422);
});

test("registering the same email twice is a conflict, whatever the letter case", async () => {
  const { email } = await signUp();
  const res = await newClient()
    .post("/api/v1/auth/register")
    .send({ email: email.toUpperCase(), password: "Correct-Horse-1" });

  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, "CONFLICT");
});

test("login accepts the right password and rejects everything else with one message", async () => {
  const { email, password } = await signUp();
  const client = newClient();

  const ok = await client.post("/api/v1/auth/login").send({ email, password });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.accessToken);
  assert.ok(refreshCookieOf(ok));

  const wrongPassword = await client.post("/api/v1/auth/login").send({ email, password: "Wrong-Horse-1" });
  const unknownEmail = await client.post("/api/v1/auth/login").send({ email: uniqueEmail(), password });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.equal(
    wrongPassword.body.error.message,
    unknownEmail.body.error.message,
    "the response must not reveal whether the email exists"
  );
});

test("protected routes need a valid access token", async () => {
  const { client, auth, email } = await signUp();

  const me = await client.get("/api/v1/auth/me").set(auth);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, email);

  assert.equal((await client.get("/api/v1/auth/me")).status, 401);
  assert.equal((await client.get("/api/v1/auth/me").set("Authorization", "Bearer not-a-token")).status, 401);
  assert.equal((await client.get("/api/v1/auth/me").set("Authorization", "Basic abc")).status, 401);
});

test("refresh returns a new access token and replaces the refresh token", async () => {
  const { client, user } = await signUp(); // the client now holds the refresh cookie

  const res = await client.post("/api/v1/auth/refresh");
  assert.equal(res.status, 200);
  assert.ok(res.body.accessToken);
  assert.equal(res.body.user.id, user.id);
  assert.ok(refreshCookieOf(res), "a replacement refresh token must be issued");

  // The rotated cookie works for the next refresh too.
  assert.equal((await client.post("/api/v1/auth/refresh")).status, 200);
});

test("refresh without a cookie is rejected", async () => {
  assert.equal((await newClient().post("/api/v1/auth/refresh")).status, 401);
});

test("replaying a used refresh token revokes the whole session family", async () => {
  // The legitimate browser signs up...
  const browser = newClient();
  const signUpRes = await browser
    .post("/api/v1/auth/register")
    .send({ email: uniqueEmail(), password: "Correct-Horse-1" });
  const stolenCookie = refreshCookieOf(signUpRes).split(";")[0];

  // ...and refreshes normally, which uses up the first token.
  assert.equal((await browser.post("/api/v1/auth/refresh")).status, 200);

  // Make that use look older than the duplicate-request grace period.
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = now() - interval '1 minute'
     WHERE user_id = $1 AND revoked_at IS NOT NULL`,
    [signUpRes.body.user.id]
  );

  // An attacker replays the first token.
  const attacker = newClient();
  const replay = await attacker.post("/api/v1/auth/refresh").set("Cookie", stolenCookie);
  assert.equal(replay.status, 401);

  // The theft was detected, so the legitimate browser's newer token is dead too.
  assert.equal((await browser.post("/api/v1/auth/refresh")).status, 401);
});

test("a duplicate refresh within the grace period does not end the session", async () => {
  const browser = newClient();
  const signUpRes = await browser
    .post("/api/v1/auth/register")
    .send({ email: uniqueEmail(), password: "Correct-Horse-1" });
  const firstCookie = refreshCookieOf(signUpRes).split(";")[0];

  assert.equal((await browser.post("/api/v1/auth/refresh")).status, 200);

  // The same token arrives again immediately (double click, retry).
  const duplicate = await newClient().post("/api/v1/auth/refresh").set("Cookie", firstCookie);
  assert.equal(duplicate.status, 401);

  // The session that won the race keeps working.
  assert.equal((await browser.post("/api/v1/auth/refresh")).status, 200);
});

test("logout ends the session", async () => {
  const { client } = await signUp();

  const res = await client.post("/api/v1/auth/logout");
  assert.equal(res.status, 204);
  assert.equal((await client.post("/api/v1/auth/refresh")).status, 401);
});

test("only a hash of the refresh token is stored", async () => {
  const client = newClient();
  const res = await client
    .post("/api/v1/auth/register")
    .send({ email: uniqueEmail(), password: "Correct-Horse-1" });
  const rawToken = refreshCookieOf(res).split(";")[0].split("=")[1];

  const { rows } = await pool.query("SELECT token_hash FROM refresh_tokens WHERE user_id = $1", [
    res.body.user.id,
  ]);
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].token_hash, rawToken);
  assert.match(rows[0].token_hash, /^[0-9a-f]{64}$/);
});

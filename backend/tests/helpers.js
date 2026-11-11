import crypto from "node:crypto";
import { after, before } from "node:test";
import request from "supertest";
import app from "../src/app.js";
import { waitForRedis } from "../src/lib/redis.js";
import { closeResources } from "../src/lib/shutdown.js";

// Call once at the top of an integration test file.
// Waits for Redis before the first test and closes all connections after the
// last one, so the test process can exit.
export function useApp() {
  before(() => waitForRedis());
  after(() => closeResources());
}

// A browser-like client: it remembers cookies and has its own IP address
// (via X-Forwarded-For), so rate limits in one test never leak into another.
export function newClient() {
  const ip = `10.${crypto.randomInt(256)}.${crypto.randomInt(256)}.${crypto.randomInt(1, 255)}`;
  const client = request.agent(app);
  client.set("X-Forwarded-For", ip);
  return client;
}

export const uniqueEmail = () => `user-${crypto.randomUUID()}@example.com`;
export const uniqueAlias = () => `t-${crypto.randomBytes(6).toString("hex")}`;

// Registers a fresh account and returns a client that is signed in as it.
export async function signUp() {
  const client = newClient();
  const email = uniqueEmail();
  const password = "Correct-Horse-1";

  const res = await client.post("/api/v1/auth/register").send({ email, password, name: "Test User" });
  if (res.status !== 201) throw new Error(`Sign-up failed: ${res.status} ${JSON.stringify(res.body)}`);

  return {
    client,
    email,
    password,
    user: res.body.user,
    accessToken: res.body.accessToken,
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
  };
}

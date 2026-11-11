import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../src/db/client.js";
import { isRedisReady, redis } from "../../src/lib/redis.js";
import { newClient, signUp, uniqueAlias, useApp } from "../helpers.js";

useApp();

const DESTINATION = "https://nodejs.org/en/docs";

async function createLink(session, body = {}) {
  const res = await session.client
    .post("/api/v1/urls")
    .set(session.auth)
    .send({ originalUrl: DESTINATION, ...body });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.link;
}

// ---------------------------------------------------------------------------
// Creating links
// ---------------------------------------------------------------------------

test("anyone can shorten a link without an account", async () => {
  const res = await newClient().post("/api/v1/urls").send({ originalUrl: DESTINATION });

  assert.equal(res.status, 201);
  assert.match(res.body.link.shortCode, /^[0-9a-zA-Z]{7}$/);
  assert.equal(res.body.link.shortUrl, `http://localhost:5001/${res.body.link.shortCode}`);
  assert.equal(res.body.link.userId, null);
  assert.equal(res.body.link.isCustom, false);
});

test("a signed-in user owns the links they create", async () => {
  const session = await signUp();
  const link = await createLink(session);
  assert.equal(link.userId, session.user.id);
});

test("an expired access token is an error, not a silent anonymous link", async () => {
  const res = await newClient()
    .post("/api/v1/urls")
    .set("Authorization", "Bearer expired-or-garbage")
    .send({ originalUrl: DESTINATION });
  assert.equal(res.status, 401);
});

test("unsafe destinations are refused", async () => {
  const client = newClient();
  for (const originalUrl of [
    "javascript:alert(1)",
    "http://localhost:3000/admin",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.1.1",
    "ftp://example.com",
  ]) {
    const res = await client.post("/api/v1/urls").send({ originalUrl });
    assert.equal(res.status, 422, originalUrl);
    assert.equal(res.body.error.details[0].field, "originalUrl");
  }
});

test("custom alias: accepted once, then a conflict; reserved names refused", async () => {
  const session = await signUp();
  const customAlias = uniqueAlias();

  const link = await createLink(session, { customAlias });
  assert.equal(link.shortCode, customAlias);
  assert.equal(link.isCustom, true);

  const again = await newClient().post("/api/v1/urls").send({ originalUrl: DESTINATION, customAlias });
  assert.equal(again.status, 409);

  const reserved = await newClient().post("/api/v1/urls").send({ originalUrl: DESTINATION, customAlias: "dashboard" });
  assert.equal(reserved.status, 422);
});

test("two simultaneous requests for one alias: exactly one wins", async () => {
  const customAlias = uniqueAlias();
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      newClient().post("/api/v1/urls").send({ originalUrl: DESTINATION, customAlias })
    )
  );
  const statuses = results.map((res) => res.status).sort();
  assert.deepEqual(statuses, [201, 409, 409, 409, 409, 409, 409, 409]);
});

test("malformed and oversized bodies get clear errors", async () => {
  const client = newClient();

  const badJson = await client
    .post("/api/v1/urls")
    .set("Content-Type", "application/json")
    .send('{"originalUrl": ');
  assert.equal(badJson.status, 400);
  assert.equal(badJson.body.error.code, "INVALID_JSON");

  const huge = await client.post("/api/v1/urls").send({ originalUrl: `https://example.com/${"a".repeat(20_000)}` });
  assert.equal(huge.status, 413);
});

// ---------------------------------------------------------------------------
// Redirects and the cache
// ---------------------------------------------------------------------------

test("a short link redirects with 302 and is never cached by browsers", async () => {
  const session = await signUp();
  const link = await createLink(session);

  const res = await newClient().get(`/${link.shortCode}`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, DESTINATION);
  assert.equal(res.headers["cache-control"], "no-store");
});

test("redirects are served from Redis: MISS on the first lookup, HIT afterwards", async (t) => {
  if (!isRedisReady()) return t.skip("Redis is not available");

  const session = await signUp();
  const link = await createLink(session);
  const visitor = newClient();

  // A new link is cached at creation time, so even the first visit is a HIT.
  assert.equal((await visitor.get(`/${link.shortCode}`)).headers["x-cache"], "HIT");

  // Remove the cache entry: the next visit reads Postgres and re-fills the cache.
  await redis.del(`link:${link.shortCode}`);
  assert.equal((await visitor.get(`/${link.shortCode}`)).headers["x-cache"], "MISS");
  assert.equal((await visitor.get(`/${link.shortCode}`)).headers["x-cache"], "HIT");

  const ttl = await redis.ttl(`link:${link.shortCode}`);
  assert.ok(ttl > 0 && ttl <= 3960, `cache entries must expire (ttl=${ttl})`);
});

test("a cache HIT does not touch Postgres", async (t) => {
  if (!isRedisReady()) return t.skip("Redis is not available");

  const session = await signUp();
  const link = await createLink(session);

  // Delete the row behind the cache's back. If the redirect still works,
  // the answer can only have come from Redis.
  await pool.query("DELETE FROM urls WHERE id = $1", [link.id]);
  const res = await newClient().get(`/${link.shortCode}`);
  assert.equal(res.status, 302);
  assert.equal(res.headers["x-cache"], "HIT");

  await redis.del(`link:${link.shortCode}`);
});

test("unknown codes are 404, and the miss itself is cached briefly", async (t) => {
  const visitor = newClient();
  const code = uniqueAlias();

  const first = await visitor.get(`/${code}`);
  assert.equal(first.status, 404);

  if (!isRedisReady()) return t.skip("Redis is not available");
  assert.equal(first.headers["x-cache"], "MISS");
  assert.equal((await visitor.get(`/${code}`)).headers["x-cache"], "HIT");
  assert.equal(await redis.get(`link:${code}`), "missing");

  // Creating that code afterwards must work immediately despite the cached miss.
  const session = await signUp();
  await createLink(session, { customAlias: code });
  assert.equal((await visitor.get(`/${code}`)).status, 302);
});

test("codes that cannot exist are rejected without any lookup", async () => {
  const res = await newClient().get("/not.a.valid.code");
  assert.equal(res.status, 404);
  assert.equal(res.headers["x-cache"], undefined);
});

test("browsers get a readable page for a dead link, API clients get JSON", async () => {
  const visitor = newClient();
  const code = uniqueAlias();

  const html = await visitor.get(`/${code}`).set("Accept", "text/html");
  assert.match(html.headers["content-type"], /text\/html/);
  assert.match(html.text, /This link does not exist/);

  const json = await visitor.get(`/${code}`).set("Accept", "application/json");
  assert.equal(json.body.error.code, "NOT_FOUND");
});

test("editing a link takes effect on the very next redirect (cache invalidation)", async () => {
  const session = await signUp();
  const link = await createLink(session);
  const visitor = newClient();

  assert.equal((await visitor.get(`/${link.shortCode}`)).headers.location, DESTINATION);

  const updated = await session.client
    .patch(`/api/v1/urls/${link.id}`)
    .set(session.auth)
    .send({ originalUrl: "https://example.org/new" });
  assert.equal(updated.status, 200);

  assert.equal((await visitor.get(`/${link.shortCode}`)).headers.location, "https://example.org/new");
});

test("a paused link stops redirecting and resumes when switched back on", async () => {
  const session = await signUp();
  const link = await createLink(session);
  const visitor = newClient();
  const setActive = (isActive) =>
    session.client.patch(`/api/v1/urls/${link.id}`).set(session.auth).send({ isActive });

  await setActive(false);
  assert.equal((await visitor.get(`/${link.shortCode}`)).status, 404);

  await setActive(true);
  assert.equal((await visitor.get(`/${link.shortCode}`)).status, 302);
});

test("an expired link answers 410 Gone", async () => {
  const session = await signUp();
  const link = await createLink(session);

  // The API refuses past dates, so set the expiry directly and clear the cache.
  await pool.query("UPDATE urls SET expires_at = now() - interval '1 hour' WHERE id = $1", [link.id]);
  if (isRedisReady()) await redis.del(`link:${link.shortCode}`);

  const res = await newClient().get(`/${link.shortCode}`);
  assert.equal(res.status, 410);
});

test("deleting a link removes it everywhere", async () => {
  const session = await signUp();
  const link = await createLink(session);

  const res = await session.client.delete(`/api/v1/urls/${link.id}`).set(session.auth);
  assert.equal(res.status, 204);

  assert.equal((await newClient().get(`/${link.shortCode}`)).status, 404);
  assert.equal((await session.client.get(`/api/v1/urls/${link.id}`).set(session.auth)).status, 404);
});

// ---------------------------------------------------------------------------
// Managing links
// ---------------------------------------------------------------------------

test("listing is paginated, newest first, and searchable", async () => {
  const session = await signUp();
  const alias = uniqueAlias();
  await createLink(session, { originalUrl: "https://example.com/first" });
  await createLink(session, { originalUrl: "https://example.com/second" });
  await createLink(session, { originalUrl: "https://example.com/third", customAlias: alias });

  const list = (query) => session.client.get(`/api/v1/urls?${query}`).set(session.auth);

  const pageOne = await list("page=1&limit=2");
  assert.equal(pageOne.status, 200);
  assert.equal(pageOne.body.items.length, 2);
  assert.deepEqual(pageOne.body.pagination, { page: 1, limit: 2, total: 3, totalPages: 2 });
  assert.equal(pageOne.body.items[0].originalUrl, "https://example.com/third");

  const pageTwo = await list("page=2&limit=2");
  assert.equal(pageTwo.body.items.length, 1);
  assert.equal(pageTwo.body.items[0].originalUrl, "https://example.com/first");

  const search = await list(`search=${alias}`);
  assert.equal(search.body.items.length, 1);
  assert.equal(search.body.items[0].shortCode, alias);

  // "%" is a wildcard in SQL LIKE; it must be treated as an ordinary character.
  assert.equal((await list("search=%25")).body.items.length, 0);

  assert.equal((await list("limit=500")).status, 422);
  assert.equal((await newClient().get("/api/v1/urls")).status, 401);
});

test("a user cannot read, change or delete someone else's link", async () => {
  const owner = await signUp();
  const intruder = await signUp();
  const link = await createLink(owner);
  const url = `/api/v1/urls/${link.id}`;

  assert.equal((await intruder.client.get(url).set(intruder.auth)).status, 404);
  assert.equal(
    (await intruder.client.patch(url).set(intruder.auth).send({ originalUrl: "https://evil.example" })).status,
    404
  );
  assert.equal((await intruder.client.delete(url).set(intruder.auth)).status, 404);
  assert.equal((await intruder.client.get(`/api/v1/analytics/links/${link.id}`).set(intruder.auth)).status, 404);

  // The link is untouched.
  const stillThere = await owner.client.get(url).set(owner.auth);
  assert.equal(stillThere.status, 200);
  assert.equal(stillThere.body.link.originalUrl, DESTINATION);

  const intrudersList = await intruder.client.get("/api/v1/urls").set(intruder.auth);
  assert.equal(intrudersList.body.items.length, 0);
});

test("ids are validated before reaching the database", async () => {
  const session = await signUp();
  const res = await session.client.get("/api/v1/urls/not-a-uuid").set(session.auth);
  assert.equal(res.status, 422);
});

test("QR codes are available as SVG and PNG", async () => {
  const session = await signUp();
  const link = await createLink(session);
  const client = newClient();

  const svg = await client.get(`/api/v1/qr/${link.shortCode}`);
  assert.equal(svg.status, 200);
  assert.match(svg.headers["content-type"], /image\/svg\+xml/);
  assert.match(svg.body.toString(), /<svg/);

  const png = await client.get(`/api/v1/qr/${link.shortCode}?format=png`);
  assert.equal(png.headers["content-type"], "image/png");
  assert.deepEqual([...png.body.subarray(1, 4)], [0x50, 0x4e, 0x47]); // "PNG"

  assert.equal((await client.get(`/api/v1/qr/${uniqueAlias()}`)).status, 404);
  assert.equal((await client.get(`/api/v1/qr/${link.shortCode}?format=gif`)).status, 422);
});

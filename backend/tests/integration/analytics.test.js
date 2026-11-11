import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../src/db/client.js";
import { flushClicks } from "../../src/modules/analytics/clickRecorder.js";
import { newClient, signUp, useApp } from "../helpers.js";

useApp();

const CHROME_ON_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SAFARI_ON_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

async function createLink(session) {
  const res = await session.client
    .post("/api/v1/urls")
    .set(session.auth)
    .send({ originalUrl: "https://example.com/landing" });
  return res.body.link;
}

const today = () => new Date().toISOString().slice(0, 10);

test("clicks are buffered, then saved in one batch with their details", async () => {
  const session = await signUp();
  const link = await createLink(session);

  const alice = newClient();
  const bob = newClient();
  await alice.get(`/${link.shortCode}`).set("User-Agent", CHROME_ON_WINDOWS).set("Referer", "https://www.reddit.com/r/node/");
  await alice.get(`/${link.shortCode}`).set("User-Agent", CHROME_ON_WINDOWS);
  await bob.get(`/${link.shortCode}`).set("User-Agent", SAFARI_ON_IPHONE).set("CF-IPCountry", "IN");

  // Nothing is in the database until the buffer is flushed.
  const before = await pool.query("SELECT count(*)::int AS n FROM clicks WHERE url_id = $1", [link.id]);
  assert.equal(before.rows[0].n, 0);

  await flushClicks();

  const res = await session.client.get(`/api/v1/analytics/links/${link.id}?days=7`).set(session.auth);
  assert.equal(res.status, 200);

  assert.deepEqual(res.body.totals, { clicks: 3, clicksInRange: 3, uniqueVisitors: 2, clicksLast24h: 3 });
  assert.equal(res.body.link.clickCount, 3, "the counter on the link must match the click rows");

  assert.equal(res.body.timeseries.length, 7, "one entry per day, including days with no clicks");
  assert.deepEqual(res.body.timeseries.at(-1), { date: today(), clicks: 3 });
  assert.equal(res.body.timeseries[0].clicks, 0);

  const { devices, browsers, operatingSystems, referrers, countries } = res.body.breakdowns;
  assert.deepEqual(devices, [{ name: "Desktop", clicks: 2 }, { name: "Mobile", clicks: 1 }]);
  assert.deepEqual(browsers, [{ name: "Chrome", clicks: 2 }, { name: "Mobile Safari", clicks: 1 }]);
  assert.deepEqual(operatingSystems, [{ name: "Windows", clicks: 2 }, { name: "iOS", clicks: 1 }]);
  assert.deepEqual(referrers, [{ name: "Direct", clicks: 2 }, { name: "reddit.com", clicks: 1 }]);
  assert.deepEqual(countries, [{ name: "Unknown", clicks: 2 }, { name: "IN", clicks: 1 }]);
});

test("visitor IP addresses are stored only as salted hashes", async () => {
  const session = await signUp();
  const link = await createLink(session);

  await newClient().get(`/${link.shortCode}`);
  await flushClicks();

  const { rows } = await pool.query("SELECT ip_hash FROM clicks WHERE url_id = $1", [link.id]);
  assert.equal(rows.length, 1);
  assert.match(rows[0].ip_hash, /^[0-9a-f]{32}$/);
});

test("bots, link previews and HEAD requests are not counted", async () => {
  const session = await signUp();
  const link = await createLink(session);
  const visitor = newClient();

  await visitor.get(`/${link.shortCode}`).set("User-Agent", "Mozilla/5.0 (compatible; Googlebot/2.1)");
  await visitor.get(`/${link.shortCode}`).set("User-Agent", "WhatsApp/2.23 preview");
  await visitor.head(`/${link.shortCode}`).set("User-Agent", CHROME_ON_WINDOWS);
  await visitor.get(`/${link.shortCode}`).set("User-Agent", CHROME_ON_WINDOWS);
  await flushClicks();

  const res = await session.client.get(`/api/v1/analytics/links/${link.id}`).set(session.auth);
  assert.equal(res.body.totals.clicks, 1);
});

test("clicks for a link deleted before the flush are dropped without breaking the batch", async () => {
  const session = await signUp();
  const kept = await createLink(session);
  const deleted = await createLink(session);
  const visitor = newClient();

  await visitor.get(`/${kept.shortCode}`);
  await visitor.get(`/${deleted.shortCode}`);
  await session.client.delete(`/api/v1/urls/${deleted.id}`).set(session.auth);

  await flushClicks();

  const res = await session.client.get(`/api/v1/analytics/links/${kept.id}`).set(session.auth);
  assert.equal(res.body.totals.clicks, 1);
});

test("the overview adds up all of a user's links", async () => {
  const session = await signUp();
  const popular = await createLink(session);
  const quiet = await createLink(session);
  const visitor = newClient();

  await visitor.get(`/${popular.shortCode}`);
  await visitor.get(`/${popular.shortCode}`);
  await visitor.get(`/${quiet.shortCode}`);
  await session.client.patch(`/api/v1/urls/${quiet.id}`).set(session.auth).send({ isActive: false });
  await flushClicks();

  const res = await session.client.get("/api/v1/analytics/overview?days=30").set(session.auth);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.totals, { links: 2, activeLinks: 1, clicks: 3, clicksInRange: 3 });
  assert.equal(res.body.timeseries.length, 30);
  assert.deepEqual(res.body.timeseries.at(-1), { date: today(), clicks: 3 });
  assert.equal(res.body.topLinks[0].id, popular.id);
  assert.equal(res.body.topLinks[0].clickCount, 2);
});

test("a new account sees zeros, not errors", async () => {
  const session = await signUp();
  const res = await session.client.get("/api/v1/analytics/overview").set(session.auth);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.totals, { links: 0, activeLinks: 0, clicks: 0, clicksInRange: 0 });
  assert.deepEqual(res.body.topLinks, []);
});

test("analytics require sign-in and a sensible range", async () => {
  const session = await signUp();
  assert.equal((await newClient().get("/api/v1/analytics/overview")).status, 401);
  assert.equal((await session.client.get("/api/v1/analytics/overview?days=5000").set(session.auth)).status, 422);
});

test("analytics queries use the (url_id, clicked_at) index", async () => {
  const session = await signUp();
  const link = await createLink(session);

  // With an almost empty table the planner would rightly prefer a sequential
  // scan, so that option is disabled to show the index is usable for this query.
  const client = await pool.connect();
  try {
    await client.query("SET enable_seqscan = off");
    const { rows } = await client.query(
      `EXPLAIN SELECT count(*) FROM clicks WHERE url_id = '${link.id}' AND clicked_at >= now() - interval '7 days'`
    );
    const plan = rows.map((row) => row["QUERY PLAN"]).join("\n");
    assert.match(plan, /clicks_url_id_clicked_at_idx/);
  } finally {
    await client.query("RESET enable_seqscan");
    client.release();
  }
});

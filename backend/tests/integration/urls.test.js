import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../../src/app.js";

let testToken = "";
let createdShortCode = "";
let customAliasCode = "";
let createdUrlId = "";

test("URL Integration Setup — register test user", async () => {
  const user = {
    email: `urltest_${Date.now()}@example.com`,
    password: "Password123!",
  };

  const res = await request(app).post("/api/v1/auth/register").send(user);
  assert.equal(res.status, 201);
  testToken = res.body.accessToken;
});

test("URL Integration — creates anonymous short URL with Base62 code", async () => {
  const res = await request(app)
    .post("/api/v1/urls")
    .send({
      originalUrl: "https://nodejs.org/en/docs",
    });

  assert.equal(res.status, 201);
  assert.ok(res.body.data.shortCode);
  assert.equal(res.body.data.shortCode.length, 7);
  assert.ok(res.body.data.shortUrl);
  createdShortCode = res.body.data.shortCode;
  createdUrlId = res.body.data.id;
});

test("URL Integration — creates authenticated short URL with custom alias", async () => {
  customAliasCode = `alias-${Date.now().toString().slice(-6)}`;
  const res = await request(app)
    .post("/api/v1/urls")
    .set("Authorization", `Bearer ${testToken}`)
    .send({
      originalUrl: "https://drizzle.team",
      customAlias: customAliasCode,
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.data.customAlias, customAliasCode);
});

test("URL Integration — rejects duplicate custom alias with HTTP 409 Conflict", async () => {
  const res = await request(app)
    .post("/api/v1/urls")
    .send({
      originalUrl: "https://other-site.org",
      customAlias: customAliasCode,
    });

  assert.equal(res.status, 409);
});

test("URL Integration — redirects short code with HTTP 302 Found", async () => {
  const res = await request(app).get(`/${createdShortCode}`);

  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "https://nodejs.org/en/docs");
});

test("URL Integration — redirects custom alias with HTTP 302 Found", async () => {
  const res = await request(app).get(`/${customAliasCode}`);

  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "https://drizzle.team");
});

test("URL Integration — non-existent short code returns HTTP 404", async () => {
  const res = await request(app).get("/nonExistent12345");
  assert.equal(res.status, 404);
});

test("URL Integration — generates QR code in PNG and SVG formats", async () => {
  // PNG DataURL format
  const pngRes = await request(app).get(`/api/v1/urls/${createdUrlId}/qr`);
  assert.equal(pngRes.status, 200);
  assert.ok(pngRes.body.dataUrl.startsWith("data:image/png;base64,"));

  // SVG format
  const svgRes = await request(app).get(`/api/v1/urls/${createdUrlId}/qr?format=svg`);
  assert.equal(svgRes.status, 200);
  assert.equal(svgRes.headers["content-type"], "image/svg+xml; charset=utf-8");
  const svgContent = svgRes.text || svgRes.body?.toString() || "";
  assert.ok(svgContent.includes("<svg"));
});

test("URL Integration — lists user URLs with pagination", async () => {
  const res = await request(app)
    .get("/api/v1/urls?page=1&limit=10")
    .set("Authorization", `Bearer ${testToken}`);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.length >= 1);
  assert.ok(res.body.pagination);
});

test("URL Integration — retrieves analytics summary for URL", async () => {
  // Wait 100ms for async click analytics insertion
  await new Promise((r) => setTimeout(r, 150));

  const res = await request(app).get(`/api/v1/analytics/${createdUrlId}/summary`);
  assert.equal(res.status, 200);
  assert.ok(res.body.summary);
  assert.ok(res.body.summary.totalClicks >= 1);
});

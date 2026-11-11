import test from "node:test";
import assert from "node:assert/strict";
import { createLinkBody, isPublicHttpUrl, updateLinkBody } from "../../src/modules/urls/url.validation.js";

test("accepts ordinary public web addresses", () => {
  for (const url of [
    "https://example.com",
    "http://my-blog.org/post/123?ref=social#top",
    "https://sub.domain.co.in/path",
    "https://8.8.8.8/dns",
  ]) {
    assert.equal(isPublicHttpUrl(url), true, url);
  }
});

test("rejects anything that is not http or https", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "ftp://example.com/file",
    "file:///etc/passwd",
    "not a url",
    "",
  ]) {
    assert.equal(isPublicHttpUrl(url), false, url);
  }
});

test("rejects private, loopback and cloud-metadata addresses", () => {
  for (const url of [
    "http://localhost:3000",
    "http://127.0.0.1/admin",
    "http://127.1/admin", // short form of 127.0.0.1
    "http://2130706433/", // 127.0.0.1 written as one number
    "http://0x7f000001/", // 127.0.0.1 in hexadecimal
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.1/internal",
    "http://172.16.5.4/",
    "http://192.168.1.1/router",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://intranet/",
    "http://printer.local/",
    "http://db.internal/",
  ]) {
    assert.equal(isPublicHttpUrl(url), false, url);
  }
});

test("rejects addresses that hide the real host behind a username", () => {
  assert.equal(isPublicHttpUrl("https://google.com@evil.example/login"), false);
  assert.equal(isPublicHttpUrl("https://user:pass@example.com/"), false);
});

test("the stored destination is the normalised form of what was typed", () => {
  const parse = (originalUrl) => createLinkBody.parse({ originalUrl }).originalUrl;

  assert.equal(parse("  HTTPS://Example.COM/Path?q=1  "), "https://example.com/Path?q=1");
  // Line breaks could otherwise be used to smuggle an extra header into the redirect.
  assert.equal(parse("https://example.com/a\r\nSet-Cookie:x=1"), "https://example.com/aSet-Cookie:x=1");
  // Look-alike international names are stored in their unambiguous ASCII form.
  assert.equal(parse("https://аpple.com/"), "https://xn--pple-43d.com/");
});

test("rejects links to the shortener itself (redirect loop)", () => {
  assert.equal(isPublicHttpUrl("http://localhost:5001/abc1234"), false);
});

test("custom alias: length, characters and reserved names", () => {
  const valid = (customAlias) =>
    createLinkBody.safeParse({ originalUrl: "https://example.com", customAlias }).success;

  assert.equal(valid("my-link_2026"), true);
  assert.equal(valid("ab"), false, "too short");
  assert.equal(valid("a".repeat(31)), false, "too long");
  assert.equal(valid("has space"), false);
  assert.equal(valid("slash/inside"), false);
  for (const reserved of ["api", "login", "Dashboard", "HEALTH", "links"]) {
    assert.equal(valid(reserved), false, `${reserved} is reserved`);
  }
});

test("expiry must be a future ISO date", () => {
  const valid = (expiresAt) =>
    createLinkBody.safeParse({ originalUrl: "https://example.com", expiresAt }).success;

  assert.equal(valid(new Date(Date.now() + 60_000).toISOString()), true);
  assert.equal(valid(new Date(Date.now() - 60_000).toISOString()), false);
  assert.equal(valid("tomorrow"), false);
});

test("an update must change at least one field, and may clear the expiry", () => {
  assert.equal(updateLinkBody.safeParse({}).success, false);
  assert.equal(updateLinkBody.safeParse({ isActive: false }).success, true);
  assert.equal(updateLinkBody.safeParse({ expiresAt: null }).success, true);
  assert.equal(updateLinkBody.safeParse({ originalUrl: "http://localhost" }).success, false);
});

test("unknown fields are dropped, so a client cannot set columns it should not", () => {
  const parsed = createLinkBody.parse({
    originalUrl: "https://example.com",
    userId: "someone-else",
    clickCount: 999,
  });
  assert.deepEqual(Object.keys(parsed), ["originalUrl"]);
});

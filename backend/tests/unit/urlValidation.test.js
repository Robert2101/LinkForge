import test from "node:test";
import assert from "node:assert/strict";
import { createUrlSchema } from "../../src/modules/urls/url.validation.js";

test("URL Validation — allows valid HTTP/HTTPS URLs", async () => {
  const validInputs = [
    { body: { originalUrl: "https://example.com" } },
    { body: { originalUrl: "http://my-blog.org/post/123?ref=social" } },
    { body: { originalUrl: "https://github.com/torvalds/linux", customAlias: "linux-kernel" } },
  ];

  for (const input of validInputs) {
    const parsed = await createUrlSchema.safeParseAsync(input);
    assert.equal(parsed.success, true, `Expected valid: ${input.body.originalUrl}`);
  }
});

test("URL Validation — rejects SSRF / internal loopback and metadata addresses", async () => {
  const ssrfTargets = [
    "http://localhost:3000",
    "http://127.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data", // Cloud metadata
    "http://192.168.1.1/router",
    "http://10.0.0.1/internal",
    "ftp://example.com/file", // Non-http/https protocol
    "javascript:alert(1)",
  ];

  for (const target of ssrfTargets) {
    const parsed = await createUrlSchema.safeParseAsync({ body: { originalUrl: target } });
    assert.equal(parsed.success, false, `Expected rejection for SSRF target: ${target}`);
  }
});

test("URL Validation — rejects reserved aliases", async () => {
  const reservedAliases = ["api", "health", "auth", "admin", "dashboard", "docs"];

  for (const alias of reservedAliases) {
    const parsed = await createUrlSchema.safeParseAsync({
      body: { originalUrl: "https://example.com", customAlias: alias },
    });
    assert.equal(parsed.success, false, `Expected rejection for reserved alias: ${alias}`);
  }
});

test("URL Validation — enforces alias length and characters", async () => {
  // Too short
  const short = await createUrlSchema.safeParseAsync({
    body: { originalUrl: "https://example.com", customAlias: "ab" },
  });
  assert.equal(short.success, false);

  // Invalid characters
  const invalidChars = await createUrlSchema.safeParseAsync({
    body: { originalUrl: "https://example.com", customAlias: "my alias!" },
  });
  assert.equal(invalidChars.success, false);
});

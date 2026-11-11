import test from "node:test";
import assert from "node:assert/strict";
import { generateShortCode, SHORT_CODE_PATTERN } from "../../src/modules/urls/shortCode.js";

test("generates 7 characters by default and honours a custom length", () => {
  assert.equal(generateShortCode().length, 7);
  assert.equal(generateShortCode(12).length, 12);
});

test("uses only letters and digits", () => {
  for (let i = 0; i < 500; i++) {
    assert.match(generateShortCode(), /^[0-9a-zA-Z]{7}$/);
  }
});

test("every generated code is a valid short code", () => {
  for (let i = 0; i < 500; i++) {
    assert.match(generateShortCode(), SHORT_CODE_PATTERN);
  }
});

test("20,000 codes contain no duplicates", () => {
  const codes = new Set();
  for (let i = 0; i < 20_000; i++) codes.add(generateShortCode());
  assert.equal(codes.size, 20_000);
});

test("characters are evenly distributed (no modulo bias)", () => {
  const counts = new Map();
  const total = 62_000 * 7;
  for (let i = 0; i < 62_000; i++) {
    for (const char of generateShortCode()) counts.set(char, (counts.get(char) ?? 0) + 1);
  }

  assert.equal(counts.size, 62, "all 62 characters should appear");
  const expected = total / 62;
  for (const [char, count] of counts) {
    const deviation = Math.abs(count - expected) / expected;
    assert.ok(deviation < 0.08, `"${char}" appeared ${count} times, expected about ${expected}`);
  }
});

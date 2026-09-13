import test from "node:test";
import assert from "node:assert/strict";
import { generateShortCode } from "../../src/modules/urls/base62.js";

test("Base62 Generator — generates 7-character short codes by default", () => {
  const code = generateShortCode();
  assert.equal(code.length, 7);
});

test("Base62 Generator — custom length works correctly", () => {
  const code8 = generateShortCode(8);
  const code10 = generateShortCode(10);
  assert.equal(code8.length, 8);
  assert.equal(code10.length, 10);
});

test("Base62 Generator — only contains valid Base62 characters [0-9a-zA-Z]", () => {
  const base62Regex = /^[0-9a-zA-Z]+$/;
  for (let i = 0; i < 100; i++) {
    const code = generateShortCode(7);
    assert.match(code, base62Regex);
  }
});

test("Base62 Generator — high entropy: 10,000 generated codes are all unique", () => {
  const set = new Set();
  const iterations = 10000;
  for (let i = 0; i < iterations; i++) {
    set.add(generateShortCode(7));
  }
  assert.equal(set.size, iterations, "Expected zero collisions in 10,000 Base62 generations");
});

import { describe, expect, it } from "vitest";
import { axisTicks, isExpired, toLocalInputValue, withScheme, withoutScheme } from "./format.js";

describe("withScheme", () => {
  it("adds https:// when the scheme is missing", () => {
    expect(withScheme("example.com/page")).toBe("https://example.com/page");
    expect(withScheme("  example.com  ")).toBe("https://example.com");
  });

  it("leaves an existing scheme alone, so the server can judge it", () => {
    expect(withScheme("http://example.com")).toBe("http://example.com");
    expect(withScheme("javascript:alert(1)")).toBe("javascript:alert(1)");
  });

  it("keeps an empty value empty", () => {
    expect(withScheme("   ")).toBe("");
  });
});

describe("withoutScheme", () => {
  it("drops the scheme and www", () => {
    expect(withoutScheme("https://www.example.com/a?b=1")).toBe("example.com/a?b=1");
    expect(withoutScheme("http://localhost:5001/abc")).toBe("localhost:5001/abc");
  });
});

describe("axisTicks", () => {
  it("ends on a round number at or above the largest value", () => {
    expect(axisTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(axisTicks(130)).toEqual([0, 50, 100, 150]);
    expect(axisTicks(1000)).toEqual([0, 500, 1000]);
  });

  it("still draws an axis when there is nothing to show", () => {
    expect(axisTicks(0)).toEqual([0, 1]);
    expect(axisTicks(3)).toEqual([0, 1, 2, 3]);
  });

  it("never produces more than six ticks", () => {
    for (const max of [1, 9, 11, 99, 101, 4999, 123456]) {
      const ticks = axisTicks(max);
      expect(ticks.length).toBeLessThanOrEqual(6);
      expect(ticks.at(-1)).toBeGreaterThanOrEqual(max);
    }
  });
});

describe("isExpired", () => {
  it("is false without an expiry and true once it has passed", () => {
    expect(isExpired({ expiresAt: null })).toBe(false);
    expect(isExpired({ expiresAt: new Date(Date.now() + 60_000).toISOString() })).toBe(false);
    expect(isExpired({ expiresAt: new Date(Date.now() - 60_000).toISOString() })).toBe(true);
  });
});

describe("toLocalInputValue", () => {
  it("round-trips through a datetime-local input", () => {
    const iso = "2027-03-05T10:30:00.000Z";
    const inputValue = toLocalInputValue(iso);
    expect(inputValue).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(new Date(inputValue).toISOString()).toBe(iso);
  });

  it("is empty when there is no date", () => {
    expect(toLocalInputValue(null)).toBe("");
  });
});

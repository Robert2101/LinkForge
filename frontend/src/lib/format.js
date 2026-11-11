// Formatting helpers. Everything goes through Intl so numbers and dates follow
// the visitor's own locale.

const wholeNumber = new Intl.NumberFormat();
const compactNumber = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

// 1284 -> "1,284"    12900 -> "12.9K"
export function formatCount(value) {
  return value >= 10_000 ? compactNumber.format(value) : wholeNumber.format(value);
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

// Analytics days are UTC calendar days ("2026-11-10"), so they are shown in UTC too.
const dayFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

export const formatDate = (value) => dateFormat.format(new Date(value));
export const formatDateTime = (value) => dateTimeFormat.format(new Date(value));
export const formatDay = (isoDay) => dayFormat.format(new Date(`${isoDay}T00:00:00Z`));

// "https://www.example.com/a/b?c=1" -> "example.com/a/b?c=1"
export function withoutScheme(url) {
  return url.replace(/^https?:\/\/(www\.)?/, "");
}

// People type "example.com". Treat that as "https://example.com".
export function withScheme(input) {
  const value = input.trim();
  if (value === "" || /^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return `https://${value}`;
}

// Value for <input type="datetime-local"> from an ISO string, in local time.
export function toLocalInputValue(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function isExpired(link) {
  return Boolean(link.expiresAt) && new Date(link.expiresAt) <= new Date();
}

// A y-axis that ends on a round number, with at most five steps.
// 7 -> [0, 2, 4, 6, 8]     130 -> [0, 50, 100, 150]
export function axisTicks(maxValue) {
  const target = Math.max(maxValue, 4) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= target);
  const top = Math.ceil(Math.max(maxValue, 1) / step) * step;
  const ticks = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return ticks;
}

// "IN" -> "India". Falls back to the code if the browser does not know it.
const regionNames = new Intl.DisplayNames(undefined, { type: "region" });
export function countryName(code) {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

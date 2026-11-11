import crypto from "node:crypto";
import { UAParser } from "ua-parser-js";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { analyticsRepository } from "./analytics.repository.js";

// Click recording, kept off the redirect path.
//
// Writing to Postgres on every redirect would make each visitor wait for a
// database write, and would cost two queries per click. Instead a redirect only
// pushes a small object onto an in-memory list (microseconds). Every couple of
// seconds the list is written to Postgres in ONE query, however many clicks
// it holds.
//
// The trade-off: if the process is killed without warning, the clicks of the
// last two seconds are lost. A missing click is acceptable; a slow or failed
// redirect is not. On a normal shutdown the buffer is flushed first (server.js).

const FLUSH_INTERVAL_MS = 2_000;
const FLUSH_WHEN_BUFFERED = 500; // do not wait for the timer during a traffic spike
const MAX_BUFFERED = 20_000; // hard cap so a database outage cannot exhaust memory

const OWN_HOST = new URL(env.BASE_URL).hostname;

// Link previews (WhatsApp, Slack, ...) and crawlers fetch the link but are not visitors.
const BOT_PATTERN = /bot|crawler|spider|preview|facebookexternalhit|slurp|headless/i;

let buffer = [];
let flushTimer = null;

// The raw IP address is never stored. A salted hash is enough to tell
// "same visitor again" from "new visitor", and cannot be turned back into an IP
// without the secret salt.
function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash("sha256").update(env.IP_HASH_SALT + ip).digest("hex").slice(0, 32);
}

// Keep only the site the visitor came from ("news.ycombinator.com"), never the
// full address, which can contain private details.
function referrerHost(header) {
  if (!header) return null;
  try {
    const host = new URL(header).hostname.replace(/^www\./, "");
    return host && host !== OWN_HOST ? host.slice(0, 255) : null;
  } catch {
    return null;
  }
}

function deviceType(parsedType) {
  if (parsedType === "mobile") return "Mobile";
  if (parsedType === "tablet") return "Tablet";
  return "Desktop";
}

export function recordClick(urlId, req) {
  const userAgent = req.get("user-agent") ?? "";
  if (BOT_PATTERN.test(userAgent)) return;

  if (buffer.length >= MAX_BUFFERED) return; // the database is down; drop instead of crashing

  const { browser, os, device } = UAParser(userAgent);

  // Set by Cloudflare (and most CDNs) in front of the app. Absent locally.
  const countryHeader = req.get("cf-ipcountry") ?? "";
  const country = /^[A-Z]{2}$/.test(countryHeader) && countryHeader !== "XX" ? countryHeader : null;

  buffer.push({
    urlId,
    clickedAt: new Date().toISOString(),
    ipHash: hashIp(req.ip),
    browser: browser.name?.slice(0, 64) ?? null,
    os: os.name?.slice(0, 64) ?? null,
    device: deviceType(device.type),
    referrer: referrerHost(req.get("referer")),
    country,
  });

  // The timer starts with the first click and does not keep the process alive.
  flushTimer ??= setInterval(flushClicks, FLUSH_INTERVAL_MS).unref();
  if (buffer.length >= FLUSH_WHEN_BUFFERED) flushClicks();
}

// Writes everything buffered so far. Safe to call at any time.
export async function flushClicks() {
  if (buffer.length === 0) return;

  const batch = buffer;
  buffer = [];

  try {
    await analyticsRepository.insertClicks(batch);
  } catch (err) {
    logger.error({ err: err.message, clicks: batch.length }, "Could not save clicks, will retry");
    // Put the batch back in front so it is retried on the next flush.
    buffer = batch.concat(buffer).slice(0, MAX_BUFFERED);
  }
}

// Called on shutdown so buffered clicks are not lost on a deploy.
export async function stopClickRecorder() {
  clearInterval(flushTimer);
  flushTimer = null;
  await flushClicks();
}

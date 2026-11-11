import { env } from "../../config/env.js";
import { recordClick } from "../analytics/clickRecorder.js";
import { SHORT_CODE_PATTERN } from "./shortCode.js";
import { urlService } from "./url.service.js";

// GET /:code
// The hot path of the whole service: look the code up (Redis first, then
// Postgres), queue the click for analytics, redirect. The click is NOT written
// to the database here; see clickRecorder.js.

const APP_URL = env.CORS_ORIGIN.split(",")[0].trim();

const escapeHtml = (text) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

// People who follow a dead short link are in a browser, so they get a small
// readable page. Scripts and API clients get JSON.
function sendProblem(req, res, status, title, message) {
  res.status(status).set("Cache-Control", "no-store");

  if (req.accepts(["json", "html"]) !== "html") {
    return res.json({ error: { code: status === 410 ? "GONE" : "NOT_FOUND", message } });
  }

  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} | LinkForge</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
         font: 16px/1.5 system-ui, sans-serif; background: #eef1f4; color: #16202b; }
  main { max-width: 440px; }
  h1 { font-size: 28px; line-height: 1.15; margin: 0 0 12px; }
  p { margin: 0 0 24px; color: #4b5a69; }
  a { color: #16202b; font-weight: 600; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  <a href="${escapeHtml(APP_URL)}">Go to LinkForge</a>
</main>
</body>
</html>`);
}

export async function redirectShortLink(req, res) {
  const { code } = req.params;

  // Anything that cannot be a short code is rejected before any lookup.
  if (!SHORT_CODE_PATTERN.test(code)) {
    return sendProblem(req, res, 404, "This link does not exist", "Check the address for typos.");
  }

  const { link, cache } = await urlService.resolveShortCode(code);
  res.set("X-Cache", cache);

  if (!link) {
    return sendProblem(req, res, 404, "This link does not exist", "Check the address for typos.");
  }
  if (!link.isActive) {
    return sendProblem(req, res, 404, "This link is paused", "Its owner has switched it off for now.");
  }
  if (link.expiresAt && new Date(link.expiresAt) <= new Date()) {
    return sendProblem(req, res, 410, "This link has expired", "Ask the person who shared it for a new one.");
  }

  // HEAD requests come from link checkers, not from people opening the link.
  if (req.method === "GET") recordClick(link.id, req);

  // 302 (temporary) plus no-store: browsers must ask us every time. That keeps
  // click counts accurate and lets the owner change, pause or expire the link.
  // A 301 would be cached by browsers forever and bypass all of that.
  res.set("Cache-Control", "no-store");
  res.redirect(302, link.originalUrl);
}

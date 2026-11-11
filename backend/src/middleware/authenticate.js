import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { unauthorized } from "../lib/errors.js";

// Reads "Authorization: Bearer <access token>" and returns the signed-in
// user, or null when no token was sent. A token that is present but invalid
// or expired is always an error, so the browser knows to refresh it.
function readUser(req) {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) throw unauthorized("Malformed Authorization header");

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
    return { id: payload.sub };
  } catch {
    throw unauthorized("Session expired. Sign in again.");
  }
}

// The route only works for signed-in users.
export function requireAuth(req, res, next) {
  req.user = readUser(req);
  if (!req.user) throw unauthorized();
  next();
}

// The route works for everyone; req.user is set when the caller is signed in.
export function optionalAuth(req, res, next) {
  req.user = readUser(req);
  next();
}

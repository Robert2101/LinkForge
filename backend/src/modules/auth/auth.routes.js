import { Router } from "express";
import { env } from "../../config/env.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { validate } from "../../middleware/validate.js";
import { authService } from "./auth.service.js";
import { loginBody, registerBody } from "./auth.validation.js";

const router = Router();

const REFRESH_COOKIE = "refresh_token";
const refreshCookieOptions = {
  httpOnly: true, // not readable from JavaScript, so XSS cannot steal it
  secure: env.BASE_URL.startsWith("https://"),
  sameSite: "strict", // never sent on requests started by another site (CSRF)
  path: "/api/v1/auth", // only travels to the auth endpoints
  maxAge: authService.refreshTokenTtlMs,
};

// Password guessing is slowed in two ways:
//   per IP address   10 attempts per 15 minutes, against one machine trying many accounts
//   per account      20 attempts per 15 minutes, against many machines trying one account
const credentialsLimit = rateLimit({ name: "auth", limit: 10, windowSeconds: 15 * 60 });
const perAccountLimit = rateLimit({
  name: "login-account",
  limit: 20,
  windowSeconds: 15 * 60,
  keyBy: (req) => req.valid.body.email,
});

// The refresh token goes into the cookie, everything else into the JSON body.
function sendSession(res, status, { user, accessToken, refreshToken }) {
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
  res.status(status).json({ user, accessToken });
}

router.post("/register", credentialsLimit, validate({ body: registerBody }), async (req, res) => {
  sendSession(res, 201, await authService.register(req.valid.body));
});

router.post("/login", credentialsLimit, validate({ body: loginBody }), perAccountLimit, async (req, res) => {
  sendSession(res, 200, await authService.login(req.valid.body));
});

// Called by the browser on page load and whenever the access token expires.
router.post("/refresh", async (req, res) => {
  sendSession(res, 200, await authService.refresh(req.cookies[REFRESH_COOKIE]));
});

router.post("/logout", async (req, res) => {
  await authService.logout(req.cookies[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, { path: refreshCookieOptions.path });
  res.status(204).end();
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: await authService.getUser(req.user.id) });
});

export default router;

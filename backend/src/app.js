import crypto from "node:crypto";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";

import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { errorHandler, routeNotFound } from "./middleware/errorHandler.js";
import healthRoutes from "./modules/health/health.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import analyticsRoutes from "./modules/analytics/analytics.routes.js";
import { qrRouter, urlRouter } from "./modules/urls/url.routes.js";
import { redirectShortLink } from "./modules/urls/redirect.js";

// Builds the Express app: the order of the lines below is the order in which
// every request passes through them. The app is exported without listening on
// a port so tests can drive it directly (see server.js for the listener).

const app = express();

// Behind nginx or a load balancer, the visitor's address arrives in the
// X-Forwarded-For header. Trust exactly as many proxies as we actually run,
// otherwise a client could forge that header to dodge rate limits.
app.set("trust proxy", env.TRUST_PROXY);

// Security headers: no MIME sniffing, no framing, strict CSP, HSTS, and more.
app.use(helmet());

// One log line per request, each with an id that is also returned to the
// client so a bug report can be matched to its log entry.
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = crypto.randomUUID();
      res.setHeader("X-Request-Id", id);
      return id;
    },
    autoLogging: { ignore: (req) => req.url === "/health" },
  })
);

app.use(healthRoutes);

// ---------------------------------------------------------------------------
// JSON API: /api/v1/...
// ---------------------------------------------------------------------------
const api = express.Router();

// Only the listed web origins may call the API from a browser, and they may
// send the refresh-token cookie.
api.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: true,
    maxAge: 600,
  })
);

// A general ceiling per IP address; sensitive routes add stricter limits of their own.
api.use(rateLimit({ name: "api", limit: 300, windowSeconds: 60 }));

// Small body limit: nothing this API accepts is larger than a URL.
api.use(express.json({ limit: "10kb" }));
api.use(cookieParser());

api.use("/auth", authRoutes);
api.use("/urls", urlRouter);
api.use("/qr", qrRouter);
api.use("/analytics", analyticsRoutes);

app.use("/api/v1", api);

// ---------------------------------------------------------------------------
// Short links: GET /:code
// ---------------------------------------------------------------------------
app.get(
  "/:code",
  rateLimit({ name: "redirect", limit: 600, windowSeconds: 60 }),
  redirectShortLink
);

app.use(routeNotFound);
app.use(errorHandler);

export default app;

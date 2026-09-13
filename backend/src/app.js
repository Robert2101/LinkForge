import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";

import { env } from "./config/env.js";
import { query } from "./lib/db.js";
import { redis } from "./lib/redis.js";
import { logger } from "./lib/logger.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { rateLimiter } from "./middleware/rateLimiter.js";
import apiRoutes from "./routes/index.js";
import { redirectController } from "./modules/urls/redirect.controller.js";

const app = express();

// Security headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// CORS configuration supporting credentials (cookies)
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);

// Structured HTTP request logging
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === "/health",
    },
  })
);

// Parsers
app.use(cookieParser(env.COOKIE_SECRET));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ---------------------------------------------------------------------------
// Deep Health Check Endpoint
// ---------------------------------------------------------------------------
app.get("/health", async (req, res) => {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: { status: "unknown" },
    redis: { status: "unknown" },
  };

  let isDegraded = false;

  // Check PostgreSQL
  try {
    const dbStart = Date.now();
    await query("SELECT 1;");
    health.database = {
      status: "connected",
      latencyMs: Date.now() - dbStart,
    };
  } catch (error) {
    health.database = {
      status: "disconnected",
      error: error.message,
    };
    isDegraded = true;
  }

  // Check Redis
  try {
    const isHealthy = await redis.isHealthy();
    health.redis = {
      status: isHealthy ? "connected" : "fallback_mode",
    };
  } catch {
    health.redis = { status: "error" };
  }

  const statusCode = isDegraded ? 503 : 200;
  if (isDegraded) health.status = "degraded";

  res.status(statusCode).json(health);
});

// ---------------------------------------------------------------------------
// API v1 Modules
// ---------------------------------------------------------------------------
app.use("/api/v1", apiRoutes);

// ---------------------------------------------------------------------------
// Top-Level Public Short URL Redirection (GET /:code)
// ---------------------------------------------------------------------------
const redirectLimiter = rateLimiter({
  limit: 1000,
  windowSeconds: 60,
  prefix: "rl:redirect",
});

app.get("/:code", redirectLimiter, redirectController.redirect);

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------
app.use(notFound);
app.use(errorHandler);

export default app;

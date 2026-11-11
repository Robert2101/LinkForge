import { z } from "zod";

// Every setting the backend reads from the environment is declared here.
// The app refuses to start if something is missing or malformed, so a bad
// deployment fails immediately instead of failing on the first request.

const isProduction = process.env.NODE_ENV === "production";

// Secrets have a built-in value in development and tests so the project runs
// with zero setup. In production there is no default: they must be provided.
function secret(name) {
  const schema = z.string().min(32, `${name} must be at least 32 characters`);
  return isProduction
    ? schema
    : schema.default(`dev-only-${name}-not-for-production-use`);
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5001),

  // Public address of this service. Short links are built from it.
  BASE_URL: z.url().default("http://localhost:5001"),

  // Browser origins allowed to call the API (comma separated).
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  // Number of reverse proxies in front of the app (nginx, a load balancer).
  // Needed so req.ip is the real visitor and not the proxy. 0 = no proxy.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),

  // How to reach PostgreSQL. "pg" is the standard protocol on port 5432.
  // "neon-websocket" tunnels over port 443 for networks that block 5432
  // (Neon databases only). See src/db/connect.js.
  DATABASE_DRIVER: z.enum(["pg", "neon-websocket"]).default("pg"),

  // Optional. Without Redis the app still works: redirects read from
  // Postgres and rate limiting falls back to a per-process counter.
  REDIS_URL: z.string().optional(),

  JWT_ACCESS_SECRET: secret("JWT_ACCESS_SECRET"),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(7),

  // Mixed into visitor IP hashes so raw IPs are never stored.
  IP_HASH_SALT: secret("IP_HASH_SALT"),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

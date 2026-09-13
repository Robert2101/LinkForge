import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5001),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BASE_URL: z.string().url().default("http://localhost:5001"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  JWT_ACCESS_SECRET: z
    .string()
    .min(16, "JWT_ACCESS_SECRET must be at least 16 characters")
    .default("linkforge-dev-access-super-secret-key-32chars!"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16, "JWT_REFRESH_SECRET must be at least 16 characters")
    .default("linkforge-dev-refresh-super-secret-key-32chars!"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  COOKIE_SECRET: z
    .string()
    .min(16)
    .default("linkforge-dev-cookie-secret-min16chars!"),
  REDIS_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
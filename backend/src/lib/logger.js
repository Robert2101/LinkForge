import pino from "pino";
import { env } from "../config/env.js";

const defaultLevel = {
  development: "debug",
  test: "silent",
  production: "info",
}[env.NODE_ENV];

// JSON logs in production (for log collectors), readable logs in development.
export const logger = pino({
  level: env.LOG_LEVEL ?? defaultLevel,
  redact: ["req.headers.authorization", "req.headers.cookie"],
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
      : undefined,
});

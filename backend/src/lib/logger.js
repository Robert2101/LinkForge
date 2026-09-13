import pino from "pino";
import { env } from "../config/env.js";

const isDev = env.NODE_ENV === "development";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : isDev ? "debug" : "info",
  redact: ["req.headers.authorization", "req.headers.cookie", "password", "passwordHash"],
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});

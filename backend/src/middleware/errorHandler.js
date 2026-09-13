import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";

export function errorHandler(err, req, res, next) {
  let statusCode = 500;
  let message = "Internal server error";
  let details = null;
  let code = "INTERNAL_ERROR";

  // 1. Custom Domain Errors
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
    code = err.name;
  }
  // 2. PostgreSQL Unique Constraint Violation (Code 23505)
  else if (err.code === "23505") {
    statusCode = 409;
    message = "A resource with this identifier or unique attribute already exists";
    code = "UNIQUE_VIOLATION";
    details = err.detail || null;
  }
  // 3. PostgreSQL Foreign Key Violation (Code 23503)
  else if (err.code === "23503") {
    statusCode = 400;
    message = "Referenced resource does not exist";
    code = "FOREIGN_KEY_VIOLATION";
  }
  // 4. JSON Syntax Error from body-parser
  else if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    statusCode = 400;
    message = "Malformed JSON payload";
    code = "INVALID_JSON";
  }

  // Structured Logging via Pino
  const logPayload = {
    statusCode,
    code,
    message: err.message,
    path: req.originalUrl || req.url,
    method: req.method,
    ip: req.ip,
  };

  if (statusCode >= 500) {
    logger.error({ ...logPayload, stack: err.stack }, "Unhandled Server Error");
  } else {
    logger.warn(logPayload, "Client Handled Error");
  }

  const responseBody = {
    error: {
      message: statusCode === 500 && env.NODE_ENV === "production" ? "Internal server error" : message,
      code,
      details,
      ...(env.NODE_ENV === "development" && statusCode === 500 ? { stack: err.stack } : {}),
    },
  };

  res.status(statusCode).json(responseBody);
}

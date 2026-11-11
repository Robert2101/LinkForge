import { AppError, notFound } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

// Runs when no route matched.
export function routeNotFound(req, res, next) {
  next(notFound(`No route for ${req.method} ${req.path}`));
}

// Errors that do not come from our own code but still have a clear meaning.
function translate(err) {
  if (err instanceof AppError) return err;
  if (err.type === "entity.parse.failed") return new AppError(400, "INVALID_JSON", "Request body is not valid JSON");
  if (err.type === "entity.too.large") return new AppError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
  return null;
}

// The single place where an error becomes an HTTP response.
// Express 5 sends rejected promises here automatically, so route handlers
// simply `throw` and need no try/catch.
// (Express recognises an error handler by its four arguments, so `next` must stay.)
export function errorHandler(err, req, res, next) {
  const known = translate(err);

  if (!known) {
    // A bug or an outage. Log everything, tell the client nothing internal.
    (req.log ?? logger).error({ err }, "Unhandled error");
    return res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong on our side. Try again shortly." },
    });
  }

  res.status(known.status).json({
    error: { code: known.code, message: known.message, details: known.details },
  });
}

// One error type for everything the API reports to a client.
// The error handler turns it into: { "error": { code, message, details } }
export class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Small helpers so call sites read like a sentence: `throw notFound("Link not found")`.
export const badRequest = (message, details) => new AppError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Sign in to continue") => new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You do not have access to this resource") => new AppError(403, "FORBIDDEN", message);
export const notFound = (message = "Not found") => new AppError(404, "NOT_FOUND", message);
export const conflict = (message) => new AppError(409, "CONFLICT", message);
export const gone = (message) => new AppError(410, "GONE", message);
export const validationFailed = (details) => new AppError(422, "VALIDATION_FAILED", "Some fields are invalid", details);
export const tooManyRequests = (retryAfterSeconds) =>
  new AppError(429, "RATE_LIMITED", `Too many requests. Try again in ${retryAfterSeconds} seconds.`, { retryAfterSeconds });

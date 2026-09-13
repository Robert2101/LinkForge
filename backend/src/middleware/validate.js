import { ValidationError } from "../lib/errors.js";

/**
 * Middleware factory to validate request against Zod schemas.
 * @param {Object} schemas - Optional { body, query, params } Zod schemas
 */
export function validate(schemas = {}) {
  return async (req, res, next) => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query);
      }
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params);
      }
      next();
    } catch (error) {
      if (error.issues) {
        const formatted = error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        }));
        return next(new ValidationError("Request validation failed", formatted));
      }
      next(error);
    }
  };
}

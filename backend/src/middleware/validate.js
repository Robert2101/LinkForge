import { validationFailed } from "../lib/errors.js";

// Checks the request against Zod schemas before the route handler runs.
//
//   router.post("/", validate({ body: createLinkBody }), handler)
//
// The cleaned, typed values are placed on req.valid (req.valid.body,
// req.valid.query, req.valid.params). Handlers read from there, so they
// never touch unvalidated input.
export function validate(schemas) {
  return function validateRequest(req, res, next) {
    const valid = {};
    const problems = [];

    for (const part of ["params", "query", "body"]) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        valid[part] = result.data;
        continue;
      }
      for (const issue of result.error.issues) {
        problems.push({ field: issue.path.join(".") || part, message: issue.message });
      }
    }

    if (problems.length > 0) return next(validationFailed(problems));

    req.valid = valid;
    next();
  };
}

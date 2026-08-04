/**
 * validate(schema) — Express middleware factory
 *
 * Validates req.body against the provided Zod schema.
 * On failure: returns 400 with an array of field-level error objects so the
 * frontend can display per-field messages without parsing a blob of text.
 *
 * Example:
 *   router.post('/', validate(schemas.taskCreate), handler)
 */

const { ZodError } = require('zod');

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      // Zod v4 uses .issues; v3 used .errors — support both
      const issues = result.error.issues ?? result.error.errors ?? [];
      const errors = issues.map((e) => ({
        field:   e.path.join('.') || 'body',
        message: e.message,
      }));

      return res.status(400).json({ errors });
    }

    // Replace req.body with the parsed (and coerced/stripped) data so routes
    // always see clean, typed values.
    req.body = result.data;
    next();
  };
}

module.exports = validate;

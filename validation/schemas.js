/**
 * Zod schemas for every mutating route in the API.
 *
 * Length limits are chosen to be generous enough for real use but tight enough
 * to reject obviously malformed payloads and to fit within the DB column types.
 *
 * Enums mirror the values used in the Prisma schema so a mismatch is caught
 * at the validation layer before the query even runs.
 *
 * ── Zod v4 trim/min ordering note ────────────────────────────────────────────
 * In Zod v4, .trim() is a transform that runs *after* any preceding checks.
 * Writing .min(1).trim() means the min-length check fires on the raw
 * (untrimmed) value, so "   " (three spaces) passes .min(1) and is accepted.
 *
 * The correct pattern for "non-blank required string" is:
 *   z.string().trim().refine(v => v.length >= 1, 'message')
 * which trims first, then checks length on the cleaned value.
 *
 * This is applied to every required string field below.
 * Optional/nullable string fields with only an upper bound (description) are
 * not affected — they have no min check, so trim order doesn't matter.
 */

const { z } = require('zod');

// ─── Reusable builder for "required, non-blank string with a max length" ──────
//
// Trim first, then reject whitespace-only, then enforce the upper bound.
// Returns a ZodEffects chain that produces a trimmed string on success.

function nonBlankString(maxLen, { requiredMsg, maxMsg } = {}) {
  return z.string()
    .trim()
    .refine((v) => v.length >= 1,   requiredMsg ?? 'This field is required')
    .refine((v) => v.length <= maxLen, maxMsg ?? `Must be ${maxLen} characters or fewer`);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

const register = z.object({
  email:    z.string().email('Must be a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name:     nonBlankString(100, { requiredMsg: 'Name is required', maxMsg: 'Name must be 100 characters or fewer' }),
  teamName: nonBlankString(100).optional(),
});

const login = z.object({
  email:    z.string().email('Must be a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const forgotPassword = z.object({
  email: z.string().email('Must be a valid email address'),
});

const resetPassword = z.object({
  token:    z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// ─── Tasks ────────────────────────────────────────────────────────────────────

const taskCreate = z.object({
  title:       nonBlankString(200, { requiredMsg: 'Title is required', maxMsg: 'Title must be 200 characters or fewer' }),
  // description has no min — trim only, so ordering doesn't matter here
  description: z.string().trim().max(5000, 'Description must be 5000 characters or fewer').optional(),
  assigneeId:  z.string().uuid('assigneeId must be a valid UUID').optional().nullable(),
});

const taskUpdate = z.object({
  title:       nonBlankString(200, { requiredMsg: 'Title cannot be blank', maxMsg: 'Title must be 200 characters or fewer' }).optional(),
  // description has no min — trim only
  description: z.string().trim().max(5000, 'Description must be 5000 characters or fewer').optional().nullable(),
  status:      z.enum(['todo', 'in_progress', 'done'], {
    errorMap: () => ({ message: 'status must be todo, in_progress, or done' }),
  }).optional(),
  assigneeId:  z.string().uuid('assigneeId must be a valid UUID').optional().nullable(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' },
);

// ─── Comments ─────────────────────────────────────────────────────────────────

const commentCreate = z.object({
  content: nonBlankString(2000, { requiredMsg: 'Comment content is required', maxMsg: 'Comment must be 2000 characters or fewer' }),
});

// ─── Teams ────────────────────────────────────────────────────────────────────

const teamCreate = z.object({
  name: nonBlankString(100, { requiredMsg: 'Team name is required', maxMsg: 'Team name must be 100 characters or fewer' }),
});

const teamJoin = z.object({
  teamName: nonBlankString(100, { requiredMsg: 'teamName is required', maxMsg: 'Team name must be 100 characters or fewer' }),
});

const memberAdd = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
  role:   z.enum(['owner', 'admin', 'member'], {
    errorMap: () => ({ message: 'role must be owner, admin, or member' }),
  }).optional().default('member'),
});

const memberRoleUpdate = z.object({
  role: z.enum(['owner', 'admin', 'member'], {
    errorMap: () => ({ message: 'role must be owner, admin, or member' }),
  }),
});

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  taskCreate,
  taskUpdate,
  commentCreate,
  teamCreate,
  teamJoin,
  memberAdd,
  memberRoleUpdate,
};

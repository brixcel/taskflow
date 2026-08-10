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

const emailSchema = z.string().trim().toLowerCase().email('Must be a valid email address');

const register = z.object({
  email:    emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name:     nonBlankString(100, { requiredMsg: 'Name is required', maxMsg: 'Name must be 100 characters or fewer' }),
  teamName: nonBlankString(100).optional(),
});

const login = z.object({
  email:    emailSchema,
  password: z.string().min(1, 'Password is required'),
});

const forgotPassword = z.object({
  email: emailSchema,
});

const resetPassword = z.object({
  token:    z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const verifyEmail = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

const resendVerification = z.object({
  email: emailSchema,
});

// ─── Tasks ────────────────────────────────────────────────────────────────────

const dueDateSchema = z.preprocess(
  (val) => (val === '' ? null : val),
  z.string()
    .trim()
    .refine((val) => !isNaN(Date.parse(val)), { message: 'dueDate must be a valid date string' })
    .optional()
    .nullable()
);

const prioritySchema = z.enum(['low', 'medium', 'high', 'urgent'], {
  errorMap: () => ({ message: 'priority must be low, medium, high, or urgent' }),
});

const labelsSchema = z.array(
  z.string().trim().min(1, 'Label cannot be empty').max(30, 'Label must be 30 characters or fewer')
).max(15, 'Maximum 15 labels allowed');

const taskCreate = z.object({
  title:       nonBlankString(200, { requiredMsg: 'Title is required', maxMsg: 'Title must be 200 characters or fewer' }),
  description: z.string().trim().max(5000, 'Description must be 5000 characters or fewer').optional(),
  status:      z.enum(['todo', 'in_progress', 'done'], {
    errorMap: () => ({ message: 'status must be todo, in_progress, or done' }),
  }).optional(),
  priority:    prioritySchema.optional(),
  labels:      labelsSchema.optional(),
  order:       z.number().optional(),
  position:    z.number().optional(),
  assigneeId:  z.string().uuid('assigneeId must be a valid UUID').optional().nullable(),
  dueDate:     dueDateSchema,
});

const taskUpdate = z.object({
  title:       nonBlankString(200, { requiredMsg: 'Title cannot be blank', maxMsg: 'Title must be 200 characters or fewer' }).optional(),
  description: z.string().trim().max(5000, 'Description must be 5000 characters or fewer').optional().nullable(),
  status:      z.enum(['todo', 'in_progress', 'done'], {
    errorMap: () => ({ message: 'status must be todo, in_progress, or done' }),
  }).optional(),
  priority:    prioritySchema.optional(),
  labels:      labelsSchema.optional(),
  order:       z.number().optional(),
  position:    z.number().optional(),
  assigneeId:  z.string().uuid('assigneeId must be a valid UUID').optional().nullable(),
  dueDate:     dueDateSchema,
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' },
);

const taskOrder = z.object({
  position: z.number().optional(),
  order:    z.number().optional(),
  status:   z.enum(['todo', 'in_progress', 'done'], {
    errorMap: () => ({ message: 'status must be todo, in_progress, or done' }),
  }).optional(),
}).refine(
  (data) => data.position !== undefined || data.order !== undefined || data.status !== undefined,
  { message: 'position, order, or status must be provided' },
);

const tasksBatchReorder = z.object({
  tasks: z.array(z.object({
    id:       z.string().uuid('id must be a valid UUID'),
    order:    z.number().optional(),
    position: z.number().optional(),
    status:   z.enum(['todo', 'in_progress', 'done']).optional(),
  })).min(1, 'At least one task update must be provided').max(200, 'Maximum 200 updates allowed'),
});

// ─── Comments ─────────────────────────────────────────────────────────────────

const commentCreate = z.object({
  content: nonBlankString(2000, { requiredMsg: 'Comment content is required', maxMsg: 'Comment must be 2000 characters or fewer' }),
});

const commentUpdate = z.object({
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

const analyticsQuery = z.object({
  range: z.enum(['7d', '30d', '90d', 'all'], {
    errorMap: () => ({ message: 'range must be 7d, 30d, 90d, or all' }),
  }).optional().default('30d'),
  userId: z.string().uuid('userId must be a valid UUID').optional(),
});

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  taskCreate,
  taskUpdate,
  taskOrder,
  tasksBatchReorder,
  commentCreate,
  commentUpdate,
  teamCreate,
  teamJoin,
  memberAdd,
  memberRoleUpdate,
  analyticsQuery,
};

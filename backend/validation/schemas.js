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
    .refine((v) => v.length >= 1, requiredMsg ?? 'This field is required')
    .refine((v) => v.length <= maxLen, maxMsg ?? `Must be ${maxLen} characters or fewer`);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

const emailSchema = z.string().trim().toLowerCase().email('Must be a valid email address');

const register = z.object({
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: nonBlankString(100, { requiredMsg: 'Name is required', maxMsg: 'Name must be 100 characters or fewer' }),
  teamName: nonBlankString(100).optional(),
});

const login = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

const forgotPassword = z.object({
  email: emailSchema,
});

const resetPassword = z.object({
  token: z.string().min(1, 'Reset token is required'),
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

const initialSubtaskSchema = z.object({
  title: nonBlankString(200, { requiredMsg: 'Subtask title is required', maxMsg: 'Subtask title must be 200 characters or fewer' }),
  order: z.number().optional(),
});

const taskCreate = z.object({
  title: nonBlankString(200, { requiredMsg: 'Title is required', maxMsg: 'Title must be 200 characters or fewer' }),
  description: z.string().trim().max(5000, 'Description must be 5000 characters or fewer').optional(),
  status: z.enum(['todo', 'in_progress', 'done'], {
    errorMap: () => ({ message: 'status must be todo, in_progress, or done' }),
  }).optional(),
  priority: prioritySchema.optional(),
  labels: labelsSchema.optional(),
  order: z.number().optional(),
  position: z.number().optional(),
  assigneeId: z.string().uuid('assigneeId must be a valid UUID').optional().nullable(),
  projectId: z.string().uuid('projectId must be a valid UUID').optional().nullable(),
  dueDate: dueDateSchema,
  subtasks: z.array(initialSubtaskSchema).max(30, 'Maximum 30 initial subtasks allowed').optional(),
});

const taskUpdate = z.object({
  title: nonBlankString(200, { requiredMsg: 'Title cannot be blank', maxMsg: 'Title must be 200 characters or fewer' }).optional(),
  description: z.string().trim().max(5000, 'Description must be 5000 characters or fewer').optional().nullable(),
  status: z.enum(['todo', 'in_progress', 'done'], {
    errorMap: () => ({ message: 'status must be todo, in_progress, or done' }),
  }).optional(),
  priority: prioritySchema.optional(),
  labels: labelsSchema.optional(),
  order: z.number().optional(),
  position: z.number().optional(),
  assigneeId: z.string().uuid('assigneeId must be a valid UUID').optional().nullable(),
  projectId: z.string().uuid('projectId must be a valid UUID').optional().nullable(),
  dueDate: dueDateSchema,
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' },
);

const taskOrder = z.object({
  position: z.number().optional(),
  order: z.number().optional(),
  status: z.enum(['todo', 'in_progress', 'done'], {
    errorMap: () => ({ message: 'status must be todo, in_progress, or done' }),
  }).optional(),
}).refine(
  (data) => data.position !== undefined || data.order !== undefined || data.status !== undefined,
  { message: 'position, order, or status must be provided' },
);

const tasksBatchReorder = z.object({
  tasks: z.array(z.object({
    id: z.string().uuid('id must be a valid UUID'),
    order: z.number().optional(),
    position: z.number().optional(),
    status: z.enum(['todo', 'in_progress', 'done']).optional(),
  })).min(1, 'At least one task update must be provided').max(200, 'Maximum 200 updates allowed'),
});

const taskDueDateUpdate = z.object({
  dueDate: dueDateSchema,
});

const calendarQuery = z.object({
  from: z.string().trim().refine((val) => !isNaN(Date.parse(val)), { message: 'from must be a valid date string' }).optional(),
  to: z.string().trim().refine((val) => !isNaN(Date.parse(val)), { message: 'to must be a valid date string' }).optional(),
  projectId: z.string().trim().optional(),
  assigneeId: z.string().trim().optional(),
  status: z.enum(['todo', 'in_progress', 'done'], {
    errorMap: () => ({ message: 'status must be todo, in_progress, or done' }),
  }).optional(),
  includeOverdue: z.preprocess((v) => v === 'true' || v === true, z.boolean()).optional(),
});

// ─── Projects ────────────────────────────────────────────────────────────────

const projectCreate = z.object({
  name: nonBlankString(100, { requiredMsg: 'Project name is required', maxMsg: 'Project name must be 100 characters or fewer' }),
  description: z.string().trim().max(5000, 'Description must be 5000 characters or fewer').optional().nullable(),
  icon: z.string().trim().max(50, 'Icon must be 50 characters or fewer').optional().nullable(),
  color: z.string().trim().max(50, 'Color must be 50 characters or fewer').optional().nullable(),
  status: z.enum(['active', 'planning', 'in_progress', 'completed', 'on_hold', 'archived'], {
    errorMap: () => ({ message: 'status must be active, planning, in_progress, completed, on_hold, or archived' }),
  }).optional(),
  startDate: dueDateSchema,
  targetDate: dueDateSchema,
  memberIds: z.array(z.string().uuid('memberId must be a valid UUID')).optional(),
});

const projectUpdate = z.object({
  name: nonBlankString(100, { requiredMsg: 'Project name cannot be blank', maxMsg: 'Project name must be 100 characters or fewer' }).optional(),
  description: z.string().trim().max(5000, 'Description must be 5000 characters or fewer').optional().nullable(),
  icon: z.string().trim().max(50, 'Icon must be 50 characters or fewer').optional().nullable(),
  color: z.string().trim().max(50, 'Color must be 50 characters or fewer').optional().nullable(),
  status: z.enum(['active', 'planning', 'in_progress', 'completed', 'on_hold', 'archived'], {
    errorMap: () => ({ message: 'status must be active, planning, in_progress, completed, on_hold, or archived' }),
  }).optional(),
  startDate: dueDateSchema,
  targetDate: dueDateSchema,
  order: z.number().optional(),
  isArchived: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' },
);

const projectMemberAdd = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
  role: z.enum(['lead', 'member', 'viewer'], {
    errorMap: () => ({ message: 'role must be lead, member, or viewer' }),
  }).optional().default('member'),
});

// ─── Comments ─────────────────────────────────────────────────────────────────

const commentCreate = z.object({
  content: nonBlankString(2000, { requiredMsg: 'Comment content is required', maxMsg: 'Comment must be 2000 characters or fewer' }),
});

const commentUpdate = z.object({
  content: nonBlankString(2000, { requiredMsg: 'Comment content is required', maxMsg: 'Comment must be 2000 characters or fewer' }),
});

// ─── Subtasks ─────────────────────────────────────────────────────────────────

const subtaskCreate = z.object({
  title: nonBlankString(200, { requiredMsg: 'Subtask title is required', maxMsg: 'Subtask title must be 200 characters or fewer' }),
  completed: z.boolean().optional(),
  order: z.number().optional(),
  position: z.number().optional(),
  dueDate: dueDateSchema,
  assigneeId: z.string().uuid('assigneeId must be a valid UUID').optional().nullable(),
  parentId: z.string().uuid('parentId must be a valid UUID').optional().nullable(),
});

const subtaskUpdate = z.object({
  title: nonBlankString(200, { requiredMsg: 'Subtask title cannot be blank', maxMsg: 'Subtask title must be 200 characters or fewer' }).optional(),
  completed: z.boolean().optional(),
  order: z.number().optional(),
  position: z.number().optional(),
  dueDate: dueDateSchema,
  assigneeId: z.string().uuid('assigneeId must be a valid UUID').optional().nullable(),
  parentId: z.string().uuid('parentId must be a valid UUID').optional().nullable(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' },
);

const subtasksBatchReorder = z.object({
  subtasks: z.array(z.object({
    id: z.string().uuid('id must be a valid UUID'),
    order: z.number().optional(),
    position: z.number().optional(),
    parentId: z.string().uuid('parentId must be a valid UUID').optional().nullable(),
  })).min(1, 'At least one subtask update must be provided').max(200, 'Maximum 200 updates allowed'),
});

const subtasksBatchCreate = z.object({
  subtasks: z.array(z.object({
    title: nonBlankString(200, { requiredMsg: 'Subtask title is required', maxMsg: 'Subtask title must be 200 characters or fewer' }),
    completed: z.boolean().optional().default(false),
    order: z.number().optional(),
    dueDate: dueDateSchema.optional(),
    assigneeId: z.string().uuid('assigneeId must be a valid UUID').optional().nullable(),
  })).min(1, 'At least one subtask is required').max(50, 'Maximum 50 subtasks allowed per batch'),
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
  role: z.enum(['owner', 'admin', 'member'], {
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

// ─── Notifications ────────────────────────────────────────────────────────────

const notificationPreferencesUpdate = z.object({
  taskAssigned: z.boolean().optional(),
  statusChanged: z.boolean().optional(),
  commentsAndMentions: z.boolean().optional(),
  dueDates: z.boolean().optional(),
  teamUpdates: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one preference field must be provided' },
);

const notificationQuery = z.object({
  unread: z.enum(['true', 'false']).optional(),
  type: z.string().trim().optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

// ─── Search ───────────────────────────────────────────────────────────────────

const searchQuery = z.object({
  q: z.string().max(500, 'Search query must be 500 characters or fewer').optional(),
  status: z.string().trim().optional(),
  assigneeId: z.string().trim().optional(),
  projectId: z.string().trim().optional(),
  priority: z.string().trim().optional(),
  label: z.string().trim().optional(),
  page: z.union([z.string().regex(/^\d+$/).transform(Number), z.number()]).optional(),
  pageSize: z.union([z.string().regex(/^\d+$/).transform(Number), z.number()]).optional(),
  sortBy: z.enum(['relevance', 'dueDate', 'priority', 'createdAt', 'updatedAt', 'order', 'title']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const savedSearchCreate = z.object({
  name: nonBlankString(100, { requiredMsg: 'Name is required', maxMsg: 'Name must be 100 characters or fewer' }),
  query: nonBlankString(500, { requiredMsg: 'Query is required', maxMsg: 'Query must be 500 characters or fewer' }),
  filters: z.record(z.any()).optional().nullable(),
});

const recentSearchCreate = z.object({
  query: nonBlankString(500, { requiredMsg: 'Query is required', maxMsg: 'Query must be 500 characters or fewer' }),
});

// ─── AI Assistant ─────────────────────────────────────────────────────────────

const aiTaskGenerateRequest = z.object({
  prompt: nonBlankString(1000, { requiredMsg: 'Prompt is required', maxMsg: 'Prompt must be 1000 characters or fewer' }),
  projectId: z.string().uuid('projectId must be a valid UUID').optional().nullable(),
  currentContext: z.string().trim().max(1000, 'Current context must be 1000 characters or fewer').optional(),
});

const aiTaskGenerateResponse = z.object({
  title: nonBlankString(200, { requiredMsg: 'Title is required', maxMsg: 'Title must be 200 characters or fewer' }),
  description: z.string().trim().max(5000).optional().default(''),
  priority: prioritySchema.optional().default('medium'),
  suggestedDeadlineDays: z.number().int().min(0).max(365).optional().default(3),
  suggestedDueDate: z.string().optional().nullable(),
  labels: z.array(z.string().trim().max(30)).max(15).optional().default([]),
  suggestedSubtasks: z.array(
    z.object({
      title: nonBlankString(200),
      order: z.number().optional().default(1000),
    })
  ).max(20).optional().default([]),
});

const aiTaskBreakdownRequest = z.object({
  taskId: z.string().uuid('taskId must be a valid UUID').optional(),
  title: z.string().trim().max(200, 'Title must be 200 characters or fewer').optional(),
  description: z.string().trim().max(5000, 'Description must be 5000 characters or fewer').optional(),
  projectId: z.string().uuid('projectId must be a valid UUID').optional().nullable(),
}).refine(
  (data) => Boolean(data.taskId || (data.title && data.title.trim().length > 0)),
  { message: 'Either taskId or a non-empty title must be provided' }
);

const aiTaskBreakdownResponse = z.object({
  subtasks: z.array(
    z.object({
      title: nonBlankString(200),
      estimatedMinutes: z.number().int().min(1).max(1440).optional().default(30),
      order: z.number().optional().default(1000),
    })
  ).min(1).max(30),
});

const aiProjectPlanRequest = z.object({
  prompt: nonBlankString(500, { requiredMsg: 'Prompt is required', maxMsg: 'Prompt must be 500 characters or fewer' }),
  timeframeWeeks: z.number().int().min(1).max(52).optional().default(4),
  template: z.string().trim().max(50).optional(),
});

const aiProjectPlanResponse = z.object({
  name: nonBlankString(100, { requiredMsg: 'Project name is required', maxMsg: 'Project name must be 100 characters or fewer' }),
  description: z.string().trim().max(5000).optional().default(''),
  icon: z.string().trim().max(50).optional().default('🚀'),
  color: z.string().trim().max(50).optional().default('#6366f1'),
  targetDays: z.number().int().min(1).max(365).optional().default(28),
  phases: z.array(nonBlankString(100)).min(1).max(10),
  tasks: z.array(
    z.object({
      title: nonBlankString(200, { requiredMsg: 'Task title is required', maxMsg: 'Task title must be 200 characters or fewer' }),
      description: z.string().trim().max(5000).optional().default(''),
      phase: nonBlankString(100),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
      suggestedDeadlineOffsetDays: z.number().int().min(0).max(365).optional().default(7),
      labels: z.array(z.string().trim().max(50)).max(10).optional().default([]),
      subtasks: z.array(
        z.object({
          title: nonBlankString(200),
          estimatedMinutes: z.number().int().min(1).max(1440).optional().default(30),
          order: z.number().optional().default(1000),
        })
      ).max(20).optional().default([]),
    })
  ).min(1).max(50),
});

const aiProjectApplyRequest = z.object({
  name: nonBlankString(100, { requiredMsg: 'Project name is required', maxMsg: 'Project name must be 100 characters or fewer' }),
  description: z.string().trim().max(5000).optional().nullable(),
  icon: z.string().trim().max(50).optional().default('🚀'),
  color: z.string().trim().max(50).optional().default('#6366f1'),
  startDate: dueDateSchema,
  targetDate: dueDateSchema,
  tasks: z.array(
    z.object({
      title: nonBlankString(200, { requiredMsg: 'Task title is required', maxMsg: 'Task title must be 200 characters or fewer' }),
      description: z.string().trim().max(5000).optional().nullable(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
      status: z.enum(['todo', 'in_progress', 'done']).optional().default('todo'),
      dueDate: dueDateSchema,
      labels: z.array(z.string().trim().max(50)).max(10).optional().default([]),
      subtasks: z.array(
        z.object({
          title: nonBlankString(200),
          estimatedMinutes: z.number().int().min(1).max(1440).optional().default(30),
          order: z.number().optional().default(1000),
        })
      ).max(20).optional().default([]),
    })
  ).min(1, 'At least one task must be selected to create the project').max(100),
});

const aiProductivityInsightsQuery = z.object({
  range: z.enum(['7d', '30d', '90d', 'this_week', 'last_week', 'this_month', 'all'], {
    errorMap: () => ({ message: 'range must be 7d, 30d, 90d, this_week, last_week, this_month, or all' }),
  }).optional().default('7d'),
  userId: z.string().uuid('userId must be a valid UUID').optional().nullable(),
  projectId: z.string().uuid('projectId must be a valid UUID').optional().nullable(),
});

const aiProductivityInsightsResponse = z.object({
  timeRange: z.object({
    range: z.string(),
    startDate: z.string().nullable(),
    endDate: z.string(),
    label: z.string(),
  }),
  summary: z.string(),
  metrics: z.object({
    totalTasks: z.number().optional().default(0),
    tasksCompleted: z.number(),
    tasksCreated: z.number(),
    completionRate: z.number(),
    velocityChangePct: z.number(),
    overdueCount: z.number(),
    activeWorkloadCount: z.number(),
    peakProductivityDay: z.string().optional().nullable(),
    topContributor: z.object({
      name: z.string(),
      completedCount: z.number(),
    }).optional().nullable(),
    highestWorkloadMember: z.object({
      name: z.string(),
      activeCount: z.number(),
    }).optional().nullable(),
  }),
  highlights: z.array(z.string()),
  bottlenecks: z.array(z.string()),
  workloadAnalysis: z.array(z.string()),
  recommendations: z.array(z.string()),
  generatedAt: z.string(),
});

const aiSearchRequest = z.object({
  prompt: nonBlankString(500, { requiredMsg: 'Search prompt is required', maxMsg: 'Search prompt must be 500 characters or fewer' }),
  executeSearch: z.boolean().optional().default(true),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const aiSearchResponse = z.object({
  naturalQuery: z.string(),
  explanation: z.string(),
  structuredFilters: z.object({
    text: z.string().optional().default(''),
    statuses: z.array(z.string()).optional().default([]),
    priorities: z.array(z.string()).optional().default([]),
    assignee: z.string().optional().nullable(),
    project: z.string().optional().nullable(),
    due: z.string().optional().nullable(),
    labels: z.array(z.string()).optional().default([]),
    sortBy: z.string().optional().default('relevance'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  }),
  searchExpression: z.string(),
  results: z.array(z.any()).optional().default([]),
  total: z.number().int().optional().default(0),
  page: z.number().int().optional().default(1),
  pageSize: z.number().int().optional().default(20),
  facets: z.record(z.any()).optional().default({}),
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
  projectCreate,
  projectUpdate,
  projectMemberAdd,
  subtaskCreate,
  subtaskUpdate,
  subtasksBatchReorder,
  subtasksBatchCreate,
  commentCreate,
  commentUpdate,
  teamCreate,
  teamJoin,
  memberAdd,
  memberRoleUpdate,
  analyticsQuery,
  notificationPreferencesUpdate,
  notificationQuery,
  taskDueDateUpdate,
  calendarQuery,
  searchQuery,
  savedSearchCreate,
  recentSearchCreate,
  aiTaskGenerateRequest,
  aiTaskGenerateResponse,
  aiTaskBreakdownRequest,
  aiTaskBreakdownResponse,
  aiProjectPlanRequest,
  aiProjectPlanResponse,
  aiProjectApplyRequest,
  aiProductivityInsightsQuery,
  aiProductivityInsightsResponse,
  aiSearchRequest,
  aiSearchResponse,
};




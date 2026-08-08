const express     = require('express');
const prisma      = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const logger      = require('../middleware/logger');
const { scopedTaskQuery } = require('../helpers/scopedQuery');

const router = express.Router({ mergeParams: true }); // inherit :taskId from parent

// Apply auth + team resolution to all activity routes.
router.use(requireAuth, resolveTeam);

// ─── Helper: verify the task exists and belongs to req.teamId ─────────────────

async function requireTaskInTeam(req, res) {
  const task = await prisma.task.findFirst({
    where: scopedTaskQuery(req, { id: req.params.taskId }),
  });

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return null;
  }

  return task;
}

// ─── GET /tasks/:taskId/activities — list activity log ────────────────────────
//
// Pagination params:
//   page     — 1-based page number (default: 1)
//   pageSize — items per page (default: 20, max: 100)
//
// Response includes a `pagination` envelope:
//   { total, page, pageSize, totalPages }

router.get('/', async (req, res) => {
  try {
    const task = await requireTaskInTeam(req, res);
    if (!task) return;

    // ── Pagination ────────────────────────────────────────────────────────────
    const page     = Math.max(1, parseInt(req.query.page,     10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const skip     = (page - 1) * pageSize;

    const where = { taskId: task.id };

    const [total, activities] = await Promise.all([
      prisma.activity.count({ where }),
      prisma.activity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    res.json({
      activities,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'GET /tasks/:taskId/activities failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;

const express     = require('express');
const prisma      = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const { scopedTaskQuery } = require('../helpers/scopedQuery');
const { paginateWithCursor, InvalidCursorError } = require('../helpers/cursorPagination');

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

router.get('/', async (req, res) => {
  try {
    const task = await requireTaskInTeam(req, res);
    if (!task) return;

    const { cursor, limit, mode } = req.query;

    if (cursor || mode === 'cursor' || limit) {
      const result = await paginateWithCursor(prisma.activity, {
        where: { taskId: task.id },
        cursor,
        limit: limit ? parseInt(limit, 10) : 50,
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      return res.json({
        activities: result.items,
        pagination: {
          nextCursor: result.nextCursor,
          prevCursor: result.prevCursor,
          hasMore: result.hasMore,
          limit: result.limit,
        },
      });
    }

    const activities = await prisma.activity.findMany({
      where:   { taskId: task.id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({ activities });
  } catch (error) {
    if (error instanceof InvalidCursorError) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;

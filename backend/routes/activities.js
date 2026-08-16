const express     = require('express');
const prisma      = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
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

router.get('/', async (req, res) => {
  try {
    const task = await requireTaskInTeam(req, res);
    if (!task) return;

    const activities = await prisma.activity.findMany({
      where:   { taskId: task.id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({ activities });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;

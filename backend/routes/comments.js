const express     = require('express');
const prisma      = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const validate    = require('../middleware/validate');
const { sanitize } = require('../middleware/sanitize');
const schemas     = require('../validation/schemas');
const { scopedTaskQuery } = require('../helpers/scopedQuery');

const { createNotification, parseMentions } = require('../services/notifications');
const { emitCommentCreated } = require('../services/realtime');
const { dispatchWebhookEvent } = require('../services/webhooks');

const router = express.Router({ mergeParams: true }); // inherit :taskId from parent

// Apply auth + team resolution to all comment routes.
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

// ─── POST /tasks/:taskId/comments — create a comment ─────────────────────────

router.post('/', validate(schemas.commentCreate), async (req, res) => {
  try {
    const task = await requireTaskInTeam(req, res);
    if (!task) return;

    const { content } = req.body;

    const comment = await prisma.comment.create({
      data: {
        content:  sanitize(content),
        taskId:   task.id,
        authorId: req.userId,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
    });

    // Record activity
    await prisma.activity.create({
      data: {
        taskId:  task.id,
        userId:  req.userId,
        action:  'commented',
        details: `Added a comment`,
      },
    });

    // 1. Process mentions
    const mentionedUsers = await parseMentions(content, req.teamId);
    const notifiedUserIds = new Set();

    for (const mentioned of mentionedUsers) {
      if (mentioned.id !== req.userId) {
        notifiedUserIds.add(mentioned.id);
        await createNotification({
          userId:  mentioned.id,
          actorId: req.userId,
          teamId:  req.teamId,
          taskId:  task.id,
          type:    'mention',
          title:   'Mentioned in a comment',
          message: `${comment.author?.name || 'Someone'} mentioned you in a comment on "${task.title}"`,
          data:    { taskId: task.id, commentId: comment.id },
        });
      }
    }

    // 2. Notify task creator and assignee for new comments (if not already notified by mention)
    const candidates = [task.createdById, task.assigneeId].filter(Boolean);
    for (const candidateId of candidates) {
      if (candidateId !== req.userId && !notifiedUserIds.has(candidateId)) {
        notifiedUserIds.add(candidateId);
        await createNotification({
          userId:  candidateId,
          actorId: req.userId,
          teamId:  req.teamId,
          taskId:  task.id,
          type:    'comment_created',
          title:   'New comment on task',
          message: `New comment on task "${task.title}"`,
          data:    { taskId: task.id, commentId: comment.id },
        });
      }
    }

    // 3. Emit real-time comment event to team and task rooms
    emitCommentCreated(req.teamId, task.id, comment);
    dispatchWebhookEvent(req.teamId, 'comment.created', { ...comment, taskTitle: task.title });

    res.status(201).json({ comment });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── GET /tasks/:taskId/comments — list comments ──────────────────────────────

router.get('/', async (req, res) => {
  try {
    const task = await requireTaskInTeam(req, res);
    if (!task) return;

    const comments = await prisma.comment.findMany({
      where:   { taskId: task.id },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({ comments });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;

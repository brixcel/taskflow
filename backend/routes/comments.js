const express     = require('express');
const prisma      = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const validate    = require('../middleware/validate');
const { sanitize } = require('../middleware/sanitize');
const schemas     = require('../validation/schemas');
const { scopedTaskQuery } = require('../helpers/scopedQuery');
const logger      = require('../middleware/logger');
const { createNotification, parseMentions } = require('../services/notifications');

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

    // ── Notifications ──────────────────────────────────────────────────────────
    // 1. Mentions
    const mentionedUsers = await parseMentions(content, req.teamId);
    const notifiedUserIds = new Set();

    for (const mentionedUser of mentionedUsers) {
      if (mentionedUser.id !== req.userId) {
        notifiedUserIds.add(mentionedUser.id);
        await createNotification({
          userId:  mentionedUser.id,
          actorId: req.userId,
          teamId:  req.teamId,
          taskId:  task.id,
          type:    'mention',
          title:   'Mentioned in a comment',
          message: `${comment.author?.name || 'Someone'} mentioned you in task "${task.title}"`,
          data:    { taskId: task.id, taskTitle: task.title, commentId: comment.id },
        });
      }
    }

    // 2. Task Assignee & Creator (if not already notified & not actor)
    const taskSubscribers = new Set();
    if (task.assigneeId && task.assigneeId !== req.userId && !notifiedUserIds.has(task.assigneeId)) {
      taskSubscribers.add(task.assigneeId);
    }
    if (task.createdById && task.createdById !== req.userId && !notifiedUserIds.has(task.createdById)) {
      taskSubscribers.add(task.createdById);
    }

    for (const subscriberId of taskSubscribers) {
      await createNotification({
        userId:  subscriberId,
        actorId: req.userId,
        teamId:  req.teamId,
        taskId:  task.id,
        type:    'comment_created',
        title:   'New comment on task',
        message: `${comment.author?.name || 'Someone'} commented on "${task.title}"`,
        data:    { taskId: task.id, taskTitle: task.title, commentId: comment.id },
      });
    }

    res.status(201).json({ comment });
  } catch (error) {
    logger.error({ err: error }, 'POST /tasks/:taskId/comments failed');
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
    logger.error({ err: error }, 'GET /tasks/:taskId/comments failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── PATCH /tasks/:taskId/comments/:commentId — edit comment ──────────────────

router.patch('/:commentId', validate(schemas.commentUpdate), async (req, res) => {
  try {
    const task = await requireTaskInTeam(req, res);
    if (!task) return;

    const { commentId } = req.params;
    const existingComment = await prisma.comment.findFirst({
      where: { id: commentId, taskId: task.id },
    });

    if (!existingComment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (existingComment.authorId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden — only the comment author can edit this comment' });
    }

    const { content } = req.body;
    const comment = await prisma.comment.update({
      where: { id: commentId },
      data:  { content: sanitize(content) },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({ comment });
  } catch (error) {
    logger.error({ err: error }, 'PATCH /tasks/:taskId/comments/:commentId failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── DELETE /tasks/:taskId/comments/:commentId — delete comment ────────────────

router.delete('/:commentId', async (req, res) => {
  try {
    const task = await requireTaskInTeam(req, res);
    if (!task) return;

    const { commentId } = req.params;
    const existingComment = await prisma.comment.findFirst({
      where: { id: commentId, taskId: task.id },
    });

    if (!existingComment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const isAuthor   = existingComment.authorId === req.userId;
    const isElevated = ['admin', 'owner'].includes(req.teamRole);

    if (!isAuthor && !isElevated) {
      return res.status(403).json({ error: 'Forbidden — only the comment author or an admin/owner can delete this comment' });
    }

    await prisma.comment.delete({ where: { id: commentId } });

    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, 'DELETE /tasks/:taskId/comments/:commentId failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;

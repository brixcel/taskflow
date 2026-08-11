const express    = require('express');
const prisma     = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const requireRole = require('../middleware/requireRole');
const validate   = require('../middleware/validate');
const { sanitize } = require('../middleware/sanitize');
const schemas    = require('../validation/schemas');
const { scopedTaskQuery } = require('../helpers/scopedQuery');
const { createNotification } = require('../services/notifications');
const {
  emitTaskCreated,
  emitTaskUpdated,
  emitTaskDeleted,
  emitTaskAssigned,
  emitTaskCompleted,
} = require('../services/realtime');

const router = express.Router();

// Apply both middleware to every task route.
// resolveTeam runs after requireAuth so req.userId is guaranteed.
router.use(requireAuth, resolveTeam);

// ─── POST / — create a task ───────────────────────────────────────────────────

router.post('/', validate(schemas.taskCreate), async (req, res) => {
  try {
    const { title, description, assigneeId, dueDate } = req.body;

    // If an assignee is specified, verify they are a member of this team.
    if (assigneeId) {
      const assigneeMembership = await prisma.teamMembership.findUnique({
        where: { userId_teamId: { userId: assigneeId, teamId: req.teamId } },
      });
      if (!assigneeMembership) {
        return res.status(400).json({ error: 'Assignee is not a member of this team' });
      }
    }

    const task = await prisma.task.create({
      data: {
        title:       sanitize(title),
        description: description != null ? sanitize(description) : null,
        assigneeId:  assigneeId  || null,
        dueDate:     dueDate ? new Date(dueDate) : null,
        createdById: req.userId,
        teamId:      req.teamId,
      },
      include: {
        assignee:  { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    await prisma.activity.create({
      data: {
        taskId:  task.id,
        userId:  req.userId,
        action:  'created',
        details: `Task "${task.title}" created`,
      },
    });

    // Notify assignee if assigned to someone else
    if (task.assigneeId && task.assigneeId !== req.userId) {
      await createNotification({
        userId:  task.assigneeId,
        actorId: req.userId,
        teamId:  req.teamId,
        taskId:  task.id,
        type:    'task_assigned',
        title:   'Task assigned',
        message: `You were assigned to task "${task.title}"`,
        data:    { taskId: task.id, title: task.title },
      });
    }

    // Real-time broadcasts
    emitTaskCreated(req.teamId, task);
    if (task.assigneeId) {
      emitTaskAssigned(req.teamId, task, null);
    }

    res.status(201).json({ task });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── GET / — list tasks for the active team ───────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { status, assigneeId, search } = req.query;

    const where = scopedTaskQuery(req);
    if (status)     where.status     = status;
    if (assigneeId) where.assigneeId = assigneeId;
    if (search) {
      const term = search.trim();
      if (term) {
        where.OR = [
          { title:       { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
        ];
      }
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        assignee:  { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    res.json({ tasks });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── PATCH /:id — update a task ───────────────────────────────────────────────

router.patch('/:id', validate(schemas.taskUpdate), async (req, res) => {
  try {
    const { id } = req.params;

    // Scope the lookup to the active team — prevents cross-team access.
    const existingTask = await prisma.task.findFirst({
      where: scopedTaskQuery(req, { id }),
    });
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const { title, description, status, assigneeId, dueDate } = req.body;

    // Validate assignee belongs to this team if being changed.
    if (assigneeId !== undefined && assigneeId !== null) {
      const assigneeMembership = await prisma.teamMembership.findUnique({
        where: { userId_teamId: { userId: assigneeId, teamId: req.teamId } },
      });
      if (!assigneeMembership) {
        return res.status(400).json({ error: 'Assignee is not a member of this team' });
      }
    }

    const updateData = {};
    if (title       !== undefined) updateData.title       = sanitize(title);
    if (description !== undefined) updateData.description = description != null ? sanitize(description) : null;
    if (status      !== undefined) updateData.status      = status;
    if (assigneeId  !== undefined) updateData.assigneeId  = assigneeId;
    if (dueDate     !== undefined) updateData.dueDate     = dueDate ? new Date(dueDate) : null;

    const task = await prisma.task.update({
      where:   { id },
      data:    updateData,
      include: {
        assignee:  { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    const isStatusChange = status !== undefined && status !== existingTask.status;
    await prisma.activity.create({
      data: {
        taskId:  task.id,
        userId:  req.userId,
        action:  isStatusChange ? 'status_changed' : 'updated',
        details: isStatusChange
          ? `${existingTask.status} → ${status}`
          : 'Task details updated',
      },
    });

    // Handle assignee change notification & real-time event
    if (assigneeId !== undefined && assigneeId !== existingTask.assigneeId) {
      if (assigneeId && assigneeId !== req.userId) {
        const isReassign = Boolean(existingTask.assigneeId);
        await createNotification({
          userId:  assigneeId,
          actorId: req.userId,
          teamId:  req.teamId,
          taskId:  task.id,
          type:    isReassign ? 'task_reassigned' : 'task_assigned',
          title:   isReassign ? 'Task reassigned' : 'Task assigned',
          message: `You were assigned to task "${task.title}"`,
          data:    { taskId: task.id, title: task.title },
        });
      }
      emitTaskAssigned(req.teamId, task, existingTask.assigneeId);
    }

    // Handle status change notification & real-time event
    if (isStatusChange) {
      const targets = new Set();
      if (task.assigneeId && task.assigneeId !== req.userId) targets.add(task.assigneeId);
      if (task.createdById && task.createdById !== req.userId) targets.add(task.createdById);

      if (status === 'done') {
        for (const recipientId of targets) {
          await createNotification({
            userId:  recipientId,
            actorId: req.userId,
            teamId:  req.teamId,
            taskId:  task.id,
            type:    'task_completed',
            title:   'Task completed',
            message: `Task "${task.title}" was completed`,
            data:    { taskId: task.id, title: task.title },
          });
        }
        emitTaskCompleted(req.teamId, task);
      } else {
        for (const recipientId of targets) {
          await createNotification({
            userId:  recipientId,
            actorId: req.userId,
            teamId:  req.teamId,
            taskId:  task.id,
            type:    'status_changed',
            title:   'Task status updated',
            message: `Task "${task.title}" status changed to ${status}`,
            data:    { taskId: task.id, title: task.title, oldStatus: existingTask.status, newStatus: status },
          });
        }
      }
    }

    // Emit real-time task update to team and task room
    emitTaskUpdated(req.teamId, task);

    res.json({ task });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── DELETE /:id — delete a task ─────────────────────────────────────────────
//
// Allowed if:  user is the task creator  OR  user is admin/owner in this team.
// A plain member cannot delete another member's task.

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Scope to the active team — prevents cross-team deletion.
    const existingTask = await prisma.task.findFirst({
      where: scopedTaskQuery(req, { id }),
    });
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Permission check: creator always allowed; otherwise admin/owner required.
    const isCreator  = existingTask.createdById === req.userId;
    const isElevated = ['admin', 'owner'].includes(req.teamRole);

    if (!isCreator && !isElevated) {
      return res.status(403).json({
        error: 'Forbidden — only the task creator or an admin/owner can delete tasks',
      });
    }

    await prisma.task.delete({ where: { id } });

    // Emit real-time task deletion
    emitTaskDeleted(req.teamId, id);

    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;

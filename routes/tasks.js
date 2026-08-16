const express    = require('express');
const prisma     = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const requireRole = require('../middleware/requireRole');
const validate   = require('../middleware/validate');
const { sanitize } = require('../middleware/sanitize');
const schemas    = require('../validation/schemas');
const { scopedTaskQuery } = require('../helpers/scopedQuery');
const { parseSearchQuery, buildPrismaWhereClause } = require('../services/searchParser');
const logger     = require('../middleware/logger');
const { createNotification } = require('../services/notifications');
const {
  emitTaskCreated,
  emitTaskUpdated,
  emitTaskDeleted,
  emitTaskAssigned,
  emitTaskCompleted,
} = require('../services/realtime');
const { dispatchWebhookEvent } = require('../services/webhooks');

const router = express.Router();

// Apply both middleware to every task route.
// resolveTeam runs after requireAuth so req.userId is guaranteed.
router.use(requireAuth, resolveTeam);

// ─── POST / — create a task ───────────────────────────────────────────────────

router.post('/', validate(schemas.taskCreate), async (req, res) => {
  try {
    const { title, description, assigneeId, projectId, dueDate, status, priority, labels, order, position, subtasks } = req.body;

    // If an assignee is specified, verify they are a member of this team.
    if (assigneeId) {
      const assigneeMembership = await prisma.teamMembership.findUnique({
        where: { userId_teamId: { userId: assigneeId, teamId: req.teamId } },
      });
      if (!assigneeMembership) {
        return res.status(400).json({ error: 'Assignee is not a member of this team' });
      }
    }

    // If a project is specified, verify it belongs to this team.
    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, teamId: req.teamId },
      });
      if (!project) {
        return res.status(400).json({ error: 'Project not found in this team' });
      }
    }

    const taskStatus = status || 'todo';
    let taskOrder = order !== undefined ? order : (position !== undefined ? position : null);

    if (taskOrder == null) {
      // Position at the bottom of the target status column
      const lastTask = await prisma.task.findFirst({
        where: { teamId: req.teamId, status: taskStatus },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      taskOrder = (lastTask?.order ?? 0) + 1000;
    }

    const cleanLabels = Array.isArray(labels)
      ? labels.map(l => sanitize(String(l).trim())).filter(Boolean)
      : [];

    const subtasksCreateData = (Array.isArray(subtasks) && subtasks.length > 0)
      ? {
          create: subtasks.map((s, idx) => ({
            title: sanitize(s.title),
            order: s.order !== undefined ? s.order : (idx + 1) * 1000,
            completed: false,
          })),
        }
      : undefined;

    const task = await prisma.task.create({
      data: {
        title:       sanitize(title),
        description: description != null ? sanitize(description) : null,
        status:      taskStatus,
        priority:    priority || 'medium',
        labels:      cleanLabels,
        order:       taskOrder,
        assigneeId:  assigneeId  || null,
        projectId:   projectId   || null,
        dueDate:     dueDate ? new Date(dueDate) : null,
        createdById: req.userId,
        teamId:      req.teamId,
        subtasks:    subtasksCreateData,
      },
      include: {
        assignee:  { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        project:   { select: { id: true, name: true, color: true, icon: true } },
        subtasks:  { orderBy: { order: 'asc' } },
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

    if (task.assigneeId && task.assigneeId !== req.userId) {
      await createNotification({
        userId:  task.assigneeId,
        actorId: req.userId,
        teamId:  req.teamId,
        taskId:  task.id,
        type:    'task_assigned',
        title:   'Task assigned',
        message: `You were assigned to task "${task.title}"`,
        data:    { taskId: task.id, taskTitle: task.title, status: task.status, priority: task.priority },
      });
    }

    // Real-time broadcasts
    emitTaskCreated(req.teamId, task);
    if (task.assigneeId) {
      emitTaskAssigned(req.teamId, task, null);
    }

    // Webhook event dispatches
    dispatchWebhookEvent(req.teamId, 'task.created', task);
    if (task.assigneeId) {
      dispatchWebhookEvent(req.teamId, 'task.assigned', task);
    }

    res.status(201).json({ task });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'POST /tasks failed');
    }
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── GET / — list tasks for the active team ───────────────────────────────────
//
// Pagination params:
//   page     — 1-based page number (default: 1)
//   pageSize — items per page (default: 20, max: 100)
//
// Filters:
//   status, assigneeId, projectId, priority, label, search

router.get('/', async (req, res) => {
  try {
    const { status, assigneeId, projectId, priority, label, search } = req.query;

    // ── Pagination ────────────────────────────────────────────────────────────
    const page     = Math.max(1, parseInt(req.query.page,     10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const skip     = (page - 1) * pageSize;

    let where = scopedTaskQuery(req);
    if (status)     where.status     = status;
    if (assigneeId) where.assigneeId = assigneeId;
    if (projectId) {
      if (projectId === 'unassigned' || projectId === 'null') {
        where.projectId = null;
      } else {
        where.projectId = projectId;
      }
    }
    if (priority)   where.priority   = priority;
    if (label)      where.labels     = { has: label.trim() };

    if (search && search.trim()) {
      const term = search.trim();
      const hasOperators = /[a-zA-Z_-]+:(?:"[^"]+"|'[^']+'|[^\s]+)/.test(term);
      if (hasOperators) {
        const parsed = parseSearchQuery(term);
        where = buildPrismaWhereClause(parsed, {
          userId: req.userId,
          teamId: req.teamId,
          baseWhere: where,
        });
      } else {
        where.OR = [
          { title:       { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
        ];
      }
    }

    // Run count and fetch in parallel for efficiency
    const [total, tasks] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        orderBy: [
          { order: 'asc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: pageSize,
        include: {
          assignee:  { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          project:   { select: { id: true, name: true, color: true, icon: true } },
          subtasks:  { select: { id: true, completed: true } },
        },
      }),
    ]);

    res.json({
      tasks,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'GET /tasks failed');
    }
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── PATCH /reorder/batch — batch update task orders ──────────────────────────

router.patch('/reorder/batch', validate(schemas.tasksBatchReorder), async (req, res) => {
  try {
    const { tasks: updates } = req.body;
    const taskIds = updates.map(u => u.id);

    // Verify all tasks belong to this team
    const teamTasks = await prisma.task.findMany({
      where: {
        id: { in: taskIds },
        teamId: req.teamId,
      },
      select: { id: true },
    });

    if (teamTasks.length !== taskIds.length) {
      return res.status(404).json({ error: 'One or more tasks not found in this team' });
    }

    // Perform updates in transaction
    await prisma.$transaction(
      updates.map(u => {
        const updateData = {};
        if (u.order !== undefined)    updateData.order = u.order;
        if (u.position !== undefined) updateData.order = u.position;
        if (u.status !== undefined)   updateData.status = u.status;

        return prisma.task.update({
          where: { id: u.id },
          data: updateData,
        });
      })
    );

    res.json({ success: true, count: updates.length });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'PATCH /tasks/reorder/batch failed');
    }
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── PATCH /:id/order — Kanban order / status update ──────────────────────────

router.patch('/:id/order', validate(schemas.taskOrder), async (req, res) => {
  try {
    const { id } = req.params;

    const existingTask = await prisma.task.findFirst({
      where: scopedTaskQuery(req, { id }),
    });
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const { position, order, status } = req.body;
    const newOrder = position !== undefined ? position : order;

    const updateData = {};
    if (newOrder !== undefined) updateData.order = newOrder;
    if (status !== undefined)   updateData.status = status;

    const task = await prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        assignee:  { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        project:   { select: { id: true, name: true, color: true, icon: true } },
      },
    });

    const isStatusChange = status !== undefined && status !== existingTask.status;
    if (isStatusChange) {
      await prisma.activity.create({
        data: {
          taskId:  task.id,
          userId:  req.userId,
          action:  'status_changed',
          details: `${existingTask.status} → ${status}`,
        },
      });

      const notifyType = status === 'done' ? 'task_completed' : 'status_changed';
      const notifyTitle = status === 'done' ? 'Task completed' : 'Task status updated';
      const notifyMsg = status === 'done'
        ? `Task "${task.title}" was marked as completed`
        : `Task "${task.title}" status changed to ${status.replace('_', ' ')}`;

      const recipients = new Set();
      if (existingTask.assigneeId && existingTask.assigneeId !== req.userId) {
        recipients.add(existingTask.assigneeId);
      }
      if (existingTask.createdById && existingTask.createdById !== req.userId) {
        recipients.add(existingTask.createdById);
      }

      for (const recipientId of recipients) {
        await createNotification({
          userId:  recipientId,
          actorId: req.userId,
          teamId:  req.teamId,
          taskId:  task.id,
          type:    notifyType,
          title:   notifyTitle,
          message: notifyMsg,
          data:    { taskId: task.id, taskTitle: task.title, oldStatus: existingTask.status, newStatus: status },
        });
      }

      if (status === 'done') {
        emitTaskCompleted(req.teamId, task);
      }
    }

    emitTaskUpdated(req.teamId, task);

    res.json({ task });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'PATCH /tasks/:id/order failed');
    }
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── PATCH /:id/due-date — update task due date (calendar reschedule) ─────────

router.patch('/:id/due-date', validate(schemas.taskDueDateUpdate), async (req, res) => {
  try {
    const { id } = req.params;

    const existingTask = await prisma.task.findFirst({
      where: scopedTaskQuery(req, { id }),
    });
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const { dueDate } = req.body;
    const parsedDueDate = dueDate ? new Date(dueDate) : null;

    const task = await prisma.task.update({
      where: { id },
      data: {
        dueDate: parsedDueDate,
      },
      include: {
        assignee:  { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        project:   { select: { id: true, name: true, color: true, icon: true } },
        subtasks:  { select: { id: true, completed: true } },
      },
    });

    const details = parsedDueDate
      ? `Due date set to ${parsedDueDate.toISOString().split('T')[0]}`
      : 'Due date removed';

    await prisma.activity.create({
      data: {
        taskId:  task.id,
        userId:  req.userId,
        action:  'due_date_changed',
        details,
      },
    });

    emitTaskUpdated(req.teamId, task);

    res.json({ task });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'PATCH /tasks/:id/due-date failed');
    }
    res.status(500).json({ error: 'Something went wrong updating due date' });
  }
});

// ─── GET /:id — get a single task details ────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const task = await prisma.task.findFirst({
      where: scopedTaskQuery(req, { id }),
      include: {
        assignee:  { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        project:   { select: { id: true, name: true, color: true, icon: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, name: true, email: true } },
          },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        watchers: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        subtasks: {
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          include: {
            assignee: { select: { id: true, name: true, email: true } },
            children: {
              orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
              include: {
                assignee: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
        _count: {
          select: {
            comments: true,
            activities: true,
            watchers: true,
            subtasks: true,
          },
        },
      },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ task });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'GET /tasks/:id failed');
    }
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── POST /:id/watch — watch a task ──────────────────────────────────────────

router.post('/:id/watch', async (req, res) => {
  try {
    const { id } = req.params;

    const task = await prisma.task.findFirst({
      where: scopedTaskQuery(req, { id }),
    });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await prisma.taskWatcher.upsert({
      where:  { taskId_userId: { taskId: id, userId: req.userId } },
      create: { taskId: id, userId: req.userId },
      update: {},
    });

    await prisma.activity.create({
      data: {
        taskId:  task.id,
        userId:  req.userId,
        action:  'watched',
        details: 'Started watching this task',
      },
    });

    res.json({ watching: true, taskId: id });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'POST /tasks/:id/watch failed');
    }
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── DELETE /:id/watch — unwatch a task ──────────────────────────────────────

router.delete('/:id/watch', async (req, res) => {
  try {
    const { id } = req.params;

    const task = await prisma.task.findFirst({
      where: scopedTaskQuery(req, { id }),
    });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await prisma.taskWatcher.deleteMany({
      where: { taskId: id, userId: req.userId },
    });

    await prisma.activity.create({
      data: {
        taskId:  task.id,
        userId:  req.userId,
        action:  'unwatched',
        details: 'Stopped watching this task',
      },
    });

    res.json({ watching: false, taskId: id });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'DELETE /tasks/:id/watch failed');
    }
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── GET /:id/watchers — list watchers ───────────────────────────────────────

router.get('/:id/watchers', async (req, res) => {
  try {
    const { id } = req.params;

    const task = await prisma.task.findFirst({
      where: scopedTaskQuery(req, { id }),
    });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const watchers = await prisma.taskWatcher.findMany({
      where: { taskId: id },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({ watchers: watchers.map(w => w.user) });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'GET /tasks/:id/watchers failed');
    }
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

    const { title, description, status, priority, labels, order, position, assigneeId, projectId, dueDate } = req.body;

    // Validate assignee belongs to this team if being changed.
    if (assigneeId !== undefined && assigneeId !== null) {
      const assigneeMembership = await prisma.teamMembership.findUnique({
        where: { userId_teamId: { userId: assigneeId, teamId: req.teamId } },
      });
      if (!assigneeMembership) {
        return res.status(400).json({ error: 'Assignee is not a member of this team' });
      }
    }

    // Validate project belongs to this team if being changed.
    if (projectId !== undefined && projectId !== null) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, teamId: req.teamId },
      });
      if (!project) {
        return res.status(400).json({ error: 'Project not found in this team' });
      }
    }

    const updateData = {};
    if (title       !== undefined) updateData.title       = sanitize(title);
    if (description !== undefined) updateData.description = description != null ? sanitize(description) : null;
    if (status      !== undefined) updateData.status      = status;
    if (priority    !== undefined) updateData.priority    = priority;
    if (labels      !== undefined) {
      updateData.labels = Array.isArray(labels)
        ? labels.map(l => sanitize(String(l).trim())).filter(Boolean)
        : [];
    }
    if (order       !== undefined) updateData.order       = order;
    if (position    !== undefined) updateData.order       = position;
    if (assigneeId  !== undefined) updateData.assigneeId  = assigneeId;
    if (projectId   !== undefined) updateData.projectId   = projectId;
    if (dueDate     !== undefined) updateData.dueDate     = dueDate ? new Date(dueDate) : null;

    const task = await prisma.task.update({
      where:   { id },
      data:    updateData,
      include: {
        assignee:  { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        project:   { select: { id: true, name: true, color: true, icon: true } },
        watchers: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        subtasks: {
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          include: {
            assignee: { select: { id: true, name: true, email: true } },
            children: {
              orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
              include: {
                assignee: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
        _count: {
          select: {
            comments: true,
            activities: true,
            watchers: true,
            subtasks: true,
          },
        },
      },
    });

    // Granular activity tracking
    let action = 'updated';
    let details = 'Task details updated';

    if (status !== undefined && status !== existingTask.status) {
      action = 'status_changed';
      details = `${existingTask.status} → ${status}`;
    } else if (priority !== undefined && priority !== existingTask.priority) {
      action = 'priority_changed';
      details = `${existingTask.priority} → ${priority}`;
    } else if (title !== undefined && title !== existingTask.title) {
      action = 'title_changed';
      details = `Renamed to "${title}"`;
    } else if (assigneeId !== undefined && assigneeId !== existingTask.assigneeId) {
      action = 'assignee_changed';
      details = assigneeId ? 'Reassigned task' : 'Unassigned task';
    } else if (dueDate !== undefined) {
      action = 'due_date_changed';
      details = dueDate ? `Due date set to ${new Date(dueDate).toISOString().split('T')[0]}` : 'Due date removed';
    }

    await prisma.activity.create({
      data: {
        taskId:  task.id,
        userId:  req.userId,
        action,
        details,
      },
    });

    const isAssigned = assigneeId !== undefined && assigneeId !== existingTask.assigneeId && Boolean(assigneeId);

    // ── Notifications ──────────────────────────────────────────────────────────
    if (isAssigned) {
      const isReassignment = Boolean(existingTask.assigneeId);
      await createNotification({
        userId:  assigneeId,
        actorId: req.userId,
        teamId:  req.teamId,
        taskId:  task.id,
        type:    isReassignment ? 'task_reassigned' : 'task_assigned',
        title:   isReassignment ? 'Task reassigned' : 'Task assigned',
        message: `You were assigned to task "${task.title}"`,
        data:    { taskId: task.id, taskTitle: task.title, status: task.status, priority: task.priority },
      });
      emitTaskAssigned(req.teamId, task, existingTask.assigneeId);
    }

    if (status !== undefined && status !== existingTask.status) {
      const notifyType = status === 'done' ? 'task_completed' : 'status_changed';
      const notifyTitle = status === 'done' ? 'Task completed' : 'Task status updated';
      const notifyMsg = status === 'done'
        ? `Task "${task.title}" was marked as completed`
        : `Task "${task.title}" status changed to ${status.replace('_', ' ')}`;

      const recipients = new Set();
      if (task.assigneeId && task.assigneeId !== req.userId) {
        recipients.add(task.assigneeId);
      }
      if (task.createdById && task.createdById !== req.userId) {
        recipients.add(task.createdById);
      }

      for (const recipientId of recipients) {
        await createNotification({
          userId:  recipientId,
          actorId: req.userId,
          teamId:  req.teamId,
          taskId:  task.id,
          type:    notifyType,
          title:   notifyTitle,
          message: notifyMsg,
          data:    { taskId: task.id, taskTitle: task.title, oldStatus: existingTask.status, newStatus: status },
        });
      }

      if (status === 'done') {
        emitTaskCompleted(req.teamId, task);
        dispatchWebhookEvent(req.teamId, 'task.completed', task);
      }
    }

    emitTaskUpdated(req.teamId, task);
    dispatchWebhookEvent(req.teamId, 'task.updated', task);
    if (isAssigned) {
      dispatchWebhookEvent(req.teamId, 'task.assigned', task);
    }

    res.json({ task });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'PATCH /tasks/:id failed');
    }
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── DELETE /:id — delete a task ─────────────────────────────────────────────

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

    emitTaskDeleted(req.teamId, id);

    res.status(204).send();
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'DELETE /tasks/:id failed');
    }
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;

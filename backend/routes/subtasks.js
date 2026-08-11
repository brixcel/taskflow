const express     = require('express');
const prisma      = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const validate    = require('../middleware/validate');
const { sanitize } = require('../middleware/sanitize');
const schemas     = require('../validation/schemas');
const { scopedTaskQuery } = require('../helpers/scopedQuery');
const logger      = require('../middleware/logger');

const router = express.Router({ mergeParams: true }); // inherit :taskId from parent if mounted under /tasks/:taskId/subtasks

// Apply auth + team resolution to all subtask routes.
router.use(requireAuth, resolveTeam);

// ─── Helper: verify parent task exists and belongs to active team ─────────────

async function requireTaskInTeam(req, res, taskId) {
  const targetTaskId = taskId || req.params.taskId;
  if (!targetTaskId) {
    res.status(400).json({ error: 'taskId is required' });
    return null;
  }

  const task = await prisma.task.findFirst({
    where: scopedTaskQuery(req, { id: targetTaskId }),
  });

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return null;
  }

  return task;
}

// ─── Helper: resolve subtask and verify tenant isolation via parent task ──────

async function resolveSubtask(req, res, subtaskId) {
  const targetId = subtaskId || req.params.subtaskId || req.params.id;
  if (!targetId) {
    res.status(400).json({ error: 'subtaskId is required' });
    return null;
  }

  const subtask = await prisma.subtask.findUnique({
    where: { id: targetId },
    include: {
      task: {
        select: {
          id: true,
          teamId: true,
          createdById: true,
          title: true,
        },
      },
      assignee: { select: { id: true, name: true, email: true } },
      children: {
        orderBy: { order: 'asc' },
        include: { assignee: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  if (!subtask || subtask.task.teamId !== req.teamId) {
    res.status(404).json({ error: 'Subtask not found' });
    return null;
  }

  // If :taskId parameter is present in URL, ensure it matches
  if (req.params.taskId && subtask.taskId !== req.params.taskId) {
    res.status(404).json({ error: 'Subtask does not belong to this task' });
    return null;
  }

  return subtask;
}

// ─── POST /tasks/:taskId/subtasks — create a subtask ──────────────────────────

router.post('/', validate(schemas.subtaskCreate), async (req, res) => {
  try {
    const task = await requireTaskInTeam(req, res);
    if (!task) return;

    const { title, completed, order, position, dueDate, assigneeId, parentId } = req.body;

    // Validate assignee belongs to this team if provided
    if (assigneeId) {
      const assigneeMembership = await prisma.teamMembership.findUnique({
        where: { userId_teamId: { userId: assigneeId, teamId: req.teamId } },
      });
      if (!assigneeMembership) {
        return res.status(400).json({ error: 'Assignee is not a member of this team' });
      }
    }

    // Validate parent subtask belongs to the same task if provided
    if (parentId) {
      const parentSubtask = await prisma.subtask.findFirst({
        where: { id: parentId, taskId: task.id },
      });
      if (!parentSubtask) {
        return res.status(400).json({ error: 'Parent subtask not found for this task' });
      }
    }

    let subtaskOrder = order !== undefined ? order : (position !== undefined ? position : null);
    if (subtaskOrder == null) {
      const lastSubtask = await prisma.subtask.findFirst({
        where: { taskId: task.id, parentId: parentId || null },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      subtaskOrder = (lastSubtask?.order ?? 0) + 1000;
    }

    const subtask = await prisma.subtask.create({
      data: {
        title:      sanitize(title),
        completed:  Boolean(completed),
        order:      subtaskOrder,
        dueDate:    dueDate ? new Date(dueDate) : null,
        taskId:     task.id,
        assigneeId: assigneeId || null,
        parentId:   parentId || null,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        children: {
          orderBy: { order: 'asc' },
          include: { assignee: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    // Record activity on parent task
    await prisma.activity.create({
      data: {
        taskId:  task.id,
        userId:  req.userId,
        action:  'subtask_created',
        details: `Added subtask "${subtask.title}"`,
      },
    });

    res.status(201).json({ subtask });
  } catch (error) {
    logger.error({ err: error }, 'POST subtasks failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── GET /tasks/:taskId/subtasks — list subtasks for a task ───────────────────

router.get('/', async (req, res) => {
  try {
    const task = await requireTaskInTeam(req, res);
    if (!task) return;

    const subtasks = await prisma.subtask.findMany({
      where:   { taskId: task.id },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        children: {
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          include: { assignee: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    const totalCount = subtasks.length;
    const completedCount = subtasks.filter(s => s.completed).length;
    const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    res.json({
      subtasks,
      summary: {
        total: totalCount,
        completed: completedCount,
        progressPercent,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'GET subtasks failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── PATCH /subtasks/reorder/batch — batch update subtasks order/parent ────────

router.patch('/reorder/batch', validate(schemas.subtasksBatchReorder), async (req, res) => {
  try {
    const { subtasks: updates } = req.body;
    const subtaskIds = updates.map(u => u.id);

    // Verify all subtasks belong to tasks within the active team
    const foundSubtasks = await prisma.subtask.findMany({
      where: {
        id: { in: subtaskIds },
        task: { teamId: req.teamId },
      },
      select: { id: true, taskId: true },
    });

    if (foundSubtasks.length !== subtaskIds.length) {
      return res.status(404).json({ error: 'One or more subtasks not found in this team' });
    }

    // Perform updates in a transaction
    await prisma.$transaction(
      updates.map(u => {
        const updateData = {};
        if (u.order !== undefined)    updateData.order = u.order;
        if (u.position !== undefined) updateData.order = u.position;
        if (u.parentId !== undefined) updateData.parentId = u.parentId;

        return prisma.subtask.update({
          where: { id: u.id },
          data: updateData,
        });
      })
    );

    res.json({ success: true, count: updates.length });
  } catch (error) {
    logger.error({ err: error }, 'PATCH /subtasks/reorder/batch failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── GET /subtasks/:subtaskId or /tasks/:taskId/subtasks/:subtaskId ───────────

router.get('/:subtaskId', async (req, res) => {
  try {
    const subtask = await resolveSubtask(req, res);
    if (!subtask) return;

    res.json({ subtask });
  } catch (error) {
    logger.error({ err: error }, 'GET /subtasks/:subtaskId failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── PATCH /subtasks/:subtaskId or /tasks/:taskId/subtasks/:subtaskId ─────────

router.patch('/:subtaskId', validate(schemas.subtaskUpdate), async (req, res) => {
  try {
    const existingSubtask = await resolveSubtask(req, res);
    if (!existingSubtask) return;

    const { title, completed, order, position, dueDate, assigneeId, parentId } = req.body;

    // Validate assignee belongs to this team if changed
    if (assigneeId !== undefined && assigneeId !== null) {
      const assigneeMembership = await prisma.teamMembership.findUnique({
        where: { userId_teamId: { userId: assigneeId, teamId: req.teamId } },
      });
      if (!assigneeMembership) {
        return res.status(400).json({ error: 'Assignee is not a member of this team' });
      }
    }

    // Validate parent subtask if changed
    if (parentId !== undefined && parentId !== null) {
      if (parentId === existingSubtask.id) {
        return res.status(400).json({ error: 'A subtask cannot be its own parent' });
      }
      const parentSubtask = await prisma.subtask.findFirst({
        where: { id: parentId, taskId: existingSubtask.taskId },
      });
      if (!parentSubtask) {
        return res.status(400).json({ error: 'Parent subtask not found for this task' });
      }
    }

    const updateData = {};
    if (title       !== undefined) updateData.title      = sanitize(title);
    if (completed   !== undefined) updateData.completed  = Boolean(completed);
    if (order       !== undefined) updateData.order      = order;
    if (position    !== undefined) updateData.order      = position;
    if (dueDate     !== undefined) updateData.dueDate    = dueDate ? new Date(dueDate) : null;
    if (assigneeId  !== undefined) updateData.assigneeId = assigneeId;
    if (parentId    !== undefined) updateData.parentId   = parentId;

    const subtask = await prisma.subtask.update({
      where: { id: existingSubtask.id },
      data:  updateData,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        children: {
          orderBy: { order: 'asc' },
          include: { assignee: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    // Granular activity tracking
    let action = 'subtask_updated';
    let details = `Updated subtask "${subtask.title}"`;

    if (completed !== undefined && completed !== existingSubtask.completed) {
      action = 'subtask_completed';
      details = completed
        ? `Completed subtask "${subtask.title}"`
        : `Uncompleted subtask "${subtask.title}"`;
    } else if (title !== undefined && title !== existingSubtask.title) {
      action = 'subtask_updated';
      details = `Renamed subtask to "${subtask.title}"`;
    } else if (assigneeId !== undefined && assigneeId !== existingSubtask.assigneeId) {
      action = 'subtask_assigned';
      details = assigneeId
        ? `Assigned subtask "${subtask.title}"`
        : `Unassigned subtask "${subtask.title}"`;
    } else if (dueDate !== undefined) {
      action = 'subtask_due_date_changed';
      details = dueDate
        ? `Subtask "${subtask.title}" due ${new Date(dueDate).toISOString().split('T')[0]}`
        : `Removed due date from subtask "${subtask.title}"`;
    }

    await prisma.activity.create({
      data: {
        taskId:  existingSubtask.taskId,
        userId:  req.userId,
        action,
        details,
      },
    });

    res.json({ subtask });
  } catch (error) {
    logger.error({ err: error }, 'PATCH /subtasks/:subtaskId failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── DELETE /subtasks/:subtaskId or /tasks/:taskId/subtasks/:subtaskId ───────

router.delete('/:subtaskId', async (req, res) => {
  try {
    const existingSubtask = await resolveSubtask(req, res);
    if (!existingSubtask) return;

    // RBAC: allowed for task creator, subtask assignee, or team admin/owner
    const isTaskCreator    = existingSubtask.task.createdById === req.userId;
    const isSubtaskAssignee = existingSubtask.assigneeId === req.userId;
    const isElevated       = ['admin', 'owner'].includes(req.teamRole);

    if (!isTaskCreator && !isSubtaskAssignee && !isElevated) {
      return res.status(403).json({
        error: 'Forbidden — only the task creator, subtask assignee, or an admin/owner can delete subtasks',
      });
    }

    await prisma.subtask.delete({ where: { id: existingSubtask.id } });

    await prisma.activity.create({
      data: {
        taskId:  existingSubtask.taskId,
        userId:  req.userId,
        action:  'subtask_deleted',
        details: `Deleted subtask "${existingSubtask.title}"`,
      },
    });

    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, 'DELETE /subtasks/:subtaskId failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;

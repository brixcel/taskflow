const express    = require('express');
const prisma     = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const requireRole = require('../middleware/requireRole');
const validate   = require('../middleware/validate');
const { sanitize } = require('../middleware/sanitize');
const schemas    = require('../validation/schemas');
const { scopedTaskQuery } = require('../helpers/scopedQuery');
const logger     = require('../middleware/logger');

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

    res.status(201).json({ task });
  } catch (error) {
    logger.error({ err: error }, 'POST /tasks failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── GET / — list tasks for the active team ───────────────────────────────────
//
// Pagination params:
//   page     — 1-based page number (default: 1)
//   pageSize — items per page (default: 20, max: 100)
//
// Response includes a `pagination` envelope:
//   { total, page, pageSize, totalPages }

router.get('/', async (req, res) => {
  try {
    const { status, assigneeId, search } = req.query;

    // ── Pagination ────────────────────────────────────────────────────────────
    const page     = Math.max(1, parseInt(req.query.page,     10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const skip     = (page - 1) * pageSize;

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

    // Run count and fetch in parallel for efficiency
    const [total, tasks] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          assignee:  { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
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
    logger.error({ err: error }, 'GET /tasks failed');
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

    res.json({ task });
  } catch (error) {
    logger.error({ err: error }, 'PATCH /tasks/:id failed');
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

    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, 'DELETE /tasks/:id failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;

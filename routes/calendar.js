const express = require('express');
const prisma = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const validate = require('../middleware/validate');
const schemas = require('../validation/schemas');
const { scopedTaskQuery } = require('../helpers/scopedQuery');
const logger = require('../middleware/logger');

const router = express.Router();

// Apply auth and team resolution
router.use(requireAuth, resolveTeam);

/**
 * Helper to parse a date query string safely into Start of Day or End of Day
 */
function parseDateBoundary(dateStr, isEndOfDay = false) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;

  // If dateStr is just YYYY-MM-DD (length 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, day] = dateStr.split('-').map(Number);
    if (isEndOfDay) {
      return new Date(Date.UTC(y, m - 1, day, 23, 59, 59, 999));
    }
    return new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0));
  }

  if (isEndOfDay && !dateStr.includes('T')) {
    d.setUTCHours(23, 59, 59, 999);
  }
  return d;
}

// ─── GET /tasks — fetch tasks for calendar date range ─────────────────────────
router.get('/tasks', validate(schemas.calendarQuery, 'query'), async (req, res) => {
  try {
    const { from, to, projectId, assigneeId, status, includeOverdue } = req.query;

    const fromDate = parseDateBoundary(from, false);
    const toDate   = parseDateBoundary(to, true);

    const where = scopedTaskQuery(req);

    // Apply date range filter on dueDate if provided
    if (fromDate || toDate) {
      where.dueDate = {};
      if (fromDate) where.dueDate.gte = fromDate;
      if (toDate)   where.dueDate.lte = toDate;
    } else {
      // If no range specified, only fetch tasks that have a dueDate set
      where.dueDate = { not: null };
    }

    // Status filter
    if (status) {
      where.status = status;
    }

    // Assignee filter
    if (assigneeId) {
      if (assigneeId === 'me') {
        where.assigneeId = req.userId;
      } else if (assigneeId === 'unassigned' || assigneeId === 'null') {
        where.assigneeId = null;
      } else {
        where.assigneeId = assigneeId;
      }
    }

    // Project filter
    if (projectId) {
      if (projectId === 'unassigned' || projectId === 'null') {
        where.projectId = null;
      } else {
        where.projectId = projectId;
      }
    }

    const taskInclude = {
      assignee:  { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      project:   { select: { id: true, name: true, color: true, icon: true } },
      subtasks:  { select: { id: true, completed: true } },
      _count: {
        select: {
          comments: true,
          activities: true,
          subtasks: true,
        },
      },
    };

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [
        { dueDate: 'asc' },
        { order: 'asc' },
        { createdAt: 'desc' },
      ],
      include: taskInclude,
    });

    let overdueTasks = [];
    const shouldFetchOverdue = includeOverdue !== false && includeOverdue !== 'false';

    if (shouldFetchOverdue) {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const overdueWhere = scopedTaskQuery(req, {
        dueDate: { lt: startOfToday },
        status: { not: 'done' },
      });

      if (assigneeId) {
        if (assigneeId === 'me') overdueWhere.assigneeId = req.userId;
        else if (assigneeId === 'unassigned' || assigneeId === 'null') overdueWhere.assigneeId = null;
        else overdueWhere.assigneeId = assigneeId;
      }

      if (projectId) {
        if (projectId === 'unassigned' || projectId === 'null') overdueWhere.projectId = null;
        else overdueWhere.projectId = projectId;
      }

      overdueTasks = await prisma.task.findMany({
        where: overdueWhere,
        orderBy: [
          { dueDate: 'asc' },
          { createdAt: 'desc' },
        ],
        include: taskInclude,
      });
    }

    res.json({
      tasks,
      overdueTasks,
      range: {
        from: fromDate ? fromDate.toISOString() : null,
        to:   toDate   ? toDate.toISOString()   : null,
      },
      total: tasks.length,
      overdueCount: overdueTasks.length,
    });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'GET /calendar/tasks failed');
    }
    res.status(500).json({ error: 'Something went wrong fetching calendar tasks' });
  }
});

// ─── GET /stats — calendar summary statistics ─────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [dueToday, dueThisWeek, dueThisMonth, overdueCount] = await Promise.all([
      prisma.task.count({
        where: scopedTaskQuery(req, {
          dueDate: { gte: startOfToday, lte: endOfToday },
          status: { not: 'done' },
        }),
      }),
      prisma.task.count({
        where: scopedTaskQuery(req, {
          dueDate: { gte: startOfWeek, lte: endOfWeek },
          status: { not: 'done' },
        }),
      }),
      prisma.task.count({
        where: scopedTaskQuery(req, {
          dueDate: { gte: startOfMonth, lte: endOfMonth },
          status: { not: 'done' },
        }),
      }),
      prisma.task.count({
        where: scopedTaskQuery(req, {
          dueDate: { lt: startOfToday },
          status: { not: 'done' },
        }),
      }),
    ]);

    res.json({
      dueToday,
      dueThisWeek,
      dueThisMonth,
      overdueCount,
    });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'GET /calendar/stats failed');
    }
    res.status(500).json({ error: 'Something went wrong fetching calendar statistics' });
  }
});

module.exports = router;

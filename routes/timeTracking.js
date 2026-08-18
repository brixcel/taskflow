const express = require('express');
const timeRouter = express.Router();
const taskTimeRouter = express.Router({ mergeParams: true });
const prisma = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const validate = require('../middleware/validate');
const schemas = require('../validation/schemas');
const logger = require('../middleware/logger');

// Enforce auth & team resolution on both routers
timeRouter.use(requireAuth, resolveTeam);
taskTimeRouter.use(requireAuth, resolveTeam);

// Helper: compute start & end dates for range
function getDateRange(range = 'this_week') {
  const now = new Date();
  let start = new Date(now);

  if (range === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (range === 'yesterday') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    return { start, end };
  } else if (range === 'this_week') {
    const day = now.getDay() || 7; // 1 (Mon) - 7 (Sun)
    start.setDate(now.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);
  } else if (range === 'last_week') {
    const day = now.getDay() || 7;
    start.setDate(now.getDate() - day - 6);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  } else if (range === 'this_month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (range === 'last_month') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { start, end };
  } else if (range === 'all') {
    return { start: null, end: null };
  }

  return { start, end: new Date() };
}

// ─── Task Time Endpoints (/tasks/:taskId/time, /tasks/:taskId/estimate) ───────

// 1. POST /tasks/:taskId/time/start — Start live stopwatch timer
taskTimeRouter.post('/:taskId/time/start', async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await prisma.task.findFirst({
      where: { id: taskId, teamId: req.teamId },
      select: { id: true, title: true, projectId: true, estimatedMinutes: true },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const now = new Date();

    // 1. Stop any active timers for this user
    const running = await prisma.timeEntry.findMany({
      where: {
        userId: req.userId,
        teamId: req.teamId,
        isRunning: true,
      },
    });

    for (const entry of running) {
      const elapsed = Math.max(1, Math.round((now.getTime() - new Date(entry.startTime).getTime()) / (1000 * 60)));
      await prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          isRunning: false,
          endTime: now,
          durationMinutes: elapsed,
        },
      });
    }

    // 2. Create new running timer
    const body = req.body || {};
    const result = await prisma.timeEntry.create({
      data: {
        taskId,
        userId: req.userId,
        teamId: req.teamId,
        startTime: now,
        isRunning: true,
        isBillable: body.isBillable !== false,
        hourlyRate: body.hourlyRate || null,
        description: body.description || null,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        task: { select: { id: true, title: true, projectId: true } },
      },
    });

    res.status(201).json({
      timeEntry: result,
      task,
      message: 'Timer started successfully',
    });
  } catch (error) {
    logger.error('Error starting timer:', error);
    res.status(500).json({ error: error.message || 'Failed to start timer' });
  }
});

// 2. POST /tasks/:taskId/time/stop — Stop active stopwatch timer
taskTimeRouter.post('/:taskId/time/stop', async (req, res) => {
  try {
    const { taskId } = req.params;

    const runningEntry = await prisma.timeEntry.findFirst({
      where: {
        taskId,
        userId: req.userId,
        teamId: req.teamId,
        isRunning: true,
      },
    });

    if (!runningEntry) {
      return res.status(400).json({ error: 'No active running timer found for this task' });
    }

    const now = new Date();
    const elapsedMinutes = Math.max(1, Math.round((now.getTime() - new Date(runningEntry.startTime).getTime()) / (1000 * 60)));

    const updated = await prisma.timeEntry.update({
      where: { id: runningEntry.id },
      data: {
        isRunning: false,
        endTime: now,
        durationMinutes: elapsedMinutes,
        description: (req.body && req.body.description !== undefined) ? req.body.description : runningEntry.description,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        task: { select: { id: true, title: true } },
      },
    });

    res.json({
      timeEntry: updated,
      durationMinutes: elapsedMinutes,
      message: 'Timer stopped successfully',
    });
  } catch (error) {
    logger.error('Error stopping timer:', error);
    res.status(500).json({ error: 'Failed to stop timer' });
  }
});

// 3. POST /tasks/:taskId/time/log — Manually log time entry
taskTimeRouter.post('/:taskId/time/log', validate(schemas.timeEntryLog), async (req, res) => {
  try {
    const { taskId } = req.params;
    const { durationMinutes, description, isBillable = true, hourlyRate, startTime } = req.body;

    const task = await prisma.task.findFirst({
      where: { id: taskId, teamId: req.teamId },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const start = startTime ? new Date(startTime) : new Date();
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    const timeEntry = await prisma.timeEntry.create({
      data: {
        taskId,
        userId: req.userId,
        teamId: req.teamId,
        durationMinutes,
        description: description || null,
        isBillable,
        hourlyRate: hourlyRate || null,
        startTime: start,
        endTime: end,
        isRunning: false,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        task: { select: { id: true, title: true } },
      },
    });

    res.status(201).json({
      timeEntry,
      message: 'Time logged successfully',
    });
  } catch (error) {
    logger.error('Error logging time:', error);
    res.status(500).json({ error: 'Failed to log time' });
  }
});

// 4. GET /tasks/:taskId/time — Get all time entries for a task
taskTimeRouter.get('/:taskId/time', async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await prisma.task.findFirst({
      where: { id: taskId, teamId: req.teamId },
      select: {
        id: true,
        title: true,
        estimatedMinutes: true,
      },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const entries = await prisma.timeEntry.findMany({
      where: {
        taskId,
        teamId: req.teamId,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { startTime: 'desc' },
    });

    const totalDurationMinutes = entries.reduce((sum, e) => sum + (e.durationMinutes || 0), 0);
    const estimatedMinutes = task.estimatedMinutes || 0;
    const progressPercent = estimatedMinutes > 0 ? Math.min(Math.round((totalDurationMinutes / estimatedMinutes) * 100), 100) : null;

    res.json({
      task: {
        id: task.id,
        title: task.title,
        estimatedMinutes,
      },
      totalDurationMinutes,
      progressPercent,
      entries,
    });
  } catch (error) {
    logger.error('Error fetching task time entries:', error);
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
});

// 5. PATCH /tasks/:taskId/estimate — Update task work estimate
taskTimeRouter.patch('/:taskId/estimate', validate(schemas.taskEstimateUpdate), async (req, res) => {
  try {
    const { taskId } = req.params;
    const { estimatedMinutes } = req.body;

    const task = await prisma.task.findFirst({
      where: { id: taskId, teamId: req.teamId },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { estimatedMinutes },
      select: {
        id: true,
        title: true,
        estimatedMinutes: true,
      },
    });

    res.json({
      task: updated,
      message: 'Work estimate updated successfully',
    });
  } catch (error) {
    logger.error('Error updating task estimate:', error);
    res.status(500).json({ error: 'Failed to update task estimate' });
  }
});

// ─── Time General Endpoints (/time/running, /time/summary, /time/:entryId) ────

// 6. GET /time/running — Get user's active running timer
timeRouter.get('/running', async (req, res) => {
  try {
    const runningEntry = await prisma.timeEntry.findFirst({
      where: {
        userId: req.userId,
        teamId: req.teamId,
        isRunning: true,
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            priority: true,
            project: { select: { id: true, name: true, color: true } },
          },
        },
      },
    });

    if (!runningEntry) {
      return res.json({ running: false, entry: null });
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(runningEntry.startTime).getTime()) / 1000));

    res.json({
      running: true,
      entry: runningEntry,
      elapsedSeconds,
    });
  } catch (error) {
    logger.error('Error fetching running timer:', error);
    res.status(500).json({ error: 'Failed to fetch active timer' });
  }
});

// 7. PATCH /time/:entryId — Update time entry
timeRouter.patch('/:entryId', validate(schemas.timeEntryUpdate), async (req, res) => {
  try {
    const { entryId } = req.params;

    const existing = await prisma.timeEntry.findFirst({
      where: { id: entryId, teamId: req.teamId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    // Role check: Only creator or owner/admin can edit
    const isOwner = existing.userId === req.userId;
    const isElevated = req.userRole === 'owner' || req.userRole === 'admin';
    if (!isOwner && !isElevated) {
      return res.status(403).json({ error: 'You do not have permission to modify this time entry' });
    }

    const updated = await prisma.timeEntry.update({
      where: { id: entryId },
      data: req.body,
      include: {
        user: { select: { id: true, name: true, email: true } },
        task: { select: { id: true, title: true } },
      },
    });

    res.json({
      timeEntry: updated,
      message: 'Time entry updated successfully',
    });
  } catch (error) {
    logger.error('Error updating time entry:', error);
    res.status(500).json({ error: 'Failed to update time entry' });
  }
});

// 8. DELETE /time/:entryId — Delete time entry
timeRouter.delete('/:entryId', async (req, res) => {
  try {
    const { entryId } = req.params;

    const existing = await prisma.timeEntry.findFirst({
      where: { id: entryId, teamId: req.teamId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    // Role check: Only creator or owner/admin can delete
    const isOwner = existing.userId === req.userId;
    const isElevated = req.userRole === 'owner' || req.userRole === 'admin';
    if (!isOwner && !isElevated) {
      return res.status(403).json({ error: 'You do not have permission to delete this time entry' });
    }

    await prisma.timeEntry.delete({
      where: { id: entryId },
    });

    res.json({ success: true, message: 'Time entry deleted successfully' });
  } catch (error) {
    logger.error('Error deleting time entry:', error);
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

// 9. GET /time/summary — Team & project time summary report
timeRouter.get('/summary', async (req, res) => {
  try {
    const { range = 'this_week', userId, projectId } = req.query;
    const { start, end } = getDateRange(range);

    const where = {
      teamId: req.teamId,
      isRunning: false, // only completed entries
    };

    if (start && end) {
      where.startTime = { gte: start, lte: end };
    }

    if (userId) {
      where.userId = userId;
    }

    if (projectId) {
      where.task = { projectId };
    }

    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        task: {
          select: {
            id: true,
            title: true,
            projectId: true,
            project: { select: { id: true, name: true, color: true } },
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });

    const totalMinutes = entries.reduce((acc, e) => acc + (e.durationMinutes || 0), 0);
    const billableMinutes = entries
      .filter((e) => e.isBillable)
      .reduce((acc, e) => acc + (e.durationMinutes || 0), 0);
    const nonBillableMinutes = totalMinutes - billableMinutes;

    // Project breakdown
    const projectMap = {};
    entries.forEach((e) => {
      const pId = e.task?.projectId || 'unassigned';
      const pName = e.task?.project?.name || 'No Project';
      const pColor = e.task?.project?.color || '#6366f1';
      if (!projectMap[pId]) {
        projectMap[pId] = { id: pId, name: pName, color: pColor, minutes: 0 };
      }
      projectMap[pId].minutes += e.durationMinutes || 0;
    });

    // User breakdown
    const userMap = {};
    entries.forEach((e) => {
      const uId = e.userId;
      const uName = e.user?.name || 'Unknown';
      if (!userMap[uId]) {
        userMap[uId] = { id: uId, name: uName, minutes: 0 };
      }
      userMap[uId].minutes += e.durationMinutes || 0;
    });

    res.json({
      summary: {
        range,
        totalMinutes,
        totalHours: parseFloat((totalMinutes / 60).toFixed(2)),
        billableMinutes,
        billableHours: parseFloat((billableMinutes / 60).toFixed(2)),
        nonBillableMinutes,
        nonBillableHours: parseFloat((nonBillableMinutes / 60).toFixed(2)),
        entriesCount: entries.length,
      },
      byProject: Object.values(projectMap),
      byUser: Object.values(userMap),
      recentEntries: entries.slice(0, 20),
    });
  } catch (error) {
    logger.error('Error generating time summary:', error);
    res.status(500).json({ error: 'Failed to generate time summary' });
  }
});

module.exports = {
  timeRouter,
  taskTimeRouter,
};

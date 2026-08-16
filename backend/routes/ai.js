const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const prisma = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const validate = require('../middleware/validate');
const schemas = require('../validation/schemas');
const {
  generateTaskFromPrompt,
  breakdownTaskIntoSubtasks,
  generateProjectPlan,
  applyProjectPlan,
  generateProductivityInsights,
  executeNaturalSearch,
} = require('../services/ai');
const { emitProjectCreated, emitTaskCreated } = require('../services/realtime');
const logger = require('../middleware/logger');

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Please wait a few minutes before trying again.' },
});

router.use(requireAuth, resolveTeam, aiLimiter);

router.post('/generate-task', validate(schemas.aiTaskGenerateRequest), async (req, res) => {
  try {
    const { prompt, projectId, currentContext } = req.body;

    let targetProject = null;
    if (projectId) {
      targetProject = await prisma.project.findFirst({
        where: {
          id: projectId,
          teamId: req.teamId,
        },
        select: {
          id: true,
          name: true,
          description: true,
          color: true,
        },
      });

      if (!targetProject) {
        return res.status(404).json({ error: 'Project not found in this team' });
      }
    }

    const suggestion = await generateTaskFromPrompt({
      prompt,
      project: targetProject,
      currentContext: currentContext || '',
    });

    res.json({
      success: true,
      suggestion,
    });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'POST /ai/generate-task failed');
    }
    res.status(500).json({ error: 'Failed to generate task with AI' });
  }
});

router.post('/breakdown-task', validate(schemas.aiTaskBreakdownRequest), async (req, res) => {
  try {
    const { taskId, title, description, projectId } = req.body;

    let taskTitle = title || '';
    let taskDescription = description || '';
    let existingSubtasks = [];
    let projectContext = null;

    if (taskId) {
      const task = await prisma.task.findFirst({
        where: {
          id: taskId,
          teamId: req.teamId,
        },
        include: {
          subtasks: {
            select: { id: true, title: true, completed: true, order: true },
          },
          project: {
            select: { id: true, name: true, description: true },
          },
        },
      });

      if (!task) {
        return res.status(404).json({ error: 'Task not found in this team' });
      }

      taskTitle = task.title;
      taskDescription = task.description || '';
      existingSubtasks = task.subtasks || [];
      projectContext = task.project;
    } else if (projectId) {
      projectContext = await prisma.project.findFirst({
        where: {
          id: projectId,
          teamId: req.teamId,
        },
        select: { id: true, name: true, description: true },
      });

      if (!projectContext) {
        return res.status(404).json({ error: 'Project not found in this team' });
      }
    }

    const result = await breakdownTaskIntoSubtasks({
      title: taskTitle,
      description: taskDescription,
      existingSubtasks,
      projectContext,
    });

    res.json({
      success: true,
      subtasks: result.subtasks,
    });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'POST /ai/breakdown-task failed');
    }
    res.status(500).json({ error: 'Failed to break down task with AI' });
  }
});

router.post('/plan-project', validate(schemas.aiProjectPlanRequest), async (req, res) => {
  try {
    const { prompt, timeframeWeeks, template } = req.body;

    const team = await prisma.team.findUnique({
      where: { id: req.teamId },
      select: { id: true, name: true },
    });

    const plan = await generateProjectPlan({
      prompt,
      timeframeWeeks: timeframeWeeks || 4,
      teamContext: team,
    });

    res.json({
      success: true,
      plan,
    });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'POST /ai/plan-project failed');
    }
    res.status(500).json({ error: 'Failed to generate project plan with AI' });
  }
});

router.post('/apply-project-plan', validate(schemas.aiProjectApplyRequest), async (req, res) => {
  try {
    const result = await applyProjectPlan({
      teamId: req.teamId,
      userId: req.userId,
      planData: req.body,
      prismaInstance: prisma,
    });

    // Notify connected realtime clients
    try {
      if (typeof emitProjectCreated === 'function') {
        emitProjectCreated(req.teamId, result.project);
      }
      if (typeof emitTaskCreated === 'function' && Array.isArray(result.tasks)) {
        for (const t of result.tasks) {
          emitTaskCreated(req.teamId, t);
        }
      }
    } catch {
      // Realtime notification is non-blocking
    }

    res.status(201).json({
      success: true,
      project: result.project,
      tasksCount: result.tasksCount,
      subtasksCount: result.subtasksCount,
      tasks: result.tasks,
    });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'POST /ai/apply-project-plan failed');
    }
    res.status(500).json({ error: 'Failed to apply project plan' });
  }
});

router.get('/productivity-insights', validate(schemas.aiProductivityInsightsQuery, 'query'), async (req, res) => {
  try {
    const { range = '7d', userId, projectId } = req.query;

    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, teamId: req.teamId },
        select: { id: true, name: true },
      });
      if (!project) {
        return res.status(404).json({ error: 'Project not found in this team' });
      }
    }

    if (userId) {
      const membership = await prisma.teamMembership.findUnique({
        where: { userId_teamId: { userId, teamId: req.teamId } },
      });
      if (!membership) {
        return res.status(403).json({ error: 'User is not a member of this team' });
      }
    }

    const team = await prisma.team.findUnique({
      where: { id: req.teamId },
      select: { id: true, name: true },
    });

    const insights = await generateProductivityInsights({
      teamId: req.teamId,
      userId: userId || null,
      projectId: projectId || null,
      range,
      teamName: team?.name || 'Your team',
      prismaInstance: prisma,
    });

    res.json({
      success: true,
      insights,
    });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'GET /ai/productivity-insights failed');
    }
    res.status(500).json({ error: 'Failed to generate productivity insights' });
  }
});

router.post('/search', validate(schemas.aiSearchRequest), async (req, res) => {
  try {
    const { prompt, executeSearch = true, page = 1, pageSize = 20 } = req.body;

    const result = await executeNaturalSearch({
      prompt,
      teamId: req.teamId,
      userId: req.userId,
      executeSearch,
      page,
      pageSize,
      prismaInstance: prisma,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'POST /ai/search failed');
    }
    res.status(500).json({ error: 'Failed to process natural language search' });
  }
});

module.exports = router;


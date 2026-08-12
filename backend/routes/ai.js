const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const prisma = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const validate = require('../middleware/validate');
const schemas = require('../validation/schemas');
const { generateTaskFromPrompt, breakdownTaskIntoSubtasks } = require('../services/ai');
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

module.exports = router;

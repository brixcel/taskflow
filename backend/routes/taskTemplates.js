const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const validate = require('../middleware/validate');
const schemas = require('../validation/schemas');
const logger = require('../middleware/logger');

// ─── Built-in System Preset Templates ─────────────────────────────────────────

const SYSTEM_PRESET_TEMPLATES = [
  {
    id: 'preset-software-bug',
    name: 'Software Bug / Defect',
    description: 'Standard engineering bug triage, investigation, reproduction, and verification workflow.',
    category: 'Engineering',
    defaultPriority: 'high',
    defaultLabels: ['bug', 'engineering'],
    subtasks: [
      { title: 'Reproduce bug and capture reproduction steps / logs', estimatedHours: 1 },
      { title: 'Investigate root cause and isolate component', estimatedHours: 2 },
      { title: 'Implement patch and write regression test', estimatedHours: 3 },
      { title: 'Code review and verify on staging environment', estimatedHours: 1 },
      { title: 'Deploy fix and verify monitoring metrics', estimatedHours: 1 },
    ],
    automationRules: {
      autoDueDays: 2,
      defaultStatus: 'todo',
      autoAssignToCreator: true,
    },
    isPreset: true,
  },
  {
    id: 'preset-feature-development',
    name: 'Feature Development Sprint',
    description: 'Full-lifecycle feature delivery from requirements analysis to deployment.',
    category: 'Engineering',
    defaultPriority: 'medium',
    defaultLabels: ['feature', 'dev'],
    subtasks: [
      { title: 'Review specifications, acceptance criteria, and edge cases', estimatedHours: 2 },
      { title: 'Draft database migrations and Prisma schema updates', estimatedHours: 3 },
      { title: 'Build backend API endpoints and validation schemas', estimatedHours: 5 },
      { title: 'Construct frontend UI components and state management', estimatedHours: 6 },
      { title: 'Write automated unit and integration tests', estimatedHours: 4 },
      { title: 'Submit Pull Request, address review feedback, and deploy', estimatedHours: 2 },
    ],
    automationRules: {
      autoDueDays: 7,
      defaultStatus: 'todo',
      autoAssignToCreator: true,
    },
    isPreset: true,
  },
  {
    id: 'preset-client-onboarding',
    name: 'Client Onboarding & Setup',
    description: 'Step-by-step account provisioning, workspace setup, and training milestone.',
    category: 'Operations',
    defaultPriority: 'medium',
    defaultLabels: ['onboarding', 'client'],
    subtasks: [
      { title: 'Send welcome packet and workspace invitation links', estimatedHours: 1 },
      { title: 'Configure team roles, projects, and custom permissions', estimatedHours: 2 },
      { title: 'Connect Slack / Discord webhooks and notification settings', estimatedHours: 1 },
      { title: 'Host 30-minute kickoff and platform walkthrough session', estimatedHours: 1 },
      { title: 'Review first sprint milestone and gather initial feedback', estimatedHours: 2 },
    ],
    automationRules: {
      autoDueDays: 5,
      defaultStatus: 'todo',
      autoAssignToCreator: false,
    },
    isPreset: true,
  },
  {
    id: 'preset-design-sprint',
    name: 'UI/UX Design Sprint',
    description: 'User-centered design workflow: wireframing, component tokens, prototyping, and handoff.',
    category: 'Design',
    defaultPriority: 'medium',
    defaultLabels: ['design', 'ui-ux'],
    subtasks: [
      { title: 'Conduct discovery interviews and synthesize user requirements', estimatedHours: 3 },
      { title: 'Create low-fidelity wireframes and user flow diagram', estimatedHours: 4 },
      { title: 'Design high-fidelity mockups in Figma with design tokens', estimatedHours: 6 },
      { title: 'Build clickable interactive prototype for stakeholder review', estimatedHours: 4 },
      { title: 'Perform design QA review with frontend engineering', estimatedHours: 2 },
    ],
    automationRules: {
      autoDueDays: 5,
      defaultStatus: 'todo',
      autoAssignToCreator: true,
    },
    isPreset: true,
  },
  {
    id: 'preset-security-qa-review',
    name: 'Security & QA Release Audit',
    description: 'Pre-flight security checklist verifying RBAC, input sanitization, and performance.',
    category: 'Security',
    defaultPriority: 'urgent',
    defaultLabels: ['security', 'qa', 'audit'],
    subtasks: [
      { title: 'Run npm audit and update outdated dependencies', estimatedHours: 1 },
      { title: 'Verify Postgres Row-Level Security policies and team isolation', estimatedHours: 2 },
      { title: 'Execute full automated test suite with 100% pass rate', estimatedHours: 1 },
      { title: 'Benchmark query performance and inspect slow query logs', estimatedHours: 2 },
      { title: 'Verify Cloud health checks (/health/ready) and Prometheus telemetry', estimatedHours: 1 },
    ],
    automationRules: {
      autoDueDays: 3,
      defaultStatus: 'todo',
      autoAssignToCreator: true,
    },
    isPreset: true,
  },
];

// All task template routes require user authentication and team resolution
router.use(requireAuth, resolveTeam);

// ─── 1. GET /task-templates — List presets and custom team templates ─────────

router.get('/', async (req, res) => {
  try {
    const { category } = req.query;

    const customTemplates = await prisma.taskTemplate.findMany({
      where: {
        teamId: req.teamId,
        ...(category ? { category: { equals: category, mode: 'insensitive' } } : {}),
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
    });

    const formattedCustom = customTemplates.map((tpl) => ({
      ...tpl,
      isPreset: false,
    }));

    let presets = SYSTEM_PRESET_TEMPLATES;
    if (category) {
      presets = presets.filter(
        (p) => p.category.toLowerCase() === String(category).toLowerCase()
      );
    }

    res.json({
      presets,
      custom: formattedCustom,
      templates: [...presets, ...formattedCustom],
    });
  } catch (error) {
    logger.error('Error fetching task templates:', error);
    res.status(500).json({ error: 'Failed to fetch task templates' });
  }
});

// ─── 2. POST /task-templates — Create a new custom team template ─────────────

router.post('/', validate(schemas.taskTemplateCreate), async (req, res) => {
  try {
    const {
      name,
      description,
      category = 'General',
      defaultPriority = 'medium',
      defaultLabels = [],
      subtasks = [],
      automationRules = {},
    } = req.body;

    const template = await prisma.taskTemplate.create({
      data: {
        teamId: req.teamId,
        createdById: req.userId,
        name,
        description,
        category,
        defaultPriority,
        defaultLabels,
        subtasks,
        automationRules,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.status(201).json({
      template: {
        ...template,
        isPreset: false,
      },
    });
  } catch (error) {
    logger.error('Error creating task template:', error);
    res.status(500).json({ error: 'Failed to create task template' });
  }
});

// ─── 3. GET /task-templates/:id — Retrieve template details ──────────────────

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check system presets first
    const preset = SYSTEM_PRESET_TEMPLATES.find((p) => p.id === id);
    if (preset) {
      return res.json({ template: preset });
    }

    const template = await prisma.taskTemplate.findFirst({
      where: {
        id,
        teamId: req.teamId,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!template) {
      return res.status(404).json({ error: 'Task template not found' });
    }

    res.json({
      template: {
        ...template,
        isPreset: false,
      },
    });
  } catch (error) {
    logger.error('Error fetching task template:', error);
    res.status(500).json({ error: 'Failed to fetch task template' });
  }
});

// ─── 4. PUT /task-templates/:id — Update custom template ─────────────────────

router.put('/:id', validate(schemas.taskTemplateUpdate), async (req, res) => {
  try {
    const { id } = req.params;

    // Presets are immutable
    if (SYSTEM_PRESET_TEMPLATES.some((p) => p.id === id)) {
      return res.status(403).json({ error: 'Built-in system presets cannot be modified' });
    }

    const existing = await prisma.taskTemplate.findFirst({
      where: {
        id,
        teamId: req.teamId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Task template not found' });
    }

    const isElevated = req.teamRole === 'owner' || req.teamRole === 'admin';
    const isCreator = existing.createdById === req.userId;

    if (!isElevated && !isCreator) {
      return res.status(403).json({ error: 'You do not have permission to update this template' });
    }

    const updated = await prisma.taskTemplate.update({
      where: { id },
      data: req.body,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.json({
      template: {
        ...updated,
        isPreset: false,
      },
    });
  } catch (error) {
    logger.error('Error updating task template:', error);
    res.status(500).json({ error: 'Failed to update task template' });
  }
});

// ─── 5. DELETE /task-templates/:id — Delete custom template ──────────────────

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (SYSTEM_PRESET_TEMPLATES.some((p) => p.id === id)) {
      return res.status(403).json({ error: 'Built-in system presets cannot be deleted' });
    }

    const existing = await prisma.taskTemplate.findFirst({
      where: {
        id,
        teamId: req.teamId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Task template not found' });
    }

    const isElevated = req.teamRole === 'owner' || req.teamRole === 'admin';
    const isCreator = existing.createdById === req.userId;

    if (!isElevated && !isCreator) {
      return res.status(403).json({ error: 'You do not have permission to delete this template' });
    }

    await prisma.taskTemplate.delete({
      where: { id },
    });

    res.json({ success: true, message: 'Task template deleted successfully' });
  } catch (error) {
    logger.error('Error deleting task template:', error);
    res.status(500).json({ error: 'Failed to delete task template' });
  }
});

// ─── 6. POST /task-templates/:id/apply — Instantiate task from template ──────

router.post('/:id/apply', validate(schemas.taskTemplateApply), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      projectId = null,
      title: customTitle,
      assigneeId: customAssigneeId,
      dueDate: customDueDate,
      status: customStatus,
    } = req.body;

    // 1. Resolve template definition
    let template = SYSTEM_PRESET_TEMPLATES.find((p) => p.id === id);
    let isDbTemplate = false;

    if (!template) {
      template = await prisma.taskTemplate.findFirst({
        where: {
          id,
          teamId: req.teamId,
        },
      });
      if (template) isDbTemplate = true;
    }

    if (!template) {
      return res.status(404).json({ error: 'Task template not found' });
    }

    // 2. Validate target project if specified
    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, teamId: req.teamId },
      });
      if (!project) {
        return res.status(404).json({ error: 'Target project not found in this workspace' });
      }
    }

    // 3. Compute workflow automation attributes
    const rules = template.automationRules || {};
    const taskTitle = customTitle || template.name;
    const taskStatus = customStatus || rules.defaultStatus || 'todo';
    const taskPriority = template.defaultPriority || 'medium';
    const taskLabels = Array.isArray(template.defaultLabels) ? template.defaultLabels : [];

    let taskAssigneeId = customAssigneeId || null;
    if (!taskAssigneeId && rules.autoAssignToCreator) {
      taskAssigneeId = req.userId;
    }

    let taskDueDate = null;
    if (customDueDate) {
      taskDueDate = new Date(customDueDate);
    } else if (rules.autoDueDays && typeof rules.autoDueDays === 'number' && rules.autoDueDays > 0) {
      const d = new Date();
      d.setDate(d.getDate() + rules.autoDueDays);
      taskDueDate = d;
    }

    // 4. Transactionally create task, subtasks, and update template usage count
    const rawSubtasks = Array.isArray(template.subtasks) ? template.subtasks : [];

    const result = await prisma.$transaction(async (tx) => {
      // Create main task
      const task = await tx.task.create({
        data: {
          teamId: req.teamId,
          createdById: req.userId,
          projectId: projectId || null,
          assigneeId: taskAssigneeId,
          title: taskTitle,
          description: template.description || null,
          status: taskStatus,
          priority: taskPriority,
          labels: taskLabels,
          dueDate: taskDueDate,
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          assignee: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true, color: true } },
        },
      });

      // Create initial subtasks if defined
      const createdSubtasks = [];
      for (let i = 0; i < rawSubtasks.length; i++) {
        const item = rawSubtasks[i];
        const st = await tx.subtask.create({
          data: {
            taskId: task.id,
            title: item.title || `Subtask ${i + 1}`,
            order: i,
            completed: false,
          },
        });
        createdSubtasks.push(st);
      }

      // Record activity
      await tx.activity.create({
        data: {
          taskId: task.id,
          userId: req.userId,
          action: 'created_from_template',
          details: `Created from template: ${template.name} (${createdSubtasks.length} subtasks)`,
        },
      });

      // Increment usage count for custom template
      if (isDbTemplate) {
        await tx.taskTemplate.update({
          where: { id: template.id },
          data: { usageCount: { increment: 1 } },
        });
      }

      return { task, subtasks: createdSubtasks };
    });

    res.status(201).json({
      task: result.task,
      subtasks: result.subtasks,
      template: {
        id: template.id,
        name: template.name,
        category: template.category,
      },
    });
  } catch (error) {
    logger.error('Error applying task template:', error);
    res.status(500).json({ error: 'Failed to apply task template' });
  }
});

module.exports = router;

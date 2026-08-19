const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const validate = require('../middleware/validate');
const schemas = require('../validation/schemas');
const logger = require('../middleware/logger');

// Enforce auth & team resolution across all /views routes
router.use(requireAuth, resolveTeam);

// ─── 0. Built-in System Preset Views ──────────────────────────────────────────

const SYSTEM_PRESET_VIEWS = [
  {
    id: 'preset-my-high-priority',
    name: 'My High Priority',
    description: 'High and urgent priority tasks assigned to you',
    icon: '🔥',
    color: '#ef4444',
    viewType: 'board',
    filters: {
      assignee: 'me',
      priority: ['urgent', 'high'],
      status: ['todo', 'in_progress'],
    },
    sort: { field: 'priority', direction: 'desc' },
    isShared: true,
    isPinned: true,
    isPreset: true,
  },
  {
    id: 'preset-overdue',
    name: 'Overdue Tasks',
    description: 'Active tasks whose due dates have passed',
    icon: '⚠️',
    color: '#f59e0b',
    viewType: 'list',
    filters: {
      isOverdue: true,
      status: ['todo', 'in_progress'],
    },
    sort: { field: 'dueDate', direction: 'asc' },
    isShared: true,
    isPinned: true,
    isPreset: true,
  },
  {
    id: 'preset-due-this-week',
    name: 'Due This Week',
    description: 'Upcoming tasks scheduled for completion within the next 7 days',
    icon: '📅',
    color: '#3b82f6',
    viewType: 'calendar',
    filters: {
      dueRange: 'this_week',
      status: ['todo', 'in_progress'],
    },
    sort: { field: 'dueDate', direction: 'asc' },
    isShared: true,
    isPinned: false,
    isPreset: true,
  },
  {
    id: 'preset-unassigned',
    name: 'Unassigned Tasks',
    description: 'Open tasks awaiting assignment to a team member',
    icon: '👤',
    color: '#8b5cf6',
    viewType: 'board',
    filters: {
      assignee: 'unassigned',
      status: ['todo', 'in_progress'],
    },
    sort: { field: 'order', direction: 'asc' },
    isShared: true,
    isPinned: false,
    isPreset: true,
  },
  {
    id: 'preset-recently-completed',
    name: 'Recently Completed',
    description: 'Tasks successfully marked as done',
    icon: '✅',
    color: '#10b981',
    viewType: 'list',
    filters: {
      status: ['done'],
    },
    sort: { field: 'updatedAt', direction: 'desc' },
    isShared: true,
    isPinned: false,
    isPreset: true,
  },
];

// Helper: build Prisma WHERE query from structured filters
function buildWhereClauseFromFilters(filters = {}, teamId, userId) {
  const where = { teamId };

  // 1. Status Filter
  if (Array.isArray(filters.status) && filters.status.length > 0) {
    where.status = { in: filters.status };
  }

  // 2. Priority Filter
  if (Array.isArray(filters.priority) && filters.priority.length > 0) {
    where.priority = { in: filters.priority };
  }

  // 3. Assignee Filter ("me" | "unassigned" | specific userId)
  if (filters.assignee) {
    if (filters.assignee === 'me') {
      where.assigneeId = userId;
    } else if (filters.assignee === 'unassigned') {
      where.assigneeId = null;
    } else if (typeof filters.assignee === 'string' && filters.assignee.trim()) {
      where.assigneeId = filters.assignee.trim();
    }
  }

  // 4. Project Filter
  if (filters.projectId) {
    where.projectId = filters.projectId;
  }

  // 5. Labels Filter
  if (Array.isArray(filters.labels) && filters.labels.length > 0) {
    where.labels = { hasSome: filters.labels };
  }

  // 6. Overdue / Due Date Range
  const now = new Date();
  if (filters.isOverdue) {
    where.dueDate = { lt: now };
    if (!where.status) {
      where.status = { not: 'done' };
    }
  } else if (filters.dueRange) {
    if (filters.dueRange === 'today') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      where.dueDate = { gte: startOfDay, lte: endOfDay };
    } else if (filters.dueRange === 'tomorrow') {
      const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59, 999);
      where.dueDate = { gte: startOfTomorrow, lte: endOfTomorrow };
    } else if (filters.dueRange === 'this_week') {
      const endOfWeek = new Date();
      endOfWeek.setDate(endOfWeek.getDate() + 7);
      where.dueDate = { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()), lte: endOfWeek };
    } else if (filters.dueRange === 'next_week') {
      const startNextWeek = new Date();
      startNextWeek.setDate(startNextWeek.getDate() + 7);
      const endNextWeek = new Date();
      endNextWeek.setDate(endNextWeek.getDate() + 14);
      where.dueDate = { gte: startNextWeek, lte: endNextWeek };
    } else if (filters.dueRange === 'overdue') {
      where.dueDate = { lt: now };
      if (!where.status) {
        where.status = { not: 'done' };
      }
    } else if (filters.dueRange === 'no_date') {
      where.dueDate = null;
    }
  }

  // 7. Search Text Filter
  if (filters.search && typeof filters.search === 'string' && filters.search.trim()) {
    const term = filters.search.trim();
    where.OR = [
      { title: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
    ];
  }

  return where;
}

// ─── 1. GET /views — List custom views & built-in presets ──────────────────────

router.get('/', async (req, res) => {
  try {
    const { isPinned, viewType } = req.query;

    const where = {
      teamId: req.teamId,
      OR: [
        { userId: req.userId }, // Personal views
        { isShared: true },     // Team-shared views
      ],
    };

    if (isPinned !== undefined) {
      where.isPinned = isPinned === 'true';
    }

    if (viewType) {
      where.viewType = viewType;
    }

    const customViews = await prisma.customView.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: [
        { isPinned: 'desc' },
        { position: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    // Filter presets if viewType is provided
    let filteredPresets = SYSTEM_PRESET_VIEWS;
    if (viewType) {
      filteredPresets = filteredPresets.filter((p) => p.viewType === viewType);
    }
    if (isPinned !== undefined) {
      const pinBool = isPinned === 'true';
      filteredPresets = filteredPresets.filter((p) => p.isPinned === pinBool);
    }

    res.json({
      presets: filteredPresets,
      custom: customViews.map((v) => ({
        ...v,
        isOwner: v.userId === req.userId,
        isPreset: false,
      })),
    });
  } catch (error) {
    logger.error('Error fetching custom views:', error);
    res.status(500).json({ error: 'Failed to fetch custom views' });
  }
});

// ─── 2. POST /views — Create a new saved custom view ─────────────────────────

router.post('/', validate(schemas.customViewCreate), async (req, res) => {
  try {
    const {
      name,
      description = null,
      icon = '👁️',
      color = '#6366f1',
      viewType = 'board',
      filters = {},
      sort = null,
      isShared = false,
      isPinned = false,
    } = req.body;

    const view = await prisma.customView.create({
      data: {
        teamId: req.teamId,
        userId: req.userId,
        name,
        description,
        icon,
        color,
        viewType,
        filters,
        sort,
        isShared,
        isPinned,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.status(201).json({
      view: {
        ...view,
        isOwner: true,
        isPreset: false,
      },
    });
  } catch (error) {
    logger.error('Error creating custom view:', error);
    res.status(500).json({ error: 'Failed to create custom view' });
  }
});

// ─── 3. GET /views/:id — Retrieve view details ───────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check system presets first
    const preset = SYSTEM_PRESET_VIEWS.find((p) => p.id === id);
    if (preset) {
      return res.json({ view: preset });
    }

    const view = await prisma.customView.findFirst({
      where: {
        id,
        teamId: req.teamId,
        OR: [
          { userId: req.userId },
          { isShared: true },
        ],
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!view) {
      return res.status(404).json({ error: 'Custom view not found' });
    }

    res.json({
      view: {
        ...view,
        isOwner: view.userId === req.userId,
        isPreset: false,
      },
    });
  } catch (error) {
    logger.error('Error fetching custom view:', error);
    res.status(500).json({ error: 'Failed to fetch custom view' });
  }
});

// ─── 4. PATCH /views/:id — Update custom view ────────────────────────────────

router.patch('/:id', validate(schemas.customViewUpdate), async (req, res) => {
  try {
    const { id } = req.params;

    // Presets are immutable
    if (SYSTEM_PRESET_VIEWS.some((p) => p.id === id)) {
      return res.status(403).json({ error: 'Built-in system views cannot be modified' });
    }

    const existing = await prisma.customView.findFirst({
      where: {
        id,
        teamId: req.teamId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Custom view not found' });
    }

    // Role check: Only creator or owner/admin can edit
    const isOwner = existing.userId === req.userId;
    const isElevated = req.userRole === 'owner' || req.userRole === 'admin';
    if (!isOwner && !isElevated) {
      return res.status(403).json({ error: 'You do not have permission to modify this view' });
    }

    const updated = await prisma.customView.update({
      where: { id },
      data: req.body,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.json({
      view: {
        ...updated,
        isOwner: updated.userId === req.userId,
        isPreset: false,
      },
    });
  } catch (error) {
    logger.error('Error updating custom view:', error);
    res.status(500).json({ error: 'Failed to update custom view' });
  }
});

// ─── 5. DELETE /views/:id — Delete custom view ───────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Presets are immutable
    if (SYSTEM_PRESET_VIEWS.some((p) => p.id === id)) {
      return res.status(403).json({ error: 'Built-in system views cannot be deleted' });
    }

    const existing = await prisma.customView.findFirst({
      where: {
        id,
        teamId: req.teamId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Custom view not found' });
    }

    // Role check: Only creator or owner/admin can delete
    const isOwner = existing.userId === req.userId;
    const isElevated = req.userRole === 'owner' || req.userRole === 'admin';
    if (!isOwner && !isElevated) {
      return res.status(403).json({ error: 'You do not have permission to delete this view' });
    }

    await prisma.customView.delete({
      where: { id },
    });

    res.json({ success: true, message: 'Custom view deleted successfully' });
  } catch (error) {
    logger.error('Error deleting custom view:', error);
    res.status(500).json({ error: 'Failed to delete custom view' });
  }
});

// ─── 6. GET /views/:id/tasks — Execute view filters on live tasks ───────────

router.get('/:id/tasks', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

    let viewDefinition = SYSTEM_PRESET_VIEWS.find((p) => p.id === id);

    if (!viewDefinition) {
      const dbView = await prisma.customView.findFirst({
        where: {
          id,
          teamId: req.teamId,
          OR: [
            { userId: req.userId },
            { isShared: true },
          ],
        },
      });

      if (!dbView) {
        return res.status(404).json({ error: 'Custom view not found' });
      }
      viewDefinition = dbView;
    }

    // Build filter where clause
    const where = buildWhereClauseFromFilters(viewDefinition.filters || {}, req.teamId, req.userId);

    // Build sort orderBy clause
    const sort = viewDefinition.sort || {};
    const sortField = sort.field || 'order';
    const sortDirection = sort.direction === 'desc' ? 'desc' : 'asc';
    const orderBy = [{ [sortField]: sortDirection }];

    const [tasks, totalCount] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy,
        take: limit,
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true, color: true } },
          subtasks: {
            select: { id: true, title: true, completed: true, order: true },
            orderBy: { order: 'asc' },
          },
        },
      }),
      prisma.task.count({ where }),
    ]);

    res.json({
      view: {
        id: viewDefinition.id,
        name: viewDefinition.name,
        viewType: viewDefinition.viewType,
        filters: viewDefinition.filters,
        sort: viewDefinition.sort,
      },
      tasks,
      totalCount,
    });
  } catch (error) {
    logger.error('Error executing custom view query:', error);
    res.status(500).json({ error: 'Failed to execute custom view tasks' });
  }
});

module.exports = router;

const express = require('express');
const prisma = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const validate = require('../middleware/validate');
const { sanitize } = require('../middleware/sanitize');
const schemas = require('../validation/schemas');
const { scopedTaskQuery } = require('../helpers/scopedQuery');
const { parseSearchQuery, buildPrismaWhereClause } = require('../services/searchParser');
const logger = require('../middleware/logger');

const router = express.Router();

// Apply auth and team resolution to all search routes
router.use(requireAuth, resolveTeam);

const TASK_INCLUDE = {
  assignee:  { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  project:   { select: { id: true, name: true, color: true, icon: true } },
  subtasks:  { select: { id: true, completed: true, title: true } },
  _count: {
    select: {
      comments: true,
      activities: true,
      subtasks: true,
    },
  },
};

// ─── GET /tasks or GET / — execute advanced search ────────────────────────────
async function handleSearch(req, res) {
  try {
    const {
      q,
      status,
      assigneeId,
      projectId,
      priority,
      label,
      page: rawPage,
      pageSize: rawPageSize,
      sortBy = 'relevance',
      sortOrder = 'desc',
    } = req.query;

    const page     = Math.max(1, parseInt(rawPage, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(rawPageSize, 10) || 20));
    const skip     = (page - 1) * pageSize;

    // Parse the search query expression
    const parsed = parseSearchQuery(q || '');

    // Merge explicit query parameters if provided
    if (status)     parsed.filters.statuses.push(status);
    if (assigneeId) parsed.filters.assignees.push(assigneeId);
    if (projectId)  parsed.filters.projects.push(projectId);
    if (priority)   parsed.filters.priorities.push(priority);
    if (label)      parsed.filters.labels.push(label);

    // Build the Prisma where clause
    const where = buildPrismaWhereClause(parsed, {
      userId: req.userId,
      teamId: req.teamId,
      baseWhere: scopedTaskQuery(req),
    });

    // Build sort order
    let orderBy;
    if (sortBy === 'dueDate') {
      orderBy = [{ dueDate: sortOrder === 'desc' ? 'desc' : 'asc' }, { createdAt: 'desc' }];
    } else if (sortBy === 'priority') {
      orderBy = [{ priority: sortOrder === 'asc' ? 'asc' : 'desc' }, { createdAt: 'desc' }];
    } else if (sortBy === 'createdAt') {
      orderBy = [{ createdAt: sortOrder === 'asc' ? 'asc' : 'desc' }];
    } else if (sortBy === 'updatedAt') {
      orderBy = [{ updatedAt: sortOrder === 'asc' ? 'asc' : 'desc' }];
    } else if (sortBy === 'title') {
      orderBy = [{ title: sortOrder === 'desc' ? 'desc' : 'asc' }];
    } else if (sortBy === 'order') {
      orderBy = [{ order: sortOrder === 'desc' ? 'desc' : 'asc' }, { createdAt: 'desc' }];
    } else {
      // Relevance default
      orderBy = [{ order: 'asc' }, { createdAt: 'desc' }];
    }

    const total = await prisma.task.count({ where });
    const tasks = await prisma.task.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: TASK_INCLUDE,
    });

    const facets = {
      status: {
        todo: tasks.filter((t) => t.status === 'todo').length,
        in_progress: tasks.filter((t) => t.status === 'in_progress').length,
        done: tasks.filter((t) => t.status === 'done').length,
      },
      priority: {
        urgent: tasks.filter((t) => t.priority === 'urgent').length,
        high: tasks.filter((t) => t.priority === 'high').length,
      },
    };

    res.json({
      tasks,
      parsedQuery: {
        raw: parsed.rawQuery,
        text: parsed.text,
        filters: parsed.filters,
        tokens: parsed.tokens,
      },
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
      facets,
    });
  } catch (error) {
    logger.error({ err: error }, 'GET /search failed');
    res.status(500).json({ error: 'Something went wrong executing search' });
  }
}

router.get('/tasks', validate(schemas.searchQuery, 'query'), handleSearch);
router.get('/', validate(schemas.searchQuery, 'query'), handleSearch);

// ─── GET /suggestions — search auto-completions & quick previews ─────────────
router.get('/suggestions', async (req, res) => {
  try {
    const rawQ = (req.query.q || '').trim();
    const qLower = rawQ.toLowerCase();

    // Standard operator suggestions
    const OPERATORS = [
      { prefix: 'status:', description: 'Filter by status (todo, in_progress, done)', example: 'status:todo' },
      { prefix: 'assignee:', description: 'Filter by assignee (me, unassigned, name)', example: 'assignee:me' },
      { prefix: 'priority:', description: 'Filter by priority (low, medium, high, urgent)', example: 'priority:high' },
      { prefix: 'due:', description: 'Filter by due date (today, tomorrow, overdue, this_week)', example: 'due:today' },
      { prefix: 'label:', description: 'Filter by label tag', example: 'label:frontend' },
      { prefix: 'project:', description: 'Filter by project name', example: 'project:website' },
      { prefix: 'is:', description: 'Filter boolean status (done, open, overdue, assigned)', example: 'is:overdue' },
      { prefix: 'has:', description: 'Filter has relation (subtasks, comments, due, project)', example: 'has:subtasks' },
    ];

    const operatorSuggestions = OPERATORS.filter(
      (op) => !rawQ || op.prefix.startsWith(qLower) || op.example.includes(qLower)
    );

    const [teamMembers, teamProjects, recentTasks] = await Promise.all([
      prisma.teamMembership.findMany({
        where: { teamId: req.teamId },
        include: { user: { select: { id: true, name: true, email: true } } },
        take: 10,
      }),
      prisma.project.findMany({
        where: { teamId: req.teamId, isArchived: false },
        select: { id: true, name: true, color: true, icon: true },
        take: 10,
      }),
      prisma.task.findMany({
        where: scopedTaskQuery(req),
        select: { labels: true },
        take: 50,
      }),
    ]);

    const uniqueLabels = Array.from(
      new Set(recentTasks.flatMap((t) => t.labels || []))
    ).slice(0, 10);

    const valueSuggestions = {
      status: ['todo', 'in_progress', 'done'],
      priority: ['low', 'medium', 'high', 'urgent'],
      due: ['today', 'tomorrow', 'overdue', 'this_week', 'next_week', 'this_month', 'nodate'],
      is: ['open', 'done', 'overdue', 'assigned', 'unassigned'],
      has: ['subtasks', 'comments', 'due', 'project', 'assignee'],
      assignee: [
        { label: 'me (Assigned to me)', value: 'me' },
        { label: 'unassigned (No assignee)', value: 'unassigned' },
        ...teamMembers.map((m) => ({ label: m.user.name, value: m.user.name, email: m.user.email })),
      ],
      project: [
        { label: 'none (No project)', value: 'none' },
        ...teamProjects.map((p) => ({ label: p.name, value: p.name, icon: p.icon, color: p.color })),
      ],
      label: uniqueLabels,
    };

    let quickTasks = [];
    let quickProjects = [];

    if (rawQ.length >= 2) {
      const parsed = parseSearchQuery(rawQ);
      const where = buildPrismaWhereClause(parsed, {
        userId: req.userId,
        teamId: req.teamId,
        baseWhere: scopedTaskQuery(req),
      });

      [quickTasks, quickProjects] = await Promise.all([
        prisma.task.findMany({
          where,
          take: 5,
          orderBy: { updatedAt: 'desc' },
          include: TASK_INCLUDE,
        }),
        prisma.project.findMany({
          where: {
            teamId: req.teamId,
            isArchived: false,
            name: { contains: parsed.text || rawQ, mode: 'insensitive' },
          },
          take: 3,
          select: { id: true, name: true, color: true, icon: true, status: true },
        }),
      ]);
    }

    res.json({
      query: rawQ,
      operatorSuggestions,
      valueSuggestions,
      quickTasks,
      quickProjects,
    });
  } catch (error) {
    logger.error({ err: error }, 'GET /search/suggestions failed');
    res.status(500).json({ error: 'Something went wrong fetching suggestions' });
  }
});

// ─── Saved Searches ──────────────────────────────────────────────────────────

router.get('/saved', async (req, res) => {
  try {
    const savedSearches = await prisma.savedSearch.findMany({
      where: {
        userId: req.userId,
        teamId: req.teamId,
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ savedSearches });
  } catch (error) {
    logger.error({ err: error }, 'GET /search/saved failed');
    res.status(500).json({ error: 'Something went wrong fetching saved searches' });
  }
});

router.post('/saved', validate(schemas.savedSearchCreate), async (req, res) => {
  try {
    const { name, query, filters } = req.body;

    const savedSearch = await prisma.savedSearch.create({
      data: {
        name: sanitize(name),
        query: sanitize(query),
        filters: filters || null,
        userId: req.userId,
        teamId: req.teamId,
      },
    });

    res.status(201).json({ savedSearch });
  } catch (error) {
    logger.error({ err: error }, 'POST /search/saved failed');
    res.status(500).json({ error: 'Something went wrong creating saved search' });
  }
});

router.delete('/saved/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.savedSearch.findFirst({
      where: {
        id,
        userId: req.userId,
        teamId: req.teamId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Saved search not found' });
    }

    await prisma.savedSearch.delete({
      where: { id },
    });

    res.json({ success: true, message: 'Saved search deleted' });
  } catch (error) {
    logger.error({ err: error }, 'DELETE /search/saved/:id failed');
    res.status(500).json({ error: 'Something went wrong deleting saved search' });
  }
});

// ─── Recent Searches ─────────────────────────────────────────────────────────

router.get('/recent', async (req, res) => {
  try {
    const recentSearches = await prisma.recentSearch.findMany({
      where: {
        userId: req.userId,
        teamId: req.teamId,
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    res.json({ recentSearches });
  } catch (error) {
    logger.error({ err: error }, 'GET /search/recent failed');
    res.status(500).json({ error: 'Something went wrong fetching recent searches' });
  }
});

router.post('/recent', validate(schemas.recentSearchCreate), async (req, res) => {
  try {
    const cleanQuery = sanitize(req.body.query).trim();
    if (!cleanQuery) {
      return res.status(400).json({ error: 'Query cannot be empty' });
    }

    const recentSearch = await prisma.recentSearch.upsert({
      where: {
        userId_teamId_query: {
          userId: req.userId,
          teamId: req.teamId,
          query: cleanQuery,
        },
      },
      update: {
        updatedAt: new Date(),
      },
      create: {
        query: cleanQuery,
        userId: req.userId,
        teamId: req.teamId,
      },
    });

    const count = await prisma.recentSearch.count({
      where: { userId: req.userId, teamId: req.teamId },
    });

    if (count > 20) {
      const oldest = await prisma.recentSearch.findMany({
        where: { userId: req.userId, teamId: req.teamId },
        orderBy: { updatedAt: 'asc' },
        take: count - 20,
        select: { id: true },
      });
      await prisma.recentSearch.deleteMany({
        where: { id: { in: oldest.map((o) => o.id) } },
      });
    }

    res.status(201).json({ recentSearch });
  } catch (error) {
    logger.error({ err: error }, 'POST /search/recent failed');
    res.status(500).json({ error: 'Something went wrong recording recent search' });
  }
});

router.delete('/recent', async (req, res) => {
  try {
    await prisma.recentSearch.deleteMany({
      where: {
        userId: req.userId,
        teamId: req.teamId,
      },
    });

    res.json({ success: true, message: 'Recent searches cleared' });
  } catch (error) {
    logger.error({ err: error }, 'DELETE /search/recent failed');
    res.status(500).json({ error: 'Something went wrong clearing recent searches' });
  }
});

module.exports = router;

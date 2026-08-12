/**
 * Phase 25 — Advanced Search Test Suite
 *
 * Verifies:
 * 1. Search Query Parser & AST translation (operators, expressions, quotes, free text)
 * 2. Full-text search and compound filter execution (GET /search/tasks)
 * 3. Operators: status, assignee, priority, due, label, project, is, has
 * 4. Autocomplete & search suggestions (GET /search/suggestions)
 * 5. Saved searches CRUD (GET, POST, DELETE /search/saved)
 * 6. Recent searches history (GET, POST, DELETE /search/recent)
 * 7. Multi-tenant team isolation & authorization security
 */

const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const { parseSearchQuery, buildPrismaWhereClause, resolveDateRange } = require('../services/searchParser');

const authRoutes     = require('../routes/auth');
const taskRoutes     = require('../routes/tasks');
const teamRoutes     = require('../routes/teams');
const projectRoutes  = require('../routes/projects');
const searchRoutes   = require('../routes/search');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth',     authRoutes);
  app.use('/tasks',    taskRoutes);
  app.use('/teams',    teamRoutes);
  app.use('/projects', projectRoutes);
  app.use('/search',   searchRoutes);
  return app;
}

let app;
let userA, userB, userOutside;
let tokenA, tokenB, tokenOutside;
let teamA, teamB;
let projectA1, projectA2;
let task1, task2, task3, task4, task5, taskTeamB;

function makeToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

beforeAll(async () => {
  app = createTestApp();

  // Clean up
  await prisma.savedSearch.deleteMany({});
  await prisma.recentSearch.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.subtask.deleteMany({});
  await prisma.taskWatcher.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.projectMember.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          'p25_usera@test.com',
          'p25_userb@test.com',
          'p25_useroutside@test.com',
        ],
      },
    },
  });

  const passwordHash = await bcrypt.hash('Password123!', 8);

  userA = await prisma.user.create({
    data: { name: 'Alice Search', email: 'p25_usera@test.com', passwordHash, emailVerified: true },
  });
  userB = await prisma.user.create({
    data: { name: 'Bob Search', email: 'p25_userb@test.com', passwordHash, emailVerified: true },
  });
  userOutside = await prisma.user.create({
    data: { name: 'Eve Outside', email: 'p25_useroutside@test.com', passwordHash, emailVerified: true },
  });

  tokenA = makeToken(userA);
  tokenB = makeToken(userB);
  tokenOutside = makeToken(userOutside);

  // Create Team A
  teamA = await prisma.team.create({
    data: { name: 'Alpha Search Team', ownerId: userA.id },
  });
  await prisma.teamMembership.createMany({
    data: [
      { userId: userA.id, teamId: teamA.id, role: 'owner' },
      { userId: userB.id, teamId: teamA.id, role: 'member' },
    ],
  });

  // Create Team B (for isolation tests)
  teamB = await prisma.team.create({
    data: { name: 'Beta Isolation Team', ownerId: userOutside.id },
  });
  await prisma.teamMembership.create({
    data: { userId: userOutside.id, teamId: teamB.id, role: 'owner' },
  });

  // Create Projects
  projectA1 = await prisma.project.create({
    data: {
      name: 'Website Redesign',
      description: 'Redesigning public marketing website',
      teamId: teamA.id,
      createdById: userA.id,
      color: '#3b82f6',
      icon: '🌐',
    },
  });

  projectA2 = await prisma.project.create({
    data: {
      name: 'Mobile App',
      description: 'Native iOS and Android client',
      teamId: teamA.id,
      createdById: userA.id,
      color: '#10b981',
      icon: '📱',
    },
  });

  const now = new Date();
  const todayDue = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
  const yesterdayDue = new Date(todayDue.getTime() - 24 * 60 * 60 * 1000);
  const nextWeekDue = new Date(todayDue.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Seed tasks in Team A
  task1 = await prisma.task.create({
    data: {
      title: 'Fix authentication OAuth crash',
      description: 'Users experience token error on Google OAuth login',
      status: 'todo',
      priority: 'urgent',
      labels: ['frontend', 'bug', 'auth'],
      dueDate: todayDue,
      assigneeId: userA.id,
      createdById: userA.id,
      teamId: teamA.id,
      projectId: projectA1.id,
      order: 1000,
    },
  });

  task2 = await prisma.task.create({
    data: {
      title: 'Build checkout payment gateway',
      description: 'Integrate Stripe and Apple Pay with webhook handler',
      status: 'in_progress',
      priority: 'high',
      labels: ['backend', 'payments'],
      dueDate: nextWeekDue,
      assigneeId: userB.id,
      createdById: userA.id,
      teamId: teamA.id,
      projectId: projectA1.id,
      order: 2000,
    },
  });

  task3 = await prisma.task.create({
    data: {
      title: 'Fix overdue billing invoice calculations',
      description: 'Proration calculation edge case for annual upgrades',
      status: 'todo',
      priority: 'high',
      labels: ['backend', 'bug'],
      dueDate: yesterdayDue, // overdue
      assigneeId: userA.id,
      createdById: userA.id,
      teamId: teamA.id,
      projectId: projectA2.id,
      order: 3000,
    },
  });

  task4 = await prisma.task.create({
    data: {
      title: 'Update onboarding documentation',
      description: 'Comprehensive setup guide for new developers',
      status: 'done',
      priority: 'low',
      labels: ['docs'],
      dueDate: null, // unscheduled
      assigneeId: null, // unassigned
      createdById: userB.id,
      teamId: teamA.id,
      projectId: null,
      order: 4000,
    },
  });

  task5 = await prisma.task.create({
    data: {
      title: 'Mobile app push notifications',
      description: 'Configure APNS and FCM payloads for task assignment',
      status: 'todo',
      priority: 'medium',
      labels: ['mobile', 'notifications'],
      dueDate: todayDue,
      assigneeId: userB.id,
      createdById: userA.id,
      teamId: teamA.id,
      projectId: projectA2.id,
      order: 5000,
    },
  });

  // Add a subtask to task1
  await prisma.subtask.create({
    data: {
      title: 'Verify JWT signature validation',
      taskId: task1.id,
      completed: false,
    },
  });

  // Seed task in Team B (isolated)
  taskTeamB = await prisma.task.create({
    data: {
      title: 'Secret Team B task that Alice must never see',
      description: 'Top secret roadmap and authentication details',
      status: 'todo',
      priority: 'urgent',
      labels: ['auth', 'secret'],
      dueDate: todayDue,
      assigneeId: userOutside.id,
      createdById: userOutside.id,
      teamId: teamB.id,
      order: 1000,
    },
  });
});

afterAll(async () => {
  await prisma.savedSearch.deleteMany({});
  await prisma.recentSearch.deleteMany({});
  await prisma.subtask.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          'p25_usera@test.com',
          'p25_userb@test.com',
          'p25_useroutside@test.com',
        ],
      },
    },
  });
  await prisma.$disconnect();
});

describe('Phase 25 — Advanced Search', () => {

  // ─── 1. Query Parser Unit Tests ─────────────────────────────────────────────
  describe('1. Search Expression Parser Unit Tests', () => {
    it('parses single operator expressions correctly', () => {
      const parsed = parseSearchQuery('status:todo');
      expect(parsed.filters.statuses).toEqual(['todo']);
      expect(parsed.text).toBe('');
      expect(parsed.tokens).toHaveLength(1);
      expect(parsed.tokens[0]).toEqual({ key: 'status', value: 'todo', raw: 'status:todo' });
    });

    it('parses assignee, priority, due, label, and project operators', () => {
      const parsed = parseSearchQuery('assignee:me priority:high due:today label:frontend project:website');
      expect(parsed.filters.assignees).toEqual(['me']);
      expect(parsed.filters.priorities).toEqual(['high']);
      expect(parsed.filters.due).toBe('today');
      expect(parsed.filters.labels).toEqual(['frontend']);
      expect(parsed.filters.projects).toEqual(['website']);
    });

    it('parses compound queries with free-text and quoted values', () => {
      const query = 'status:todo assignee:me priority:urgent label:"bug fix" project:"Website Redesign" fix OAuth crash';
      const parsed = parseSearchQuery(query);

      expect(parsed.filters.statuses).toEqual(['todo']);
      expect(parsed.filters.assignees).toEqual(['me']);
      expect(parsed.filters.priorities).toEqual(['urgent']);
      expect(parsed.filters.labels).toEqual(['bug fix']);
      expect(parsed.filters.projects).toEqual(['Website Redesign']);
      expect(parsed.text).toBe('fix OAuth crash');
    });

    it('parses comma-separated values in operators', () => {
      const parsed = parseSearchQuery('status:todo,in_progress priority:high,urgent label:frontend,backend');
      expect(parsed.filters.statuses).toEqual(['todo', 'in_progress']);
      expect(parsed.filters.priorities).toEqual(['high', 'urgent']);
      expect(parsed.filters.labels).toEqual(['frontend', 'backend']);
    });

    it('parses boolean is: and has: flags', () => {
      const parsed = parseSearchQuery('is:overdue has:subtasks is:open');
      expect(parsed.filters.isFlags).toContain('overdue');
      expect(parsed.filters.isFlags).toContain('open');
      expect(parsed.filters.hasFlags).toContain('subtasks');
    });

    it('resolves date ranges safely', () => {
      const todayRange = resolveDateRange('today');
      expect(todayRange.gte).toBeInstanceOf(Date);
      expect(todayRange.lte).toBeInstanceOf(Date);

      const overdueRange = resolveDateRange('overdue');
      expect(overdueRange.type).toBe('overdue');
      expect(overdueRange.lt).toBeInstanceOf(Date);

      const nodateRange = resolveDateRange('nodate');
      expect(nodateRange.isNull).toBe(true);
    });
  });

  // ─── 2. Search Execution (GET /search/tasks) ─────────────────────────────────
  describe('2. Global Search API Execution (GET /search/tasks)', () => {
    it('finds tasks using free-text keywords matching title and description', async () => {
      const res = await request(app)
        .get('/search/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ q: 'OAuth' });

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].id).toBe(task1.id);
      expect(res.body.parsedQuery.text).toBe('OAuth');
    });

    it('filters tasks by status:todo', async () => {
      const res = await request(app)
        .get('/search/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ q: 'status:todo' });

      expect(res.status).toBe(200);
      expect(res.body.tasks.length).toBeGreaterThanOrEqual(3);
      res.body.tasks.forEach((t) => {
        expect(t.status).toBe('todo');
      });
    });

    it('filters tasks by assignee:me', async () => {
      const res = await request(app)
        .get('/search/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ q: 'assignee:me' });

      expect(res.status).toBe(200);
      expect(res.body.tasks.length).toBeGreaterThanOrEqual(2);
      res.body.tasks.forEach((t) => {
        expect(t.assigneeId).toBe(userA.id);
      });
    });

    it('filters tasks by assignee:unassigned', async () => {
      const res = await request(app)
        .get('/search/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ q: 'assignee:unassigned' });

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].id).toBe(task4.id);
      expect(res.body.tasks[0].assigneeId).toBeNull();
    });

    it('filters tasks by priority:urgent', async () => {
      const res = await request(app)
        .get('/search/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ q: 'priority:urgent' });

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].id).toBe(task1.id);
    });

    it('filters tasks by due:today', async () => {
      const res = await request(app)
        .get('/search/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ q: 'due:today' });

      expect(res.status).toBe(200);
      expect(res.body.tasks.length).toBe(2);
      const ids = res.body.tasks.map((t) => t.id);
      expect(ids).toContain(task1.id);
      expect(ids).toContain(task5.id);
    });

    it('filters tasks by due:overdue', async () => {
      const res = await request(app)
        .get('/search/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ q: 'due:overdue' });

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].id).toBe(task3.id);
    });

    it('filters tasks by label:backend', async () => {
      const res = await request(app)
        .get('/search/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ q: 'label:backend' });

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(2);
      const ids = res.body.tasks.map((t) => t.id);
      expect(ids).toContain(task2.id);
      expect(ids).toContain(task3.id);
    });

    it('filters tasks by project:website (case-insensitive substring)', async () => {
      const res = await request(app)
        .get('/search/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ q: 'project:website' });

      expect(res.status).toBe(200);
      expect(res.body.tasks.length).toBeGreaterThanOrEqual(2);
      res.body.tasks.forEach((t) => {
        expect(t.project.name).toBe('Website Redesign');
      });
    });

    it('executes complex combination queries (status:todo assignee:me priority:urgent)', async () => {
      const res = await request(app)
        .get('/search/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ q: 'status:todo assignee:me priority:urgent due:today OAuth' });

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].id).toBe(task1.id);
      expect(res.body.facets).toBeDefined();
    });

    it('supports pagination and sorting', async () => {
      const res = await request(app)
        .get('/search/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ page: 1, pageSize: 2, sortBy: 'priority', sortOrder: 'desc' });

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(2);
      expect(res.body.pagination.total).toBe(5);
      expect(res.body.pagination.totalPages).toBe(3);
    });
  });

  // ─── 3. Suggestions & Autocompletion (GET /search/suggestions) ───────────────
  describe('3. Search Suggestions (GET /search/suggestions)', () => {
    it('returns operator suggestions and value hints', async () => {
      const res = await request(app)
        .get('/search/suggestions')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ q: 'stat' });

      expect(res.status).toBe(200);
      expect(res.body.operatorSuggestions.some((o) => o.prefix === 'status:')).toBe(true);
      expect(res.body.valueSuggestions.status).toEqual(['todo', 'in_progress', 'done']);
    });

    it('returns instant preview for matching tasks and projects', async () => {
      const res = await request(app)
        .get('/search/suggestions')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ q: 'OAuth' });

      expect(res.status).toBe(200);
      expect(res.body.quickTasks).toHaveLength(1);
      expect(res.body.quickTasks[0].title).toContain('OAuth');
    });
  });

  // ─── 4. Saved Searches CRUD (GET, POST, DELETE /search/saved) ───────────────
  describe('4. Saved Searches Management', () => {
    let savedSearchId;

    it('saves a search query preset', async () => {
      const res = await request(app)
        .post('/search/saved')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          name: 'My Urgent Overdue Tasks',
          query: 'status:todo assignee:me priority:high due:overdue',
        });

      expect(res.status).toBe(201);
      expect(res.body.savedSearch.name).toBe('My Urgent Overdue Tasks');
      expect(res.body.savedSearch.query).toBe('status:todo assignee:me priority:high due:overdue');
      savedSearchId = res.body.savedSearch.id;
    });

    it('retrieves saved searches for the user in active team', async () => {
      const res = await request(app)
        .get('/search/saved')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.savedSearches).toHaveLength(1);
      expect(res.body.savedSearches[0].id).toBe(savedSearchId);
    });

    it('deletes a saved search', async () => {
      const res = await request(app)
        .delete(`/search/saved/${savedSearchId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const listRes = await request(app)
        .get('/search/saved')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(listRes.body.savedSearches).toHaveLength(0);
    });
  });

  // ─── 5. Recent Searches CRUD (GET, POST, DELETE /search/recent) ─────────────
  describe('5. Recent Searches History', () => {
    it('records a recent search query', async () => {
      const res = await request(app)
        .post('/search/recent')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ query: 'priority:urgent bug' });

      expect(res.status).toBe(201);
      expect(res.body.recentSearch.query).toBe('priority:urgent bug');
    });

    it('retrieves recent searches list', async () => {
      const res = await request(app)
        .get('/search/recent')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.recentSearches).toHaveLength(1);
      expect(res.body.recentSearches[0].query).toBe('priority:urgent bug');
    });

    it('clears recent searches', async () => {
      const res = await request(app)
        .delete('/search/recent')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const listRes = await request(app)
        .get('/search/recent')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(listRes.body.recentSearches).toHaveLength(0);
    });
  });

  // ─── 6. Multi-Tenant Security & Isolation ───────────────────────────────────
  describe('6. Multi-Tenant Security & Isolation', () => {
    it('prevents Alice in Team A from searching Team B tasks', async () => {
      const res = await request(app)
        .get('/search/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ q: 'secret' });

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(0);
    });

    it('prevents Eve in Team B from viewing Team A tasks via search', async () => {
      const res = await request(app)
        .get('/search/tasks')
        .set('Authorization', `Bearer ${tokenOutside}`)
        .set('X-Team-Id', teamB.id)
        .query({ q: 'OAuth' });

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(0);
    });

    it('rejects unauthenticated search requests with 401', async () => {
      const res = await request(app)
        .get('/search/tasks')
        .query({ q: 'status:todo' });

      expect(res.status).toBe(401);
    });
  });
});

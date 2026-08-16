const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

const authRoutes = require('../routes/auth');
const taskRoutes = require('../routes/tasks');
const projectRoutes = require('../routes/projects');
const subtaskRoutes = require('../routes/subtasks');
const aiRoutes = require('../routes/ai');

const {
  fallbackNaturalSearchInterpreter,
  interpretNaturalSearchPrompt,
  executeNaturalSearch,
} = require('../services/ai');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use('/tasks', taskRoutes);
  app.use('/projects', projectRoutes);
  app.use('/subtasks', subtaskRoutes);
  app.use('/ai', aiRoutes);
  return app;
}

let app;
let userA, userB, userAlex;
let teamA, teamB;
let tokenA, tokenB, tokenAlex;
let projectRedesign, projectBackend;

function makeToken(userId, email, teamId) {
  return jwt.sign(
    { userId, email, teamId },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

describe('Phase 30 — Natural-Language Search', () => {
  beforeAll(async () => {
    app = createTestApp();

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
    await prisma.user.deleteMany({});

    const passwordHash = await bcrypt.hash('Password123!', 10);

    // Create Users
    userA = await prisma.user.create({
      data: { email: 'userA_search@example.com', passwordHash, name: 'Alice Searcher' },
    });
    userB = await prisma.user.create({
      data: { email: 'userB_search@example.com', passwordHash, name: 'Bob Competitor' },
    });
    userAlex = await prisma.user.create({
      data: { email: 'alex_search@example.com', passwordHash, name: 'Alex Specialist' },
    });

    // Create Teams
    teamA = await prisma.team.create({
      data: { name: 'Alpha Search Team', ownerId: userA.id },
    });
    teamB = await prisma.team.create({
      data: { name: 'Beta Isolation Team', ownerId: userB.id },
    });

    await prisma.teamMembership.createMany({
      data: [
        { userId: userA.id, teamId: teamA.id, role: 'owner' },
        { userId: userAlex.id, teamId: teamA.id, role: 'member' },
        { userId: userB.id, teamId: teamB.id, role: 'owner' },
      ],
    });

    tokenA = makeToken(userA.id, userA.email, teamA.id);
    tokenB = makeToken(userB.id, userB.email, teamB.id);
    tokenAlex = makeToken(userAlex.id, userAlex.email, teamA.id);

    // Create Projects in Team A
    projectRedesign = await prisma.project.create({
      data: {
        name: 'Website Redesign',
        description: 'New corporate portal',
        teamId: teamA.id,
        createdById: userA.id,
      },
    });

    projectBackend = await prisma.project.create({
      data: {
        name: 'Backend API',
        description: 'Microservices and database',
        teamId: teamA.id,
        createdById: userA.id,
      },
    });

    // Calculate dates
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
    const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 12, 0, 0));
    const twoDaysAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2, 12, 0, 0));
    const startOfWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay() + 2, 12, 0, 0));
    const nextWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay() + 9, 12, 0, 0));

    // Seed Team A Tasks
    // 1. High priority assigned to Alice, due this week, in Website Redesign
    await prisma.task.create({
      data: {
        title: 'Fix authentication token leak',
        description: 'Ensure JWT secrets are not logged',
        priority: 'high',
        status: 'todo',
        assigneeId: userA.id,
        createdById: userA.id,
        teamId: teamA.id,
        projectId: projectRedesign.id,
        dueDate: startOfWeek,
        labels: ['auth', 'security'],
      },
    });

    // 2. Medium priority assigned to Alex, due next week, in Backend API
    await prisma.task.create({
      data: {
        title: 'Optimize database queries',
        description: 'Add indexes for faster search',
        priority: 'medium',
        status: 'in_progress',
        assigneeId: userAlex.id,
        createdById: userA.id,
        teamId: teamA.id,
        projectId: projectBackend.id,
        dueDate: nextWeek,
        labels: ['database', 'backend'],
      },
    });

    // 3. Low priority unassigned, due today, in Website Redesign
    await prisma.task.create({
      data: {
        title: 'Update landing page typography',
        description: 'Use Inter font system',
        priority: 'low',
        status: 'todo',
        assigneeId: null,
        createdById: userA.id,
        teamId: teamA.id,
        projectId: projectRedesign.id,
        dueDate: today,
        labels: ['frontend', 'ui'],
      },
    });

    // 4. Urgent overdue bug in progress
    await prisma.task.create({
      data: {
        title: 'Urgent security patch',
        description: 'Vulnerability in parser',
        priority: 'urgent',
        status: 'in_progress',
        assigneeId: userA.id,
        createdById: userA.id,
        teamId: teamA.id,
        dueDate: twoDaysAgo,
        labels: ['security', 'bug'],
      },
    });

    // 5. Completed task
    await prisma.task.create({
      data: {
        title: 'Deploy production build',
        description: 'Release v2.0 to cloud',
        priority: 'high',
        status: 'done',
        assigneeId: userAlex.id,
        createdById: userA.id,
        teamId: teamA.id,
        dueDate: yesterday,
        labels: ['devops'],
      },
    });

    // Seed Team B Tasks (isolated)
    await prisma.task.create({
      data: {
        title: 'Secret Beta Competitor Task',
        description: 'Do not expose to Team A',
        priority: 'urgent',
        status: 'todo',
        assigneeId: userB.id,
        createdById: userB.id,
        teamId: teamB.id,
        dueDate: today,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Unit NLP Interpreter & Parser', () => {
    const teamContext = {
      projects: [{ id: 'p1', name: 'Website Redesign' }, { id: 'p2', name: 'Backend API' }],
      members: [
        { id: 'u1', name: 'Alice Searcher', email: 'alice@example.com' },
        { id: 'u2', name: 'Alex Specialist', email: 'alex@example.com' },
      ],
    };

    it('interprets high priority tasks assigned to me due this week', () => {
      const parsed = fallbackNaturalSearchInterpreter(
        'Show me all high-priority tasks assigned to me that are due this week.',
        teamContext
      );

      expect(parsed.structuredFilters.assignee).toBe('me');
      expect(parsed.structuredFilters.priorities).toContain('high');
      expect(parsed.structuredFilters.due).toBe('this_week');
      expect(parsed.explanation).toContain('high-priority tasks assigned to you');
      expect(parsed.searchExpression).toContain('assignee:me');
      expect(parsed.searchExpression).toContain('priority:high');
      expect(parsed.searchExpression).toContain('due:this_week');
    });

    it('interprets overdue tasks in a named project', () => {
      const parsed = fallbackNaturalSearchInterpreter(
        'Find overdue tasks in Website Redesign',
        teamContext
      );

      expect(parsed.structuredFilters.due).toBe('overdue');
      expect(parsed.structuredFilters.project).toBe('Website Redesign');
      expect(parsed.searchExpression).toContain('due:overdue');
      expect(parsed.searchExpression).toContain('project:"Website Redesign"');
    });

    it('interprets unassigned urgent bugs in progress', () => {
      const parsed = fallbackNaturalSearchInterpreter(
        'Show unassigned urgent bugs in progress',
        teamContext
      );

      expect(parsed.structuredFilters.assignee).toBe('unassigned');
      expect(parsed.structuredFilters.priorities).toContain('urgent');
      expect(parsed.structuredFilters.statuses).toContain('in_progress');
      expect(parsed.structuredFilters.labels).toContain('bug');
    });

    it('interprets completed tasks sorted by creation date', () => {
      const parsed = fallbackNaturalSearchInterpreter(
        'List completed tasks recently created',
        teamContext
      );

      expect(parsed.structuredFilters.statuses).toContain('done');
      expect(parsed.structuredFilters.sortBy).toBe('createdAt');
      expect(parsed.structuredFilters.sortOrder).toBe('desc');
    });

    it('cleans residual keywords from natural query', () => {
      const parsed = fallbackNaturalSearchInterpreter(
        'Search for tasks with token leak authentication',
        teamContext
      );

      expect(parsed.structuredFilters.text).toContain('token leak authentication');
    });
  });

  describe('2. POST /ai/search Route Validation & Auth', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app)
        .post('/ai/search')
        .send({ prompt: 'Show me my tasks' });

      expect(res.status).toBe(401);
    });

    it('rejects empty or whitespace prompt with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/ai/search')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ prompt: '   ' });

      expect(res.status).toBe(400);
      const errMsg = res.body.error || (res.body.errors && res.body.errors[0]?.message);
      expect(errMsg).toContain('Search prompt is required');
    });

    it('rejects prompt exceeding 500 characters with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/ai/search')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ prompt: 'a'.repeat(501) });

      expect(res.status).toBe(400);
      const errMsg = res.body.error || (res.body.errors && res.body.errors[0]?.message);
      expect(errMsg).toContain('500 characters or fewer');
    });

    it('rejects invalid pagination parameters with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/ai/search')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ prompt: 'Show tasks', page: -1 });

      expect(res.status).toBe(400);
      expect(res.body.errors || res.body.error).toBeDefined();
    });

    it('returns valid structured search response schema for authenticated team member', async () => {
      const res = await request(app)
        .post('/ai/search')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ prompt: 'Show me high priority tasks' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.naturalQuery).toBe('Show me high priority tasks');
      expect(res.body.explanation).toBeDefined();
      expect(res.body.structuredFilters).toBeDefined();
      expect(res.body.structuredFilters.priorities).toContain('high');
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(typeof res.body.total).toBe('number');
      expect(res.body.facets).toBeDefined();
    });
  });

  describe('3. Multi-Tenant Isolation & Zero Data Leakage', () => {
    it('prevents User B from querying Team A with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/ai/search')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamA.id)
        .send({ prompt: 'Show all tasks' });

      expect(res.status).toBe(403);
    });

    it('ensures Team B queries return strictly Team B data without any Team A tasks', async () => {
      const res = await request(app)
        .post('/ai/search')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamB.id)
        .send({ prompt: 'Show all tasks' });

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.results[0].title).toBe('Secret Beta Competitor Task');

      // Zero leakage of Team A tasks
      const titles = res.body.results.map((t) => t.title);
      expect(titles).not.toContain('Fix authentication token leak');
      expect(titles).not.toContain('Urgent security patch');
    });
  });

  describe('4. Natural Query Execution Scenarios', () => {
    it('finds high-priority tasks assigned to me due this week', async () => {
      const res = await request(app)
        .post('/ai/search')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ prompt: 'Show me all high-priority tasks assigned to me that are due this week.' });

      expect(res.status).toBe(200);
      expect(res.body.results.length).toBeGreaterThanOrEqual(1);
      const found = res.body.results.find((t) => t.title === 'Fix authentication token leak');
      expect(found).toBeDefined();
      expect(found.priority).toBe('high');
      expect(found.assignee.id).toBe(userA.id);
    });

    it('finds urgent overdue security bugs in progress', async () => {
      const res = await request(app)
        .post('/ai/search')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ prompt: 'Find urgent overdue bugs in progress' });

      expect(res.status).toBe(200);
      expect(res.body.results.length).toBe(1);
      expect(res.body.results[0].title).toBe('Urgent security patch');
      expect(res.body.results[0].priority).toBe('urgent');
      expect(res.body.results[0].status).toBe('in_progress');
    });

    it('finds unassigned tasks in Website Redesign', async () => {
      const res = await request(app)
        .post('/ai/search')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ prompt: 'Show unassigned tasks in Website Redesign' });

      expect(res.status).toBe(200);
      expect(res.body.results.length).toBe(1);
      expect(res.body.results[0].title).toBe('Update landing page typography');
      expect(res.body.results[0].assignee).toBeNull();
    });

    it('finds completed tasks', async () => {
      const res = await request(app)
        .post('/ai/search')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ prompt: 'Show completed tasks' });

      expect(res.status).toBe(200);
      expect(res.body.results.length).toBe(1);
      expect(res.body.results[0].title).toBe('Deploy production build');
      expect(res.body.results[0].status).toBe('done');
    });

    it('returns empty results with total 0 for non-matching search without crashing', async () => {
      const res = await request(app)
        .post('/ai/search')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ prompt: 'Show tasks matching nonexistentxyz123' });

      expect(res.status).toBe(200);
      expect(res.body.results.length).toBe(0);
      expect(res.body.total).toBe(0);
    });

    it('supports executeSearch: false for dry-run interpretation', async () => {
      const res = await request(app)
        .post('/ai/search')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          prompt: 'Show me my urgent tasks',
          executeSearch: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.structuredFilters.priorities).toContain('urgent');
      expect(res.body.results.length).toBe(0);
      expect(res.body.total).toBe(0);
    });
  });

  describe('5. Advanced Natural Language Queries & Edge Cases', () => {
    const teamContext = {
      projects: [{ id: 'p1', name: 'Website Redesign' }],
      members: [
        { id: 'u1', name: 'Sarah Connor', email: 'sarah@example.com' },
        { id: 'u2', name: 'Alex Specialist', email: 'alex@example.com' },
      ],
    };

    it('interprets "tasks due this Friday assigned to Sarah"', () => {
      const parsed = fallbackNaturalSearchInterpreter(
        'tasks due this Friday assigned to Sarah',
        teamContext
      );

      expect(parsed.structuredFilters.due).toBe('this_week');
      expect(parsed.structuredFilters.assignee).toBe('Sarah Connor');
      expect(parsed.searchExpression).toContain('due:this_week');
      expect(parsed.searchExpression).toContain('assignee:"Sarah Connor"');
    });

    it('interprets "urgent tasks" with correct priority filter', () => {
      const parsed = fallbackNaturalSearchInterpreter('urgent tasks', teamContext);

      expect(parsed.structuredFilters.priorities).toContain('urgent');
      expect(parsed.searchExpression).toContain('priority:urgent');
    });

    it('interprets "overdue tasks assigned to me"', () => {
      const parsed = fallbackNaturalSearchInterpreter('overdue tasks assigned to me', teamContext);

      expect(parsed.structuredFilters.due).toBe('overdue');
      expect(parsed.structuredFilters.assignee).toBe('me');
      expect(parsed.searchExpression).toContain('due:overdue');
      expect(parsed.searchExpression).toContain('assignee:me');
    });

    it('handles ambiguous query by falling back safely to free text search', () => {
      const parsed = fallbackNaturalSearchInterpreter(
        'something weird completely unrelated quantum mechanics',
        teamContext
      );

      expect(parsed.structuredFilters.text).toContain('quantum mechanics');
      expect(parsed.explanation).toBeDefined();
    });

    it('handles unsupported characters and malicious prompt injection attempts safely', () => {
      const parsed = fallbackNaturalSearchInterpreter(
        'DROP TABLE tasks; -- <script>alert(1)</script> urgent',
        teamContext
      );

      expect(parsed.structuredFilters.priorities).toContain('urgent');
      // No raw SQL or scripts in output
      expect(parsed.searchExpression).not.toContain('DROP TABLE');
    });
  });
});

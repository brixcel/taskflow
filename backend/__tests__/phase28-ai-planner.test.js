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
  generateFallbackProjectPlan,
  generateProjectPlan,
  applyProjectPlan,
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
let userA, userB;
let teamA, teamB;
let tokenA, tokenB;

function makeToken(userId, email, teamId) {
  return jwt.sign(
    { userId, email, teamId },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

describe('Phase 28 — AI Project Planner & Roadmap Generator', () => {
  beforeAll(async () => {
    app = createTestApp();

    await prisma.activity.deleteMany({});
    await prisma.comment.deleteMany({});
    await prisma.subtask.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.projectMember.deleteMany({});
    await prisma.project.deleteMany({});
    await prisma.teamMembership.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: { in: ['alice-planner@test.com', 'bob-planner@test.com'] },
      },
    });

    const passwordHash = await bcrypt.hash('password123', 10);

    userA = await prisma.user.create({
      data: {
        email: 'alice-planner@test.com',
        passwordHash,
        name: 'Alice Planner',
      },
    });

    teamA = await prisma.team.create({
      data: {
        name: 'Planner Team A',
        ownerId: userA.id,
        memberships: {
          create: {
            userId: userA.id,
            role: 'owner',
          },
        },
      },
    });

    tokenA = makeToken(userA.id, userA.email, teamA.id);

    userB = await prisma.user.create({
      data: {
        email: 'bob-planner@test.com',
        passwordHash,
        name: 'Bob Planner',
      },
    });

    teamB = await prisma.team.create({
      data: {
        name: 'Planner Team B',
        ownerId: userB.id,
        memberships: {
          create: {
            userId: userB.id,
            role: 'owner',
          },
        },
      },
    });

    tokenB = makeToken(userB.id, userB.email, teamB.id);
  });

  afterAll(async () => {
    await prisma.activity.deleteMany({});
    await prisma.comment.deleteMany({});
    await prisma.subtask.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.projectMember.deleteMany({});
    await prisma.project.deleteMany({});
    await prisma.teamMembership.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: { in: ['alice-planner@test.com', 'bob-planner@test.com'] },
      },
    });
  });

  describe('1. Unit Fallback & Service Generation', () => {
    it('generates a complete structured hierarchy for e-commerce website', () => {
      const plan = generateFallbackProjectPlan('Build an e-commerce website with Stripe checkout', 4);
      expect(plan).toHaveProperty('name');
      expect(plan).toHaveProperty('description');
      expect(plan).toHaveProperty('icon');
      expect(plan).toHaveProperty('color');
      expect(plan.targetDays).toBe(28);
      expect(plan.phases).toEqual(['Planning', 'UI/UX', 'Development', 'Testing', 'Deployment']);
      expect(plan.tasks.length).toBeGreaterThanOrEqual(4);

      // Verify task properties
      const firstTask = plan.tasks[0];
      expect(firstTask).toHaveProperty('title');
      expect(firstTask).toHaveProperty('phase');
      expect(firstTask).toHaveProperty('priority');
      expect(firstTask).toHaveProperty('suggestedDeadlineOffsetDays');
      expect(Array.isArray(firstTask.subtasks)).toBe(true);
      expect(firstTask.subtasks.length).toBeGreaterThan(0);
    });

    it('generates a mobile app roadmap blueprint', () => {
      const plan = generateFallbackProjectPlan('Design and launch an iOS & Android fitness mobile app', 6);
      expect(plan.name).toContain('Mobile');
      expect(plan.icon).toBe('📱');
      expect(plan.targetDays).toBe(42);
      expect(plan.phases).toEqual(['Planning', 'UI/UX', 'Development', 'Testing', 'Deployment']);
      expect(plan.tasks.length).toBeGreaterThan(3);
    });

    it('generates cloud devops blueprint with custom duration', () => {
      const plan = generateFallbackProjectPlan('Migrate database and set up AWS Docker Kubernetes infrastructure', 8);
      expect(plan.name).toContain('Cloud');
      expect(plan.icon).toBe('☁️');
      expect(plan.targetDays).toBe(56);
      expect(plan.tasks.some(t => t.phase === 'Deployment')).toBe(true);
    });

    it('generates general project plan dynamically for arbitrary input', () => {
      const plan = generateFallbackProjectPlan('Organize annual tech conference 2027', 3);
      expect(plan.name.toLowerCase()).toContain('tech conference');
      expect(plan.targetDays).toBe(21);
      expect(plan.phases.length).toBe(5);
      expect(plan.tasks.length).toBeGreaterThanOrEqual(4);
    });

    it('generateProjectPlan service parses successfully against Zod response schema', async () => {
      const validatedPlan = await generateProjectPlan({
        prompt: 'Build an internal HR payroll and attendance system',
        timeframeWeeks: 4,
      });

      expect(validatedPlan).toHaveProperty('name');
      expect(validatedPlan.phases).toContain('Planning');
      expect(validatedPlan.tasks.length).toBeGreaterThan(0);
    });
  });

  describe('2. POST /ai/plan-project Route Validation & Security', () => {
    it('rejects request without authentication with 401', async () => {
      const res = await request(app)
        .post('/ai/plan-project')
        .send({ prompt: 'Build an e-commerce website' });

      expect(res.status).toBe(401);
    });

    it('rejects empty prompt with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/ai/plan-project')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ prompt: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.errors || res.body.error).toBeDefined();
    });


    it('rejects invalid timeframeWeeks (> 52) with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/ai/plan-project')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ prompt: 'Build an app', timeframeWeeks: 100 });

      expect(res.status).toBe(400);
    });

    it('generates valid project plan for authenticated team member', async () => {
      const res = await request(app)
        .post('/ai/plan-project')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          prompt: 'Build an e-commerce website with Stripe payment processing',
          timeframeWeeks: 4,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.plan).toBeDefined();
      expect(res.body.plan.name).toBeDefined();
      expect(res.body.plan.phases).toEqual(['Planning', 'UI/UX', 'Development', 'Testing', 'Deployment']);
      expect(Array.isArray(res.body.plan.tasks)).toBe(true);
      expect(res.body.plan.tasks.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('3. POST /ai/apply-project-plan Transactional Creation', () => {
    it('rejects applying plan with missing required fields or empty tasks with 400', async () => {
      const res = await request(app)
        .post('/ai/apply-project-plan')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          name: 'Empty Project',
          tasks: [],
        });

      expect(res.status).toBe(400);
    });

    it('atomically creates project, tasks, subtasks, and logs activity upon user approval', async () => {
      const planPayload = {
        name: 'AI Generated SaaS Platform',
        description: 'Comprehensive roadmap for building and deploying SaaS platform.',
        icon: '🚀',
        color: '#6366f1',
        startDate: '2026-09-01T00:00:00.000Z',
        targetDate: '2026-10-01T00:00:00.000Z',
        tasks: [
          {
            title: 'Define multi-tenant architecture and schema',
            description: 'Design tenant isolation and RBAC models in Prisma schema.',
            priority: 'high',
            dueDate: '2026-09-07T00:00:00.000Z',
            labels: ['architecture', 'security'],
            subtasks: [
              { title: 'Draft PostgreSQL schema tables', estimatedMinutes: 45, order: 1000 },
              { title: 'Define tenant ID resolver middleware', estimatedMinutes: 30, order: 2000 },
            ],
          },
          {
            title: 'Implement OAuth and passwordless authentication',
            description: 'Configure JWT session tokens and Google OAuth.',
            priority: 'urgent',
            dueDate: '2026-09-15T00:00:00.000Z',
            labels: ['auth', 'security'],
            subtasks: [
              { title: 'Setup Google OAuth client credentials', estimatedMinutes: 30, order: 1000 },
              { title: 'Implement refresh token rotation handler', estimatedMinutes: 45, order: 2000 },
              { title: 'Write integration test suite', estimatedMinutes: 30, order: 3000 },
            ],
          },
          {
            title: 'Deploy to AWS container cluster with CI/CD',
            description: 'Configure GitHub Actions and automated health checks.',
            priority: 'high',
            dueDate: '2026-09-30T00:00:00.000Z',
            labels: ['devops', 'deployment'],
            subtasks: [
              { title: 'Setup GitHub Actions pipeline', estimatedMinutes: 30, order: 1000 },
            ],
          },
        ],
      };

      const res = await request(app)
        .post('/ai/apply-project-plan')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send(planPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.project).toBeDefined();
      expect(res.body.project.name).toBe('AI Generated SaaS Platform');
      expect(res.body.project.teamId).toBe(teamA.id);
      expect(res.body.tasksCount).toBe(3);
      expect(res.body.subtasksCount).toBe(6); // 2 + 3 + 1 = 6

      const createdProjectId = res.body.project.id;

      // Verify in database: Project exists with lead member
      const dbProject = await prisma.project.findUnique({
        where: { id: createdProjectId },
        include: { members: true },
      });
      expect(dbProject).not.toBeNull();
      expect(dbProject.members.some(m => m.userId === userA.id && m.role === 'lead')).toBe(true);

      // Verify in database: Tasks exist and linked to project and team
      const dbTasks = await prisma.task.findMany({
        where: { projectId: createdProjectId, teamId: teamA.id },
        include: { subtasks: true },
        orderBy: { order: 'asc' },
      });
      expect(dbTasks.length).toBe(3);
      expect(dbTasks[0].title).toBe('Define multi-tenant architecture and schema');
      expect(dbTasks[0].subtasks.length).toBe(2);
      expect(dbTasks[1].title).toBe('Implement OAuth and passwordless authentication');
      expect(dbTasks[1].subtasks.length).toBe(3);
      expect(dbTasks[2].subtasks.length).toBe(1);

      // Verify in database: Activity log exists
      const activities = await prisma.activity.findMany({
        where: { taskId: dbTasks[0].id },
      });
      expect(activities.length).toBeGreaterThan(0);
    });
  });

  describe('4. Multi-Tenant Isolation & Security', () => {
    it('prevents user from applying project to a team they do not belong to', async () => {
      const planPayload = {
        name: 'Unauthorized Cross-Team Project',
        tasks: [
          {
            title: 'Malicious Task',
            priority: 'low',
          },
        ],
      };

      // User B attempting to apply plan to Team A
      const res = await request(app)
        .post('/ai/apply-project-plan')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamA.id)
        .send(planPayload);

      expect(res.status).toBe(403);
    });

    it('ensures User B cannot see User A projects or tasks', async () => {
      const resA = await request(app)
        .get('/projects')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(resA.status).toBe(200);
      expect(resA.body.projects.length).toBeGreaterThan(0);

      const resB = await request(app)
        .get('/projects')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamB.id);

      expect(resB.status).toBe(200);
      expect(resB.body.projects.length).toBe(0);
    });
  });
});

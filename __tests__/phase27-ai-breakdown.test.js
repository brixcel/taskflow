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
  breakdownTaskIntoSubtasks,
  generateFallbackBreakdown,
} = require('../services/ai');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use('/tasks', taskRoutes);
  app.use('/projects', projectRoutes);
  app.use('/subtasks', subtaskRoutes);
  app.use('/tasks/:taskId/subtasks', subtaskRoutes);
  app.use('/ai', aiRoutes);
  return app;
}

let app;
let userA, userB;
let teamA, teamB;
let tokenA, tokenB;
let projectA, taskA;

function makeToken(userId, email, teamId) {
  return jwt.sign(
    { userId, email, teamId },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

describe('Phase 27 — AI Task Breakdown & Subtask Generator', () => {
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
        email: { in: ['alice-breakdown@test.com', 'bob-breakdown@test.com'] },
      },
    });

    const passwordHash = await bcrypt.hash('password123', 10);

    userA = await prisma.user.create({
      data: {
        email: 'alice-breakdown@test.com',
        passwordHash,
        name: 'Alice Breakdown',
      },
    });

    teamA = await prisma.team.create({
      data: {
        name: 'Breakdown Team A',
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
        email: 'bob-breakdown@test.com',
        passwordHash,
        name: 'Bob Breakdown',
      },
    });

    teamB = await prisma.team.create({
      data: {
        name: 'Breakdown Team B',
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

    projectA = await prisma.project.create({
      data: {
        name: 'Cloud Infrastructure',
        description: 'Deploying services on AWS',
        color: '#7c3aed',
        icon: '☁️',
        teamId: teamA.id,
        createdById: userA.id,
      },
    });

    taskA = await prisma.task.create({
      data: {
        title: 'Deploy TaskFlow Infrastructure to AWS',
        description: 'Set up resilient cloud hosting with database and automated pipeline',
        teamId: teamA.id,
        projectId: projectA.id,
        createdById: userA.id,
        status: 'todo',
        priority: 'high',
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.subtask.deleteMany({});
      await prisma.activity.deleteMany({});
      await prisma.task.deleteMany({});
      await prisma.project.deleteMany({});
      await prisma.teamMembership.deleteMany({});
      await prisma.team.deleteMany({});
      await prisma.user.deleteMany({
        where: {
          email: { in: ['alice-breakdown@test.com', 'bob-breakdown@test.com'] },
        },
      });
    } catch (e) {
      // Ignore
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. AI Breakdown Service Unit Tests
  // ─────────────────────────────────────────────────────────────────────────────
  describe('1. AI Breakdown Service Unit Tests', () => {
    it('generates cloud deployment checklist for AWS task', () => {
      const breakdown = generateFallbackBreakdown({
        title: 'Deploy TaskFlow to AWS',
        description: 'Cloud deployment with database and domain',
      });

      expect(Array.isArray(breakdown)).toBe(true);
      expect(breakdown.length).toBeGreaterThanOrEqual(4);
      expect(breakdown[0]).toHaveProperty('title');
      expect(breakdown[0]).toHaveProperty('estimatedMinutes');
      expect(breakdown[0]).toHaveProperty('order');

      const titles = breakdown.map(s => s.title.toLowerCase());
      expect(titles.some(t => t.includes('cloud') || t.includes('iam') || t.includes('credentials'))).toBe(true);
    });

    it('generates authentication breakdown for OAuth login task', () => {
      const breakdown = generateFallbackBreakdown({
        title: 'Implement Google & GitHub OAuth',
        description: 'Authentication with token persistence',
      });

      expect(breakdown.length).toBeGreaterThanOrEqual(4);
      const titles = breakdown.map(s => s.title.toLowerCase());
      expect(titles.some(t => t.includes('login') || t.includes('oauth') || t.includes('token'))).toBe(true);
    });

    it('generates social media marketing checklist for creator campaign', () => {
      const breakdown = generateFallbackBreakdown({
        title: 'Instagram & TikTok Content Campaign',
        description: 'Prepare social media launch assets and scheduling',
      });

      expect(breakdown.length).toBeGreaterThanOrEqual(4);
      const titles = breakdown.map(s => s.title.toLowerCase());
      expect(titles.some(t => t.includes('content') || t.includes('calendar') || t.includes('graphics') || t.includes('schedule'))).toBe(true);
    });

    it('generates database migration checklist', () => {
      const breakdown = generateFallbackBreakdown({
        title: 'Design PostgreSQL Schema & Migration',
        description: 'Add composite indexes and relations',
      });

      expect(breakdown.length).toBeGreaterThanOrEqual(4);
      const titles = breakdown.map(s => s.title.toLowerCase());
      expect(titles.some(t => t.includes('prisma') || t.includes('migration') || t.includes('indexes'))).toBe(true);
    });

    it('filters out existing subtasks to prevent duplicates', () => {
      const existing = [
        { title: 'Create cloud credentials and IAM permissions' },
      ];

      const breakdown = generateFallbackBreakdown({
        title: 'Deploy TaskFlow to AWS',
        description: 'Cloud deployment',
        existingSubtasks: existing,
      });

      const titles = breakdown.map(s => s.title.toLowerCase());
      expect(titles).not.toContain('create cloud credentials and iam permissions');
    });

    it('rejects empty title and description with error', async () => {
      await expect(
        breakdownTaskIntoSubtasks({ title: '', description: '' })
      ).rejects.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. POST /ai/breakdown-task API Tests
  // ─────────────────────────────────────────────────────────────────────────────
  describe('2. POST /ai/breakdown-task API Tests', () => {
    it('generates subtask suggestions for an existing task by taskId', async () => {
      const res = await request(app)
        .post('/ai/breakdown-task')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ taskId: taskA.id });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.subtasks)).toBe(true);
      expect(res.body.subtasks.length).toBeGreaterThanOrEqual(4);
      expect(res.body.subtasks[0]).toHaveProperty('title');
      expect(res.body.subtasks[0]).toHaveProperty('estimatedMinutes');
    });

    it('generates subtasks from natural language title & description', async () => {
      const res = await request(app)
        .post('/ai/breakdown-task')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: 'Design Dark Mode UI and Color Tokens',
          description: 'Refactor CSS variables and accessible contrast',
          projectId: projectA.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.subtasks)).toBe(true);
      expect(res.body.subtasks.length).toBeGreaterThanOrEqual(3);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/ai/breakdown-task')
        .send({ taskId: taskA.id });

      expect(res.status).toBe(401);
    });

    it('returns 404 if taskId belongs to another team (multi-tenant security)', async () => {
      const res = await request(app)
        .post('/ai/breakdown-task')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ taskId: taskA.id });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Task not found/i);
    });

    it('rejects missing both taskId and title with 400 validation error', async () => {
      const res = await request(app)
        .post('/ai/breakdown-task')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ description: 'Only description without title or taskId' });

      expect(res.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Batch Subtask Creation (POST /tasks/:taskId/subtasks/batch)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('3. Batch Subtask Creation (POST /tasks/:taskId/subtasks/batch)', () => {
    it('creates multiple subtasks atomically in a single request', async () => {
      const batchPayload = {
        subtasks: [
          { title: 'Create AWS IAM role with least privilege', order: 1000 },
          { title: 'Configure RDS PostgreSQL multi-AZ instance', order: 2000 },
          { title: 'Deploy Express backend via Docker container', order: 3000 },
          { title: 'Configure CloudFront distribution and SSL certificate', order: 4000 },
        ],
      };

      const res = await request(app)
        .post(`/tasks/${taskA.id}/subtasks/batch`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(batchPayload);

      expect(res.status).toBe(201);
      expect(res.body.subtasks).toHaveLength(4);
      expect(res.body.subtasks[0].title).toBe('Create AWS IAM role with least privilege');
      expect(res.body.subtasks[0].completed).toBe(false);
      expect(res.body.subtasks[3].title).toBe('Configure CloudFront distribution and SSL certificate');

      // Verify in DB
      const dbSubtasks = await prisma.subtask.findMany({
        where: { taskId: taskA.id },
        orderBy: { order: 'asc' },
      });
      expect(dbSubtasks).toHaveLength(4);

      // Verify activity recorded
      const activity = await prisma.activity.findFirst({
        where: { taskId: taskA.id, action: 'subtask_created' },
        orderBy: { createdAt: 'desc' },
      });
      expect(activity).toBeTruthy();
      expect(activity.details).toMatch(/Added 4 subtask\(s\) via AI breakdown/i);
    });

    it('prevents Bob from batch creating subtasks on Alice task', async () => {
      const res = await request(app)
        .post(`/tasks/${taskA.id}/subtasks/batch`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          subtasks: [{ title: 'Malicious Subtask' }],
        });

      expect(res.status).toBe(404);
    });

    it('rejects empty batch with 400 validation error', async () => {
      const res = await request(app)
        .post(`/tasks/${taskA.id}/subtasks/batch`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ subtasks: [] });

      expect(res.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. End-to-End AI Breakdown & Subtask Management Flow
  // ─────────────────────────────────────────────────────────────────────────────
  describe('4. End-to-End AI Breakdown Flow', () => {
    it('breaks down task, allows selecting subtasks, and reflects in task graph', async () => {
      // 1. Create a fresh task
      const taskRes = await request(app)
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: 'Launch Instagram Reel Marketing Campaign',
          description: 'Produce high-converting reels for spring collection',
          priority: 'medium',
        });

      const newTaskId = taskRes.body.task.id;

      // 2. Request AI breakdown
      const aiRes = await request(app)
        .post('/ai/breakdown-task')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ taskId: newTaskId });

      expect(aiRes.status).toBe(200);
      const suggestions = aiRes.body.subtasks;
      expect(suggestions.length).toBeGreaterThanOrEqual(3);

      // 3. Select first 2 suggestions to accept
      const selected = suggestions.slice(0, 2).map(s => ({
        title: s.title,
        order: s.order,
      }));

      const batchRes = await request(app)
        .post(`/tasks/${newTaskId}/subtasks/batch`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ subtasks: selected });

      expect(batchRes.status).toBe(201);
      expect(batchRes.body.subtasks).toHaveLength(2);

      // 4. Fetch task detail graph
      const detailRes = await request(app)
        .get(`/tasks/${newTaskId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.task.subtasks).toHaveLength(2);
      expect(detailRes.body.task._count.subtasks).toBe(2);

      // 5. Toggle first subtask complete
      const firstSubtaskId = detailRes.body.task.subtasks[0].id;
      const toggleRes = await request(app)
        .patch(`/subtasks/${firstSubtaskId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ completed: true });

      expect(toggleRes.status).toBe(200);
      expect(toggleRes.body.subtask.completed).toBe(true);
    });
  });
});

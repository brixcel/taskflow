/**
 * Phase 26 — AI Task Assistant Test Suite
 */

const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const {
  generateTaskFromPrompt,
  sanitizePrompt,
  generateFallbackTask,
} = require('../services/ai');

const authRoutes = require('../routes/auth');
const taskRoutes = require('../routes/tasks');
const projectRoutes = require('../routes/projects');
const aiRoutes = require('../routes/ai');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use('/tasks', taskRoutes);
  app.use('/projects', projectRoutes);
  app.use('/ai', aiRoutes);
  return app;
}

let app;
let userA, userB;
let teamA, teamB;
let tokenA, tokenB;
let projectA, projectB;

function makeToken(userId, email, teamId) {
  return jwt.sign(
    { userId, email, teamId },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

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
      email: { in: ['ai-alice@test.com', 'ai-bob@test.com'] },
    },
  });

  const passwordHash = await bcrypt.hash('password123', 10);

  userA = await prisma.user.create({
    data: {
      email: 'ai-alice@test.com',
      passwordHash,
      name: 'Alice AI',
    },
  });

  teamA = await prisma.team.create({
    data: {
      name: 'AI Team A',
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
      email: 'ai-bob@test.com',
      passwordHash,
      name: 'Bob AI',
    },
  });

  teamB = await prisma.team.create({
    data: {
      name: 'AI Team B',
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
      name: 'Website Redesign',
      description: 'Modernizing the user interface',
      color: '#4f46e5',
      icon: '🎨',
      teamId: teamA.id,
      createdById: userA.id,
    },
  });

  projectB = await prisma.project.create({
    data: {
      name: 'Mobile App',
      description: 'Native iOS and Android client',
      color: '#10b981',
      icon: '📱',
      teamId: teamB.id,
      createdById: userB.id,
    },
  });
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
      email: { in: ['ai-alice@test.com', 'ai-bob@test.com'] },
    },
  });
});

describe('Phase 26 — AI Task Assistant', () => {

  describe('1. AI Service Unit Tests', () => {
    it('sanitizes prompts and strips script tags', () => {
      const dirty = '  <script>alert("xss")</script>Create a login page with <b>OAuth</b>   ';
      const clean = sanitizePrompt(dirty);
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('alert');
      expect(clean).toBe('Create a login page with OAuth');
    });

    it('generates structured fallback task for authentication keyword', () => {
      const task = generateFallbackTask('Implement OAuth 2.0 login with Google', null);
      expect(task.title.toLowerCase()).toMatch(/oauth|auth|login/);
      expect(task.priority).toBe('high');
      expect(task.labels).toContain('auth');
      expect(task.suggestedSubtasks.length).toBeGreaterThanOrEqual(3);
    });

    it('generates structured fallback task for cloud deployment keyword', () => {
      const task = generateFallbackTask('Deploy backend containers to AWS ECS', null);
      expect(task.title.toLowerCase()).toMatch(/deploy|cloud|aws|infrastructure/);
      expect(task.priority).toBe('high');
      expect(task.labels).toContain('devops');
      expect(task.suggestedSubtasks.length).toBeGreaterThanOrEqual(3);
    });

    it('generates structured fallback task for database keyword', () => {
      const task = generateFallbackTask('Add PostgreSQL index for search queries', null);
      expect(task.title).toContain('Database');
      expect(task.labels).toContain('database');
      expect(task.suggestedSubtasks.length).toBeGreaterThanOrEqual(3);
    });

    it('generates structured fallback task for urgent bug keyword', () => {
      const task = generateFallbackTask('Urgent crash bug in payment gateway', null);
      expect(task.priority).toBe('urgent');
      expect(task.suggestedDeadlineDays).toBe(1);
      expect(task.labels).toContain('bug');
    });

    it('generates task with valid due date and schema validation', async () => {
      const res = await generateTaskFromPrompt({
        prompt: 'Build landing page hero section',
        project: projectA,
      });

      expect(res.title).toBeDefined();
      expect(res.description).toBeDefined();
      expect(['low', 'medium', 'high', 'urgent']).toContain(res.priority);
      expect(res.suggestedDeadlineDays).toBeGreaterThan(0);
      expect(res.suggestedDueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Array.isArray(res.suggestedSubtasks)).toBe(true);
    });

    it('rejects empty prompts', async () => {
      await expect(generateTaskFromPrompt({ prompt: '   ' })).rejects.toThrow();
    });
  });

  describe('2. POST /ai/generate-task API Execution', () => {
    it('generates a task suggestion from natural language prompt', async () => {
      const res = await request(app)
        .post('/ai/generate-task')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ prompt: 'Create OAuth 2.0 authentication flow' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.suggestion).toBeDefined();

      const { suggestion } = res.body;
      expect(suggestion.title).toBeDefined();
      expect(suggestion.description).toBeDefined();
      expect(suggestion.priority).toBeDefined();
      expect(suggestion.suggestedDueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Array.isArray(suggestion.suggestedSubtasks)).toBe(true);
      expect(suggestion.suggestedSubtasks.length).toBeGreaterThanOrEqual(3);
    });

    it('incorporates project context when valid projectId is passed', async () => {
      const res = await request(app)
        .post('/ai/generate-task')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          prompt: 'Create dark mode theme toggle',
          projectId: projectA.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.suggestion.title).toBeDefined();
    });

    it('rejects missing or blank prompt with 400', async () => {
      const res = await request(app)
        .post('/ai/generate-task')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ prompt: '   ' });

      expect(res.status).toBe(400);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/ai/generate-task')
        .send({ prompt: 'Create a task' });

      expect(res.status).toBe(401);
    });

    it('returns 404 if projectId belongs to another team', async () => {
      const res = await request(app)
        .post('/ai/generate-task')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          prompt: 'Create a task',
          projectId: projectB.id,
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Project not found');
    });
  });

  describe('3. Atomic Task Creation with AI Subtasks (POST /tasks)', () => {
    it('creates a task with AI-suggested initial subtasks atomically', async () => {
      const taskPayload = {
        title: 'Implement OAuth Authentication',
        description: 'Google and GitHub OAuth implementation',
        priority: 'high',
        status: 'todo',
        labels: ['auth', 'security'],
        projectId: projectA.id,
        dueDate: new Date(Date.now() + 86400000 * 3).toISOString(),
        subtasks: [
          { title: 'Design OAuth button in Figma', order: 1000 },
          { title: 'Set up OAuth credentials in Google Console', order: 2000 },
          { title: 'Write token exchange backend route', order: 3000 },
        ],
      };

      const res = await request(app)
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(taskPayload);

      expect(res.status).toBe(201);
      expect(res.body.task).toBeDefined();
      expect(res.body.task.title).toBe(taskPayload.title);
      expect(res.body.task.teamId).toBe(teamA.id);
      expect(Array.isArray(res.body.task.subtasks)).toBe(true);
      expect(res.body.task.subtasks).toHaveLength(3);

      const createdTaskId = res.body.task.id;

      const dbSubtasks = await prisma.subtask.findMany({
        where: { taskId: createdTaskId },
        orderBy: { order: 'asc' },
      });

      expect(dbSubtasks).toHaveLength(3);
      expect(dbSubtasks[0].title).toBe('Design OAuth button in Figma');
      expect(dbSubtasks[0].completed).toBe(false);
      expect(dbSubtasks[1].title).toBe('Set up OAuth credentials in Google Console');
      expect(dbSubtasks[2].title).toBe('Write token exchange backend route');
    });

    it('creates standard task when subtasks array is omitted', async () => {
      const res = await request(app)
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: 'Simple task without subtasks',
        });

      expect(res.status).toBe(201);
      expect(res.body.task).toBeDefined();
      expect(res.body.task.subtasks).toHaveLength(0);
    });
  });

  describe('4. Multi-Tenant Security & Isolation', () => {
    it('prevents Bob from viewing Alice task with subtasks', async () => {
      const aliceTask = await prisma.task.create({
        data: {
          title: 'Secret Alice AI Task',
          teamId: teamA.id,
          createdById: userA.id,
        },
      });

      const res = await request(app)
        .get(`/tasks/${aliceTask.id}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
    });
  });
});

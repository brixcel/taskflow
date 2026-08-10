/**
 * Phase 18 — Kanban Workspace Test Suite
 *
 * Verifies:
 * 1. Task creation with priority, labels, order, position, status.
 * 2. PATCH /tasks/:id/order status changes and order updates.
 * 3. Activity logging on status change during Kanban moves.
 * 4. Persistent ordering across queries.
 * 5. Batch reordering via PATCH /tasks/reorder/batch.
 * 6. Validation of invalid moves, missing fields, invalid enums.
 * 7. Tenant isolation (cannot move or reorder another team's tasks).
 * 8. Authorization and RBAC enforcement.
 */

const request = require('supertest');
const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const prisma  = require('../prisma');

const authRoutes = require('../routes/auth');
const taskRoutes = require('../routes/tasks');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use('/tasks', taskRoutes);
  return app;
}

let app;
let userA, userB;
let teamA, teamB;
let tokenA, tokenB;

beforeAll(async () => {
  app = createTestApp();

  // Clean existing test users if any
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: { in: ['kanban-a@test.com', 'kanban-b@test.com'] },
    },
  });

  const passwordHash = await bcrypt.hash('password123', 10);

  // User A & Team A
  userA = await prisma.user.create({
    data: {
      email: 'kanban-a@test.com',
      passwordHash,
      name: 'Kanban User A',
      emailVerified: true,
    },
  });

  teamA = await prisma.team.create({
    data: {
      name: 'Team Alpha',
      ownerId: userA.id,
      memberships: {
        create: {
          userId: userA.id,
          role: 'owner',
        },
      },
    },
  });

  tokenA = jwt.sign(
    { userId: userA.id, email: userA.email },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );

  // User B & Team B
  userB = await prisma.user.create({
    data: {
      email: 'kanban-b@test.com',
      passwordHash,
      name: 'Kanban User B',
      emailVerified: true,
    },
  });

  teamB = await prisma.team.create({
    data: {
      name: 'Team Beta',
      ownerId: userB.id,
      memberships: {
        create: {
          userId: userB.id,
          role: 'owner',
        },
      },
    },
  });

  tokenB = jwt.sign(
    { userId: userB.id, email: userB.email },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
});

afterAll(async () => {
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: { in: ['kanban-a@test.com', 'kanban-b@test.com'] },
    },
  });
  await prisma.$disconnect();
});

describe('Phase 18 — Kanban Workspace Backend API', () => {

  describe('1. Task Creation with Kanban Metadata', () => {
    it('creates a task with priority, labels, and auto-computed order', async () => {
      const res = await request(app)
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          title: 'Design Kanban Board',
          description: 'Create column layout and cards',
          priority: 'urgent',
          labels: ['frontend', 'ui', 'phase18'],
        });

      expect(res.status).toBe(201);
      expect(res.body.task).toBeDefined();
      expect(res.body.task.title).toBe('Design Kanban Board');
      expect(res.body.task.priority).toBe('urgent');
      expect(res.body.task.labels).toEqual(['frontend', 'ui', 'phase18']);
      expect(res.body.task.order).toBeGreaterThanOrEqual(1000);
      expect(res.body.task.status).toBe('todo');
    });

    it('creates tasks with sequential default ordering in the same column', async () => {
      const res2 = await request(app)
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          title: 'Second Task in Todo',
          priority: 'high',
        });

      expect(res2.status).toBe(201);
      expect(res2.body.task.order).toBeGreaterThan(1000);
    });

    it('rejects invalid priority enum', async () => {
      const res = await request(app)
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          title: 'Invalid Priority Task',
          priority: 'super-urgent-mega',
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'priority' })])
      );
    });
  });

  describe('2. PATCH /tasks/:id/order (Kanban Move & Reorder)', () => {
    let task1, task2, task3;

    beforeEach(async () => {
      await prisma.activity.deleteMany({});
      await prisma.task.deleteMany({});

      task1 = await prisma.task.create({
        data: {
          title: 'Task 1',
          status: 'todo',
          order: 1000,
          createdById: userA.id,
          teamId: teamA.id,
        },
      });

      task2 = await prisma.task.create({
        data: {
          title: 'Task 2',
          status: 'todo',
          order: 2000,
          createdById: userA.id,
          teamId: teamA.id,
        },
      });

      task3 = await prisma.task.create({
        data: {
          title: 'Task 3',
          status: 'in_progress',
          order: 1000,
          createdById: userA.id,
          teamId: teamA.id,
        },
      });
    });

    it('moves task between columns with status and position update', async () => {
      const res = await request(app)
        .patch(`/tasks/${task1.id}/order`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          status: 'in_progress',
          position: 500,
        });

      expect(res.status).toBe(200);
      expect(res.body.task.status).toBe('in_progress');
      expect(res.body.task.order).toBe(500);

      // Verify activity was logged
      const activity = await prisma.activity.findFirst({
        where: { taskId: task1.id, action: 'status_changed' },
      });
      expect(activity).not.toBeNull();
      expect(activity.details).toBe('todo → in_progress');
    });

    it('reorders task within same column using order parameter', async () => {
      const res = await request(app)
        .patch(`/tasks/${task2.id}/order`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          order: 500, // Move task2 before task1
        });

      expect(res.status).toBe(200);
      expect(res.body.task.order).toBe(500);
      expect(res.body.task.status).toBe('todo');
    });

    it('validates required fields on order endpoint (empty payload rejected)', async () => {
      const res = await request(app)
        .patch(`/tasks/${task1.id}/order`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({});

      expect(res.status).toBe(400);
    });

    it('rejects invalid status enum on order endpoint', async () => {
      const res = await request(app)
        .patch(`/tasks/${task1.id}/order`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          status: 'backlog_invalid',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('3. Persistent Ordering on GET /tasks', () => {
    beforeEach(async () => {
      await prisma.task.deleteMany({});

      await prisma.task.createMany({
        data: [
          { title: 'Task C', status: 'todo', order: 3000, createdById: userA.id, teamId: teamA.id },
          { title: 'Task A', status: 'todo', order: 1000, createdById: userA.id, teamId: teamA.id },
          { title: 'Task B', status: 'todo', order: 2000, createdById: userA.id, teamId: teamA.id },
        ],
      });
    });

    it('returns tasks in ascending order of the order field', async () => {
      const res = await request(app)
        .get('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(3);
      expect(res.body.tasks[0].title).toBe('Task A');
      expect(res.body.tasks[1].title).toBe('Task B');
      expect(res.body.tasks[2].title).toBe('Task C');
    });

    it('filters tasks by priority and label', async () => {
      await prisma.task.create({
        data: {
          title: 'Special Bug Task',
          status: 'todo',
          priority: 'urgent',
          labels: ['bug', 'critical'],
          order: 500,
          createdById: userA.id,
          teamId: teamA.id,
        },
      });

      const priorityRes = await request(app)
        .get('/tasks?priority=urgent')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(priorityRes.status).toBe(200);
      expect(priorityRes.body.tasks).toHaveLength(1);
      expect(priorityRes.body.tasks[0].title).toBe('Special Bug Task');

      const labelRes = await request(app)
        .get('/tasks?label=critical')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(labelRes.status).toBe(200);
      expect(labelRes.body.tasks).toHaveLength(1);
      expect(labelRes.body.tasks[0].title).toBe('Special Bug Task');
    });
  });

  describe('4. Batch Task Reordering (PATCH /tasks/reorder/batch)', () => {
    let t1, t2, t3;

    beforeEach(async () => {
      await prisma.task.deleteMany({});
      t1 = await prisma.task.create({ data: { title: 'T1', status: 'todo', order: 100, createdById: userA.id, teamId: teamA.id } });
      t2 = await prisma.task.create({ data: { title: 'T2', status: 'todo', order: 200, createdById: userA.id, teamId: teamA.id } });
      t3 = await prisma.task.create({ data: { title: 'T3', status: 'todo', order: 300, createdById: userA.id, teamId: teamA.id } });
    });

    it('batch updates multiple task orders and statuses in transaction', async () => {
      const res = await request(app)
        .patch('/tasks/reorder/batch')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          tasks: [
            { id: t1.id, order: 300, status: 'done' },
            { id: t2.id, order: 100, status: 'todo' },
            { id: t3.id, order: 200, status: 'in_progress' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(3);

      const checkT1 = await prisma.task.findUnique({ where: { id: t1.id } });
      expect(checkT1.status).toBe('done');
      expect(checkT1.order).toBe(300);

      const checkT3 = await prisma.task.findUnique({ where: { id: t3.id } });
      expect(checkT3.status).toBe('in_progress');
      expect(checkT3.order).toBe(200);
    });
  });

  describe('5. Tenant Isolation & Security Enforcement', () => {
    let taskTeamA, taskTeamB;

    beforeEach(async () => {
      await prisma.task.deleteMany({});
      taskTeamA = await prisma.task.create({
        data: { title: 'Alpha Secret Task', status: 'todo', order: 100, createdById: userA.id, teamId: teamA.id },
      });
      taskTeamB = await prisma.task.create({
        data: { title: 'Beta Secret Task', status: 'todo', order: 100, createdById: userB.id, teamId: teamB.id },
      });
    });

    it('prevents user in Team B from modifying task in Team A', async () => {
      const res = await request(app)
        .patch(`/tasks/${taskTeamA.id}/order`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamB.id)
        .send({
          status: 'done',
          position: 999,
        });

      expect(res.status).toBe(404);

      // Verify task in Team A remained unchanged
      const taskCheck = await prisma.task.findUnique({ where: { id: taskTeamA.id } });
      expect(taskCheck.status).toBe('todo');
      expect(taskCheck.order).toBe(100);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .patch(`/tasks/${taskTeamA.id}/order`)
        .send({ status: 'done', order: 500 });

      expect(res.status).toBe(401);
    });

    it('prevents batch reordering tasks across multiple teams', async () => {
      const res = await request(app)
        .patch('/tasks/reorder/batch')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          tasks: [
            { id: taskTeamA.id, order: 200 },
            { id: taskTeamB.id, order: 300 }, // Belongs to Team B!
          ],
        });

      expect(res.status).toBe(404);
    });
  });
});

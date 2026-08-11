/**
 * Phase 20 — Subtasks & Checklists Test Suite
 *
 * Verifies:
 * 1. POST /tasks/:taskId/subtasks — creates subtask with assignee, due date, nested parent, activity logging.
 * 2. GET /tasks/:taskId/subtasks — lists subtasks with summary counts and progress percentage.
 * 3. GET /tasks/:id & GET /tasks — task graph integration with subtasks and progress data.
 * 4. PATCH /subtasks/:subtaskId & PATCH /tasks/:taskId/subtasks/:subtaskId — updates fields, toggles completed, logs activities.
 * 5. PATCH /subtasks/reorder/batch — batch reorders subtasks in a transaction.
 * 6. DELETE /subtasks/:subtaskId — deletes subtask, cascades nested children, enforces RBAC (creator/assignee/admin vs regular member).
 * 7. Tenant Isolation — blocks cross-team access, updates, and deletes.
 */

const request = require('supertest');
const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const prisma  = require('../prisma');

const authRoutes     = require('../routes/auth');
const taskRoutes     = require('../routes/tasks');
const subtaskRoutes  = require('../routes/subtasks');
const commentRoutes  = require('../routes/comments');
const activityRoutes = require('../routes/activities');

jest.setTimeout(15000);

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use('/tasks', taskRoutes);
  app.use('/tasks/:taskId/subtasks', subtaskRoutes);
  app.use('/subtasks', subtaskRoutes);
  app.use('/tasks/:taskId/comments', commentRoutes);
  app.use('/tasks/:taskId/activities', activityRoutes);
  return app;
}

let app;
let ownerA, memberA, memberA2, userB;
let teamA, teamB;
let tokenOwnerA, tokenMemberA, tokenMemberA2, tokenB;

beforeAll(async () => {
  app = createTestApp();

  // Cleanup test data
  await prisma.subtask.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.taskWatcher.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: { in: ['p20-owner-a@test.com', 'p20-member-a@test.com', 'p20-member-a2@test.com', 'p20-user-b@test.com'] },
    },
  });

  const passwordHash = await bcrypt.hash('password123', 10);

  // Users in Team A
  ownerA = await prisma.user.create({
    data: { email: 'p20-owner-a@test.com', passwordHash, name: 'Subtask Owner A', emailVerified: true },
  });
  memberA = await prisma.user.create({
    data: { email: 'p20-member-a@test.com', passwordHash, name: 'Subtask Member A', emailVerified: true },
  });
  memberA2 = await prisma.user.create({
    data: { email: 'p20-member-a2@test.com', passwordHash, name: 'Subtask Member A2', emailVerified: true },
  });

  teamA = await prisma.team.create({
    data: {
      name: 'Subtask Team A',
      ownerId: ownerA.id,
      memberships: {
        create: [
          { userId: ownerA.id, role: 'owner' },
          { userId: memberA.id, role: 'member' },
          { userId: memberA2.id, role: 'member' },
        ],
      },
    },
  });

  tokenOwnerA   = jwt.sign({ userId: ownerA.id, email: ownerA.email }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
  tokenMemberA  = jwt.sign({ userId: memberA.id, email: memberA.email }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
  tokenMemberA2 = jwt.sign({ userId: memberA2.id, email: memberA2.email }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });

  // User B in Team B
  userB = await prisma.user.create({
    data: { email: 'p20-user-b@test.com', passwordHash, name: 'Subtask User B', emailVerified: true },
  });
  teamB = await prisma.team.create({
    data: {
      name: 'Subtask Team B',
      ownerId: userB.id,
      memberships: {
        create: [{ userId: userB.id, role: 'owner' }],
      },
    },
  });
  tokenB = jwt.sign({ userId: userB.id, email: userB.email }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
});

afterAll(async () => {
  await prisma.subtask.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.taskWatcher.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: { in: ['p20-owner-a@test.com', 'p20-member-a@test.com', 'p20-member-a2@test.com', 'p20-user-b@test.com'] },
    },
  });
  await prisma.$disconnect();
});

describe('Phase 20 — Subtasks & Checklists Backend API', () => {
  let sampleTask;

  beforeEach(async () => {
    await prisma.subtask.deleteMany({});
    await prisma.activity.deleteMany({});
    await prisma.comment.deleteMany({});
    await prisma.task.deleteMany({});

    sampleTask = await prisma.task.create({
      data: {
        title: 'Launch Landing Page',
        description: 'Complete all steps for the launch',
        status: 'todo',
        priority: 'high',
        createdById: ownerA.id,
        teamId: teamA.id,
      },
    });
  });

  describe('1. POST /tasks/:taskId/subtasks (Create Subtask)', () => {
    it('creates a subtask with title, assignee, and due date', async () => {
      const res = await request(app)
        .post(`/tasks/${sampleTask.id}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          title: 'Design Hero Section',
          assigneeId: memberA.id,
          dueDate: '2026-08-25T12:00:00Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.subtask).toBeDefined();
      expect(res.body.subtask.title).toBe('Design Hero Section');
      expect(res.body.subtask.completed).toBe(false);
      expect(res.body.subtask.assignee.id).toBe(memberA.id);
      expect(res.body.subtask.taskId).toBe(sampleTask.id);

      // Verify activity recorded
      const activities = await prisma.activity.findMany({ where: { taskId: sampleTask.id } });
      expect(activities.some(a => a.action === 'subtask_created' && a.details.includes('Design Hero Section'))).toBe(true);
    });

    it('creates a nested child subtask with parentId', async () => {
      const parent = await prisma.subtask.create({
        data: {
          title: 'Frontend Components',
          taskId: sampleTask.id,
          order: 1000,
        },
      });

      const res = await request(app)
        .post(`/tasks/${sampleTask.id}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          title: 'Create Button Component',
          parentId: parent.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.subtask.parentId).toBe(parent.id);
    });

    it('rejects blank title with 400 validation error', async () => {
      const res = await request(app)
        .post(`/tasks/${sampleTask.id}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id)
        .send({ title: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.errors || res.body.error).toBeDefined();
    });

    it('rejects assigning a user outside the active team', async () => {
      const res = await request(app)
        .post(`/tasks/${sampleTask.id}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          title: 'External assign',
          assigneeId: userB.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Assignee is not a member/i);
    });
  });

  describe('2. GET /tasks/:taskId/subtasks (List Subtasks & Summary)', () => {
    it('returns subtask list with summary counts and progress percentage', async () => {
      await prisma.subtask.createMany({
        data: [
          { title: 'Subtask 1', taskId: sampleTask.id, completed: true, order: 1000 },
          { title: 'Subtask 2', taskId: sampleTask.id, completed: true, order: 2000 },
          { title: 'Subtask 3', taskId: sampleTask.id, completed: false, order: 3000 },
          { title: 'Subtask 4', taskId: sampleTask.id, completed: false, order: 4000 },
        ],
      });

      const res = await request(app)
        .get(`/tasks/${sampleTask.id}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.subtasks.length).toBe(4);
      expect(res.body.summary).toEqual({
        total: 4,
        completed: 2,
        progressPercent: 50,
      });
    });
  });

  describe('3. GET /tasks/:id & GET /tasks (Task Graph Integration)', () => {
    it('includes subtasks and _count in GET /tasks/:id', async () => {
      await prisma.subtask.create({
        data: { title: 'Graph Subtask', taskId: sampleTask.id, completed: true },
      });

      const res = await request(app)
        .get(`/tasks/${sampleTask.id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.task.subtasks).toBeDefined();
      expect(res.body.task.subtasks.length).toBe(1);
      expect(res.body.task.subtasks[0].title).toBe('Graph Subtask');
      expect(res.body.task._count.subtasks).toBe(1);
    });

    it('includes subtasks minimal data for progress in GET /tasks list', async () => {
      await prisma.subtask.create({
        data: { title: 'List Subtask', taskId: sampleTask.id, completed: false },
      });

      const res = await request(app)
        .get('/tasks')
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      const found = res.body.tasks.find(t => t.id === sampleTask.id);
      expect(found).toBeDefined();
      expect(found.subtasks).toBeDefined();
      expect(found.subtasks.length).toBe(1);
    });
  });

  describe('4. PATCH /subtasks/:subtaskId (Update & Toggle Completion)', () => {
    let subtask;

    beforeEach(async () => {
      subtask = await prisma.subtask.create({
        data: {
          title: 'Initial Subtask',
          taskId: sampleTask.id,
          completed: false,
          order: 1000,
        },
      });
    });

    it('toggles completion status and logs granular activity', async () => {
      const res = await request(app)
        .patch(`/subtasks/${subtask.id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id)
        .send({ completed: true });

      expect(res.status).toBe(200);
      expect(res.body.subtask.completed).toBe(true);

      const activities = await prisma.activity.findMany({ where: { taskId: sampleTask.id } });
      expect(activities.some(a => a.action === 'subtask_completed' && a.details.includes('Completed subtask'))).toBe(true);
    });

    it('updates title, dueDate, and assignee', async () => {
      const res = await request(app)
        .patch(`/subtasks/${subtask.id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          title: 'Renamed Subtask',
          assigneeId: memberA.id,
          dueDate: '2026-09-01T00:00:00Z',
        });

      expect(res.status).toBe(200);
      expect(res.body.subtask.title).toBe('Renamed Subtask');
      expect(res.body.subtask.assignee.id).toBe(memberA.id);
    });

    it('works with nested path /tasks/:taskId/subtasks/:subtaskId', async () => {
      const res = await request(app)
        .patch(`/tasks/${sampleTask.id}/subtasks/${subtask.id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id)
        .send({ title: 'Updated via nested route' });

      expect(res.status).toBe(200);
      expect(res.body.subtask.title).toBe('Updated via nested route');
    });

    it('rejects self-parenting with 400', async () => {
      const res = await request(app)
        .patch(`/subtasks/${subtask.id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id)
        .send({ parentId: subtask.id });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cannot be its own parent/i);
    });
  });

  describe('5. PATCH /subtasks/reorder/batch (Batch Reordering)', () => {
    it('updates multiple subtask orders in a single request', async () => {
      const s1 = await prisma.subtask.create({ data: { title: 'S1', taskId: sampleTask.id, order: 1000 } });
      const s2 = await prisma.subtask.create({ data: { title: 'S2', taskId: sampleTask.id, order: 2000 } });

      const res = await request(app)
        .patch('/subtasks/reorder/batch')
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          subtasks: [
            { id: s1.id, order: 2500 },
            { id: s2.id, order: 500 },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updatedS1 = await prisma.subtask.findUnique({ where: { id: s1.id } });
      const updatedS2 = await prisma.subtask.findUnique({ where: { id: s2.id } });
      expect(updatedS1.order).toBe(2500);
      expect(updatedS2.order).toBe(500);
    });
  });

  describe('6. DELETE /subtasks/:subtaskId & RBAC', () => {
    it('allows task creator to delete subtask and cascades to children', async () => {
      const parent = await prisma.subtask.create({
        data: { title: 'Parent Subtask', taskId: sampleTask.id },
      });
      const child = await prisma.subtask.create({
        data: { title: 'Child Subtask', taskId: sampleTask.id, parentId: parent.id },
      });

      const res = await request(app)
        .delete(`/subtasks/${parent.id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(204);

      // Verify both parent and child are deleted
      const foundParent = await prisma.subtask.findUnique({ where: { id: parent.id } });
      const foundChild  = await prisma.subtask.findUnique({ where: { id: child.id } });
      expect(foundParent).toBeNull();
      expect(foundChild).toBeNull();
    });

    it('allows subtask assignee to delete their subtask', async () => {
      const subtask = await prisma.subtask.create({
        data: { title: 'Assigned to Member A', taskId: sampleTask.id, assigneeId: memberA.id },
      });

      const res = await request(app)
        .delete(`/subtasks/${subtask.id}`)
        .set('Authorization', `Bearer ${tokenMemberA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(204);
    });

    it('blocks a non-creator, non-assignee plain member with 403 Forbidden', async () => {
      const subtask = await prisma.subtask.create({
        data: { title: 'Created by Owner', taskId: sampleTask.id, assigneeId: memberA.id },
      });

      const res = await request(app)
        .delete(`/subtasks/${subtask.id}`)
        .set('Authorization', `Bearer ${tokenMemberA2}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden/i);
    });
  });

  describe('7. Tenant Isolation', () => {
    it('blocks User B in Team B from accessing Team A subtasks', async () => {
      const subtask = await prisma.subtask.create({
        data: { title: 'Team A Secret Subtask', taskId: sampleTask.id },
      });

      // GET subtask
      const getRes = await request(app)
        .get(`/subtasks/${subtask.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamB.id);
      expect(getRes.status).toBe(404);

      // PATCH subtask
      const patchRes = await request(app)
        .patch(`/subtasks/${subtask.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamB.id)
        .send({ title: 'Hacked Title' });
      expect(patchRes.status).toBe(404);

      // DELETE subtask
      const deleteRes = await request(app)
        .delete(`/subtasks/${subtask.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamB.id);
      expect(deleteRes.status).toBe(404);

      // Verify subtask untouched
      const check = await prisma.subtask.findUnique({ where: { id: subtask.id } });
      expect(check.title).toBe('Team A Secret Subtask');
    });
  });
});

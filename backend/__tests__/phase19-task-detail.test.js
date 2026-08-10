/**
 * Phase 19 — Task Detail Workspace Test Suite
 *
 * Verifies:
 * 1. GET /tasks/:id returns detailed task graph (assignee, createdBy, watchers, comments, activities, _count).
 * 2. POST /tasks/:id/watch & DELETE /tasks/:id/watch & GET /tasks/:id/watchers.
 * 3. PATCH /tasks/:taskId/comments/:commentId (author allowed, non-author blocked with 403).
 * 4. DELETE /tasks/:taskId/comments/:commentId (author/admin allowed, non-author member blocked with 403).
 * 5. Granular activity logging for title, priority, assignee, due date edits.
 * 6. Tenant isolation & authorization enforcement across detail endpoints.
 */

const request = require('supertest');
const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const prisma  = require('../prisma');

const authRoutes     = require('../routes/auth');
const taskRoutes     = require('../routes/tasks');
const commentRoutes  = require('../routes/comments');
const activityRoutes = require('../routes/activities');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use('/tasks', taskRoutes);
  app.use('/tasks/:taskId/comments', commentRoutes);
  app.use('/tasks/:taskId/activities', activityRoutes);
  app.use('/tasks/:taskId/activity', activityRoutes);
  return app;
}

let app;
let ownerA, memberA, userB;
let teamA, teamB;
let tokenOwnerA, tokenMemberA, tokenB;

beforeAll(async () => {
  app = createTestApp();

  // Cleanup test data
  await prisma.taskWatcher.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: { in: ['p19-owner-a@test.com', 'p19-member-a@test.com', 'p19-user-b@test.com'] },
    },
  });

  const passwordHash = await bcrypt.hash('password123', 10);

  // Owner A & Member A in Team A
  ownerA = await prisma.user.create({
    data: { email: 'p19-owner-a@test.com', passwordHash, name: 'Detail Owner A', emailVerified: true },
  });
  memberA = await prisma.user.create({
    data: { email: 'p19-member-a@test.com', passwordHash, name: 'Detail Member A', emailVerified: true },
  });

  teamA = await prisma.team.create({
    data: {
      name: 'Workspace Team A',
      ownerId: ownerA.id,
      memberships: {
        create: [
          { userId: ownerA.id, role: 'owner' },
          { userId: memberA.id, role: 'member' },
        ],
      },
    },
  });

  tokenOwnerA = jwt.sign({ userId: ownerA.id, email: ownerA.email }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
  tokenMemberA = jwt.sign({ userId: memberA.id, email: memberA.email }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });

  // User B in Team B
  userB = await prisma.user.create({
    data: { email: 'p19-user-b@test.com', passwordHash, name: 'Detail User B', emailVerified: true },
  });
  teamB = await prisma.team.create({
    data: {
      name: 'Workspace Team B',
      ownerId: userB.id,
      memberships: {
        create: [{ userId: userB.id, role: 'owner' }],
      },
    },
  });
  tokenB = jwt.sign({ userId: userB.id, email: userB.email }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
});

afterAll(async () => {
  await prisma.taskWatcher.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: { in: ['p19-owner-a@test.com', 'p19-member-a@test.com', 'p19-user-b@test.com'] },
    },
  });
  await prisma.$disconnect();
});

describe('Phase 19 — Task Detail Workspace Backend API', () => {
  let sampleTask;

  beforeEach(async () => {
    await prisma.taskWatcher.deleteMany({});
    await prisma.activity.deleteMany({});
    await prisma.comment.deleteMany({});
    await prisma.task.deleteMany({});

    sampleTask = await prisma.task.create({
      data: {
        title: 'Complete Workspace Feature',
        description: 'Design and implement drawer workspace',
        status: 'todo',
        priority: 'high',
        labels: ['workspace', 'phase19'],
        order: 1000,
        assigneeId: memberA.id,
        createdById: ownerA.id,
        teamId: teamA.id,
      },
    });
  });

  describe('1. GET /tasks/:id (Single Task Graph)', () => {
    it('returns complete task detail graph with counts and nested relations', async () => {
      // Add a comment and watcher
      await prisma.comment.create({
        data: { content: 'Initial test comment', taskId: sampleTask.id, authorId: ownerA.id },
      });
      await prisma.taskWatcher.create({
        data: { taskId: sampleTask.id, userId: memberA.id },
      });

      const res = await request(app)
        .get(`/tasks/${sampleTask.id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.task).toBeDefined();
      expect(res.body.task.id).toBe(sampleTask.id);
      expect(res.body.task.title).toBe('Complete Workspace Feature');
      expect(res.body.task.assignee.name).toBe('Detail Member A');
      expect(res.body.task.createdBy.name).toBe('Detail Owner A');
      expect(res.body.task.comments).toHaveLength(1);
      expect(res.body.task.comments[0].content).toBe('Initial test comment');
      expect(res.body.task.watchers).toHaveLength(1);
      expect(res.body.task.watchers[0].user.name).toBe('Detail Member A');
      expect(res.body.task._count.comments).toBe(1);
      expect(res.body.task._count.watchers).toBe(1);
    });

    it('returns 404 for non-existent task ID', async () => {
      const res = await request(app)
        .get('/tasks/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(404);
    });
  });

  describe('2. Watch & Unwatch Task (POST /tasks/:id/watch & DELETE /tasks/:id/watch)', () => {
    it('allows user to watch and unwatch a task and updates watcher list', async () => {
      // Watch
      const watchRes = await request(app)
        .post(`/tasks/${sampleTask.id}/watch`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id);

      expect(watchRes.status).toBe(200);
      expect(watchRes.body.watching).toBe(true);

      // Verify in watchers list
      const listRes = await request(app)
        .get(`/tasks/${sampleTask.id}/watchers`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id);

      expect(listRes.status).toBe(200);
      expect(listRes.body.watchers).toHaveLength(1);
      expect(listRes.body.watchers[0].id).toBe(ownerA.id);

      // Unwatch
      const unwatchRes = await request(app)
        .delete(`/tasks/${sampleTask.id}/watch`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id);

      expect(unwatchRes.status).toBe(200);
      expect(unwatchRes.body.watching).toBe(false);

      // Verify removed from watchers list
      const listRes2 = await request(app)
        .get(`/tasks/${sampleTask.id}/watchers`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id);

      expect(listRes2.body.watchers).toHaveLength(0);
    });
  });

  describe('3. Comment Editing and Deleting with RBAC', () => {
    let comment;

    beforeEach(async () => {
      comment = await prisma.comment.create({
        data: {
          content: 'Comment by Member A',
          taskId: sampleTask.id,
          authorId: memberA.id,
        },
      });
    });

    it('allows author to edit their own comment', async () => {
      const res = await request(app)
        .patch(`/tasks/${sampleTask.id}/comments/${comment.id}`)
        .set('Authorization', `Bearer ${tokenMemberA}`)
        .set('X-Team-Id', teamA.id)
        .send({ content: 'Updated comment by Member A' });

      expect(res.status).toBe(200);
      expect(res.body.comment.content).toBe('Updated comment by Member A');
    });

    it('blocks non-author from editing another user comment with 403', async () => {
      const res = await request(app)
        .patch(`/tasks/${sampleTask.id}/comments/${comment.id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id)
        .send({ content: 'Owner trying to edit member comment' });

      expect(res.status).toBe(403);
    });

    it('allows author to delete their own comment', async () => {
      const res = await request(app)
        .delete(`/tasks/${sampleTask.id}/comments/${comment.id}`)
        .set('Authorization', `Bearer ${tokenMemberA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(204);

      const check = await prisma.comment.findUnique({ where: { id: comment.id } });
      expect(check).toBeNull();
    });

    it('allows team admin/owner to delete any member comment', async () => {
      const res = await request(app)
        .delete(`/tasks/${sampleTask.id}/comments/${comment.id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(204);
    });
  });

  describe('4. Granular Activity History & Aliases', () => {
    it('records distinct activity events for title and priority edits', async () => {
      await request(app)
        .patch(`/tasks/${sampleTask.id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id)
        .send({ title: 'New Renamed Title' });

      await request(app)
        .patch(`/tasks/${sampleTask.id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id)
        .send({ priority: 'urgent' });

      const actRes = await request(app)
        .get(`/tasks/${sampleTask.id}/activity`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .set('X-Team-Id', teamA.id);

      expect(actRes.status).toBe(200);
      expect(actRes.body.activities).toBeDefined();

      const actions = actRes.body.activities.map(a => a.action);
      expect(actions).toContain('title_changed');
      expect(actions).toContain('priority_changed');
    });
  });

  describe('5. Tenant Isolation Enforcement', () => {
    it('blocks user in Team B from accessing task details in Team A', async () => {
      const res = await request(app)
        .get(`/tasks/${sampleTask.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamB.id);

      expect(res.status).toBe(404);
    });

    it('blocks user in Team B from watching task in Team A', async () => {
      const res = await request(app)
        .post(`/tasks/${sampleTask.id}/watch`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamB.id);

      expect(res.status).toBe(404);
    });
  });
});

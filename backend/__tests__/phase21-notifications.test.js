/**
 * Phase 21 — Notifications Center Tests
 *
 * Covers:
 * - Notification listing, unread count, pagination, filtering
 * - Marking single / all notifications as read
 * - Deleting individual and clearing read notifications
 * - Notification preferences (GET / PATCH)
 * - Automatic event triggers:
 *   - task_assigned
 *   - task_reassigned
 *   - status_changed
 *   - task_completed
 *   - comment_created
 *   - mention (@username, @email)
 *   - team_invitation
 *   - role_changed
 *   - due_date_approaching & overdue
 * - User preferences suppression
 * - Team privacy & multi-tenant isolation
 */

const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

const authRoutes         = require('../routes/auth');
const taskRoutes         = require('../routes/tasks');
const teamRoutes         = require('../routes/teams');
const commentRoutes      = require('../routes/comments');
const notificationRoutes = require('../routes/notifications');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth',          authRoutes);
  app.use('/tasks',         taskRoutes);
  app.use('/teams',         teamRoutes);
  app.use('/tasks/:taskId/comments', commentRoutes);
  app.use('/notifications', notificationRoutes);
  return app;
}

let app;
let userA, userB, userC;
let tokenA, tokenB, tokenC;
let teamA, teamB;

function makeToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

beforeAll(async () => {
  app = createTestApp();

  // Clean up existing test users and related records
  await prisma.notification.deleteMany({});
  await prisma.notificationPreference.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: { in: ['p21_usera@test.com', 'p21_userb@test.com', 'p21_userc@test.com'] },
    },
  });

  const passwordHash = await bcrypt.hash('Password123!', 8);

  userA = await prisma.user.create({
    data: { name: 'Alice Smith', email: 'p21_usera@test.com', passwordHash, emailVerified: true },
  });
  userB = await prisma.user.create({
    data: { name: 'Bob Jones', email: 'p21_userb@test.com', passwordHash, emailVerified: true },
  });
  userC = await prisma.user.create({
    data: { name: 'Charlie Brown', email: 'p21_userc@test.com', passwordHash, emailVerified: true },
  });

  tokenA = makeToken(userA);
  tokenB = makeToken(userB);
  tokenC = makeToken(userC);

  // Create Team A (owned by User A, with User B and User C as members)
  teamA = await prisma.team.create({
    data: { name: 'Team Alpha', ownerId: userA.id },
  });

  await prisma.teamMembership.createMany({
    data: [
      { userId: userA.id, teamId: teamA.id, role: 'owner' },
      { userId: userB.id, teamId: teamA.id, role: 'member' },
      { userId: userC.id, teamId: teamA.id, role: 'member' },
    ],
  });

  // Create Team B (owned by User B)
  teamB = await prisma.team.create({
    data: { name: 'Team Beta', ownerId: userB.id },
  });
  await prisma.teamMembership.create({
    data: { userId: userB.id, teamId: teamB.id, role: 'owner' },
  });
});

afterAll(async () => {
  await prisma.notification.deleteMany({});
  await prisma.notificationPreference.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: { in: ['p21_usera@test.com', 'p21_userb@test.com', 'p21_userc@test.com'] },
    },
  });
});

describe('Phase 21 — Notifications Center API', () => {

  describe('GET /notifications & GET /notifications/unread-count', () => {
    it('returns empty list and unread count 0 initially', async () => {
      const res = await request(app)
        .get('/notifications')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.notifications).toEqual([]);
      expect(res.body.unreadCount).toBe(0);
      expect(res.body.total).toBe(0);

      const countRes = await request(app)
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(countRes.status).toBe(200);
      expect(countRes.body.unreadCount).toBe(0);
    });

    it('returns paginated notifications for the authenticated user', async () => {
      // Seed 3 notifications for User A
      await prisma.notification.createMany({
        data: [
          { userId: userA.id, title: 'Note 1', message: 'First note', type: 'task_assigned', read: false },
          { userId: userA.id, title: 'Note 2', message: 'Second note', type: 'status_changed', read: true },
          { userId: userA.id, title: 'Note 3', message: 'Third note', type: 'comment_created', read: false },
        ],
      });

      const res = await request(app)
        .get('/notifications?limit=2&page=1')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.notifications).toHaveLength(2);
      expect(res.body.total).toBe(3);
      expect(res.body.unreadCount).toBe(2);
      expect(res.body.totalPages).toBe(2);

      // Filter unread
      const unreadRes = await request(app)
        .get('/notifications?unread=true')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(unreadRes.status).toBe(200);
      expect(unreadRes.body.notifications).toHaveLength(2);
      expect(unreadRes.body.notifications.every((n) => !n.read)).toBe(true);

      // Filter by type
      const typeRes = await request(app)
        .get('/notifications?type=status_changed')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(typeRes.status).toBe(200);
      expect(typeRes.body.notifications).toHaveLength(1);
      expect(typeRes.body.notifications[0].type).toBe('status_changed');
    });
  });

  describe('PATCH /notifications/:id/read & POST /notifications/read-all', () => {
    it('marks a single notification as read', async () => {
      const note = await prisma.notification.findFirst({
        where: { userId: userA.id, read: false },
      });

      const res = await request(app)
        .patch(`/notifications/${note.id}/read`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.notification.read).toBe(true);
      expect(res.body.notification.readAt).not.toBeNull();
    });

    it('returns 404 when marking another user notification as read', async () => {
      const note = await prisma.notification.findFirst({
        where: { userId: userA.id },
      });

      const res = await request(app)
        .patch(`/notifications/${note.id}/read`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
    });

    it('marks all notifications read for the user', async () => {
      const res = await request(app)
        .post('/notifications/read-all')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);

      const unreadCount = await prisma.notification.count({
        where: { userId: userA.id, read: false },
      });
      expect(unreadCount).toBe(0);
    });
  });

  describe('DELETE /notifications/:id & DELETE /notifications/clear-all', () => {
    it('deletes an individual notification', async () => {
      const note = await prisma.notification.findFirst({
        where: { userId: userA.id },
      });

      const res = await request(app)
        .delete(`/notifications/${note.id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(204);

      const check = await prisma.notification.findUnique({
        where: { id: note.id },
      });
      expect(check).toBeNull();
    });

    it('clears all read notifications for user', async () => {
      const res = await request(app)
        .delete('/notifications/clear-all')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);

      const remaining = await prisma.notification.findMany({
        where: { userId: userA.id },
      });
      expect(remaining).toHaveLength(0);
    });
  });

  describe('GET & PATCH /notifications/preferences', () => {
    it('returns default preferences', async () => {
      const res = await request(app)
        .get('/notifications/preferences')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.preferences.taskAssigned).toBe(true);
      expect(res.body.preferences.statusChanged).toBe(true);
      expect(res.body.preferences.commentsAndMentions).toBe(true);
      expect(res.body.preferences.dueDates).toBe(true);
      expect(res.body.preferences.teamUpdates).toBe(true);
    });

    it('updates preferences successfully', async () => {
      const res = await request(app)
        .patch('/notifications/preferences')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          taskAssigned: false,
          commentsAndMentions: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.preferences.taskAssigned).toBe(false);
      expect(res.body.preferences.commentsAndMentions).toBe(false);
      expect(res.body.preferences.statusChanged).toBe(true);
    });

    it('rejects empty preference update body', async () => {
      const res = await request(app)
        .patch('/notifications/preferences')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('Lifecycle Event Triggers', () => {
    let createdTaskId;

    beforeEach(async () => {
      await prisma.notification.deleteMany({});
      // Reset user preferences to true
      await prisma.notificationPreference.upsert({
        where:  { userId: userB.id },
        create: { userId: userB.id, taskAssigned: true, commentsAndMentions: true, statusChanged: true },
        update: { taskAssigned: true, commentsAndMentions: true, statusChanged: true },
      });
    });

    it('triggers task_assigned when User A assigns task to User B', async () => {
      const res = await request(app)
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          title: 'Design Homepage',
          assigneeId: userB.id,
        });

      expect(res.status).toBe(201);
      createdTaskId = res.body.task.id;

      // Verify User B received task_assigned notification
      const note = await prisma.notification.findFirst({
        where: { userId: userB.id, type: 'task_assigned' },
      });

      expect(note).not.toBeNull();
      expect(note.title).toBe('Task assigned');
      expect(note.message).toContain('Design Homepage');
      expect(note.actorId).toBe(userA.id);
      expect(note.taskId).toBe(createdTaskId);
    });

    it('triggers task_reassigned when task assignee changes to User C', async () => {
      const res = await request(app)
        .patch(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          assigneeId: userC.id,
        });

      expect(res.status).toBe(200);

      const note = await prisma.notification.findFirst({
        where: { userId: userC.id, type: 'task_reassigned' },
      });

      expect(note).not.toBeNull();
      expect(note.title).toBe('Task reassigned');
      expect(note.actorId).toBe(userA.id);
    });

    it('triggers status_changed when task status is updated', async () => {
      const res = await request(app)
        .patch(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          status: 'in_progress',
        });

      expect(res.status).toBe(200);

      // Assignee (User C) should receive status_changed
      const note = await prisma.notification.findFirst({
        where: { userId: userC.id, type: 'status_changed' },
      });

      expect(note).not.toBeNull();
      expect(note.title).toBe('Task status updated');
    });

    it('triggers task_completed when task status becomes done', async () => {
      const res = await request(app)
        .patch(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          status: 'done',
        });

      expect(res.status).toBe(200);

      const note = await prisma.notification.findFirst({
        where: { userId: userC.id, type: 'task_completed' },
      });

      expect(note).not.toBeNull();
      expect(note.title).toBe('Task completed');
    });

    it('triggers comment_created for assignee and creator when User A comments', async () => {
      // Create a new task assigned to User C
      const task = await prisma.task.create({
        data: {
          title: 'Review PR',
          createdById: userA.id,
          assigneeId: userC.id,
          teamId: teamA.id,
        },
      });

      const res = await request(app)
        .post(`/tasks/${task.id}/comments`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          content: 'Please look at this today!',
        });

      expect(res.status).toBe(201);

      const note = await prisma.notification.findFirst({
        where: { userId: userC.id, type: 'comment_created' },
      });

      expect(note).not.toBeNull();
      expect(note.title).toBe('New comment on task');
    });

    it('triggers mention notification when comment contains @user', async () => {
      const task = await prisma.task.create({
        data: {
          title: 'Bug triage',
          createdById: userA.id,
          teamId: teamA.id,
        },
      });

      const res = await request(app)
        .post(`/tasks/${task.id}/comments`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          content: 'Hey @p21_userb@test.com can you check this out?',
        });

      expect(res.status).toBe(201);

      const mentionNote = await prisma.notification.findFirst({
        where: { userId: userB.id, type: 'mention' },
      });

      expect(mentionNote).not.toBeNull();
      expect(mentionNote.title).toBe('Mentioned in a comment');
      expect(mentionNote.message).toContain('mentioned you');
    });

    it('triggers team_invitation when user is added to a team', async () => {
      // Add User C to Team B (owned by User B)
      const res = await request(app)
        .post(`/teams/${teamB.id}/members`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          userId: userC.id,
          role: 'member',
        });

      expect(res.status).toBe(201);

      const note = await prisma.notification.findFirst({
        where: { userId: userC.id, type: 'team_invitation' },
      });

      expect(note).not.toBeNull();
      expect(note.title).toBe('Added to team');
      expect(note.actorId).toBe(userB.id);
    });

    it('triggers role_changed when member role is updated', async () => {
      const res = await request(app)
        .patch(`/teams/${teamB.id}/members/${userC.id}/role`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          role: 'admin',
        });

      expect(res.status).toBe(200);

      const note = await prisma.notification.findFirst({
        where: { userId: userC.id, type: 'role_changed' },
      });

      expect(note).not.toBeNull();
      expect(note.title).toBe('Team role updated');
      expect(note.message).toContain('admin');
    });
  });

  describe('Preference suppression & Privacy Isolation', () => {
    it('suppresses notification creation when preference is disabled', async () => {
      await prisma.notification.deleteMany({});

      // Disable taskAssigned for User B
      await prisma.notificationPreference.upsert({
        where:  { userId: userB.id },
        create: { userId: userB.id, taskAssigned: false },
        update: { taskAssigned: false },
      });

      // User A assigns task to User B
      await request(app)
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          title: 'Silent Task',
          assigneeId: userB.id,
        });

      const note = await prisma.notification.findFirst({
        where: { userId: userB.id, type: 'task_assigned' },
      });

      expect(note).toBeNull();
    });

    it('does not send notification to the actor for their own action', async () => {
      await prisma.notification.deleteMany({});

      // User A assigns task to themselves
      await request(app)
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          title: 'Self Assigned Task',
          assigneeId: userA.id,
        });

      const note = await prisma.notification.findFirst({
        where: { userId: userA.id },
      });

      expect(note).toBeNull();
    });

    it('checks approaching due dates and sends notifications', async () => {
      await prisma.notification.deleteMany({});

      const in12h = new Date(Date.now() + 12 * 60 * 60 * 1000);
      await prisma.task.create({
        data: {
          title: 'Urgent Delivery',
          dueDate: in12h,
          assigneeId: userB.id,
          createdById: userA.id,
          teamId: teamA.id,
          status: 'todo',
        },
      });

      const res = await request(app)
        .post('/notifications/check-due-dates')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.result.notificationsSent).toBeGreaterThanOrEqual(1);

      const note = await prisma.notification.findFirst({
        where: { userId: userB.id, type: 'due_date_approaching' },
      });

      expect(note).not.toBeNull();
      expect(note.title).toBe('Task due soon');
    });
  });
});

/**
 * GDPR-Lite Integration Tests — Phase 11
 *
 * Verifies:
 *   1. Auth enforcement on /users/me/export and /users/me (DELETE)
 *   2. GET /users/me/export returns complete JSON payload of user's profile, memberships, tasks, comments, activities
 *   3. DELETE /users/me returns 400 when confirmation email does not match or is missing
 *   4. DELETE /users/me soft-deletes user, anonymizes name to "Deleted User", scrubs email & password, unassigns tasks
 *   5. Teammates can still view tasks and comments created by the deleted user, showing author name as "Deleted User"
 *   6. POST /auth/login rejects login attempts for deleted accounts with 401
 */

const request = require('supertest');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { app } = require('../server');
const prisma  = require('../prisma');

function makeToken(userId, teamId) {
  return jwt.sign({ userId, teamId }, process.env.JWT_SECRET || 'test-secret');
}

describe('Phase 11 — GDPR Data Export & Account Deletion', () => {
  let userA, userB, team;
  let tokenA, tokenB;
  let taskCreatedByA;
  let commentByA;

  beforeAll(async () => {
    // Clean database tables in relational order
    await prisma.activity.deleteMany({});
    await prisma.comment.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.teamMembership.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.passwordResetToken.deleteMany({});
    await prisma.emailVerificationToken.deleteMany({});
    await prisma.user.deleteMany({});

    const passwordHash = await bcrypt.hash('Password123!', 10);

    // Create User A (account to be exported and deleted)
    userA = await prisma.user.create({
      data: {
        email: 'usera-gdpr@example.com',
        name: 'Alice GDPR',
        passwordHash,
        emailVerified: true,
      },
    });

    // Create User B (teammate who remains active)
    userB = await prisma.user.create({
      data: {
        email: 'userb-gdpr@example.com',
        name: 'Bob Teammate',
        passwordHash,
        emailVerified: true,
      },
    });

    // Create Team owned by User A
    team = await prisma.team.create({
      data: {
        name: 'GDPR Test Team',
        ownerId: userA.id,
      },
    });

    // Add team memberships individually
    await prisma.teamMembership.create({
      data: { userId: userA.id, teamId: team.id, role: 'owner' },
    });

    await prisma.teamMembership.create({
      data: { userId: userB.id, teamId: team.id, role: 'member' },
    });

    // Create a task created by User A and assigned to User A
    taskCreatedByA = await prisma.task.create({
      data: {
        title: 'Task Created by Alice',
        description: 'Detailed task description for export & deletion testing',
        status: 'in_progress',
        createdById: userA.id,
        assigneeId: userA.id,
        teamId: team.id,
      },
    });

    // Create a comment by User A on the task
    commentByA = await prisma.comment.create({
      data: {
        content: 'Initial comment by Alice',
        taskId: taskCreatedByA.id,
        authorId: userA.id,
      },
    });

    // Create an activity entry for User A
    await prisma.activity.create({
      data: {
        taskId: taskCreatedByA.id,
        userId: userA.id,
        action: 'created_task',
        details: 'Task created',
      },
    });

    tokenA = makeToken(userA.id, team.id);
    tokenB = makeToken(userB.id, team.id);
  });

  afterAll(async () => {
    await prisma.activity.deleteMany({});
    await prisma.comment.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.teamMembership.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.passwordResetToken.deleteMany({});
    await prisma.emailVerificationToken.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.$disconnect();
  });

  // ─── 1. Authentication Guards ───────────────────────────────────────────────
  describe('Authentication requirements', () => {
    it('GET /users/me returns 401 without Bearer token', async () => {
      const res = await request(app).get('/users/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/No token provided/i);
    });

    it('GET /users/me/export returns 401 without Bearer token', async () => {
      const res = await request(app).get('/users/me/export');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/No token provided/i);
    });

    it('DELETE /users/me returns 401 without Bearer token', async () => {
      const res = await request(app)
        .delete('/users/me')
        .send({ email: 'usera-gdpr@example.com' });
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/No token provided/i);
    });
  });

  // ─── GET /users/me ──────────────────────────────────────────────────────────
  describe('GET /users/me (Current User Profile)', () => {
    it('returns 200 with current user profile and emailVerified status', async () => {
      const res = await request(app)
        .get('/users/me')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.id).toBe(userA.id);
      expect(res.body.user.email).toBe('usera-gdpr@example.com');
      expect(res.body.user.name).toBe('Alice GDPR');
      expect(res.body.user.emailVerified).toBe(true);
    });
  });

  // ─── 2. GET /users/me/export ────────────────────────────────────────────────
  describe('GET /users/me/export (Data Portability)', () => {
    it('returns complete JSON bundle of all user data', async () => {
      const res = await request(app)
        .get('/users/me/export')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="taskflow-user-data.json"/);

      const data = res.body;
      expect(data).toHaveProperty('exportedAt');

      // User profile verification
      expect(data.user).toBeDefined();
      expect(data.user.id).toBe(userA.id);
      expect(data.user.email).toBe('usera-gdpr@example.com');
      expect(data.user.name).toBe('Alice GDPR');
      expect(data.user.passwordHash).toBeUndefined(); // Sensitive security field excluded

      // Team memberships & teams owned
      expect(data.teamMemberships).toHaveLength(1);
      expect(data.teamMemberships[0].teamId).toBe(team.id);
      expect(data.teamsOwned).toHaveLength(1);

      // Tasks created & assigned
      expect(data.tasksCreated).toHaveLength(1);
      expect(data.tasksCreated[0].id).toBe(taskCreatedByA.id);
      expect(data.tasksAssigned).toHaveLength(1);
      expect(data.tasksAssigned[0].id).toBe(taskCreatedByA.id);

      // Comments & activities
      expect(data.comments).toHaveLength(1);
      expect(data.comments[0].content).toBe('Initial comment by Alice');
      expect(data.activities).toHaveLength(1);
      expect(data.activities[0].action).toBe('created_task');
    });
  });

  // ─── 3. DELETE /users/me Validation ───────────────────────────────────────
  describe('DELETE /users/me validation', () => {
    it('returns 400 when email confirmation is missing', async () => {
      const res = await request(app)
        .delete('/users/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 when confirmation email does not match user account', async () => {
      const res = await request(app)
        .delete('/users/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ email: 'wrong-email@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Email confirmation does not match/i);
    });
  });

  // ─── 4. Account Soft Deletion & Anonymization ──────────────────────────────
  describe('DELETE /users/me execution', () => {
    it('successfully anonymizes user, unassigns tasks, and soft-deletes user', async () => {
      const res = await request(app)
        .delete('/users/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ email: 'usera-gdpr@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/Account successfully deleted/i);

      // Inspect DB state for User A
      const deletedUserInDb = await prisma.user.findUnique({ where: { id: userA.id } });
      expect(deletedUserInDb.name).toBe('Deleted User');
      expect(deletedUserInDb.email).toBe(`deleted-${userA.id}@anonymized.local`);
      expect(deletedUserInDb.isDeleted).toBe(true);
      expect(deletedUserInDb.deletedAt).not.toBeNull();

      // Confirm assigned tasks were unassigned
      const taskInDb = await prisma.task.findUnique({ where: { id: taskCreatedByA.id } });
      expect(taskInDb).not.toBeNull();
      expect(taskInDb.assigneeId).toBeNull();
      expect(taskInDb.createdById).toBe(userA.id); // FK preserved to anonymized user
    });
  });

  // ─── 5. Teammate View of Authored Content ──────────────────────────────────
  describe('Teammate visibility of anonymized content', () => {
    it('teammate sees authored tasks showing author name as "Deleted User"', async () => {
      const res = await request(app)
        .get('/tasks')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', team.id);

      expect(res.status).toBe(200);
      const tasks = res.body.tasks || res.body;
      const foundTask = tasks.find((t) => t.id === taskCreatedByA.id);

      expect(foundTask).toBeDefined();
      expect(foundTask.createdBy).toBeDefined();
      expect(foundTask.createdBy.name).toBe('Deleted User');
    });

    it('teammate sees comments showing author name as "Deleted User"', async () => {
      const res = await request(app)
        .get(`/tasks/${taskCreatedByA.id}/comments`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', team.id);

      expect(res.status).toBe(200);
      const comments = res.body.comments || res.body;
      const foundComment = comments.find((c) => c.id === commentByA.id);

      expect(foundComment).toBeDefined();
      expect(foundComment.author).toBeDefined();
      expect(foundComment.author.name).toBe('Deleted User');
    });
  });

  // ─── 6. Post-Deletion Login Prevention ─────────────────────────────────────
  describe('Login prevention for deleted accounts', () => {
    it('POST /auth/login fails for deleted account', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'usera-gdpr@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid email or password/i);
    });
  });
});

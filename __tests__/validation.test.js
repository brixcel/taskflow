/**
 * Validation & Sanitization Tests — Phase 3 Requirement
 *
 * Covers every mutating route with:
 *   - one valid payload   → expected success status
 *   - one invalid payload → 400 with field-level errors array
 *
 * Also verifies that HTML in user-supplied text fields is stripped before
 * storage (stored XSS prevention).
 *
 * Routes covered:
 *   POST /auth/register
 *   POST /auth/login
 *   POST /tasks
 *   PATCH /tasks/:id
 *   POST /tasks/:id/comments
 *   POST /teams
 *   POST /teams/join
 *   POST /teams/:id/members
 *   PATCH /teams/:id/members/:userId/role
 */

const request   = require('supertest');
const express   = require('express');
const bcrypt    = require('bcrypt');
const jwt       = require('jsonwebtoken');
const prisma    = require('../prisma');

const authRoutes     = require('../routes/auth');
const taskRoutes     = require('../routes/tasks');
const commentRoutes  = require('../routes/comments');
const teamRoutes     = require('../routes/teams');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth',                         authRoutes);
  app.use('/tasks',                        taskRoutes);
  app.use('/tasks/:taskId/comments',       commentRoutes);
  app.use('/teams',                        teamRoutes);
  return app;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let app;
let user, team, task;
let token;

async function makeUser(email, name) {
  const passwordHash = await bcrypt.hash('password123', 10);
  return prisma.user.create({ data: { email, passwordHash, name } });
}

function makeToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'test-secret');
}

beforeAll(async () => {
  app = createTestApp();

  // Wipe any leftover data from prior runs
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { startsWith: 'val-' } },
  });

  user  = await makeUser('val-owner@test.com', 'Val Owner');
  token = makeToken(user.id);

  team = await prisma.team.create({
    data: { name: 'Val Test Team', ownerId: user.id },
  });
  await prisma.teamMembership.create({
    data: { userId: user.id, teamId: team.id, role: 'owner' },
  });

  task = await prisma.task.create({
    data: { title: 'Existing task', teamId: team.id, createdById: user.id },
  });
});

afterAll(async () => {
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { startsWith: 'val-' } },
  });
  await prisma.$disconnect();
});

// ─── Helper: assert errors array has a field entry ───────────────────────────

function expectFieldError(body, field) {
  expect(Array.isArray(body.errors)).toBe(true);
  const found = body.errors.some((e) => e.field === field);
  expect(found).toBe(true);
}

// ─── POST /auth/register ──────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  afterEach(async () => {
    // Clean up any users/teams created during valid-payload tests.
    // Find the registered test users, delete their owned teams first (FK: teams.ownerId → users.id),
    // then delete the users themselves. Order: memberships → tasks → teams → users.
    const testUsers = await prisma.user.findMany({ where: { email: { startsWith: 'val-reg' } } });
    const testUserIds = testUsers.map((u) => u.id);
    if (testUserIds.length > 0) {
      const ownedTeams = await prisma.team.findMany({ where: { ownerId: { in: testUserIds } } });
      const ownedTeamIds = ownedTeams.map((t) => t.id);
      if (ownedTeamIds.length > 0) {
        await prisma.activity.deleteMany({ where: { task: { teamId: { in: ownedTeamIds } } } });
        await prisma.comment.deleteMany({ where: { task: { teamId: { in: ownedTeamIds } } } });
        await prisma.task.deleteMany({ where: { teamId: { in: ownedTeamIds } } });
        await prisma.teamMembership.deleteMany({ where: { teamId: { in: ownedTeamIds } } });
        await prisma.team.deleteMany({ where: { id: { in: ownedTeamIds } } });
      }
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    }
  });

  test('valid payload → 201 with token', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'val-reg-new@test.com', password: 'securepass1', name: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
  });

  test('missing email → 400 with field error', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ password: 'securepass1', name: 'No Email' });

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'email');
  });

  test('invalid email format → 400 with field error', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'securepass1', name: 'Bad Email' });

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'email');
  });

  test('password too short (< 8 chars) → 400 with field error', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'val-reg-short@test.com', password: 'abc', name: 'Short Pass' });

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'password');
  });

  test('missing name → 400 with field error', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'val-reg-noname@test.com', password: 'securepass1' });

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'name');
  });
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  test('valid credentials → 200 with token', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'val-owner@test.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  test('missing password → 400 with field error', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'val-owner@test.com' });

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'password');
  });

  test('invalid email format → 400 with field error', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'email');
  });
});

// ─── POST /tasks ──────────────────────────────────────────────────────────────

describe('POST /tasks', () => {
  test('valid payload → 201 with task', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id)
      .send({ title: 'A real task title' });

    expect(res.status).toBe(201);
    expect(res.body.task.title).toBe('A real task title');
  });

  test('missing title → 400 with field error', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id)
      .send({ description: 'No title here' });

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'title');
  });

  test('title exceeding 200 chars → 400 with field error', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id)
      .send({ title: 'x'.repeat(201) });

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'title');
  });

  test('invalid assigneeId (not a UUID) → 400 with field error', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id)
      .send({ title: 'Task', assigneeId: 'not-a-uuid' });

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'assigneeId');
  });

  test('XSS in title is stripped before storage', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id)
      .send({ title: '<script>alert(1)</script>My Task' });

    expect(res.status).toBe(201);
    // The script tag must be gone; the safe text content may remain
    expect(res.body.task.title).not.toContain('<script>');
    expect(res.body.task.title).not.toContain('</script>');
  });
});

// ─── PATCH /tasks/:id ────────────────────────────────────────────────────────

describe('PATCH /tasks/:id', () => {
  test('valid status update → 200', async () => {
    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('in_progress');
  });

  test('invalid status value → 400 with field error', async () => {
    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id)
      .send({ status: 'flying' });

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'status');
  });

  test('empty body (no fields) → 400', async () => {
    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id)
      .send({});

    expect(res.status).toBe(400);
  });

  test('XSS in description is stripped before storage', async () => {
    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id)
      .send({ description: '<img src=x onerror=alert(1)>safe text' });

    expect(res.status).toBe(200);
    expect(res.body.task.description).not.toContain('<img');
    expect(res.body.task.description).not.toContain('onerror');
  });
});

// ─── POST /tasks/:taskId/comments ────────────────────────────────────────────

describe('POST /tasks/:taskId/comments', () => {
  test('valid payload → 201 with comment', async () => {
    const res = await request(app)
      .post(`/tasks/${task.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id)
      .send({ content: 'A proper comment' });

    expect(res.status).toBe(201);
    expect(res.body.comment.content).toBe('A proper comment');
  });

  test('missing content → 400 with field error', async () => {
    const res = await request(app)
      .post(`/tasks/${task.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id)
      .send({});

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'content');
  });

  test('empty string content → 400 with field error', async () => {
    const res = await request(app)
      .post(`/tasks/${task.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id)
      .send({ content: '   ' });

    // zod .trim() reduces to '', then .min(1) rejects
    expect(res.status).toBe(400);
    expectFieldError(res.body, 'content');
  });

  test('content exceeding 2000 chars → 400 with field error', async () => {
    const res = await request(app)
      .post(`/tasks/${task.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id)
      .send({ content: 'x'.repeat(2001) });

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'content');
  });

  test('XSS in comment content is stripped before storage', async () => {
    const res = await request(app)
      .post(`/tasks/${task.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id)
      .send({ content: '<script>alert(1)</script>hello' });

    expect(res.status).toBe(201);
    expect(res.body.comment.content).not.toContain('<script>');
  });
});

// ─── POST /teams ──────────────────────────────────────────────────────────────

describe('POST /teams', () => {
  test('valid name → 201 with team', async () => {
    const res = await request(app)
      .post('/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'val-new-team' });

    expect(res.status).toBe(201);
    expect(res.body.team.name).toBe('val-new-team');

    // Cleanup
    await prisma.teamMembership.deleteMany({ where: { teamId: res.body.team.id } });
    await prisma.team.delete({ where: { id: res.body.team.id } });
  });

  test('missing name → 400 with field error', async () => {
    const res = await request(app)
      .post('/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'name');
  });

  test('name exceeding 100 chars → 400 with field error', async () => {
    const res = await request(app)
      .post('/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'x'.repeat(101) });

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'name');
  });
});

// ─── POST /teams/join ────────────────────────────────────────────────────────

describe('POST /teams/join', () => {
  test('valid teamName for existing team → 201', async () => {
    const res = await request(app)
      .post('/teams/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ teamName: 'Val Test Team' });

    // User is already a member (upsert) so this is idempotent → 201
    expect(res.status).toBe(201);
  });

  test('missing teamName → 400 with field error', async () => {
    const res = await request(app)
      .post('/teams/join')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'teamName');
  });
});

// ─── POST /teams/:id/members ─────────────────────────────────────────────────

describe('POST /teams/:id/members', () => {
  let memberUser;

  beforeAll(async () => {
    memberUser = await makeUser('val-member@test.com', 'Val Member');
  });

  afterAll(async () => {
    await prisma.teamMembership.deleteMany({ where: { userId: memberUser.id } });
    await prisma.user.delete({ where: { id: memberUser.id } });
  });

  test('valid userId → 201 membership', async () => {
    const res = await request(app)
      .post(`/teams/${team.id}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: memberUser.id, role: 'member' });

    expect(res.status).toBe(201);
    expect(res.body.membership.userId).toBe(memberUser.id);
  });

  test('missing userId → 400 with field error', async () => {
    const res = await request(app)
      .post(`/teams/${team.id}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'member' });

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'userId');
  });

  test('non-UUID userId → 400 with field error', async () => {
    const res = await request(app)
      .post(`/teams/${team.id}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 'not-a-uuid' });

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'userId');
  });

  test('invalid role value → 400 with field error', async () => {
    const res = await request(app)
      .post(`/teams/${team.id}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: memberUser.id, role: 'superuser' });

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'role');
  });
});

// ─── PATCH /teams/:id/members/:userId/role ───────────────────────────────────

describe('PATCH /teams/:id/members/:userId/role', () => {
  let targetUser;

  beforeAll(async () => {
    targetUser = await makeUser('val-target@test.com', 'Val Target');
    await prisma.teamMembership.create({
      data: { userId: targetUser.id, teamId: team.id, role: 'member' },
    });
  });

  afterAll(async () => {
    await prisma.teamMembership.deleteMany({ where: { userId: targetUser.id } });
    await prisma.user.delete({ where: { id: targetUser.id } });
  });

  test('valid role → 200 with updated membership', async () => {
    const res = await request(app)
      .patch(`/teams/${team.id}/members/${targetUser.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.membership.role).toBe('admin');
  });

  test('invalid role value → 400 with field error', async () => {
    const res = await request(app)
      .patch(`/teams/${team.id}/members/${targetUser.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'superuser' });

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'role');
  });

  test('missing role → 400 with field error', async () => {
    const res = await request(app)
      .patch(`/teams/${team.id}/members/${targetUser.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expectFieldError(res.body, 'role');
  });
});

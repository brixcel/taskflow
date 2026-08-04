/**
 * RBAC Tests — Phase 2 Requirement
 *
 * Verifies role-based permission enforcement for:
 *   1. Task deletion — creator OR admin/owner allowed; plain member cannot delete others' tasks
 *   2. Member removal — owner only; member and admin cannot remove members
 *   3. Role changes  — owner only; member and admin cannot change roles
 *
 * All forbidden actions return 403 (not 401 — the user IS authenticated).
 * The check happens before any query touches the resource.
 */

const request  = require('supertest');
const express  = require('express');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const prisma   = require('../prisma');

const taskRoutes    = require('../routes/tasks');
const teamRoutes    = require('../routes/teams');
const activityRoutes = require('../routes/activities');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/tasks', taskRoutes);
  app.use('/teams', teamRoutes);
  app.use('/tasks/:taskId/activities', activityRoutes);
  return app;
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

let app;
let team;

// Three users with different roles in the same team
let owner, admin, memberA, memberB;
let tokenOwner, tokenAdmin, tokenMemberA, tokenMemberB;

// Tasks owned by different users
let taskByOwner, taskByMemberA;

async function makeUser(email, name) {
  const passwordHash = await bcrypt.hash('password123', 10);
  return prisma.user.create({ data: { email, passwordHash, name } });
}

function makeToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'test-secret');
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  app = createTestApp();

  // Clean slate
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { in: [
      'rbac-owner@test.com',
      'rbac-admin@test.com',
      'rbac-memberA@test.com',
      'rbac-memberB@test.com',
    ] } },
  });

  // Create users
  owner   = await makeUser('rbac-owner@test.com',   'RBAC Owner');
  admin   = await makeUser('rbac-admin@test.com',   'RBAC Admin');
  memberA = await makeUser('rbac-memberA@test.com', 'RBAC Member A');
  memberB = await makeUser('rbac-memberB@test.com', 'RBAC Member B');

  tokenOwner   = makeToken(owner.id);
  tokenAdmin   = makeToken(admin.id);
  tokenMemberA = makeToken(memberA.id);
  tokenMemberB = makeToken(memberB.id);

  // Create a single shared team
  team = await prisma.team.create({
    data: { name: 'RBAC Test Team', ownerId: owner.id },
  });

  // Assign roles — upsert so re-runs after partial cleanup are safe
  await prisma.teamMembership.upsert({
    where:  { userId_teamId: { userId: owner.id,   teamId: team.id } },
    create: { userId: owner.id,   teamId: team.id, role: 'owner'  },
    update: { role: 'owner' },
  });
  await prisma.teamMembership.upsert({
    where:  { userId_teamId: { userId: admin.id,   teamId: team.id } },
    create: { userId: admin.id,   teamId: team.id, role: 'admin'  },
    update: { role: 'admin' },
  });
  await prisma.teamMembership.upsert({
    where:  { userId_teamId: { userId: memberA.id, teamId: team.id } },
    create: { userId: memberA.id, teamId: team.id, role: 'member' },
    update: { role: 'member' },
  });
  await prisma.teamMembership.upsert({
    where:  { userId_teamId: { userId: memberB.id, teamId: team.id } },
    create: { userId: memberB.id, teamId: team.id, role: 'member' },
    update: { role: 'member' },
  });

  // Create tasks
  taskByOwner = await prisma.task.create({
    data: { title: 'Owner task', teamId: team.id, createdById: owner.id },
  });

  taskByMemberA = await prisma.task.create({
    data: { title: 'MemberA task', teamId: team.id, createdById: memberA.id },
  });
});

afterAll(async () => {
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { in: [
      'rbac-owner@test.com',
      'rbac-admin@test.com',
      'rbac-memberA@test.com',
      'rbac-memberB@test.com',
    ] } },
  });
  await prisma.$disconnect();
});

// ─── 1. Task Deletion ─────────────────────────────────────────────────────────

describe('Task deletion permissions', () => {
  // Helper: recreate a deleted task so later tests still have a target
  async function ensureTask(task, createdById) {
    const exists = await prisma.task.findUnique({ where: { id: task.id } });
    if (!exists) {
      return prisma.task.create({
        data: { id: task.id, title: task.title, teamId: team.id, createdById },
      });
    }
    return exists;
  }

  test('Member B cannot delete Member A\'s task → 403', async () => {
    await ensureTask(taskByMemberA, memberA.id);

    const res = await request(app)
      .delete(`/tasks/${taskByMemberA.id}`)
      .set('Authorization', `Bearer ${tokenMemberB}`)
      .set('X-Team-Id', team.id);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/forbidden/i);

    // Task must still exist
    const still = await prisma.task.findUnique({ where: { id: taskByMemberA.id } });
    expect(still).not.toBeNull();
  });

  test('Member A can delete their own task → 204', async () => {
    // Create a fresh task so we don't consume the shared fixture
    const ownTask = await prisma.task.create({
      data: { title: 'MemberA own task', teamId: team.id, createdById: memberA.id },
    });

    const res = await request(app)
      .delete(`/tasks/${ownTask.id}`)
      .set('Authorization', `Bearer ${tokenMemberA}`)
      .set('X-Team-Id', team.id);

    expect(res.status).toBe(204);
  });

  test('Admin can delete another member\'s task → 204', async () => {
    const target = await prisma.task.create({
      data: { title: 'Task for admin to delete', teamId: team.id, createdById: memberA.id },
    });

    const res = await request(app)
      .delete(`/tasks/${target.id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .set('X-Team-Id', team.id);

    expect(res.status).toBe(204);
  });

  test('Owner can delete any task → 204', async () => {
    await ensureTask(taskByMemberA, memberA.id);

    const res = await request(app)
      .delete(`/tasks/${taskByMemberA.id}`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .set('X-Team-Id', team.id);

    expect(res.status).toBe(204);
  });
});

// ─── 2. Member Removal ────────────────────────────────────────────────────────

describe('Member removal permissions', () => {
  // A spare user we can safely remove in the success cases
  let spare;
  let tokenSpare;

  beforeAll(async () => {
    spare = await makeUser('rbac-spare@test.com', 'RBAC Spare');
    tokenSpare = makeToken(spare.id);
    await prisma.teamMembership.create({
      data: { userId: spare.id, teamId: team.id, role: 'member' },
    });
  });

  afterAll(async () => {
    await prisma.teamMembership.deleteMany({ where: { userId: spare.id } });
    await prisma.user.delete({ where: { id: spare.id } });
  });

  // Ensure spare is always in the team before tests that need them
  async function ensureSpareInTeam() {
    const existing = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: spare.id, teamId: team.id } },
    });
    if (!existing) {
      await prisma.teamMembership.create({
        data: { userId: spare.id, teamId: team.id, role: 'member' },
      });
    }
  }

  test('Member cannot remove another member → 403', async () => {
    await ensureSpareInTeam();

    const res = await request(app)
      .delete(`/teams/${team.id}/members/${spare.id}`)
      .set('Authorization', `Bearer ${tokenMemberA}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/forbidden/i);

    // Spare must still be in the team
    const still = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: spare.id, teamId: team.id } },
    });
    expect(still).not.toBeNull();
  });

  test('Admin cannot remove a member → 403', async () => {
    await ensureSpareInTeam();

    const res = await request(app)
      .delete(`/teams/${team.id}/members/${spare.id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(403);
  });

  test('Owner cannot remove themselves → 400', async () => {
    const res = await request(app)
      .delete(`/teams/${team.id}/members/${owner.id}`)
      .set('Authorization', `Bearer ${tokenOwner}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot remove themselves/i);
  });

  test('Owner can remove a member → 204', async () => {
    await ensureSpareInTeam();

    const res = await request(app)
      .delete(`/teams/${team.id}/members/${spare.id}`)
      .set('Authorization', `Bearer ${tokenOwner}`);

    expect(res.status).toBe(204);

    const gone = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: spare.id, teamId: team.id } },
    });
    expect(gone).toBeNull();
  });
});

// ─── 3. Role Changes ──────────────────────────────────────────────────────────

describe('Role change permissions', () => {
  test('Member cannot change another member\'s role → 403', async () => {
    const res = await request(app)
      .patch(`/teams/${team.id}/members/${admin.id}/role`)
      .set('Authorization', `Bearer ${tokenMemberA}`)
      .send({ role: 'member' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/forbidden/i);
  });

  test('Admin cannot change a member\'s role → 403', async () => {
    const res = await request(app)
      .patch(`/teams/${team.id}/members/${memberA.id}/role`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ role: 'admin' });

    expect(res.status).toBe(403);
  });

  test('Owner can promote a member to admin → 200', async () => {
    const res = await request(app)
      .patch(`/teams/${team.id}/members/${memberB.id}/role`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.membership.role).toBe('admin');

    // Restore
    await prisma.teamMembership.update({
      where: { userId_teamId: { userId: memberB.id, teamId: team.id } },
      data:  { role: 'member' },
    });
  });

  test('Owner can demote an admin to member → 200', async () => {
    // Temporarily promote memberA
    await prisma.teamMembership.update({
      where: { userId_teamId: { userId: memberA.id, teamId: team.id } },
      data:  { role: 'admin' },
    });

    const res = await request(app)
      .patch(`/teams/${team.id}/members/${memberA.id}/role`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ role: 'member' });

    expect(res.status).toBe(200);
    expect(res.body.membership.role).toBe('member');
  });

  test('Role change with invalid role value → 400', async () => {
    const res = await request(app)
      .patch(`/teams/${team.id}/members/${memberA.id}/role`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ role: 'superuser' });

    expect(res.status).toBe(400);
  });
});

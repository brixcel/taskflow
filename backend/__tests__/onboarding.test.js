/**
 * Onboarding and Zero-Team Route Guard Tests
 *
 * Verifies that:
 * 1. POST /auth/register creates user with 0 team memberships and no team in response.
 * 2. Authenticated user with 0 team memberships accessing /tasks is blocked with 404.
 * 3. POST /teams creates a new team, assigning owner role to user.
 * 4. POST /teams/join adds user to an existing team with member role.
 * 5. After team creation/joining, access to /tasks succeeds.
 */

const request  = require('supertest');
const express  = require('express');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const prisma   = require('../prisma');

const authRoutes  = require('../routes/auth');
const teamRoutes  = require('../routes/teams');
const taskRoutes  = require('../routes/tasks');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth',  authRoutes);
  app.use('/teams', teamRoutes);
  app.use('/tasks', taskRoutes);
  return app;
}

describe('Onboarding and Route Guard', () => {
  let app;
  let testUser;
  let userToken;
  let existingTeam;

  beforeAll(async () => {
    app = createTestApp();

    // Clean slate for test users
    await prisma.activity.deleteMany({});
    await prisma.comment.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.teamMembership.deleteMany({});
    await prisma.team.deleteMany({ where: { name: { in: ['Existing Team', 'New Onboarding Team'] } } });
    await prisma.user.deleteMany({
      where: { email: { in: ['onboarding-new@test.com', 'onboarding-owner@test.com'] } },
    });

    // Create an existing team for join tests
    const ownerHash = await bcrypt.hash('password123', 10);
    const teamOwner = await prisma.user.create({
      data: { email: 'onboarding-owner@test.com', passwordHash: ownerHash, name: 'Team Owner' },
    });

    existingTeam = await prisma.team.create({
      data: { name: 'Existing Team', ownerId: teamOwner.id },
    });

    await prisma.teamMembership.create({
      data: { userId: teamOwner.id, teamId: existingTeam.id, role: 'owner' },
    });
  });

  afterAll(async () => {
    await prisma.activity.deleteMany({});
    await prisma.comment.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.teamMembership.deleteMany({});
    await prisma.team.deleteMany({ where: { name: { in: ['Existing Team', 'New Onboarding Team'] } } });
    await prisma.user.deleteMany({
      where: { email: { in: ['onboarding-new@test.com', 'onboarding-owner@test.com'] } },
    });
  });

  it('POST /auth/register creates user without creating a default team', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        email: 'onboarding-new@test.com',
        password: 'password123',
        name: 'New User',
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('onboarding-new@test.com');
    expect(res.body.token).toBeDefined();
    expect(res.body.team).toBeUndefined();

    testUser = res.body.user;
    userToken = res.body.token;

    // Verify DB state: zero memberships
    const memberships = await prisma.teamMembership.findMany({
      where: { userId: testUser.id },
    });
    expect(memberships).toHaveLength(0);
  });

  it('GET /tasks blocks user with zero team memberships (returns 404 clear response)', async () => {
    const res = await request(app)
      .get('/tasks')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('You are not a member of any team. Create or join a team first.');
  });

  it('POST /teams allows user to explicitly create a new team', async () => {
    const res = await request(app)
      .post('/teams')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'New Onboarding Team' });

    expect(res.status).toBe(201);
    expect(res.body.team).toBeDefined();
    expect(res.body.team.name).toBe('New Onboarding Team');

    // Verify user is now an owner in DB
    const membership = await prisma.teamMembership.findUnique({
      where: {
        userId_teamId: { userId: testUser.id, teamId: res.body.team.id },
      },
    });
    expect(membership).toBeDefined();
    expect(membership.role).toBe('owner');
  });

  it('GET /tasks succeeds after user has created a team', async () => {
    const res = await request(app)
      .get('/tasks')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.tasks).toBeDefined();
    expect(Array.isArray(res.body.tasks)).toBe(true);
  });

  it('POST /teams/join allows user to join an existing team', async () => {
    // Register another user
    const regRes = await request(app)
      .post('/auth/register')
      .send({
        email: 'onboarding-joiner@test.com',
        password: 'password123',
        name: 'Joiner User',
      });

    const joinerToken = regRes.body.token;
    const joinerUser = regRes.body.user;

    // Join existing team
    const joinRes = await request(app)
      .post('/teams/join')
      .set('Authorization', `Bearer ${joinerToken}`)
      .send({ teamName: 'Existing Team' });

    expect(joinRes.status).toBe(201);
    expect(joinRes.body.team.id).toBe(existingTeam.id);
    expect(joinRes.body.membership.role).toBe('member');

    // GET /tasks for joiner now succeeds
    const taskRes = await request(app)
      .get('/tasks')
      .set('Authorization', `Bearer ${joinerToken}`);

    expect(taskRes.status).toBe(200);

    // Clean up joiner user
    await prisma.teamMembership.deleteMany({ where: { userId: joinerUser.id } });
    await prisma.user.delete({ where: { id: joinerUser.id } });
  });
});

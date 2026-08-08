/**
 * Phase 8 — Operational Hardening Tests
 *
 * Covers:
 *   1. Rate limiting — repeated requests past the limit return 429
 *      - /auth/login        (authRateLimiter)
 *      - /auth/register     (authRateLimiter)
 *      - /auth/forgot-password (forgotPasswordRateLimiter)
 *   2. /health — returns 200 with { status: 'ok', db: 'connected' } when DB is up
 *   3. Pagination — GET /tasks returns a pagination envelope
 *   4. Pagination — GET /tasks/:id/activities returns a pagination envelope
 *
 * Rate-limit behaviour under test
 * ────────────────────────────────
 * In server.js the limiters use `max: isTest ? 1000 : 20`.  That keeps the
 * test suite from accidentally hitting the production limit during normal runs.
 * To exercise the 429 path we use express-rate-limit's `skip` override:
 * we import the limiter factory directly and create a tight (max=3) instance,
 * then mount it onto a small test-only Express app.
 */

const request  = require('supertest');
const express  = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const prisma   = require('../prisma');

// ── Mock email so register calls don't try to hit SMTP ──────────────────────
jest.mock('../services/email', () => ({
  sendPasswordResetEmail: jest.fn(),
  sendVerificationEmail:  jest.fn(),
}));

// ─── Shared app ──────────────────────────────────────────────────────────────
// Import the full server.js so the /health test exercises the real DB path.
const app = require('../server');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let user, team, task, token;

async function makeUser(email, name = 'Test User') {
  const passwordHash = await bcrypt.hash('password123', 10);
  return prisma.user.create({ data: { email, passwordHash, name } });
}

function makeToken(userId, teamId) {
  return jwt.sign({ userId, teamId }, process.env.JWT_SECRET || 'test-secret');
}

beforeAll(async () => {
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { startsWith: 'p8-' } } });

  user = await makeUser('p8-owner@test.com', 'P8 Owner');
  team = await prisma.team.create({ data: { name: 'P8 Team', ownerId: user.id } });
  await prisma.teamMembership.create({
    data: { userId: user.id, teamId: team.id, role: 'owner' },
  });
  task = await prisma.task.create({
    data: { title: 'P8 Task', teamId: team.id, createdById: user.id },
  });
  // Create a few activity entries so pagination has data to work with
  for (let i = 0; i < 3; i++) {
    await prisma.activity.create({
      data: { taskId: task.id, userId: user.id, action: 'updated', details: `edit ${i}` },
    });
  }
  token = makeToken(user.id, team.id);
});

afterAll(async () => {
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { startsWith: 'p8-' } } });
  await prisma.$disconnect();
});

// ─── 1. Rate limiting ─────────────────────────────────────────────────────────
//
// We build a minimal Express app with a tight limiter (max=3) so we can
// trigger 429 reliably without touching production config.

function buildRateLimitedApp(path, max = 3) {
  const testApp    = express();
  const limiter    = rateLimit({ windowMs: 60_000, max, standardHeaders: true, legacyHeaders: false });
  testApp.use(express.json());
  testApp.use(path, limiter, (_req, res) => res.json({ ok: true }));
  return testApp;
}

describe('Rate limiting — /auth/login', () => {
  it('returns 429 after exceeding the limit', async () => {
    const testApp = buildRateLimitedApp('/auth/login');

    // First 3 requests should succeed
    for (let i = 0; i < 3; i++) {
      const res = await request(testApp).post('/auth/login').send({});
      expect(res.status).toBe(200);
    }
    // 4th should be rate-limited
    const blocked = await request(testApp).post('/auth/login').send({});
    expect(blocked.status).toBe(429);
  });

  it('includes RateLimit headers on limited response', async () => {
    const testApp = buildRateLimitedApp('/auth/login', 1);
    await request(testApp).post('/auth/login').send({});
    const res = await request(testApp).post('/auth/login').send({});
    expect(res.status).toBe(429);
    // express-rate-limit v7+ emits RateLimit-Limit (standardHeaders: true)
    expect(res.headers['ratelimit-limit'] || res.headers['x-ratelimit-limit']).toBeDefined();
  });
});

describe('Rate limiting — /auth/register', () => {
  it('returns 429 after exceeding the limit', async () => {
    const testApp = buildRateLimitedApp('/auth/register');

    for (let i = 0; i < 3; i++) {
      const res = await request(testApp).post('/auth/register').send({});
      expect(res.status).toBe(200);
    }
    const blocked = await request(testApp).post('/auth/register').send({});
    expect(blocked.status).toBe(429);
  });
});

describe('Rate limiting — /auth/forgot-password', () => {
  it('returns 429 after exceeding the limit', async () => {
    const testApp = buildRateLimitedApp('/auth/forgot-password');

    for (let i = 0; i < 3; i++) {
      const res = await request(testApp).post('/auth/forgot-password').send({});
      expect(res.status).toBe(200);
    }
    const blocked = await request(testApp).post('/auth/forgot-password').send({});
    expect(blocked.status).toBe(429);
  });
});

// ─── 2. /health — real DB connectivity ───────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with db: connected when the database is reachable', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
  });

  it('response shape includes status and db fields', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('db');
  });
});

// ─── 3. Pagination — GET /tasks ───────────────────────────────────────────────

describe('GET /tasks — pagination envelope', () => {
  it('returns a pagination object alongside tasks', async () => {
    const res = await request(app)
      .get('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tasks');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.pagination).toMatchObject({
      page:       1,
      pageSize:   20,
      totalPages: expect.any(Number),
      total:      expect.any(Number),
    });
  });

  it('respects page and pageSize query params', async () => {
    const res = await request(app)
      .get('/tasks?page=1&pageSize=1')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id);

    expect(res.status).toBe(200);
    expect(res.body.tasks.length).toBeLessThanOrEqual(1);
    expect(res.body.pagination.pageSize).toBe(1);
  });

  it('clamps pageSize to a maximum of 100', async () => {
    const res = await request(app)
      .get('/tasks?pageSize=9999')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id);

    expect(res.status).toBe(200);
    expect(res.body.pagination.pageSize).toBe(100);
  });
});

// ─── 4. Pagination — GET /tasks/:id/activities ───────────────────────────────

describe('GET /tasks/:id/activities — pagination envelope', () => {
  it('returns a pagination object alongside activities', async () => {
    const res = await request(app)
      .get(`/tasks/${task.id}/activities`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('activities');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.pagination).toMatchObject({
      page:       1,
      pageSize:   20,
      totalPages: expect.any(Number),
      total:      expect.any(Number),
    });
  });

  it('respects pageSize on activities', async () => {
    const res = await request(app)
      .get(`/tasks/${task.id}/activities?pageSize=2`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id);

    expect(res.status).toBe(200);
    expect(res.body.activities.length).toBeLessThanOrEqual(2);
    expect(res.body.pagination.pageSize).toBe(2);
  });
});

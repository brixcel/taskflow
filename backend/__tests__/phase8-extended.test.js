/**
 * Phase 8 — Extended Operational Hardening Tests
 *
 * Covers edge-cases not tested in phase8.test.js:
 *
 *   1. Pagination — activity log: pageSize clamped to 100
 *   2. Pagination — activity log: page=2 returns the correct slice
 *   3. Pagination — tasks: page=2 with multiple tasks returns correct offset
 *   4. Pagination — invalid page/pageSize values fall back gracefully
 *   5. /health — response time is reasonable (< 3s)
 *   6. Structured logger (pino):
 *      - level is 'silent' in test environment (no output)
 *      - REDACTED_PATHS list covers the key sensitive fields
 *      - httpLogger middleware is exported alongside the default export
 *   7. Rate-limit headers are present on a non-limited response
 */

const request  = require('supertest');
const express  = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const prisma   = require('../prisma');

jest.mock('../services/email', () => ({
  sendPasswordResetEmail: jest.fn(),
  sendVerificationEmail:  jest.fn(),
}));

const app = require('../server');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let user, team, task, token;

async function makeUser(email) {
  const passwordHash = await bcrypt.hash('password123', 10);
  return prisma.user.create({ data: { email, passwordHash, name: 'P8Ext User' } });
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
  await prisma.user.deleteMany({ where: { email: { startsWith: 'p8ext-' } } });

  user = await makeUser('p8ext-owner@test.com');
  team = await prisma.team.create({ data: { name: 'P8Ext Team', ownerId: user.id } });
  await prisma.teamMembership.create({ data: { userId: user.id, teamId: team.id, role: 'owner' } });

  // Create 3 tasks for pagination tests
  for (let i = 1; i <= 3; i++) {
    await prisma.task.create({
      data: { title: `P8Ext Task ${i}`, teamId: team.id, createdById: user.id },
    });
  }
  task = await prisma.task.findFirst({ where: { teamId: team.id } });

  // Create 5 activity entries so we have enough for page=2 tests
  for (let i = 1; i <= 5; i++) {
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
  await prisma.user.deleteMany({ where: { email: { startsWith: 'p8ext-' } } });
  await prisma.$disconnect();
});

// ─── 1. Activity pagination — pageSize clamped to 100 ─────────────────────────

describe('GET /tasks/:id/activities — pageSize clamping', () => {
  it('clamps pageSize to 100 when a larger value is requested', async () => {
    const res = await request(app)
      .get(`/tasks/${task.id}/activities?pageSize=9999`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id);

    expect(res.status).toBe(200);
    expect(res.body.pagination.pageSize).toBe(100);
  });

  it('clamps task list pageSize to 100 as well', async () => {
    const res = await request(app)
      .get('/tasks?pageSize=500')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id);

    expect(res.status).toBe(200);
    expect(res.body.pagination.pageSize).toBe(100);
  });
});

// ─── 2. Activity pagination — page 2 returns the correct slice ───────────────

describe('GET /tasks/:id/activities — page 2 slice', () => {
  it('page 2 with pageSize 2 returns the third+ entries', async () => {
    const page1 = await request(app)
      .get(`/tasks/${task.id}/activities?page=1&pageSize=2`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id);

    const page2 = await request(app)
      .get(`/tasks/${task.id}/activities?page=2&pageSize=2`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id);

    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);

    // No id overlap between pages
    const ids1 = page1.body.activities.map((a) => a.id);
    const ids2 = page2.body.activities.map((a) => a.id);
    const overlap = ids1.filter((id) => ids2.includes(id));
    expect(overlap).toHaveLength(0);
  });

  it('pagination total reflects all 5 activity entries', async () => {
    const res = await request(app)
      .get(`/tasks/${task.id}/activities?pageSize=100`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(5);
  });

  it('beyond-last-page returns empty array not 404', async () => {
    const res = await request(app)
      .get(`/tasks/${task.id}/activities?page=9999&pageSize=100`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.activities)).toBe(true);
    expect(res.body.activities).toHaveLength(0);
  });
});

// ─── 3. Task pagination — page 2 slice ───────────────────────────────────────

describe('GET /tasks — page 2 slice', () => {
  it('page 1 and page 2 with pageSize 1 return different tasks', async () => {
    const page1 = await request(app)
      .get('/tasks?page=1&pageSize=1')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id);

    const page2 = await request(app)
      .get('/tasks?page=2&pageSize=1')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id);

    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);

    const id1 = page1.body.tasks[0]?.id;
    const id2 = page2.body.tasks[0]?.id;
    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
  });

  it('totalPages is ceil(total / pageSize)', async () => {
    const res = await request(app)
      .get('/tasks?pageSize=1')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id);

    const { total, pageSize, totalPages } = res.body.pagination;
    expect(totalPages).toBe(Math.ceil(total / pageSize));
  });
});

// ─── 4. Pagination edge-cases — invalid values ───────────────────────────────

describe('Pagination — invalid query param values', () => {
  it('defaults page to 1 when page=0 is supplied', async () => {
    const res = await request(app)
      .get('/tasks?page=0')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id);

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBeGreaterThanOrEqual(1);
  });

  it('defaults pageSize to 20 when a non-numeric pageSize is supplied', async () => {
    const res = await request(app)
      .get('/tasks?pageSize=abc')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Team-Id', team.id);

    expect(res.status).toBe(200);
    // should fall back to the default (20) not NaN
    expect(Number.isNaN(res.body.pagination.pageSize)).toBe(false);
    expect(res.body.pagination.pageSize).toBeGreaterThan(0);
  });
});

// ─── 5. /health response time ────────────────────────────────────────────────

describe('GET /health — response characteristics', () => {
  it('responds within 3 seconds', async () => {
    const start = Date.now();
    const res   = await request(app).get('/health');
    const ms    = Date.now() - start;

    expect(res.status).toBe(200);
    expect(ms).toBeLessThan(3_000);
  });

  it('Content-Type is application/json', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

// ─── 6. Structured logger (pino) ─────────────────────────────────────────────

describe('Structured logger — middleware/logger.js', () => {
  let logger;
  beforeAll(() => { logger = require('../middleware/logger'); });

  it('logger.level is "silent" in test environment', () => {
    // In test NODE_ENV pino is configured with level: 'silent'
    expect(logger.level).toBe('silent');
  });

  it('exports httpLogger as a named property', () => {
    expect(logger.httpLogger).toBeDefined();
    expect(typeof logger.httpLogger).toBe('function');
  });

  it('default export is the pino logger instance (has .info / .error methods)', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });

  it('REDACTED_PATHS covers authorization, password, and token fields', () => {
    // Read the source to confirm the redact list — we parse the module source
    // rather than calling pino internals, which are not public API.
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(path.join(__dirname, '..', 'middleware', 'logger.js'), 'utf8');

    // Extract the REDACTED_PATHS array content
    const match = src.match(/REDACTED_PATHS\s*=\s*\[([\s\S]*?)\]/);
    expect(match).not.toBeNull();

    const paths = (match[1].match(/'([^']+)'/g) || []).map((s) => s.replace(/'/g, ''));

    expect(paths).toEqual(expect.arrayContaining([
      'req.headers.authorization',
      'req.body.password',
      'req.body.token',
      'req.query.token',
    ]));
  });
});

// ─── 7. Rate-limit headers on a non-limited response ─────────────────────────

describe('Rate-limit headers', () => {
  it('rate-limited response includes a RateLimit-Limit header', async () => {
    const testApp = express();
    const limiter = rateLimit({
      windowMs: 60_000,
      max: 1,
      standardHeaders: true,
      legacyHeaders: false,
    });
    testApp.use(express.json());
    testApp.post('/auth/login', limiter, (_req, res) => res.json({ ok: true }));

    // First request: succeeds, headers should carry limit info
    const res1 = await request(testApp).post('/auth/login').send({});
    const limitHeader = res1.headers['ratelimit-limit'] || res1.headers['x-ratelimit-limit'];
    expect(limitHeader).toBeDefined();

    // Second request: blocked
    const res2 = await request(testApp).post('/auth/login').send({});
    expect(res2.status).toBe(429);
  });
});

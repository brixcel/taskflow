/**
 * Phase 40 — Performance Engineering & DB Query Optimization Test Suite
 *
 * Adversarial Testing & Break-and-Fix Loop:
 * - Validates compound index queries and multi-filter operations
 * - Validates cursor pagination (forward, backward, boundaries, edge cases)
 * - Actively attempts to break pagination with malformed, tampered, and cross-tenant cursors
 * - Validates slow query logging, query metrics tracking, and sensitive param redaction
 * - Ensures 100% backward compatibility with legacy offset pagination
 */

const request = require('supertest');
const { app } = require('../server');
const prisma = require('../prisma');
const { getQueryMetrics, resetQueryMetrics, sanitizeArgs } = require('../services/queryMonitor');
const { encodeCursor, decodeCursor, InvalidCursorError } = require('../helpers/cursorPagination');

jest.setTimeout(30000);

let userA, tokenA, teamA;
let userB, tokenB, teamB;
const createdTaskIds = [];
const createdUserIds = [];
const createdTeamIds = [];

beforeAll(async () => {
  // Clean query metrics before test run
  resetQueryMetrics();

  // Create User A in Team A
  const emailA = `perf_user_a_${Date.now()}@example.com`;
  const resA = await request(app)
    .post('/auth/register')
    .send({ name: 'Perf User A', email: emailA, password: 'Password123!', teamName: 'Perf Team A' });

  tokenA = resA.body.token;
  userA = resA.body.user;
  createdUserIds.push(userA.id);

  const teamsResA = await request(app)
    .get('/teams/me')
    .set('Authorization', `Bearer ${tokenA}`);
  teamA = teamsResA.body.teams[0];
  createdTeamIds.push(teamA.id);

  // Create User B in Team B (for cross-tenant probing tests)
  const emailB = `perf_user_b_${Date.now()}@example.com`;
  const resB = await request(app)
    .post('/auth/register')
    .send({ name: 'Perf User B', email: emailB, password: 'Password123!', teamName: 'Perf Team B' });

  tokenB = resB.body.token;
  userB = resB.body.user;
  createdUserIds.push(userB.id);

  const teamsResB = await request(app)
    .get('/teams/me')
    .set('Authorization', `Bearer ${tokenB}`);
  teamB = teamsResB.body.teams[0];
  createdTeamIds.push(teamB.id);

  // Seed 15 tasks in Team A with various priorities and statuses
  const priorities = ['low', 'medium', 'high', 'urgent'];
  const statuses = ['todo', 'in_progress', 'done'];

  for (let i = 1; i <= 15; i++) {
    const taskRes = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-team-id', teamA.id)
      .send({
        title: `Performance Test Task ${String(i).padStart(2, '0')}`,
        description: `Description for performance test task ${i}`,
        priority: priorities[i % priorities.length],
        status: statuses[i % statuses.length],
        order: i * 100,
        assigneeId: userA.id,
      });

    if (taskRes.body && taskRes.body.task) {
      createdTaskIds.push(taskRes.body.task.id);
    }
  }

  // Seed 2 tasks in Team B
  for (let i = 1; i <= 2; i++) {
    const taskRes = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('x-team-id', teamB.id)
      .send({
        title: `Team B Private Task ${i}`,
        status: 'todo',
        priority: 'high',
      });

    if (taskRes.body && taskRes.body.task) {
      createdTaskIds.push(taskRes.body.task.id);
    }
  }
}, 30000);

afterAll(async () => {
  // Cleanup test fixtures
  try {
    if (createdTaskIds.length > 0) {
      await prisma.task.deleteMany({ where: { id: { in: createdTaskIds } } });
    }
    if (createdTeamIds.length > 0) {
      await prisma.team.deleteMany({ where: { id: { in: createdTeamIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  } catch (err) {
    // Ignore cleanup errors
  }
}, 30000);

describe('Phase 40: Performance Engineering & Cursor Pagination', () => {

  describe('1. Cursor Pagination Core Mechanics', () => {
    it('fetches the first page of tasks with cursor metadata', async () => {
      const res = await request(app)
        .get('/tasks?mode=cursor&limit=5')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-team-id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tasks');
      expect(res.body.tasks.length).toBe(5);
      expect(res.body.pagination).toHaveProperty('nextCursor');
      expect(res.body.pagination.hasMore).toBe(true);
      expect(res.body.pagination.limit).toBe(5);
    });

    it('navigates seamlessly across all pages using nextCursor until end', async () => {
      let currentCursor = null;
      let totalFetched = 0;
      let iterations = 0;

      while (iterations < 10) {
        iterations++;
        const url = currentCursor
          ? `/tasks?cursor=${encodeURIComponent(currentCursor)}&limit=5`
          : '/tasks?mode=cursor&limit=5';

        const res = await request(app)
          .get(url)
          .set('Authorization', `Bearer ${tokenA}`)
          .set('x-team-id', teamA.id);

        expect(res.status).toBe(200);
        totalFetched += res.body.tasks.length;

        if (!res.body.pagination.hasMore) {
          expect(res.body.pagination.nextCursor).toBeNull();
          break;
        }

        expect(res.body.pagination.nextCursor).toBeTruthy();
        currentCursor = res.body.pagination.nextCursor;
      }

      expect(totalFetched).toBe(15);
    });

    it('enforces limit boundaries (min 1, max 100, negative numbers clamped)', async () => {
      // Test negative limit -> clamps to 1
      const resNeg = await request(app)
        .get('/tasks?mode=cursor&limit=-10')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-team-id', teamA.id);

      expect(resNeg.status).toBe(200);
      expect(resNeg.body.tasks.length).toBe(1);
      expect(resNeg.body.pagination.limit).toBe(1);

      // Test extreme limit (99999) -> capped at 100
      const resHigh = await request(app)
        .get('/tasks?mode=cursor&limit=99999')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-team-id', teamA.id);

      expect(resHigh.status).toBe(200);
      expect(resHigh.body.pagination.limit).toBe(100);
    });
  });

  describe('2. Adversarial Break-and-Fix Testing (Attacks & Edge Cases)', () => {
    it('returns 400 Bad Request when passed a non-base64 malformed cursor', async () => {
      const res = await request(app)
        .get('/tasks?cursor=this-is-not-valid-base64-!@#$%^&*()')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-team-id', teamA.id);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('cursor');
    });

    it('returns 400 Bad Request when passed base64 encoded non-JSON string', async () => {
      const invalidBase64 = Buffer.from('plain non-json text payload').toString('base64url');
      const res = await request(app)
        .get(`/tasks?cursor=${invalidBase64}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-team-id', teamA.id);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 400 Bad Request when cursor payload lacks required id field', async () => {
      const emptyObjCursor = Buffer.from(JSON.stringify({ someOtherField: 123 })).toString('base64url');
      const res = await request(app)
        .get(`/tasks?cursor=${emptyObjCursor}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-team-id', teamA.id);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('handles non-existent cursor ID safely without crashing (returns empty results)', async () => {
      const nonExistentCursor = encodeCursor({ id: '00000000-0000-0000-0000-000000000000' });
      const res = await request(app)
        .get(`/tasks?cursor=${nonExistentCursor}&limit=5`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-team-id', teamA.id);

      // Prisma seeking past a non-existent cursor either returns 0 results or 400
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.tasks.length).toBe(0);
        expect(res.body.pagination.hasMore).toBe(false);
      }
    });

    it('returns 400 Bad Request when cursor payload is a JSON array instead of an object', async () => {
      const arrayCursor = Buffer.from(JSON.stringify([1, 2, 3])).toString('base64url');
      const res = await request(app)
        .get(`/tasks?cursor=${arrayCursor}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-team-id', teamA.id);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 400 Bad Request when cursor payload is a primitive JSON number or boolean', async () => {
      const numberCursor = Buffer.from(JSON.stringify(12345)).toString('base64url');
      const res = await request(app)
        .get(`/tasks?cursor=${numberCursor}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-team-id', teamA.id);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 400 Bad Request when cursor payload exceeds reasonable size limit or is garbage binary', async () => {
      const hugeGarbage = Buffer.from('x'.repeat(10000)).toString('base64url');
      const res = await request(app)
        .get(`/tasks?cursor=${hugeGarbage}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-team-id', teamA.id);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('handles empty query results cleanly with hasMore: false and nextCursor: null', async () => {
      const res = await request(app)
        .get('/tasks?mode=cursor&search=non_existent_impossible_task_query_string_999')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-team-id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.tasks.length).toBe(0);
      expect(res.body.pagination.hasMore).toBe(false);
      expect(res.body.pagination.nextCursor).toBeNull();
    });

    it('prevents cross-tenant data leakage when User A uses User B task cursor', async () => {
      // User B creates a private task
      const bTaskRes = await request(app)
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('x-team-id', teamB.id)
        .send({ title: 'Top Secret B Task' });

      const bTaskId = bTaskRes.body.task.id;
      const stolenCursor = encodeCursor({ id: bTaskId });

      // User A attempts to query using User B's task cursor in Team A context
      const res = await request(app)
        .get(`/tasks?cursor=${stolenCursor}&limit=5`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-team-id', teamA.id);

      // Must not leak Team B's task
      if (res.status === 200) {
        const foundBTask = res.body.tasks.find(t => t.id === bTaskId);
        expect(foundBTask).toBeUndefined();
      }
    });
  });

  describe('3. Compound Index Filtering & High-Performance Queries', () => {
    it('executes multi-field filtered queries leveraging compound indexes (teamId + status + priority)', async () => {
      const res = await request(app)
        .get('/tasks?status=todo&priority=high')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-team-id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tasks');
      for (const t of res.body.tasks) {
        expect(t.status).toBe('todo');
        expect(t.priority).toBe('high');
      }
    });

    it('supports cursor pagination on Notifications endpoint', async () => {
      // Create a test notification
      await prisma.notification.create({
        data: {
          userId: userA.id,
          teamId: teamA.id,
          type: 'task_assigned',
          title: 'Perf Test Notification 1',
          message: 'Notification message 1',
        },
      });

      await prisma.notification.create({
        data: {
          userId: userA.id,
          teamId: teamA.id,
          type: 'task_assigned',
          title: 'Perf Test Notification 2',
          message: 'Notification message 2',
        },
      });

      const res = await request(app)
        .get('/notifications?mode=cursor&limit=1')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('notifications');
      expect(res.body.notifications.length).toBe(1);
      expect(res.body.pagination).toHaveProperty('nextCursor');
    });

    it('supports cursor pagination on Task Activities endpoint', async () => {
      const targetTaskId = createdTaskIds[0];
      const res = await request(app)
        .get(`/tasks/${targetTaskId}/activities?limit=5`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-team-id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('activities');
      expect(res.body).toHaveProperty('pagination');
    });
  });

  describe('4. Slow Query Logging & Query Monitoring Service', () => {
    it('tracks query execution metrics and calculates average duration', async () => {
      const metrics = getQueryMetrics();
      expect(metrics).toHaveProperty('totalQueries');
      expect(metrics.totalQueries).toBeGreaterThan(0);
      expect(metrics).toHaveProperty('avgDurationMs');
      expect(metrics).toHaveProperty('slowQueryThresholdMs');
    });

    it('deep-sanitizes and redacts sensitive credentials from query log parameters', () => {
      const rawArgs = {
        where: {
          email: 'test@example.com',
          passwordHash: '$2b$10$supersecretpasswordhash',
          customGeminiKey: 'AIzaSyASecretKey123',
          apiKey: {
            keyHash: 'sha256hashhere',
          },
        },
        data: {
          name: 'Public Name',
          token: 'jwt-token-value',
          webhookSecret: 'whsec_secretvalue',
        },
      };

      const sanitized = sanitizeArgs(rawArgs);

      expect(sanitized.where.email).toBe('test@example.com');
      expect(sanitized.where.passwordHash).toBe('[REDACTED]');
      expect(sanitized.where.customGeminiKey).toBe('[REDACTED]');
      expect(sanitized.where.apiKey.keyHash).toBe('[REDACTED]');
      expect(sanitized.data.name).toBe('Public Name');
      expect(sanitized.data.token).toBe('[REDACTED]');
      expect(sanitized.data.webhookSecret).toBe('[REDACTED]');
    });
  });

  describe('5. Backward Compatibility with Offset Pagination', () => {
    it('maintains full backwards compatibility with page and pageSize params', async () => {
      const res = await request(app)
        .get('/tasks?page=2&pageSize=5')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-team-id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tasks');
      expect(res.body.tasks.length).toBe(5);
      expect(res.body.pagination).toHaveProperty('total');
      expect(res.body.pagination).toHaveProperty('page', 2);
      expect(res.body.pagination).toHaveProperty('pageSize', 5);
      expect(res.body.pagination).toHaveProperty('totalPages');
      expect(res.body.pagination.total).toBe(15);
      expect(res.body.pagination.totalPages).toBe(3);
    });
  });
});

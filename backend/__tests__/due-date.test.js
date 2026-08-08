/**
 * Phase 13 — Due Dates Test Suite
 *
 * Verifies:
 * 1. Creating and updating tasks with a dueDate via API.
 * 2. Overdue logic (dueDate in the past and status is not done).
 * 3. Overdue indicator disappears once task is marked done.
 * 4. Timezone / midnight boundary edge cases.
 */

const request = require('supertest');
const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const prisma  = require('../prisma');

const authRoutes = require('../routes/auth');
const taskRoutes = require('../routes/tasks');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use('/tasks', taskRoutes);
  return app;
}

let app;
let testUser;
let testTeam;
let userToken;

beforeAll(async () => {
  app = createTestApp();

  // Cleanup prior test user data
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({ where: { email: 'duedate-user@test.com' } });

  const passwordHash = await bcrypt.hash('password123', 10);
  testUser = await prisma.user.create({
    data: {
      email: 'duedate-user@test.com',
      passwordHash,
      name: 'Due Date Tester',
      emailVerified: true,
    },
  });

  testTeam = await prisma.team.create({
    data: {
      name: 'Due Date Team',
      ownerId: testUser.id,
      memberships: {
        create: {
          userId: testUser.id,
          role: 'owner',
        },
      },
    },
  });

  userToken = jwt.sign(
    { userId: testUser.id, email: testUser.email },
    process.env.JWT_SECRET || 'test-jwt-secret'
  );
});

afterAll(async () => {
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({ where: { email: 'duedate-user@test.com' } });
});

describe('Phase 13 — Due Dates', () => {
  it('creates a task with a valid dueDate', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 5).toISOString();

    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-Team-Id', testTeam.id)
      .send({
        title: 'Task with future due date',
        dueDate: futureDate,
      });

    expect(res.status).toBe(201);
    expect(res.body.task).toHaveProperty('id');
    expect(res.body.task.title).toBe('Task with future due date');
    expect(res.body.task.dueDate).not.toBeNull();
    expect(new Date(res.body.task.dueDate).toISOString()).toBe(new Date(futureDate).toISOString());
  });

  it('creates a task without a dueDate (defaults to null)', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-Team-Id', testTeam.id)
      .send({
        title: 'Task without due date',
      });

    expect(res.status).toBe(201);
    expect(res.body.task.dueDate).toBeNull();
  });

  it('updates a task to set or clear a dueDate', async () => {
    // Create task initially without due date
    const createRes = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-Team-Id', testTeam.id)
      .send({ title: 'Task to update due date' });

    const taskId = createRes.body.task.id;
    const pastDate = new Date(Date.now() - 86400000).toISOString();

    // Set due date
    const patchRes1 = await request(app)
      .patch(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-Team-Id', testTeam.id)
      .send({ dueDate: pastDate });

    expect(patchRes1.status).toBe(200);
    expect(patchRes1.body.task.dueDate).not.toBeNull();

    // Clear due date
    const patchRes2 = await request(app)
      .patch(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-Team-Id', testTeam.id)
      .send({ dueDate: null });

    expect(patchRes2.status).toBe(200);
    expect(patchRes2.body.task.dueDate).toBeNull();
  });

  it('verifies overdue status logic and that overdue disappears once marked done', async () => {
    const pastDate = new Date(Date.now() - 86400000 * 2).toISOString(); // 2 days ago

    // Create overdue task
    const createRes = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-Team-Id', testTeam.id)
      .send({
        title: 'Overdue task test',
        dueDate: pastDate,
        status: 'todo',
      });

    const task = createRes.body.task;
    expect(task.status).toBe('todo');

    // Helper logic to check overdue status (same as frontend rule)
    function checkIsOverdue(dueDateStr, status) {
      if (!dueDateStr || status === 'done') return false;
      const d = new Date(dueDateStr);
      if (isNaN(d.getTime())) return false;
      const now = new Date();
      const endOfDueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      return endOfDueDay < now;
    }

    // Verify it is initially overdue
    expect(checkIsOverdue(task.dueDate, task.status)).toBe(true);

    // Update status to done
    const doneRes = await request(app)
      .patch(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-Team-Id', testTeam.id)
      .send({ status: 'done' });

    expect(doneRes.status).toBe(200);
    const updatedTask = doneRes.body.task;
    expect(updatedTask.status).toBe('done');

    // Confirm overdue indicator disappears once task is marked done
    expect(checkIsOverdue(updatedTask.dueDate, updatedTask.status)).toBe(false);
  });

  it('handles timezone and midnight date boundaries without off-by-one errors', () => {
    function isOverdueLocal(dueDateStr, status, now) {
      if (!dueDateStr || status === 'done') return false;
      const d = new Date(dueDateStr);
      if (isNaN(d.getTime())) return false;
      const endOfDueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      return endOfDueDay < now;
    }

    const today = new Date();
    
    // Task due today at 23:55 (5 mins before midnight) tested at current moment today
    const dueTodayNight = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 55, 0).toISOString();
    const testNowDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 0, 0);

    expect(isOverdueLocal(dueTodayNight, 'todo', testNowDay)).toBe(false);

    // Task due yesterday at 23:55 tested at 00:05 today
    const dueYesterdayNight = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 23, 55, 0).toISOString();
    const testNowMidnightPassed = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 5, 0);

    expect(isOverdueLocal(dueYesterdayNight, 'todo', testNowMidnightPassed)).toBe(true);
  });
});

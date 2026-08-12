/**
 * Phase 24 — Calendar View Test Suite
 *
 * Verifies:
 * 1. Calendar task retrieval across date ranges (GET /calendar/tasks with from / to)
 * 2. Overdue task detection and separation (includeOverdue=true)
 * 3. Completed tasks excluded from overdue section
 * 4. Multi-dimensional filtering (projectId, assigneeId, status)
 * 5. Multi-tenant isolation (cross-team access prevention)
 * 6. Task due date rescheduling (PATCH /tasks/:id/due-date) and clearing (null)
 * 7. Activity logging for due date changes
 * 8. Calendar summary statistics (GET /calendar/stats)
 * 9. Timezone boundary & midnight edge-cases
 */

const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

const authRoutes     = require('../routes/auth');
const taskRoutes     = require('../routes/tasks');
const teamRoutes     = require('../routes/teams');
const projectRoutes  = require('../routes/projects');
const calendarRoutes = require('../routes/calendar');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth',     authRoutes);
  app.use('/tasks',    taskRoutes);
  app.use('/teams',    teamRoutes);
  app.use('/projects', projectRoutes);
  app.use('/calendar', calendarRoutes);
  return app;
}

let app;
let userA, userB, userOutside;
let tokenA, tokenB, tokenOutside;
let teamA, teamB;
let projectA1, projectA2;

function makeToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

beforeAll(async () => {
  app = createTestApp();

  // Clean up existing data for test users
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.subtask.deleteMany({});
  await prisma.taskWatcher.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.projectMember.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          'p24_usera@test.com',
          'p24_userb@test.com',
          'p24_useroutside@test.com',
        ],
      },
    },
  });

  const passwordHash = await bcrypt.hash('Password123!', 8);

  userA = await prisma.user.create({
    data: { name: 'Alice Calendar', email: 'p24_usera@test.com', passwordHash, emailVerified: true },
  });
  userB = await prisma.user.create({
    data: { name: 'Bob Calendar', email: 'p24_userb@test.com', passwordHash, emailVerified: true },
  });
  userOutside = await prisma.user.create({
    data: { name: 'Dave Outside', email: 'p24_useroutside@test.com', passwordHash, emailVerified: true },
  });

  tokenA = makeToken(userA);
  tokenB = makeToken(userB);
  tokenOutside = makeToken(userOutside);

  // Create Team A with User A (owner) and User B (member)
  teamA = await prisma.team.create({
    data: { name: 'Team Alpha Calendar', ownerId: userA.id },
  });
  await prisma.teamMembership.createMany({
    data: [
      { userId: userA.id, teamId: teamA.id, role: 'owner' },
      { userId: userB.id, teamId: teamA.id, role: 'member' },
    ],
  });

  // Create Team B with User Outside (owner)
  teamB = await prisma.team.create({
    data: { name: 'Team Beta Calendar', ownerId: userOutside.id },
  });
  await prisma.teamMembership.create({
    data: { userId: userOutside.id, teamId: teamB.id, role: 'owner' },
  });

  // Create Projects in Team A
  projectA1 = await prisma.project.create({
    data: {
      name: 'Project Alpha One',
      teamId: teamA.id,
      createdById: userA.id,
      color: '#6366f1',
    },
  });
  projectA2 = await prisma.project.create({
    data: {
      name: 'Project Alpha Two',
      teamId: teamA.id,
      createdById: userA.id,
      color: '#10b981',
    },
  });
});

afterAll(async () => {
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.subtask.deleteMany({});
  await prisma.taskWatcher.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.projectMember.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          'p24_usera@test.com',
          'p24_userb@test.com',
          'p24_useroutside@test.com',
        ],
      },
    },
  });
});

describe('Phase 24 — Calendar View', () => {
  let taskMidMonth, taskFuture, taskOverdue, taskDoneOverdue, taskNoDueDate;

  beforeAll(async () => {
    // Reference dates for testing
    const now = new Date();
    const midMonth = new Date(now.getFullYear(), now.getMonth(), 15, 12, 0, 0);
    const futureDate = new Date(now.getFullYear(), now.getMonth() + 1, 10, 14, 0, 0);
    const pastDate = new Date(now.getTime() - 86400000 * 5); // 5 days ago

    // 1. Mid-month task (Team A, assigned to User A, project A1)
    taskMidMonth = await prisma.task.create({
      data: {
        title: 'Mid Month Feature Task',
        dueDate: midMonth,
        status: 'todo',
        priority: 'high',
        teamId: teamA.id,
        createdById: userA.id,
        assigneeId: userA.id,
        projectId: projectA1.id,
      },
    });

    // 2. Future month task (Team A, assigned to User B, project A2)
    taskFuture = await prisma.task.create({
      data: {
        title: 'Future Milestone Task',
        dueDate: futureDate,
        status: 'in_progress',
        priority: 'medium',
        teamId: teamA.id,
        createdById: userA.id,
        assigneeId: userB.id,
        projectId: projectA2.id,
      },
    });

    // 3. Overdue task (Team A, incomplete)
    taskOverdue = await prisma.task.create({
      data: {
        title: 'Urgent Overdue Task',
        dueDate: pastDate,
        status: 'todo',
        priority: 'urgent',
        teamId: teamA.id,
        createdById: userA.id,
        assigneeId: userA.id,
      },
    });

    // 4. Completed task with past due date (should NOT appear in overdue)
    taskDoneOverdue = await prisma.task.create({
      data: {
        title: 'Completed Past Task',
        dueDate: pastDate,
        status: 'done',
        priority: 'low',
        teamId: teamA.id,
        createdById: userA.id,
      },
    });

    // 5. Task with no due date
    taskNoDueDate = await prisma.task.create({
      data: {
        title: 'Backlog Task No Date',
        dueDate: null,
        status: 'todo',
        priority: 'low',
        teamId: teamA.id,
        createdById: userA.id,
      },
    });

    // 6. Task in Team B (for isolation tests)
    await prisma.task.create({
      data: {
        title: 'Team B Secret Calendar Task',
        dueDate: midMonth,
        status: 'todo',
        teamId: teamB.id,
        createdById: userOutside.id,
      },
    });
  });

  describe('1. Calendar Tasks Range Query (GET /calendar/tasks)', () => {
    it('fetches tasks within the requested date range', async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const res = await request(app)
        .get('/calendar/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ from: startOfMonth, to: endOfMonth });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.tasks)).toBe(true);

      const taskIds = res.body.tasks.map((t) => t.id);
      expect(taskIds).toContain(taskMidMonth.id);
      expect(taskIds).not.toContain(taskFuture.id); // in next month
      expect(taskIds).not.toContain(taskNoDueDate.id); // no due date
    });

    it('returns overdue tasks separately when includeOverdue is enabled', async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const res = await request(app)
        .get('/calendar/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ from: startOfMonth, to: endOfMonth, includeOverdue: true });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.overdueTasks)).toBe(true);

      const overdueIds = res.body.overdueTasks.map((t) => t.id);
      expect(overdueIds).toContain(taskOverdue.id);
      // Completed task with past date must NOT be counted as overdue
      expect(overdueIds).not.toContain(taskDoneOverdue.id);
    });

    it('handles date-only YYYY-MM-DD strings safely without off-by-one errors', async () => {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const fromStr = `${y}-${m}-01`;
      const toStr   = `${y}-${m}-28`;

      const res = await request(app)
        .get('/calendar/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ from: fromStr, to: toStr });

      expect(res.status).toBe(200);
      expect(res.body.tasks.some((t) => t.id === taskMidMonth.id)).toBe(true);
    });
  });

  describe('2. Multi-Dimensional Calendar Filtering', () => {
    it('filters calendar tasks by projectId', async () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const to   = new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString();

      const res = await request(app)
        .get('/calendar/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ from, to, projectId: projectA1.id });

      expect(res.status).toBe(200);
      expect(res.body.tasks.every((t) => t.projectId === projectA1.id)).toBe(true);
      expect(res.body.tasks.some((t) => t.id === taskMidMonth.id)).toBe(true);
      expect(res.body.tasks.some((t) => t.id === taskFuture.id)).toBe(false);
    });

    it('filters calendar tasks by assigneeId (including "me")', async () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const to   = new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString();

      // Query tasks assigned to user B
      const resB = await request(app)
        .get('/calendar/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ from, to, assigneeId: userB.id });

      expect(resB.status).toBe(200);
      expect(resB.body.tasks.every((t) => t.assigneeId === userB.id)).toBe(true);
      expect(resB.body.tasks.some((t) => t.id === taskFuture.id)).toBe(true);

      // Query with assigneeId="me" as user A
      const resMe = await request(app)
        .get('/calendar/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ from, to, assigneeId: 'me' });

      expect(resMe.status).toBe(200);
      expect(resMe.body.tasks.every((t) => t.assigneeId === userA.id)).toBe(true);
    });

    it('filters calendar tasks by status', async () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const to   = new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString();

      const res = await request(app)
        .get('/calendar/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .query({ from, to, status: 'in_progress' });

      expect(res.status).toBe(200);
      expect(res.body.tasks.every((t) => t.status === 'in_progress')).toBe(true);
      expect(res.body.tasks.some((t) => t.id === taskFuture.id)).toBe(true);
    });
  });

  describe('3. Drag-to-Reschedule (PATCH /tasks/:id/due-date)', () => {
    it('reschedules a task due date and logs activity', async () => {
      const newDueDate = new Date(Date.now() + 86400000 * 10).toISOString();

      const res = await request(app)
        .patch(`/tasks/${taskMidMonth.id}/due-date`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ dueDate: newDueDate });

      expect(res.status).toBe(200);
      expect(res.body.task).toHaveProperty('id', taskMidMonth.id);
      expect(new Date(res.body.task.dueDate).toISOString()).toBe(new Date(newDueDate).toISOString());

      // Check activity was created
      const activity = await prisma.activity.findFirst({
        where: { taskId: taskMidMonth.id, action: 'due_date_changed' },
        orderBy: { createdAt: 'desc' },
      });
      expect(activity).not.toBeNull();
      expect(activity.details).toContain('Due date set to');
    });

    it('clears a task due date when sending null', async () => {
      const res = await request(app)
        .patch(`/tasks/${taskMidMonth.id}/due-date`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ dueDate: null });

      expect(res.status).toBe(200);
      expect(res.body.task.dueDate).toBeNull();
    });

    it('rejects an invalid date format', async () => {
      const res = await request(app)
        .patch(`/tasks/${taskMidMonth.id}/due-date`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ dueDate: 'not-a-valid-date' });

      expect(res.status).toBe(400);
    });

    it('returns 404 when updating non-existent task', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .patch(`/tasks/${fakeId}/due-date`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ dueDate: new Date().toISOString() });

      expect(res.status).toBe(404);
    });
  });

  describe('4. Calendar Summary Statistics (GET /calendar/stats)', () => {
    it('returns calendar metrics for the active team', async () => {
      const res = await request(app)
        .get('/calendar/stats')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('dueToday');
      expect(res.body).toHaveProperty('dueThisWeek');
      expect(res.body).toHaveProperty('dueThisMonth');
      expect(res.body).toHaveProperty('overdueCount');
      expect(typeof res.body.overdueCount).toBe('number');
      expect(res.body.overdueCount).toBeGreaterThanOrEqual(1); // taskOverdue
    });
  });

  describe('5. Multi-Tenant Security & Team Isolation', () => {
    it('prevents user in Team B from viewing Team A calendar tasks', async () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const to   = new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString();

      const res = await request(app)
        .get('/calendar/tasks')
        .set('Authorization', `Bearer ${tokenOutside}`)
        .set('X-Team-Id', teamB.id)
        .query({ from, to });

      expect(res.status).toBe(200);
      const taskIds = res.body.tasks.map((t) => t.id);
      expect(taskIds).not.toContain(taskFuture.id);
      expect(taskIds).not.toContain(taskOverdue.id);
    });

    it('prevents cross-team task rescheduling via PATCH /tasks/:id/due-date', async () => {
      const res = await request(app)
        .patch(`/tasks/${taskFuture.id}/due-date`)
        .set('Authorization', `Bearer ${tokenOutside}`)
        .set('X-Team-Id', teamB.id)
        .send({ dueDate: new Date().toISOString() });

      // Must be 404 because taskFuture does not belong to Team B
      expect(res.status).toBe(404);
    });
  });
});

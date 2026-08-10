/**
 * Phase 17 — Dashboard & Productivity Analytics Test Suite
 *
 * Verifies:
 * 1. Authentication & Team Isolation (User A cannot view Team B's analytics).
 * 2. Empty dataset handling (returns zeroes without errors/NaNs).
 * 3. Status aggregation (counts and percentages for todo, in_progress, done).
 * 4. Completion rate calculation.
 * 5. Velocity metrics (completed this week, completed this month).
 * 6. Overdue task tracking (overdue tasks counted correctly; done tasks excluded).
 * 7. Member workload distribution (per-member breakdown and unassigned tasks).
 * 8. Personal productivity filtering via `userId` query parameter.
 * 9. Date range validation and filtering (`7d`, `30d`, `90d`, `all`, invalid range -> 400).
 * 10. Recent activity feed integration.
 */

const request = require('supertest');
const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const prisma  = require('../prisma');

const authRoutes = require('../routes/auth');
const taskRoutes = require('../routes/tasks');
const teamRoutes = require('../routes/teams');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use('/tasks', taskRoutes);
  app.use('/teams', teamRoutes);
  return app;
}

let app;
let userA, userB, userC;
let teamA, teamB;
let tokenA, tokenB, tokenC;

beforeAll(async () => {
  app = createTestApp();

  // Clean up any test users from prior runs
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          'analytics-usera@test.com',
          'analytics-userb@test.com',
          'analytics-userc@test.com',
        ],
      },
    },
  });

  const passwordHash = await bcrypt.hash('password123', 10);

  userA = await prisma.user.create({
    data: {
      email: 'analytics-usera@test.com',
      passwordHash,
      name: 'Analytics User A',
      emailVerified: true,
    },
  });

  userB = await prisma.user.create({
    data: {
      email: 'analytics-userb@test.com',
      passwordHash,
      name: 'Analytics User B',
      emailVerified: true,
    },
  });

  userC = await prisma.user.create({
    data: {
      email: 'analytics-userc@test.com',
      passwordHash,
      name: 'Analytics User C',
      emailVerified: true,
    },
  });

  tokenA = jwt.sign({ userId: userA.id }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
  tokenB = jwt.sign({ userId: userB.id }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
  tokenC = jwt.sign({ userId: userC.id }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });

  // Team A with User A (owner) and User B (member)
  teamA = await prisma.team.create({
    data: {
      name: 'Analytics Team A',
      ownerId: userA.id,
      memberships: {
        create: [
          { userId: userA.id, role: 'owner' },
          { userId: userB.id, role: 'member' },
        ],
      },
    },
  });

  // Team B with User C (owner)
  teamB = await prisma.team.create({
    data: {
      name: 'Analytics Team B',
      ownerId: userC.id,
      memberships: {
        create: [
          { userId: userC.id, role: 'owner' },
        ],
      },
    },
  });
});

afterAll(async () => {
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          'analytics-usera@test.com',
          'analytics-userb@test.com',
          'analytics-userc@test.com',
        ],
      },
    },
  });
});

describe('Phase 17 — Dashboard & Productivity Analytics', () => {
  test('1. Unauthorized access without JWT returns 401', async () => {
    const res = await request(app).get(`/teams/${teamA.id}/analytics`);
    expect(res.status).toBe(401);
  });

  test('2. Team isolation: User C (member of Team B) cannot access Team A analytics (403)', async () => {
    const res = await request(app)
      .get(`/teams/${teamA.id}/analytics`)
      .set('Authorization', `Bearer ${tokenC}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not a member of this team/i);
  });

  test('3. Empty team returns clean zeroed statistics without NaN or errors', async () => {
    const res = await request(app)
      .get(`/teams/${teamB.id}/analytics`)
      .set('Authorization', `Bearer ${tokenC}`);

    expect(res.status).toBe(200);
    expect(res.body.analytics).toBeDefined();
    expect(res.body.analytics.teamId).toBe(teamB.id);

    const { overview, statusBreakdown, workloadDistribution, unassigned } = res.body.analytics;
    expect(overview.totalTasks).toBe(0);
    expect(overview.completedTasks).toBe(0);
    expect(overview.inProgressTasks).toBe(0);
    expect(overview.todoTasks).toBe(0);
    expect(overview.overdueTasks).toBe(0);
    expect(overview.completionRate).toBe(0);
    expect(overview.completedThisWeek).toBe(0);
    expect(overview.completedThisMonth).toBe(0);

    expect(statusBreakdown).toEqual([
      { status: 'todo', label: 'Todo', count: 0, percentage: 0 },
      { status: 'in_progress', label: 'In Progress', count: 0, percentage: 0 },
      { status: 'done', label: 'Done', count: 0, percentage: 0 },
    ]);

    expect(workloadDistribution).toHaveLength(1);
    expect(workloadDistribution[0].userId).toBe(userC.id);
    expect(workloadDistribution[0].totalTasks).toBe(0);
    expect(workloadDistribution[0].completionRate).toBe(0);

    expect(unassigned.totalTasks).toBe(0);
  });

  test('4. Validates query parameters: invalid range returns 400', async () => {
    const res = await request(app)
      .get(`/teams/${teamA.id}/analytics?range=invalidRange`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  test('5. Computes accurate aggregated metrics across tasks, members, and statuses', async () => {
    const now = new Date();
    const pastDueDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const futureDueDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days ahead

    // Create tasks for Team A:
    // Task 1: Todo, assigned to User A, due in future
    const task1 = await prisma.task.create({
      data: {
        title: 'Task 1 - Todo',
        status: 'todo',
        dueDate: futureDueDate,
        assigneeId: userA.id,
        createdById: userA.id,
        teamId: teamA.id,
      },
    });

    // Task 2: In Progress, assigned to User A, overdue
    const task2 = await prisma.task.create({
      data: {
        title: 'Task 2 - In Progress Overdue',
        status: 'in_progress',
        dueDate: pastDueDate,
        assigneeId: userA.id,
        createdById: userA.id,
        teamId: teamA.id,
      },
    });

    // Task 3: Done, assigned to User B, was overdue but marked done
    const task3 = await prisma.task.create({
      data: {
        title: 'Task 3 - Done',
        status: 'done',
        dueDate: pastDueDate,
        assigneeId: userB.id,
        createdById: userA.id,
        teamId: teamA.id,
      },
    });

    // Task 4: Done, unassigned
    const task4 = await prisma.task.create({
      data: {
        title: 'Task 4 - Done Unassigned',
        status: 'done',
        assigneeId: null,
        createdById: userB.id,
        teamId: teamA.id,
      },
    });

    // Task 5: Todo, unassigned, overdue
    const task5 = await prisma.task.create({
      data: {
        title: 'Task 5 - Todo Overdue Unassigned',
        status: 'todo',
        dueDate: pastDueDate,
        assigneeId: null,
        createdById: userA.id,
        teamId: teamA.id,
      },
    });

    // Create an activity for Task 1
    await prisma.activity.create({
      data: {
        taskId: task1.id,
        userId: userA.id,
        action: 'created',
        details: 'Task 1 created for analytics testing',
      },
    });

    const res = await request(app)
      .get(`/teams/${teamA.id}/analytics?range=30d`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const { overview, statusBreakdown, workloadDistribution, unassigned, recentActivities } = res.body.analytics;

    // Total tasks = 5
    expect(overview.totalTasks).toBe(5);
    // Completed = Task 3 + Task 4 = 2
    expect(overview.completedTasks).toBe(2);
    // In Progress = Task 2 = 1
    expect(overview.inProgressTasks).toBe(1);
    // Todo = Task 1 + Task 5 = 2
    expect(overview.todoTasks).toBe(2);
    // Overdue = Task 2 (in_progress, past due) + Task 5 (todo, past due) = 2 (Task 3 is done so NOT overdue)
    expect(overview.overdueTasks).toBe(2);
    // Completion rate = 2 / 5 = 40%
    expect(overview.completionRate).toBe(40);
    // Completed this week = 2
    expect(overview.completedThisWeek).toBe(2);

    // Status breakdown percentages
    const todoItem = statusBreakdown.find((s) => s.status === 'todo');
    const progItem = statusBreakdown.find((s) => s.status === 'in_progress');
    const doneItem = statusBreakdown.find((s) => s.status === 'done');

    expect(todoItem.count).toBe(2);
    expect(todoItem.percentage).toBe(40);
    expect(progItem.count).toBe(1);
    expect(progItem.percentage).toBe(20);
    expect(doneItem.count).toBe(2);
    expect(doneItem.percentage).toBe(40);

    // Member Workload
    const userAWorkload = workloadDistribution.find((w) => w.userId === userA.id);
    const userBWorkload = workloadDistribution.find((w) => w.userId === userB.id);

    expect(userAWorkload.totalTasks).toBe(2);
    expect(userAWorkload.completedTasks).toBe(0);
    expect(userAWorkload.inProgressTasks).toBe(1);
    expect(userAWorkload.todoTasks).toBe(1);
    expect(userAWorkload.overdueTasks).toBe(1);
    expect(userAWorkload.completionRate).toBe(0);

    expect(userBWorkload.totalTasks).toBe(1);
    expect(userBWorkload.completedTasks).toBe(1);
    expect(userBWorkload.overdueTasks).toBe(0);
    expect(userBWorkload.completionRate).toBe(100);

    // Unassigned tasks (Task 4 + Task 5 = 2)
    expect(unassigned.totalTasks).toBe(2);
    expect(unassigned.completedTasks).toBe(1);
    expect(unassigned.todoTasks).toBe(1);
    expect(unassigned.overdueTasks).toBe(1);

    // Recent activity stream
    expect(recentActivities.length).toBeGreaterThanOrEqual(1);
    expect(recentActivities[0].action).toBe('created');
    expect(recentActivities[0].user.id).toBe(userA.id);
    expect(recentActivities[0].task.id).toBe(task1.id);
  });

  test('6. Personal productivity filtering via ?userId=<id>', async () => {
    const res = await request(app)
      .get(`/teams/${teamA.id}/analytics?userId=${userA.id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const { overview, filterUserId } = res.body.analytics;

    expect(filterUserId).toBe(userA.id);
    expect(overview.totalTasks).toBe(2); // only User A's tasks
    expect(overview.inProgressTasks).toBe(1);
    expect(overview.todoTasks).toBe(1);
    expect(overview.completedTasks).toBe(0);
    expect(overview.completionRate).toBe(0);
  });

  test('7. Range filtering supported for 7d, 30d, 90d, all', async () => {
    for (const range of ['7d', '30d', '90d', 'all']) {
      const res = await request(app)
        .get(`/teams/${teamA.id}/analytics?range=${range}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.analytics.range).toBe(range);
      expect(res.body.analytics.dailyTrends.length).toBeGreaterThan(0);
    }
  });
});

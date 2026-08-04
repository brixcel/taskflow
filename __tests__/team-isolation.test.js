/**
 * Team Isolation Tests — Phase 1 Requirement
 *
 * Verifies that users in Team A cannot access Team B's:
 * - Tasks (GET/PATCH/DELETE)
 * - Comments (GET/POST)
 * - Activity logs (GET)
 *
 * All cross-team access attempts should return 404 (not 403),
 * since to an outsider the resource simply doesn't exist in their scope.
 */

const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

// Import routes and middleware
const authRoutes = require('../routes/auth');
const taskRoutes = require('../routes/tasks');
const commentRoutes = require('../routes/comments');
const activityRoutes = require('../routes/activities');

// Test app setup
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use('/tasks', taskRoutes);
  app.use('/tasks/:taskId/comments', commentRoutes);
  app.use('/tasks/:taskId/activities', activityRoutes);
  return app;
}

// Test data containers
let teamA, teamB;
let userA, userB;
let taskA, taskB;
let commentA;
let tokenA, tokenB;
let app;

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  app = createTestApp();

  // Clean up any test data from previous runs
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: { in: ['usera@test.com', 'userb@test.com'] }
    }
  });

  // Create users
  const passwordHash = await bcrypt.hash('password123', 10);
  
  userA = await prisma.user.create({
    data: {
      email: 'usera@test.com',
      passwordHash,
      name: 'User A',
    },
  });

  userB = await prisma.user.create({
    data: {
      email: 'userb@test.com',
      passwordHash,
      name: 'User B',
    },
  });

  // Create teams
  teamA = await prisma.team.create({
    data: {
      name: 'Team Alpha',
      ownerId: userA.id,
    },
  });

  teamB = await prisma.team.create({
    data: {
      name: 'Team Beta',
      ownerId: userB.id,
    },
  });

  // Create memberships
  await prisma.teamMembership.create({
    data: {
      userId: userA.id,
      teamId: teamA.id,
      role: 'owner',
    },
  });

  await prisma.teamMembership.create({
    data: {
      userId: userB.id,
      teamId: teamB.id,
      role: 'owner',
    },
  });

  // Create tasks in each team
  taskA = await prisma.task.create({
    data: {
      title: 'Task in Team A',
      description: 'Belongs to Team Alpha',
      teamId: teamA.id,
      createdById: userA.id,
    },
  });

  taskB = await prisma.task.create({
    data: {
      title: 'Task in Team B',
      description: 'Belongs to Team Beta',
      teamId: teamB.id,
      createdById: userB.id,
    },
  });

  // Create a comment in Team A
  commentA = await prisma.comment.create({
    data: {
      content: 'Comment on Team A task',
      taskId: taskA.id,
      authorId: userA.id,
    },
  });

  // Create activity in Team A
  await prisma.activity.create({
    data: {
      taskId: taskA.id,
      userId: userA.id,
      action: 'created',
      details: 'Task created',
    },
  });

  // Generate JWT tokens
  tokenA = jwt.sign({ userId: userA.id }, process.env.JWT_SECRET || 'test-secret');
  tokenB = jwt.sign({ userId: userB.id }, process.env.JWT_SECRET || 'test-secret');
});

afterAll(async () => {
  // Clean up test data
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: { in: ['usera@test.com', 'userb@test.com'] }
    }
  });
  
  await prisma.$disconnect();
});

// ─── Task Isolation Tests ─────────────────────────────────────────────────────

describe('Task Isolation', () => {
  test('User B cannot GET Task A (returns 404)', async () => {
    const response = await request(app)
      .get('/tasks')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(response.status).toBe(200);
    expect(response.body.tasks).toHaveLength(1);
    expect(response.body.tasks[0].id).toBe(taskB.id);
    // Task A should not be in the list
    expect(response.body.tasks.find(t => t.id === taskA.id)).toBeUndefined();
  });

  test('User B cannot PATCH Task A (returns 404)', async () => {
    const response = await request(app)
      .patch(`/tasks/${taskA.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ title: 'Trying to update Team A task' });

    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/not found/i);
  });

  test('User B cannot DELETE Task A (returns 404)', async () => {
    const response = await request(app)
      .delete(`/tasks/${taskA.id}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/not found/i);

    // Verify Task A still exists
    const stillExists = await prisma.task.findUnique({ where: { id: taskA.id } });
    expect(stillExists).not.toBeNull();
  });

  test('User A can access their own Task A', async () => {
    const response = await request(app)
      .get('/tasks')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(response.status).toBe(200);
    expect(response.body.tasks).toHaveLength(1);
    expect(response.body.tasks[0].id).toBe(taskA.id);
  });
});

// ─── Comment Isolation Tests ──────────────────────────────────────────────────

describe('Comment Isolation', () => {
  test('User B cannot GET comments on Task A (returns 404)', async () => {
    const response = await request(app)
      .get(`/tasks/${taskA.id}/comments`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/not found/i);
  });

  test('User B cannot POST comment on Task A (returns 404)', async () => {
    const response = await request(app)
      .post(`/tasks/${taskA.id}/comments`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ content: 'Trying to comment on Team A task' });

    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/not found/i);

    // Verify no new comment was created
    const comments = await prisma.comment.findMany({ where: { taskId: taskA.id } });
    expect(comments).toHaveLength(1); // Only the original comment
  });

  test('User A can access comments on their own Task A', async () => {
    const response = await request(app)
      .get(`/tasks/${taskA.id}/comments`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(response.status).toBe(200);
    expect(response.body.comments).toHaveLength(1);
    expect(response.body.comments[0].id).toBe(commentA.id);
  });
});

// ─── Activity Log Isolation Tests ─────────────────────────────────────────────

describe('Activity Log Isolation', () => {
  test('User B cannot GET activity log for Task A (returns 404)', async () => {
    const response = await request(app)
      .get(`/tasks/${taskA.id}/activities`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/not found/i);
  });

  test('User A can access activity log for their own Task A', async () => {
    const response = await request(app)
      .get(`/tasks/${taskA.id}/activities`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(response.status).toBe(200);
    expect(response.body.activities).toHaveLength(1);
    expect(response.body.activities[0].action).toBe('created');
  });
});

// ─── Cross-Team Verification ──────────────────────────────────────────────────

describe('resolveTeam Middleware Verification', () => {
  test('Membership is re-checked from DB on every request (not stale JWT)', async () => {
    // First request succeeds
    let response = await request(app)
      .get('/tasks')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(response.status).toBe(200);

    // Remove user from team
    await prisma.teamMembership.delete({
      where: {
        userId_teamId: {
          userId: userA.id,
          teamId: teamA.id,
        },
      },
    });

    // Next request should fail immediately (404 - no team membership)
    response = await request(app)
      .get('/tasks')
      .set('Authorization', `Bearer ${tokenA}`);
    
    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/not a member of any team/i);

    // Restore membership for cleanup
    await prisma.teamMembership.create({
      data: {
        userId: userA.id,
        teamId: teamA.id,
        role: 'owner',
      },
    });
  });

  test('Explicit team header is validated against DB membership', async () => {
    // User A tries to access Team B explicitly
    const response = await request(app)
      .get('/tasks')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Team-Id', teamB.id);

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/not a member of this team/i);
  });
});

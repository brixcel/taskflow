const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

const authRoutes = require('../routes/auth');
const taskRoutes = require('../routes/tasks');
const projectRoutes = require('../routes/projects');
const subtaskRoutes = require('../routes/subtasks');
const aiRoutes = require('../routes/ai');

const {
  calculateRangeWindows,
  aggregateProductivityMetrics,
  generateFallbackInsights,
  generateProductivityInsights,
} = require('../services/ai');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use('/tasks', taskRoutes);
  app.use('/projects', projectRoutes);
  app.use('/subtasks', subtaskRoutes);
  app.use('/ai', aiRoutes);
  return app;
}

let app;
let userA, userB, userAlex;
let teamA, teamB;
let tokenA, tokenB, tokenAlex;
let projectRedesign, projectBackend;

function makeToken(userId, email, teamId) {
  return jwt.sign(
    { userId, email, teamId },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

describe('Phase 29 — AI Productivity Insights', () => {
  beforeAll(async () => {
    app = createTestApp();

    await prisma.activity.deleteMany({});
    await prisma.comment.deleteMany({});
    await prisma.subtask.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.projectMember.deleteMany({});
    await prisma.project.deleteMany({});
    await prisma.teamMembership.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: { in: ['alice-insights@test.com', 'bob-insights@test.com', 'alex-insights@test.com'] },
      },
    });

    const passwordHash = await bcrypt.hash('password123', 10);

    // User A (Team A owner)
    userA = await prisma.user.create({
      data: {
        email: 'alice-insights@test.com',
        passwordHash,
        name: 'Alice Insights',
      },
    });

    // User Alex (Team A member)
    userAlex = await prisma.user.create({
      data: {
        email: 'alex-insights@test.com',
        passwordHash,
        name: 'Alex Workload',
      },
    });

    // Team A
    teamA = await prisma.team.create({
      data: {
        name: 'Productivity Team A',
        ownerId: userA.id,
        memberships: {
          create: [
            { userId: userA.id, role: 'owner' },
            { userId: userAlex.id, role: 'member' },
          ],
        },
      },
    });

    tokenA = makeToken(userA.id, userA.email, teamA.id);
    tokenAlex = makeToken(userAlex.id, userAlex.email, teamA.id);

    // User B & Team B (for isolation testing)
    userB = await prisma.user.create({
      data: {
        email: 'bob-insights@test.com',
        passwordHash,
        name: 'Bob Insights',
      },
    });

    teamB = await prisma.team.create({
      data: {
        name: 'Productivity Team B',
        ownerId: userB.id,
        memberships: {
          create: {
            userId: userB.id,
            role: 'owner',
          },
        },
      },
    });

    tokenB = makeToken(userB.id, userB.email, teamB.id);

    // Seed Team A Projects
    projectRedesign = await prisma.project.create({
      data: {
        name: 'Website Redesign',
        description: 'Comprehensive redesign of landing and dashboard',
        status: 'active',
        teamId: teamA.id,
        createdById: userA.id,
      },
    });

    projectBackend = await prisma.project.create({
      data: {
        name: 'Backend API V2',
        description: 'High performance API endpoints',
        status: 'active',
        teamId: teamA.id,
        createdById: userA.id,
      },
    });

    // Seed Seeded Tasks for Team A with various dates & statuses
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const threeDaysOverdue = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    // Set Tuesday completion date
    const tuesdayCompletion = new Date(now);
    const day = tuesdayCompletion.getDay();
    const diffToTuesday = tuesdayCompletion.getDate() - day + (day < 2 ? -5 : 2);
    tuesdayCompletion.setDate(diffToTuesday);
    tuesdayCompletion.setHours(14, 0, 0, 0);

    // 1. Completed tasks in current 7d window (4 tasks)
    for (let i = 1; i <= 4; i++) {
      await prisma.task.create({
        data: {
          title: `Completed Feature ${i}`,
          status: 'done',
          priority: 'high',
          teamId: teamA.id,
          createdById: userA.id,
          assigneeId: userAlex.id,
          projectId: projectBackend.id,
          createdAt: twoDaysAgo,
          updatedAt: tuesdayCompletion,
        },
      });
    }

    // 2. Completed tasks in previous 7d window (2 tasks -> velocity improvement: (4 - 2)/2 = +100%)
    for (let i = 1; i <= 2; i++) {
      await prisma.task.create({
        data: {
          title: `Old Completed Feature ${i}`,
          status: 'done',
          priority: 'medium',
          teamId: teamA.id,
          createdById: userA.id,
          assigneeId: userA.id,
          createdAt: tenDaysAgo,
          updatedAt: tenDaysAgo,
        },
      });
    }

    // 3. Overdue tasks (3 overdue tasks)
    for (let i = 1; i <= 3; i++) {
      await prisma.task.create({
        data: {
          title: `Critical Overdue Bug ${i}`,
          status: 'in_progress',
          priority: 'urgent',
          dueDate: threeDaysOverdue,
          teamId: teamA.id,
          createdById: userA.id,
          assigneeId: userAlex.id,
          createdAt: twoDaysAgo,
          updatedAt: yesterday,
        },
      });
    }

    // 4. Stalled project tasks in "Website Redesign" (pending tasks, no completions in 5+ days)
    for (let i = 1; i <= 3; i++) {
      await prisma.task.create({
        data: {
          title: `Redesign Wireframe ${i}`,
          status: 'todo',
          priority: 'medium',
          projectId: projectRedesign.id,
          teamId: teamA.id,
          createdById: userA.id,
          assigneeId: userAlex.id,
          createdAt: tenDaysAgo,
          updatedAt: tenDaysAgo,
        },
      });
    }

    // 5. Team B Tasks (isolated)
    await prisma.task.create({
      data: {
        title: 'Team B Private Task',
        status: 'done',
        teamId: teamB.id,
        createdById: userB.id,
        assigneeId: userB.id,
      },
    });
  });

  afterAll(async () => {
    await prisma.activity.deleteMany({});
    await prisma.comment.deleteMany({});
    await prisma.subtask.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.projectMember.deleteMany({});
    await prisma.project.deleteMany({});
    await prisma.teamMembership.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: { in: ['alice-insights@test.com', 'bob-insights@test.com', 'alex-insights@test.com'] },
      },
    });
  });

  describe('1. Unit Metrics Aggregator & Date Windows', () => {
    it('computes correct date windows for 7d, 30d, 90d, this_week, and all', () => {
      const w7d = calculateRangeWindows('7d');
      expect(w7d.range).toBe('7d');
      expect(w7d.startDate).not.toBeNull();
      expect(w7d.label).toBe('Past 7 Days');

      const wWeek = calculateRangeWindows('this_week');
      expect(wWeek.range).toBe('this_week');
      expect(wWeek.label).toBe('This Week');

      const wAll = calculateRangeWindows('all');
      expect(wAll.range).toBe('all');
      expect(wAll.startDate).toBeNull();
      expect(wAll.label).toBe('All Time');
    });

    it('aggregates accurate metrics from team data (velocity, overdue, peak day, workload leader)', async () => {
      const metrics = await aggregateProductivityMetrics({
        teamId: teamA.id,
        range: '7d',
        prismaInstance: prisma,
      });

      expect(metrics.timeRange.range).toBe('7d');
      expect(metrics.tasksCompleted).toBe(4);
      expect(metrics.tasksCompletedPrev).toBe(2);
      expect(metrics.velocityChangePct).toBe(100); // (4-2)/2 * 100 = 100%
      expect(metrics.overdueCount).toBe(3);
      expect(metrics.overdueTasksList.length).toBe(3);
      expect(metrics.highestWorkloadMember).not.toBeNull();
      expect(metrics.highestWorkloadMember.name).toBe('Alex Workload');
      expect(metrics.topContributor.name).toBe('Alex Workload');
      expect(metrics.projectSlowdowns.some(p => p.name === 'Website Redesign')).toBe(true);
    });

    it('generates rich deterministic fallback insights matching specs', () => {
      const mockMetrics = {
        timeRange: { range: 'this_week', label: 'This Week', startDate: '2026-08-01', endDate: '2026-08-07' },
        tasksCompleted: 32,
        tasksCreated: 28,
        completionRate: 88,
        velocityChangePct: 18,
        overdueCount: 3,
        activeWorkloadCount: 15,
        peakProductivityDay: 'Tuesday',
        topContributor: { name: 'Alex', completedCount: 14 },
        highestWorkloadMember: { name: 'Alex', activeCount: 12 },
        projectSlowdowns: [{ projectId: 'p1', name: 'Website Redesign', pendingCount: 5 }],
      };

      const fallback = generateFallbackInsights(mockMetrics, 'Your team');

      expect(fallback.summary).toContain('Your team completed 32 tasks this week (18% improvement');
      expect(fallback.summary).toContain('3 tasks are overdue');
      expect(fallback.summary).toContain('Alex has the highest active workload');
      expect(fallback.summary).toContain('"Website Redesign" has slowed over the past 5 days');

      expect(fallback.highlights.some(h => h.includes('32 tasks') && h.includes('18% improvement'))).toBe(true);
      expect(fallback.highlights.some(h => h.includes('Tuesdays'))).toBe(true);
      expect(fallback.bottlenecks.some(b => b.includes('3 tasks are overdue'))).toBe(true);
      expect(fallback.bottlenecks.some(b => b.includes('Website Redesign'))).toBe(true);
      expect(fallback.workloadAnalysis.some(w => w.includes('Alex'))).toBe(true);
      expect(fallback.recommendations.some(r => r.includes('overdue tasks'))).toBe(true);
    });

    it('generateProductivityInsights service returns valid structured schema', async () => {
      const insights = await generateProductivityInsights({
        teamId: teamA.id,
        range: '7d',
        teamName: 'Productivity Team A',
        prismaInstance: prisma,
      });

      expect(insights).toHaveProperty('summary');
      expect(insights).toHaveProperty('metrics');
      expect(insights.metrics.tasksCompleted).toBe(4);
      expect(insights.metrics.overdueCount).toBe(3);
      expect(Array.isArray(insights.highlights)).toBe(true);
      expect(Array.isArray(insights.bottlenecks)).toBe(true);
      expect(Array.isArray(insights.recommendations)).toBe(true);
      expect(insights.generatedAt).toBeDefined();
    });
  });

  describe('2. GET /ai/productivity-insights Route Validation & Auth', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/ai/productivity-insights');
      expect(res.status).toBe(401);
    });

    it('rejects invalid range query parameter with 400', async () => {
      const res = await request(app)
        .get('/ai/productivity-insights?range=invalid_range')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(400);
      expect(res.body.error || res.body.errors).toBeDefined();
    });

    it('rejects non-UUID userId with 400', async () => {
      const res = await request(app)
        .get('/ai/productivity-insights?userId=not-a-uuid')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(400);
    });

    it('rejects userId of user not belonging to team with 403', async () => {
      const res = await request(app)
        .get(`/ai/productivity-insights?userId=${userB.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(403);
    });

    it('rejects projectId from another team with 404', async () => {
      // Create Project in Team B
      const projB = await prisma.project.create({
        data: {
          name: 'Team B Project',
          teamId: teamB.id,
          createdById: userB.id,
        },
      });

      const res = await request(app)
        .get(`/ai/productivity-insights?projectId=${projB.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(404);
    });

    it('returns successful structured insights for authenticated team member', async () => {
      const res = await request(app)
        .get('/ai/productivity-insights?range=7d')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.insights).toBeDefined();
      expect(res.body.insights.timeRange.range).toBe('7d');
      expect(res.body.insights.metrics.tasksCompleted).toBe(4);
      expect(res.body.insights.metrics.overdueCount).toBe(3);
      expect(res.body.insights.highlights.length).toBeGreaterThan(0);
      expect(res.body.insights.bottlenecks.length).toBeGreaterThan(0);
    });
  });

  describe('3. Multi-Tenant Isolation & Zero Data Leakage', () => {
    it('prevents User B from querying Team A with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/ai/productivity-insights')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(403);
    });

    it('returns isolated metrics for Team B without any Team A data', async () => {
      const res = await request(app)
        .get('/ai/productivity-insights')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamB.id);

      expect(res.status).toBe(200);
      expect(res.body.insights.metrics.totalTasks).toBe(1);
      expect(res.body.insights.metrics.overdueCount).toBe(0);
      expect(res.body.insights.summary).not.toContain('Alex');
      expect(res.body.insights.summary).not.toContain('Website Redesign');
    });
  });

  describe('4. Scoped Personal & Project Productivity Insights', () => {
    it('filters insights to personal productivity when userId is provided', async () => {
      const res = await request(app)
        .get(`/ai/productivity-insights?userId=${userAlex.id}&range=7d`)
        .set('Authorization', `Bearer ${tokenAlex}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.insights.summary).toContain('You completed');
      expect(res.body.insights.metrics.tasksCompleted).toBe(4);
    });

    it('filters insights to specific project when projectId is provided', async () => {
      const res = await request(app)
        .get(`/ai/productivity-insights?projectId=${projectRedesign.id}&range=30d`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.insights.metrics.totalTasks).toBe(3);
      expect(res.body.insights.metrics.tasksCompleted).toBe(0);
    });
  });
});

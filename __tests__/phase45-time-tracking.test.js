const request = require('supertest');
const { app } = require('../server');
const prisma = require('../prisma');

describe('Phase 45 — Time Tracking & Work Estimates', () => {
  let userA, userB, tokenA, tokenB;
  let teamA, teamB;
  let projectA;
  let taskA1, taskA2, taskB1;
  let manualEntryA;

  beforeAll(async () => {
    // 1. Register User A & Team A
    const resRegA = await request(app).post('/auth/register').send({
      email: `time_lead_a_${Date.now()}@example.com`,
      password: 'Password123!',
      name: 'Time Lead Alpha',
      teamName: 'Alpha Time Workspace',
    });
    userA = resRegA.body.user;
    tokenA = resRegA.body.token;

    const membershipA = await prisma.teamMembership.findFirst({
      where: { userId: userA.id },
      include: { team: true },
    });
    teamA = membershipA.team;

    // 2. Register User B & Team B
    const resRegB = await request(app).post('/auth/register').send({
      email: `time_lead_b_${Date.now()}@example.com`,
      password: 'Password123!',
      name: 'Time User Beta',
      teamName: 'Beta Time Workspace',
    });
    userB = resRegB.body.user;
    tokenB = resRegB.body.token;

    const membershipB = await prisma.teamMembership.findFirst({
      where: { userId: userB.id },
      include: { team: true },
    });
    teamB = membershipB.team;

    // 3. Create Project in Team A
    const resProj = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Team-Id', teamA.id)
      .send({
        name: 'Alpha Engineering Project',
        color: '#6366f1',
      });
    projectA = resProj.body.project || resProj.body;

    // 4. Create tasks in Team A
    const resT1 = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Team-Id', teamA.id)
      .send({
        title: 'Backend API Architecture & Middleware',
        priority: 'high',
        projectId: projectA.id,
      });
    taskA1 = resT1.body.task || resT1.body;

    const resT2 = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Team-Id', teamA.id)
      .send({
        title: 'Frontend Component Refactor',
        priority: 'medium',
        projectId: projectA.id,
      });
    taskA2 = resT2.body.task || resT2.body;

    // 5. Create task in Team B
    const resTB = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('X-Team-Id', teamB.id)
      .send({
        title: 'Beta Isolated Task',
        priority: 'low',
      });
    taskB1 = resTB.body.task || resTB.body;
  });

  // ─── 1. Live Stopwatch Timer Lifecycle ──────────────────────────────────────
  describe('1. Live Stopwatch Timer Lifecycle', () => {
    it('starts a live stopwatch timer on a task', async () => {
      const res = await request(app)
        .post(`/tasks/${taskA1.id}/time/start`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ isBillable: true, description: 'Investigating query performance' });

      expect(res.status).toBe(201);
      expect(res.body.timeEntry).toBeDefined();
      expect(res.body.timeEntry.isRunning).toBe(true);
      expect(res.body.timeEntry.taskId).toBe(taskA1.id);
      expect(res.body.timeEntry.userId).toBe(userA.id);
    });

    it('returns the active running timer for the user', async () => {
      const res = await request(app)
        .get('/time/running')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.running).toBe(true);
      expect(res.body.entry.taskId).toBe(taskA1.id);
      expect(typeof res.body.elapsedSeconds).toBe('number');
    });

    it('stops the active timer and calculates duration', async () => {
      const res = await request(app)
        .post(`/tasks/${taskA1.id}/time/stop`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.timeEntry.isRunning).toBe(false);
      expect(res.body.timeEntry.endTime).toBeDefined();
      expect(res.body.durationMinutes).toBeGreaterThanOrEqual(1);

      // Verify running timer is now false
      const checkRes = await request(app)
        .get('/time/running')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(checkRes.status).toBe(200);
      expect(checkRes.body.running).toBe(false);
    });
  });

  // ─── 2. Single Active Timer Constraint ──────────────────────────────────────
  describe('2. Single Active Timer Constraint', () => {
    it('automatically closes previous running timer when starting a new timer on another task', async () => {
      // 1. Start timer on task A1
      await request(app)
        .post(`/tasks/${taskA1.id}/time/start`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      // 2. Start timer on task A2
      const res2 = await request(app)
        .post(`/tasks/${taskA2.id}/time/start`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res2.status).toBe(201);
      expect(res2.body.timeEntry.taskId).toBe(taskA2.id);

      // 3. Verify task A1 timer was stopped
      const closedEntry = await prisma.timeEntry.findFirst({
        where: { taskId: taskA1.id, userId: userA.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(closedEntry.isRunning).toBe(false);

      // 4. Stop task A2 timer
      await request(app)
        .post(`/tasks/${taskA2.id}/time/stop`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);
    });
  });

  // ─── 3. Manual Time Logging & Work Estimates ────────────────────────────────
  describe('3. Manual Time Logging & Work Estimates', () => {
    it('updates estimated work duration on a task', async () => {
      const res = await request(app)
        .patch(`/tasks/${taskA1.id}/estimate`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ estimatedMinutes: 240 }); // 4 hours

      expect(res.status).toBe(200);
      expect(res.body.task.estimatedMinutes).toBe(240);
    });

    it('rejects negative estimate values with 400', async () => {
      const res = await request(app)
        .patch(`/tasks/${taskA1.id}/estimate`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ estimatedMinutes: -30 });

      expect(res.status).toBe(400);
    });

    it('manually logs time on a task', async () => {
      const res = await request(app)
        .post(`/tasks/${taskA1.id}/time/log`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          durationMinutes: 90, // 1.5 hours
          description: 'Client design review session',
          isBillable: true,
          hourlyRate: 75.0,
        });

      expect(res.status).toBe(201);
      expect(res.body.timeEntry).toBeDefined();
      expect(res.body.timeEntry.durationMinutes).toBe(90);
      expect(res.body.timeEntry.description).toBe('Client design review session');

      manualEntryA = res.body.timeEntry;
    });

    it('retrieves time entries and estimate progress for a task', async () => {
      const res = await request(app)
        .get(`/tasks/${taskA1.id}/time`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.task.estimatedMinutes).toBe(240);
      expect(res.body.totalDurationMinutes).toBeGreaterThanOrEqual(90);
      expect(res.body.progressPercent).toBeDefined();
      expect(res.body.entries.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── 4. Time Entry Modifications & Deletion ─────────────────────────────────
  describe('4. Time Entry Modifications & Deletion', () => {
    it('allows updating time entry details', async () => {
      const res = await request(app)
        .patch(`/time/${manualEntryA.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          description: 'Updated client design review session',
          durationMinutes: 120,
        });

      expect(res.status).toBe(200);
      expect(res.body.timeEntry.description).toBe('Updated client design review session');
      expect(res.body.timeEntry.durationMinutes).toBe(120);
    });

    it('allows deleting a time entry', async () => {
      const res = await request(app)
        .delete(`/time/${manualEntryA.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const check = await prisma.timeEntry.findUnique({
        where: { id: manualEntryA.id },
      });
      expect(check).toBeNull();
    });
  });

  // ─── 5. Multi-Tenant Isolation ──────────────────────────────────────────────
  describe('5. Multi-Tenant Isolation', () => {
    it('prevents Team B from starting or stopping timer on Team A task', async () => {
      const resStart = await request(app)
        .post(`/tasks/${taskA1.id}/time/start`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamB.id);

      expect(resStart.status).toBe(404);
    });

    it('prevents Team B from querying time entries of Team A task', async () => {
      const resGet = await request(app)
        .get(`/tasks/${taskA1.id}/time`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamB.id);

      expect(resGet.status).toBe(404);
    });
  });

  // ─── 6. Time Summary & Capacity Reporting ───────────────────────────────────
  describe('6. Time Summary & Capacity Reporting', () => {
    beforeAll(async () => {
      // Log some fresh entries in Team A for summary
      await request(app)
        .post(`/tasks/${taskA1.id}/time/log`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ durationMinutes: 60, isBillable: true });

      await request(app)
        .post(`/tasks/${taskA2.id}/time/log`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ durationMinutes: 30, isBillable: false });
    });

    it('generates aggregated time summary across projects and team members', async () => {
      const res = await request(app)
        .get('/time/summary')
        .query({ range: 'this_week' })
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.totalMinutes).toBeGreaterThanOrEqual(90);
      expect(res.body.summary.billableMinutes).toBeGreaterThanOrEqual(60);
      expect(res.body.summary.nonBillableMinutes).toBeGreaterThanOrEqual(30);
      expect(Array.isArray(res.body.byProject)).toBe(true);
      expect(Array.isArray(res.body.byUser)).toBe(true);
    });
  });
});

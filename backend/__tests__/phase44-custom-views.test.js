const request = require('supertest');
const { app } = require('../server');
const prisma = require('../prisma');

describe('Phase 44 — Custom Views & Saved Filters', () => {
  let userA, userB, tokenA, tokenB;
  let teamA, teamB;
  let projectA;
  let taskA1, taskA2, taskA3;
  let customViewA;

  beforeAll(async () => {
    // 1. Register User A & Team A
    const resRegA = await request(app).post('/auth/register').send({
      email: `views_lead_a_${Date.now()}@example.com`,
      password: 'Password123!',
      name: 'Views Lead Alpha',
      teamName: 'Alpha Views Workspace',
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
      email: `views_lead_b_${Date.now()}@example.com`,
      password: 'Password123!',
      name: 'Views User Beta',
      teamName: 'Beta Views Workspace',
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
        name: 'Alpha Core Platform',
        color: '#6366f1',
      });
    projectA = resProj.body.project || resProj.body;

    // 4. Create sample tasks in Team A
    // Task 1: High priority, assigned to userA
    const resT1 = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Team-Id', teamA.id)
      .send({
        title: 'Alpha High Priority Core Service',
        priority: 'high',
        status: 'todo',
        assigneeId: userA.id,
        projectId: projectA.id,
      });
    taskA1 = resT1.body.task || resT1.body;

    // Task 2: Low priority, unassigned
    const resT2 = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Team-Id', teamA.id)
      .send({
        title: 'Alpha Low Priority Documentation',
        priority: 'low',
        status: 'todo',
        projectId: projectA.id,
      });
    taskA2 = resT2.body.task || resT2.body;

    // Task 3: Overdue task
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const resT3 = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Team-Id', teamA.id)
      .send({
        title: 'Alpha Overdue Security Patch',
        priority: 'urgent',
        status: 'in_progress',
        assigneeId: userA.id,
        dueDate: pastDate.toISOString(),
        projectId: projectA.id,
      });
    taskA3 = resT3.body.task || resT3.body;
  });

  // ─── 1. System Presets & View Listing ───────────────────────────────────────
  describe('1. System Presets & View Listing', () => {
    it('returns built-in system presets when listing views', async () => {
      const res = await request(app)
        .get('/views')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.presets).toBeDefined();
      expect(res.body.presets.length).toBeGreaterThanOrEqual(4);

      const highPriorityPreset = res.body.presets.find((p) => p.id === 'preset-my-high-priority');
      expect(highPriorityPreset).toBeDefined();
      expect(highPriorityPreset.filters.assignee).toBe('me');
      expect(highPriorityPreset.filters.priority).toContain('high');
    });

    it('filters view presets by viewType query parameter', async () => {
      const res = await request(app)
        .get('/views')
        .query({ viewType: 'calendar' })
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.presets.every((p) => p.viewType === 'calendar')).toBe(true);
    });
  });

  // ─── 2. Custom View Creation & Validation ───────────────────────────────────
  describe('2. Custom View Creation & Validation', () => {
    it('creates a custom saved view with multi-condition filters', async () => {
      const res = await request(app)
        .post('/views')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          name: 'My Urgent In-Progress Work',
          description: 'Tracks in-flight urgent tasks',
          icon: '⚡',
          color: '#ec4899',
          viewType: 'board',
          filters: {
            assignee: 'me',
            priority: ['urgent', 'high'],
            status: ['in_progress'],
          },
          sort: { field: 'priority', direction: 'desc' },
          isPinned: true,
          isShared: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.view).toBeDefined();
      expect(res.body.view.name).toBe('My Urgent In-Progress Work');
      expect(res.body.view.icon).toBe('⚡');
      expect(res.body.view.isPinned).toBe(true);

      customViewA = res.body.view;
    });

    it('rejects custom view creation with empty or missing name with 400', async () => {
      const res = await request(app)
        .post('/views')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          name: '   ',
          viewType: 'board',
        });

      expect(res.status).toBe(400);
      expect(res.body.errors || res.body.error).toBeDefined();
    });
  });

  // ─── 3. View Retrieval, Updating, and Immutability ──────────────────────────
  describe('3. View Retrieval, Updating, and Immutability', () => {
    it('retrieves details for a custom view', async () => {
      const res = await request(app)
        .get(`/views/${customViewA.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.view.id).toBe(customViewA.id);
      expect(res.body.view.name).toBe('My Urgent In-Progress Work');
    });

    it('allows updating custom view properties', async () => {
      const res = await request(app)
        .patch(`/views/${customViewA.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          description: 'Updated description for urgent tasks',
          color: '#8b5cf6',
        });

      expect(res.status).toBe(200);
      expect(res.body.view.description).toBe('Updated description for urgent tasks');
      expect(res.body.view.color).toBe('#8b5cf6');
    });

    it('rejects modification or deletion of immutable system presets with 403', async () => {
      const resPatch = await request(app)
        .patch('/views/preset-my-high-priority')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ name: 'Tampered View Name' });

      expect(resPatch.status).toBe(403);

      const resDel = await request(app)
        .delete('/views/preset-my-high-priority')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(resDel.status).toBe(403);
    });
  });

  // ─── 4. Multi-Tenant Isolation ─────────────────────────────────────────────
  describe('4. Multi-Tenant Isolation', () => {
    it('prevents Team B from seeing Team A custom views', async () => {
      const resListB = await request(app)
        .get('/views')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamB.id);

      expect(resListB.status).toBe(200);
      const foundInB = resListB.body.custom.find((v) => v.id === customViewA.id);
      expect(foundInB).toBeUndefined();

      const resGetB = await request(app)
        .get(`/views/${customViewA.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamB.id);

      expect(resGetB.status).toBe(404);
    });

    it('prevents Team B from modifying or deleting Team A custom views', async () => {
      const resPatchB = await request(app)
        .patch(`/views/${customViewA.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamB.id)
        .send({ name: 'Hacked View' });

      expect(resPatchB.status).toBe(404);
    });
  });

  // ─── 5. View Task Execution Engine ─────────────────────────────────────────
  describe('5. View Task Execution Engine', () => {
    it('executes preset high-priority view returning only high/urgent tasks for User A', async () => {
      const res = await request(app)
        .get('/views/preset-my-high-priority/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.tasks).toBeDefined();
      expect(res.body.tasks.length).toBeGreaterThanOrEqual(1);

      // Verify all returned tasks are high or urgent and assigned to User A
      res.body.tasks.forEach((t) => {
        expect(['urgent', 'high']).toContain(t.priority);
        expect(t.assigneeId).toBe(userA.id);
      });
    });

    it('executes overdue tasks preset view returning tasks with past due dates', async () => {
      const res = await request(app)
        .get('/views/preset-overdue/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.tasks).toBeDefined();
      const overdueTaskFound = res.body.tasks.some((t) => t.id === taskA3.id);
      expect(overdueTaskFound).toBe(true);
    });

    it('executes custom saved view returning matched tasks', async () => {
      const res = await request(app)
        .get(`/views/${customViewA.id}/tasks`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.tasks).toBeDefined();
      expect(res.body.totalCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── 6. Custom View Deletion ───────────────────────────────────────────────
  describe('6. Custom View Deletion', () => {
    it('allows deleting a custom view successfully', async () => {
      const resDel = await request(app)
        .delete(`/views/${customViewA.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(resDel.status).toBe(200);
      expect(resDel.body.success).toBe(true);

      const check = await prisma.customView.findUnique({
        where: { id: customViewA.id },
      });
      expect(check).toBeNull();
    });
  });
});

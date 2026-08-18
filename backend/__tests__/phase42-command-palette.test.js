const request = require('supertest');
const { app } = require('../server');
const prisma = require('../prisma');

describe('Phase 42 — Universal Command Palette (Cmd+K / Ctrl+K)', () => {
  let userA, userB, tokenA, tokenB;
  let teamA, teamB;
  let projectA, projectB;
  let taskA1, taskA2;

  beforeAll(async () => {
    // 1. Create User A and Team A
    const resRegA = await request(app).post('/auth/register').send({
      email: `palette_user_a_${Date.now()}@example.com`,
      password: 'Password123!',
      name: 'Command Palette Lead',
      teamName: 'Alpha Command Workspace',
    });
    userA = resRegA.body.user;
    tokenA = resRegA.body.token;

    const membershipA = await prisma.teamMembership.findFirst({
      where: { userId: userA.id },
      include: { team: true },
    });
    teamA = membershipA.team;

    // 2. Create User B (different tenant)
    const resRegB = await request(app).post('/auth/register').send({
      email: `palette_user_b_${Date.now()}@example.com`,
      password: 'Password123!',
      name: 'Tenant Beta User',
      teamName: 'Beta Private Workspace',
    });
    userB = resRegB.body.user;
    tokenB = resRegB.body.token;

    const membershipB = await prisma.teamMembership.findFirst({
      where: { userId: userB.id },
      include: { team: true },
    });
    teamB = membershipB.team;

    // 3. Create Project in Team A
    const resProjA = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Team-Id', teamA.id)
      .send({
        name: 'Mobile App Redesign',
        description: 'Complete UI overhaul for iOS and Android',
        color: '#6366f1',
        icon: '📱',
      });
    projectA = resProjA.body.project || resProjA.body;

    // 4. Create Project in Team B
    const resProjB = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('X-Team-Id', teamB.id)
      .send({
        name: 'Confidential Beta Engine',
        description: 'Private backend architecture',
        color: '#ef4444',
        icon: '🔒',
      });
    projectB = resProjB.body.project || resProjB.body;

    // 5. Create Tasks in Team A
    const resTask1 = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Team-Id', teamA.id)
      .send({
        title: 'Design high-converting checkout landing page',
        description: 'Figma mockups and responsive tokens',
        status: 'todo',
        priority: 'high',
        projectId: projectA.id,
      });
    taskA1 = resTask1.body.task || resTask1.body;

    const resTask2 = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Team-Id', teamA.id)
      .send({
        title: 'Setup Kubernetes ingress controller and cert-manager',
        description: 'TLS encryption for production cluster',
        status: 'in_progress',
        priority: 'urgent',
        projectId: projectA.id,
      });
    taskA2 = resTask2.body.task || resTask2.body;
  });

  // ─── 1. Instant Search Mechanics for Command Palette ───────────────────────
  describe('1. Instant Search Mechanics for Command Palette', () => {
    it('executes rapid debounced searches returning matching tasks for palette list', async () => {
      const res = await request(app)
        .get('/search')
        .query({ q: 'checkout', limit: 6 })
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      const results = Array.isArray(res.body) ? res.body : res.body.tasks || res.body.results;
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].title).toContain('checkout');
    });

    it('enforces limit parameter for fast command palette dropdown rendering', async () => {
      const res = await request(app)
        .get('/search')
        .query({ q: 'a', limit: 2 })
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      const results = Array.isArray(res.body) ? res.body : res.body.tasks || res.body.results;
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('fetches team projects with colors and icons for Command Palette project group', async () => {
      const res = await request(app)
        .get('/projects')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      const projectsList = Array.isArray(res.body) ? res.body : res.body.projects;
      expect(projectsList.length).toBeGreaterThanOrEqual(1);
      const found = projectsList.find((p) => p.id === projectA.id);
      expect(found).toBeDefined();
      expect(found.name).toBe('Mobile App Redesign');
      expect(found.icon).toBe('📱');
    });
  });

  // ─── 2. Multi-Tenant Isolation in Command Palette Search ───────────────────
  describe('2. Multi-Tenant Isolation in Command Palette Search', () => {
    it('prevents Team A search from revealing Team B confidential projects or tasks', async () => {
      const res = await request(app)
        .get('/search')
        .query({ q: 'Confidential Beta Engine' })
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      const results = Array.isArray(res.body) ? res.body : res.body.tasks || res.body.results;
      expect(results.length).toBe(0);
    });

    it('prevents Team B from fetching Team A projects in Command Palette project list', async () => {
      const res = await request(app)
        .get('/projects')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamB.id);

      expect(res.status).toBe(200);
      const projectsList = Array.isArray(res.body) ? res.body : res.body.projects;
      const leaked = projectsList.find((p) => p.id === projectA.id);
      expect(leaked).toBeUndefined();
    });
  });

  // ─── 3. Role & Permission Aware Command Action Protection ──────────────────
  describe('3. Role & Permission Aware Command Action Protection', () => {
    let regularMemberToken;

    beforeAll(async () => {
      // Register regular team member in Team A
      const resRegMember = await request(app).post('/auth/register').send({
        email: `regular_member_${Date.now()}@example.com`,
        password: 'Password123!',
        name: 'Regular Developer',
      });
      regularMemberToken = resRegMember.body.token;

      // Add as regular member in Team A
      await prisma.teamMembership.create({
        data: {
          teamId: teamA.id,
          userId: resRegMember.body.user.id,
          role: 'member',
        },
      });
    });

    it('allows workspace owner to execute administrative actions (e.g. create API key)', async () => {
      const res = await request(app)
        .post('/developer/api-keys')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          name: 'Command Palette Automation Key',
          scopes: ['read:tasks', 'write:tasks'],
        });

      expect([200, 201]).toContain(res.status);
    });

    it('blocks regular member from executing admin-only actions with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/developer/api-keys')
        .set('Authorization', `Bearer ${regularMemberToken}`)
        .set('X-Team-Id', teamA.id)
        .send({
          name: 'Unauthorized Key',
          scopes: ['read:tasks'],
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/forbidden|permission|admin|owner/i);
    });
  });

  // ─── 4. Adversarial Break-and-Fix Testing (Attacks & Edge Cases) ───────────
  describe('4. Adversarial Break-and-Fix Testing', () => {
    it('handles search queries containing regex special characters safely', async () => {
      const specialQuery = '.*+?^${}()|[]\\';
      const res = await request(app)
        .get('/search')
        .query({ q: specialQuery })
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      const results = Array.isArray(res.body) ? res.body : res.body.tasks || res.body.results;
      expect(Array.isArray(results)).toBe(true);
    });

    it('handles unicode and emoji search queries gracefully', async () => {
      const res = await request(app)
        .get('/search')
        .query({ q: '📱 🚀 💻' })
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      const results = Array.isArray(res.body) ? res.body : res.body.tasks || res.body.results;
      expect(Array.isArray(results)).toBe(true);
    });

    it('handles empty query strings cleanly with empty or default result list', async () => {
      const res = await request(app)
        .get('/search')
        .query({ q: '' })
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      const results = Array.isArray(res.body) ? res.body : res.body.tasks || res.body.results;
      expect(Array.isArray(results)).toBe(true);
    });

    it('handles excessively long search strings without memory spikes or errors', async () => {
      const longQuery = 'a'.repeat(500);
      const res = await request(app)
        .get('/search')
        .query({ q: longQuery })
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      const results = Array.isArray(res.body) ? res.body : res.body.tasks || res.body.results;
      expect(Array.isArray(results)).toBe(true);
    });
  });
});

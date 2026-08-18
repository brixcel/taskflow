const request = require('supertest');
const { app } = require('../server');
const prisma = require('../prisma');

describe('Phase 43 — Task Templates & Workflow Automation', () => {
  let userA, userB, tokenA, tokenB;
  let teamA, teamB;
  let projectA;
  let customTemplateA;

  beforeAll(async () => {
    // 1. Register User A & Team A
    const resRegA = await request(app).post('/auth/register').send({
      email: `template_lead_a_${Date.now()}@example.com`,
      password: 'Password123!',
      name: 'Template Lead Alpha',
      teamName: 'Alpha Workflow Org',
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
      email: `template_lead_b_${Date.now()}@example.com`,
      password: 'Password123!',
      name: 'Beta User',
      teamName: 'Beta Workspace',
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
        name: 'Core Platform Engineering',
        color: '#6366f1',
      });
    projectA = resProj.body.project || resProj.body;
  });

  // ─── 1. System Presets & Template Listing ──────────────────────────────────
  describe('1. System Presets & Template Listing', () => {
    it('returns built-in system presets when listing templates', async () => {
      const res = await request(app)
        .get('/task-templates')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.presets).toBeDefined();
      expect(res.body.presets.length).toBeGreaterThanOrEqual(4);

      const bugPreset = res.body.presets.find((p) => p.id === 'preset-software-bug');
      expect(bugPreset).toBeDefined();
      expect(bugPreset.name).toContain('Software Bug');
      expect(bugPreset.subtasks.length).toBe(5);
      expect(bugPreset.automationRules.autoDueDays).toBe(2);
    });

    it('filters templates by category query parameter', async () => {
      const res = await request(app)
        .get('/task-templates')
        .query({ category: 'Engineering' })
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.presets.every((p) => p.category.toLowerCase() === 'engineering')).toBe(true);
    });
  });

  // ─── 2. Custom Template Creation & Validation ──────────────────────────────
  describe('2. Custom Template Creation & Validation', () => {
    it('creates a custom team workflow template with automated subtasks and rules', async () => {
      const res = await request(app)
        .post('/task-templates')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          name: 'Mobile Release Checklist',
          description: 'Step-by-step verification before submitting iOS/Android builds',
          category: 'Engineering',
          defaultPriority: 'urgent',
          defaultLabels: ['mobile', 'release'],
          subtasks: [
            { title: 'Bump build version numbers in app.json', estimatedHours: 0.5 },
            { title: 'Generate signed release bundle APK & IPA', estimatedHours: 1 },
            { title: 'Smoke test on physical device', estimatedHours: 2 },
            { title: 'Submit build to TestFlight and Google Play Console', estimatedHours: 1 },
          ],
          automationRules: {
            autoDueDays: 1,
            defaultStatus: 'todo',
            autoAssignToCreator: true,
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.template).toBeDefined();
      expect(res.body.template.name).toBe('Mobile Release Checklist');
      expect(res.body.template.subtasks.length).toBe(4);
      expect(res.body.template.usageCount).toBe(0);

      customTemplateA = res.body.template;
    });

    it('rejects template creation with missing or empty name with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/task-templates')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          name: '   ',
          category: 'Engineering',
        });

      expect(res.status).toBe(400);
      expect(res.body.errors || res.body.error).toBeDefined();
    });
  });

  // ─── 3. Template Retrieval, Updating, and Immutability ─────────────────────
  describe('3. Template Retrieval, Updating, and Immutability', () => {
    it('retrieves details for a custom team template', async () => {
      const res = await request(app)
        .get(`/task-templates/${customTemplateA.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.template.id).toBe(customTemplateA.id);
      expect(res.body.template.name).toBe('Mobile Release Checklist');
    });

    it('allows updating custom template fields', async () => {
      const res = await request(app)
        .put(`/task-templates/${customTemplateA.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          description: 'Updated release description for iOS & Android apps',
          defaultPriority: 'high',
        });

      expect(res.status).toBe(200);
      expect(res.body.template.description).toBe('Updated release description for iOS & Android apps');
      expect(res.body.template.defaultPriority).toBe('high');
    });

    it('rejects attempts to modify or delete immutable system presets with 403', async () => {
      const resPut = await request(app)
        .put('/task-templates/preset-software-bug')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ name: 'Tampered Preset Name' });

      expect(resPut.status).toBe(403);

      const resDel = await request(app)
        .delete('/task-templates/preset-software-bug')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(resDel.status).toBe(403);
    });
  });

  // ─── 4. Multi-Tenant Template Isolation ────────────────────────────────────
  describe('4. Multi-Tenant Template Isolation', () => {
    it('prevents Team B from viewing Team A custom templates', async () => {
      const resListB = await request(app)
        .get('/task-templates')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamB.id);

      expect(resListB.status).toBe(200);
      const foundInB = resListB.body.custom.find((t) => t.id === customTemplateA.id);
      expect(foundInB).toBeUndefined();

      const resGetB = await request(app)
        .get(`/task-templates/${customTemplateA.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamB.id);

      expect(resGetB.status).toBe(404);
    });

    it('prevents Team B from updating or deleting Team A custom templates', async () => {
      const resPutB = await request(app)
        .put(`/task-templates/${customTemplateA.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamB.id)
        .send({ name: 'Hacked Template' });

      expect(resPutB.status).toBe(404);
    });
  });

  // ─── 5. Template Application & Workflow Execution ──────────────────────────
  describe('5. Template Application & Workflow Execution', () => {
    it('applies a built-in system preset creating task and subtasks transactionally', async () => {
      const res = await request(app)
        .post('/task-templates/preset-software-bug/apply')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          projectId: projectA.id,
          title: 'CRITICAL: Auth token expiration loop on Safari',
        });

      expect(res.status).toBe(201);
      expect(res.body.task).toBeDefined();
      expect(res.body.task.title).toBe('CRITICAL: Auth token expiration loop on Safari');
      expect(res.body.task.priority).toBe('high');
      expect(res.body.task.projectId).toBe(projectA.id);
      expect(res.body.task.assigneeId).toBe(userA.id); // autoAssignToCreator
      expect(res.body.task.dueDate).toBeDefined(); // autoDueDays: 2

      expect(res.body.subtasks).toBeDefined();
      expect(res.body.subtasks.length).toBe(5);
      expect(res.body.subtasks[0].title).toContain('Reproduce bug');

      // Verify activity recorded
      const activity = await prisma.activity.findFirst({
        where: { taskId: res.body.task.id },
      });
      expect(activity).toBeDefined();
      expect(activity.action).toBe('created_from_template');
    });

    it('applies a custom team template and increments template usage count', async () => {
      const res = await request(app)
        .post(`/task-templates/${customTemplateA.id}/apply`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          projectId: projectA.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.task.title).toBe('Mobile Release Checklist');
      expect(res.body.subtasks.length).toBe(4);

      // Verify usage count incremented in DB
      const updatedTemplate = await prisma.taskTemplate.findUnique({
        where: { id: customTemplateA.id },
      });
      expect(updatedTemplate.usageCount).toBe(1);
    });

    it('prevents applying template to a project owned by a different team with 404', async () => {
      // Create project in Team B
      const resProjB = await request(app)
        .post('/projects')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamB.id)
        .send({ name: 'Team B Secret Project' });
      const projectB = resProjB.body.project || resProjB.body;

      const resApply = await request(app)
        .post('/task-templates/preset-feature-development/apply')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          projectId: projectB.id,
        });

      expect(resApply.status).toBe(404);
      expect(resApply.body.error).toContain('Target project not found');
    });
  });

  // ─── 6. Custom Template Deletion ───────────────────────────────────────────
  describe('6. Custom Template Deletion', () => {
    it('allows deleting a custom template successfully', async () => {
      const resDel = await request(app)
        .delete(`/task-templates/${customTemplateA.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(resDel.status).toBe(200);
      expect(resDel.body.success).toBe(true);

      const check = await prisma.taskTemplate.findUnique({
        where: { id: customTemplateA.id },
      });
      expect(check).toBeNull();
    });
  });
});

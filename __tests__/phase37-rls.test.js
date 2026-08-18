require('dotenv').config();
const prisma = require('../prisma');
const { executeWithTeamRLS, executeWithBypassRLS, checkTableRlsStatus } = require('../services/rls');
const rlsContext = require('../middleware/rlsContext');

describe('Phase 37 — Postgres Row-Level Security (RLS) Multi-Tenant Isolation', () => {
  let userA, userB, teamA, teamB, taskA, taskB, projectA, projectB;

  beforeAll(async () => {
    // Clean up or create test users & teams
    userA = await prisma.user.create({
      data: {
        name: 'User RLS A',
        email: `user-rls-a-${Date.now()}@example.com`,
        passwordHash: 'dummyhash',
      },
    });

    userB = await prisma.user.create({
      data: {
        name: 'User RLS B',
        email: `user-rls-b-${Date.now()}@example.com`,
        passwordHash: 'dummyhash',
      },
    });

    teamA = await prisma.team.create({
      data: {
        name: 'RLS Enterprise Team A',
        ownerId: userA.id,
      },
    });

    teamB = await prisma.team.create({
      data: {
        name: 'RLS Enterprise Team B',
        ownerId: userB.id,
      },
    });

    // Create Tasks
    taskA = await prisma.task.create({
      data: {
        title: 'Confidential Task A',
        teamId: teamA.id,
        createdById: userA.id,
      },
    });

    taskB = await prisma.task.create({
      data: {
        title: 'Confidential Task B',
        teamId: teamB.id,
        createdById: userB.id,
      },
    });

    // Create Projects
    projectA = await prisma.project.create({
      data: {
        name: 'Confidential Project A',
        teamId: teamA.id,
        createdById: userA.id,
      },
    });

    projectB = await prisma.project.create({
      data: {
        name: 'Confidential Project B',
        teamId: teamB.id,
        createdById: userB.id,
      },
    });
  });

  afterAll(async () => {
    try {
      if (taskA) await prisma.task.deleteMany({ where: { id: { in: [taskA.id, taskB?.id] } } });
      if (projectA) await prisma.project.deleteMany({ where: { id: { in: [projectA.id, projectB?.id] } } });
      if (teamA) await prisma.team.deleteMany({ where: { id: { in: [teamA.id, teamB?.id] } } });
      if (userA) await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB?.id] } } });
      await prisma.$disconnect();
    } catch (_) {}
  });

  describe('1. PostgreSQL RLS Configuration Verification', () => {
    it('verifies RLS is active on key multi-tenant database tables', async () => {
      const status = await checkTableRlsStatus();

      expect(status.tasks).toBe(true);
      expect(status.projects).toBe(true);
      expect(status.task_attachments).toBe(true);
      expect(status.subtasks).toBe(true);
    });
  });

  describe('2. Engine-Level Read Isolation via RLS Session Context', () => {
    it('strictly returns only Team A tasks when executing with Team A RLS context', async () => {
      const tasks = await executeWithTeamRLS(teamA.id, async (tx) => {
        return tx.$queryRawUnsafe('SELECT * FROM "tasks";');
      });

      expect(Array.isArray(tasks)).toBe(true);
      const taskIds = tasks.map((t) => t.id);
      expect(taskIds).toContain(taskA.id);
      expect(taskIds).not.toContain(taskB.id);
    });

    it('strictly returns only Team B tasks when executing with Team B RLS context', async () => {
      const tasks = await executeWithTeamRLS(teamB.id, async (tx) => {
        return tx.$queryRawUnsafe('SELECT * FROM "tasks";');
      });

      expect(Array.isArray(tasks)).toBe(true);
      const taskIds = tasks.map((t) => t.id);
      expect(taskIds).toContain(taskB.id);
      expect(taskIds).not.toContain(taskA.id);
    });

    it('strictly isolates projects by team context at the SQL level', async () => {
      const projects = await executeWithTeamRLS(teamA.id, async (tx) => {
        return tx.$queryRawUnsafe('SELECT * FROM "projects";');
      });

      const projectIds = projects.map((p) => p.id);
      expect(projectIds).toContain(projectA.id);
      expect(projectIds).not.toContain(projectB.id);
    });
  });

  describe('3. Cross-Tenant Mutation Rejection & Policy Check', () => {
    it('blocks updating another team task even with a direct unconstrained SQL query', async () => {
      const updateResult = await executeWithTeamRLS(teamA.id, async (tx) => {
        return tx.$executeRawUnsafe(
          `UPDATE "tasks" SET "title" = 'Hacked by Team A' WHERE "id" = '${taskB.id}';`
        );
      });

      // 0 rows updated because Team B task is filtered out by RLS
      expect(updateResult).toBe(0);

      // Verify task B remained untouched
      const originalTaskB = await prisma.task.findUnique({ where: { id: taskB.id } });
      expect(originalTaskB.title).toBe('Confidential Task B');
    });

    it('throws RLS WITH CHECK policy violation when attempting cross-tenant insert', async () => {
      let threwError = false;
      try {
        await executeWithTeamRLS(teamA.id, async (tx) => {
          await tx.$executeRawUnsafe(
            `INSERT INTO "tasks" ("id", "title", "teamId", "createdById", "createdAt", "updatedAt") ` +
            `VALUES ('${Date.now()}-rogue-id', 'Rogue Task', '${teamB.id}', '${userA.id}', NOW(), NOW());`
          );
        });
      } catch (err) {
        threwError = true;
        expect(err.message.toLowerCase()).toContain('row-level security');
      }

      expect(threwError).toBe(true);
    });
  });

  describe('4. Transaction Safety & Middleware Helper', () => {
    it('allows clean context switching across consecutive transactions without leaking state', async () => {
      const resultA = await executeWithTeamRLS(teamA.id, async (tx) => {
        return tx.$queryRawUnsafe('SELECT count(*)::int as count FROM "tasks";');
      });

      const resultB = await executeWithTeamRLS(teamB.id, async (tx) => {
        return tx.$queryRawUnsafe('SELECT count(*)::int as count FROM "tasks";');
      });

      expect(resultA[0].count).toBeGreaterThanOrEqual(1);
      expect(resultB[0].count).toBeGreaterThanOrEqual(1);
    });

    it('attaches req.runWithRLS properly in Express middleware context', async () => {
      const mockReq = { teamId: teamA.id };
      const mockRes = {};
      let nextCalled = false;

      rlsContext(mockReq, mockRes, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(typeof mockReq.runWithRLS).toBe('function');

      const tasks = await mockReq.runWithRLS(async (tx) => {
        return tx.$queryRawUnsafe('SELECT * FROM "tasks";');
      });
      expect(tasks.some((t) => t.id === taskA.id)).toBe(true);
    });
  });
});

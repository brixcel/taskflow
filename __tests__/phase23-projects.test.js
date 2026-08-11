/**
 * Phase 23 — Projects / Workspaces Test Suite
 *
 * Tests:
 * - Project CRUD operations (create, read, update, delete, archive)
 * - Multi-tenant isolation & cross-team access protection
 * - Role permissions & RBAC authorization
 * - Task-project association and cross-team project assignment prevention
 * - Project stats & progress % computation
 * - Filtering tasks by project (and unassigned)
 * - Project member management (lead, member, viewer)
 * - Deletion modes (detach tasks vs cascade delete)
 * - Input validation edge cases
 */

const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

const authRoutes    = require('../routes/auth');
const taskRoutes    = require('../routes/tasks');
const teamRoutes    = require('../routes/teams');
const projectRoutes = require('../routes/projects');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth',                   authRoutes);
  app.use('/tasks',                  taskRoutes);
  app.use('/teams',                  teamRoutes);
  app.use('/teams/:teamId/projects', projectRoutes);
  app.use('/projects',               projectRoutes);
  return app;
}

let app;
let userA, userB, userC, userOtherTeam;
let tokenA, tokenB, tokenC, tokenOtherTeam;
let teamA, teamB;

function makeToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

beforeAll(async () => {
  app = createTestApp();

  // Teardown previous test data
  await prisma.notification.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.subtask.deleteMany({});
  await prisma.taskWatcher.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.projectMember.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          'p23_usera@test.com',
          'p23_userb@test.com',
          'p23_userc@test.com',
          'p23_userother@test.com',
        ],
      },
    },
  });

  const passwordHash = await bcrypt.hash('Password123!', 8);

  userA = await prisma.user.create({
    data: { name: 'Alice Owner', email: 'p23_usera@test.com', passwordHash, emailVerified: true },
  });
  userB = await prisma.user.create({
    data: { name: 'Bob Admin', email: 'p23_userb@test.com', passwordHash, emailVerified: true },
  });
  userC = await prisma.user.create({
    data: { name: 'Charlie Member', email: 'p23_userc@test.com', passwordHash, emailVerified: true },
  });
  userOtherTeam = await prisma.user.create({
    data: { name: 'Dave Outside', email: 'p23_userother@test.com', passwordHash, emailVerified: true },
  });

  tokenA = makeToken(userA);
  tokenB = makeToken(userB);
  tokenC = makeToken(userC);
  tokenOtherTeam = makeToken(userOtherTeam);

  // Setup Team A
  teamA = await prisma.team.create({
    data: { name: 'Team Alpha', ownerId: userA.id },
  });
  await prisma.teamMembership.createMany({
    data: [
      { userId: userA.id, teamId: teamA.id, role: 'owner' },
      { userId: userB.id, teamId: teamA.id, role: 'admin' },
      { userId: userC.id, teamId: teamA.id, role: 'member' },
    ],
  });

  // Setup Team B (isolated)
  teamB = await prisma.team.create({
    data: { name: 'Team Beta', ownerId: userOtherTeam.id },
  });
  await prisma.teamMembership.create({
    data: { userId: userOtherTeam.id, teamId: teamB.id, role: 'owner' },
  });
});

afterAll(async () => {
  await prisma.notification.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.projectMember.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          'p23_usera@test.com',
          'p23_userb@test.com',
          'p23_userc@test.com',
          'p23_userother@test.com',
        ],
      },
    },
  });
  await prisma.$disconnect();
});

describe('Phase 23 — Projects / Workspaces', () => {
  let project1Id, project2Id;

  describe('1. Project Creation & Validation', () => {
    it('creates a project with full metadata under team', async () => {
      const res = await request(app)
        .post('/projects')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          name: 'Core Platform v2',
          description: 'Next-gen SaaS platform upgrade',
          icon: '🚀',
          color: '#3b82f6',
          status: 'in_progress',
          startDate: '2026-09-01T00:00:00.000Z',
          targetDate: '2026-12-31T00:00:00.000Z',
          memberIds: [userB.id],
        });

      expect(res.status).toBe(201);
      expect(res.body.project).toBeDefined();
      expect(res.body.project.name).toBe('Core Platform v2');
      expect(res.body.project.icon).toBe('🚀');
      expect(res.body.project.color).toBe('#3b82f6');
      expect(res.body.project.status).toBe('in_progress');
      expect(res.body.project.createdById).toBe(userA.id);
      expect(res.body.project.teamId).toBe(teamA.id);

      // Verify creator is lead + userB is member
      expect(res.body.project.members.length).toBe(2);
      const lead = res.body.project.members.find((m) => m.userId === userA.id);
      expect(lead.role).toBe('lead');

      project1Id = res.body.project.id;
    });

    it('creates a second project with minimal required fields', async () => {
      const res = await request(app)
        .post(`/teams/${teamA.id}/projects`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          name: 'Mobile App Redesign',
        });

      expect(res.status).toBe(201);
      expect(res.body.project.name).toBe('Mobile App Redesign');
      expect(res.body.project.icon).toBe('📁');
      expect(res.body.project.color).toBe('#6366f1');
      expect(res.body.project.status).toBe('active');
      expect(res.body.project.createdById).toBe(userB.id);

      project2Id = res.body.project.id;
    });

    it('rejects project creation with blank or whitespace-only name', async () => {
      const res = await request(app)
        .post('/projects')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({ name: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.errors || res.body.error).toBeDefined();
    });

    it('rejects project creation with memberIds from another team', async () => {
      const res = await request(app)
        .post('/projects')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          name: 'Invalid Team Cross Project',
          memberIds: [userOtherTeam.id], // User belongs to Team B, not Team A
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/do not belong to this team/i);
    });
  });

  describe('2. Project Listing & Filtering', () => {
    it('lists all active projects for the team with computed stats', async () => {
      const res = await request(app)
        .get('/projects')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.projects).toBeInstanceOf(Array);
      expect(res.body.projects.length).toBeGreaterThanOrEqual(2);

      const p1 = res.body.projects.find((p) => p.id === project1Id);
      expect(p1).toBeDefined();
      expect(p1.stats).toBeDefined();
      expect(p1.stats.totalTasks).toBe(0);
      expect(p1.stats.progress).toBe(0);
    });

    it('filters projects by status', async () => {
      const res = await request(app)
        .get('/projects?status=in_progress')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.projects.every((p) => p.status === 'in_progress')).toBe(true);
      expect(res.body.projects.some((p) => p.id === project1Id)).toBe(true);
    });

    it('filters projects by search term', async () => {
      const res = await request(app)
        .get('/projects?search=Mobile')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.projects.length).toBe(1);
      expect(res.body.projects[0].name).toBe('Mobile App Redesign');
    });
  });

  describe('3. Task Association with Projects', () => {
    let task1Id, task2Id;

    it('creates tasks assigned to a project', async () => {
      const res1 = await request(app)
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          title: 'Design system tokens',
          status: 'done',
          priority: 'high',
          projectId: project1Id,
        });

      expect(res1.status).toBe(201);
      expect(res1.body.task.projectId).toBe(project1Id);
      expect(res1.body.task.project).toBeDefined();
      expect(res1.body.task.project.name).toBe('Core Platform v2');
      task1Id = res1.body.task.id;

      const res2 = await request(app)
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          title: 'Implement database schema',
          status: 'in_progress',
          priority: 'urgent',
          projectId: project1Id,
        });

      expect(res2.status).toBe(201);
      task2Id = res2.body.task.id;
    });

    it('rejects assigning task to a project from a different team', async () => {
      // Create project in Team B
      const projectB = await prisma.project.create({
        data: {
          name: 'Team Beta Secret Project',
          teamId: teamB.id,
          createdById: userOtherTeam.id,
        },
      });

      // Attempt to assign task in Team A to project in Team B
      const res = await request(app)
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          title: 'Cross-tenant task attempt',
          projectId: projectB.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Project not found in this team/i);
    });

    it('filters tasks by project id', async () => {
      const res = await request(app)
        .get(`/tasks?projectId=${project1Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.tasks.length).toBe(2);
      expect(res.body.tasks.every((t) => t.projectId === project1Id)).toBe(true);
    });

    it('calculates project progress and statistics correctly after task changes', async () => {
      const res = await request(app)
        .get(`/projects/${project1Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.project.stats.totalTasks).toBe(2);
      expect(res.body.project.stats.completedTasks).toBe(1);
      expect(res.body.project.stats.inProgressTasks).toBe(1);
      expect(res.body.project.stats.progress).toBe(50); // 1 done out of 2 = 50%
      expect(res.body.project.stats.priorityBreakdown.high).toBe(1);
      expect(res.body.project.stats.priorityBreakdown.urgent).toBe(1);
    });

    it('fetches deep project statistics via /stats endpoint', async () => {
      const res = await request(app)
        .get(`/projects/${project1Id}/stats`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.stats).toBeDefined();
      expect(res.body.stats.totalTasks).toBe(2);
      expect(res.body.stats.progress).toBe(50);
      expect(res.body.stats.statusCounts.done).toBe(1);
      expect(res.body.stats.statusCounts.in_progress).toBe(1);
    });
  });

  describe('4. Project Updating & Archiving', () => {
    it('updates project details and archives project', async () => {
      const res = await request(app)
        .patch(`/projects/${project1Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          name: 'Core Platform v2.1',
          color: '#10b981',
          status: 'completed',
          isArchived: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.project.name).toBe('Core Platform v2.1');
      expect(res.body.project.color).toBe('#10b981');
      expect(res.body.project.status).toBe('completed');
      expect(res.body.project.isArchived).toBe(true);
    });

    it('excludes archived projects by default in GET /projects', async () => {
      const res = await request(app)
        .get('/projects')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.projects.some((p) => p.id === project1Id)).toBe(false);
      expect(res.body.projects.some((p) => p.id === project2Id)).toBe(true);
    });

    it('includes archived projects when ?archived=true', async () => {
      const res = await request(app)
        .get('/projects?archived=true')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.projects.some((p) => p.id === project1Id)).toBe(true);
    });
  });

  describe('5. Project Member Management', () => {
    it('adds a team member to a project with a specific role', async () => {
      const res = await request(app)
        .post(`/projects/${project2Id}/members`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamA.id)
        .send({
          userId: userC.id,
          role: 'viewer',
        });

      expect(res.status).toBe(201);
      expect(res.body.member.userId).toBe(userC.id);
      expect(res.body.member.role).toBe('viewer');
      expect(res.body.member.user.name).toBe('Charlie Member');
    });

    it('removes a member from a project', async () => {
      const res = await request(app)
        .delete(`/projects/${project2Id}/members/${userC.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const check = await prisma.projectMember.findFirst({
        where: { projectId: project2Id, userId: userC.id },
      });
      expect(check).toBeNull();
    });
  });

  describe('6. Multi-Tenant Security & Isolation', () => {
    it('prevents user in Team B from accessing projects in Team A', async () => {
      const res = await request(app)
        .get(`/projects/${project2Id}`)
        .set('Authorization', `Bearer ${tokenOtherTeam}`)
        .set('X-Team-Id', teamB.id);

      expect(res.status).toBe(404);
    });

    it('prevents user in Team B from updating or deleting Team A projects', async () => {
      const res = await request(app)
        .patch(`/projects/${project2Id}`)
        .set('Authorization', `Bearer ${tokenOtherTeam}`)
        .set('X-Team-Id', teamB.id)
        .send({ name: 'Hacked Project Name' });

      expect(res.status).toBe(404);
    });

    it('prevents regular member without lead/admin permissions from deleting a project', async () => {
      // User C is a regular member and not creator/lead of project2
      const res = await request(app)
        .delete(`/projects/${project2Id}`)
        .set('Authorization', `Bearer ${tokenC}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/do not have permission/i);
    });
  });

  describe('7. Project Deletion & Task Handling', () => {
    it('deletes project and disassociates tasks (sets projectId = null) by default', async () => {
      // Create project with task
      const p = await prisma.project.create({
        data: {
          name: 'Project to Delete',
          teamId: teamA.id,
          createdById: userA.id,
        },
      });

      const t = await prisma.task.create({
        data: {
          title: 'Preserved Task',
          teamId: teamA.id,
          createdById: userA.id,
          projectId: p.id,
        },
      });

      const res = await request(app)
        .delete(`/projects/${p.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);

      // Verify project is deleted
      const checkProject = await prisma.project.findUnique({ where: { id: p.id } });
      expect(checkProject).toBeNull();

      // Verify task still exists but projectId is null
      const checkTask = await prisma.task.findUnique({ where: { id: t.id } });
      expect(checkTask).not.toBeNull();
      expect(checkTask.projectId).toBeNull();
    });

    it('deletes project and cascades tasks when ?deleteTasks=true', async () => {
      const p = await prisma.project.create({
        data: {
          name: 'Project with Cascading Tasks',
          teamId: teamA.id,
          createdById: userA.id,
        },
      });

      const t = await prisma.task.create({
        data: {
          title: 'Task to be deleted along with project',
          teamId: teamA.id,
          createdById: userA.id,
          projectId: p.id,
        },
      });

      const res = await request(app)
        .delete(`/projects/${p.id}?deleteTasks=true`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);

      const checkTask = await prisma.task.findUnique({ where: { id: t.id } });
      expect(checkTask).toBeNull();
    });
  });
});

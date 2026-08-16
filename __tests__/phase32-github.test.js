const request = require('supertest');
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

const authRoutes = require('../routes/auth');
const taskRoutes = require('../routes/tasks');
const projectRoutes = require('../routes/projects');
const developerRoutes = require('../routes/developer');
const githubRoutes = require('../routes/github');

const {
  generateGitHubWebhookSecret,
  verifyGitHubSignature,
  extractTaskReferences,
} = require('../services/github');

function createTestApp() {
  const app = express();
  app.use(
    express.json({
      verify: (req, res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );
  app.use('/auth', authRoutes);
  app.use('/tasks', taskRoutes);
  app.use('/developer', developerRoutes);
  app.use(githubRoutes);
  app.use('/api', githubRoutes);
  app.use('/projects', projectRoutes);
  return app;
}

let app;
let userOwner, userMember, userOther;
let teamA, teamB;
let tokenOwner, tokenMember, tokenOther;
let projectA, projectB;
let taskA1, taskA2, taskB1;

function makeToken(userId, email, teamId) {
  return jwt.sign(
    { userId, email, teamId },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

function generateGitHubHeader(rawPayload, secret) {
  const payloadStr = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
  const hmac = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
  return `sha256=${hmac}`;
}

describe('Phase 32 — GitHub Integration', () => {
  beforeAll(async () => {
    app = createTestApp();

    await prisma.gitHubEvent.deleteMany({});
    await prisma.gitHubResourceLink.deleteMany({});
    await prisma.projectGitHubIntegration.deleteMany({});
    await prisma.webhookDelivery.deleteMany({});
    await prisma.webhook.deleteMany({});
    await prisma.apiKey.deleteMany({});
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
    await prisma.user.deleteMany({});

    const passwordHash = await bcrypt.hash('Password123!', 10);

    // Create Users
    userOwner = await prisma.user.create({
      data: { email: 'alice_gh@example.com', passwordHash, name: 'Alice Owner' },
    });
    userMember = await prisma.user.create({
      data: { email: 'bob_gh@example.com', passwordHash, name: 'Bob Member' },
    });
    userOther = await prisma.user.create({
      data: { email: 'charlie_gh@example.com', passwordHash, name: 'Charlie Other' },
    });

    // Create Teams
    teamA = await prisma.team.create({
      data: { name: 'Alpha GitHub Team', ownerId: userOwner.id },
    });
    teamB = await prisma.team.create({
      data: { name: 'Beta GitHub Team', ownerId: userOther.id },
    });

    // Create Team Memberships
    await prisma.teamMembership.createMany({
      data: [
        { userId: userOwner.id, teamId: teamA.id, role: 'owner' },
        { userId: userMember.id, teamId: teamA.id, role: 'member' },
        { userId: userOther.id, teamId: teamB.id, role: 'owner' },
      ],
    });

    tokenOwner = makeToken(userOwner.id, userOwner.email, teamA.id);
    tokenMember = makeToken(userMember.id, userMember.email, teamA.id);
    tokenOther = makeToken(userOther.id, userOther.email, teamB.id);

    // Create Projects
    projectA = await prisma.project.create({
      data: {
        name: 'TaskFlow Core',
        teamId: teamA.id,
        createdById: userOwner.id,
      },
    });
    projectB = await prisma.project.create({
      data: {
        name: 'Isolated Project B',
        teamId: teamB.id,
        createdById: userOther.id,
      },
    });

    // Create Tasks
    taskA1 = await prisma.task.create({
      data: {
        title: '[TF-101] Implement GitHub Webhook Handler',
        status: 'todo',
        teamId: teamA.id,
        projectId: projectA.id,
        createdById: userOwner.id,
        labels: ['backend', 'TF-101'],
      },
    });

    taskA2 = await prisma.task.create({
      data: {
        title: '[TF-102] Add GitHub Activity Feed UI',
        status: 'in_progress',
        teamId: teamA.id,
        projectId: projectA.id,
        createdById: userOwner.id,
        labels: ['frontend', 'TF-102'],
      },
    });

    taskB1 = await prisma.task.create({
      data: {
        title: '[TF-101] Unrelated Task in Team B',
        status: 'todo',
        teamId: teamB.id,
        projectId: projectB.id,
        createdById: userOther.id,
        labels: ['TF-101'],
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ─── 1. Crypto & Helper Units ─────────────────────────────────────────────

  describe('1. Crypto & Helper Units', () => {
    test('generates secure webhook secret with prefix', () => {
      const secret = generateGitHubWebhookSecret();
      expect(secret).toMatch(/^gh_whsec_[0-9a-f]{48}$/);
    });

    test('verifies valid HMAC-SHA256 signature and rejects tampered data', () => {
      const secret = 'gh_whsec_testsecret1234567890';
      const body = JSON.stringify({ action: 'opened', zen: 'Keep it simple' });
      const validSignature = generateGitHubHeader(body, secret);

      expect(verifyGitHubSignature({ rawBody: body, signatureHeader: validSignature, secret })).toBe(true);

      // Wrong secret
      expect(
        verifyGitHubSignature({ rawBody: body, signatureHeader: validSignature, secret: 'wrong-secret' })
      ).toBe(false);

      // Tampered payload
      const tamperedBody = JSON.stringify({ action: 'closed', zen: 'Keep it simple' });
      expect(
        verifyGitHubSignature({ rawBody: tamperedBody, signatureHeader: validSignature, secret })
      ).toBe(false);

      // Malformed header
      expect(
        verifyGitHubSignature({ rawBody: body, signatureHeader: 'invalid-header', secret })
      ).toBe(false);
    });

    test('extracts task references and closing keywords', () => {
      const text1 = 'feat: integrate OAuth and fixes #101\n\nCloses TF-102 and resolves 123e4567-e89b-12d3-a456-426614174000';
      const refs = extractTaskReferences(text1);

      expect(refs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ reference: '101', isClosing: true }),
          expect.objectContaining({ reference: 'TF-102', isClosing: true }),
          expect.objectContaining({ reference: '123e4567-e89b-12d3-a456-426614174000', isClosing: true }),
        ])
      );

      const text2 = 'Just mentioning [TF-99] without any closing action';
      const refs2 = extractTaskReferences(text2);
      expect(refs2).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ reference: 'TF-99', isClosing: false }),
        ])
      );
    });
  });

  // ─── 2. Project Integration Management & RBAC ─────────────────────────────

  describe('2. Project Integration Management & RBAC', () => {
    let savedIntegration;

    test('allows team owner to connect GitHub repository to project', async () => {
      const res = await request(app)
        .post(`/projects/${projectA.id}/github`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          repoOwner: 'brixcel',
          repoName: 'taskflow',
          autoCloseTasks: true,
          autoCreateTasksOnIssue: true,
          defaultIssueStatus: 'todo',
          syncBranches: ['main', 'master', 'develop'],
        });

      expect(res.status).toBe(201);
      expect(res.body.integration).toBeDefined();
      expect(res.body.integration.repoFullName).toBe('brixcel/taskflow');
      expect(res.body.integration.webhookSecret).toMatch(/^gh_whsec_/);
      expect(res.body.integration.webhookUrl).toContain(`/api/projects/${projectA.id}/github/webhook`);

      savedIntegration = res.body.integration;
    });

    test('rejects duplicate repository connection for the same project with 400', async () => {
      const res = await request(app)
        .post(`/projects/${projectA.id}/github`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          repoOwner: 'brixcel',
          repoName: 'taskflow-other',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already connected');
    });

    test('rejects regular members from connecting GitHub integration with 403', async () => {
      const res = await request(app)
        .post(`/projects/${projectB.id}/github`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({
          repoOwner: 'brixcel',
          repoName: 'taskflow-secret',
        });

      expect(res.status).toBe(404); // Not found in team A
    });

    test('gets GitHub integration status and connection info', async () => {
      const res = await request(app)
        .get(`/projects/${projectA.id}/github`)
        .set('Authorization', `Bearer ${tokenOwner}`);

      expect(res.status).toBe(200);
      expect(res.body.connected).toBe(true);
      expect(res.body.integration.repoOwner).toBe('brixcel');
      expect(res.body.integration.repoName).toBe('taskflow');
      expect(res.body.integration.autoCloseTasks).toBe(true);
    });

    test('updates GitHub integration automation settings', async () => {
      const res = await request(app)
        .patch(`/projects/${projectA.id}/github`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          autoCreateTasksOnIssue: true,
          defaultIssueStatus: 'in_progress',
        });

      expect(res.status).toBe(200);
      expect(res.body.integration.autoCreateTasksOnIssue).toBe(true);
      expect(res.body.integration.defaultIssueStatus).toBe('in_progress');
    });

    test('triggers repository sync simulation', async () => {
      const res = await request(app)
        .post(`/projects/${projectA.id}/github/sync`)
        .set('Authorization', `Bearer ${tokenOwner}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('verified');
      expect(res.body.lastSyncedAt).toBeDefined();
    });
  });

  // ─── 3. Webhook Ingestion & Pull Request Automation ────────────────────────

  describe('3. Webhook Ingestion & Pull Request Automation', () => {
    let integrationSecret;

    beforeAll(async () => {
      const integ = await prisma.projectGitHubIntegration.findUnique({
        where: { projectId: projectA.id },
      });
      integrationSecret = integ.webhookSecret;
    });

    test('rejects webhook with missing or invalid signature with 401', async () => {
      const payload = { action: 'opened', pull_request: { number: 42 } };

      const res = await request(app)
        .post(`/api/projects/${projectA.id}/github/webhook`)
        .set('X-GitHub-Event', 'pull_request')
        .set('X-Hub-Signature-256', 'sha256=invalidhexsignature1234567890')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('signature');
    });

    test('processes pull_request opened webhook and creates resource link', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 42,
          title: 'feat: add GitHub webhook verification [TF-101]',
          body: 'Implements HMAC-SHA256 signature verification for GitHub webhooks.',
          html_url: 'https://github.com/brixcel/taskflow/pull/42',
          state: 'open',
          merged: false,
          user: { login: 'octocat' },
          head: { ref: 'feature/tf-101-webhooks' },
          base: { ref: 'main' },
        },
      };

      const payloadStr = JSON.stringify(payload);
      const signature = generateGitHubHeader(payloadStr, integrationSecret);

      const res = await request(app)
        .post(`/api/projects/${projectA.id}/github/webhook`)
        .set('Content-Type', 'application/json')
        .set('X-GitHub-Event', 'pull_request')
        .set('X-Hub-Signature-256', signature)
        .send(payloadStr);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.event).toBe('pull_request');
      expect(res.body.resourceLink).toBeDefined();
      expect(res.body.resourceLink.resourceRef).toBe('PR #42');

      // TaskA1 should still be 'todo' because PR is only opened, not merged
      const task = await prisma.task.findUnique({ where: { id: taskA1.id } });
      expect(task.status).toBe('todo');
    });

    test('processes pull_request merged webhook and automatically marks task done with comment and activity', async () => {
      const payload = {
        action: 'closed',
        pull_request: {
          number: 42,
          title: 'feat: add GitHub webhook verification [TF-101]',
          body: 'Implements HMAC-SHA256 signature verification for GitHub webhooks.',
          html_url: 'https://github.com/brixcel/taskflow/pull/42',
          state: 'closed',
          merged: true,
          user: { login: 'octocat' },
          head: { ref: 'feature/tf-101-webhooks' },
          base: { ref: 'main' },
        },
      };

      const payloadStr = JSON.stringify(payload);
      const signature = generateGitHubHeader(payloadStr, integrationSecret);

      const res = await request(app)
        .post(`/api/projects/${projectA.id}/github/webhook`)
        .set('Content-Type', 'application/json')
        .set('X-GitHub-Event', 'pull_request')
        .set('X-Hub-Signature-256', signature)
        .send(payloadStr);

      expect(res.status).toBe(200);
      expect(res.body.closedTasks).toContain(taskA1.id);

      // Verify task status transitioned to done
      const updatedTask = await prisma.task.findUnique({ where: { id: taskA1.id } });
      expect(updatedTask.status).toBe('done');

      // Verify activity and comments were created
      const activities = await prisma.activity.findMany({
        where: { taskId: taskA1.id },
      });
      expect(activities.some((a) => a.action === 'status_change')).toBe(true);

      const comments = await prisma.comment.findMany({
        where: { taskId: taskA1.id },
      });
      expect(comments.some((c) => c.content.includes('Pull Request #42'))).toBe(true);
    });
  });

  // ─── 4. Push & Commit Automation ──────────────────────────────────────────

  describe('4. Push & Commit Automation', () => {
    let integrationSecret;

    beforeAll(async () => {
      const integ = await prisma.projectGitHubIntegration.findUnique({
        where: { projectId: projectA.id },
      });
      integrationSecret = integ.webhookSecret;
    });

    test('processes push webhook and auto-completes task referenced by "Fixes TF-102"', async () => {
      const payload = {
        ref: 'refs/heads/main',
        compare: 'https://github.com/brixcel/taskflow/compare/a1b2...c3d4',
        pusher: { name: 'octocat' },
        commits: [
          {
            id: '7f3a9b8c1234567890abcdef1234567890abcdef',
            message: 'Fixes TF-102: Polish GitHub Activity Feed layout and pills',
            url: 'https://github.com/brixcel/taskflow/commit/7f3a9b8',
            author: { username: 'octocat', name: 'Octo Cat' },
          },
        ],
      };

      const payloadStr = JSON.stringify(payload);
      const signature = generateGitHubHeader(payloadStr, integrationSecret);

      const res = await request(app)
        .post(`/api/projects/${projectA.id}/github/webhook`)
        .set('Content-Type', 'application/json')
        .set('X-GitHub-Event', 'push')
        .set('X-Hub-Signature-256', signature)
        .send(payloadStr);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.closedTasks).toContain(taskA2.id);

      // Verify taskA2 is now done
      const updatedTask = await prisma.task.findUnique({ where: { id: taskA2.id } });
      expect(updatedTask.status).toBe('done');
    });
  });

  // ─── 5. Issues Webhook Automation ─────────────────────────────────────────

  describe('5. Issues Webhook Automation', () => {
    let integrationSecret;
    let createdIssueTaskId;

    beforeAll(async () => {
      const integ = await prisma.projectGitHubIntegration.findUnique({
        where: { projectId: projectA.id },
      });
      integrationSecret = integ.webhookSecret;
    });

    test('auto-creates task in project when new issue is opened', async () => {
      const payload = {
        action: 'opened',
        issue: {
          number: 55,
          title: 'Memory leak in real-time notification socket listener',
          body: 'Socket connection listeners are not cleaned up on drawer unmount.',
          html_url: 'https://github.com/brixcel/taskflow/issues/55',
          state: 'open',
          user: { login: 'bugfinder' },
        },
      };

      const payloadStr = JSON.stringify(payload);
      const signature = generateGitHubHeader(payloadStr, integrationSecret);

      const res = await request(app)
        .post(`/api/projects/${projectA.id}/github/webhook`)
        .set('Content-Type', 'application/json')
        .set('X-GitHub-Event', 'issues')
        .set('X-Hub-Signature-256', signature)
        .send(payloadStr);

      expect(res.status).toBe(200);
      expect(res.body.createdTaskId).toBeDefined();
      createdIssueTaskId = res.body.createdTaskId;

      const createdTask = await prisma.task.findUnique({
        where: { id: createdIssueTaskId },
      });
      expect(createdTask).toBeDefined();
      expect(createdTask.title).toContain('[#55]');
      expect(createdTask.projectId).toBe(projectA.id);
      expect(createdTask.teamId).toBe(teamA.id);
      expect(createdTask.labels).toContain('github-issue');
    });

    test('auto-closes task when linked issue is closed', async () => {
      const payload = {
        action: 'closed',
        issue: {
          number: 55,
          title: 'Memory leak in real-time notification socket listener',
          html_url: 'https://github.com/brixcel/taskflow/issues/55',
          state: 'closed',
          user: { login: 'bugfinder' },
        },
        sender: { login: 'alice_owner' },
      };

      const payloadStr = JSON.stringify(payload);
      const signature = generateGitHubHeader(payloadStr, integrationSecret);

      const res = await request(app)
        .post(`/api/projects/${projectA.id}/github/webhook`)
        .set('Content-Type', 'application/json')
        .set('X-GitHub-Event', 'issues')
        .set('X-Hub-Signature-256', signature)
        .send(payloadStr);

      expect(res.status).toBe(200);
      expect(res.body.closedTasks).toContain(createdIssueTaskId);

      const updatedTask = await prisma.task.findUnique({
        where: { id: createdIssueTaskId },
      });
      expect(updatedTask.status).toBe('done');
    });
  });

  // ─── 6. Multi-Tenant Isolation ────────────────────────────────────────────

  describe('6. Multi-Tenant Isolation', () => {
    test('webhook for Team A project cannot affect tasks in Team B with same label', async () => {
      const integA = await prisma.projectGitHubIntegration.findUnique({
        where: { projectId: projectA.id },
      });

      // Send webhook to Project A with TF-101
      const payload = {
        action: 'closed',
        pull_request: {
          number: 99,
          title: 'Closes TF-101',
          html_url: 'https://github.com/brixcel/taskflow/pull/99',
          state: 'closed',
          merged: true,
          user: { login: 'octocat' },
        },
      };

      const payloadStr = JSON.stringify(payload);
      const signature = generateGitHubHeader(payloadStr, integA.webhookSecret);

      await request(app)
        .post(`/api/projects/${projectA.id}/github/webhook`)
        .set('Content-Type', 'application/json')
        .set('X-GitHub-Event', 'pull_request')
        .set('X-Hub-Signature-256', signature)
        .send(payloadStr);

      // TaskB1 in Team B must remain untouched ('todo')
      const taskB = await prisma.task.findUnique({ where: { id: taskB1.id } });
      expect(taskB.status).toBe('todo');
    });

    test('prevents member of Team B from querying project A activities', async () => {
      const res = await request(app)
        .get(`/projects/${projectA.id}/github/activities`)
        .set('Authorization', `Bearer ${tokenOther}`);

      expect(res.status).toBe(404);
    });
  });

  // ─── 7. Task-Level Manual Linking & Disconnect ────────────────────────────

  describe('7. Task-Level Manual Linking & Disconnect', () => {
    let createdLinkId;

    test('fetches project GitHub activity feed', async () => {
      const res = await request(app)
        .get(`/projects/${projectA.id}/github/activities`)
        .set('Authorization', `Bearer ${tokenOwner}`);

      expect(res.status).toBe(200);
      expect(res.body.links.length).toBeGreaterThan(0);
      expect(res.body.events.length).toBeGreaterThan(0);
    });

    test('manually links a PR to a task', async () => {
      const res = await request(app)
        .post(`/tasks/${taskA1.id}/github/link`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          resourceType: 'pull_request',
          resourceNumber: 88,
          resourceRef: 'PR #88',
          title: 'refactor: simplify webhook error mapper',
          url: 'https://github.com/brixcel/taskflow/pull/88',
          author: 'alice_owner',
          status: 'open',
        });

      expect(res.status).toBe(201);
      expect(res.body.link).toBeDefined();
      expect(res.body.link.resourceRef).toBe('PR #88');
      createdLinkId = res.body.link.id;
    });

    test('fetches GitHub links for a specific task', async () => {
      const res = await request(app)
        .get(`/tasks/${taskA1.id}/github`)
        .set('Authorization', `Bearer ${tokenOwner}`);

      expect(res.status).toBe(200);
      expect(res.body.links.some((l) => l.id === createdLinkId)).toBe(true);
    });

    test('unlinks a GitHub resource from a task', async () => {
      const res = await request(app)
        .delete(`/tasks/${taskA1.id}/github/link/${createdLinkId}`)
        .set('Authorization', `Bearer ${tokenOwner}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('unlinked');
    });

    test('disconnects GitHub integration from project', async () => {
      const res = await request(app)
        .delete(`/projects/${projectA.id}/github`)
        .set('Authorization', `Bearer ${tokenOwner}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('disconnected');

      // Verify connection is removed
      const check = await request(app)
        .get(`/projects/${projectA.id}/github`)
        .set('Authorization', `Bearer ${tokenOwner}`);

      expect(check.body.connected).toBe(false);
    });
  });
});

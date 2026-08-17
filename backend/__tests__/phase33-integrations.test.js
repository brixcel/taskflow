const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const https = require('https');
const { EventEmitter } = require('events');
const prisma = require('../prisma');

// Mock external webhook calls to prevent network timeouts during testing
jest.spyOn(https, 'request').mockImplementation((url, options, callback) => {
  const cb = typeof options === 'function' ? options : callback;
  const req = new EventEmitter();
  req.write = jest.fn();
  req.end = jest.fn(() => {
    if (cb) {
      const res = new EventEmitter();
      res.statusCode = 200;
      process.nextTick(() => {
        res.emit('data', 'ok');
        res.emit('end');
      });
      cb(res);
    }
  });
  return req;
});

const authRoutes = require('../routes/auth');
const taskRoutes = require('../routes/tasks');
const projectRoutes = require('../routes/projects');
const developerRoutes = require('../routes/developer');
const integrationsRoutes = require('../routes/integrations');



const {
  validateChatWebhookUrl,
  maskWebhookUrl,
  buildSlackPayload,
  buildDiscordPayload,
  dispatchChatEvent,
  VALID_CHAT_EVENTS,
} = require('../services/chatIntegrations');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use('/tasks', taskRoutes);
  app.use('/projects', projectRoutes);
  app.use('/developer', developerRoutes);
  app.use('/developer', integrationsRoutes);
  return app;
}

let app;
let userOwner, userMember, userOther;
let teamA, teamB;
let tokenOwner, tokenMember, tokenOther;

function makeToken(userId, email, teamId) {
  return jwt.sign(
    { userId, email, teamId },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

describe('Phase 33 — Slack & Discord Integrations (SyncTask & ST AI)', () => {
  beforeAll(async () => {
    app = createTestApp();

    await prisma.chatIntegrationDelivery.deleteMany({});
    await prisma.teamChatIntegration.deleteMany({});
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
    await prisma.projectGitHubIntegration.deleteMany({});
    await prisma.project.deleteMany({});
    await prisma.teamMembership.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.user.deleteMany({});

    const passwordHash = await bcrypt.hash('Password123!', 10);

    userOwner = await prisma.user.create({
      data: {
        email: 'phase33-owner@synctask.local',
        passwordHash,
        name: 'SyncTask Owner',
        emailVerified: true,
      },
    });

    userMember = await prisma.user.create({
      data: {
        email: 'phase33-member@synctask.local',
        passwordHash,
        name: 'SyncTask Member',
        emailVerified: true,
      },
    });

    userOther = await prisma.user.create({
      data: {
        email: 'phase33-other@synctask.local',
        passwordHash,
        name: 'Other Team User',
        emailVerified: true,
      },
    });

    teamA = await prisma.team.create({
      data: {
        name: 'SyncTask Alpha Team',
        ownerId: userOwner.id,
      },
    });

    teamB = await prisma.team.create({
      data: {
        name: 'SyncTask Beta Team',
        ownerId: userOther.id,
      },
    });

    await prisma.teamMembership.create({
      data: {
        userId: userOwner.id,
        teamId: teamA.id,
        role: 'owner',
      },
    });

    await prisma.teamMembership.create({
      data: {
        userId: userMember.id,
        teamId: teamA.id,
        role: 'member',
      },
    });

    await prisma.teamMembership.create({
      data: {
        userId: userOther.id,
        teamId: teamB.id,
        role: 'owner',
      },
    });

    tokenOwner = makeToken(userOwner.id, userOwner.email, teamA.id);
    tokenMember = makeToken(userMember.id, userMember.email, teamA.id);
    tokenOther = makeToken(userOther.id, userOther.email, teamB.id);
  });

  afterAll(async () => {
    await prisma.chatIntegrationDelivery.deleteMany({});
    await prisma.teamChatIntegration.deleteMany({});
    await prisma.project.deleteMany({});
    await prisma.teamMembership.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.$disconnect();
  });

  describe('1. Unit Tests — Message Builders & SSRF Protections', () => {
    test('validateChatWebhookUrl rejects private / internal hosts (SSRF Prevention)', () => {
      expect(validateChatWebhookUrl('http://127.0.0.1:8080/hook').valid).toBe(false);
      expect(validateChatWebhookUrl('http://localhost:3000/hook').valid).toBe(false);
      expect(validateChatWebhookUrl('http://169.254.169.254/latest/meta-data').valid).toBe(false);
      expect(validateChatWebhookUrl('http://192.168.1.1/hook').valid).toBe(false);
      expect(validateChatWebhookUrl('http://10.0.0.5/hook').valid).toBe(false);
      expect(validateChatWebhookUrl('ftp://example.com/hook').valid).toBe(false);
    });

    test('validateChatWebhookUrl accepts valid public webhook endpoints', () => {
      const slackCheck = validateChatWebhookUrl('https://hooks.slack.com/services/T123/B456/789XYZ', 'slack');
      expect(slackCheck.valid).toBe(true);

      const discordCheck = validateChatWebhookUrl('https://discord.com/api/webhooks/12345/abcdef', 'discord');
      expect(discordCheck.valid).toBe(true);
    });

    test('maskWebhookUrl masks secret path parameters for safe UI presentation', () => {
      const maskedSlack = maskWebhookUrl('https://hooks.slack.com/services/T123/B456/secret-token-12345');
      expect(maskedSlack).toContain('hooks.slack.com/services/T123/B456/••••••••');
      expect(maskedSlack).not.toContain('secret-token-12345');

      const maskedDiscord = maskWebhookUrl('https://discord.com/api/webhooks/12345/very-secret-key');
      expect(maskedDiscord).toContain('••••••••');
      expect(maskedDiscord).not.toContain('very-secret-key');
    });

    test('buildSlackPayload formats Slack Block Kit with SyncTask branding and ST AI context', () => {
      const payload = buildSlackPayload({
        event: 'task_completed',
        task: {
          id: 'task-123',
          title: 'Implement Dark Mode Theme',
          status: 'done',
          priority: 'high',
          dueDate: new Date().toISOString(),
        },
        project: { name: 'Core Web App' },
        actor: { name: 'Alice Engineer' },
        includeDetails: false,
      });

      expect(payload.text).toContain('Task Completed');
      expect(payload.blocks).toBeDefined();
      expect(payload.blocks.length).toBeGreaterThan(2);
      expect(JSON.stringify(payload)).toContain('SyncTask');
      expect(JSON.stringify(payload)).toContain('ST AI');
    });

    test('buildDiscordPayload formats Discord Embeds with color codes and SyncTask footer', () => {
      const payload = buildDiscordPayload({
        event: 'task_assigned',
        task: {
          id: 'task-456',
          title: 'Setup Kubernetes Cluster',
          status: 'todo',
          priority: 'urgent',
          assignee: { name: 'Bob DevOps' },
        },
        project: { name: 'Cloud Infrastructure' },
        actor: { name: 'Alice Lead' },
        includeDetails: true,
      });

      expect(payload.username).toBe('SyncTask');
      expect(payload.embeds).toHaveLength(1);
      expect(payload.embeds[0].title).toContain('Task Assigned');
      expect(payload.embeds[0].footer.text).toContain('SyncTask');
    });
  });

  describe('2. REST API & RBAC Permissions', () => {
    let createdSlackId;

    test('POST /developer/chat-integrations creates a Slack integration (Owner only)', async () => {
      const res = await request(app)
        .post('/developer/chat-integrations')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id)
        .send({
          provider: 'slack',
          name: '#engineering-alerts',
          webhookUrl: 'https://hooks.slack.com/services/T123/B456/SecretTokenAbc',
          channelName: '#eng-alerts',
          events: ['task_assigned', 'task_completed'],
          includePrivateDetails: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.integration).toBeDefined();
      expect(res.body.integration.provider).toBe('slack');
      expect(res.body.integration.maskedWebhookUrl).toContain('••••••••');
      expect(res.body.integration.webhookUrl).toBeUndefined(); // ensure not leaked
      createdSlackId = res.body.integration.id;
    });

    test('POST /developer/chat-integrations rejects member role with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/developer/chat-integrations')
        .set('Authorization', `Bearer ${tokenMember}`)
        .set('X-Team-Id', teamA.id)
        .send({
          provider: 'discord',
          name: 'Discord Channel',
          webhookUrl: 'https://discord.com/api/webhooks/123/xyz',
          events: ['task_completed'],
        });

      expect(res.status).toBe(403);
    });

    test('POST /developer/chat-integrations rejects SSRF localhost attempts with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/developer/chat-integrations')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id)
        .send({
          provider: 'slack',
          name: 'Hacker Webhook',
          webhookUrl: 'http://127.0.0.1:9000/internal-api',
          events: ['task_completed'],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/localhost|private|domain/i);
    });

    test('GET /developer/chat-integrations lists team integrations with masked secrets', async () => {
      const res = await request(app)
        .get('/developer/chat-integrations')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.integrations)).toBe(true);
      expect(res.body.integrations.length).toBeGreaterThanOrEqual(1);
      expect(res.body.integrations[0].maskedWebhookUrl).toContain('••••••••');
      expect(res.body.integrations[0].webhookUrl).toBeUndefined();
    });

    test('PATCH /developer/chat-integrations/:id updates settings (Owner only)', async () => {
      const res = await request(app)
        .patch(`/developer/chat-integrations/${createdSlackId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id)
        .send({
          name: '#engineering-alerts-updated',
          includePrivateDetails: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.integration.name).toBe('#engineering-alerts-updated');
      expect(res.body.integration.includePrivateDetails).toBe(true);
    });

    test('Multi-tenant isolation: Team B cannot see or update Team A chat integration', async () => {
      // Team B GET
      const getRes = await request(app)
        .get('/developer/chat-integrations')
        .set('Authorization', `Bearer ${tokenOther}`)
        .set('X-Team-Id', teamB.id);

      expect(getRes.status).toBe(200);
      expect(getRes.body.integrations).toHaveLength(0);

      // Team B PATCH
      const patchRes = await request(app)
        .patch(`/developer/chat-integrations/${createdSlackId}`)
        .set('Authorization', `Bearer ${tokenOther}`)
        .set('X-Team-Id', teamB.id)
        .send({ name: 'Hacked name' });

      expect(patchRes.status).toBe(404);
    });

    test('DELETE /developer/chat-integrations/:id disconnects integration', async () => {
      const res = await request(app)
        .delete(`/developer/chat-integrations/${createdSlackId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('disconnected successfully');

      const check = await prisma.teamChatIntegration.findUnique({
        where: { id: createdSlackId },
      });
      expect(check).toBeNull();
    });
  });

  describe('3. Event Dispatch Pipeline & Delivery Tracking', () => {
    let integration;

    beforeEach(async () => {
      integration = await prisma.teamChatIntegration.create({
        data: {
          teamId: teamA.id,
          provider: 'discord',
          name: 'Discord Dev Feed',
          webhookUrl: 'https://discord.com/api/webhooks/999/ValidWebhookKey',
          events: ['task_completed', 'comment_created'],
          createdById: userOwner.id,
        },
      });
    });

    afterEach(async () => {
      await prisma.chatIntegrationDelivery.deleteMany({});
      await prisma.teamChatIntegration.deleteMany({});
    });

    test('dispatchChatEvent executes delivery and logs delivery record', async () => {
      const task = {
        id: 'task-test-01',
        title: 'Refactor Auth Service',
        status: 'done',
        priority: 'high',
      };

      const results = await dispatchChatEvent(teamA.id, 'task_completed', {
        task,
        actor: userOwner,
      });

      expect(Array.isArray(results)).toBe(true);

      const deliveries = await prisma.chatIntegrationDelivery.findMany({
        where: { integrationId: integration.id },
      });

      expect(deliveries.length).toBeGreaterThanOrEqual(1);
      expect(deliveries[0].event).toBe('task_completed');
      expect(deliveries[0].payload).toBeDefined();
    });

    test('GET /developer/chat-integrations/:id/deliveries returns recent logs', async () => {
      await prisma.chatIntegrationDelivery.create({
        data: {
          integrationId: integration.id,
          event: 'task_completed',
          payload: { test: true },
          status: 'success',
          statusCode: 200,
          deliveredAt: new Date(),
        },
      });

      const res = await request(app)
        .get(`/developer/chat-integrations/${integration.id}/deliveries`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.deliveries).toHaveLength(1);
      expect(res.body.deliveries[0].event).toBe('task_completed');
    });
  });
});

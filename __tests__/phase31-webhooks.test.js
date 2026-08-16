const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

const authRoutes = require('../routes/auth');
const taskRoutes = require('../routes/tasks');
const projectRoutes = require('../routes/projects');
const developerRoutes = require('../routes/developer');

const {
  generateApiKey,
  hashApiKey,
  authenticateApiKey,
} = require('../services/apiKeys');

const {
  generateWebhookSecret,
  signWebhookPayload,
  verifyWebhookSignature,
  dispatchWebhookEvent,
} = require('../services/webhooks');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use('/tasks', taskRoutes);
  app.use('/projects', projectRoutes);
  app.use('/developer', developerRoutes);
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

describe('Phase 31 — Webhooks & API Keys', () => {
  beforeAll(async () => {
    app = createTestApp();

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
      data: { email: 'owner_p31@example.com', passwordHash, name: 'Alice Owner' },
    });
    userMember = await prisma.user.create({
      data: { email: 'member_p31@example.com', passwordHash, name: 'Bob Member' },
    });
    userOther = await prisma.user.create({
      data: { email: 'other_p31@example.com', passwordHash, name: 'Charlie Other' },
    });

    // Create Teams
    teamA = await prisma.team.create({
      data: { name: 'Alpha Dev Team', ownerId: userOwner.id },
    });
    teamB = await prisma.team.create({
      data: { name: 'Beta Isolated Team', ownerId: userOther.id },
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
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ─── 1. Unit Service Layer Tests ─────────────────────────────────────────────

  describe('1. API Keys & Webhooks Unit Services', () => {
    it('generates secure API keys and computes valid SHA-256 hashes', () => {
      const { rawKey, keyPrefix, keyHash } = generateApiKey();

      expect(rawKey.startsWith('tf_live_')).toBe(true);
      expect(keyPrefix.startsWith('tf_live_')).toBe(true);
      expect(typeof keyHash).toBe('string');
      expect(keyHash.length).toBe(64); // SHA-256 hex string
      expect(hashApiKey(rawKey)).toBe(keyHash);
    });

    it('signs and verifies HMAC-SHA256 webhook signatures with timestamp tolerance', () => {
      const secret = generateWebhookSecret();
      expect(secret.startsWith('whsec_')).toBe(true);

      const payload = JSON.stringify({ event: 'task.created', id: 'task-123' });
      const nowSec = Math.floor(Date.now() / 1000);

      const { signatureHeader } = signWebhookPayload(secret, payload, nowSec);
      expect(signatureHeader).toContain(`t=${nowSec},v1=`);

      const isValid = verifyWebhookSignature(signatureHeader, secret, payload);
      expect(isValid).toBe(true);

      // Rejects tampered payload
      const tamperedPayload = JSON.stringify({ event: 'task.created', id: 'task-999' });
      const isTamperedValid = verifyWebhookSignature(signatureHeader, secret, tamperedPayload);
      expect(isTamperedValid).toBe(false);

      // Rejects wrong secret
      const isWrongSecretValid = verifyWebhookSignature(signatureHeader, 'whsec_wrongsecret123', payload);
      expect(isWrongSecretValid).toBe(false);

      // Rejects expired timestamp (> 300s)
      const oldTime = nowSec - 500;
      const { signatureHeader: expiredHeader } = signWebhookPayload(secret, payload, oldTime);
      const isExpiredValid = verifyWebhookSignature(expiredHeader, secret, payload, 300);
      expect(isExpiredValid).toBe(false);
    });
  });

  // ─── 2. API Key Management & RBAC ───────────────────────────────────────────

  describe('2. API Key Management & RBAC Endpoints', () => {
    let createdKeyId = null;
    let createdSecretKey = null;

    it('allows team owner to create an API key and returns secret once', async () => {
      const res = await request(app)
        .post('/developer/api-keys')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id)
        .send({
          name: 'CI/CD Pipeline Key',
          scopes: ['*'],
          expiresInDays: 90,
        });

      expect(res.status).toBe(201);
      expect(res.body.apiKey).toBeDefined();
      expect(res.body.apiKey.name).toBe('CI/CD Pipeline Key');
      expect(res.body.apiKey.keyPrefix).toBeDefined();
      expect(res.body.secretKey).toBeDefined();
      expect(res.body.secretKey.startsWith('tf_live_')).toBe(true);

      createdKeyId = res.body.apiKey.id;
      createdSecretKey = res.body.secretKey;

      // Verify key is hashed in database, NOT stored in plaintext
      const dbKey = await prisma.apiKey.findUnique({ where: { id: createdKeyId } });
      expect(dbKey.keyHash).not.toBe(createdSecretKey);
      expect(dbKey.keyHash).toBe(hashApiKey(createdSecretKey));
    });

    it('rejects regular members from creating API keys with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/developer/api-keys')
        .set('Authorization', `Bearer ${tokenMember}`)
        .set('X-Team-Id', teamA.id)
        .send({ name: 'Unauthorized Key' });

      expect(res.status).toBe(403);
    });

    it('lists active API keys without exposing secret hashes', async () => {
      const res = await request(app)
        .get('/developer/api-keys')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.apiKeys.length).toBeGreaterThanOrEqual(1);
      const found = res.body.apiKeys.find((k) => k.id === createdKeyId);
      expect(found).toBeDefined();
      expect(found.keyPrefix).toBeDefined();
      expect(found.keyHash).toBeUndefined(); // never leaked
      expect(found.user.name).toBe('Alice Owner');
    });

    it('allows rotating an API key', async () => {
      const res = await request(app)
        .post(`/developer/api-keys/${createdKeyId}/rotate`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(201);
      expect(res.body.apiKey).toBeDefined();
      expect(res.body.secretKey).toBeDefined();
      expect(res.body.secretKey).not.toBe(createdSecretKey);

      // Verify old key is marked as revoked
      const oldKey = await prisma.apiKey.findUnique({ where: { id: createdKeyId } });
      expect(oldKey.revokedAt).not.toBeNull();

      // Update test variables with rotated key
      createdKeyId = res.body.apiKey.id;
      createdSecretKey = res.body.secretKey;
    });

    it('allows revoking an API key', async () => {
      const res = await request(app)
        .delete(`/developer/api-keys/${createdKeyId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const revokedKey = await prisma.apiKey.findUnique({ where: { id: createdKeyId } });
      expect(revokedKey.revokedAt).not.toBeNull();
    });
  });

  // ─── 3. API Key Authentication ──────────────────────────────────────────────

  describe('3. API Key Authentication Integration', () => {
    let validApiKeySecret;

    beforeAll(async () => {
      const res = await request(app)
        .post('/developer/api-keys')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id)
        .send({ name: 'Live Production Key' });

      validApiKeySecret = res.body.secretKey;
    });

    it('authenticates task creation using Authorization: Bearer tf_live_...', async () => {
      const res = await request(app)
        .post('/tasks')
        .set('Authorization', `Bearer ${validApiKeySecret}`)
        .send({
          title: 'Automated Task via API Key',
          priority: 'high',
        });

      expect(res.status).toBe(201);
      expect(res.body.task).toBeDefined();
      expect(res.body.task.title).toBe('Automated Task via API Key');
      expect(res.body.task.teamId).toBe(teamA.id);
    });

    it('authenticates task listing using X-API-Key header', async () => {
      const res = await request(app)
        .get('/tasks')
        .set('X-API-Key', validApiKeySecret);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.tasks)).toBe(true);
      const found = res.body.tasks.find((t) => t.title === 'Automated Task via API Key');
      expect(found).toBeDefined();
    });

    it('rejects invalid or fake API key with 401 Unauthorized', async () => {
      const res = await request(app)
        .get('/tasks')
        .set('Authorization', 'Bearer tf_live_invalid_key_1234567890');

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('API key');
    });

    it('prevents API key from accessing another team with 403', async () => {
      const res = await request(app)
        .get('/tasks')
        .set('Authorization', `Bearer ${validApiKeySecret}`)
        .set('X-Team-Id', teamB.id);

      expect(res.status).toBe(403);
    });
  });

  // ─── 4. Webhooks Management & Deliveries ────────────────────────────────────

  describe('4. Webhook Subscriptions & Deliveries', () => {
    let createdWebhookId = null;

    it('creates a webhook subscription with selected events and generated secret', async () => {
      const res = await request(app)
        .post('/developer/webhooks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id)
        .send({
          name: 'Slack Notification Feed',
          url: 'https://example.com/webhook/taskflow',
          events: ['task.created', 'task.updated', 'comment.created'],
        });

      expect(res.status).toBe(201);
      expect(res.body.webhook).toBeDefined();
      expect(res.body.webhook.name).toBe('Slack Notification Feed');
      expect(res.body.webhook.secret.startsWith('whsec_')).toBe(true);
      expect(res.body.webhook.events).toContain('task.created');

      createdWebhookId = res.body.webhook.id;
    });

    it('rejects invalid URL with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/developer/webhooks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id)
        .send({
          name: 'Invalid Webhook',
          url: 'not-a-url',
          events: ['task.created'],
        });

      expect(res.status).toBe(400);
    });

    it('lists webhooks for team', async () => {
      const res = await request(app)
        .get('/developer/webhooks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.webhooks.length).toBeGreaterThanOrEqual(1);
    });

    it('updates webhook events and active state', async () => {
      const res = await request(app)
        .patch(`/developer/webhooks/${createdWebhookId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id)
        .send({
          events: ['task.created', 'task.completed'],
          isActive: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.webhook.events).toContain('task.completed');
      expect(res.body.webhook.events).not.toContain('comment.created');
    });

    it('sends test ping to webhook and records delivery log', async () => {
      const res = await request(app)
        .post(`/developer/webhooks/${createdWebhookId}/test`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.delivery).toBeDefined();
      expect(res.body.delivery.event).toBe('ping');
    });

    it('fetches webhook delivery logs', async () => {
      const res = await request(app)
        .get(`/developer/webhooks/${createdWebhookId}/deliveries`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.deliveries)).toBe(true);
      expect(res.body.deliveries.length).toBeGreaterThanOrEqual(1);
    });

    it('deletes webhook endpoint', async () => {
      const res = await request(app)
        .delete(`/developer/webhooks/${createdWebhookId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});

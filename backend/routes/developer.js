const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const { sanitize } = require('../middleware/sanitize');
const schemas = require('../validation/schemas');
const { generateApiKey } = require('../services/apiKeys');
const {
  generateWebhookSecret,
  sendWebhookPing,
  VALID_WEBHOOK_EVENTS,
} = require('../services/webhooks');
const logger = require('../middleware/logger');

router.use(requireAuth, resolveTeam);

// ─── API Keys Endpoints ───────────────────────────────────────────────────────

/**
 * GET /developer/api-keys
 * List active API keys for the current team
 */
router.get('/api-keys', async (req, res) => {
  try {
    const apiKeys = await prisma.apiKey.findMany({
      where: {
        teamId: req.teamId,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.json({ apiKeys });
  } catch (error) {
    if (logger && logger.error) logger.error({ err: error }, 'GET /developer/api-keys failed');
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

/**
 * POST /developer/api-keys
 * Create a new API key (only owners and admins)
 * Returns the raw secret key once upon creation
 */
router.post(
  '/api-keys',
  requireRole(['owner', 'admin']),
  validate(schemas.apiKeyCreate),
  async (req, res) => {
    try {
      const { name, scopes = ['*'], expiresInDays } = req.body;

      const { rawKey, keyPrefix, keyHash } = generateApiKey();

      let expiresAt = null;
      if (expiresInDays && Number.isInteger(Number(expiresInDays))) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + Number(expiresInDays));
      }

      const apiKey = await prisma.apiKey.create({
        data: {
          name: sanitize(name),
          keyPrefix,
          keyHash,
          scopes,
          expiresAt,
          userId: req.userId,
          teamId: req.teamId,
        },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          expiresAt: true,
          createdAt: true,
        },
      });

      res.status(201).json({
        apiKey,
        secretKey: rawKey,
        message: 'Store this secret key securely. It will never be displayed again.',
      });
    } catch (error) {
      if (logger && logger.error) logger.error({ err: error }, 'POST /developer/api-keys failed');
      res.status(500).json({ error: 'Failed to create API key' });
    }
  }
);

/**
 * DELETE /developer/api-keys/:id
 * Revoke an API key
 */
router.delete(
  '/api-keys/:id',
  requireRole(['owner', 'admin']),
  async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await prisma.apiKey.findFirst({
        where: {
          id,
          teamId: req.teamId,
        },
      });

      if (!existing) {
        return res.status(404).json({ error: 'API key not found in this team' });
      }

      const updated = await prisma.apiKey.update({
        where: { id },
        data: { revokedAt: new Date() },
      });

      res.json({ success: true, message: 'API key revoked', apiKey: updated });
    } catch (error) {
      if (logger && logger.error) logger.error({ err: error }, 'DELETE /developer/api-keys/:id failed');
      res.status(500).json({ error: 'Failed to revoke API key' });
    }
  }
);

/**
 * POST /developer/api-keys/:id/rotate
 * Rotates an API key (revokes old, creates new)
 */
router.post(
  '/api-keys/:id/rotate',
  requireRole(['owner', 'admin']),
  async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await prisma.apiKey.findFirst({
        where: {
          id,
          teamId: req.teamId,
        },
      });

      if (!existing) {
        return res.status(404).json({ error: 'API key not found in this team' });
      }

      // Revoke old key
      await prisma.apiKey.update({
        where: { id },
        data: { revokedAt: new Date() },
      });

      // Generate new key with same name and scopes
      const { rawKey, keyPrefix, keyHash } = generateApiKey();

      const newApiKey = await prisma.apiKey.create({
        data: {
          name: existing.name,
          keyPrefix,
          keyHash,
          scopes: existing.scopes,
          expiresAt: existing.expiresAt,
          userId: req.userId,
          teamId: req.teamId,
        },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          expiresAt: true,
          createdAt: true,
        },
      });

      res.status(201).json({
        apiKey: newApiKey,
        secretKey: rawKey,
        message: 'API key rotated successfully. Store this new secret key securely.',
      });
    } catch (error) {
      if (logger && logger.error) logger.error({ err: error }, 'POST /developer/api-keys/:id/rotate failed');
      res.status(500).json({ error: 'Failed to rotate API key' });
    }
  }
);

// ─── Webhooks Endpoints ───────────────────────────────────────────────────────

/**
 * GET /developer/webhooks
 * List all webhooks for current team
 */
router.get('/webhooks', async (req, res) => {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { teamId: req.teamId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { deliveries: true } },
      },
    });

    res.json({ webhooks, validEvents: VALID_WEBHOOK_EVENTS });
  } catch (error) {
    if (logger && logger.error) logger.error({ err: error }, 'GET /developer/webhooks failed');
    res.status(500).json({ error: 'Failed to fetch webhooks' });
  }
});

/**
 * POST /developer/webhooks
 * Create a new webhook subscription
 */
router.post(
  '/webhooks',
  requireRole(['owner', 'admin']),
  validate(schemas.webhookCreate),
  async (req, res) => {
    try {
      const { name, url, events } = req.body;

      const secret = generateWebhookSecret();

      const webhook = await prisma.webhook.create({
        data: {
          name: sanitize(name),
          url: url.trim(),
          secret,
          events,
          teamId: req.teamId,
          createdById: req.userId,
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      res.status(201).json({ webhook });
    } catch (error) {
      if (logger && logger.error) logger.error({ err: error }, 'POST /developer/webhooks failed');
      res.status(500).json({ error: 'Failed to create webhook' });
    }
  }
);

/**
 * GET /developer/webhooks/:id
 * Fetch single webhook details
 */
router.get('/webhooks/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const webhook = await prisma.webhook.findFirst({
      where: { id, teamId: req.teamId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { deliveries: true } },
      },
    });

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found in this team' });
    }

    res.json({ webhook });
  } catch (error) {
    if (logger && logger.error) logger.error({ err: error }, 'GET /developer/webhooks/:id failed');
    res.status(500).json({ error: 'Failed to fetch webhook' });
  }
});

/**
 * PATCH /developer/webhooks/:id
 * Update an existing webhook
 */
router.patch(
  '/webhooks/:id',
  requireRole(['owner', 'admin']),
  validate(schemas.webhookUpdate),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, url, events, isActive } = req.body;

      const existing = await prisma.webhook.findFirst({
        where: { id, teamId: req.teamId },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Webhook not found in this team' });
      }

      const updateData = {};
      if (name !== undefined) updateData.name = sanitize(name);
      if (url !== undefined) updateData.url = url.trim();
      if (events !== undefined) updateData.events = events;
      if (isActive !== undefined) updateData.isActive = Boolean(isActive);

      const updated = await prisma.webhook.update({
        where: { id },
        data: updateData,
      });

      res.json({ webhook: updated });
    } catch (error) {
      if (logger && logger.error) logger.error({ err: error }, 'PATCH /developer/webhooks/:id failed');
      res.status(500).json({ error: 'Failed to update webhook' });
    }
  }
);

/**
 * DELETE /developer/webhooks/:id
 * Delete a webhook and its deliveries
 */
router.delete(
  '/webhooks/:id',
  requireRole(['owner', 'admin']),
  async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await prisma.webhook.findFirst({
        where: { id, teamId: req.teamId },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Webhook not found in this team' });
      }

      await prisma.webhook.delete({ where: { id } });

      res.json({ success: true, message: 'Webhook deleted' });
    } catch (error) {
      if (logger && logger.error) logger.error({ err: error }, 'DELETE /developer/webhooks/:id failed');
      res.status(500).json({ error: 'Failed to delete webhook' });
    }
  }
);

/**
 * POST /developer/webhooks/:id/test
 * Send a test 'ping' event to the webhook
 */
router.post(
  '/webhooks/:id/test',
  requireRole(['owner', 'admin']),
  async (req, res) => {
    try {
      const { id } = req.params;

      const delivery = await sendWebhookPing(id, req.teamId, { prismaInstance: prisma });

      res.json({
        success: delivery.status === 'success',
        delivery,
      });
    } catch (error) {
      if (logger && logger.error) logger.error({ err: error }, 'POST /developer/webhooks/:id/test failed');
      res.status(500).json({ error: error.message || 'Failed to send test webhook ping' });
    }
  }
);

/**
 * GET /developer/webhooks/:id/deliveries
 * Fetch recent delivery logs for a webhook
 */
router.get('/webhooks/:id/deliveries', async (req, res) => {
  try {
    const { id } = req.params;

    const webhook = await prisma.webhook.findFirst({
      where: { id, teamId: req.teamId },
    });

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found in this team' });
    }

    const deliveries = await prisma.webhookDelivery.findMany({
      where: { webhookId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ deliveries });
  } catch (error) {
    if (logger && logger.error) logger.error({ err: error }, 'GET /developer/webhooks/:id/deliveries failed');
    res.status(500).json({ error: 'Failed to fetch webhook deliveries' });
  }
});

module.exports = router;

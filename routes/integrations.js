const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const { sanitize } = require('../middleware/sanitize');
const schemas = require('../validation/schemas');
const {
  validateChatWebhookUrl,
  maskWebhookUrl,
  sendChatTestPing,
  VALID_CHAT_EVENTS,
} = require('../services/chatIntegrations');
const logger = require('../middleware/logger');

router.use(requireAuth, resolveTeam);

/**
 * GET /developer/chat-integrations
 * List all Slack & Discord integrations configured for the current team
 */
router.get('/chat-integrations', async (req, res) => {
  try {
    const integrations = await prisma.teamChatIntegration.findMany({
      where: {
        teamId: req.teamId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        project: {
          select: { id: true, name: true, icon: true, color: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    const maskedIntegrations = integrations.map((item) => ({
      ...item,
      maskedWebhookUrl: maskWebhookUrl(item.webhookUrl),
      webhookUrl: undefined, // Never expose raw webhook URL in listing
    }));

    res.json({ integrations: maskedIntegrations });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'GET /developer/chat-integrations failed');
    }
    res.status(500).json({ error: 'Failed to fetch chat integrations' });
  }
});

/**
 * POST /developer/chat-integrations
 * Connect a new Slack or Discord incoming webhook (Owner / Admin only)
 */
router.post(
  '/chat-integrations',
  requireRole(['owner', 'admin']),
  validate(schemas.chatIntegrationCreate),
  async (req, res) => {
    try {
      const {
        provider,
        name,
        webhookUrl,
        channelName,
        events,
        filterProjectId,
        includePrivateDetails,
      } = req.body;

      // 1. SSRF & URL validation
      const urlCheck = validateChatWebhookUrl(webhookUrl, provider);
      if (!urlCheck.valid) {
        return res.status(400).json({ error: urlCheck.error });
      }

      // 2. Validate events
      const validEvents = (events || []).filter((e) =>
        VALID_CHAT_EVENTS.includes(e) || e === '*'
      );
      if (validEvents.length === 0) {
        return res.status(400).json({ error: 'At least one valid event must be selected' });
      }

      // 3. Verify project scoping if filterProjectId is provided
      if (filterProjectId) {
        const project = await prisma.project.findFirst({
          where: { id: filterProjectId, teamId: req.teamId },
        });
        if (!project) {
          return res.status(400).json({ error: 'Selected project does not belong to this team' });
        }
      }

      // 4. Create Integration Record
      const integration = await prisma.teamChatIntegration.create({
        data: {
          teamId: req.teamId,
          provider: provider.toLowerCase(),
          name: sanitize(name).trim(),
          webhookUrl: urlCheck.url,
          channelName: channelName ? sanitize(channelName).trim() : null,
          events: validEvents,
          filterProjectId: filterProjectId || null,
          includePrivateDetails: Boolean(includePrivateDetails),
          createdById: req.userId,
        },
        include: {
          project: {
            select: { id: true, name: true, icon: true, color: true },
          },
        },
      });

      res.status(201).json({
        message: `${provider === 'slack' ? 'Slack' : 'Discord'} integration connected successfully`,
        integration: {
          ...integration,
          maskedWebhookUrl: maskWebhookUrl(integration.webhookUrl),
          webhookUrl: undefined,
        },
      });
    } catch (error) {
      if (logger && logger.error) {
        logger.error({ err: error }, 'POST /developer/chat-integrations failed');
      }
      res.status(500).json({ error: 'Failed to create chat integration' });
    }
  }
);

/**
 * PATCH /developer/chat-integrations/:id
 * Update an existing Slack/Discord integration settings (Owner / Admin only)
 */
router.patch(
  '/chat-integrations/:id',
  requireRole(['owner', 'admin']),
  validate(schemas.chatIntegrationUpdate),
  async (req, res) => {

    try {
      const { id } = req.params;
      const {
        name,
        webhookUrl,
        channelName,
        events,
        filterProjectId,
        includePrivateDetails,
        isActive,
      } = req.body;

      const existing = await prisma.teamChatIntegration.findFirst({
        where: { id, teamId: req.teamId },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Chat integration not found in this team' });
      }

      const updateData = {};

      if (name !== undefined) updateData.name = name.trim();
      if (channelName !== undefined) updateData.channelName = channelName ? channelName.trim() : null;
      if (isActive !== undefined) updateData.isActive = Boolean(isActive);
      if (includePrivateDetails !== undefined) updateData.includePrivateDetails = Boolean(includePrivateDetails);

      if (webhookUrl !== undefined) {
        const urlCheck = validateChatWebhookUrl(webhookUrl, existing.provider);
        if (!urlCheck.valid) {
          return res.status(400).json({ error: urlCheck.error });
        }
        updateData.webhookUrl = urlCheck.url;
      }

      if (events !== undefined) {
        const validEvents = events.filter((e) => VALID_CHAT_EVENTS.includes(e) || e === '*');
        if (validEvents.length === 0) {
          return res.status(400).json({ error: 'At least one valid event must be selected' });
        }
        updateData.events = validEvents;
      }

      if (filterProjectId !== undefined) {
        if (filterProjectId) {
          const project = await prisma.project.findFirst({
            where: { id: filterProjectId, teamId: req.teamId },
          });
          if (!project) {
            return res.status(400).json({ error: 'Selected project does not belong to this team' });
          }
          updateData.filterProjectId = filterProjectId;
        } else {
          updateData.filterProjectId = null;
        }
      }

      const updated = await prisma.teamChatIntegration.update({
        where: { id },
        data: updateData,
        include: {
          project: {
            select: { id: true, name: true, icon: true, color: true },
          },
        },
      });

      res.json({
        message: 'Chat integration updated successfully',
        integration: {
          ...updated,
          maskedWebhookUrl: maskWebhookUrl(updated.webhookUrl),
          webhookUrl: undefined,
        },
      });
    } catch (error) {
      if (logger && logger.error) {
        logger.error({ err: error }, 'PATCH /developer/chat-integrations/:id failed');
      }
      res.status(500).json({ error: 'Failed to update chat integration' });
    }
  }
);

/**
 * DELETE /developer/chat-integrations/:id
 * Disconnect and remove a Slack/Discord integration (Owner / Admin only)
 */
router.delete(
  '/chat-integrations/:id',
  requireRole(['owner', 'admin']),
  async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await prisma.teamChatIntegration.findFirst({
        where: { id, teamId: req.teamId },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Chat integration not found in this team' });
      }

      await prisma.teamChatIntegration.delete({
        where: { id },
      });

      res.json({ message: 'Chat integration disconnected successfully' });
    } catch (error) {
      if (logger && logger.error) {
        logger.error({ err: error }, 'DELETE /developer/chat-integrations/:id failed');
      }
      res.status(500).json({ error: 'Failed to delete chat integration' });
    }
  }
);

/**
 * POST /developer/chat-integrations/:id/test
 * Send an immediate test ping message to the connected Slack or Discord channel
 */
router.post(
  '/chat-integrations/:id/test',
  requireRole(['owner', 'admin']),
  async (req, res) => {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { id: true, name: true, email: true },
      });

      const result = await sendChatTestPing(id, req.teamId, user);

      if (result.status === 'failed') {
        return res.status(400).json({
          error: `Ping test failed: ${result.error || 'Unknown error'}`,
          delivery: result,
        });
      }

      res.json({
        message: 'Test message sent successfully to channel!',
        delivery: result,
      });
    } catch (error) {
      if (logger && logger.error) {
        logger.error({ err: error }, 'POST /developer/chat-integrations/:id/test failed');
      }
      res.status(400).json({ error: error.message || 'Failed to send test ping' });
    }
  }
);

/**
 * GET /developer/chat-integrations/:id/deliveries
 * List recent notification delivery attempts for an integration
 */
router.get('/chat-integrations/:id/deliveries', async (req, res) => {
  try {
    const { id } = req.params;

    const integration = await prisma.teamChatIntegration.findFirst({
      where: { id, teamId: req.teamId },
    });

    if (!integration) {
      return res.status(404).json({ error: 'Chat integration not found in this team' });
    }

    const deliveries = await prisma.chatIntegrationDelivery.findMany({
      where: { integrationId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({ deliveries });
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'GET /developer/chat-integrations/:id/deliveries failed');
    }
    res.status(500).json({ error: 'Failed to fetch delivery logs' });
  }
});

module.exports = router;

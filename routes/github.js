const express = require('express');
const router = express.Router({ mergeParams: true });
const prisma = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const { sanitize } = require('../middleware/sanitize');
const schemas = require('../validation/schemas');
const logger = require('../middleware/logger');
const {
  generateGitHubWebhookSecret,
  verifyGitHubSignature,
  processGitHubWebhook,
} = require('../services/github');

// ─── 1. Public GitHub Webhook Receivers ──────────────────────────────────────

async function handleProjectWebhook(req, res) {
  try {
    const { projectId } = req.params;
    const signatureHeader = req.headers['x-hub-signature-256'];
    const eventType = req.headers['x-github-event'] || 'unknown';

    const integration = await prisma.projectGitHubIntegration.findUnique({
      where: { projectId },
      include: { project: true, team: true },
    });

    if (!integration) {
      return res.status(404).json({ error: 'GitHub integration not found for this project' });
    }

    if (!integration.isActive) {
      return res.status(400).json({ error: 'GitHub integration is currently disabled' });
    }

    // Verify HMAC-SHA256 signature
    const rawBody = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    const isValid = verifyGitHubSignature({
      rawBody,
      signatureHeader,
      secret: integration.webhookSecret,
    });

    if (!isValid) {
      if (logger && logger.warn) {
        logger.warn({ projectId, eventType }, 'Invalid GitHub webhook HMAC-SHA256 signature rejected');
      }
      return res.status(401).json({ error: 'Invalid HMAC-SHA256 webhook signature' });
    }

    const result = await processGitHubWebhook({
      integration,
      eventType,
      action: req.body?.action,
      payload: req.body,
    });

    res.status(200).json(result);
  } catch (error) {
    if (logger && logger.error) logger.error({ err: error }, 'GitHub webhook processing error');
    res.status(500).json({ error: 'Failed to process GitHub webhook' });
  }
}

async function handleIntegrationWebhook(req, res) {
  try {
    const { integrationId } = req.params;
    const signatureHeader = req.headers['x-hub-signature-256'];
    const eventType = req.headers['x-github-event'] || 'unknown';

    const integration = await prisma.projectGitHubIntegration.findUnique({
      where: { id: integrationId },
      include: { project: true, team: true },
    });

    if (!integration) {
      return res.status(404).json({ error: 'GitHub integration not found' });
    }

    if (!integration.isActive) {
      return res.status(400).json({ error: 'GitHub integration is disabled' });
    }

    const rawBody = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    const isValid = verifyGitHubSignature({
      rawBody,
      signatureHeader,
      secret: integration.webhookSecret,
    });

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid HMAC-SHA256 webhook signature' });
    }

    const result = await processGitHubWebhook({
      integration,
      eventType,
      action: req.body?.action,
      payload: req.body,
    });

    res.status(200).json(result);
  } catch (error) {
    if (logger && logger.error) logger.error({ err: error }, 'GitHub direct webhook error');
    res.status(500).json({ error: 'Failed to process webhook' });
  }
}

router.post('/projects/:projectId/github/webhook', handleProjectWebhook);
router.post('/api/projects/:projectId/github/webhook', handleProjectWebhook);
router.post('/github/webhook/:integrationId', handleIntegrationWebhook);
router.post('/api/github/webhook/:integrationId', handleIntegrationWebhook);

// ─── Protected Routes Middleware ─────────────────────────────────────────────
// All subsequent routes require user authentication and team resolution
router.use(['/projects/:projectId/github', '/projects/:projectId/integrations/github', '/github', '/api/projects/:projectId/github', '/api/github'], requireAuth, resolveTeam);

/**
 * Helper to check project membership & elevated rights
 */
async function getProjectWithAccess(req, res, projectId) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      teamId: req.teamId,
    },
    include: {
      members: true,
    },
  });

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return null;
  }

  const isTeamAdminOrOwner = req.teamRole === 'owner' || req.teamRole === 'admin';
  const isProjectCreator = project.createdById === req.userId;
  const projectMember = project.members.find((m) => m.userId === req.userId);
  const isProjectLead = projectMember && projectMember.role === 'lead';

  return {
    project,
    canManage: isTeamAdminOrOwner || isProjectCreator || isProjectLead,
    isMember: isTeamAdminOrOwner || isProjectCreator || Boolean(projectMember),
  };
}

// ─── 2. Project GitHub Management Endpoints ─────────────────────────────────

/**
 * GET /api/projects/:projectId/github
 * Get GitHub integration status, repo info, and recent resource links
 */
router.get('/projects/:projectId/github', async (req, res) => {
  try {
    const { projectId } = req.params;
    const access = await getProjectWithAccess(req, res, projectId);
    if (!access) return;

    const integration = await prisma.projectGitHubIntegration.findUnique({
      where: { projectId },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        links: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: {
            task: {
              select: { id: true, title: true, status: true },
            },
          },
        },
        _count: {
          select: { links: true, events: true },
        },
      },
    });

    if (!integration) {
      return res.json({
        connected: false,
        integration: null,
      });
    }

    const host = req.get('host') || 'localhost:5000';
    const protocol = req.protocol || 'http';
    const webhookUrl = `${protocol}://${host}/api/projects/${projectId}/github/webhook`;

    res.json({
      connected: true,
      integration: {
        ...integration,
        webhookUrl,
      },
    });
  } catch (error) {
    if (logger && logger.error) logger.error({ err: error }, 'GET /projects/:projectId/github failed');
    res.status(500).json({ error: 'Failed to fetch GitHub integration' });
  }
});

/**
 * POST /api/projects/:projectId/github
 * Connect a GitHub repository to a project (requires management permissions)
 */
router.post(
  '/projects/:projectId/github',
  validate(schemas.projectGitHubCreate),
  async (req, res) => {
    try {
      const { projectId } = req.params;
      const access = await getProjectWithAccess(req, res, projectId);
      if (!access) return;

      if (!access.canManage) {
        return res.status(403).json({ error: 'Only team admins or project leads can configure GitHub integration' });
      }

      // Check if project already has a connection
      const existing = await prisma.projectGitHubIntegration.findUnique({
        where: { projectId },
      });

      if (existing) {
        return res.status(400).json({ error: 'This project is already connected to a GitHub repository' });
      }

      const {
        repoOwner,
        repoName,
        autoCloseTasks = true,
        autoCreateTasksOnIssue = false,
        defaultIssueStatus = 'todo',
        syncBranches = ['main', 'master'],
      } = req.body;

      const cleanOwner = sanitize(repoOwner).trim();
      const cleanRepo = sanitize(repoName).trim();
      const repoFullName = `${cleanOwner}/${cleanRepo}`;
      const webhookSecret = generateGitHubWebhookSecret();

      const integration = await prisma.projectGitHubIntegration.create({
        data: {
          projectId,
          teamId: req.teamId,
          repoOwner: cleanOwner,
          repoName: cleanRepo,
          repoFullName,
          webhookSecret,
          autoCloseTasks: Boolean(autoCloseTasks),
          autoCreateTasksOnIssue: Boolean(autoCreateTasksOnIssue),
          defaultIssueStatus,
          syncBranches,
          createdById: req.userId,
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      const host = req.get('host') || 'localhost:5000';
      const protocol = req.protocol || 'http';
      const webhookUrl = `${protocol}://${host}/api/projects/${projectId}/github/webhook`;

      res.status(201).json({
        integration: {
          ...integration,
          webhookUrl,
        },
        message: 'GitHub repository connected successfully',
      });
    } catch (error) {
      if (logger && logger.error) logger.error({ err: error }, 'POST /projects/:projectId/github failed');
      res.status(500).json({ error: 'Failed to connect GitHub repository' });
    }
  }
);

/**
 * PATCH /api/projects/:projectId/github
 * Update GitHub integration settings
 */
router.patch(
  '/projects/:projectId/github',
  validate(schemas.projectGitHubUpdate),
  async (req, res) => {
    try {
      const { projectId } = req.params;
      const access = await getProjectWithAccess(req, res, projectId);
      if (!access) return;

      if (!access.canManage) {
        return res.status(403).json({ error: 'Only team admins or project leads can update GitHub integration' });
      }

      const existing = await prisma.projectGitHubIntegration.findUnique({
        where: { projectId },
      });

      if (!existing) {
        return res.status(404).json({ error: 'No GitHub integration found for this project' });
      }

      const updateData = {};
      if (req.body.repoOwner !== undefined) updateData.repoOwner = sanitize(req.body.repoOwner).trim();
      if (req.body.repoName !== undefined) updateData.repoName = sanitize(req.body.repoName).trim();
      if (updateData.repoOwner || updateData.repoName) {
        updateData.repoFullName = `${updateData.repoOwner || existing.repoOwner}/${updateData.repoName || existing.repoName}`;
      }
      if (req.body.autoCloseTasks !== undefined) updateData.autoCloseTasks = Boolean(req.body.autoCloseTasks);
      if (req.body.autoCreateTasksOnIssue !== undefined) updateData.autoCreateTasksOnIssue = Boolean(req.body.autoCreateTasksOnIssue);
      if (req.body.defaultIssueStatus !== undefined) updateData.defaultIssueStatus = req.body.defaultIssueStatus;
      if (req.body.syncBranches !== undefined) updateData.syncBranches = req.body.syncBranches;
      if (req.body.isActive !== undefined) updateData.isActive = Boolean(req.body.isActive);

      const updated = await prisma.projectGitHubIntegration.update({
        where: { projectId },
        data: updateData,
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      const host = req.get('host') || 'localhost:5000';
      const protocol = req.protocol || 'http';
      const webhookUrl = `${protocol}://${host}/api/projects/${projectId}/github/webhook`;

      res.json({
        integration: {
          ...updated,
          webhookUrl,
        },
        message: 'GitHub settings updated',
      });
    } catch (error) {
      if (logger && logger.error) logger.error({ err: error }, 'PATCH /projects/:projectId/github failed');
      res.status(500).json({ error: 'Failed to update GitHub integration' });
    }
  }
);

/**
 * DELETE /api/projects/:projectId/github
 * Disconnect GitHub integration from project
 */
router.delete('/projects/:projectId/github', async (req, res) => {
  try {
    const { projectId } = req.params;
    const access = await getProjectWithAccess(req, res, projectId);
    if (!access) return;

    if (!access.canManage) {
      return res.status(403).json({ error: 'Only team admins or project leads can disconnect GitHub integration' });
    }

    const existing = await prisma.projectGitHubIntegration.findUnique({
      where: { projectId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'No GitHub integration found for this project' });
    }

    await prisma.projectGitHubIntegration.delete({
      where: { projectId },
    });

    res.json({ message: 'GitHub integration disconnected successfully' });
  } catch (error) {
    if (logger && logger.error) logger.error({ err: error }, 'DELETE /projects/:projectId/github failed');
    res.status(500).json({ error: 'Failed to disconnect GitHub integration' });
  }
});

/**
 * POST /api/projects/:projectId/github/sync
 * Manually test / simulate sync with GitHub
 */
router.post('/projects/:projectId/github/sync', async (req, res) => {
  try {
    const { projectId } = req.params;
    const access = await getProjectWithAccess(req, res, projectId);
    if (!access) return;

    const integration = await prisma.projectGitHubIntegration.findUnique({
      where: { projectId },
    });

    if (!integration) {
      return res.status(404).json({ error: 'No GitHub integration configured' });
    }

    const updated = await prisma.projectGitHubIntegration.update({
      where: { projectId },
      data: { lastSyncedAt: new Date() },
    });

    res.json({
      message: 'GitHub repository sync verified',
      lastSyncedAt: updated.lastSyncedAt,
    });
  } catch (error) {
    if (logger && logger.error) logger.error({ err: error }, 'POST /projects/:projectId/github/sync failed');
    res.status(500).json({ error: 'Failed to sync GitHub repository' });
  }
});

/**
 * GET /api/projects/:projectId/github/activities
 * List all GitHub resources and activities linked to this project
 */
router.get('/projects/:projectId/github/activities', async (req, res) => {
  try {
    const { projectId } = req.params;
    const access = await getProjectWithAccess(req, res, projectId);
    if (!access) return;

    const links = await prisma.gitHubResourceLink.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        task: {
          select: { id: true, title: true, status: true },
        },
      },
    });

    const events = await prisma.gitHubEvent.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        eventType: true,
        action: true,
        sender: true,
        createdAt: true,
      },
    });

    res.json({ links, events });
  } catch (error) {
    if (logger && logger.error) logger.error({ err: error }, 'GET /projects/:projectId/github/activities failed');
    res.status(500).json({ error: 'Failed to fetch GitHub activities' });
  }
});

// ─── 3. Task-Level GitHub Link Management ────────────────────────────────────

/**
 * GET /api/tasks/:taskId/github
 * List GitHub resources linked to a specific task
 */
router.get('/tasks/:taskId/github', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        teamId: req.teamId,
      },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const links = await prisma.gitHubResourceLink.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ links });
  } catch (error) {
    if (logger && logger.error) logger.error({ err: error }, 'GET /tasks/:taskId/github failed');
    res.status(500).json({ error: 'Failed to fetch task GitHub links' });
  }
});

/**
 * POST /api/tasks/:taskId/github/link
 * Manually link a GitHub PR, issue, or commit to a task
 */
router.post(
  '/tasks/:taskId/github/link',
  validate(schemas.githubManualLink),
  async (req, res) => {
    try {
      const { taskId } = req.params;
      const task = await prisma.task.findFirst({
        where: {
          id: taskId,
          teamId: req.teamId,
        },
      });

      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      if (!task.projectId) {
        return res.status(400).json({ error: 'Task must belong to a project to link GitHub resources' });
      }

      // Check if project has GitHub integration
      const integration = await prisma.projectGitHubIntegration.findUnique({
        where: { projectId: task.projectId },
      });

      if (!integration) {
        return res.status(400).json({ error: 'The parent project does not have GitHub integration enabled' });
      }

      const {
        resourceType,
        resourceNumber,
        resourceRef,
        title,
        url,
        author,
        status = 'open',
        metadata = {},
      } = req.body;

      const link = await prisma.gitHubResourceLink.create({
        data: {
          integrationId: integration.id,
          projectId: task.projectId,
          taskId: task.id,
          resourceType,
          resourceNumber: resourceNumber ? Number(resourceNumber) : null,
          resourceRef: sanitize(resourceRef),
          title: sanitize(title),
          url: sanitize(url),
          author: author ? sanitize(author) : null,
          status: status ? sanitize(status) : 'open',
          metadata: metadata || {},
        },
      });

      res.status(201).json({
        link,
        message: 'GitHub resource linked to task successfully',
      });
    } catch (error) {
      if (logger && logger.error) logger.error({ err: error }, 'POST /tasks/:taskId/github/link failed');
      res.status(500).json({ error: 'Failed to link GitHub resource' });
    }
  }
);

/**
 * DELETE /api/tasks/:taskId/github/link/:linkId
 * Unlink a GitHub resource from a task
 */
router.delete('/tasks/:taskId/github/link/:linkId', async (req, res) => {
  try {
    const { taskId, linkId } = req.params;
    const link = await prisma.gitHubResourceLink.findFirst({
      where: {
        id: linkId,
        taskId,
      },
    });

    if (!link) {
      return res.status(404).json({ error: 'GitHub link not found' });
    }

    await prisma.gitHubResourceLink.delete({
      where: { id: linkId },
    });

    res.json({ message: 'GitHub resource unlinked successfully' });
  } catch (error) {
    if (logger && logger.error) logger.error({ err: error }, 'DELETE /tasks/:taskId/github/link/:linkId failed');
    res.status(500).json({ error: 'Failed to unlink GitHub resource' });
  }
});

module.exports = router;

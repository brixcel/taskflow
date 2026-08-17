const http = require('http');
const https = require('https');
const { URL } = require('url');
const prisma = require('../prisma');
const logger = require('../middleware/logger');

const VALID_CHAT_EVENTS = [
  'task_assigned',
  'task_completed',
  'task_overdue',
  'project_updated',
  'comment_created',
  'ping',
];

/**
 * Checks if an IP or hostname is private/internal (SSRF Prevention)
 */
function isPrivateOrInternalHost(hostname) {
  if (!hostname) return true;
  const lower = hostname.toLowerCase();

  // Localhost & metadata
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower === '169.254.169.254' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower.endsWith('.localhost')
  ) {
    return true;
  }

  // IPv4 Private subnets
  const ipParts = lower.split('.').map(Number);
  if (ipParts.length === 4 && ipParts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    const [a, b] = ipParts;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16
    if (a === 0) return true;
  }

  return false;
}

/**
 * Validates a webhook URL for Slack or Discord against SSRF and format rules
 */
function validateChatWebhookUrl(urlString, provider = null) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, error: 'Webhook URL must use HTTP or HTTPS protocol' };
    }

    if (isPrivateOrInternalHost(parsed.hostname)) {
      return { valid: false, error: 'Webhook URL cannot point to localhost or private network address' };
    }

    if (provider === 'slack') {
      if (!parsed.hostname.endsWith('slack.com')) {
        return { valid: false, error: 'Slack webhook URL must be on hooks.slack.com domain' };
      }
    } else if (provider === 'discord') {
      if (!parsed.hostname.endsWith('discord.com') && !parsed.hostname.endsWith('discordapp.com')) {
        return { valid: false, error: 'Discord webhook URL must be on discord.com or discordapp.com domain' };
      }
    }

    return { valid: true, url: parsed.toString() };
  } catch (err) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Masks sensitive token in webhook URL for safe UI/API display
 * e.g. https://hooks.slack.com/services/T123/B456/abcdef... -> https://hooks.slack.com/services/T123/B456/••••••••
 */
function maskWebhookUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return '';
  try {
    const parsed = new URL(urlString);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      pathParts[pathParts.length - 1] = '••••••••';
      return `${parsed.protocol}//${parsed.host}/${pathParts.join('/')}`;
    }
    return `${parsed.protocol}//${parsed.host}/••••••••`;
  } catch {
    return '••••••••';
  }
}

/**
 * Builds Slack Block Kit payload with SyncTask branding
 */
function buildSlackPayload({ event, task, project, actor, comment, details, includeDetails = false }) {
  const appUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (event === 'ping') {
    return {
      text: '🔔 SyncTask Slack Integration Ping Test',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '⚡ SyncTask Notification Connected',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Success!* This Slack channel is now actively connected to *SyncTask* for team workspace notifications.\n*Channel:* ${details?.channelName || 'Default'} · *Triggered by:* ${actor?.name || 'Workspace Admin'}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `SyncTask 2.0 Integration · ${new Date().toUTCString()}`,
            },
          ],
        },
      ],
    };
  }

  let headline = 'SyncTask Notification';
  let color = '#0070f3';
  let messageText = '';

  switch (event) {
    case 'task_assigned':
      headline = `📋 Task Assigned: ${task?.title || 'New Task'}`;
      color = '#0070f3';
      messageText = `*${actor?.name || 'A team member'}* assigned *${task?.title}* to *${task?.assignee?.name || 'you'}*.`;
      break;
    case 'task_completed':
      headline = `✅ Task Completed: ${task?.title || 'Task'}`;
      color = '#10b981';
      messageText = `*${actor?.name || 'A team member'}* marked *${task?.title}* as completed.`;
      break;
    case 'task_overdue':
      headline = `⚠️ Task Overdue: ${task?.title || 'Task'}`;
      color = '#ef4444';
      messageText = `Task *${task?.title}* was due on *${task?.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'N/A'}* and is currently overdue.`;
      break;
    case 'project_updated':
      headline = `🚀 Project Updated: ${project?.name || 'Project'}`;
      color = '#8b5cf6';
      messageText = `Project *${project?.name}* status updated to *${project?.status || 'active'}*.`;
      break;
    case 'comment_created':
      headline = `💬 New Comment on: ${task?.title || 'Task'}`;
      color = '#6366f1';
      messageText = `*${actor?.name || 'A user'}* commented: _"${comment?.content?.slice(0, 140) || ''}"_`;
      break;
    default:
      messageText = `Activity update on ${task?.title || project?.name || 'workspace'}.`;
  }

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: headline,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: messageText,
      },
    },
  ];

  // Metadata Fields Section
  const fields = [];
  if (task?.priority) {
    fields.push({
      type: 'mrkdwn',
      text: `*Priority:*\n${task.priority.toUpperCase()}`,
    });
  }
  if (task?.status) {
    fields.push({
      type: 'mrkdwn',
      text: `*Status:*\n${task.status.replace('_', ' ').toUpperCase()}`,
    });
  }
  if (project?.name) {
    fields.push({
      type: 'mrkdwn',
      text: `*Project:*\n${project.name}`,
    });
  }
  if (task?.dueDate) {
    fields.push({
      type: 'mrkdwn',
      text: `*Due Date:*\n${new Date(task.dueDate).toLocaleDateString()}`,
    });
  }

  if (fields.length > 0) {
    blocks.push({
      type: 'section',
      fields,
    });
  }

  // Include description if permitted by privacy settings
  if (includeDetails && task?.description) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Description:*\n>${task.description.split('\n').join('\n>')}`,
      },
    });
  }

  // Action button to open in SyncTask
  if (task?.id) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Open in SyncTask',
            emoji: true,
          },
          url: `${appUrl}/?task=${task.id}`,
          style: 'primary',
        },
      ],
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `SyncTask 2.0 · ${new Date().toLocaleTimeString()} · ST AI Workspace`,
      },
    ],
  });

  return {
    text: headline,
    blocks,
  };
}

/**
 * Builds Discord Embed payload with SyncTask branding
 */
function buildDiscordPayload({ event, task, project, actor, comment, details, includeDetails = false }) {
  const appUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (event === 'ping') {
    return {
      username: 'SyncTask Notifications',
      avatar_url: 'https://synctask.local/logo.png',
      embeds: [
        {
          title: '⚡ SyncTask Notification Connected',
          description: `**Success!** This Discord channel is now connected to **SyncTask**.\n**Channel:** ${details?.channelName || 'Default'}\n**Triggered by:** ${actor?.name || 'Workspace Admin'}`,
          color: 0x00d2ff, // SyncTask Electric Cyan
          footer: {
            text: 'SyncTask 2.0 Integration · ST AI',
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  let title = 'SyncTask Notification';
  let description = '';
  let color = 0x0070f3; // Default Blue

  switch (event) {
    case 'task_assigned':
      title = `📋 Task Assigned: ${task?.title || 'New Task'}`;
      color = 0x00a8ff;
      description = `**${actor?.name || 'A team member'}** assigned this task to **${task?.assignee?.name || 'you'}**.`;
      break;
    case 'task_completed':
      title = `✅ Task Completed: ${task?.title || 'Task'}`;
      color = 0x10b981; // Green
      description = `**${actor?.name || 'A team member'}** marked this task as **completed**.`;
      break;
    case 'task_overdue':
      title = `⚠️ Task Overdue: ${task?.title || 'Task'}`;
      color = 0xef4444; // Red
      description = `This task was due on **${task?.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'N/A'}** and is currently overdue.`;
      break;
    case 'project_updated':
      title = `🚀 Project Updated: ${project?.name || 'Project'}`;
      color = 0x8b5cf6; // Purple
      description = `Project **${project?.name}** status changed to **${project?.status || 'active'}**.`;
      break;
    case 'comment_created':
      title = `💬 New Comment on ${task?.title || 'Task'}`;
      color = 0x6366f1; // Indigo
      description = `**${actor?.name || 'A user'}**: "${comment?.content?.slice(0, 180) || ''}"`;
      break;
    default:
      description = `Activity update on ${task?.title || project?.name || 'workspace'}.`;
  }

  const fields = [];
  if (task?.status) {
    fields.push({ name: 'Status', value: task.status.replace('_', ' ').toUpperCase(), inline: true });
  }
  if (task?.priority) {
    fields.push({ name: 'Priority', value: task.priority.toUpperCase(), inline: true });
  }
  if (project?.name) {
    fields.push({ name: 'Project', value: project.name, inline: true });
  }
  if (task?.dueDate) {
    fields.push({ name: 'Due Date', value: new Date(task.dueDate).toLocaleDateString(), inline: true });
  }

  if (includeDetails && task?.description) {
    fields.push({ name: 'Description', value: task.description.slice(0, 500), inline: false });
  }

  const taskUrl = task?.id ? `${appUrl}/?task=${task.id}` : null;

  return {
    username: 'SyncTask',
    embeds: [
      {
        title,
        url: taskUrl,
        description,
        color,
        fields,
        footer: {
          text: 'SyncTask 2.0 · ST AI Workspace',
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Delivers a notification payload via HTTP POST to a Slack or Discord webhook endpoint
 */
async function deliverChatNotification(integration, event, data, { prismaInstance = prisma } = {}) {
  const startTime = Date.now();
  const provider = integration.provider.toLowerCase();

  const payloadObject =
    provider === 'discord'
      ? buildDiscordPayload({
          event,
          task: data.task,
          project: data.project,
          actor: data.actor,
          comment: data.comment,
          details: data.details,
          includeDetails: integration.includePrivateDetails,
        })
      : buildSlackPayload({
          event,
          task: data.task,
          project: data.project,
          actor: data.actor,
          comment: data.comment,
          details: data.details,
          includeDetails: integration.includePrivateDetails,
        });

  const payloadString = JSON.stringify(payloadObject);

  try {
    const urlValidation = validateChatWebhookUrl(integration.webhookUrl, provider);
    if (!urlValidation.valid) {
      throw new Error(urlValidation.error);
    }

    const parsedUrl = new URL(integration.webhookUrl);
    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const deliveryResult = await new Promise((resolve, reject) => {
      const req = transport.request(
        parsedUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payloadString),
            'User-Agent': 'SyncTask-Chat-Integration/2.0',
          },
          timeout: 5000,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              responseBody: body ? body.slice(0, 1000) : null,
            });
          });
        }
      );

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Webhook request timed out after 5000ms'));
      });

      req.write(payloadString);
      req.end();
    });

    const durationMs = Date.now() - startTime;
    const isSuccess = deliveryResult.statusCode >= 200 && deliveryResult.statusCode < 300;

    // Record Delivery & update integration health
    const delivery = await prismaInstance.chatIntegrationDelivery.create({
      data: {
        integrationId: integration.id,
        event,
        payload: payloadObject,
        statusCode: deliveryResult.statusCode,
        responseBody: deliveryResult.responseBody,
        durationMs,
        status: isSuccess ? 'success' : 'failed',
        error: isSuccess ? null : `HTTP Status ${deliveryResult.statusCode}`,
        deliveredAt: new Date(),
      },
    });

    await prismaInstance.teamChatIntegration.update({
      where: { id: integration.id },
      data: {
        lastTriggeredAt: new Date(),
        lastStatus: isSuccess ? 'success' : 'failed',
        lastError: isSuccess ? null : `HTTP Status ${deliveryResult.statusCode}`,
      },
    });

    return delivery;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err.message || 'Delivery error';

    const delivery = await prismaInstance.chatIntegrationDelivery.create({
      data: {
        integrationId: integration.id,
        event,
        payload: payloadObject,
        statusCode: null,
        responseBody: null,
        durationMs,
        status: 'failed',
        error: errorMsg,
        deliveredAt: new Date(),
      },
    });

    await prismaInstance.teamChatIntegration.update({
      where: { id: integration.id },
      data: {
        lastTriggeredAt: new Date(),
        lastStatus: 'failed',
        lastError: errorMsg,
      },
    });

    return delivery;
  }
}

/**
 * Dispatches an event to all matching active Slack / Discord integrations in a team
 */
async function dispatchChatEvent(teamId, event, data, { prismaInstance = prisma } = {}) {
  if (!teamId || !event) return [];

  try {
    const integrations = await prismaInstance.teamChatIntegration.findMany({
      where: {
        teamId,
        isActive: true,
      },
    });

    if (!integrations || integrations.length === 0) return [];

    const matching = integrations.filter((item) => {
      // 1. Event subscription check
      const subEvents = item.events || [];
      const hasEvent = subEvents.includes('*') || subEvents.includes(event);
      if (!hasEvent) return false;

      // 2. Project filter check
      if (item.filterProjectId && data.task?.projectId) {
        if (item.filterProjectId !== data.task.projectId) return false;
      } else if (item.filterProjectId && data.project?.id) {
        if (item.filterProjectId !== data.project.id) return false;
      }

      return true;
    });

    if (matching.length === 0) return [];

    const deliveryPromises = matching.map((integration) =>
      deliverChatNotification(integration, event, data, { prismaInstance })
    );

    return await Promise.allSettled(deliveryPromises);
  } catch (err) {
    if (logger && logger.error) {
      logger.error({ err }, 'dispatchChatEvent error');
    }
    return [];
  }
}

/**
 * Sends a live test verification ping to a specific Slack or Discord integration
 */
async function sendChatTestPing(integrationId, teamId, actor, { prismaInstance = prisma } = {}) {
  const integration = await prismaInstance.teamChatIntegration.findFirst({
    where: { id: integrationId, teamId },
  });

  if (!integration) {
    throw new Error('Chat integration not found in this team');
  }

  const pingData = {
    actor,
    details: {
      channelName: integration.channelName,
    },
  };

  return await deliverChatNotification(integration, 'ping', pingData, { prismaInstance });
}

module.exports = {
  VALID_CHAT_EVENTS,
  validateChatWebhookUrl,
  maskWebhookUrl,
  buildSlackPayload,
  buildDiscordPayload,
  deliverChatNotification,
  dispatchChatEvent,
  sendChatTestPing,
};

const crypto = require('crypto');
const prisma = require('../prisma');
const logger = require('../middleware/logger');
const {
  emitTaskCreated,
  emitTaskUpdated,
  emitActivityCreated,
} = require('./realtime');

/**
 * Generate a secure secret for GitHub webhooks
 */
function generateGitHubWebhookSecret() {
  return `gh_whsec_${crypto.randomBytes(24).toString('hex')}`;
}

/**
 * Verify HMAC-SHA256 signature from GitHub webhook request
 * GitHub sends: `X-Hub-Signature-256: sha256=<hex_digest>`
 */
function verifyGitHubSignature({ rawBody, signatureHeader, secret }) {
  if (!signatureHeader || !secret || !rawBody) {
    return false;
  }

  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return false;
  }

  const signatureHex = parts[1];
  const computedHex = crypto
    .createHmac('sha256', secret)
    .update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'))
    .digest('hex');

  const sigBuffer = Buffer.from(signatureHex, 'hex');
  const compBuffer = Buffer.from(computedHex, 'hex');

  if (sigBuffer.length !== compBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, compBuffer);
}

/**
 * Extract task references and closing intents from commit messages or PR bodies
 * Supported formats:
 * - Direct UUIDs: 123e4567-e89b-12d3-a456-426614174000
 * - Task short codes: TF-12, [TF-45]
 * - Closing keywords: fixes #12, closes TF-5, resolved task-uuid
 */
function extractTaskReferences(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const results = [];
  const seen = new Set();

  // Closing keywords regex
  const closingRegex = /\b(close[sd]?|fix(es|ed)?|resolve[sd]?)\s+([A-Za-z0-9\-_#]+)/gi;
  let match;
  while ((match = closingRegex.exec(text)) !== null) {
    const rawRef = match[3];
    const cleanRef = rawRef.replace(/^#/, '');
    const key = `closing:${cleanRef.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({
        reference: cleanRef,
        raw: match[0],
        isClosing: true,
      });
    }
  }

  // General references regex: TF-123 or UUID
  const generalRegex = /\b(TF-\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi;
  while ((match = generalRegex.exec(text)) !== null) {
    const rawRef = match[0];
    const key = `ref:${rawRef.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      const isAlreadyClosing = results.some(
        (r) => r.reference.toLowerCase() === rawRef.toLowerCase() && r.isClosing
      );
      if (!isAlreadyClosing) {
        results.push({
          reference: rawRef,
          raw: rawRef,
          isClosing: false,
        });
      }
    }
  }

  return results;
}

/**
 * Find matching tasks in the project given extracted references
 */
async function findMatchingTasks({ projectId, teamId, references }) {
  if (!references || references.length === 0) return [];

  const matchedTasks = [];
  for (const refItem of references) {
    const ref = refItem.reference;

    // Check by ID (if valid UUID)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
    if (isUUID) {
      const task = await prisma.task.findFirst({
        where: {
          id: ref,
          projectId,
          teamId,
        },
      });
      if (task) {
        matchedTasks.push({ task, isClosing: refItem.isClosing });
        continue;
      }
    }

    // Check by title search (e.g. title starts with or contains "[TF-12]" or "TF-12")
    const taskByTitle = await prisma.task.findFirst({
      where: {
        projectId,
        teamId,
        OR: [
          { title: { contains: ref, mode: 'insensitive' } },
          { labels: { has: ref } },
          { labels: { has: `#${ref}` } },
        ],
      },
    });

    if (taskByTitle) {
      matchedTasks.push({ task: taskByTitle, isClosing: refItem.isClosing });
    }
  }

  return matchedTasks;
}

/**
 * Helper to close a task and record activity & comment
 */
async function autoCloseTask({ task, integration, reasonMessage, sourceUrl, actorName }) {
  if (task.status === 'done') {
    return task;
  }

  const updatedTask = await prisma.task.update({
    where: { id: task.id },
    data: { status: 'done' },
  });

  // Log activity
  try {
    const activity = await prisma.activity.create({
      data: {
        action: 'status_change',
        details: JSON.stringify({
          oldStatus: task.status,
          newStatus: 'done',
          source: 'github_automation',
          message: reasonMessage,
          url: sourceUrl,
          actor: actorName || 'GitHub',
        }),
        taskId: task.id,
        userId: integration.createdById,
      },
    });
    emitActivityCreated(activity, integration.teamId);
  } catch (err) {
    if (logger && logger.warn) logger.warn({ err }, 'Failed to record activity for GitHub auto-close');
  }

  // Create automated comment
  try {
    await prisma.comment.create({
      data: {
        content: `🤖 **TaskFlow GitHub Integration**: Closed automatically via ${reasonMessage}.${sourceUrl ? ` [View on GitHub](${sourceUrl})` : ''}`,
        taskId: task.id,
        authorId: integration.createdById,
      },
    });
  } catch (err) {
    if (logger && logger.warn) logger.warn({ err }, 'Failed to post comment for GitHub auto-close');
  }

  emitTaskUpdated(updatedTask, integration.teamId);
  return updatedTask;
}

/**
 * Main Webhook Dispatcher
 */
async function processGitHubWebhook({ integration, eventType, action, payload }) {
  const integrationId = integration.id;
  const projectId = integration.projectId;
  const teamId = integration.teamId;

  // 1. Audit log the incoming GitHub event
  let savedEvent = null;
  try {
    savedEvent = await prisma.gitHubEvent.create({
      data: {
        integrationId,
        projectId,
        eventType: eventType || 'unknown',
        action: action || payload.action || null,
        sender: payload.sender?.login || 'github',
        payload: payload || {},
        processed: true,
      },
    });
  } catch (e) {
    if (logger && logger.warn) logger.warn({ err: e }, 'Could not persist GitHubEvent');
  }

  // 2. Handle specific event types
  if (eventType === 'ping') {
    await prisma.projectGitHubIntegration.update({
      where: { id: integrationId },
      data: { lastSyncedAt: new Date() },
    });
    return {
      success: true,
      event: 'ping',
      zen: payload.zen,
      hookId: payload.hook_id,
    };
  }

  if (eventType === 'pull_request') {
    const pr = payload.pull_request;
    if (!pr) return { success: false, error: 'Missing pull_request payload' };

    const prNumber = pr.number;
    const prTitle = pr.title || '';
    const prBody = pr.body || '';
    const prUrl = pr.html_url || '';
    const prAuthor = pr.user?.login || 'unknown';
    const isMerged = Boolean(pr.merged);
    const prStatus = isMerged ? 'merged' : pr.state || 'open';

    const fullText = `${prTitle}\n${prBody}\n${pr.head?.ref || ''}`;
    const references = extractTaskReferences(fullText);

    // Find matched tasks
    const matched = await findMatchingTasks({ projectId, teamId, references });

    // Link resource to first matched task or project
    const primaryTaskId = matched.length > 0 ? matched[0].task.id : null;

    const resourceLink = await prisma.gitHubResourceLink.create({
      data: {
        integrationId,
        projectId,
        taskId: primaryTaskId,
        resourceType: 'pull_request',
        resourceNumber: prNumber,
        resourceRef: `PR #${prNumber}`,
        title: prTitle,
        url: prUrl,
        author: prAuthor,
        status: prStatus,
        metadata: {
          action,
          merged: isMerged,
          base: pr.base?.ref,
          head: pr.head?.ref,
        },
      },
    });

    // Check automation: PR merged or closed
    const closedTasks = [];
    if (isMerged && integration.autoCloseTasks) {
      for (const { task } of matched) {
        const closed = await autoCloseTask({
          task,
          integration,
          reasonMessage: `Pull Request #${prNumber} merged by ${prAuthor}`,
          sourceUrl: prUrl,
          actorName: prAuthor,
        });
        closedTasks.push(closed.id);
      }
    }

    await prisma.projectGitHubIntegration.update({
      where: { id: integrationId },
      data: { lastSyncedAt: new Date() },
    });

    return {
      success: true,
      event: 'pull_request',
      action,
      resourceLink,
      closedTasks,
    };
  }

  if (eventType === 'push') {
    const commits = payload.commits || [];
    const branchRef = payload.ref || '';
    const branchName = branchRef.replace('refs/heads/', '');
    const pusher = payload.pusher?.name || payload.sender?.login || 'git';

    const processedCommits = [];
    const closedTasks = [];

    for (const commit of commits) {
      const commitSha = commit.id ? commit.id.substring(0, 7) : 'commit';
      const commitMessage = commit.message || '';
      const commitUrl = commit.url || payload.compare || '';
      const commitAuthor = commit.author?.username || commit.author?.name || pusher;

      const references = extractTaskReferences(commitMessage);
      const matched = await findMatchingTasks({ projectId, teamId, references });
      const primaryTaskId = matched.length > 0 ? matched[0].task.id : null;

      const link = await prisma.gitHubResourceLink.create({
        data: {
          integrationId,
          projectId,
          taskId: primaryTaskId,
          resourceType: 'commit',
          resourceRef: `Commit ${commitSha}`,
          title: commitMessage.split('\n')[0],
          url: commitUrl,
          author: commitAuthor,
          status: 'committed',
          metadata: {
            sha: commit.id,
            branch: branchName,
          },
        },
      });
      processedCommits.push(link);

      // Auto close tasks if message has closing keyword and integration is configured
      if (integration.autoCloseTasks) {
        for (const { task, isClosing } of matched) {
          if (isClosing) {
            const closed = await autoCloseTask({
              task,
              integration,
              reasonMessage: `Commit ${commitSha} on branch ${branchName} ("${commitMessage.split('\n')[0]}")`,
              sourceUrl: commitUrl,
              actorName: commitAuthor,
            });
            closedTasks.push(closed.id);
          }
        }
      }
    }

    await prisma.projectGitHubIntegration.update({
      where: { id: integrationId },
      data: { lastSyncedAt: new Date() },
    });

    return {
      success: true,
      event: 'push',
      branch: branchName,
      commitsCount: commits.length,
      processedCommits,
      closedTasks,
    };
  }

  if (eventType === 'issues') {
    const issue = payload.issue;
    if (!issue) return { success: false, error: 'Missing issue payload' };

    const issueNumber = issue.number;
    const issueTitle = issue.title || '';
    const issueBody = issue.body || '';
    const issueUrl = issue.html_url || '';
    const issueAuthor = issue.user?.login || 'unknown';
    const issueState = issue.state || 'open';

    let createdTaskId = null;
    let primaryTaskId = null;

    // Check if auto-create tasks from new GitHub issues is enabled
    if (action === 'opened' && integration.autoCreateTasksOnIssue) {
      const newTask = await prisma.task.create({
        data: {
          title: `[#${issueNumber}] ${issueTitle}`,
          description: `${issueBody}\n\n---\n*Created from GitHub Issue [#${issueNumber}](${issueUrl}) by @${issueAuthor}*`,
          status: integration.defaultIssueStatus || 'todo',
          priority: 'medium',
          labels: ['github-issue', `#${issueNumber}`],
          teamId,
          projectId,
          createdById: integration.createdById,
        },
      });
      createdTaskId = newTask.id;
      primaryTaskId = newTask.id;
      emitTaskCreated(newTask, teamId);
    } else {
      // Look for existing issue link in database first
      const existingLink = await prisma.gitHubResourceLink.findFirst({
        where: {
          projectId,
          resourceType: 'issue',
          resourceNumber: issueNumber,
        },
      });

      if (existingLink && existingLink.taskId) {
        primaryTaskId = existingLink.taskId;
      } else {
        // Look for task reference in issue body/title
        const references = extractTaskReferences(`${issueTitle}\n${issueBody}`);
        const matched = await findMatchingTasks({ projectId, teamId, references });
        if (matched.length > 0) {
          primaryTaskId = matched[0].task.id;
        }
      }
    }

    const resourceLink = await prisma.gitHubResourceLink.create({
      data: {
        integrationId,
        projectId,
        taskId: primaryTaskId,
        resourceType: 'issue',
        resourceNumber: issueNumber,
        resourceRef: `Issue #${issueNumber}`,
        title: issueTitle,
        url: issueUrl,
        author: issueAuthor,
        status: issueState,
        metadata: {
          action,
          state: issueState,
        },
      },
    });

    // Auto close linked task if issue is closed
    const closedTasks = [];
    if (action === 'closed' && integration.autoCloseTasks && primaryTaskId) {
      const existingTask = await prisma.task.findUnique({ where: { id: primaryTaskId } });
      if (existingTask) {
        const closed = await autoCloseTask({
          task: existingTask,
          integration,
          reasonMessage: `GitHub Issue #${issueNumber} closed by ${payload.sender?.login || issueAuthor}`,
          sourceUrl: issueUrl,
          actorName: payload.sender?.login || issueAuthor,
        });
        closedTasks.push(closed.id);
      }
    }

    await prisma.projectGitHubIntegration.update({
      where: { id: integrationId },
      data: { lastSyncedAt: new Date() },
    });

    return {
      success: true,
      event: 'issues',
      action,
      resourceLink,
      createdTaskId,
      closedTasks,
    };
  }

  return {
    success: true,
    message: `Event ${eventType} received and logged`,
  };
}

module.exports = {
  generateGitHubWebhookSecret,
  verifyGitHubSignature,
  extractTaskReferences,
  processGitHubWebhook,
  findMatchingTasks,
  autoCloseTask,
};

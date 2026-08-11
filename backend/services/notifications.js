const prisma = require('../prisma');

/**
 * Default notification preferences for any user.
 */
const DEFAULT_PREFERENCES = {
  taskAssigned:        true,
  statusChanged:       true,
  commentsAndMentions: true,
  dueDates:            true,
  teamUpdates:         true,
  emailNotifications:  false,
};

/**
 * Retrieve or initialize notification preferences for a user.
 */
async function getUserPreferences(userId) {
  if (!userId) return DEFAULT_PREFERENCES;
  try {
    let prefs = await prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (!prefs) {
      prefs = await prisma.notificationPreference.create({
        data: {
          userId,
          ...DEFAULT_PREFERENCES,
        },
      });
    }
    return prefs;
  } catch (err) {
    console.error('Error fetching notification preferences:', err);
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Check if a specific notification type is enabled by the user's preferences.
 */
function isTypeEnabled(type, prefs) {
  if (!prefs) return true;
  switch (type) {
    case 'task_assigned':
    case 'task_reassigned':
      return prefs.taskAssigned !== false;

    case 'status_changed':
    case 'task_completed':
      return prefs.statusChanged !== false;

    case 'mention':
    case 'comment_created':
      return prefs.commentsAndMentions !== false;

    case 'due_date_approaching':
    case 'overdue':
      return prefs.dueDates !== false;

    case 'team_invitation':
    case 'role_changed':
      return prefs.teamUpdates !== false;

    default:
      return true;
  }
}

/**
 * Create a notification record if allowed by preferences and team permissions.
 */
async function createNotification({ userId, actorId = null, teamId = null, taskId = null, type, title, message, data = null }) {
  try {
    // Never notify an actor of their own direct action
    if (!userId || (actorId && actorId === userId)) {
      return null;
    }

    // Verify recipient user exists and is active
    const recipient = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isDeleted: true },
    });
    if (!recipient || recipient.isDeleted) {
      return null;
    }

    // If teamId is specified, verify recipient is actually a member of the team
    if (teamId) {
      const membership = await prisma.teamMembership.findUnique({
        where: { userId_teamId: { userId, teamId } },
      });
      if (!membership) {
        return null;
      }
    }

    // Check user preferences
    const prefs = await getUserPreferences(userId);
    if (!isTypeEnabled(type, prefs)) {
      return null;
    }

    // Create notification
    const notification = await prisma.notification.create({
      data: {
        userId,
        actorId: actorId || null,
        teamId:  teamId  || null,
        taskId:  taskId  || null,
        type,
        title,
        message,
        data:    data || null,
      },
      include: {
        actor: { select: { id: true, name: true, email: true } },
        task:  { select: { id: true, title: true, status: true } },
        team:  { select: { id: true, name: true } },
      },
    });

    // Real-time broadcast to user's private channel
    try {
      const { emitNotification } = require('./realtime');
      emitNotification(userId, notification);
    } catch (realtimeErr) {
      // Non-blocking if realtime service is offline or in mock
    }

    return notification;
  } catch (err) {
    console.error('Failed to create notification:', err);
    return null;
  }
}

/**
 * Parse `@mentions` (e.g. `@john` or `@john@example.com` or `@"John Doe"`) in text
 * and find corresponding active members in the given team.
 */
async function parseMentions(content, teamId) {
  if (!content || !teamId) return [];

  // Match @username, @email, or @"Full Name"
  const mentionMatches = content.match(/@(?:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})|"([^"]+)"|([a-zA-Z0-9_\-\.]+))/g);
  if (!mentionMatches || mentionMatches.length === 0) return [];

  const rawTokens = mentionMatches.map((m) => m.replace(/^@"?|"?$/g, '').toLowerCase().trim());
  const uniqueTokens = Array.from(new Set(rawTokens)).filter(Boolean);

  if (uniqueTokens.length === 0) return [];

  const teamMembers = await prisma.teamMembership.findMany({
    where: { teamId },
    include: {
      user: {
        select: { id: true, name: true, email: true, isDeleted: true },
      },
    },
  });

  const matchedUsers = [];
  for (const token of uniqueTokens) {
    for (const { user } of teamMembers) {
      if (user.isDeleted) continue;
      const emailMatch = user.email.toLowerCase() === token;
      const nameMatch  = user.name.toLowerCase() === token || user.name.toLowerCase().replace(/\s+/g, '') === token;
      if (emailMatch || nameMatch) {
        if (!matchedUsers.some((u) => u.id === user.id)) {
          matchedUsers.push(user);
        }
      }
    }
  }

  return matchedUsers;
}

/**
 * Check for approaching due dates (within 24h) and overdue tasks,
 * and dispatch notifications if not sent within the last 24h.
 */
async function checkDueDates() {
  const now = new Date();
  const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  let notificationsSent = 0;

  // 1. Approaching due date tasks
  const approachingTasks = await prisma.task.findMany({
    where: {
      status:  { not: 'done' },
      dueDate: { gte: now, lte: next24h },
      assigneeId: { not: null },
    },
    include: {
      assignee: { select: { id: true, name: true } },
    },
  });

  for (const task of approachingTasks) {
    if (!task.assigneeId) continue;
    // Check if notification already sent in last 24h
    const existing = await prisma.notification.findFirst({
      where: {
        userId:    task.assigneeId,
        taskId:    task.id,
        type:      'due_date_approaching',
        createdAt: { gte: last24h },
      },
    });

    if (!existing) {
      await createNotification({
        userId:  task.assigneeId,
        teamId:  task.teamId,
        taskId:  task.id,
        type:    'due_date_approaching',
        title:   'Task due soon',
        message: `Task "${task.title}" is due soon (${new Date(task.dueDate).toLocaleDateString()})`,
        data:    { taskId: task.id, taskTitle: task.title, dueDate: task.dueDate },
      });
      notificationsSent++;
    }
  }

  // 2. Overdue tasks
  const overdueTasks = await prisma.task.findMany({
    where: {
      status:  { not: 'done' },
      dueDate: { lt: now },
      assigneeId: { not: null },
    },
    include: {
      assignee: { select: { id: true, name: true } },
    },
  });

  for (const task of overdueTasks) {
    if (!task.assigneeId) continue;
    // Check if overdue notification already sent in last 24h
    const existing = await prisma.notification.findFirst({
      where: {
        userId:    task.assigneeId,
        taskId:    task.id,
        type:      'overdue',
        createdAt: { gte: last24h },
      },
    });

    if (!existing) {
      await createNotification({
        userId:  task.assigneeId,
        teamId:  task.teamId,
        taskId:  task.id,
        type:    'overdue',
        title:   'Task overdue',
        message: `Task "${task.title}" is overdue (was due ${new Date(task.dueDate).toLocaleDateString()})`,
        data:    { taskId: task.id, taskTitle: task.title, dueDate: task.dueDate },
      });
      notificationsSent++;
    }
  }

  return {
    scannedApproaching: approachingTasks.length,
    scannedOverdue:     overdueTasks.length,
    notificationsSent,
  };
}

module.exports = {
  DEFAULT_PREFERENCES,
  getUserPreferences,
  isTypeEnabled,
  createNotification,
  parseMentions,
  checkDueDates,
};

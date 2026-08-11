const express = require('express');
const prisma = require('../prisma');
const requireAuth = require('../middleware/auth');
const validate = require('../middleware/validate');
const schemas = require('../validation/schemas');
const {
  getUserPreferences,
  checkDueDates,
} = require('../services/notifications');

const router = express.Router();

// All notification routes require authentication
router.use(requireAuth);

// ─── GET /notifications — list paginated notifications for current user ───────
router.get('/', validate(schemas.notificationQuery, 'query'), async (req, res) => {
  try {
    const { unread, type, teamId } = req.query;
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip  = (page - 1) * limit;

    const where = { userId: req.userId };
    if (unread === 'true')  where.read = false;
    if (unread === 'false') where.read = true;
    if (type)               where.type = type;
    if (teamId)             where.teamId = teamId;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          actor: { select: { id: true, name: true, email: true } },
          task:  { select: { id: true, title: true, status: true, priority: true } },
          team:  { select: { id: true, name: true } },
        },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: req.userId, read: false } }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    res.json({
      notifications,
      total,
      unreadCount,
      page,
      limit,
      totalPages,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// ─── GET /notifications/unread-count — lightweight unread count endpoint ─────
router.get('/unread-count', async (req, res) => {
  try {
    const unreadCount = await prisma.notification.count({
      where: { userId: req.userId, read: false },
    });
    res.json({ unreadCount });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// ─── GET /notifications/preferences — get notification preferences ───────────
router.get('/preferences', async (req, res) => {
  try {
    const preferences = await getUserPreferences(req.userId);
    res.json({ preferences });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    res.status(500).json({ error: 'Failed to fetch notification preferences' });
  }
});

// ─── PATCH /notifications/preferences — update notification preferences ───────
router.patch('/preferences', validate(schemas.notificationPreferencesUpdate), async (req, res) => {
  try {
    const {
      taskAssigned,
      statusChanged,
      commentsAndMentions,
      dueDates,
      teamUpdates,
      emailNotifications,
    } = req.body;

    const data = {};
    if (taskAssigned !== undefined)        data.taskAssigned        = taskAssigned;
    if (statusChanged !== undefined)       data.statusChanged       = statusChanged;
    if (commentsAndMentions !== undefined) data.commentsAndMentions = commentsAndMentions;
    if (dueDates !== undefined)            data.dueDates            = dueDates;
    if (teamUpdates !== undefined)         data.teamUpdates         = teamUpdates;
    if (emailNotifications !== undefined)  data.emailNotifications  = emailNotifications;

    const preferences = await prisma.notificationPreference.upsert({
      where:  { userId: req.userId },
      create: { userId: req.userId, ...data },
      update: data,
    });

    res.json({ preferences });
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

// ─── POST /notifications/read-all — mark all notifications as read ────────────
router.post('/read-all', async (req, res) => {
  try {
    const { teamId } = req.body || {};
    const where = { userId: req.userId, read: false };
    if (teamId) where.teamId = teamId;

    const result = await prisma.notification.updateMany({
      where,
      data: {
        read:   true,
        readAt: new Date(),
      },
    });

    res.json({ count: result.count });
  } catch (error) {
    console.error('Error marking all notifications read:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// ─── POST /notifications/check-due-dates — trigger due date notification scan ─
router.post('/check-due-dates', async (req, res) => {
  try {
    const result = await checkDueDates();
    res.json({ result });
  } catch (error) {
    console.error('Error checking due dates:', error);
    res.status(500).json({ error: 'Failed to check due dates' });
  }
});

// ─── DELETE /notifications/clear-all — delete all read notifications ──────────
router.delete('/clear-all', async (req, res) => {
  try {
    const result = await prisma.notification.deleteMany({
      where: { userId: req.userId, read: true },
    });
    res.json({ count: result.count });
  } catch (error) {
    console.error('Error clearing read notifications:', error);
    res.status(500).json({ error: 'Failed to clear read notifications' });
  }
});

// ─── PATCH /notifications/:id/read — mark a single notification as read ───────
router.patch('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.notification.findFirst({
      where: { id, userId: req.userId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const notification = await prisma.notification.update({
      where: { id },
      data: {
        read:   true,
        readAt: new Date(),
      },
      include: {
        actor: { select: { id: true, name: true, email: true } },
        task:  { select: { id: true, title: true, status: true, priority: true } },
        team:  { select: { id: true, name: true } },
      },
    });

    res.json({ notification });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// ─── DELETE /notifications/:id — delete a notification ───────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.notification.findFirst({
      where: { id, userId: req.userId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await prisma.notification.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

module.exports = router;

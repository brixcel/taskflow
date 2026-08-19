const express     = require('express');
const { z }       = require('zod');
const prisma      = require('../prisma');
const requireAuth = require('../middleware/auth');
const logger      = require('../middleware/logger');
const { revokeAllUserSessions } = require('../services/session');
const { invalidateUserCache } = require('../services/cache');

const router = express.Router();

// Schema for confirming account deletion via email match
const deleteAccountSchema = z.object({
  email: z.string().email('Must be a valid email address'),
});

/**
 * GET /users/me
 * Returns current authenticated user details.
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({ user });
  } catch (error) {
    logger.error({ err: error, userId: req.userId }, 'Failed to fetch user profile');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /users/me/export
 * GDPR Data Export endpoint: returns all personal data held for the authenticated user.
 */
router.get('/me/export', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        isDeleted: true,
        deletedAt: true,
        createdAt: true,
      },
    });

    if (!user || user.isDeleted) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Fetch user's data across all models
    const [teamMemberships, teamsOwned, tasksCreated, tasksAssigned, comments, activities] =
      await Promise.all([
        prisma.teamMembership.findMany({
          where: { userId },
          include: {
            team: {
              select: { id: true, name: true, createdAt: true },
            },
          },
        }),
        prisma.team.findMany({
          where: { ownerId: userId },
          select: { id: true, name: true, createdAt: true },
        }),
        prisma.task.findMany({
          where: { createdById: userId },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            teamId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.task.findMany({
          where: { assigneeId: userId },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            teamId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.comment.findMany({
          where: { authorId: userId },
          select: {
            id: true,
            taskId: true,
            content: true,
            createdAt: true,
          },
        }),
        prisma.activity.findMany({
          where: { userId },
          select: {
            id: true,
            taskId: true,
            action: true,
            details: true,
            createdAt: true,
          },
        }),
      ]);

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      user,
      teamMemberships: teamMemberships.map((m) => ({
        teamId: m.teamId,
        teamName: m.team.name,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      teamsOwned,
      tasksCreated,
      tasksAssigned,
      comments,
      activities,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="taskflow-user-data.json"');
    return res.status(200).json(exportPayload);
  } catch (error) {
    logger.error({ err: error, userId: req.userId }, 'Data export failed');
    return res.status(500).json({ error: 'Internal server error during data export' });
  }
});

/**
 * DELETE /users/me
 * GDPR Account Deletion endpoint: soft-deletes the user account and anonymizes personal data.
 * Authored tasks, comments, and activities remain associated with the anonymized "Deleted User"
 * record to preserve team history without breaking foreign key integrity.
 */
router.delete('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;

    // Validate confirmation payload shape
    const parseResult = deleteAccountSchema.safeParse(req.body || {});
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues?.[0];
      const errorMsg = firstIssue ? `${firstIssue.path.join('.') || 'email'}: ${firstIssue.message}` : 'Invalid input';
      return res.status(400).json({ error: errorMsg });
    }

    const { email } = parseResult.data;

    // Fetch existing user record
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.isDeleted) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify email confirmation match (case-insensitive)
    if (user.email.toLowerCase() !== email.trim().toLowerCase()) {
      return res.status(400).json({ error: 'Email confirmation does not match your account email' });
    }

    const anonymizedEmail = `deleted-${userId}@anonymized.local`;
    const unusablePasswordHash = `deleted-account-${Date.now()}-${Math.random().toString(36).substring(2)}`;

    // Perform transaction: anonymize user, purge tokens, unassign assigned tasks
    await prisma.$transaction([
      // Unassign tasks assigned to this user
      prisma.task.updateMany({
        where: { assigneeId: userId },
        data: { assigneeId: null },
      }),

      // Delete password reset tokens
      prisma.passwordResetToken.deleteMany({
        where: { userId },
      }),

      // Delete email verification tokens
      prisma.emailVerificationToken.deleteMany({
        where: { userId },
      }),

      // Anonymize User model fields
      prisma.user.update({
        where: { id: userId },
        data: {
          name: 'Deleted User',
          email: anonymizedEmail,
          passwordHash: unusablePasswordHash,
          isDeleted: true,
          deletedAt: new Date(),
        },
      }),
    ]);

    // Revoke all active Redis sessions and invalidate user cache
    try {
      await revokeAllUserSessions(userId);
      await invalidateUserCache(userId);
    } catch (err) {
      logger.warn({ err, userId }, 'Failed to revoke Redis sessions during account deletion');
    }

    logger.info({ userId }, 'User account successfully deleted and anonymized');
    return res.status(200).json({ message: 'Account successfully deleted and data anonymized' });
  } catch (error) {
    logger.error({ err: error, userId: req.userId }, 'Account deletion failed');
    return res.status(500).json({ error: 'Internal server error during account deletion' });
  }
});

module.exports = router;

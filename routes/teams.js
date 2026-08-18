const express = require('express');
const prisma = require('../prisma');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const schemas = require('../validation/schemas');
const { revokeAllUserSessions } = require('../services/session');

const router = express.Router();

router.use(requireAuth);

// ─── GET /teams/me — list all teams the current user belongs to ───────────────

router.get('/me', async (req, res) => {
  try {
    const memberships = await prisma.teamMembership.findMany({
      where: { userId: req.userId },
      orderBy: { joinedAt: 'asc' },
      include: {
        team: {
          select: { id: true, name: true, ownerId: true, createdAt: true },
        },
      },
    });

    const teams = memberships.map((m) => ({
      ...m.team,
      role: m.role,
      joinedAt: m.joinedAt,
    }));

    res.json({ teams });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── POST /teams — create a new team ─────────────────────────────────────────
//
// Body: { name }
// The requesting user becomes the owner and gets an 'owner' membership.

router.post('/', validate(schemas.teamCreate), async (req, res) => {
  try {
    const { name } = req.body;

    const { team } = await prisma.$transaction(async (tx) => {
      const newTeam = await tx.team.create({
        data: { name, ownerId: req.userId },
      });

      await tx.teamMembership.create({
        data: { userId: req.userId, teamId: newTeam.id, role: 'owner' },
      });

      return { team: newTeam };
    });

    res.status(201).json({ team });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── POST /teams/:id/members — add a user to a team ──────────────────────────
//
// Body: { userId, role? }
// Only owners and admins can add members.

router.post('/:id/members', validate(schemas.memberAdd), async (req, res) => {
  try {
    const { id: teamId } = req.params;
    const { userId: targetUserId, role } = req.body;

    // Check the requesting user has permission to add members.
    const requesterMembership = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: req.userId, teamId } },
    });

    if (!requesterMembership) {
      return res.status(403).json({ error: 'You are not a member of this team' });
    }

    if (!['owner', 'admin'].includes(requesterMembership.role)) {
      return res.status(403).json({ error: 'Only owners and admins can add members' });
    }

    // Verify the target user exists.
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const team = await prisma.team.findUnique({ where: { id: teamId } });

    // Upsert — idempotent if the user is already a member.
    const membership = await prisma.teamMembership.upsert({
      where: { userId_teamId: { userId: targetUserId, teamId } },
      create: { userId: targetUserId, teamId, role },
      update: { role },
    });

    if (targetUserId !== req.userId) {
      const { createNotification } = require('../services/notifications');
      await createNotification({
        userId: targetUserId,
        actorId: req.userId,
        teamId,
        type: 'team_invitation',
        title: 'Added to team',
        message: `You were added to team "${team?.name || 'team'}" as ${role}`,
        data: { teamId, teamName: team?.name, role },
      });
    }

    res.status(201).json({ membership });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── POST /teams/join — join a team by name (simple discovery) ───────────────
//
// Body: { teamName }
// Looks up the team by exact name and adds the user as a member.

router.post('/join', validate(schemas.teamJoin), async (req, res) => {
  try {
    const { teamName } = req.body;

    const team = await prisma.team.findFirst({
      where: { name: teamName },
    });

    if (!team) {
      return res.status(404).json({ error: 'No team found with that name' });
    }

    // Upsert — safe to call even if already a member.
    const membership = await prisma.teamMembership.upsert({
      where: { userId_teamId: { userId: req.userId, teamId: team.id } },
      create: { userId: req.userId, teamId: team.id, role: 'member' },
      update: {},
    });

    res.status(201).json({
      team: { id: team.id, name: team.name },
      membership,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── GET /teams/:id/members — list members of a specific team ────────────────
//
// Any member of the team can fetch the member list (needed for assignee picker).
router.get('/:id/members', async (req, res) => {
  try {
    const { id: teamId } = req.params;
    // Verify requester is actually a member of this team.
    const requesterMembership = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: req.userId, teamId } },
    });
    if (!requesterMembership) {
      return res.status(403).json({ error: 'You are not a member of this team' });
    }
    const memberships = await prisma.teamMembership.findMany({
      where: { teamId },
      orderBy: { joinedAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    const members = memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
    res.json({ members });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});
// ─── resolveTeamFromParam — inline helper for member-management routes ────────
//
// Unlike resolveTeam (which uses the X-Team-Id header), these routes always
// act on the team identified by :id in the URL. This helper loads the
// requester's membership for that specific team and attaches req.teamRole,
// returning 403 if they're not a member.

async function resolveTeamFromParam(req, res, next) {
  const { id: teamId } = req.params;
  try {
    const membership = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: req.userId, teamId } },
    });
    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this team' });
    }
    req.teamId = membership.teamId;
    req.teamRole = membership.role;
    next();
  } catch (err) {
    console.error('resolveTeamFromParam error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

// ─── DELETE /teams/:id/members/:userId — remove a member ─────────────────────
//
// Owner only. Owners cannot remove themselves (would orphan the team).

router.delete('/:id/members/:userId', resolveTeamFromParam, requireRole('owner'), async (req, res) => {
  try {
    const { id: teamId, userId: targetUserId } = req.params;

    if (targetUserId === req.userId) {
      return res.status(400).json({ error: 'Owners cannot remove themselves from the team' });
    }

    const membership = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: targetUserId, teamId } },
    });

    if (!membership) {
      return res.status(404).json({ error: 'Member not found in this team' });
    }

    await prisma.teamMembership.delete({
      where: { userId_teamId: { userId: targetUserId, teamId } },
    });

    // Instantly revoke active sessions for evicted member (Phase 38)
    await revokeAllUserSessions(targetUserId);

    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── PATCH /teams/:id/members/:userId/role — change a member's role ───────────
//
// Owner only.

router.patch('/:id/members/:userId/role', resolveTeamFromParam, requireRole('owner'), validate(schemas.memberRoleUpdate), async (req, res) => {
  try {
    const { id: teamId, userId: targetUserId } = req.params;
    const { role } = req.body;

    const membership = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: targetUserId, teamId } },
    });

    if (!membership) {
      return res.status(404).json({ error: 'Member not found in this team' });
    }

    const updated = await prisma.teamMembership.update({
      where: { userId_teamId: { userId: targetUserId, teamId } },
      data: { role },
    });

    if (targetUserId !== req.userId) {
      const team = await prisma.team.findUnique({ where: { id: teamId } });
      const { createNotification } = require('../services/notifications');
      await createNotification({
        userId: targetUserId,
        actorId: req.userId,
        teamId,
        type: 'role_changed',
        title: 'Team role updated',
        message: `Your role in team "${team?.name || 'team'}" was updated to ${role}`,
        data: { teamId, teamName: team?.name, role },
      });
    }

    res.json({ membership: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── GET /teams/:id/analytics — team & personal productivity analytics ─────────

router.get('/:id/analytics', resolveTeamFromParam, validate(schemas.analyticsQuery, 'query'), async (req, res) => {
  try {
    const { id: teamId } = req.params;
    const range = req.query.range || '30d';
    const filterUserId = req.query.userId || null;
    const now = new Date();

    // Determine range start date
    let rangeStartDate = null;
    if (range === '7d') {
      rangeStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === '30d') {
      rangeStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (range === '90d') {
      rangeStartDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    }

    const weekStart = new Date(now);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Fetch team memberships and all team tasks
    const [memberships, allTeamTasks, recentActivities] = await Promise.all([
      prisma.teamMembership.findMany({
        where: { teamId },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { joinedAt: 'asc' },
      }),
      prisma.task.findMany({
        where: { teamId },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          assigneeId: true,
          createdById: true,
          projectId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.activity.findMany({
        where: { task: { teamId } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          user: { select: { id: true, name: true, email: true } },
          task: { select: { id: true, title: true } },
        },
      }),
    ]);

    // Filter tasks if personal userId filter is applied
    const filteredTasks = filterUserId
      ? allTeamTasks.filter((t) => t.assigneeId === filterUserId)
      : allTeamTasks;

    const totalTasks = filteredTasks.length;
    const completedTasks = filteredTasks.filter((t) => t.status === 'done').length;
    const inProgressTasks = filteredTasks.filter((t) => t.status === 'in_progress').length;
    const todoTasks = filteredTasks.filter((t) => t.status === 'todo').length;
    const overdueTasks = filteredTasks.filter(
      (t) => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now
    ).length;

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const completedThisWeek = filteredTasks.filter(
      (t) => t.status === 'done' && new Date(t.updatedAt) >= weekStart
    ).length;
    const completedThisMonth = filteredTasks.filter(
      (t) => t.status === 'done' && new Date(t.updatedAt) >= monthStart
    ).length;

    const createdInRange = rangeStartDate
      ? filteredTasks.filter((t) => new Date(t.createdAt) >= rangeStartDate).length
      : totalTasks;
    const completedInRange = rangeStartDate
      ? filteredTasks.filter((t) => t.status === 'done' && new Date(t.updatedAt) >= rangeStartDate).length
      : completedTasks;

    const overview = {
      totalTasks,
      completedTasks,
      inProgressTasks,
      todoTasks,
      overdueTasks,
      completionRate,
      completedThisWeek,
      completedThisMonth,
      createdInRange,
      completedInRange,
    };

    // Status breakdown
    const statusBreakdown = [
      {
        status: 'todo',
        label: 'Todo',
        count: todoTasks,
        percentage: totalTasks > 0 ? Math.round((todoTasks / totalTasks) * 100) : 0,
      },
      {
        status: 'in_progress',
        label: 'In Progress',
        count: inProgressTasks,
        percentage: totalTasks > 0 ? Math.round((inProgressTasks / totalTasks) * 100) : 0,
      },
      {
        status: 'done',
        label: 'Done',
        count: completedTasks,
        percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      },
    ];

    // Workload distribution by team member
    const workloadDistribution = memberships.map((m) => {
      const mTasks = allTeamTasks.filter((t) => t.assigneeId === m.user.id);
      const mTotal = mTasks.length;
      const mDone = mTasks.filter((t) => t.status === 'done').length;
      const mInProgress = mTasks.filter((t) => t.status === 'in_progress').length;
      const mTodo = mTasks.filter((t) => t.status === 'todo').length;
      const mOverdue = mTasks.filter(
        (t) => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now
      ).length;

      return {
        userId: m.user.id,
        name: m.user.name || m.user.email.split('@')[0],
        email: m.user.email,
        role: m.role,
        totalTasks: mTotal,
        completedTasks: mDone,
        inProgressTasks: mInProgress,
        todoTasks: mTodo,
        overdueTasks: mOverdue,
        completionRate: mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0,
      };
    });

    // Unassigned tasks
    const unassignedTasks = allTeamTasks.filter((t) => !t.assigneeId);
    const unassigned = {
      totalTasks: unassignedTasks.length,
      completedTasks: unassignedTasks.filter((t) => t.status === 'done').length,
      inProgressTasks: unassignedTasks.filter((t) => t.status === 'in_progress').length,
      todoTasks: unassignedTasks.filter((t) => t.status === 'todo').length,
      overdueTasks: unassignedTasks.filter(
        (t) => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now
      ).length,
    };

    // Daily trends for range
    const daysCount = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const dailyTrends = [];
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      const created = filteredTasks.filter(
        (t) => t.createdAt && new Date(t.createdAt).toISOString().slice(0, 10) === dateStr
      ).length;
      const completed = filteredTasks.filter(
        (t) => t.status === 'done' && t.updatedAt && new Date(t.updatedAt).toISOString().slice(0, 10) === dateStr
      ).length;
      dailyTrends.push({ date: dateStr, created, completed });
    }

    const responsePayload = {
      teamId,
      range,
      overview,
      statusBreakdown,
      workloadDistribution,
      unassigned,
      recentActivities,
      dailyTrends,
    };

    if (filterUserId) {
      responsePayload.filterUserId = filterUserId;
    }

    res.json({ analytics: responsePayload });
  } catch (error) {
    console.error('GET /teams/:id/analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch team analytics' });
  }
});

// ─── GET /teams/:id/ai-settings — Get AI Usage and BYOK Status ────────────────

router.get('/:id/ai-settings', async (req, res) => {
  try {
    const teamId = req.params.id;

    const membership = await prisma.teamMembership.findUnique({
      where: {
        userId_teamId: {
          userId: req.userId,
          teamId,
        },
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            customGeminiKey: true,
            aiMonthlyUsage: true,
            aiUsageResetAt: true,
          },
        },
      },
    });

    if (!membership) {
      return res.status(404).json({ error: 'Team not found or access denied' });
    }

    res.json({
      hasCustomKey: Boolean(membership.team.customGeminiKey),
      monthlyUsage: membership.team.aiMonthlyUsage || 0,
      monthlyLimit: 20,
    });
  } catch (error) {
    console.error('GET /teams/:id/ai-settings error:', error);
    res.status(500).json({ error: 'Failed to fetch AI settings' });
  }
});

// ─── PUT /teams/:id/ai-settings — Update or Remove Custom Gemini Key (BYOK) ───

router.put('/:id/ai-settings', resolveTeamFromParam, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const teamId = req.params.id;
    const { customGeminiKey } = req.body;
    const { encryptSecret } = require('../services/encryption');

    let encryptedKey = null;
    if (customGeminiKey && typeof customGeminiKey === 'string' && customGeminiKey.trim().length > 0) {
      encryptedKey = encryptSecret(customGeminiKey.trim());
    }

    await prisma.team.update({
      where: { id: teamId },
      data: {
        customGeminiKey: encryptedKey,
      },
    });

    res.json({
      success: true,
      hasCustomKey: Boolean(encryptedKey),
      message: encryptedKey ? 'Custom Gemini API key saved successfully' : 'Custom key removed. Using standard free tier quota.',
    });
  } catch (error) {
    console.error('PUT /teams/:id/ai-settings error:', error);
    res.status(500).json({ error: 'Failed to update AI settings' });
  }
});

module.exports = router;

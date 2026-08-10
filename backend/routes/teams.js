const express     = require('express');
const prisma      = require('../prisma');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validate    = require('../middleware/validate');
const schemas     = require('../validation/schemas');
const logger      = require('../middleware/logger');

const router = express.Router();

router.use(requireAuth);

// ─── GET /teams/me — list all teams the current user belongs to ───────────────

router.get('/me', async (req, res) => {
  try {
    const memberships = await prisma.teamMembership.findMany({
      where:   { userId: req.userId },
      orderBy: { joinedAt: 'asc' },
      include: {
        team: {
          select: { id: true, name: true, ownerId: true, createdAt: true },
        },
      },
    });

    const teams = memberships.map((m) => ({
      ...m.team,
      role:     m.role,
      joinedAt: m.joinedAt,
    }));

    res.json({ teams });
  } catch (error) {
    logger.error({ err: error }, 'Route handler failed');
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
    logger.error({ err: error }, 'Route handler failed');
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

    // Upsert — idempotent if the user is already a member.
    const membership = await prisma.teamMembership.upsert({
      where:  { userId_teamId: { userId: targetUserId, teamId } },
      create: { userId: targetUserId, teamId, role },
      update: { role },
    });

    res.status(201).json({ membership });
  } catch (error) {
    logger.error({ err: error }, 'Route handler failed');
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
      where:  { userId_teamId: { userId: req.userId, teamId: team.id } },
      create: { userId: req.userId, teamId: team.id, role: 'member' },
      update: {},
    });

    res.status(201).json({
      team:       { id: team.id, name: team.name },
      membership,
    });
  } catch (error) {
    logger.error({ err: error }, 'Route handler failed');
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
      where:   { teamId },
      orderBy: { joinedAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    const members = memberships.map((m) => ({
      id:       m.user.id,
      name:     m.user.name,
      email:    m.user.email,
      role:     m.role,
      joinedAt: m.joinedAt,
    }));
    res.json({ members });
  } catch (error) {
    logger.error({ err: error }, 'Route handler failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── GET /teams/:id/analytics — productivity & workload analytics ───────────
//
// Query params:
//   range  — '7d' | '30d' | '90d' | 'all' (default: '30d')
//   userId — optional user UUID for filtering personal productivity
router.get('/:id/analytics', validate(schemas.analyticsQuery, 'query'), async (req, res) => {
  try {
    const { id: teamId } = req.params;
    const { range = '30d', userId } = req.query;

    // Verify requester is a member of this team.
    const requesterMembership = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: req.userId, teamId } },
    });
    if (!requesterMembership) {
      return res.status(403).json({ error: 'You are not a member of this team' });
    }

    const now = new Date();

    // Calculate range boundaries
    let rangeStartDate = null;
    if (range === '7d') {
      rangeStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === '30d') {
      rangeStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (range === '90d') {
      rangeStartDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    }

    // Start of current week (Monday)
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diffToMonday = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    // Start of current month (1st)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    // Build task query
    const taskWhere = { teamId };
    if (userId) {
      taskWhere.assigneeId = userId;
    }

    // Execute queries in parallel
    const [allTeamTasks, teamMemberships, recentActivities] = await Promise.all([
      prisma.task.findMany({
        where: taskWhere,
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          assigneeId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.teamMembership.findMany({
        where: { teamId },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { joinedAt: 'asc' },
      }),
      prisma.activity.findMany({
        where: {
          task: { teamId },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          user: { select: { id: true, name: true, email: true } },
          task: { select: { id: true, title: true } },
        },
      }),
    ]);

    const totalTasks       = allTeamTasks.length;
    const completedTasks   = allTeamTasks.filter((t) => t.status === 'done').length;
    const inProgressTasks  = allTeamTasks.filter((t) => t.status === 'in_progress').length;
    const todoTasks        = allTeamTasks.filter((t) => t.status === 'todo').length;
    const overdueTasks     = allTeamTasks.filter((t) => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now).length;
    const completionRate   = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const completedThisWeek  = allTeamTasks.filter((t) => t.status === 'done' && new Date(t.updatedAt) >= startOfWeek).length;
    const completedThisMonth = allTeamTasks.filter((t) => t.status === 'done' && new Date(t.updatedAt) >= startOfMonth).length;

    const createdInRange   = rangeStartDate ? allTeamTasks.filter((t) => new Date(t.createdAt) >= rangeStartDate).length : totalTasks;
    const completedInRange = rangeStartDate ? allTeamTasks.filter((t) => t.status === 'done' && new Date(t.updatedAt) >= rangeStartDate).length : completedTasks;

    const statusBreakdown = [
      { status: 'todo',        label: 'Todo',        count: todoTasks,       percentage: totalTasks > 0 ? Math.round((todoTasks / totalTasks) * 100) : 0 },
      { status: 'in_progress', label: 'In Progress', count: inProgressTasks,  percentage: totalTasks > 0 ? Math.round((inProgressTasks / totalTasks) * 100) : 0 },
      { status: 'done',        label: 'Done',        count: completedTasks,   percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0 },
    ];

    const workloadDistribution = teamMemberships.map((m) => {
      const memberTasks          = allTeamTasks.filter((t) => t.assigneeId === m.user.id);
      const memberTotal          = memberTasks.length;
      const memberDone           = memberTasks.filter((t) => t.status === 'done').length;
      const memberInProgress     = memberTasks.filter((t) => t.status === 'in_progress').length;
      const memberTodo           = memberTasks.filter((t) => t.status === 'todo').length;
      const memberOverdue        = memberTasks.filter((t) => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now).length;
      const memberCompletionRate = memberTotal > 0 ? Math.round((memberDone / memberTotal) * 100) : 0;

      return {
        userId:         m.user.id,
        name:           m.user.name,
        email:          m.user.email,
        role:           m.role,
        totalTasks:     memberTotal,
        completedTasks: memberDone,
        inProgressTasks: memberInProgress,
        todoTasks:      memberTodo,
        overdueTasks:   memberOverdue,
        completionRate: memberCompletionRate,
      };
    });

    const unassignedTasks = allTeamTasks.filter((t) => !t.assigneeId);
    const unassignedSummary = {
      totalTasks:      unassignedTasks.length,
      completedTasks:  unassignedTasks.filter((t) => t.status === 'done').length,
      inProgressTasks: unassignedTasks.filter((t) => t.status === 'in_progress').length,
      todoTasks:       unassignedTasks.filter((t) => t.status === 'todo').length,
      overdueTasks:    unassignedTasks.filter((t) => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now).length,
    };

    // Calculate daily completion & creation trends for charting
    const numDays = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 14;
    const dailyTrends = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const dateStr = dayStart.toISOString().split('T')[0];
      const completedCount = allTeamTasks.filter((t) => t.status === 'done' && new Date(t.updatedAt) >= dayStart && new Date(t.updatedAt) <= dayEnd).length;
      const createdCount   = allTeamTasks.filter((t) => new Date(t.createdAt) >= dayStart && new Date(t.createdAt) <= dayEnd).length;

      dailyTrends.push({
        date: dateStr,
        completed: completedCount,
        created: createdCount,
      });
    }

    res.json({
      analytics: {
        teamId,
        range,
        filterUserId: userId || null,
        overview: {
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
        },
        statusBreakdown,
        workloadDistribution,
        unassigned: unassignedSummary,
        dailyTrends,
        recentActivities: recentActivities.map((a) => ({
          id:        a.id,
          action:    a.action,
          details:   a.details,
          createdAt: a.createdAt,
          user:      a.user,
          task:      a.task,
        })),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Route handler failed');
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
    req.teamId   = membership.teamId;
    req.teamRole = membership.role;
    next();
  } catch (err) {
    logger.error({ err }, 'resolveTeamFromParam failed');
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

    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, 'Route handler failed');
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
      data:  { role },
    });

    res.json({ membership: updated });
  } catch (error) {
    logger.error({ err: error }, 'Route handler failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;

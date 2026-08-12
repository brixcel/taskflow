const express = require('express');
const prisma = require('../prisma');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const schemas = require('../validation/schemas');

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

module.exports = router;

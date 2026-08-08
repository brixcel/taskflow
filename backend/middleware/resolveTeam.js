/**
 * resolveTeam middleware
 *
 * Must run after requireAuth (expects req.userId to be set).
 *
 * Determines the "active team" for the request using this priority:
 *   1. X-Team-Id header  — explicit team selection (future: team switcher)
 *   2. First membership  — fallback for single-team users / existing sessions
 *
 * Attaches to the request:
 *   req.teamId   — the resolved team's id
 *   req.teamRole — the user's role in that team (owner | admin | member)
 *
 * Returns 403 if the user is not a member of the requested team,
 * or 404 if the user has no team memberships at all.
 */

const prisma  = require('../prisma');
const logger  = require('./logger');

async function resolveTeam(req, res, next) {
  try {
    const requestedTeamId = req.headers['x-team-id'];

    let membership;

    if (requestedTeamId) {
      // Explicit team requested — verify the user is actually a member.
      membership = await prisma.teamMembership.findUnique({
        where: {
          userId_teamId: {
            userId: req.userId,
            teamId: requestedTeamId,
          },
        },
      });

      if (!membership) {
        return res.status(403).json({
          error: 'You are not a member of this team',
        });
      }
    } else {
      // No explicit team — use the first membership (oldest join date).
      // For users with a single team this is always correct.
      membership = await prisma.teamMembership.findFirst({
        where: { userId: req.userId },
        orderBy: { joinedAt: 'asc' },
      });

      if (!membership) {
        return res.status(404).json({
          error: 'You are not a member of any team. Create or join a team first.',
        });
      }
    }

    req.teamId   = membership.teamId;
    req.teamRole = membership.role;

    next();
  } catch (err) {
    logger.error({ err }, 'resolveTeam failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = resolveTeam;

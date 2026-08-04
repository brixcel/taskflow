/**
 * scopedQuery helper
 *
 * Provides a base `where` clause for any Prisma query that touches
 * tasks, comments, or activities — always scoped to the active team.
 *
 * Usage:
 *   prisma.task.findMany({ where: scopedTaskQuery(req) })
 *   prisma.task.findFirst({ where: scopedTaskQuery(req, { id: taskId }) })
 */

/**
 * @param {import('express').Request} req         - Express request with req.teamId set by resolveTeam
 * @param {object}                    extraWhere   - Additional Prisma where conditions
 * @returns {object} Prisma where clause with teamId always included
 */
function scopedTaskQuery(req, extraWhere = {}) {
  return {
    teamId: req.teamId,
    ...extraWhere,
  };
}

module.exports = { scopedTaskQuery };

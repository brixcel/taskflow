/**
 * requireRole middleware factory
 *
 * Must run after resolveTeam (expects req.teamRole to be set).
 *
 * Usage:
 *   router.delete('/:id', requireRole('admin', 'owner'), handler)
 *   router.patch('/members/:userId/role', requireRole('owner'), handler)
 *
 * Returns 403 Forbidden when the user's role is not in the allowed list.
 * The check happens before any database query touches the resource.
 *
 * @param {...string} allowedRoles - One or more roles that may perform the action.
 * @returns Express middleware
 */
function requireRole(...allowedRoles) {
  const flatRoles = allowedRoles.flat();
  return function (req, res, next) {
    if (!req.teamRole) {
      // resolveTeam didn't run — configuration error, not a user error.
      return res.status(500).json({ error: 'Team role not resolved' });
    }

    if (!flatRoles.includes(req.teamRole)) {
      return res.status(403).json({
        error: `Forbidden — requires role: ${flatRoles.join(' or ')}`,
      });
    }

    next();
  };
}

module.exports = requireRole;

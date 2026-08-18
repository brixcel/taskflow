const { executeWithTeamRLS } = require('../services/rls');

/**
 * Express middleware attaching RLS transaction runner to request object.
 * Usage in route handlers:
 *   const tasks = await req.runWithRLS(async (tx) => tx.task.findMany());
 */
function rlsContext(req, res, next) {
  req.runWithRLS = function (callback) {
    if (!req.teamId) {
      throw new Error('Cannot execute with RLS: req.teamId is not resolved on this request');
    }
    return executeWithTeamRLS(req.teamId, callback);
  };
  next();
}

module.exports = rlsContext;

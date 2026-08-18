const prisma = require('../prisma');

/**
 * Executes database operations within a PostgreSQL transaction scoped to a specific team ID.
 * Uses `SET LOCAL app.current_team_id` to activate Row-Level Security (RLS) at the engine level.
 * 
 * Because `SET LOCAL` is transaction-scoped, it automatically resets at the end of the transaction,
 * making it 100% safe for pooled connections (PgBouncer/Supabase).
 * 
 * @param {string} teamId - Active tenant/team UUID
 * @param {Function} callback - Async function receiving transaction client `tx`
 * @returns {Promise<any>}
 */
async function executeWithTeamRLS(teamId, callback) {
  if (!teamId || typeof teamId !== 'string') {
    throw new Error('teamId is required to execute query with Row-Level Security');
  }

  const safeTeamId = teamId.replace(/[^a-zA-Z0-9_-]/g, '');

  return prisma.$transaction(async (tx) => {
    // Switch to application tenant role to enforce RLS policies
    try {
      await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated;');
    } catch (_) {}

    // Set transaction-local team context
    await tx.$executeRawUnsafe(`SET LOCAL app.current_team_id = '${safeTeamId}';`);
    await tx.$executeRawUnsafe(`SET LOCAL app.bypass_rls = 'off';`);

    return callback(tx);
  });
}

/**
 * Executes database operations with RLS bypassed for system operations / migrations.
 * 
 * @param {Function} callback - Async function receiving transaction client `tx`
 * @returns {Promise<any>}
 */
async function executeWithBypassRLS(callback) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.bypass_rls = 'on';`);
    return callback(tx);
  });
}

/**
 * Diagnostic helper checking whether RLS is active on key multi-tenant tables.
 * @returns {Promise<{ [tableName: string]: boolean }>}
 */
async function checkTableRlsStatus() {
  const result = await prisma.$queryRawUnsafe(`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN ('tasks', 'projects', 'task_attachments', 'subtasks');
  `);

  const status = {};
  if (Array.isArray(result)) {
    result.forEach((row) => {
      status[row.tablename] = Boolean(row.rowsecurity);
    });
  }
  return status;
}

module.exports = {
  executeWithTeamRLS,
  executeWithBypassRLS,
  checkTableRlsStatus,
};

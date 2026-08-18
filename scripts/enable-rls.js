require('dotenv').config();
const prisma = require('../prisma');
const fs = require('fs');
const path = require('path');

async function applyRlsPolicies() {
  console.log('🚀 Applying PostgreSQL Row-Level Security (RLS) policies...');

  const sqlPath = path.join(__dirname, '..', 'prisma', 'migrations', 'rls_policies.sql');
  const rawSql = fs.readFileSync(sqlPath, 'utf8');

  // Strip all comments
  const sqlWithoutComments = rawSql.replace(/--.*$/gm, '');

  // Split statements by semicolon
  const statements = sqlWithoutComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (err) {
      console.error(`❌ Error executing statement: ${statement.slice(0, 80)}...`, err.message);
      throw err;
    }
  }

  console.log('✅ PostgreSQL Row-Level Security policies applied successfully!');
}

if (require.main === module) {
  applyRlsPolicies()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Migration failed:', err);
      await prisma.$disconnect();
      process.exit(1);
    });
}

module.exports = { applyRlsPolicies };

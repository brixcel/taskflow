#!/usr/bin/env node
/**
 * backfill-teams.js
 *
 * One-time idempotent script:
 *   1. For every user who has no TeamMembership, create a "Default Team"
 *      with ownerId = that user's id, then create a TeamMembership with
 *      role = 'owner'.
 *   2. For every task with no teamId (only possible if the column was
 *      previously nullable), assign it to the owner's default team.
 *
 * Safe to run multiple times — it checks before creating.
 *
 * Run with:
 *   npm run backfill          (from the backend directory)
 *   node scripts/backfill-teams.js
 */

const prisma = require('../prisma');

async function main() {
  console.log('--- TaskFlow team backfill starting ---\n');

  // ── Step 1: Find users with no team membership ─────────────────────────────

  const allUsers = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
  });

  let teamsCreated      = 0;
  let membershipsCreated = 0;
  let tasksReassigned   = 0;

  for (const user of allUsers) {
    const existingMembership = await prisma.teamMembership.findFirst({
      where: { userId: user.id },
    });

    if (existingMembership) {
      // User already belongs to at least one team — nothing to do.
      continue;
    }

    console.log(`User "${user.name}" (${user.email}) has no team — creating "Default Team"…`);

    // Check if a "Default Team" for this user already exists but has no
    // membership (edge case from partial previous runs).
    let defaultTeam = await prisma.team.findFirst({
      where: { ownerId: user.id, name: 'Default Team' },
    });

    if (!defaultTeam) {
      defaultTeam = await prisma.team.create({
        data: { name: 'Default Team', ownerId: user.id },
      });
      teamsCreated++;
      console.log(`  ✓ Created team "${defaultTeam.name}" (id: ${defaultTeam.id})`);
    } else {
      console.log(`  ↩ Reusing existing team "${defaultTeam.name}" (id: ${defaultTeam.id})`);
    }

    // Create the owner membership (upsert to be safe).
    await prisma.teamMembership.upsert({
      where:  { userId_teamId: { userId: user.id, teamId: defaultTeam.id } },
      create: { userId: user.id, teamId: defaultTeam.id, role: 'owner' },
      update: {},
    });
    membershipsCreated++;
    console.log(`  ✓ Created owner membership for user ${user.id}`);

    // ── Step 2: Reassign orphaned tasks to this user's default team ───────────
    // This only applies if tasks.teamId was ever nullable. In the current
    // schema it is NOT NULL, so this block is a no-op unless a migration
    // temporarily allowed nulls.

    const orphanedTasks = await prisma.task.findMany({
      where: { createdById: user.id, teamId: null },
      select: { id: true, title: true },
    });

    if (orphanedTasks.length > 0) {
      await prisma.task.updateMany({
        where: { createdById: user.id, teamId: null },
        data:  { teamId: defaultTeam.id },
      });
      tasksReassigned += orphanedTasks.length;
      console.log(`  ✓ Reassigned ${orphanedTasks.length} orphaned task(s) to default team`);
    }
  }

  console.log('\n--- Backfill complete ---');
  console.log(`  Teams created:       ${teamsCreated}`);
  console.log(`  Memberships created: ${membershipsCreated}`);
  console.log(`  Tasks reassigned:    ${tasksReassigned}`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

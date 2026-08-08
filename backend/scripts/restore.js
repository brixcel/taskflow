/**
 * TaskFlow — Database Restore Engine (Node.js)
 * 
 * Restores a compressed backup archive (.json.gz) into the current database.
 * Decompresses the backup, cleans target tables in FK dependency order,
 * and restores all model records cleanly.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const prisma = require('../prisma');

async function runRestore(targetFilePath) {
  if (!targetFilePath) {
    const backupsDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupsDir)) {
      throw new Error(`[restore] No backups directory found at ${backupsDir}`);
    }
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('taskflow_backup_') && f.endsWith('.json.gz'))
      .sort()
      .reverse();

    if (files.length === 0) {
      throw new Error(`[restore] No backup files found in ${backupsDir}`);
    }
    targetFilePath = path.join(backupsDir, files[0]);
  }

  console.log(`[restore] Starting restore process...`);
  console.log(`[restore] Archive path: ${targetFilePath}`);

  if (!fs.existsSync(targetFilePath)) {
    throw new Error(`[restore] Backup file does not exist at ${targetFilePath}`);
  }

  try {
    // 1. Read & Decompress Archive
    const compressedBuffer = fs.readFileSync(targetFilePath);
    const jsonString = zlib.gunzipSync(compressedBuffer).toString('utf-8');
    const payload = JSON.parse(jsonString);

    const { meta, data } = payload;
    console.log(`[restore] Loaded backup generated at: ${meta.timestamp}`);
    console.log(`[restore] Target record counts to restore:`, meta.recordCounts);

    // 2. Transactional Table Cleanup (delete children first to maintain FK integrity)
    console.log(`[restore] Cleaning current target database records...`);
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany(),
      prisma.emailVerificationToken.deleteMany(),
      prisma.activity.deleteMany(),
      prisma.comment.deleteMany(),
      prisma.task.deleteMany(),
      prisma.teamMembership.deleteMany(),
      prisma.team.deleteMany(),
      prisma.user.deleteMany(),
    ]);

    // 3. Sequential Record Insertion (parents first)
    console.log(`[restore] Restoring User records (${data.users?.length || 0})...`);
    for (const u of (data.users || [])) {
      await prisma.user.create({
        data: {
          id: u.id,
          email: u.email,
          passwordHash: u.passwordHash,
          name: u.name,
          emailVerified: u.emailVerified ?? false,
          createdAt: new Date(u.createdAt),
        },
      });
    }

    console.log(`[restore] Restoring Team records (${data.teams?.length || 0})...`);
    for (const t of (data.teams || [])) {
      await prisma.team.create({
        data: {
          id: t.id,
          name: t.name,
          ownerId: t.ownerId,
          createdAt: new Date(t.createdAt),
        },
      });
    }

    console.log(`[restore] Restoring TeamMembership records (${data.memberships?.length || 0})...`);
    for (const m of (data.memberships || [])) {
      await prisma.teamMembership.create({
        data: {
          userId: m.userId,
          teamId: m.teamId,
          role: m.role,
          joinedAt: m.joinedAt ? new Date(m.joinedAt) : new Date(m.createdAt || Date.now()),
        },
      });
    }

    console.log(`[restore] Restoring Task records (${data.tasks?.length || 0})...`);
    for (const task of (data.tasks || [])) {
      await prisma.task.create({
        data: {
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          createdById: task.createdById,
          assigneeId: task.assigneeId,
          teamId: task.teamId,
          createdAt: new Date(task.createdAt),
          updatedAt: new Date(task.updatedAt),
        },
      });
    }

    console.log(`[restore] Restoring Comment records (${data.comments?.length || 0})...`);
    for (const c of (data.comments || [])) {
      await prisma.comment.create({
        data: {
          id: c.id,
          content: c.content,
          taskId: c.taskId,
          authorId: c.authorId,
          createdAt: new Date(c.createdAt),
        },
      });
    }

    console.log(`[restore] Restoring Activity records (${(data.activities || data.activityLogs)?.length || 0})...`);
    for (const a of (data.activities || data.activityLogs || [])) {
      await prisma.activity.create({
        data: {
          id: a.id,
          taskId: a.taskId,
          userId: a.userId,
          action: a.action,
          details: a.details,
          createdAt: new Date(a.createdAt),
        },
      });
    }

    if (data.passwordResetTokens && data.passwordResetTokens.length > 0) {
      console.log(`[restore] Restoring PasswordResetToken records (${data.passwordResetTokens.length})...`);
      for (const pr of data.passwordResetTokens) {
        await prisma.passwordResetToken.create({
          data: {
            id: pr.id,
            userId: pr.userId,
            tokenHash: pr.tokenHash,
            expiresAt: new Date(pr.expiresAt),
            usedAt: pr.usedAt ? new Date(pr.usedAt) : null,
          },
        });
      }
    }

    if (data.emailVerificationTokens && data.emailVerificationTokens.length > 0) {
      console.log(`[restore] Restoring EmailVerificationToken records (${data.emailVerificationTokens.length})...`);
      for (const ev of data.emailVerificationTokens) {
        await prisma.emailVerificationToken.create({
          data: {
            id: ev.id,
            userId: ev.userId,
            tokenHash: ev.tokenHash,
            expiresAt: new Date(ev.expiresAt),
            usedAt: ev.usedAt ? new Date(ev.usedAt) : null,
          },
        });
      }
    }

    console.log(`[restore] ✅ Database restore completed successfully!`);
    return { success: true, meta };
  } catch (err) {
    console.error(`[restore] ❌ Restore failed:`, err.message);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  const filePathArg = process.argv[2];
  runRestore(filePathArg).catch(() => process.exit(1));
}

module.exports = { runRestore };

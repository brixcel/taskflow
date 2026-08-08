/**
 * TaskFlow — Database Backup Engine (Node.js)
 * 
 * Exports all database records (User, Team, TeamMembership, Task, Comment, Activity,
 * PasswordResetToken, EmailVerificationToken) into a timestamped, gzip-compressed
 * backup archive in backend/backups/.
 * Automatically enforces retention policy by deleting backups older than RETENTION_DAYS.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const prisma = require('../prisma');

const BACKUPS_DIR = path.join(__dirname, '../backups');
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '7', 10);

async function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  const backupFileName = `taskflow_backup_${timestamp}.json.gz`;
  const backupFilePath = path.join(BACKUPS_DIR, backupFileName);

  console.log(`[backup] Starting database backup...`);
  console.log(`[backup] Target archive: ${backupFilePath}`);

  try {
    // 1. Extract data across all Prisma models
    const users                   = await prisma.user.findMany();
    const teams                   = await prisma.team.findMany();
    const memberships             = await prisma.teamMembership.findMany();
    const tasks                   = await prisma.task.findMany();
    const comments                = await prisma.comment.findMany();
    const activities              = await prisma.activity.findMany();
    const passwordResetTokens     = await prisma.passwordResetToken.findMany();
    const emailVerificationTokens = await prisma.emailVerificationToken.findMany();

    const payload = {
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
        generator: 'TaskFlow Node Backup Engine',
        recordCounts: {
          users: users.length,
          teams: teams.length,
          memberships: memberships.length,
          tasks: tasks.length,
          comments: comments.length,
          activities: activities.length,
          passwordResetTokens: passwordResetTokens.length,
          emailVerificationTokens: emailVerificationTokens.length,
        },
      },
      data: {
        users,
        teams,
        memberships,
        tasks,
        comments,
        activities,
        passwordResetTokens,
        emailVerificationTokens,
      },
    };

    // 2. Serialize and Compress (Gzip)
    const jsonString = JSON.stringify(payload, null, 2);
    const compressedBuffer = zlib.gzipSync(jsonString);

    fs.writeFileSync(backupFilePath, compressedBuffer);
    const fileSizeKb = (compressedBuffer.length / 1024).toFixed(2);
    console.log(`[backup] ✅ Backup created successfully! (${fileSizeKb} KB)`);
    console.log(`[backup] Summary:`, payload.meta.recordCounts);

    // 3. Enforce Retention Policy
    cleanOldBackups();

    return { filePath: backupFilePath, meta: payload.meta };
  } catch (err) {
    console.error(`[backup] ❌ Backup failed:`, err.message);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

function cleanOldBackups() {
  const files = fs.readdirSync(BACKUPS_DIR);
  const now = Date.now();
  const maxAgeMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let deletedCount = 0;

  files.forEach((file) => {
    if (file.startsWith('taskflow_backup_') && (file.endsWith('.json.gz') || file.endsWith('.sql.gz'))) {
      const filePath = path.join(BACKUPS_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        console.log(`[backup] 🧹 Cleaned up old backup: ${file}`);
        deletedCount++;
      }
    }
  });

  if (deletedCount === 0) {
    console.log(`[backup] Retention check complete. No backups older than ${RETENTION_DAYS} days found.`);
  }
}

if (require.main === module) {
  runBackup().catch(() => process.exit(1));
}

module.exports = { runBackup, cleanOldBackups };

# TaskFlow — Database Backup & Disaster Recovery Runbook

> **Scope:** Operational procedures for managing database backups, automated scheduling, manual ad-hoc dumps, restoration protocols, disaster recovery, and security compliance for TaskFlow.

---

## 📋 Overview & Architecture

TaskFlow uses PostgreSQL as its primary multi-tenant datastore. To ensure data durability and zero data loss across migrations or host failures, TaskFlow provides an automated backup and restoration engine located in `backend/scripts/`.

### Backup Components
* **Backup Script:** [backend/scripts/backup.sh](file:///home/brexc/projects/taskflow/backend/scripts/backup.sh) (executes [backup.js](file:///home/brexc/projects/taskflow/backend/scripts/backup.js))
* **Restore Script:** [backend/scripts/restore.sh](file:///home/brexc/projects/taskflow/backend/scripts/restore.sh) (executes [restore.js](file:///home/brexc/projects/taskflow/backend/scripts/restore.js))
* **Verification Suite:** [backend/scripts/test-backup-restore.sh](file:///home/brexc/projects/taskflow/backend/scripts/test-backup-restore.sh)
* **Backup Destination:** `backend/backups/`
* **Format:** Gzip-compressed JSON payload (`taskflow_backup_YYYYMMDD_HHMMSS.json.gz`) containing metadata, model record counts, and full record snapshots.
* **Retention Policy:** Default 7 days (configurable via `BACKUP_RETENTION_DAYS`).

---

## ⚙️ Automated Backup Scheduling (Cron Setup)

To execute daily backups automatically at midnight on Linux servers or Docker containers:

### 1. Linux Crontab Setup
Open the system crontab editor:
```bash
crontab -e
```

Add the following entry to trigger daily backups at 00:00:
```cron
0 0 * * * cd /path/to/taskflow && bash backend/scripts/backup.sh >> /var/log/taskflow-backup.log 2>&1
```

### 2. Retention Policy Configuration
Configure backup retention via environment variables in `backend/.env`:
```env
# Retain daily backups for 14 days before automatic purging
BACKUP_RETENTION_DAYS=14
```

---

## 🛠️ Manual Ad-Hoc Backup Procedure

Always perform a manual backup prior to applying major database migrations (`npx prisma migrate deploy`) or pushing breaking schema changes.

### Running Ad-Hoc Backup
Navigate to the root directory and execute:
```bash
bash backend/scripts/backup.sh
```

**Expected Output:**
```text
=================================================================
  TaskFlow Production Database Backup Routine
=================================================================
[backup] Starting database backup...
[backup] Target archive: /path/to/taskflow/backend/backups/taskflow_backup_2026-08-06T05-25-57-542Z.json.gz
[backup] ✅ Backup created successfully! (0.43 KB)
[backup] Retention check complete. No backups older than 7 days found.
[backup.sh] Process completed successfully.
```

---

## 🚨 Disaster Recovery & Restoration Runbook

Follow these exact steps in the event of database corruption, accidental deletion, or a failed migration requiring point-in-time recovery.

### Step 1: Identify the Target Backup File
List available backup archives sorted by timestamp:
```bash
ls -lt backend/backups/
```

Choose the latest healthy backup file, e.g.:
`backend/backups/taskflow_backup_2026-08-06T05-25-57-542Z.json.gz`

### Step 2: Validate Backup Integrity
Inspect the backup archive metadata without altering database state:
```bash
node -e '
const fs = require("fs");
const zlib = require("zlib");
const file = process.argv[1];
const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString());
console.log("Timestamp:", data.meta.timestamp);
console.log("Record Counts:", data.meta.recordCounts);
' backend/backups/taskflow_backup_2026-08-06T05-25-57-542Z.json.gz
```

### Step 3: Execute Restoration
Execute `restore.sh` passing the target backup archive path:
```bash
bash backend/scripts/restore.sh backend/backups/taskflow_backup_2026-08-06T05-25-57-542Z.json.gz
```

*Note: If no argument is passed, `restore.sh` automatically selects the most recent archive in `backend/backups/`.*

---

## 🔒 Security & Secret Compliance Checklist

1. **Environment Variables:** Never commit `.env` containing `DATABASE_URL` or secret keys to version control (`git log --all -- .env`).
2. **Secret Scrubbing:** Password hashes in `User` backups (`passwordHash`) are stored as bcrypt hashes; plaintext passwords are never captured or logged.
3. **Backup Encryption at Rest:** When archiving backups to remote object storage (e.g. AWS S3 / GCP Cloud Storage), enable Server-Side Encryption (AES-256 / KMS) and restrict bucket permissions.
4. **Access Control:** Restrict local backup directory permissions on Linux:
   ```bash
   chmod 700 backend/backups
   ```

---

## 🧪 Automated Lifecycle Verification

To run the end-to-end backup, restore, parity check, and cleanup test suite:
```bash
bash backend/scripts/test-backup-restore.sh
```

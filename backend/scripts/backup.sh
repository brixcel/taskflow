#!/usr/bin/env bash
# ==============================================================================
# TaskFlow — Automated Backup Script
# Executes PostgreSQL database backup with compression & retention policy.
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "================================================================="
echo "  TaskFlow Production Database Backup Routine"
echo "================================================================="

cd "$BACKEND_DIR"

if [ -f ".env" ]; then source .env; fi

export BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

# Run Node backup engine
node "$SCRIPT_DIR/backup.js"

echo "[backup.sh] Process completed successfully."

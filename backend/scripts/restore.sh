#!/usr/bin/env bash
# ==============================================================================
# TaskFlow — Database Restoration Script
# Restores a compressed backup archive (.json.gz) into the database.
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

BACKUP_FILE="$1"

echo "================================================================="
echo "  TaskFlow Production Database Restore Routine"
echo "================================================================="

cd "$BACKEND_DIR"

if [ -n "$BACKUP_FILE" ]; then
  echo "[restore.sh] Target backup file specified: $BACKUP_FILE"
  node "$SCRIPT_DIR/restore.js" "$BACKUP_FILE"
else
  echo "[restore.sh] No backup file specified; using most recent archive."
  node "$SCRIPT_DIR/restore.js"
fi

echo "[restore.sh] Restoration completed successfully."

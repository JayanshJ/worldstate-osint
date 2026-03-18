#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# WorldState — PostgreSQL backup script
#
# Usage:
#   ./scripts/backup.sh                   # manual run
#   Cron (daily at 02:00):
#     0 2 * * * /path/to/scripts/backup.sh >> /var/log/worldstate_backup.log 2>&1
#
# Requires: pg_dump, aws cli (for S3 upload) or rclone (for other remotes)
# Env vars: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_HOST,
#           BACKUP_S3_BUCKET (optional)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

POSTGRES_USER="${POSTGRES_USER:-worldstate}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-worldstate_secret}"
POSTGRES_DB="${POSTGRES_DB:-worldstate}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/worldstate_backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="${BACKUP_DIR}/worldstate_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting backup → $FILENAME"

PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --no-password \
  --format=plain \
  --clean \
  --if-exists \
  | gzip > "$FILENAME"

SIZE=$(du -sh "$FILENAME" | cut -f1)
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup complete. Size: $SIZE"

# ── Optional: upload to S3 ──────────────────────────────────────────────────
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Uploading to s3://$BACKUP_S3_BUCKET/"
  aws s3 cp "$FILENAME" "s3://$BACKUP_S3_BUCKET/$(basename "$FILENAME")" \
    --storage-class STANDARD_IA
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] S3 upload complete"
fi

# ── Prune old local backups ─────────────────────────────────────────────────
find "$BACKUP_DIR" -name "worldstate_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Pruned backups older than ${RETENTION_DAYS} days"

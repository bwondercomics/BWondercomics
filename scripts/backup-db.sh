#!/bin/bash
# Backup PostgreSQL database from Docker container
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/srv/bw-quality/var/backups}"
DB_NAME="${BWC_DB_NAME:-bwondercomics_quality}"
DB_USER="${BWC_DB_USER:-bwondercomics}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT="${BACKUP_DIR}/db-${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "Backing up database '${DB_NAME}'..."
docker exec bwondercomics-bwondercomics-db-1 \
  pg_dump -U "${DB_USER}" "${DB_NAME}" \
  | gzip > "${OUTPUT}"

echo "Database backup: ${OUTPUT}"
ls -lh "${OUTPUT}"

#!/bin/bash
# Restore PostgreSQL database from backup
set -euo pipefail

BACKUP_FILE="${1:-}"
DB_NAME="${BWC_DB_NAME:-bwondercomics_quality}"
DB_USER="${BWC_DB_USER:-bwondercomics}"

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Usage: $0 <backup-file.sql.gz>"
  echo ""
  echo "Available backups:"
  ls -lh /srv/bw-quality/var/backups/db-*.sql.gz 2>/dev/null || echo "  (none found)"
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Error: File not found: ${BACKUP_FILE}"
  exit 1
fi

echo ""
echo "⚠️  WARNING: This will DROP and recreate the database '${DB_NAME}'!"
echo "All current data will be replaced with the backup."
echo ""
echo "Restoring from: ${BACKUP_FILE}"
echo "File size: $(ls -lh "${BACKUP_FILE}" | awk '{print $5}')"
echo ""
read -p "Type 'yes' to continue: " confirm
if [[ "${confirm}" != "yes" ]]; then
  echo "Aborted."
  exit 1
fi

# Stop API to prevent writes during restore
echo ""
echo "Stopping API..."
docker stop bwondercomics-bwondercomics-api-1 || true

# Drop and recreate database
echo "Dropping existing database..."
docker exec bwondercomics-bwondercomics-db-1 \
  psql -U "${DB_USER}" postgres \
  -c "DROP DATABASE IF EXISTS ${DB_NAME};"

echo "Creating fresh database..."
docker exec bwondercomics-bwondercomics-db-1 \
  psql -U "${DB_USER}" postgres \
  -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

# Restore
echo "Restoring database from backup..."
gunzip -c "${BACKUP_FILE}" | docker exec -i bwondercomics-bwondercomics-db-1 \
  psql -U "${DB_USER}" "${DB_NAME}"

# Restart API
echo "Starting API..."
docker start bwondercomics-bwondercomics-api-1

echo ""
echo "✅ Restore complete!"
echo ""
echo "Verification: checking entry count..."
docker exec bwondercomics-bwondercomics-db-1 \
  psql -U "${DB_USER}" "${DB_NAME}" -c "SELECT COUNT(*) AS entries FROM entries;" 2>/dev/null || true

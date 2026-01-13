#!/bin/bash
# Full backup: database + optional media files
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/srv/bw-quality/var/backups}"
DB_NAME="${BWC_DB_NAME:-bwondercomics_quality}"
DB_USER="${BWC_DB_USER:-bwondercomics}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "${BACKUP_DIR}"

# 1. Database
echo "Backing up database '${DB_NAME}'..."
docker exec bwondercomics-bwondercomics-db-1 \
  pg_dump -U "${DB_USER}" "${DB_NAME}" \
  | gzip > "${BACKUP_DIR}/db-${TIMESTAMP}.sql.gz"
echo "  -> ${BACKUP_DIR}/db-${TIMESTAMP}.sql.gz"

# 2. Media + chapters (large, optional)
if [[ "${INCLUDE_MEDIA:-false}" == "true" ]]; then
  echo "Backing up media files (this may take a while)..."
  tar -czf "${BACKUP_DIR}/files-${TIMESTAMP}.tar.gz" \
    -C /srv/bw-quality media/ chapters/ 2>/dev/null || true
  echo "  -> ${BACKUP_DIR}/files-${TIMESTAMP}.tar.gz"
fi

# 3. Frontend dist
echo "Backing up frontend dist..."
tar -czf "${BACKUP_DIR}/frontend-dist-${TIMESTAMP}.tar.gz" \
  -C /srv/bw-quality dist/ 2>/dev/null || true
echo "  -> ${BACKUP_DIR}/frontend-dist-${TIMESTAMP}.tar.gz"

# 4. Environment file (secrets)
echo "Backing up env file..."
cp /srv/bw-quality/deploy/bwondercomics.env \
  "${BACKUP_DIR}/bwondercomics.env.${TIMESTAMP}.bak"
echo "  -> ${BACKUP_DIR}/bwondercomics.env.${TIMESTAMP}.bak"

echo ""
echo "Backup complete!"
echo "Files created:"
ls -lh "${BACKUP_DIR}"/*${TIMESTAMP}* 2>/dev/null || true

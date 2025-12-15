#!/bin/bash
set -euo pipefail

BACKUP_DEST="${BACKUP_DEST:-/mnt/archive/backups/battlebros}"
DATA_PARENT="${DATA_PARENT:-/srv/bwondercomics/var}"
DATA_DIR_NAME="${DATA_DIR_NAME:-battlebros}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

timestamp="$(date +%F)"
outfile="${BACKUP_DEST}/battlebros-${timestamp}.tar.gz"

mkdir -p "${BACKUP_DEST}"

tar -czf "${outfile}" -C "${DATA_PARENT}" "${DATA_DIR_NAME}"

if [[ "${RETENTION_DAYS}" =~ ^[0-9]+$ ]] && [[ "${RETENTION_DAYS}" -gt 0 ]]; then
  find "${BACKUP_DEST}" -maxdepth 1 -type f -name 'battlebros-*.tar.gz' -mtime "+${RETENTION_DAYS}" -delete || true
fi

echo "Wrote ${outfile}"


#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIR="${ROOT_DIR}/var/releases"

latest_snapshot="$(ls -1t "${RELEASE_DIR}"/dist-rollback-*.tar.gz 2>/dev/null | head -n 1 || true)"
if [ -z "${latest_snapshot}" ]; then
  echo "No rollback snapshots found in ${RELEASE_DIR}."
  exit 1
fi

rm -rf "${ROOT_DIR}/dist"
tar -xzf "${latest_snapshot}" -C "${ROOT_DIR}"
echo "Restored dist from ${latest_snapshot}"

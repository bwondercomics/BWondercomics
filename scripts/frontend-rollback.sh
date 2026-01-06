#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIR="${ROOT_DIR}/var/releases"

latest_snapshot="$(ls -1t "${RELEASE_DIR}"/dist-*.tar.gz 2>/dev/null | head -n 1 || true)"
if [ -z "${latest_snapshot}" ]; then
  echo "No dist snapshots found in ${RELEASE_DIR}."
  exit 1
fi

ts="$(date +%Y%m%d-%H%M%S)"
if [ -d "${ROOT_DIR}/dist" ]; then
  tar -czf "${RELEASE_DIR}/dist-rollback-${ts}.tar.gz" -C "${ROOT_DIR}" dist
  echo "Saved current dist to ${RELEASE_DIR}/dist-rollback-${ts}.tar.gz"
fi

rm -rf "${ROOT_DIR}/dist"
tar -xzf "${latest_snapshot}" -C "${ROOT_DIR}"
echo "Restored dist from ${latest_snapshot}"

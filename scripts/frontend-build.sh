#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIR="${ROOT_DIR}/var/releases"

mkdir -p "${RELEASE_DIR}"

if [ -d "${ROOT_DIR}/dist" ]; then
  ts="$(date +%Y%m%d-%H%M%S)"
  tar -czf "${RELEASE_DIR}/dist-${ts}.tar.gz" -C "${ROOT_DIR}" dist
  echo "Saved dist snapshot to ${RELEASE_DIR}/dist-${ts}.tar.gz"
fi

cd "${ROOT_DIR}"
if [ -f "${ROOT_DIR}/node_modules/vite/bin/vite.js" ]; then
  node "${ROOT_DIR}/node_modules/vite/bin/vite.js" build
else
  npm run build
fi

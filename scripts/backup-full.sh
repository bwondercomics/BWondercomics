#!/bin/bash
# Compatibility entry point; excludes derived files and secrets by construction.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "${repo_root}/.venv/bin/python" "${repo_root}/scripts/backup_artifacts.py" all

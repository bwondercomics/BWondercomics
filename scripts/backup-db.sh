#!/bin/bash
# Compatibility entry point; the Python helper owns the artifact contract.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "${repo_root}/.venv/bin/python" "${repo_root}/scripts/backup_artifacts.py" database

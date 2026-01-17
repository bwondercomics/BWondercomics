# BWonderComics (self-hosted comics platform kit)

Static frontend (built with Vite) + FastAPI backend for the dynamic stuff (auth, comments, post scheduling, RSS, uploads, analytics proxy).

## Quick start (Docker)
1) Create env:
   - `make env` (then fill in secrets in `deploy/bwondercomics.env`)
2) Start the stack:
   - `make up`
   - `make migrate`
3) Open:
   - Site is served by Caddy (domain in `deploy/Caddyfile`)
   - Admin is served from `/admin/` off the repo root

## Frontend build
Public pages are served from `dist/`.
- Build + snapshot: `./scripts/frontend-build.sh` (writes `dist/` and saves a tarball in `var/releases/`).
- Caddy serves `dist/` for the public site, and `/admin/` directly from the repo (admin changes go live without rebuild).

## Docs
- Overview: `docs/README.md`
- Architecture: `docs/ARCHITECTURE.md`
- Admin panel: `docs/admin-overview.md`
- Deployment: `deploy/README.md`

## Static hosting
The frontend can be served statically, but you only get the full feature set when the backend is running.

# BWonderComics 0.7.9

Static frontend (built with Vite) + FastAPI backend for the dynamic parts: auth, comments, post scheduling, RSS, uploads, page builder, diagnostics, ops, and analytics proxy.

## Quick start (Docker)

1. Create env:
   - `make env` (then fill in secrets in `deploy/bwondercomics.env`)
2. Start the stack:
   - `make up`
   - `make migrate`
3. Open:
   - Site is served by Caddy (domain in `deploy/Caddyfile`)
   - Admin is served from `/admin/` off the repo root

## Frontend build

Public pages are served from `dist/`.

- Build + snapshot: `./scripts/frontend-build.sh` (writes `dist/` and saves a tarball in `var/releases/`).
- Caddy serves `dist/` for the public site, and `/admin/` directly from the repo (admin changes go live without rebuild).

## Quality gates

- Frontend tests: `npm test`
- Backend tests: `npm run test:backend`
- JS lint: `npm run lint`
- JS format check: `npm run format:check`
- Python lint: `npm run lint:py`
- Python format check: `npm run format:py:check`
- Production build: `npm run build`

## Docs

- Overview: `docs/README.md`
- Architecture: `docs/ARCHITECTURE.md`
- Admin panel + page builder: `docs/admin-overview.md`
- Deployment: `deploy/README.md`
- Release roadmap: `docs/ROADMAP.md`

## Static hosting

The frontend can be served statically, but you only get the full feature set when the backend is running.

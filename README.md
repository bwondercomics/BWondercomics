# BWonderComics (self-hosted comics platform kit)

Static-first comic site (no build step) + a proper backend for the “dynamic stuff” (auth, comments, post scheduling, RSS, uploads, analytics proxy).

## Quick start (Docker)
1) Create env:
   - `make env` (then fill in secrets in `deploy/bwondercomics.env`)
2) Start the stack:
   - `make up`
   - `make migrate`
3) Open:
   - `http://localhost:8000/` (site)
   - `http://localhost:8000/admin/` (admin)

## Docs
- Overview: `docs/README.md`
- Architecture: `docs/ARCHITECTURE.md`
- Admin panel: `docs/admin-overview.md`
- Deployment: `deploy/README.md`

## Static hosting
The frontend can be served statically, but you only get the full feature set when the backend is running.

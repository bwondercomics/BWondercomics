# BWonderComics (self-hosted comics platform kit)

Static-first comic site (no build step) + a proper backend for the “dynamic stuff” (auth, comments, post scheduling, RSS, uploads, analytics proxy).

## Quick start (Docker)
1) Copy env:
   - `cp deploy/bwondercomics.env.example deploy/bwondercomics.env`
2) Start the stack:
   - `docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-compose.yml up -d --build`
   - `docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-compose.yml exec bwondercomics-api alembic -c backend/alembic.ini upgrade head`
3) Open:
   - `http://localhost:8000/` (site)
   - `http://localhost:8000/admin/` (admin)

## Docs
- Overview: `docs/README.md`
- Architecture: `docs/ARCHITECTURE.md`
- Admin panel: `docs/admin-overview.md`
- Deployment: `deploy/README.md`

## Static hosting
The frontend can still be deployed statically (GitHub Pages workflow exists), but you only get the full feature set when the backend is running.

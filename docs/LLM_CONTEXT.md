# bwondercomics.com - LLM Context Snapshot

This document is a concise handoff for new threads/agents. It captures how the site is run, key services, workflows, and known constraints.

## Repo & Structure
- Repo root: `/srv/bw-quality`
- Frontend sources:
  - Reader UI: `reader/` + `index.html` + `assets/css/main.css` + `assets/*`
  - Admin UI: `admin/`
- Backend: `backend/` (FastAPI + SQLAlchemy)
- Built frontend: `dist/` (served in production)
- Frontend build snapshots: `var/releases/dist-YYYYMMDD-HHMMSS.tar.gz`
- Media/content: `media/`, `chapters/`, `comics/<seriesId>/chapters/`
- Deploy config: `deploy/bwondercomics-compose.yml`, `deploy/Caddyfile`, `deploy/bwondercomics.env`

## Services (Docker Compose)
Main compose file: `deploy/bwondercomics-compose.yml`
- `bwondercomics-db`: Postgres 16
- `bwondercomics-api`: FastAPI (uvicorn)
- `caddy`: HTTPS reverse proxy + static file server
- Optional analytics: `umami` + `umami-db` (profile: `analytics`)

Ports are configurable via env in `deploy/bwondercomics.env`. Example running mappings seen:
- API: host `8001` -> container `8000`
- DB: host `5434` -> container `5432`
- Caddy: `80/443`

`deploy/bwondercomics.env` also sets `COMPOSE_PROJECT_NAME=bwondercomics`. If you run compose without that env file, container names/ports may differ.

## Env & Secrets
- `deploy/bwondercomics.env` contains secrets (do not share publicly).
- Compose needs those env vars for ports, project name, and backend config.

## Optional Host Services
- Systemd unit files exist in `deploy/` (usage may vary): `bwondercomics-api.service`, `bwondercomics-api.user.service`, `bwondercomics-backup.service`, `bwondercomics-backup.timer`
- Backup script: `deploy/bwondercomics-backup.sh`
- DB-only compose file: `deploy/bwondercomics-db-compose.yml`
- Fail2ban config lives in `deploy/fail2ban/`
- Namecheap DDNS env files in `deploy/namecheap-ddns.env*`

Note: Some older docs reference `/srv/bwondercomics`; the live repo is `/srv/bw-quality`.

## Start/Restart Commands
From repo root:
```
docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-compose.yml up -d
docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-compose.yml restart bwondercomics-api
```
If `docker compose` does not see running containers, use the container name:
```
docker restart bwondercomics-bwondercomics-api-1
```
Machine reboot depends on host OS (not in repo). After reboot, verify services with `docker compose ps` and run `up -d` if needed.

## Caddy Routing (deploy/Caddyfile)
- Proxies `/api/*` to `bwondercomics-api:8000`
- Proxies `/data.json`, `/series.json`, `/page-config.json`, `/media.json`, `/series/*` to the API
- Serves static:
  - `/assets/*` from `dist/assets` (fallback to repo `/assets`)
  - `/media/*` and `/chapters/*` from filesystem
  - `/` root from `dist/`

If the site turns into plain text or missing CSS/JS, confirm the `/assets/*` handler is correct and Caddy is running. The Caddyfile is sensitive to formatting; validate after edits.

## Frontend Workflow
- Edit source files in `reader/`, `admin/`, `assets/`, and top-level HTML files.
- Build `dist/` after changes:
```
./scripts/frontend-build.sh
```
This also snapshots the current `dist/` into `var/releases/`.

Avoid editing `dist/` directly. Treat it as build output only.

Backend changes do not hot-reload (uvicorn runs without `--reload`), so restart the API container after code changes.

## Backend Stack
- FastAPI app: `backend/app/main.py`
- Models: `backend/app/models.py`
- Migrations: `backend/alembic/versions/*`

Key tables:
- `users`, `comments`
- `email_subscribers`
- `premium_codes`, `premium_code_redemptions`
- `posts`, `media_items`
- `page_configs`, `series`, `entries`, `entry_pages`
- `banned_ips`, `censored_words`, `comment_limits`
- `admin_ops_runs`, `admin_todos`
- `social_accounts`
- `visitor_sessions`, `visitor_events`

## Entry Pages Ordering (Admin)
- Entry page order is stored in DB; saving an entry preserves the order as arranged in the UI.
- Uploads auto-sort only when the entry has no existing pages; otherwise new pages append at the bottom.
- Avoid renumber/sync unless you intentionally want to rename or rescan files.
- `entry_pages.path` should be web-relative like `chapters/09/01.png` (not an absolute `/srv/...` path).

## Email List (Two Paths)
1) Account opt-in:
   - Endpoint: `POST /api/user/email-opt`
   - Writes `users.email_opt_in` and `email_subscribers`
2) Left panel signup (public form):
   - Endpoint: `POST /api/email/subscribe`
   - Writes `email_subscribers` and syncs `users.email_opt_in` if the email matches a user

Admin email list uses:
- `GET /api/admin/email-subscribers`

Admin can add/remove email subscribers and delete users in the Users panel.

## Admin Todo Feed
- Dashboard has a DB-backed Todo Feed block.
- API: `GET /api/admin/todos`, `POST /api/admin/todos`, `DELETE /api/admin/todos/{id}`
- Stored in `admin_todos` table.

## Key API Endpoints (examples)
Auth/session:
- `GET /api/session`, `POST /api/login`, `POST /api/logout`

User:
- `GET /api/user/settings`
- `POST /api/user/email-opt`
- `POST /api/email/subscribe` (public)

Admin:
- `GET /api/admin/email-subscribers`
- `GET /api/admin/premium-codes`, `POST /api/admin/premium-codes`
- Diagnostics: `/api/admin/diagnostics/*`
- Ops: `/api/admin/ops`, `/api/admin/ops-history`

Content:
- `GET /api/posts`, `/api/posts/latest`
- `GET /series.json`, `/data.json`, `/page-config.json` (proxy to API)

## Known Pitfalls
- Do not reintroduce legacy static data sources or old root HTML files as a data store. The DB is the source of truth.
- Caddyfile edits can break routing; validate after edits and restart Caddy.
- Changing Docker volumes can accidentally create a new empty DB volume. Double-check volume names before restarts.
- Absolute filesystem paths in `entry_pages` will not render in the reader.

## Current Status (snapshot)
- Site online; main UI and admin mostly working.
- Email signup endpoint wired to DB.
- Patron welcome label exists in header and fades after 20s (yellow label).
- Entry display numbers persist in DB and are used for sorting when present.

## Future Goals / Intent
- Keep one source of truth (DB) and avoid legacy/static data sources.
- Prefer durable fixes over temporary shims.
- Keep frontend changes in source and rebuild `dist/` after each feature.

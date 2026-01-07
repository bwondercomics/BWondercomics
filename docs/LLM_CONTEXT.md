# bwondercomics.com - LLM Context Snapshot

This document is a concise handoff for new threads/agents. It captures how the site is run, key services, workflows, and known constraints.

## Repo & Structure
- Repo root: `/srv/bw-quality`
- Frontend sources:
  - Reader UI: `reader/` + `index.html` + `assets/css/main.css` + `assets/*`
  - Admin UI: `admin/`
- Backend: `backend/` (FastAPI + SQLAlchemy)
- Built frontend: `dist/` (served in production)
- Media/content: `media/`, `chapters/`
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

## Start/Restart Commands
From repo root:
```
docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-compose.yml up -d
docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-compose.yml restart bwondercomics-api
```
If `docker compose` doesn’t see running containers, use the container name:
```
docker restart bwondercomics-bwondercomics-api-1
```

Machine reboot depends on host OS (not in repo). If you have access, use the standard system reboot command for that host.

## Caddy Routing (deploy/Caddyfile)
- Proxies `/api/*` to `bwondercomics-api:8000`
- Proxies `/data.json`, `/series.json`, `/page-config.json`, `/media.json`, `/series/*` to the API
- Serves static:
  - `/assets/*` from `dist/assets` (falls back to repo `/assets`)
  - `/media/*` and `/chapters/*` from filesystem
  - `/` root from `dist/`

If the site turns into plain text or missing CSS/JS, confirm the `/assets/*` handler is correct and Caddy is running.

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
- `admin_ops_runs`
- `social_accounts`
- `visitor_sessions`, `visitor_events`

## Email List (Two Paths)
1) Account opt-in:
   - Endpoint: `POST /api/user/email-opt`
   - Writes `users.email_opt_in` and `email_subscribers`
2) Left panel signup (public form):
   - Endpoint: `POST /api/email/subscribe` (added)
   - Writes `email_subscribers` and syncs `users.email_opt_in` if the email matches a user

Admin email list uses:
- `GET /api/admin/email-subscribers`

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
- Don’t reintroduce legacy “wanna-be DB” files (old static JSON/HTML data sources). The DB is the source of truth.
- Caddyfile edits can break routing; validate after edits and restart Caddy.
- Changing Docker volumes can accidentally create a new empty DB volume. Double-check volume names before restarts.

## Current Status (as of this snapshot)
- Last reported: site online; main UI and admin mostly working.
- Left panel email signup now has a real backend endpoint.
- Patron welcome label exists in header and fades after 20s (yellow label).

## Future Goals / Intent
- Keep one source of truth (DB) and avoid legacy/static data sources.
- Prefer durable fixes over temporary shims.
- Keep frontend changes in source and rebuild `dist/` after each feature.

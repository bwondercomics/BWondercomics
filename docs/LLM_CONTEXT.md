# bwondercomics.com - LLM Context Snapshot

This document is a concise handoff for new threads/agents. It captures how the site is run, key services, workflows, and known constraints.

## Repo & Structure
- Repo root: `/srv/bw-quality`
- Frontend sources:
  - Reader UI: `reader/` + `index.html` + `assets/css/main.css` + `assets/*`
  - Admin UI: `admin/`
- Backend: `backend/` (FastAPI + SQLAlchemy)
- Built frontend: `dist/` (public pages served from here in production)
- Frontend build snapshots: `var/releases/dist-YYYYMMDD-HHMMSS.tar.gz`
- Media/content:
  - Public entry pages: `comics/<seriesId>/entries/<label-slug>/`
  - Premium/private entry pages: `protected/comics/<seriesId>/entries/<label-slug>/`
  - Public media: `media/`
  - Premium/private media: `protected/media/`
  - Public post copies (auto-managed): `media/post-assets/`
  - `protected/` is server-only and ignored by git (tracked only via `protected/.gitkeep`).
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
- Umami: host `3001` -> container `3000` (bound to localhost)

### Current active services (as of 2026-01-17)
All services are running in the live stack:
- `bwondercomics-api`
- `bwondercomics-db`
- `caddy`
- `umami`
- `umami-db`

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

## Vite Dev Server (local testing)
We now use a Vite dev server to preview **source files** (not `dist/`) for reader changes.

Start (server):
```
npm run dev -- --host 0.0.0.0 --port 5173
```

Stop:
```
kill <pid>
```
(PID is printed when the server starts; current example: `kill 795527`.)

Access:
- Server-local: `http://127.0.0.1:5173/`
- LAN: `http://10.0.0.166:5173/` (same router)

Firewall (LAN access only):
```
sudo ufw allow from 10.0.0.0/24 to any port 5173 proto tcp
sudo ufw delete allow from 10.0.0.0/24 to any port 5173 proto tcp
```

Vite proxies these to the API (so data.json/series.json work):
`/api`, `/data.json`, `/series.json`, `/page-config.json`, `/media.json`, `/series/*`, `/analytics.js`.

## Caddy Routing (deploy/Caddyfile)
- Proxies `/api/*` to `bwondercomics-api:8000`
- Proxies `/data.json`, `/series.json`, `/page-config.json`, `/media.json`, `/series/*` to the API
#### Serves static:
  - `/assets/*` from `dist/assets` (fallback to repo `/assets`)
  - `/media/*` and `/comics/*` from filesystem (`/chapters/*` is legacy)
  - `/admin/*` from repo root (`/srv/bwondercomics/root`) so admin uses source files
  - `/` root from `dist/`
#### Protected assets:
  - `/protected/*` is **not** served by Caddy.
  - Access goes through the API at `/api/protected/*` (auth + premium checks).

If the site turns into plain text or missing CSS/JS, confirm the `/assets/*` handler is correct and Caddy is running. The Caddyfile is sensitive to formatting; validate after edits.

## Frontend Workflow
- Edit source files in `reader/`, `admin/`, `assets/`, and top-level HTML files.
- Rebuild `dist/` after changes to public pages or shared assets:
```
./scripts/frontend-build.sh
```
This also snapshots the current `dist/` into `var/releases/`.
Admin is currently served from `admin/` (repo source) via Caddy; rebuilding `dist/` is optional for admin-only changes unless you change Caddy to serve admin from `dist/`.

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
- `entry_pages.path` should be web-relative like `comics/battle-bros/entries/issues/09/01.png`
  or `protected/comics/battle-bros/entries/issues/09/01.png` (not an absolute `/srv/...` path).
  - Entry labels (Issue/Volume/etc) live in `entry_labels` and drive the `<label-slug>` segment.

## Entry Payload (Reader/Admin)
- API payload uses `entries`, `entryMeta`, `entryFolders`.
- `payloadVersion: 2` indicates the entries schema.

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
- File ops: `POST /api/move-path`, `POST /api/copy-path`
- Protected files: `GET /api/protected/{path}`

Content:
- `GET /api/posts`, `/api/posts/latest`
- `GET /series.json`, `/data.json`, `/page-config.json` (proxy to API)

## Reader Analytics (In Progress - NEEDS DEBUGGING)

### What Works
- Visitor tracking: `POST /api/track/visitor` is recording events (4500+ in DB)
- Live analytics showing active visitors
- API endpoints responding (200 OK)

### What's Broken
**Admin Portal → Analytics → Reader Analytics shows "Unknown" for all entries instead of actual titles**

### Work Completed (Staged, Not Committed)
File: `backend/app/routes/admin_analytics.py`

**Session 1:** Fixed API response format mismatch
- Changed `/api/admin/analytics/reader` response structure to match frontend expectations
- Split `entries[]` into `entryViews[]`, `entryCompletions[]`, `entryStops[]`, `seriesViews[]`
- Renamed fields: `totalReads` → `entryReadsTotal`, `totalFinishes` → `entryFinishesTotal`
- Added overall stats: `finishRate`, `avgStopPage`

**Session 2:** Changed matching logic from titles to display_number
- Added `_extract_display_number()` helper to parse numbers from labels like `"battle-bros | Entry 5"` → `5`
- Changed entry lookup from `(series_id, normalized_title)` to `(series_id, display_number)`
- Updated event processing to extract display_number and use it for matching
- Display actual entry titles from DB instead of visitor event labels

### Data Format Reference
**Frontend sends to tracking endpoint:**
```javascript
entryLabel: "battle-bros | Entry 5"  // format: "{seriesId} | {unitLabel} {displayNumber}"
entryTitle: "Entry 5"
seriesId: "battle-bros"
```

**Database schema:**
```sql
-- visitor_events table
series_id: "battle-bros"
entry_label: "battle-bros | Entry 5"
entry_title: "Entry 5"

-- entries table
series_id: "battle-bros"
display_number: 5
title: "ISSUE 5"  -- display-only string, can be changed
```

### Architecture Principle
**Titles are display-only.** Entry identification must use `(series_id, display_number)`, never rely on title string matching.

### Still Shows "Unknown" - Debugging Next Steps
1. **Verify display_number is set:** Check if `entries.display_number` is NULL
   ```sql
   SELECT id, series_id, display_number, title FROM entries WHERE series_id = 'battle-bros';
   ```

2. **Test extraction function:** Check what display numbers are extracted from actual visitor event data
   ```python
   # In API container
   from backend.app.routes.admin_analytics import _extract_display_number
   _extract_display_number("battle-bros | Entry 5")  # Should return 5
   ```

3. **Check actual event labels:** Verify format matches expectations
   ```sql
   SELECT DISTINCT entry_label, entry_title FROM visitor_events LIMIT 20;
   ```

4. **Test API response:** Query endpoint with auth to see actual output
   ```bash
   # Needs authenticated session cookie
   curl -b cookies.txt http://localhost:8001/api/admin/analytics/reader?range=7d
   ```

5. **Possible issues:**
   - `display_number` might be NULL on entries
   - Label format in DB might differ from expected `"series-id | Entry N"` pattern
   - Regex might not match the actual format
   - May need fallback logic for entries without display_number

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
- Comment target IDs were remapped from legacy formats (e.g., `battle-bros:issue-*`, `battle-bros:chapter-*`, bare UUIDs) to the new scheme: `battle-bros:entry-<display_number>` and `post:<uuid>`.

## Future Goals / Intent
- Keep one source of truth (DB) and avoid legacy/static data sources.
- Prefer durable fixes over temporary shims.
- Keep frontend changes in source and rebuild `dist/` after each feature.
## Protected assets + post images
- **Protected files** live under `protected/` and are only served by `GET /api/protected/{path}`.
- **Entry pages** can live under `comics/...` (public) or `protected/comics/...` (premium/private).
  - `entry_pages.path` stores the web-relative path (may start with `protected/`).
- **Media items** can live under `media/...` (public) or `protected/media/...` (premium/private).
  - `media_items.access`: `public` | `premium` | `private`
  - `media_items.premium_visibility`: `blur` | `hidden` (public gallery behavior)
- **Post images**: when a post uses premium/private media, the API copies it to
  `media/post-assets/<id>.<ext>` and the post points at the copy so public feeds don’t break.
  `media/post-assets/` is derived and excluded from media sync.
- **Premium blur previews**: when a media item is `access=premium` + `premium_visibility=blur`,
  the API generates a real blurred JPEG at `media/previews/<media_id>.jpg` for public gallery use.
  - Blur strength is set in `backend/app/content_store.py` (`PREVIEW_BLUR_RADIUS`).
  - Admin media preview shows the public preview image alongside the original.

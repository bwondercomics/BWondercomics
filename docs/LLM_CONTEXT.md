# bwondercomics.com - LLM Context Snapshot

This document is a concise handoff for new threads/agents. It captures how the site is run, key services, workflows, and known constraints.

## Repo & Structure

- Repo root: `/srv/bw-quality`
- Frontend sources:
  - Reader UI: `reader/` + `index.html` + `assets/css/main.css` + `assets/*`
  - Admin UI: `admin/` (`admin/index.html` + `admin/admin.css`)
  - CSS is split into core sections under `assets/css/main.core.*.css` and responsive overrides in `assets/css/main.responsive.css`.
    `assets/css/main.css` now only imports `main.core.css` + `main.responsive.css`.
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

If you change public HTML/manifest branding behavior, `deploy/Caddyfile`, or the FastAPI routes that serve branded entry pages, restart both services:

```
docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-compose.yml restart bwondercomics-api caddy
```

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

## Recent Builder / Promo Changes (2026-01-28)

- Page Builder is now **edit-only**: preview toggle removed.
- Builder header toggles removed: **Disable Fallback** and **Published** are no longer in UI.
- Promo image picker is **simple select/upload** (no crop/focus/zoom editor).
- Promo slides support per‑item **Image Fit**:
  - `Fill (cover)` or `Fit (contain)`; defaults to cover.
- DB migration head currently at `0015_post_image_fit`.

## Caddy Routing (deploy/Caddyfile)

- Proxies `/api/*` to `bwondercomics-api:8000`
- Proxies `/data.json`, `/series.json`, `/page-config.json`, `/media.json`, `/series/*` to the API
- Proxies `/`, `/index.html`, `/feed.html`, `/comics.html`, `/media.html`, and `/manifest.json` to the API so FastAPI can inject site branding into crawler-visible HTML and the web manifest

#### Serves static:

- `/assets/*` from `dist/assets` (fallback to repo `/assets`)
- `/media/*` and `/comics/*` from filesystem (`/chapters/*` is legacy)
- `/admin/*` from repo root (`/srv/bwondercomics/root`) so admin uses source files
- remaining public routes from `dist/`

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

## Site Branding (OG + favicon)

- Admin Media now has a `Site Branding` panel backed by the default `page-config.json` record.
- `site.ogImagePath` controls homepage/root `og:image` and `twitter:image`.
- `site.faviconPath` controls `rel="icon"`, `rel="apple-touch-icon"`, and `manifest.json` icons when set.
- Only `public` media can be assigned. If a configured media item is deleted or changed to `premium`/`private`, the admin clears the branding field automatically before saving media changes.
- FastAPI validates configured branding paths, rejects protected assets, falls back to `assets/banner1.png` for OG and `assets/boywondericon.png` for the favicon, and returns branded HTML/manifest responses with `Cache-Control: no-store`.

## Entry Cover Gallery (Reader)

- Overlay root: `#entryCoverGallery`
- Grid container: `#entryCoverGalleryGrid`
- Button: `#entryCoverGalleryBtn`
- Close button: `#entryCoverGalleryClose`
- Entry card classes used by the reader gallery: `.entry-card`, `.entry-thumb-wrap`, `.entry-thumb`, `.entry-info`, `.entry-title`

Backend changes do not hot-reload (uvicorn runs without `--reload`), so restart the API container after code changes. If the change also touches branded public HTML routing or `deploy/Caddyfile`, restart Caddy too.

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

1. Account opt-in:
   - Endpoint: `POST /api/user/email-opt`
   - Writes `users.email_opt_in` and `email_subscribers`
2. Left panel signup (public form):
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

## Reader Analytics (Current State)

Admin analytics is now split into three layers:

- **Sitewide traffic** from Umami API metrics: summary, page reads, landing pages, referrers, countries, browsers, devices, top events.
- **Reader behavior** from direct Umami DB queries: pages read, entry starts, start-to-finish rate, reads-over-time, weekly digest, reader drilldowns.
- **Live visitors** from the local `visitor_sessions` table via `POST /api/track/visitor`.

### Implemented admin behavior

- Summary cards now mean:
  - `Pages Read` = raw `reader_page_view` count
  - `Entry Starts` = unique session-per-entry starts
  - `Start-to-Finish Rate` = unique finishes / unique starts
  - `Unique Visitors` = schema-safe Umami visitor identity count
- `Reads Over Time` now means raw page views over time, not unique starts.
- Reader tabs now show:
  - `Pages Read`
  - `Start-to-Finish Rate`
- Entry-specific analytics are series-safe through `entryKey = "<seriesId>:<displayNumber>"`.
- Drilldowns on rate cards call `/api/admin/analytics/reader-series?metric=completion_rate&entry_key=...`.
- The old stop/drop-off panel is removed from admin UI.
- `Top Landing Pages` now uses Umami `entry` metrics, not generic `path` metrics.
- `Top Events by Visitors` uses unique-visitor counts consistently, including the DB fallback path.
- A new `Visitor History` panel shows per-visitor metadata plus issue progress/finished state for the selected sitewide range. The list is now path-first and keeps the opaque visitor key in the detail pane.
- The analytics page is visually grouped into `Site Traffic`, `Visitor History`, and `Reader Engagement`.

### Frontend module layout

- `admin/analytics.js` is now a thin facade/coordinator that still exports `createAnalytics()`.
- Analytics screen logic is split under `admin/analytics/`:
  - `traffic.js` for summary + sitewide Umami panels
  - `reader.js` for health, reader cards, filters, and drilldowns
  - `reads-over-time.js` for the chart and its controls
  - `visitor-history.js` for search/sort/master-detail visitor history
  - `live.js` for active visitor polling, ticker, and live chart
  - `shared.js` for pure formatting helpers used across modules
- `admin/app.js` still imports only `createAnalytics()` from `admin/analytics.js`; the public facade contract was preserved during the split.

### Important endpoints

- `GET /api/admin/analytics/reader`
  - Returns `entryReadsTotal`, `entryStartsTotal`, `entryFinishesTotal`, `finishRate`, `uniqueVisitors`
  - Ranked lists: `entryViews`, `entryRates`, `seriesViews`, `seriesRates`
  - Entry-level lists include `entryKey`
- `GET /api/admin/analytics/reads-over-time`
  - `totals.reads` and `series[*].count` are raw page-view totals
  - Accepts `entry_key` for series-safe per-entry filtering
- `GET /api/admin/analytics/reader-series`
  - `metric=page_views` → raw page-view buckets
  - `metric=completion_rate` → bucketed `starts`, `finishes`, `completionRate`
  - Accepts `entry_key` and prefers it over legacy numeric-only entry filters
- `GET /api/admin/analytics/visitor-history`
  - Range-based historical visitor table from Umami
- `GET /api/admin/analytics/visitors`
  - `landingPages` comes from Umami `entry`
  - `events[*].count` is unique visitors per event
- `GET /api/admin/analytics/live`
  - Normalized contract is `generatedAt`, `windowSeconds`, `activeCount`, `visitors`
  - Compatibility aliases `total` and `sessions` are still returned for one pass

### Identity + matching rules

- **Titles are display-only.** Entry identification must use `(series_id, display_number)`, never title string matching.
- Umami visitor identity uses:
  1. `session.distinct_id` if present
  2. `session.visitor_id` if present
  3. `website_event.session_id` fallback
- Live visitors are intentionally separate from historical Umami visitor history; they do not share an identity source.

### Tracking data format reference

Frontend reader events still use labels like:

```javascript
entryLabel: 'battle-bros | Entry 5'; // "{seriesId} | {unitLabel} {displayNumber}"
seriesId: 'battle-bros';
page: 3;
totalPages: 6;
```

The analytics backend parses `displayNumber` from `entryLabel` and resolves titles/page counts from the app DB.

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

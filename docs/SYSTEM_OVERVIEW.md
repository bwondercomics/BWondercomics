# System overview (how it fits together)

This repo serves a plain HTML/CSS/JS frontend, with a FastAPI backend adding dynamic pieces (auth, comments, admin write APIs, scheduling + RSS, premium gating, analytics proxy).

## What runs where
- **Static frontend** (served by Caddy in production): `index.html` (reader shell), `feed.html`, `media.html`, `comics.html`, plus JS modules under `reader/` and `admin/`. Public pages come from `dist/`; the admin UI is served from `/admin/*` (repo source) per the current Caddyfile.
- **Static assets** (site chrome): `assets/` (icons, banners, UI images referenced by HTML and page configs).
- **Reverse proxy + file server**: Caddy (see `deploy/Caddyfile`) serves `/` from `dist/` and proxies `/api/*` + JSON endpoints to the API.
- **Backend API**: `backend/app/main.py` only serves API routes and JSON views (no static hosting).
- **Database**: Postgres (Docker Compose recommended) stores users/comments, posts, series, and entries.

## Core data model
- **Series**: a comic series (title/description, premium flag, and the per-series entry label like `Issue/Issues`).
- **Entries**: the updates within a series (internally “entries”; a series can call them “issues”, “chapters”, “episodes”, etc).
- **Entry pages**: ordered image paths for each entry (images live on disk under `comics/<seriesId>/entries/`; paths are stored in DB).
- **Posts**: feed/blog updates (draft/scheduled/published + optional share flag for RSS/social).
- **Users + comments**: accounts + comment threads (with roles for admin/premium).
- **Media library**: Postgres table for the media index + files under `media/` (tagged library used by admin/tools).

## Routing + contracts (why the frontend still works)
The backend serves **DB-backed JSON at the existing file paths** (Caddy proxies these to the API) so the reader/admin can keep using the same URLs:
- `GET /admin/series.json` → series list (DB-backed)
- `GET /admin/data.json` → default series entries (DB-backed)
- `GET /admin/series/<id>/data.json` → per-series entries (DB-backed)

DB is the source of truth. Do not reintroduce static HTML/JSON files as a data store.

The admin “save JSON” flow is also kept, but is intercepted and written to Postgres:
- `POST /api/save` with `filename=admin/series.json` → updates series in DB
- `POST /api/save` with `filename=admin/data.json` or `admin/series/<id>/data.json` → updates entries in DB

## Key user flows
### 1) Reading comics
1. Browser loads `index.html`.
2. `reader/app.js` determines `seriesId` from `?series=<id>` (default is `battle-bros`).
3. Reader fetches:
   - `admin/series.json` (series list + labels)
   - `admin/data.json` or `admin/series/<id>/data.json` (entries + page paths + status + labels)
   - `admin/page-config.json` or `admin/series/<id>/page-config.json` (theme/panel content; DB-backed)
   - `GET /api/posts/latest` (latest update widget)
4. Reader renders pages from the paths in the data JSON.

### 2) Managing series + entries (admin)
1. Admin opens `/admin/` and signs in (must be an `admin` role).
2. Admin edits series settings (including the per-series entry label).
3. Admin creates/edits entries, uploads pages, reorders pages, and saves.
4. Admin writes go through `/api/save` (DB-backed for series, entries, media index, and page configs).

### 3) Posts + RSS
- Admin CRUD happens at `/api/admin/posts`.
- Public feed reads:
  - `/api/posts` (published-only; scheduled become visible when due)
  - `/api/posts/latest` (single latest visible post)
  - `/rss.xml` (generated from DB; only shareable + publishable posts)

### 4) Comments + roles
- Auth: `/api/register`, `/api/login`, `/api/session`, `/api/logout` (cookie session).
- Comments: `/api/comments` (read/write) with moderation routes under `/api/admin/*`.
- Premium gating is enforced server-side based on request path + the user’s role.

### 5) Pretty URLs
- `/series/<id>/` redirects to `/index.html?series=<id>` so you can link cleanly.

## Where to read code (entry points)
- Backend runtime + routing: `backend/app/main.py`
- Series/entry JSON views and DB save logic: `backend/app/series_store.py`, `backend/app/routes/series_json.py`, `backend/app/routes/files.py`
- Reader boot + behavior: `reader/app.js`, `reader/data.js`, `reader/series.js`
- Admin boot + behavior: `admin/app.js`, `admin/chapters.js`

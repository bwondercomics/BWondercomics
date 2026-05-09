# System overview (how it fits together)

This repo serves a plain HTML/CSS/JS frontend, with a FastAPI backend adding dynamic pieces (auth, comments, admin write APIs, scheduling + RSS, premium gating, analytics proxy).

## What runs where

- **Static frontend** (served by Caddy in production): `index.html` (reader shell), `feed.html`, `media.html`, `comics.html`, plus JS modules under `reader/` and `admin/`. Public pages come from `dist/`; the admin UI is served from `/admin/*` (repo source) per the current Caddyfile.
- **Static assets** (site chrome): `assets/` (icons, banners, UI images referenced by HTML and page configs).
- **Reverse proxy + file server**: Caddy (see `deploy/Caddyfile`) serves static assets/files and proxies `/api/*`, DB-backed JSON endpoints, and exact public page routes used for dynamic branding to the API.
- **Backend app**: `backend/app/main.py` primarily serves API routes and JSON views. It also serves branded HTML responses for `/`, `/index.html`, `/feed.html`, `/comics.html`, `/media.html`, plus `/manifest.json`, so crawlers receive the configured OG image and favicon.
- **Database**: Postgres (Docker Compose recommended) stores users/comments, posts, series, and entries.

## Core data model

- **Series**: a comic series (title/description, premium flag, and the per-series entry label like `Issue/Issues`).
- **Entries**: the updates within a series (internally “entries”; a series can call them “issues”, “chapters”, “episodes”, etc).
- **Entry pages**: ordered image paths for each entry (local images live on disk under the canonical `comics/<seriesId>/entries/<label-slug>/...` tree for public pages or `protected/comics/<seriesId>/entries/<label-slug>/...` for premium/private; paths are stored in DB).
- **Posts**: feed/blog updates (draft/scheduled/published + optional share flag for RSS/social).
- **Users + comments**: accounts + comment threads (with roles for admin/premium).
- **Media library**: Postgres table for the media index + files under `media/` (public) or `protected/media/` (premium/private). Access is tracked via `media_items.access` (`public`/`premium`/`private`) and `media_items.premium_visibility` (`blur`/`hidden`).
- **Post assets**: when a post uses premium/private media, the API copies it into `media/post-assets/` so public feeds still show the image.
- **Premium blur previews**: when a media item is `premium + blur`, the API generates a real blurred JPEG in `media/previews/` for the public gallery (derived output).
- **Site branding config**: the default `page_configs` record now also carries optional `site.ogImagePath` and `site.faviconPath` values for global branding. These must point to public assets.

## Routing + contracts (why the frontend still works)

The backend serves **DB-backed JSON at the existing file paths** (Caddy proxies these to the API) so the reader/admin can keep using the same URLs:

- Public:
  - `GET /series.json` → series list (DB-backed)
  - `GET /data.json` → default series entries (DB-backed)
  - `GET /series/<id>/data.json` → per-series entries (DB-backed)
- Admin:
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
   - `series.json` (series list + labels)
   - `data.json` or `series/<id>/data.json` (entries + page paths + status + labels)
   - `GET /api/pages/home/<seriesId>` or `GET /api/pages/<seriesId>/<slug>` (builder-page reader shell/content)
   - `GET /api/posts/latest` (latest update widget)
4. Reader renders pages from the paths in the data JSON.
   - If a page path starts with `protected/`, the reader requests it via `/api/protected/<path>`.
   - Legacy `page-config.json` is no longer part of normal reader startup; it remains available for branding/admin helpers and `reader/safe-mode.js` recovery behavior.

### 2) Managing series + entries (admin)

1. Admin opens `/admin/` and signs in (must be an `admin` role).
2. Admin edits series settings (including the per-series entry label). Series `premiumOnly` changes first synchronize every entry's folder/page paths with the effective access level.
3. Admin creates/edits entries, uploads pages, reorders pages, and saves. Entry saves use the same access-path sync as the series toggle flow.
4. Admin writes go through `/api/save` (DB-backed for series, entries, media index, and page configs).
5. File moves/copies (public ↔ protected) go through `/api/move-path` and `/api/copy-path`, and `apply_series_data_save(...)` rejects mismatched local public/protected entry paths before the DB write completes.

### 2a) Managing site branding (admin media)

1. Admin opens the Media tab and selects a public media item.
2. `Set as OG image` writes `site.ogImagePath` on the default page config.
3. `Set as favicon` writes `site.faviconPath` on the default page config.
4. The `Site Branding` panel shows current assignments and lets the admin reset either value to the built-in defaults.
5. If the configured media is deleted or moved off `public`, the admin clears the affected branding field automatically before the media save finishes.

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
- Dynamic site-branding helpers/routes: `backend/app/site_branding.py`, `backend/app/routes/site_branding.py`
- Series/entry JSON views and DB save logic: `backend/app/series_store.py`, `backend/app/routes/series_json.py`, `backend/app/routes/files.py`
- Reader boot + behavior: `reader/app.js`, `reader/data.js`, `reader/series.js`
- Admin boot + behavior: `admin/app.js`, `admin/entries.js`, `admin/media.js`, `admin/page-config.js`

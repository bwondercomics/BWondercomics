# BWonderComics architecture

This repo serves a plain HTML/CSS/JS site with a backend that adds the dynamic pieces you can’t do on a purely static host (auth, comments, scheduling, admin write APIs, RSS, analytics proxy).

## Components
- Frontend (static): `index.html`, `feed.html`, `media.html`, `comics.html`, plus `reader/` + `admin/` JS modules.
- Static assets (site chrome): `assets/` (icons, banners, UI images used by the site/theme).
- Reverse proxy + file server: Caddy (see `deploy/Caddyfile`) serves `/` from `dist/` and `/admin/*` from repo source, and proxies API routes.
- Backend (dynamic): FastAPI app in `backend/` (Docker-friendly). API only (no static hosting).
- Database: Postgres (recommended) for users, comments, posts, series, entries, and media.

## Data sources
- Series + entries (including per-series entry labels) + status message: Postgres (served to the frontend as DB-backed JSON at `admin/data.json` and `admin/series/<id>/data.json`).
- Entry page images: on disk under `comics/<seriesId>/entries/`.
- Blog/feed posts: Postgres `posts` table (supports draft/scheduled/published).
- Comments + accounts: Postgres (`users`, `comments` tables).
- Media library: Postgres table (index + tags) with files under `media/` on disk.
- Page configs: Postgres table, served at `/admin/page-config.json` and `/admin/series/<id>/page-config.json`.

## Runtime routing
- Caddy serves static pages and assets, and proxies `/api/*` + JSON endpoints to the FastAPI app.
- FastAPI serves API routes under `/api/*` (and `/rss.xml`); it does not serve static files.

## API (current contract)
- Series + entries (DB-backed JSON views, used by reader/admin):
  - `GET /admin/series.json`
  - `GET /admin/data.json`
  - `GET /admin/series/{id}/data.json`
- Public posts:
  - `GET /api/posts` → `{ posts: Post[] }` (published only; scheduled posts appear once due)
  - `GET /api/posts/latest` → `{ post: Post | null }`
- Admin posts (admin cookie required):
  - `GET /api/admin/posts`
  - `POST /api/admin/posts`
  - `PUT /api/admin/posts/{id}`
  - `DELETE /api/admin/posts/{id}`
- RSS:
  - `GET /rss.xml` (generated from DB; only `share=true` and publishable)
- Auth + comments:
  - `POST /api/login`, `POST /api/register`, `GET /api/session`, `POST /api/logout`
  - `GET /api/comments?targetId=...`, `POST /api/comments`
  - moderation + users: `GET /api/admin/users`, `POST /api/admin/users/role`, `POST /api/admin/comments`

## Scheduling model (posts)
- `status=draft` → never public, forces `share=false`
- `status=scheduled` + `date` in the future → becomes public automatically once `date <= now`
- `status=published` → public immediately

## Analytics
If Umami is enabled, the backend serves:
- `GET /analytics.js` (injects the Umami tracker script)
- `/umami/*` proxy (so the tracker + admin API calls can be same-origin)
Admin analytics pulls Umami stats via API (no embedded dashboard).
In Docker, Umami runs as an optional compose profile (`analytics`) alongside the main stack.

## Data seeding
- The backend seeds a default series only if the DB is empty. JSON endpoints are always DB-backed; do not treat static JSON or HTML files as a data source.

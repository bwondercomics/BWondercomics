# BWonderComics architecture

This repo serves a plain HTML/CSS/JS site with a backend that adds the dynamic pieces you can’t do on a purely static host (auth, comments, scheduling, admin write APIs, RSS, page-builder persistence, analytics proxy).

## Components

- Frontend (static): `index.html`, `feed.html`, `media.html`, `comics.html`, plus `reader/` + `admin/` JS modules.
- Static assets (site chrome): `assets/` (icons, banners, UI images used by the site/theme).
- Reverse proxy + file server: Caddy (see `deploy/Caddyfile`) serves `/` from `dist/` and `/admin/*` from repo source, and proxies API routes.
- Backend (dynamic): FastAPI app in `backend/` (Docker-friendly). Mostly API/JSON, but it also serves branded HTML for selected public routes and `manifest.json`.
- Database: Postgres (recommended) for users, comments, posts, series, entries, media, builder pages, and builder-page bindings.

## Data sources

- Series + entries (including per-series entry labels) + status message: Postgres (served to the frontend as DB-backed JSON at `data.json` and `series/<id>/data.json`; admin aliases still exist).
- Entry page images: on disk under `comics/<seriesId>/entries/` (public) or `protected/comics/<seriesId>/entries/` (premium/private).
- Blog/feed posts: Postgres `posts` table (supports draft/scheduled/published).
- Comments + accounts: Postgres (`users`, `comments` tables).
- Media library: Postgres table (index + tags) with files under `media/` (public) or `protected/media/` (premium/private). Access is tracked via `media_items.access` and `media_items.premium_visibility`.
- Builder pages: Postgres stores global pages and series pages as structured sections/modules. Series reader routes resolve through same-series reader bindings; global pages resolve through explicit global routes and never shadow series pages.
- Post assets: when posts use premium/private media, the API copies the image into `media/post-assets/` for public feeds.
- Page configs: Postgres table, served at `/page-config.json` and `/series/<id>/page-config.json` (admin aliases also exist).
- Global site branding: the default page config can include `site.ogImagePath` and `site.faviconPath`, both restricted to public assets.

## Runtime routing

- Caddy serves static pages and assets, and proxies `/api/*` + JSON endpoints to the FastAPI app.
- Caddy also proxies `/`, `/index.html`, `/feed.html`, `/comics.html`, `/media.html`, and `/manifest.json` to FastAPI so branded head tags can be generated per request.
- FastAPI serves API routes under `/api/*`, DB-backed JSON endpoints, `/rss.xml`, branded public HTML shells, and `manifest.json`. It does not serve arbitrary static files.
- Protected files are served by FastAPI at `/api/protected/*` (Caddy does not serve `/protected/*` directly).

## API (current contract)

- Series + entries (DB-backed JSON views, used by reader/admin):
  - Public: `GET /series.json`, `GET /data.json`, `GET /series/{id}/data.json`
  - Admin: `GET /admin/series.json`, `GET /admin/data.json`, `GET /admin/series/{id}/data.json`
- Builder pages:
  - Public series pages: `GET /api/pages/{series_id}/{slug}`
  - Public global pages: `GET /api/pages/global/by-slug/{slug}`
  - Effective series home/reader page: `GET /api/pages/home/{series_id}`
  - Admin page lists: `GET /api/admin/pages/series/{series_id}`, `GET /api/admin/pages/global`
  - Admin page records, sections, modules, reorders, and moves live under `/api/admin/pages/*`, `/api/admin/sections/*`, and `/api/admin/modules/*`
  - Admin reader bindings: `GET/PUT /api/admin/page-bindings/{series_id}`
- Site branding:
  - `GET /page-config.json` returns the default page config, including optional `site.ogImagePath` and `site.faviconPath`
  - `GET /`, `GET /index.html` return branded HTML with favicon tags plus `og:image` / `twitter:image`
  - `GET /feed.html`, `GET /comics.html`, `GET /media.html` return branded HTML with favicon tags
  - `GET /manifest.json` returns the built manifest, overriding icons when `site.faviconPath` is configured
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

## Page builder and preview architecture

- The admin page builder is a full-page shell. The default canvas is the public reader route loaded
  in a same-origin iframe with `builderPreview=1` and a session token.
- `admin/page-builder/preview-contract.js` validates snapshots, target geometry, inline-edit
  messages, metrics, and control messages on both sides of the iframe boundary.
- Desktop, Tablet, and Phone presets use exact iframe CSS pixels: `1920x1080`, `768x1024`, and
  `375x812`. The admin canvas may scale the full-HD Desktop frame visually, but reader media queries
  still see the exact iframe viewport.
- The builder owns structured pages, sections, modules, page headers, theme/panel settings, page
  scopes, templates, draft/preview merging, command/keymap routing, local draft undo/redo, live
  drag/drop, and text-module inline editing.
- Public reader output and admin preview share module HTML through the page-builder shared renderer
  path; the iframe DOM remains a view, while saved builder records remain canonical.

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

## Branding constraints

- Only media with `access=public` can be used for OG or favicon branding.
- Protected or missing branding assets are ignored and fall back to `assets/banner1.png` for OG and `assets/boywondericon.png` for favicon.
- Branded HTML and manifest responses are sent with `Cache-Control: no-store`, so origin changes show up on the next request. Social sites may still cache previews independently.

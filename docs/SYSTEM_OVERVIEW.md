# System overview (how it fits together)

This repo serves a plain HTML/CSS/JS frontend, with a FastAPI backend adding dynamic pieces (auth, comments, admin write APIs, scheduling + RSS, premium gating, page-builder persistence, analytics proxy).

## What runs where

- **Static frontend** (served by Caddy in production): `index.html` (reader shell), `feed.html`, `media.html`, `comics.html`, plus JS modules under `reader/` and `admin/`. Public pages come from `dist/`; the admin UI and its `shared/page-builder/` kernel are served from repo source per the current Caddyfile.
- **Static assets** (site chrome): `assets/` (icons, banners, UI images referenced by HTML and page configs).
- **Reverse proxy + file server**: Caddy (see `deploy/Caddyfile`) serves static assets/files and proxies `/api/*`, DB-backed JSON endpoints, and exact public page routes used for dynamic branding to the API.
- **Backend app**: `backend/app/main.py` primarily serves API routes and JSON views. It also serves branded HTML responses for `/`, `/index.html`, `/feed.html`, `/comics.html`, `/media.html`, plus `/manifest.json`, so crawlers receive the configured OG image and favicon.
- **Database**: Postgres (Docker Compose recommended) stores users/comments, posts, series, entries,
  media, builder pages/bindings, and retained builder recovery snapshots.

## Core data model

- **Series**: a comic series (title/description, premium flag, and the per-series entry label like `Issue/Issues`).
- **Entries**: the updates within a series (internally “entries”; a series can call them “issues”,
  “chapters”, “episodes”, etc). Publication state is `published`, `scheduled`, or `draft`, with
  `publish_at` controlling automatic scheduled release.
- **Entry pages**: ordered image paths for each entry (local images live on disk under the canonical `comics/<seriesId>/entries/<label-slug>/...` tree for public pages or `protected/comics/<seriesId>/entries/<label-slug>/...` for premium/private; paths are stored in DB).
- **Posts**: feed/blog updates (draft/scheduled/published + optional share flag for RSS/social).
- **Users + comments**: accounts + comment threads (with roles for admin/premium).
- **Media library**: Postgres table for the media index + files under `media/` (public) or `protected/media/` (premium/private). Access is tracked via `media_items.access` (`public`/`premium`/`private`) and `media_items.premium_visibility` (`blur`/`hidden`).
- **Builder pages**: Postgres-backed structured pages with `global` or `series` scope, sections, modules, page header metadata, theme/panel state, and reader bindings for series reader routes.
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

Every admin series-data alias requires an authenticated admin. Successful responses use
`Cache-Control: no-store`, include drafts and scheduled entries, and retain complete page lists plus
raw `status`/`publishAt` metadata. Public payloads omit drafts and advertise future scheduled entries
as Coming Soon with page paths withheld until release.

DB is the source of truth. Do not reintroduce static HTML/JSON files as a data store.

The admin “save JSON” flow is also kept, but is intercepted and written to Postgres:

- `POST /api/save` with `filename=admin/series.json` → updates series in DB
- `POST /api/save` with `filename=admin/data.json` or `admin/series/<id>/data.json` → updates entries in DB

Builder pages use explicit page-builder APIs rather than the legacy save-JSON path:

- Public series pages: `/api/pages/<seriesId>/<slug>`
- Public global pages: `/api/pages/global/by-slug/<slug>`
- Effective series root/home page: `/api/pages/home/<seriesId>`, falling back to the same-series reader binding when needed
- Admin scoped lists and creates: `/api/admin/pages/series/<seriesId>` and `/api/admin/pages/global`
- Admin page records, sections, modules, reorders, moves, and reader bindings: `/api/admin/pages/*`, `/api/admin/sections/*`, `/api/admin/modules/*`, and `/api/admin/page-bindings/<seriesId>`
- Admin recovery history: `GET /api/admin/pages/<pageId>/snapshots`,
  `GET /api/admin/page-snapshots/deleted`, `GET /api/admin/page-snapshots/<snapshotId>`, and
  `POST /api/admin/page-snapshots/<snapshotId>/restore`

## Key user flows

### 1) Reading comics

1. Browser loads `index.html`.
2. `reader/app.js` determines `seriesId` from `?series=<id>` (default is `battle-bros`).
3. Reader fetches:
   - `series.json` (series list + labels)
   - `GET /api/pages/home/<seriesId>`, `GET /api/pages/<seriesId>/<slug>`, or `GET /api/pages/global/by-slug/<slug>` when `pageScope=global` is requested
4. The resolved builder page determines reader-shell ownership.
   - Pages without an effective Comic Reader module render authored builder content and skip
     reader-only data, controls, comments, analytics, pointer, fullscreen, and live tracking setup.
   - Pages with a reader module fetch `data.json` or `series/<id>/data.json`, apply the module's
     source/settings, and initialize reader-owned panels/comments.
5. Active reader pages render in the authored `paged` or `vertical-scroll` display mode and load
   `/api/posts/latest` for the latest-update surface.
   - If a page path starts with `protected/`, the reader requests it via `/api/protected/<path>`.
   - Paged mode uses the static stage, spread logic, zoom/pan, and optional fullscreen.
   - Vertical mode renders every page into a continuous strip, tracks progress from scroll
     visibility, and disables paged-only zoom/pan/fullscreen behavior.
   - Ordinary builder sections before/after the reader module render above/below the reader rather
     than becoming side panels.
   - Legacy `page-config.json` is no longer part of normal reader startup; it remains available for branding/admin helpers and `reader/safe-mode.js` recovery behavior.

### 2) Managing series + entries (admin)

1. Admin opens `/admin/` and signs in (must be an `admin` role).
2. Admin edits series settings (including the per-series entry label). Series `premiumOnly` changes first synchronize every entry's folder/page paths with the effective access level.
3. Admin creates/edits entries, uploads pages, reorders pages, and saves. Entry saves use the same
   access-path sync as the series toggle flow. Scheduled entries require a future date in the editor
   and are always advertised as Coming Soon until the backend promotes them at release time.
4. Admin writes go through `/api/save` (DB-backed for series, entries, media index, and page configs).
5. File moves/copies (public ↔ protected) go through `/api/move-path` and `/api/copy-path`, and `apply_series_data_save(...)` rejects mismatched local public/protected entry paths before the DB write completes.

### 2a) Managing site branding (admin media)

1. Admin opens the Media tab and selects a public media item.
2. `Set as OG image` writes `site.ogImagePath` on the default page config.
3. `Set as favicon` writes `site.faviconPath` on the default page config.
4. The `Site Branding` panel shows current assignments and lets the admin reset either value to the built-in defaults.
5. If the configured media is deleted or moved off `public`, the admin clears the affected branding field automatically before the media save finishes.

### 2b) Managing builder pages

1. Admin opens the full-page builder from `/admin/`.
2. The builder loads either active-series pages or global pages through scoped page APIs.
3. The live canvas renders the real reader route in a same-origin iframe using `builderPreview=1`.
4. Unsaved module/header/theme/page/section drafts are merged into cloned preview snapshots without mutating saved records.
5. Blocks, layers, selected-target overlays, live drag/drop, text inline editing, commands/keymaps, and local draft undo all operate on canonical builder records through the page-builder API.
6. Desktop, Tablet, and Phone preview contexts use exact iframe pixels (`1920x1080`, `768x1024`, `375x812`); the admin canvas can visually scale Desktop without changing reader viewport behavior.
7. Reader module settings expose paged/vertical display, controls, stage, panels, comments, and safe
   device overrides. Section settings expose 1-6 structural columns, ratios, sparse per-column
   appearance/padding/alignment/min-height/visibility, and device-specific reflow.
8. The admin verifies `/api/admin/page-builder/runtime` before responsive module saves. Popup-arrow
   moves remain in a page-wide structure draft until the atomic placements save; Save Page preserves
   publication state, while Publish/confirmed Unpublish are the only visibility transitions.
9. Every committed backend mutation records a distinct complete pre-state in the same transaction.
   Toolbar **History** and Pages-scope **Deleted pages** use the admin-only recovery API to inspect
   validated records, restore current content without changing live routing/publication/bindings,
   or recover a deleted page as an appended unpublished and unbound draft. Restore is blocked by
   dirty local work and resets drafts, undo history, and the iframe preview session after success.

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
- Builder-page persistence, validation, and recovery history: `backend/app/page_store.py`,
  `backend/app/builder_history.py`, the `backend/app/builder_security/` package,
  `backend/app/reader_bindings.py`, and page-builder routes in `backend/app/routes/`. New pages get
  a server-owned baseline; later mutations retain their pre-states under deterministic page locks;
  and validated current/deleted restore runs atomically through admin-only APIs.
- Reader boot + behavior: `reader/app.js`, `reader/data.js`, `reader/series.js`
- Admin boot + behavior: `admin/app.js`, `admin/entries.js`, `admin/media.js`,
  `admin/page-config.js`, `admin/page-builder.js`, and `admin/page-builder/`
- Shared builder/reader contracts and rendering: `shared/page-builder/`

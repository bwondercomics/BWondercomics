# Battle Bros Reader Architecture

This document maps how the site loads, where data lives, and how the admin tools change content.

## Overview
- Frontend: single-page reader at `index.html`; supporting pages `feed.html` (updates) and `media.html` (media browser). Pure HTML/CSS/JS; no build step.
- Dynamic data: JSON files at the repo root and in `admin/` drive most content (`admin/data.json`, `posts.json`, `media.json`, `admin/page-config.json`).
- Admin: `admin/index.html` edits chapters, posts, media, and status text; relies on the local API in `server.py`.
- Assets: chapter images under `/chapters/`; media under `/media/`; marketing art at root (`banner*.png`, `panel.png`, `bookturn.gif`).
- Related docs and diagrams: `reader-overview.md`, `admin-overview.md`.

## Reader (index.html)
- Layout: sticky top bar (logo, status ticker, chapter select, gallery/media links), left promo panel (book GIF + email signup), central viewport (single/two-page stage), right panel (latest update + CTA buttons).
- Data loading:
  - Chapters/status from `admin/data.json` (`chapters`, `chapterFolders`, `statusMessage`), fetched with `cache: 'no-store'`.
  - Optional overrides from `admin/page-config.json` (theme vars, header subtitles, panel images/text, button list, layout order).
  - Latest update widget pulls newest entry from `posts.json` by `date`.
- Reading experience:
  - Single/two-page mode based on width ≥900px and aspect ratio; animated page transitions.
  - Navigation: prev/next buttons, edge-click zones, keyboard (←/→, +/-, 0, F, ?, Esc), double-click fit, swipe gestures when not zoomed.
  - Zoom/pan: wheel+Ctrl, pinch-to-zoom, drag when zoomed, fit/reset, fullscreen with auto-hide controls.
  - Overlays: cover gallery populated from chapters, shortcuts modal, end-of-chapter prompt (next/restart).
  - Progress stored in `localStorage` (`battleBros_progress`); animated status panel shows `statusMessage` or “ready”.
- Email signup: Formspree POST to `https://formspree.io/f/xjkjkvla` with inline success/error states.
- Customization API: `window.BattleBros` exposes `setSubtitle`, `setRandomSubtitle`, `setSubtitles` for external scripts/config.

## Feed (feed.html)
- Fetches `posts.json` (`cache: 'no-cache'`), normalizes `imageTags`, sorts newest-first by `date`, renders posts (HTML-escaped content, `<br>` for newlines).
- Navigation links back to reader and RSS; comments run on the built-in auth + `/api/comments` endpoints (local JSON storage, simple login/register UI).

## Media Library (media.html)
- Fetches `media.json`; renders cards with thumbnail, path, tags; search filters by filename/tag; tag pills toggle filters.
- Lightbox supports prev/next/esc and respects current filtered list; empty/error states handled inline.

## Admin Panel (admin/index.html)
- Auth: uses the built-in account system (`/api/login`, `/api/session`) and requires `role=admin` for admin-only APIs.
- Data loading: tries `admin/data.json`, `posts.json`, `media.json`; falls back to `localStorage` draft (`battlebros_admin_data`) if missing.
- Sections:
  - Chapters: list, add/edit/delete, drag/drop reorder, manual page add, reconcile with disk (`/api/list-images`), ensure folder (`/api/create-chapter`), renumber on disk (`/api/renumber-chapter`), upload images via `/api/upload-images`, delete via `/api/delete-image`.
  - Status message: editable text persisted with chapters.
  - Preview/Export: JSON preview, copy/download, simple image preview carousel.
  - Blog/Feed: create/update/delete posts (title/content/share flag, optional image/tags); upload image to `/api/upload-media`; saves to `posts.json` via `/api/save` (triggers RSS generation).
  - Media: manage `media.json`, sync with disk via `/api/list-media`, apply media to posts, add/edit tags.
  - Settings: store GitHub token in `localStorage` (`battlebros_github_user_token`); optional publish to GitHub (PUT `admin/data.json` to configured repo/branch).
- Persistence: primary saves go through `server.py` endpoints; drafts also cached in `localStorage` for safety.

## Backend API (server.py)
- Static file server plus POST endpoints (paths normalized with `safe_path` to avoid traversal):
  - `/api/save` → write `filename` with `content`; pretty-prints JSON; regenerates RSS when `posts.json` is saved.
  - `/api/upload-images` → base64 list → chapter folder, auto-numbered sequentially.
  - `/api/delete-image` → remove a file.
  - `/api/rename-image` → safe rename with collision checks.
  - `/api/renumber-chapter` → rename images to match supplied order (two-phase to prevent collisions).
  - `/api/list-images` → list sorted images in a chapter folder.
  - `/api/create-chapter` → ensure chapter folder exists.
  - `/api/upload-media` → save one image into `media/` with a unique sanitized name.
  - `/api/list-media` → recursive media listing under `media/`.
- RSS generation: `generate_rss(posts)` writes `rss.xml` for posts with `share !== false`, newest-first.
- Local dev: `start-server.bat` runs `server.py` at `http://localhost:8000`.

## Key Data Files
- `admin/data.json`: `{ chapters: {name: [paths]}, chapterFolders, statusMessage, lastUpdated, publishedBy }`.
- `admin/page-config.json`: optional theme/layout/content overrides and subtitle list.
- `posts.json`: array `{ id, title, content, date, image?, imageTags?, share? }`; drives feed, RSS, and reader widget.
- `media.json`: array `{ id, path, tags[] }`; drives media library and post tag suggestions.
- `manifest.json`: PWA manifest; `robots.txt`: disallow `/chapters/`; `sitemap.xml`: static URLs; `rss.xml`: auto-generated.

## Notes & Risks
- Admin auth uses signed HttpOnly cookies; still secure it before production (HTTPS, rate limiting, and restrict `/admin/` behind a proxy/VPN if possible).
- Comments are not wired; embed a provider in `feed.html` placeholder as needed.
- Static hosting cannot accept writes; use the GitHub publish flow or host `server.py` where writes are allowed.
- Some legacy docs contain stray Unicode; main code paths are ASCII and safe to edit.
- Legacy patch scripts (`update_index.py`, `update_js.py`) were one-off injectors and have been removed to keep the repo clean.

## Quick Start (local)
1) Run `start-server.bat` (or `py server.py`) to serve and enable API endpoints.  
2) Open `admin/index.html`, log in, edit chapters/posts/media; saves hit the API and update JSON on disk.  
3) Refresh `index.html`/`feed.html`/`media.html` to see changes; RSS regenerates when posts are saved.

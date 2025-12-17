# Refactor Roadmap (Reader + Admin) (archived)

Goal: modularize the monolithic HTML-embedded JS without adding a heavy build step. Use native ES modules (`<script type="module">`) and keep CSS/HTML largely intact.

Progress:
- Extracted constants to `reader/config.js` and chapter helpers to `reader/chapters.js`; `reader/app.js` imports them as a module.
- Moved reader state + progress persistence to `reader/state.js`; `reader/app.js` now imports state helpers.
- Added data/dom modules (`reader/data.js`, `reader/dom.js`) and wired chapter/page-config/latest-post loading plus shared element lookup into `reader/app.js`.
- Moved render helpers (status panel, image preload/load, render/updateUI) and layout helpers into `reader/render.js`; `reader/app.js` imports them and removed inline copies.
- Added `reader/controls.js` with navigation + end-of-chapter overlay helpers; `reader/app.js` now uses these instead of inline navigation logic.
- Added `reader/transform.js` (transform/zoom/fit helpers) and `reader/pointer.js` (pan/zoom/swipe/edge-zone handlers); `reader/app.js` now imports and calls these instead of inline pointer/transform logic.
- Added `reader/fullscreen.js` (fullscreen show/hide logic) and `reader/overlays.js` (shortcuts + chapter change helpers); `reader/app.js` now delegates to these modules.
- Added `reader/gallery.js` to handle gallery rendering/toggling; `reader/app.js` calls the module for the gallery button and rendering.
- Added `reader/latest.js` for the latest update widget rendering; `reader/app.js` uses it.
- Added `reader/email.js` for the email signup form; inline handler removed from `reader/app.js`.

## Reader (index.html) module split
- `reader/config.js`: constants (CONFIG values, breakpoints, storage keys).
- `reader/state.js`: app state, persistence (load/save progress), image cache helpers.
- `reader/data.js`: fetch/normalize `admin/data.json`, `admin/page-config.json`, `posts.json`; subtitle setup.
- `reader/dom.js`: element lookup, status panel rendering, generic DOM helpers (spinners, progress).
- `reader/render.js`: page render/updateUI/preload logic, gallery render, end-of-chapter overlay, latest widget render.
- `reader/controls.js`: navigation (prev/next), zoom/pan, edge zones, fullscreen handlers, keyboard bindings, swipe/pointer handlers.
- `reader/email.js`: Formspree submission logic and messaging.
- `reader/init.js`: wiring/bootstrap to call data loaders then init modules; exposes `window.BattleBros` bridge.

Implementation steps:
1) Introduce `index-module.js` entry that imports current logic while keeping existing global IDs; load via `type="module"` and remove inline script after migration.
2) Move pure functions first (config/state/data), then UI/render chunks, then controls/handlers.
3) Keep public API (`window.BattleBros`) intact; re-export from entry.
4) Validate parity: page navigation, zoom, gallery, email form, latest widget, fullscreen, persistence.

## Admin (admin/index.html) module split
- `admin/config.js`: constants (keys, API endpoints, GitHub settings).
- `admin/auth.js`: login/logout, session handling.
- `admin/api.js`: fetch wrappers for save/list/upload endpoints, error handling.
- `admin/chapters.js`: load/save chapters, reconcile with disk, page list UI, renumber, uploads.
- `admin/posts.js`: load/save posts, post form handlers, RSS-triggering save.
- `admin/media.js`: load/save/sync media, apply to posts, search/filter.
- `admin/ui.js`: DOM refs, modals, status toasts, event wiring, preview/export.
- `admin/init.js`: bootstrap sequence and tab switching.

Implementation steps:
1) Create module entry (`admin/app.js`) loaded via `type="module"`; keep HTML structure unchanged initially.
2) Move API helpers and config first, then auth/session, then chapters/posts/media logic; centralize DOM queries in one place.
3) Add small toast/error helper to replace alert usage during the move.
4) Re-test: login flow, chapter CRUD, uploads, renumber, posts save (RSS), media sync, preview/export, settings modal.

## Process guards
- Keep changes incremental (one module at a time) with parity checks.
- Add lint/format (Prettier/eslint-style) once modules exist to stabilize diffs.
- Update `ARCHITECTURE.md` after each major module split to reflect the new structure.

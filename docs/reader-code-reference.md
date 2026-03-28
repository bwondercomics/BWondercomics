# Reader Code Reference

This guide maps the reader-side modules, their responsibilities, and how they collaborate to render and navigate entries.

## Module Inventory
- `reader/app.js` — Composition root; wires modules together, bootstraps data load, kicks off render, and binds global events.
- `reader/config.js` — Constants for storage keys, debounce timings, UI thresholds (e.g., two-page breakpoints), and default options.
- `reader/dom.js` — Centralized DOM lookups; a single source of element references used across modules, including `#mainContent` for on-page frame sizing.
- `reader/data.js` — Fetches `/data.json` (or `/series/<id>/data.json`), `/page-config.json` (DB-backed), and `/api/posts/latest`; normalizes entry metadata, page-config overrides, and maps `protected/*` asset paths to `/api/protected/*`.
- `reader/state.js` — Single state container: current entry/page, zoom, fit mode, progress persistence (localStorage), cached natural page metrics, and derived helpers (e.g., `isTwoPageMode`).
- `reader/render.js` — Renders pages into the stage, caches natural page dimensions as images preload/load, reapplies non-fullscreen frame fitting, and updates UI labels/buttons.
- `reader/controls.js` — Keyboard and click navigation (prev/next, first/last, toggle two-page, reset zoom, fullscreen), debounce helpers, and guard rails when zoomed.
- `reader/pointer.js` — Wheel/pinch/drag handling for zoom + pan, including zoom focal point math and drag inertia limits.
- `reader/fullscreen.js` — Cross-browser fullscreen enter/exit, button state sync, and switching between on-page frame sizing and fullscreen height fitting.
- `reader/gallery.js` — Cover gallery overlay (entry grid), selection, and smooth scroll to current entry.
  - Overlay IDs: `entryCoverGallery`, `entryCoverGalleryGrid`, `entryCoverGalleryBtn`, `entryCoverGalleryClose`
  - Entry card classes: `.entry-card`, `.entry-thumb-wrap`, `.entry-thumb`, `.entry-info`, `.entry-title`
- `reader/overlays.js` — Shortcuts modal, help overlays, and shared show/hide helpers.
- `reader/latest.js` — Renders the “Latest update” widget from the post returned by `/api/posts/latest`.
- `reader/email.js` — Signup form submission to the internal API (`POST /api/email/subscribe`) with inline success/error feedback.
- `reader/customization.js` — Public `window.BattleBros` API (set subtitle, set subtitle list, random subtitle) and dynamic theme/app bar updates.
- `reader/entries.js` — Entry metadata helpers: sort entries, derive page arrays, next/prev entry lookup.
- `reader/transform.js` — Math utilities for scale/translate clamping, pointer focal calculations, fullscreen fitting, and desktop on-page frame sizing for the visible page or spread.
- `assets/css/main.core.11-viewport.css` — Viewport layout rules, including the `.viewport.dynamic-frame` mode used by desktop on-page sizing.

## Execution Flow (high level)
```mermaid
flowchart TD
  A[startup] --> B[load data.json + page-config.json + /api/posts/latest]
  B --> C[populate state (entries, folders, status)]
  C --> D[render initial entry/page]
  D --> E[attach controls + pointer + fullscreen listeners]
  E --> F{user input}
  F -->|prev/next/entry| G[controls -> state -> render]
  F -->|zoom/pan| H[pointer -> state -> render]
  F -->|fullscreen| I[fullscreen -> state -> render]
  F -->|gallery/help| J[overlays/gallery toggles]
  D --> K[persist progress (localStorage)]
```

## Key Responsibilities by Module
- **state.js**
  - Holds `currentEntry`, `pages`, `pageIndex`, `scale`, `pan`, pointer/cache state, cached page metrics, and `lastOnPageFrame`.
  - Persists progress to `localStorage` (`battleBros_progress`) and restores on boot.
- **render.js**
  - Computes the visible page(s), resolves URLs relative to `comics/<seriesId>/entries/`.
  - If a page path starts with `protected/`, it is requested via `/api/protected/<path>`.
  - Applies transform (scale + translate) based on `state` and `transform` helpers.
  - Stores natural image dimensions from both preloaded images and live DOM image loads.
  - Recomputes the non-fullscreen on-page frame when visible pages change or finish loading.
  - Preloads neighbor pages for snappier navigation.
  - Updates UI affordances: prev/next disabled states, page label, status text.
- **controls.js**
  - Keyboard: arrows / PageUp/PageDown / Home/End / `[` `]` / `0` / `+` `-` / `F` / `?` / `Esc`.
  - Click zones: left/right edge, button bar, gallery open/close, shortcuts modal.
  - Two-page toggle and fit reset, with guards when zoomed.
- **pointer.js**
  - Wheel + Ctrl/⌘ zoom, pinch zoom (scale around pointer), drag-to-pan when zoomed.
  - Clamps scale and translate using `transform` utilities to keep content on screen.
- **transform.js**
  - Computes the desktop on-page viewport frame from visible page metrics, stage gap, page border chrome, and remaining `#mainContent` space.
  - Applies the dynamic frame only outside fullscreen and outside the stacked/mobile layout; otherwise clears it and falls back to the normal CSS flow.
  - Keeps fullscreen on the existing `fitHeightFullscreen()` path.
- **fullscreen.js**
  - Clears the on-page dynamic frame on fullscreen entry and restores it on exit.
  - Keeps button state and auto-hide controls synchronized with fullscreen state.
- **data.js**
  - Fetches JSON with `cache: 'no-store'` to avoid stale content.
  - Normalizes status message, entry folder mapping, and optional theme/layout overrides from `page-config.json`.
  - Exposes `loadEntryData()`, `loadPageConfig()`, and `loadLatestPost()` for startup wiring.
- **latest.js**
  - Selects the newest post (by date) where `share !== false`.
  - Formats date (`toLocaleString`) and safely injects HTML-escaped content preview.
- **email.js**
  - Submits to `/api/email/subscribe`, toggles success/error states inline.
- **customization.js**
  - Exposes `window.BattleBros` helpers; updates DOM for subtitle/banner/button tweaks at runtime.

## Data Sources
- `data.json` — Entries, entryFolders, statusMessage.
- `/api/posts/latest` — DB-backed latest blog post for the “Latest update” widget.
- `/page-config.json` (and `/series/<id>/page-config.json`) — Optional theming, header/panel content, button list, and layout ordering (DB-backed).
- `localStorage` — Reading progress (`battleBros_progress` via `config`).

## Persistence & Progress
- Progress: saved per entry/page in `state.saveProgress()`; restored on load.
- Two-page mode: derived from viewport width/aspect (thresholds in `config.js`).
- On-page frame: in the fixed-height desktop layout, `fitOnPageFrame()` resizes the viewport to the current visible page or spread; stacked/mobile keeps the existing full-width flow, and fullscreen uses the existing height-fit path.
- Zoom/fit: transient in memory; reset on entry change unless the user zooms manually.

## Testing
- Vitest suite (`tests/entries.test.js`, `tests/data.test.js`, `tests/render.test.js`, `tests/state.test.js`, `tests/transform.test.js`, `tests/on-page-frame.test.js`) covers:
  - Page resolution and ordering
  - Progress save/load with localStorage error handling
  - Two-page mode logic
  - On-page frame size math for portrait, landscape, and spread layouts
  - DOM/render regressions for navigation-driven frame updates, fullscreen bypass, and stacked/mobile fallback
  - Entry sorting and normalization

## Common Extension Points
- Add a new header button: edit page config in admin (stored in DB and served at `/page-config.json`); `customization.js` renders them at startup.
- Change theme/branding: edit page config in admin (theme vars stored in DB); `customization.js` applies to CSS variables.

## Gotchas / Notes
- Admin auth is minimal; reader fetches data anonymously. Ensure `data.json` and assets are publicly readable on your host.
- Image paths must live under `comics/<seriesId>/entries/`, `protected/comics/<seriesId>/entries/`, or be absolute URLs for the preview/reader to resolve them.
- Double-check `statusMessage`: shown both on the reader ticker and in admin; comes from `data.json`.

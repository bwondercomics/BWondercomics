# Reader Code Reference

This guide maps the reader-side modules, their responsibilities, and how they collaborate to render and navigate entries.

## Module Inventory

- `reader/app.js` — Composition root; coordinates the reader bootstrap, keeps the static shell hidden until the initial page source is known, kicks off render, and binds global events.
- `reader/config.js` — Constants for storage keys, debounce timings, UI thresholds (e.g., two-page breakpoints), and default options.
- `reader/dom.js` — Centralized DOM lookups; a single source of element references used across modules, including `#mainContent` for on-page frame sizing.
- `reader/data.js` — Fetches `/data.json` (or `/series/<id>/data.json`), the builder page API with legacy `page-config.json` fallback for the default reader slug, and `/api/posts/latest`; normalizes entry metadata, effective page-header state, page-config overrides, and maps `protected/*` asset paths to `/api/protected/*`.
- `reader/header-layout.js` — Applies the effective header layout to the existing topbar DOM, repositions stable header blocks into left/center/right regions, and rebuilds configurable nav links while preserving the runtime admin link.
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
- `reader/customization.js` — Legacy page-config applier for non-builder reader pages; waits for `reader/app.js` to resolve the initial page source, then no-ops when the builder page already owns the DOM.
- `reader/entries.js` — Entry metadata helpers: sort entries, derive page arrays, next/prev entry lookup.
- `reader/transform.js` — Math utilities for scale/translate clamping, pointer focal calculations, fullscreen fitting, and desktop on-page frame sizing for the visible page or spread.
- `assets/css/main.core.11-viewport.css` — Viewport layout rules, including the `.viewport.dynamic-frame` mode used by desktop on-page sizing.

## Execution Flow (high level)

```mermaid
flowchart TD
  A[startup] --> B[hide static shell + load data.json]
  B --> C[resolve builder page or legacy page-config + load latest post]
  C --> D[populate state (entries, folders, status)]
  D --> E[render initial entry/page + attach controls/listeners]
  E --> F[apply builder page DOM as final state when builder source wins]
  F --> G{user input}
  G -->|prev/next/entry| H[controls -> state -> render]
  G -->|zoom/pan| I[pointer -> state -> render]
  G -->|fullscreen| J[fullscreen -> state -> render]
  G -->|gallery/help| K[overlays/gallery toggles]
  E --> L[persist progress (localStorage)]
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
  - Normalizes status message, entry folder mapping, builder-page metadata, and optional legacy `page-config.json` overrides.
  - Resolves an effective page header from `page.meta.header` first, then falls back through legacy `page-config` and legacy `header` module sources when older pages still depend on them.
  - Applies page header copy, subtitle rotation, panel content, theme, and page-scoped navigation targets.
  - Exposes `loadEntryData()`, `loadPageConfigWithFallback()`, and `loadLatestPost()` for startup wiring.
- **header-layout.js**
  - Builds the live topbar layout from the effective header config instead of replacing the whole header.
  - Reuses existing DOM blocks for brand, patron welcome, status, entry controls, and nav so existing listeners and session-driven behavior stay attached.
  - Rebuilds configurable nav links from the shared link-target model and keeps `#adminNavLink` runtime-controlled.
- **latest.js**
  - Selects the newest post (by date) where `share !== false`.
  - Formats date (`toLocaleString`) and safely injects HTML-escaped content preview.
- **email.js**
  - Submits to `/api/email/subscribe`, toggles success/error states inline.
- **customization.js**
  - Preserves the legacy `page-config.json` contract for default reader pages that do not yet have a builder page.
  - Waits for the bootstrap state from `app.js` and skips all DOM mutations when the initial page source is `builder` or `error`.

## Data Sources

- `data.json` — Entries, entryFolders, statusMessage.
- `/api/posts/latest` — DB-backed latest blog post for the “Latest update” widget.
- `/api/pages/<seriesId>/<slug>` — Preferred page-builder source for reader chrome and panel content.
- Builder page metadata (`page.meta.header`) — Preferred source for page-level header copy, layout, visible blocks, and nav items.
- `/page-config.json` (and `/series/<id>/page-config.json`) — Optional theming, header/panel content, button list, and layout ordering (DB-backed).
- `localStorage` — Reading progress (`battleBros_progress` via `config`).

## Persistence & Progress

- Progress: saved per entry/page in `state.saveProgress()`; restored on load.
- Two-page mode: derived from viewport width/aspect (thresholds in `config.js`).
- On-page frame: in the fixed-height desktop layout, `fitOnPageFrame()` resizes the viewport to the current visible page or spread; stacked/mobile keeps the existing full-width flow, and fullscreen uses the existing height-fit path.
- Zoom/fit: transient in memory; reset on entry change unless the user zooms manually.

## Testing

- Vitest suite (`tests/entries.test.js`, `tests/data.test.js`, `tests/render.test.js`, `tests/state.test.js`, `tests/transform.test.js`, `tests/on-page-frame.test.js`, `tests/reader-app.test.js`, `tests/reader-data-builder.test.js`, `tests/reader-customization.test.js`) covers:
  - Page resolution and ordering
  - Progress save/load with localStorage error handling
  - Two-page mode logic
  - On-page frame size math for portrait, landscape, and spread layouts
  - DOM/render regressions for navigation-driven frame updates, fullscreen bypass, and stacked/mobile fallback
  - Reader bootstrap release after builder-page application and the no-flash handoff from the static shell
  - Legacy `page-config.json` coordination so `customization.js` only runs when the builder path did not claim the page
  - Entry sorting and normalization

## Common Extension Points

- Add or move a header button: update the builder page header first; use legacy page config only if the default reader slug still relies on the fallback path.
- Change page title/subtitle/header layout: edit the page header in the builder so it persists to `page.meta.header`; legacy `header` modules are fallback-only.
- Change theme/branding: prefer the builder page theme metadata; legacy `page-config.json` remains available for fallback pages and shared branding fields.

## Gotchas / Notes

- Admin auth is minimal; reader fetches data anonymously. Ensure `data.json` and assets are publicly readable on your host.
- Image paths must live under `comics/<seriesId>/entries/`, `protected/comics/<seriesId>/entries/`, or be absolute URLs for the preview/reader to resolve them.
- Double-check `statusMessage`: shown both on the reader ticker and in admin; comes from `data.json`.

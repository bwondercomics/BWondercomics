# Reader Code Reference

This guide maps the reader-side modules, their responsibilities, and how they collaborate to render and navigate entries.

## Module Inventory

- `reader/app.js` — Composition root; coordinates the reader bootstrap, keeps the static shell hidden until the initial page source is known, kicks off render, and binds global events.
- `reader/config.js` — Constants for storage keys, debounce timings, UI thresholds (e.g., two-page breakpoints), and default options.
- `reader/dom.js` — Centralized DOM lookups; a single source of element references used across modules, including `#mainContent` for on-page frame sizing.
- `reader/data.js` — Fetches `/data.json` (or `/series/<id>/data.json`), scoped builder page APIs, optional standalone legacy page-config helpers, and `/api/posts/latest`; normalizes entry metadata, effective page-header state, and maps `protected/*` asset paths to `/api/protected/*`.
- `reader/header-layout.js` — Applies the effective header layout to the existing topbar DOM, repositions stable header blocks into left/center/right regions, and rebuilds configurable nav links while preserving the runtime admin link.
- `reader/state.js` — Single state container: current entry/page, zoom, fit mode, progress persistence (localStorage), cached natural page metrics, and derived helpers (e.g., `isTwoPageMode`).
- `reader/shell-state.js` — Effective Comic Reader module ownership and active/inactive state
  publication/subscription.
- `reader/display-mode.js` — Active `paged`/`vertical-scroll` mode helpers.
- `reader/render.js` — Routes to paged or vertical rendering, manages scheduled/empty states, caches
  paged dimensions, and updates UI labels/buttons.
- `reader/vertical.js` — Continuous vertical strip rendering, visible-page tracking, scroll restore,
  analytics/completion updates, and deterministic cleanup.
- `reader/controls.js` — Keyboard and click navigation (prev/next, first/last, toggle two-page, reset zoom, fullscreen), debounce helpers, and guard rails when zoomed.
- `reader/pointer.js` — Wheel/pinch/drag handling for zoom + pan, including zoom focal point math and drag inertia limits.
- `reader/fullscreen.js` — Cross-browser fullscreen enter/exit, button state sync, and switching between on-page frame sizing and fullscreen height fitting.
- `reader/gallery.js` — Cover gallery overlay (entry grid), selection, and smooth scroll to current entry.
  - Overlay IDs: `entryCoverGallery`, `entryCoverGalleryGrid`, `entryCoverGalleryBtn`, `entryCoverGalleryClose`
  - Entry card classes: `.entry-card`, `.entry-thumb-wrap`, `.entry-thumb`, `.entry-info`, `.entry-title`
- `reader/overlays.js` — Shortcuts modal, help overlays, and shared show/hide helpers.
- `reader/latest.js` — Renders the “Latest update” widget from the post returned by `/api/posts/latest`.
- `reader/email.js` — Signup form submission to the internal API (`POST /api/email/subscribe`) with inline success/error feedback.
- `reader/customization.js` — No-op compatibility module for the old script entry; waits for `reader/app.js` boot state but never fetches page-config or mutates the DOM.
- `reader/entries.js` — Entry metadata helpers: sort entries, derive page arrays, next/prev entry lookup.
- `reader/transform.js` — Math utilities for scale/translate clamping, pointer focal calculations, fullscreen fitting, and desktop on-page frame sizing for the visible page or spread.
- `assets/css/main.core.11-viewport.css` — Viewport layout rules, including the `.viewport.dynamic-frame` mode used by desktop on-page sizing.

## Execution Flow (high level)

```mermaid
flowchart TD
  A[startup] --> B[hide shell + resolve builder page]
  B --> C{effective reader module?}
  C -- no --> N[render authored page only]
  C -- yes --> D[apply reader config + load series data/latest]
  D --> M{paged or vertical}
  M -- paged --> E[render page/spread]
  M -- vertical --> V[render continuous strip]
  N --> F[release bootstrap state]
  E --> F
  V --> F
  F --> G{user input}
  G -->|prev/next/entry| H[controls -> state -> render]
  G -->|zoom/pan| I[pointer -> state -> render]
  G -->|fullscreen| J[fullscreen -> state -> render]
  G -->|gallery/help| K[overlays/gallery toggles]
  E --> L[persist progress (localStorage)]
```

## Key Responsibilities by Module

- **state.js**
  - Holds `currentEntry`, `pages`, `pageIndex`, `scale`, `pan`, pointer/cache state, cached page
    metrics, and `lastOnPageFrame`.
  - Persists page progress and vertical `scrollRatio` to `localStorage`
    (`battleBros_progress`) and restores on boot.
- **render.js**
  - Routes to `renderVertical()` when the authored display mode is vertical; otherwise computes the
    visible paged page/spread.
  - If a page path starts with `protected/`, it is requested via `/api/protected/<path>`.
  - Applies transform (scale + translate) based on `state` and `transform` helpers.
  - Stores natural image dimensions from both preloaded images and live DOM image loads.
  - Recomputes the non-fullscreen on-page frame when visible pages change or finish loading.
  - Preloads neighbor pages for snappier navigation.
  - Updates UI affordances: prev/next disabled states, page label, status text.
- **vertical.js**
  - Keeps the paged stage hidden but intact and renders every page into `#verticalStrip`.
  - Uses scroll geometry plus IntersectionObserver wakeups to update page index, analytics,
    completion, and saved progress.
  - Removes observers/handlers/strip DOM on mode, entry, or reader-shell transitions.
- **controls.js**
  - Keyboard: arrows / PageUp/PageDown / Home/End / `[` `]` / `0` / `+` `-` / `F` / `?` / `Esc`.
  - Click zones: left/right edge, button bar, gallery open/close, shortcuts modal.
  - Two-page toggle and fit reset, with guards when zoomed.
- **pointer.js**
  - Wheel + Ctrl/⌘ zoom, pinch zoom (scale around pointer), drag-to-pan when zoomed in paged mode.
  - Clamps scale and translate using `transform` utilities to keep content on screen.
  - Leaves native scrolling authoritative in vertical mode.
- **transform.js**
  - Computes the desktop on-page viewport frame from visible page metrics, stage gap, page border chrome, and remaining `#mainContent` space.
  - Applies the dynamic frame only outside fullscreen and outside the stacked/mobile layout; otherwise clears it and falls back to the normal CSS flow.
  - Keeps fullscreen on the existing `fitHeightFullscreen()` path.
- **fullscreen.js**
  - Clears the on-page dynamic frame on fullscreen entry and restores it on exit.
  - Keeps button state and auto-hide controls synchronized with fullscreen state.
  - Returns without action in builder preview and vertical mode.
- **data.js**
  - Fetches JSON with `cache: 'no-store'` to avoid stale content.
  - Normalizes status message, entry folder mapping, and builder-page metadata.
  - Resolves an effective page header from V3 `page.meta.header` during normal startup with `pageConfig: null`; legacy config is accepted only by lower-level helpers for migration/safety coverage.
  - Applies page header copy, subtitle rotation, panel content, theme, and page-scoped navigation targets.
  - Publishes reader-shell state; no-reader pages render into `#builderPageContent`.
  - Applies reader config before first render, feeds side panels from the reader's section only, and
    renders other sections into above/below-reader surfaces.
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
  - Retained so the old script entry remains harmless.
  - Waits for the bootstrap state from `app.js` and performs no fetches or DOM mutations for any page source.

## Data Sources

- `data.json` — Entries, entryFolders, statusMessage.
- `/api/posts/latest` — DB-backed latest blog post for the “Latest update” widget.
- `/api/pages/home/<seriesId>` — Effective published homepage for a series root, falling back to
  the same-series bound reader page when needed.
- `/api/pages/<seriesId>/<slug>` — Published series-scoped builder page source.
- `/api/pages/global/by-slug/<slug>` — Published global builder page source when the URL requests
  `?pageScope=global&page=<slug>`.
- Builder page metadata (`page.meta.header`) — Preferred source for page-level header copy, layout, visible blocks, and nav items.
- `/page-config.json` (and `/series/<id>/page-config.json`) — Legacy config helpers and admin branding data; not used by normal reader startup. `reader/safe-mode.js` still reads `/page-config.json` for recovery redirect behavior.
- `localStorage` — Reading progress (`battleBros_progress` via `config`).

## Persistence & Progress

- Progress: saved per entry/page in `state.saveProgress()`; vertical mode also saves/restores
  `scrollRatio`.
- Display mode: authored per reader module (and safe device override); defaults to paged.
- Two-page mode: derived from viewport width/aspect (thresholds in `config.js`).
- On-page frame: in the fixed-height desktop layout, `fitOnPageFrame()` resizes the viewport to the current visible page or spread; stacked/mobile keeps the existing full-width flow, and fullscreen uses the existing height-fit path.
- Zoom/fit: transient paged state; vertical mode disables zoom/pan/fullscreen.

## Testing

- Vitest suite includes `tests/reader-app.test.js`, `tests/reader-data-builder.test.js`,
  `tests/reader-entry-publication.test.js`, `tests/reader-vertical.test.js`,
  `tests/reader-vertical-analytics.test.js`, `tests/render.test.js`, `tests/state.test.js`,
  `tests/transform.test.js`, and `tests/on-page-frame.test.js`, covering:
  - Page resolution and ordering
  - Progress save/load with localStorage error handling
  - Two-page mode logic
  - On-page frame size math for portrait, landscape, and spread layouts
  - DOM/render regressions for navigation-driven frame updates, fullscreen bypass, and stacked/mobile fallback
  - Reader bootstrap release after builder-page application and the no-flash handoff from the static shell
  - Fallback-retirement coordination so missing builder pages do not fetch `page-config.json` or repaint the legacy shell
  - Entry sorting and normalization
  - No-reader shell suppression and active/inactive snapshot transitions
  - Vertical rendering, cleanup, scroll restore, analytics, and completion
  - Scheduled Coming Soon and released-entry behavior

## Common Extension Points

- Add or move a header button: update the builder page header first.
- Change page title/subtitle/header layout: edit the page header in the builder so it persists to `page.meta.header`; legacy `header` modules are stored-data cleanup debt once V3 meta exists.
- Change theme/branding: prefer builder page metadata for reader surfaces; legacy `page-config.json` remains available for non-startup helpers, admin branding, and safe-mode recovery.

## Gotchas / Notes

- Public reader data is anonymous; admin series-data aliases require an authenticated admin and are
  `no-store`.
- Image paths must live under `comics/<seriesId>/entries/`, `protected/comics/<seriesId>/entries/`, or be absolute URLs for the preview/reader to resolve them.
- Double-check `statusMessage`: shown both on the reader ticker and in admin; comes from `data.json`.

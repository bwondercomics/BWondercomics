# Reader Code Reference

This guide maps the reader-side modules, their responsibilities, and how they collaborate to render and navigate chapters.

## Module Inventory
- `reader/app.js` — Composition root; wires modules together, bootstraps data load, kicks off render, and binds global events.
- `reader/config.js` — Constants for storage keys, debounce timings, UI thresholds (e.g., two-page breakpoints), and default options.
- `reader/dom.js` — Centralized DOM lookups; a single source of element references used across modules.
- `reader/data.js` — Fetches `admin/data.json`, `posts.json`, and `admin/page-config.json`; normalizes status message, chapter folders, and optional theming overrides.
- `reader/state.js` — Single state container: current chapter/page, zoom, fit mode, progress persistence (localStorage), and derived helpers (e.g., `isTwoPageMode`).
- `reader/render.js` — Renders pages into the stage, applies fit/zoom transforms, preloads images, and updates UI labels/buttons.
- `reader/controls.js` — Keyboard and click navigation (prev/next, first/last, toggle two-page, reset zoom, fullscreen), debounce helpers, and guard rails when zoomed.
- `reader/pointer.js` — Wheel/pinch/drag handling for zoom + pan, including zoom focal point math and drag inertia limits.
- `reader/fullscreen.js` — Cross-browser fullscreen enter/exit and button state sync.
- `reader/gallery.js` — Cover gallery overlay (chapter grid), selection, and smooth scroll to current chapter.
- `reader/overlays.js` — Shortcuts modal, help overlays, and shared show/hide helpers.
- `reader/latest.js` — “Latest update” widget fed by `posts.json`, with share flag handling and date formatting.
- `reader/email.js` — Formspree-powered signup form submission with inline success/error feedback.
- `reader/customization.js` — Public `window.BattleBros` API (set subtitle, set subtitle list, random subtitle) and dynamic theme/app bar updates.
- `reader/chapters.js` — Chapter metadata helpers: sort chapters, derive page arrays, next/prev chapter lookup.
- `reader/transform.js` — Math utilities for scale/translate clamping, aspect-ratio fitting, and pointer focal calculations.

## Execution Flow (high level)
```mermaid
flowchart TD
  A[startup] --> B[load data.json + posts.json + page-config.json]
  B --> C[populate state (chapters, folders, status)]
  C --> D[render initial chapter/page]
  D --> E[attach controls + pointer + fullscreen listeners]
  E --> F{user input}
  F -->|prev/next/chapter| G[controls -> state -> render]
  F -->|zoom/pan| H[pointer -> state -> render]
  F -->|fullscreen| I[fullscreen -> state -> render]
  F -->|gallery/help| J[overlays/gallery toggles]
  D --> K[persist progress (localStorage)]
```

## Key Responsibilities by Module
- **state.js**
  - Holds `currentChapter`, `currentPage`, `zoom`, `fitMode`, `isTwoPageMode()`, `pages` cache.
  - Persists progress to `localStorage` (key from `config.STORAGE_KEY`) and restores on boot.
  - Emits derived values used by render (e.g., `getVisiblePages`).
- **render.js**
  - Computes the visible page(s), resolves URLs relative to `chapters/`.
  - Applies transform (scale + translate) based on `state` and `transform` helpers.
  - Preloads neighbor pages for snappier navigation.
  - Updates UI affordances: prev/next disabled states, page label, status text.
- **controls.js**
  - Keyboard: arrows / PageUp/PageDown / Home/End / `[` `]` / `0` / `+` `-` / `F` / `?` / `Esc`.
  - Click zones: left/right edge, button bar, gallery open/close, shortcuts modal.
  - Two-page toggle and fit reset, with guards when zoomed.
- **pointer.js**
  - Wheel + Ctrl/⌘ zoom, pinch zoom (scale around pointer), drag-to-pan when zoomed.
  - Clamps scale and translate using `transform` utilities to keep content on screen.
- **data.js**
  - Fetches JSON with `cache: 'no-store'` to avoid stale content.
  - Normalizes status message, chapter folder mapping, and optional theme/layout overrides from `page-config.json`.
  - Exposes a unified `loadAll()` that `app.js` uses at startup.
- **latest.js**
  - Selects the newest post (by date) where `share !== false`.
  - Formats date (`toLocaleString`) and safely injects HTML-escaped content preview.
- **email.js**
  - Submits to Formspree endpoint, toggles success/error states inline.
- **customization.js**
  - Exposes `window.BattleBros` helpers; updates DOM for subtitle/banner/button tweaks at runtime.

## Data Sources
- `admin/data.json` — Chapters, chapterFolders, statusMessage.
- `posts.json` — Feed entries for the “Latest update” widget.
- `admin/page-config.json` — Optional theming, header/panel content, button list, and layout ordering.
- `localStorage` — Reading progress (`battleBros_progress` via `config`).

## Persistence & Progress
- Progress: saved per chapter/page in `state.saveProgress()`; restored on load.
- Two-page mode: derived from viewport width/aspect (thresholds in `config.js`).
- Zoom/fit: transient in memory; reset on chapter change unless the user zooms manually.

## Testing
- Vitest suite (`tests/render.test.js`, `tests/state.test.js`, `tests/chapters.test.js`) covers:
  - Page resolution and ordering
  - Progress save/load with localStorage error handling
  - Two-page mode logic
  - Chapter sorting and normalization

## Common Extension Points
- Add a new header button: extend `page-config.json` buttons; `customization.js` renders them at startup.
- Change theme/branding: adjust `admin/page-config.json` theme vars; `customization.js` applies to CSS variables.
- Integrate comments: `feed.html` placeholder can host a third-party embed; reader code is unaffected.

## Gotchas / Notes
- Admin auth is minimal; reader fetches data anonymously. Ensure `admin/data.json` and assets are publicly readable on your host.
- Image paths must live under `chapters/` (or be absolute URLs) for the preview/reader to resolve them.
- Double-check `statusMessage`: shown both on the reader ticker and in admin; comes from `admin/data.json`.

# Reader Reference (Battle Bros)

This summarizes the reader runtime after modularization: what each file does, key functions, and data sources.

## Data sources
- `admin/data.json`: chapters map, order, statusMessage.
- `admin/page-config.json`: optional theme/content overrides + subtitles.
- `posts.json`: latest update widget.
- `localStorage` key `battleBros_progress`: saved chapter/page.

## Module map
- `reader/config.js`: constants (storage key, cache sizes, zoom steps, breakpoints, animation timings).
- `reader/chapters.js`: chapter helpers (`extractChapterNumber`, `sortChapterNames`, `sanitizeChapters`).
- `reader/state.js`: shared `state` object; `saveProgress`, `loadProgress`.
- `reader/data.js`: loaders for chapter data, page config (subtitles), latest post.
- `reader/dom.js`: element lookups (`el` map) and `initElements`.
- `reader/render.js`: status typing, image preload/cache, two-page checks, main `render`/`updateUI`.
- `reader/controls.js`: page navigation, end-of-chapter overlay helpers.
- `reader/transform.js`: zoom/reset/fit helpers and fullscreen fit scaling.
- `reader/pointer.js`: pan/zoom/swipe handling, edge zones, scroll zoom; initializes pointer listeners.
- `reader/fullscreen.js`: fullscreen toggle and auto-hide/show controls.
- `reader/overlays.js`: shortcuts overlay handlers, chapter change (next/restart) helpers.
- `reader/gallery.js`: gallery render/toggle and button wiring.
- `reader/latest.js`: render the latest update widget.
- `reader/email.js`: Formspree email signup submission + messaging.
- `reader/app.js`: entry wiring—imports modules, loads data, initializes UI, binds events, exposes `window.BattleBros`.
- `reader/customization.js`: applies `page-config` theme/content/layout overrides at load (runs as module).

## Flow (runtime)
1) `index.html` loads `reader/app.js` + `reader/customization.js` as ES modules.
2) `app.start()`:
   - `loadChapterData()` → sets chapters/order/statusMessage.
   - `loadPageConfig()` → sets subtitles (and other overrides via customization module).
   - `loadLatestUpdate()` → fetches `posts.json`, passes to `renderLatestUpdate`.
   - Initializes elements, chapter select, status panel, email form, pointer/fullscreen/nav handlers.
   - Restores saved progress if present; renders current pages.
3) User interactions:
   - Navigation via buttons/edge zones/keyboard/swipe → `controls.js` updates state and calls `render` + `saveProgress`.
   - Zoom/pan via pointer/pinch/wheel or buttons → `pointer.js` + `transform.js`.
   - Fullscreen toggle → `fullscreen.js` (auto-hide controls, fit height).
   - Gallery overlay → `gallery.js`; selecting a card calls `changeChapter` and re-renders.
   - Shortcuts overlay → `overlays.js`; end-of-chapter overlay uses `controls.js` helpers.

## Key exports (for reference)
- `window.BattleBros` (from `app.js`): `setSubtitle`, `setRandomSubtitleNow`, `setSubtitles`.
- Functions by module (see map above) are imported within `app.js`; no other globals are exposed.

## Notes
- Reader logic assumes `admin/data.json` is reachable; on failure, a user-friendly error is shown in the viewport.
- Image caching uses a FIFO map capped by `CONFIG.IMAGE_CACHE_SIZE`.
- Two-page mode: width ≥ `CONFIG.TWO_PAGE_BREAKPOINT` (900) and aspect ratio > 0.714; otherwise single-page.

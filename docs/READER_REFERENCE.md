# Reader Reference (Battle Bros)

This summarizes the reader runtime after modularization: what each file does, key functions, and data sources.

## Data sources
- `data.json`: entries map, order, statusMessage.
- `page-config.json`: optional theme/content overrides + subtitles (DB-backed).
- `/api/posts/latest`: latest update widget (DB-backed; published-only + scheduling support).
- `localStorage` key `battleBros_progress`: saved entry/page.
- Entry page paths may start with `protected/`; those are requested via `/api/protected/<path>`.

## Module map
- `reader/config.js`: constants (storage key, cache sizes, zoom steps, breakpoints, animation timings).
- `reader/entries.js`: entry helpers (`extractEntryNumber`, `sortEntryNames`, `sortEntryNamesWithMeta`, `sanitizeEntries`).
- `reader/state.js`: shared `state` object; `saveProgress`, `loadProgress`, cached natural page metrics, and the last successful desktop on-page frame.
- `reader/data.js`: loaders for entry data, page config (subtitles), latest post.
- `reader/dom.js`: element lookups (`el` map), including `#mainContent`, and `initElements`.
- `reader/render.js`: status typing, image preload/cache, natural-size caching, two-page checks, main `render`/`updateUI`, and non-fullscreen frame refits when visible pages change/load.
- `reader/controls.js`: page navigation, end-of-entry overlay helpers.
- `reader/transform.js`: zoom/reset/fit helpers, desktop on-page frame sizing, and fullscreen fit scaling.
- `reader/pointer.js`: pan/zoom/swipe handling, edge zones, scroll zoom; initializes pointer listeners.
- `reader/fullscreen.js`: fullscreen toggle, auto-hide/show controls, and clearing/restoring the on-page frame around fullscreen transitions.
- `assets/css/main.core.11-viewport.css`: viewport sizing rules, including `.viewport.dynamic-frame` for desktop on-page sizing.
- `reader/overlays.js`: shortcuts overlay handlers, entry change (next/restart) helpers.
- `reader/gallery.js`: gallery render/toggle and button wiring.
- `reader/latest.js`: render the latest update widget.
- `reader/email.js`: Email signup submission to the internal API (`/api/email/subscribe`) + messaging.
- `reader/app.js`: entry wiring—imports modules, loads data, initializes UI, binds events, exposes `window.BattleBros`.
- `reader/customization.js`: applies `page-config` theme/content/layout overrides at load (runs as module).

## Flow (runtime)
1) `index.html` loads `reader/app.js` + `reader/customization.js` as ES modules.
2) `app.start()`:
   - `loadEntryData()` → sets entries/order/statusMessage.
   - `loadPageConfig()` → sets subtitles (and other overrides via customization module).
   - `loadLatestPost()` → fetches `/api/posts/latest`, passes to `renderLatestUpdate`.
   - Initializes elements, entry select, status panel, email form, pointer/fullscreen/nav handlers.
   - Restores saved progress if present; renders current pages and applies the desktop on-page frame when eligible.
3) User interactions:
   - Navigation via buttons/edge zones/keyboard/swipe → `controls.js` updates state and calls `render` + `saveProgress`.
   - Zoom/pan via pointer/pinch/wheel or buttons → `pointer.js` + `transform.js`.
   - Fullscreen toggle → `fullscreen.js` (auto-hide controls, fullscreen height fit, and suspension of on-page frame sizing).
   - Gallery overlay → `gallery.js`; selecting a card calls `changeChapter` and re-renders.
   - Shortcuts overlay → `overlays.js`; end-of-chapter overlay uses `controls.js` helpers.

## Key exports (for reference)
- `window.BattleBros` (from `app.js`): `setSubtitle`, `setRandomSubtitleNow`, `setSubtitles`.
- Functions by module (see map above) are imported within `app.js`; no other globals are exposed.

## Notes
- Reader logic assumes `data.json` is reachable; on failure, a user-friendly error is shown in the viewport.
- Image caching uses a FIFO map capped by `CONFIG.IMAGE_CACHE_SIZE`; natural page dimensions are cached in `state.pageMetrics` and the last successful desktop frame in `state.lastOnPageFrame`.
- Two-page mode: width ≥ `CONFIG.TWO_PAGE_BREAKPOINT` (900) and aspect ratio > 0.714; otherwise single-page.
- Non-fullscreen on-page frame: in the fixed-height desktop layout, the viewport follows the current visible page or spread; stacked/mobile keeps the existing full-width flow.

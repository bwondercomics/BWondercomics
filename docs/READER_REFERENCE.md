# Reader Reference (Battle Bros)

This summarizes the reader runtime after modularization: what each file does, key functions, and data sources.

## Data sources

- `data.json`: public entries map, metadata, status message, and labels. Drafts are omitted; future
  scheduled entries are listed as Coming Soon with pages withheld until automatic release.
- `/api/pages/home/<seriesId>`: effective published homepage for a series root, falling back to the
  same-series bound reader page when needed.
- `/api/pages/<seriesId>/<slug>`: published series-scoped builder page source.
- `/api/pages/global/by-slug/<slug>`: published global builder page source when the URL requests
  `?pageScope=global&page=<slug>`.
- `page-config.json`: no longer part of normal reader startup; still used by standalone legacy helpers and `reader/safe-mode.js` recovery redirect behavior.
- `/api/posts/latest`: latest update widget (DB-backed; published-only + scheduling support).
- `localStorage` key `battleBros_progress`: saved entry/page.
- Entry page paths may start with `protected/`; those are requested via `/api/protected/<path>`.

## Module map

- `reader/config.js`: constants (storage key, cache sizes, zoom steps, breakpoints, animation timings).
- `reader/entries.js`: entry helpers (`extractEntryNumber`, `sortEntryNames`, `sortEntryNamesWithMeta`, `sanitizeEntries`).
- `reader/state.js`: shared `state` object; `saveProgress`, `loadProgress`, cached natural page metrics, and the last successful desktop on-page frame.
- `reader/shell-state.js`: effective reader-module ownership and active/inactive shell state.
- `reader/display-mode.js`: active paged/vertical mode helpers.
- `reader/data.js`: loaders for entry data, builder-page startup resolution, optional legacy page-config helper access, and latest post.
- `reader/dom.js`: element lookups (`el` map), including `#mainContent`, and `initElements`.
- `reader/render.js`: scheduled/empty states, paged image preload/cache, two-page checks, vertical
  dispatch, `render`/`updateUI`, and paged frame refits.
- `reader/vertical.js`: continuous page strip, scroll/visibility progress, analytics/completion,
  scroll restore, and cleanup.
- `reader/controls.js`: page navigation, end-of-entry overlay helpers.
- `reader/transform.js`: zoom/reset/fit helpers, desktop on-page frame sizing, and fullscreen fit scaling.
- `reader/pointer.js`: pan/zoom/swipe handling, edge zones, scroll zoom; initializes pointer listeners.
- `reader/fullscreen.js`: fullscreen toggle, auto-hide/show controls, and clearing/restoring the on-page frame around fullscreen transitions.
- `assets/css/main.core.11-viewport.css`: viewport sizing rules, including `.viewport.dynamic-frame` for desktop on-page sizing.
- `reader/overlays.js`: shortcuts overlay handlers, entry change (next/restart) helpers.
- `reader/gallery.js`: gallery render/toggle and button wiring.
- `reader/latest.js`: render the latest update widget.
- `reader/email.js`: Email signup submission to the internal API (`/api/email/subscribe`) + messaging.
- `reader/app.js`: entry wiring—imports modules, coordinates bootstrap-loading release, loads data, initializes UI, binds events, exposes `window.BattleBros`.
- `reader/customization.js`: no-op compatibility module retained for the old script entry; it waits for boot state but does not fetch page-config or mutate the shell.

## Flow (runtime)

1. `index.html` applies a temporary bootstrap-loading state, then loads `reader/app.js` + `reader/customization.js` as ES modules.
2. `app.start()` resolves the builder page and effective reader-shell state first.
   - No-reader pages render authored content and skip reader-only data and side effects.
   - Active reader pages apply module settings, then `loadEntryData()` sets
     entries/order/status/metadata.

- `loadPageConfigWithFallback()` → resolves the startup builder page through the effective-homepage,
  explicit series-slug, or explicit global-slug API and returns `source: 'builder'` or
  `source: 'none'`. It no longer fetches legacy `page-config.json` during normal startup;
  `createEffectivePageHeader(page, null)` is the V3 reader header contract after a clean
  fallback-retirement audit.
- `loadLatestPost()` → fetches `/api/posts/latest`, passes to `renderLatestUpdate`.
- Initializes only shell-appropriate elements/handlers, then releases bootstrap hiding once the
  initial builder or reader output is ready.
- Restores page progress and vertical scroll ratio when present.

3. `customization.js` waits for the bootstrap result and remains a no-op so missing builder pages cannot re-enter the old page-config shell.
4. User interactions:
   - Paged navigation via buttons/edge zones/keyboard/swipe → `controls.js` updates state and calls
     `render` + `saveProgress`.
   - Vertical mode uses native scrolling for page progress; prev/next moves between entries and
     restart scrolls to the top.
   - Zoom/pan via pointer/pinch/wheel or buttons → `pointer.js` + `transform.js`.
   - Fullscreen toggle → `fullscreen.js` in paged mode only.
   - Gallery overlay → `gallery.js`; selecting a card calls `changeChapter` and re-renders.
   - Shortcuts overlay → `overlays.js`; end-of-chapter overlay uses `controls.js` helpers.

## Key exports (for reference)

- `window.BattleBros` (from `app.js`): `setSubtitle`, `setRandomSubtitleNow`, `setSubtitles`.
- Functions by module (see map above) are imported within `app.js`; no other globals are exposed.

## Notes

- Reader logic assumes `data.json` is reachable; on failure, a user-friendly error is shown in the viewport.
- Reader bootstrap hides the static shell until the initial page source is known so the legacy shell does not flash before a custom builder page is applied.
- Pages without a Comic Reader module keep the reader shell inactive. Bound reader pages can render
  ordinary authored sections above and below the required reader module.
- Image caching uses a FIFO map capped by `CONFIG.IMAGE_CACHE_SIZE`; natural page dimensions are cached in `state.pageMetrics` and the last successful desktop frame in `state.lastOnPageFrame`.
- Two-page mode: width ≥ `CONFIG.TWO_PAGE_BREAKPOINT` (900) and aspect ratio > 0.714; otherwise single-page.
- Non-fullscreen on-page frame: in the fixed-height desktop layout, the viewport follows the current visible page or spread; stacked/mobile keeps the existing full-width flow.
- Vertical mode: all pages render in document order; zoom, pan, swipe page turns, and fullscreen are
  disabled.

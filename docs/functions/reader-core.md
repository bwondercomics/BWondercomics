# Reader Core Infrastructure Logic

This document describes the current reader runtime under `reader/`. It replaces older descriptions that mixed live code with legacy or planned behavior.

## Scope

The reader is split into three layers:

- Core reading runtime: boot, data loading, state, render, controls, transforms, fullscreen, and overlays.
- Builder-page runtime: page fetching/rendering plus shared header/layout integration.
- Support surfaces: analytics, comments, auth/API helpers, feed/latest widgets, safe-mode redirect, and user settings.

## Boot And Runtime Flow

1. `index.html` loads `reader/app.js` and `reader/customization.js`.
2. `reader/app.js` creates a shared boot-state object on `window`, keeps the static shell hidden with `reader-bootstrap-loading`, and loads:
   - series entry data via `loadEntryData()`
   - page config via `loadPageConfigWithFallback()`
   - latest post data via `loadLatestPost()`
3. `loadPageConfigWithFallback()` prefers the builder page API at `/api/pages/<seriesId>/<slug>`.
4. Legacy `page-config.json` fallback only applies for the default `reader` slug and only when a builder page was not active. This path is deprecated.
5. After the first render or error state is ready, `app.js` releases bootstrap hiding and exposes `window.BattleBros` subtitle helpers.
6. `reader/customization.js` waits for the boot result and exits early when the builder page already owns the initial DOM, preventing the legacy shell from repainting over builder content.

## Canonical Data Sources

- `data.json` or `/series/<seriesId>/data.json`: entry pages, entry metadata, status message, premium flags, unit labels, and entry labels.
- `/api/pages/<seriesId>/<slug>`: published builder pages for reader pages.
- `/api/admin/pages/by-slug/<seriesId>/<slug>`: draft builder pages when `draft=1` is requested by an admin.
- `page-config.json` or `/series/<seriesId>/page-config.json`: legacy page config fallback for the default reader slug only.
- `/api/posts/latest` and `/api/posts`: latest update widget and feed content.
- `localStorage`: reading progress, reader analytics opt-out, visitor id, and some UI preferences.

## Core Runtime Modules

- `reader/app.js`: composition root. Loads runtime data, applies premium gating, initializes DOM bindings, coordinates boot-state handoff, lazy-loads `gallery.js` and `fullscreen.js`, and reacts to session changes.
- `reader/data.js`: fetches entry data, page config, latest posts, and builder pages. Applies builder-page DOM, theme, panel backgrounds, feed modules, promo carousels, and shared header layout.
- `reader/state.js`: shared runtime state for current entry, page index, zoom/pan, page metrics, image cache, and persisted progress.
- `reader/render.js`: renders the current page or spread, updates labels and disabled states, preloads upcoming pages, caches natural image sizes, and reapplies desktop frame fitting outside fullscreen.
- `reader/controls.js`: prev/next/restart navigation and end-of-entry overlay helpers.
- `reader/pointer.js`: pointer, drag, wheel, pinch, swipe, and edge-zone handling for navigation and zoom/pan.
- `reader/transform.js`: scale/pan math, reset/zoom helpers, desktop on-page frame sizing, and fullscreen fit-height behavior.
- `reader/fullscreen.js`: fullscreen entry/exit, controls-bar visibility, and coordination with frame fitting.
- `reader/overlays.js`: shortcuts modal plus entry-change helpers used by overlays and end-of-entry flows.
- `reader/gallery.js`: entry cover gallery rendering, selection, and gallery button wiring.
- `reader/dom.js`: cached element registry and a small `h(...)` helper for DOM construction.
- `reader/config.js`: reader-specific constants such as cache sizes, zoom limits, breakpoints, timings, and storage keys.
- `reader/entries.js`: entry sorting, numeric extraction, and sanitized entry/page normalization.
- `reader/series.js`: series id, page slug, draft-mode parsing, and public file-path helpers.
- `reader/utils.js`: lightweight helpers such as throttling and cached measurement.
- `reader/logger.js`: debug logging facade used across reader modules.

## Builder-Page Runtime

- `reader/page-renderer.js`: reader-side page renderer built on the shared builder renderers. Exports `renderPage`, `renderModule`, `fetchPage`, `mountPage`, `initEmailForms`, and `initPromoCarousels`.
- `reader/header-layout.js`: applies the effective page-header layout into the existing topbar DOM rather than replacing the whole header.
- `reader/customization.js`: legacy page-config applier. It now only runs when the builder page did not claim the initial page.

Important current rule:

- Builder page metadata in `page.meta.header` is the preferred source for reader header copy, layout, visible blocks, and nav links.
- Legacy `page-config` and legacy `header` module content are fallback-only compatibility inputs.

## Analytics And Tracking

- `reader/analytics.js`: sends `reader_page_view`, `reader_entry_complete`, and `reader_entry_exit` events. It tracks visible pages, completion, and entry exit while respecting the `battlebros_count_views=false` opt-out flag in `localStorage`.
- `reader/live-tracking.js`: maintains a lightweight visitor heartbeat to `/api/track/visitor` with visitor id, path, series id, entry label, and page number.

These are separate systems:

- `analytics.js` is reader engagement analytics.
- `live-tracking.js` is active-visitor presence tracking.

## Comments, Auth, And User APIs

- `reader/comment-targets.js`: builds stable target ids such as `battle-bros:entry-5` and post target ids.
- `reader/comic-comments.js`: self-contained reader comments UI. It handles session checks, sign-in/register/sign-out, comment posting, admin moderation calls, entry-target changes, and comment-panel collapse/expand behavior. It also requests `fitOnPageFrame()` after comment layout changes.
- `reader/comic-comments.css`: styles the comments surface.
- `reader/auth.js`: standalone auth manager with session check, login, register, logout, listener subscription, and `bbSessionChanged` event dispatch.
- `reader/api.js`: generic JSON fetch helpers plus comment/post convenience methods.
- `reader/constants.js`: shared endpoint and status-code constants used by auth/API/user-settings helpers.
- `reader/user-settings.js`: overlay-driven account UI for sign-in, email opt-in, premium-code redeem, comment management, logout, and account deletion.

Note:

- `comic-comments.js` currently uses its own local fetch helpers instead of importing `reader/api.js` or `reader/auth.js`.

## Feed, Latest, Safe Mode, And External Surfaces

- `reader/latest.js`: renders the latest-update widget and generates safe preview HTML.
- `reader/feed-panel.js`: powers the right-panel feed surface and builder feed modules. It loads `/api/posts`, sanitizes post content, renders preview cards, and toggles feed mode.
- `reader/chat-sso.js`: chat/community handoff support.
- `reader/safe-mode.js`: optional redirect guard. It reads `/page-config.json` on non-local hosts and redirects to `safeModeUrl` when safe mode is enabled.

## Current Behavioral Contracts

- Two-page mode is derived at render time; it is not a separate persisted mode toggle in `state`.
- Protected entry assets starting with `protected/` are mapped to `/api/protected/...`.
- The desktop "dynamic frame" behavior is owned by `transform.js` and only applies outside fullscreen and outside stacked/mobile layouts.
- Fullscreen keeps its own fit-height path and clears the desktop frame while active.
- Progress is persisted with `state.saveProgress()` to the `battleBros_progress` key.
- Premium gating is applied in `app.js` after session state is known; non-premium users can have premium entries removed from the active entry list or the whole reader locked when the series is premium-only.

## Deprecated Or Easy-To-Misstate Areas

- `page-config.json` is no longer the primary reader-page source. Builder pages are primary.
- Legacy fallback is limited to the default `reader` slug and is documented for removal once the series-level fallback audit is clean and a published `reader` page exists.
- `reader/customization.js` does not blindly repaint the page anymore; it coordinates with the boot-state result from `app.js`.
- Comments, auth, and API helpers exist as separate modules, but not every reader surface is consolidated onto those abstractions yet.

## Related Docs

- `docs/reader-code-reference.md`: concise module and flow reference.
- `docs/READER_REFERENCE.md`: reader runtime summary.
- `docs/functions/admin-page-builder.md`: builder-side rendering and shared renderer contracts.

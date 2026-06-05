# Reader Core Infrastructure Logic

This document describes the current reader runtime under `reader/`. It replaces older descriptions that mixed live code with legacy or planned behavior.

## Table of Contents

- [💡 Scope & Canonical Data Sources](#-scope--canonical-data-sources)
- [⚙️ Boot And Runtime Flow](#️-boot-and-runtime-flow)
- [🔌 Main Entry Point (app.js)](#-main-entry-point-appjs)
- [💾 Data Hydration (data.js)](#-data-hydration-datajs)
- [💾 Global State (state.js)](#-global-state-statejs)
- [🖼️ Page Renderer (render.js)](#️-page-renderer-renderjs)
- [🎮 Navigation Controls (controls.js)](#-navigation-controls-controlsjs)
- [🖱️ Pointer Engine (pointer.js)](#️-pointer-engine-pointerjs)
- [📐 Transform Engine (transform.js)](#-transform-engine-transformjs)
- [🔲 Fullscreen Manager (fullscreen.js)](#-fullscreen-manager-fullscreenjs)
- [🪟 Overlays Management (overlays.js)](#-overlays-management-overlaysjs)
- [🖼️ Gallery Engine (gallery.js)](#️-gallery-engine-galleryjs)
- [🖼️ DOM Registry (dom.js)](#️-dom-registry-domjs)
- [⚙️ Config Constants (config.js)](#️-config-constants-configjs)
- [📚 Entry Management (entries.js)](#-entry-management-entriesjs)
- [📚 Series Context (series.js)](#-series-context-seriesjs)
- [🛠️ Utilities (utils.js)](#️-utilities-utilsjs)
- [📝 Logger (logger.js)](#-logger-loggerjs)
- [📄 Builder Page Renderer (page-renderer.js)](#-builder-page-renderer-page-rendererjs)
- [🏗️ Header Layout (header-layout.js)](#-header-layout-header-layoutjs)
- [🖌️ Customization Compatibility (customization.js)](#️-customization-compatibility-customizationjs)
- [📊 Analytics Coordinator (analytics.js)](#-analytics-coordinator-analyticsjs)
- [📡 Live Tracker (live-tracking.js)](#-live-tracker-live-trackingjs)
- [🎯 Comment Targets (comment-targets.js)](#-comment-targets-comment-targetsjs)
- [🗣️ Comments Engine (comic-comments.js)](#️-comments-engine-comic-commentsjs)
- [🎨 Comments Engine Styles (comic-comments.css)](#-comments-engine-styles-comic-commentscss)
- [🔐 Authentication (auth.js)](#-authentication-authjs)
- [📡 API Layer (api.js)](#-api-layer-apijs)
- [🔢 Constants Registry (constants.js)](#-constants-registry-constantsjs)
- [👤 User Settings Overlay (user-settings.js)](#-user-settings-overlay-user-settingsjs)
- [📧 Email Signup form (email.js)](#-email-signup-form-emailjs)
- [🚀 Latest Posts Widget (latest.js)](#-latest-posts-widget-latestjs)
- [📰 Feed Panel (feed-panel.js)](#-feed-panel-feed-paneljs)
- [💬 Chat SSO Integration (chat-sso.js)](#-chat-sso-integration-chat-ssojs)
- [🛡️ Safe Mode Guard (safe-mode.js)](#️-safe-mode-guard-safe-modejs)
- [🌉 Builder Preview Bridge (preview-bridge.js)](#-builder-preview-bridge-preview-bridgejs)
- [📜 Current Behavioral Contracts](#-current-behavioral-contracts)
- [⚠️ Deprecated Or Easy-To-Misstate Areas](#️-deprecated-or-easy-to-misstate-areas)

## 💡 Scope & Canonical Data Sources

The reader is split into three layers:

- **Core reading runtime**: boot, data loading, state, render, controls, transforms, fullscreen, and overlays.
- **Builder-page runtime**: page fetching/rendering plus shared header/layout integration.
- **Support surfaces**: analytics, comments, auth/API helpers, feed/latest widgets, safe-mode redirect, and user settings.

### Canonical Data Sources

- `data.json` or `/series/<seriesId>/data.json`: entry pages, entry metadata, status message, premium flags, unit labels, and entry labels.
- `/api/pages/home/<seriesId>`: effective published homepage page for the series root; resolves the page marked homepage and falls back to the same-series bound published `reader` page when no homepage is set.
- `/api/admin/pages/home/<seriesId>`: admin-only draft/homepage resolver used when `draft=1` is requested without an explicit page slug.
- `/api/pages/<seriesId>/<slug>`: published builder pages for reader pages.
- `/api/pages/global/by-slug/<slug>`: published global builder pages requested with `?pageScope=global&page=<slug>`.
- `/api/admin/pages/series/<seriesId>/by-slug/<slug>` and `/api/admin/pages/global/by-slug/<slug>`: draft builder pages when `draft=1` is requested by an admin.
- `page-config.json` or `/series/<seriesId>/page-config.json`: legacy config data retained for standalone helpers/admin surfaces; normal reader startup no longer uses it. `reader/safe-mode.js` intentionally still reads `/page-config.json` for recovery redirects.
- `/api/posts/latest` and `/api/posts`: latest update widget and feed content.
- `localStorage`: reading progress, reader analytics opt-out, visitor id, and some UI preferences.

## ⚙️ Boot And Runtime Flow

1. `index.html` loads `reader/app.js` and `reader/customization.js`.
2. `reader/app.js` creates a shared boot-state object on `window`, keeps the static shell hidden with `reader-bootstrap-loading`, and loads:
   - series entry data via `loadEntryData()`
   - page config via `loadPageConfigWithFallback()`
   - latest post data via `loadLatestPost()`
3. `loadPageConfigWithFallback()` resolves builder content from two paths:
   - when the URL has an explicit `?page=<slug>`, it loads `/api/pages/<seriesId>/<slug>` or, when `?pageScope=global` is present, `/api/pages/global/by-slug/<slug>`
   - when no explicit page slug is present, it loads `/api/pages/home/<seriesId>` or the admin homepage draft endpoint so the series root follows homepage assignment and same-series reader binding instead of hard-coding `reader`
4. **Builder preview mode** (`?builderPreview=1`): when the URL carries this flag, `app.js` skips `loadPageConfigWithFallback()` entirely, lazy-imports `reader/preview-bridge.js`, and calls `requestPreviewSnapshot(...)`. The bridge sends a `REQUEST_SNAPSHOT` message to the parent admin frame, validates the `SNAPSHOT` reply, and returns a resolved page result. That result is applied via `applyBuilderPageToDOM(...)` with `previewMode: true` so all side-effect hooks are suppressed. After the snapshot is applied, the bridge stores preview identity context, emits a validated `METRICS` payload back to the admin frame, and, when `builderEditing` is true, starts a target bridge that reports marked target geometry plus hover/select events. It stays subscribed for follow-up `SNAPSHOT` updates from the builder. If the request times out or the snapshot is invalid, `handlePreviewLoadError()` surfaces an inline error and releases bootstrap state with `source: 'error'`.
5. Missing builder pages resolve to `source: 'none'`; normal startup does not fetch legacy `page-config.json`.
6. After the first render or error state is ready, `app.js` releases bootstrap hiding and exposes `window.BattleBros` subtitle helpers.
7. `reader/customization.js` waits for the boot result and remains a no-op so `source: 'none'` cannot repaint the legacy shell.

## 🔌 Main Entry Point (app.js)

The composition root. Loads runtime data, applies premium gating, initializes DOM bindings, coordinates boot-state handoff, statically imports fullscreen controls, lazy-loads `gallery.js` and the preview bridge, and reacts to session changes. In builder preview mode (`?builderPreview=1`) the normal data-fetch path is bypassed; the reader instead waits for a validated snapshot from the admin frame via `preview-bridge.js`. A `previewMode` flag propagates through `init(...)` and `attachEventHandlers(...)` to suppress fullscreen, mouse-edge controls, topbar hover handlers, navigation links, store-entry redirects, and analytics initialization. Preview mode also emits responsive metrics after snapshot application and after the debounced resize `render()` path completes.

## 💾 Data Hydration (data.js)

Fetches entry data, builder pages, latest posts, and standalone legacy page config when explicitly requested by helper callers. Applies builder-page DOM, theme, panel backgrounds, feed modules, promo carousels, and shared header layout.

Important current behavior:

- `loadHomepageBuilderPage()` is the root-path loader used when no explicit page slug is requested
- root-path builder loading now follows the effective homepage resolver instead of always requesting the `reader` slug directly
- `applyBuilderPageToDOM()` resolves header state once and reuses that same state for both visible copy and shared topbar layout
- `applyBuilderPageToDOM()` accepts a `previewMode` option that propagates to `renderPanelStack(...)` and `initEmailForms(...)` so email signup forms show a preview stub instead of submitting
- normal startup resolves V3 page headers with `pageConfig: null`; optional legacy config remains accepted only for migration/safety helper calls

## 💾 Global State (state.js)

The shared runtime state for current entry, page index, zoom/pan, page metrics, image cache, and persisted progress.

## 🖼️ Page Renderer (render.js)

Renders the current page or spread, updates labels and disabled states, preloads upcoming pages, caches natural image sizes, and reapplies desktop frame fitting outside fullscreen.

## 🎮 Navigation Controls (controls.js)

Prev/next/restart navigation and end-of-entry overlay helpers.

## 🖱️ Pointer Engine (pointer.js)

Pointer, drag, wheel, pinch, swipe, and edge-zone handling for navigation and zoom/pan.

## 📐 Transform Engine (transform.js)

Scale/pan math, reset/zoom helpers, desktop on-page frame sizing, and fullscreen fit-height behavior.

## 🔲 Fullscreen Manager (fullscreen.js)

Fullscreen entry/exit, controls-bar visibility, and coordination with frame fitting. In builder preview mode (`?builderPreview=1`) `toggleFullscreen()` returns immediately, so the preview iframe cannot go fullscreen.

## 🪟 Overlays Management (overlays.js)

Shortcuts modal plus entry-change helpers used by overlays and end-of-entry flows.

## 🖼️ Gallery Engine (gallery.js)

Entry cover gallery rendering, selection, and gallery button wiring.

## 🖼️ DOM Registry (dom.js)

Cached element registry and a small `h(...)` helper for DOM construction.

## ⚙️ Config Constants (config.js)

Reader-specific constants such as cache sizes, zoom limits, breakpoints, timings, and storage keys.

## 📚 Entry Management (entries.js)

Entry sorting, numeric extraction, and sanitized entry/page normalization.

## 📚 Series Context (series.js)

Series id, page slug, draft-mode parsing, and public file-path helpers.

Current exports include:

- `getExplicitPageSlug()` — returns only a user-supplied `?page=` slug; the reader no longer invents `reader` as an explicit request
- `isBuilderPreviewRequested()` — returns `true` when `?builderPreview=1` (or `true`/`yes`) is present
- `getPreviewSessionToken()` — returns the `?previewSession=` token used to match `postMessage` envelopes
- `getPreviewPageId()` — returns the `?pageId=` parameter for identity validation in the bridge
- `getRequestedPageSlug()` — returns the `?page=` parameter without defaulting to empty string, used by `preview-bridge.js` for snapshot identity

Builder preview uses these query parameters: `builderPreview=1`, `previewSession=<token>`,
`page=<slug>`, `pageId=<id>`, and optional `draft=1`. There is no `exact-preview` query flag; exact
preview behavior comes from the iframe viewport dimensions and the validated snapshot bridge.

## 🛠️ Utilities (utils.js)

Lightweight helpers such as throttling and cached measurement.

## 📝 Logger (logger.js)

Debug logging facade used across reader modules.

## 📄 Builder Page Renderer (page-renderer.js)

Reader-side page renderer built on the shared builder renderers. Exports `renderPage`, `renderModule`, `fetchPage`, `mountPage`, `initEmailForms`, and `initPromoCarousels`.

`mountPage(container, slug, seriesId, options)` and `initEmailForms(container, options)` both accept a `previewMode` option that shows a stub confirmation message instead of submitting to the API.

## 🏗️ Header Layout (header-layout.js)

Applies the effective page-header layout into the existing topbar DOM rather than replacing the whole header.
It clears existing public links and re-mounts them based on `page.meta.header.nav.items`, applying the appropriate variants (`.nav-link--primary` or `.nav-link--secondary`).

Step 5 parity update:

- `reader/data.js` now resolves the effective header once through `resolvePageHeaderState(...)`
- that single resolved object provides both header copy (`title`, `subtitle`, rotating subtitles) and layout/nav state
- `header-layout.js` accepts the pre-resolved `headerState` so the reader no longer recomputes layout from a separate path after copy has already been applied

Important current rule:

- Builder page metadata in `page.meta.header` is the preferred source for reader header copy, layout, visible blocks, and nav links.
- Legacy `page-config` and legacy `header` module content are fallback-only compatibility inputs.

## 🖌️ Customization Compatibility (customization.js)

No-op compatibility module retained for the old script entry. It waits for reader boot state and performs no page-config fetches or DOM mutations.

## 📊 Analytics Coordinator (analytics.js)

Sends `reader_page_view`, `reader_entry_complete`, and `reader_entry_exit` events. It tracks visible pages, completion, and entry exit while respecting the `battlebros_count_views=false` opt-out flag in `localStorage`.

Analytics and live tracking are separate systems. `analytics.js` handles reader engagement analytics.

## 📡 Live Tracker (live-tracking.js)

Maintains a lightweight visitor heartbeat to `/api/track/visitor` with visitor id, path, series id, entry label, and page number. It handles active-visitor presence tracking. In builder preview mode (`?builderPreview=1`) `initLiveTracking()` exits immediately without starting the heartbeat, so no tracking events fire from preview.

## 🎯 Comment Targets (comment-targets.js)

Builds stable target ids such as `battle-bros:entry-5` and post target ids.

## 🗣️ Comments Engine (comic-comments.js)

Self-contained reader comments UI. It handles session checks, sign-in/register/sign-out, comment posting, admin moderation calls, entry-target changes, and comment-panel collapse/expand behavior. It also requests `fitOnPageFrame()` after comment layout changes.

In builder preview mode (`?builderPreview=1`) the comment UI enters a read-only state: the auth form is hidden, the comment form is disabled with an explanatory hint, and all mutating API calls (`login`, `register`, `postComment`, `moderateComment`) throw immediately without a network request. `logout()` is silently ignored.

Note: `comic-comments.js` currently uses its own local fetch helpers instead of importing `reader/api.js` or `reader/auth.js`.

## 🎨 Comments Engine Styles (comic-comments.css)

Styles the comments surface.

## 🔐 Authentication (auth.js)

Standalone auth manager with session check, login, register, logout, listener subscription, and `bbSessionChanged` event dispatch.

## 📡 API Layer (api.js)

Generic JSON fetch helpers plus comment/post convenience methods.

## 🔢 Constants Registry (constants.js)

Shared endpoint and status-code constants used by auth/API/user-settings helpers.

## 👤 User Settings Overlay (user-settings.js)

Overlay-driven account UI for sign-in, email opt-in, premium-code redeem, comment management, logout, and account deletion. In builder preview mode (`?builderPreview=1`) the open button is disabled and `aria-disabled` is set, preventing the overlay from opening.

## 📧 Email Signup form (email.js)

Email signup form handler. Binds submit events, handles API submission, and displays success/error feedback inline. Accepts a `previewMode` option: when set, form submission shows a stub "Form works! (Preview mode - not submitted)" message instead of calling the API.

## 🚀 Latest Posts Widget (latest.js)

Renders the latest-update widget and generates safe preview HTML.

## 📰 Feed Panel (feed-panel.js)

Powers the right-panel feed surface and builder feed modules. It loads `/api/posts`, sanitizes post content, renders preview cards, and toggles feed mode.

## 💬 Chat SSO Integration (chat-sso.js)

Chat/community handoff support. In builder preview mode (`?builderPreview=1`) the module exits immediately at startup, so no SSO handoff or redirect flow is initiated.

## 🛡️ Safe Mode Guard (safe-mode.js)

Optional redirect guard. It reads `/page-config.json` on non-local hosts and redirects to `safeModeUrl` when safe mode is enabled. In builder preview mode (`?builderPreview=1`) `checkSafeMode()` returns immediately, so no page-config fetch or redirect occurs inside the preview iframe.

## 🌉 Builder Preview Bridge (preview-bridge.js)

Handles the reader side of the admin-to-iframe preview handshake, responsive metrics reporting, and
live target bridge. Only loaded when `?builderPreview=1` is present; the module is lazy-imported by
`reader/app.js` in that path.

Key export: `requestPreviewSnapshot(options)` — sends a `REQUEST_SNAPSHOT` control message to the parent admin frame, waits up to 5 seconds for a `SNAPSHOT` reply, validates the reply with `validatePreviewEnvelope(...)` from `preview-contract.js`, sends `ACK` on success or `ERROR` on failure, stores the accepted snapshot as active preview context, and resolves with `{ source: 'builder', page, previewMode: true, snapshot }`. The identity contract (series id, page id, page slug, preview session token) is assembled from `reader/series.js` helpers and validated on both sides to prevent stale or misrouted messages.

Also exports:

- `subscribePreviewSnapshots(onSnapshot, options)` — keeps listening for follow-up `SNAPSHOT` messages after initial boot, revalidates them, acknowledges them, and lets `app.js` reapply the updated page snapshot without a full iframe reload.
- `setPreviewMetricsContext(snapshot, overrides)` — stores the active snapshot identity used for metrics messages.
- `collectPreviewMetrics(snapshot?)` and `emitPreviewMetrics(reason)` — gather iframe `innerWidth`/`innerHeight`, named media-query branch flags, two-page-mode state, and overflow offenders, then post a `builder-preview:metrics` envelope back to the admin frame.
- `collectPreviewTargets(snapshot?)` — reads Phase 2 `data-builder-*` markers from the rendered
  iframe document, deduplicates target refs, measures `getBoundingClientRect()` rectangles in iframe
  viewport CSS pixels, and returns ordered page/header/section/column/module geometry.
- `startPreviewTargetBridge(snapshot, overrides)` and `stopPreviewTargetBridge()` — start or stop the
  builder-editing-only target bridge. The bridge posts `TARGETS` after initial render and layout
  changes, posts `TARGET_HOVER`/`TARGET_SELECT` for pointer movement and clicks, prevents iframe
  link/form/control side effects while editing, and accepts validated non-mutating `TARGET_ACTION`
  requests such as `refresh-targets`, `clear-hover`, and `scroll-into-view`.
- Text-module inline editing is enabled only while `builderEditing` is true. The bridge can start a
  temporary `contenteditable` view on a marked `.pb-text[data-builder-edit-field="content"]`
  element from double-click or a parent toolbar request, posts validated `INLINE_EDIT_START`,
  `INLINE_EDIT_CHANGE`, `INLINE_EDIT_COMMIT`, and `INLINE_EDIT_CANCEL` messages, and removes the
  editable state on commit, cancel, cleanup, or non-editing snapshots. It accepts parent-origin
  `INLINE_EDIT_CHANGE` sync messages for the active text target without echoing them back, sanitizes
  inline DOM on input/paste/formatting, rejects unsafe toolbar links, and blocks editable anchor
  activation. The iframe DOM remains an editing view; admin module drafts remain canonical.
- `validatePreviewMessageEvent(event, expected)` — validates a raw `MessageEvent` from the parent frame, checking origin and source before delegating to `validatePreviewEnvelope(...)`.

Preview side-effect stubs are intentionally distributed through the reader modules they protect:
analytics and live tracking do not start, fullscreen returns without action, user settings is inert,
safe mode and chat SSO return early, comment writes are blocked, email forms show a preview-only
success message, and navigation clicks are suppressed by the preview-mode event handlers.

## 📜 Current Behavioral Contracts

- Two-page mode is derived at render time; it is not a separate persisted mode toggle in `state`.
- Protected entry assets starting with `protected/` are mapped to `/api/protected/...`.
- The desktop "dynamic frame" behavior is owned by `transform.js` and only applies outside fullscreen and outside stacked/mobile layouts.
- Fullscreen keeps its own fit-height path and clears the desktop frame while active.
- Progress is persisted with `state.saveProgress()` to the `battleBros_progress` key.
- Premium gating is applied in `app.js` after session state is known; non-premium users can have premium entries removed from the active entry list or the whole reader locked when the series is premium-only.

## ⚠️ Deprecated Or Easy-To-Misstate Areas

- `page-config.json` is not a normal reader-page source. Builder pages are primary, and safe mode is the intentional remaining runtime reader consumer.
- Legacy reader fallback for the default `reader` slug has been retired after the series-level fallback audit gate.
- `reader/customization.js` is intentionally a no-op compatibility module.
- Exact builder preview is not controlled by an `exact-preview` URL flag. Use `builderPreview=1`
  with the preview bridge query parameters described above.
- Comments, auth, and API helpers exist as separate modules, but not every reader surface is consolidated onto those abstractions yet.

## Related Docs

- `docs/reader-code-reference.md`: concise module and flow reference.
- `docs/READER_REFERENCE.md`: reader runtime summary.
- `docs/functions/admin-page-builder.md`: builder-side rendering and shared renderer contracts.

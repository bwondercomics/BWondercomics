# Reader Core Infrastructure Logic

This document describes the current reader runtime under `reader/`. It replaces older descriptions that mixed live code with legacy or planned behavior.

## Table of Contents

- [💡 Scope & Canonical Data Sources](#-scope--canonical-data-sources)
- [⚙️ Boot And Runtime Flow](#️-boot-and-runtime-flow)
- [🔌 Main Entry Point (app.js)](#-main-entry-point-appjs)
- [💾 Data Hydration (data.js)](#-data-hydration-datajs)
- [💾 Global State (state.js)](#-global-state-statejs)
- [🐚 Reader Shell State (shell-state.js)](#-reader-shell-state-shell-statejs)
- [↕️ Display Mode (display-mode.js)](#️-display-mode-display-modejs)
- [📜 Vertical Reader (vertical.js)](#-vertical-reader-verticaljs)
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
- [📚 Entry Gallery Module (entry-gallery-module.js)](#-entry-gallery-module-entry-gallery-modulejs)
- [🖼️ Media Gallery Module (media-gallery-module.js)](#️-media-gallery-module-media-gallery-modulejs)
- [💬 Chat SSO Integration (chat-sso.js)](#-chat-sso-integration-chat-ssojs)
- [🛡️ Safe Mode Guard (safe-mode.js)](#️-safe-mode-guard-safe-modejs)
- [🌉 Builder Preview Bridge (preview-bridge.js)](#-builder-preview-bridge-preview-bridgejs)
- [📜 Current Behavioral Contracts](#-current-behavioral-contracts)
- [⚠️ Deprecated Or Easy-To-Misstate Areas](#️-deprecated-or-easy-to-misstate-areas)
- [🧭 Maintenance Rule](#-maintenance-rule)

## 💡 Scope & Canonical Data Sources

The reader is split into three layers:

- **Core reading runtime**: boot, data loading, state, render, controls, transforms, fullscreen, and overlays.
- **Builder-page runtime**: page fetching/rendering plus shared header/layout integration.
- **Support surfaces**: analytics, comments, auth/API helpers, feed/latest widgets, CMS gallery mounts, safe-mode redirect, and user settings.

### Canonical Data Sources

- `data.json` or `/series/<seriesId>/data.json`: entry pages, entry metadata, status message, premium flags, unit labels, and entry labels. The public payload hides `draft` entries and advertises future `scheduled` entries with `status: "scheduled"` + `publishAt` while withholding their page images, so the reader shows COMING SOON until release. Due scheduled rows are promoted to `published` before payload generation and then expose their pages normally. Entry saves persist and normalize `status` + `publishAt`; accepted states are `published`, `scheduled`, and `draft`.
- Admin series-data aliases under `/admin/*` and `/api/admin/*` require an authenticated admin and return `Cache-Control: no-store`. Their payloads include every entry, raw `status`, `publishAt`, and complete pages so the entry editor can manage drafts and schedules without data loss.
- `/api/pages/home/<seriesId>`: effective published homepage page for the series root; resolves the page marked homepage and falls back to the same-series bound published `reader` page when no homepage is set. The reader fallback is valid only when the bound page contains exactly one visible Comic Reader module.
- `/api/admin/pages/home/<seriesId>`: admin-only draft/homepage resolver used when `draft=1` is requested without an explicit page slug.
- `/api/pages/<seriesId>/<slug>`: published builder pages for reader pages.
- `/api/pages/global/by-slug/<slug>`: published global builder pages requested with `?pageScope=global&page=<slug>`.
- `/api/admin/pages/series/<seriesId>/by-slug/<slug>` and `/api/admin/pages/global/by-slug/<slug>`: draft builder pages when `draft=1` is requested by an admin.
- `page-config.json` or `/series/<seriesId>/page-config.json`: legacy config data retained for standalone helpers/admin surfaces; normal reader startup no longer uses it. `reader/safe-mode.js` intentionally still reads `/page-config.json` for recovery redirects.
- `/api/posts/latest` and `/api/posts`: latest update widget and feed content.
- `/series.json`, per-series `data.json`, and `/media.json`: reader-side CMS modules for entry
  gallery and media gallery mounts rendered from builder pages.
- `localStorage`: reading progress, reader analytics opt-out, visitor id, and some UI preferences.

## ⚙️ Boot And Runtime Flow

1. `index.html` loads `reader/app.js` and `reader/customization.js`.
2. `reader/app.js` creates shared boot-state and reader-shell-state objects on `window`, keeps the static shell hidden with `reader-bootstrap-loading`, and resolves the builder page before starting reader-only work.
3. `loadPageConfigWithFallback()` resolves builder content from two paths:
   - when the URL has an explicit `?page=<slug>`, it loads `/api/pages/<seriesId>/<slug>` or, when `?pageScope=global` is present, `/api/pages/global/by-slug/<slug>`
   - when no explicit page slug is present, it loads `/api/pages/home/<seriesId>` or the admin homepage draft endpoint so the series root follows homepage assignment and a same-series reader binding with one valid Comic Reader module instead of hard-coding `reader`
4. `reader/shell-state.js` resolves whether the page has an effective `reader` module. Pages without one publish `body[data-reader-shell="inactive"]`, render the full builder page into `#builderPageContent`, hide reader-owned shell and topbar controls, and skip entry-data loading, reader analytics, gallery/latest panel setup, pointer/fullscreen handlers, comments, and live tracking.
5. Pages with an effective `reader` module publish `body[data-reader-shell="active"]`, load the
   reader module's target series data via `loadEntryData()`, apply premium gating, load latest posts,
   and initialize the reader shell. The effective config applies controls placement/size/appearance,
   stage fit/gap/frame/max-width, panel visibility, comments visibility, and the active `paged` or
   `vertical-scroll` display mode before the first render.
6. **Builder preview mode** (`?builderPreview=1`): when the URL carries this flag, `app.js` skips `loadPageConfigWithFallback()` entirely, lazy-imports `reader/preview-bridge.js`, and calls `requestPreviewSnapshot(...)`. The bridge sends a `REQUEST_SNAPSHOT` message to the parent admin frame, validates the `SNAPSHOT` reply, and returns a resolved page result. Each snapshot is applied via `applyBuilderPageToDOM(...)` with `previewMode: true`; no-reader snapshots still emit responsive metrics and builder target geometry from `#builderPageContent`, while active reader snapshots keep reader side effects suppressed for preview. Reader handlers that were attached by an earlier active preview state check the current shell state and no-op after an active-to-inactive snapshot transition. If the request times out or the snapshot is invalid, `handlePreviewLoadError()` surfaces an inline error and releases bootstrap state with `source: 'error'`.
7. Missing builder pages resolve to `source: 'none'`; normal startup does not fetch legacy `page-config.json` or force the static reader shell back into view.
8. After the first render, no-reader builder-page application, or error state is ready, `app.js` releases bootstrap hiding and exposes `window.BattleBros` subtitle helpers.
9. `reader/customization.js` waits for the boot result and remains a no-op so `source: 'none'` cannot repaint the legacy shell.

## 🔌 Main Entry Point (app.js)

The composition root. Resolves the builder page, checks reader-shell state, loads runtime data only for active reader pages, applies premium gating, initializes DOM bindings, coordinates boot-state handoff, statically imports fullscreen controls, lazy-loads `gallery.js` and the preview bridge, and reacts to session changes. In builder preview mode (`?builderPreview=1`) the normal data-fetch path is bypassed; the reader instead waits for a validated snapshot from the admin frame via `preview-bridge.js`. A `previewMode` flag propagates through `init(...)` and `attachEventHandlers(...)` to suppress fullscreen, mouse-edge controls, topbar hover handlers, navigation links, store-entry redirects, and analytics initialization. Attached reader navigation, zoom, pointer, entry, and resize handlers also guard against `body[data-reader-shell="inactive"]` so preview shell-state transitions cannot keep reader actions live on no-reader pages. Preview mode also emits responsive metrics after snapshot application and after the debounced resize `render()` path completes.

## 💾 Data Hydration (data.js)

Fetches entry data, builder pages, latest posts, and standalone legacy page config when explicitly requested by helper callers. Applies builder-page DOM, theme, panel backgrounds, feed modules, promo carousels, entry/media gallery mounts, and shared header layout.

Important current behavior:

- `loadHomepageBuilderPage()` is the root-path loader used when no explicit page slug is requested
- root-path builder loading now follows the effective homepage resolver instead of always requesting the `reader` slug directly
- `applyBuilderPageToDOM()` resolves header state once and reuses that same state for both visible copy and shared topbar layout
- `applyBuilderPageToDOM()` publishes reader-shell state. Active pages use the existing static shell/panel path; no-reader pages render a normal `.pb-page` into `#builderPageContent` and hide reader-only shell chrome plus reader-owned topbar controls.
- Active reader pages resolve the effective `reader` module through builder responsive overrides
  before applying sanitized display/controls/stage/panel/comment settings. Missing config preserves
  paged defaults and `showPanels`/`showComments` compatibility.
- Reader panels are fed only by modules in the reader module's own section. Other sections render
  into `#builderAboveReader` or `#builderBelowReader` as ordinary authored content.
- Section rendering keeps global column nodes/module ownership stable while responsive layouts
  reflow visible tracks and apply sparse per-column appearance, padding, alignment, min-height, and
  visibility settings.
- `applyBuilderPageToDOM()` accepts a `previewMode` option that propagates to `renderPanelStack(...)` and `initEmailForms(...)` so email signup forms show a preview stub instead of submitting
- normal startup resolves V3 page headers with `pageConfig: null`; optional legacy config remains accepted only for migration/safety helper calls

## 💾 Global State (state.js)

The shared runtime state for current entry, page index, zoom/pan, page metrics, image cache, and
persisted progress. Vertical progress adds a `scrollRatio` while retaining the page index fallback.

## 🐚 Reader Shell State (shell-state.js)

Resolves and publishes active/inactive reader ownership from the effective Comic Reader module.
Consumers can read, wait for, or subscribe to shell state so reader-only analytics, comments,
tracking, controls, and gestures do not initialize or remain active on no-reader pages.

## ↕️ Display Mode (display-mode.js)

Reads `body[data-reader-display-mode]` and exposes the normalized active mode. Paged is the default;
`vertical-scroll` switches render, controls, analytics, pointer, fullscreen, and persistence behavior.

## 📜 Vertical Reader (vertical.js)

Builds a continuous `#verticalStrip`, observes page visibility/scroll position, updates
`state.pageIndex`, analytics, completion, and saved scroll progress, and tears down observers/DOM on
entry, mode, or reader-shell transitions. The cached paged stage remains hidden rather than destroyed
so preview mode can switch display modes safely.

## 🖼️ Page Renderer (render.js)

Branches between paged rendering and `renderVertical()`. Paged mode renders the current page/spread,
preloads neighbors, caches dimensions, and reapplies desktop frame fitting. Empty scheduled entries
render a Coming Soon state from `status`/`publishAt`.

## 🎮 Navigation Controls (controls.js)

Prev/next/restart navigation and end-of-entry overlay helpers. In vertical mode, previous/next moves
between entries while restart scrolls the strip to the top.

## 🖱️ Pointer Engine (pointer.js)

Pointer, drag, wheel, pinch, swipe, and edge-zone handling for paged navigation and zoom/pan. Paged
gestures are disabled in vertical mode so native scrolling remains authoritative.

## 📐 Transform Engine (transform.js)

Scale/pan math, reset/zoom helpers, desktop on-page frame sizing, and fullscreen fit-height behavior.

## 🔲 Fullscreen Manager (fullscreen.js)

Fullscreen entry/exit, controls-bar visibility, and coordination with frame fitting. Fullscreen is
disabled in builder preview and vertical mode.

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

Reader-side page renderer built on the shared builder renderers. Exports `renderPage`, `renderModule`, `fetchPage`, `mountPage`, `initEmailForms`, and `initPromoCarousels`. Mounted pages also initialize reader-owned entry gallery and media gallery modules after the shared HTML is inserted.

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

Maintains a lightweight visitor heartbeat to `/api/track/visitor` with visitor id, path, series id, entry label, and page number. It handles active-visitor presence tracking. `initLiveTracking()` waits for the published reader-shell state and starts only for active, non-preview reader pages. In builder preview mode (`?builderPreview=1`) or on pages without a reader module, it exits without starting the heartbeat.

## 🎯 Comment Targets (comment-targets.js)

Builds stable target ids such as `battle-bros:entry-5` and post target ids.

## 🗣️ Comments Engine (comic-comments.js)

Self-contained reader comments UI. It handles session checks, sign-in/register/sign-out, comment posting, admin moderation calls, entry-target changes, and comment-panel collapse/expand behavior. It also requests `fitOnPageFrame()` after comment layout changes.

The module waits for the published reader-shell state before initialization. Pages without a reader module do not initialize comments, fetch session state, or load comment threads.

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

## 📚 Entry Gallery Module (entry-gallery-module.js)

Initializes builder `entry-gallery` mounts after reader page rendering. It reads the module's
serialized source config, loads the active series, a specific series, or every public series through
`/series.json` plus per-series `data.json`, then renders cover-card grids from sanitized entry data.

Current behavior:

- protected entry asset paths are resolved through `/api/protected/...`
- filters cover status, access, label id, and `showInGallery`
- sort modes include stored order, newest, and title
- cards can hide labels and clamp their column count from module data attributes

## 🖼️ Media Gallery Module (media-gallery-module.js)

Initializes builder `media-gallery` mounts after reader page rendering. It loads `/media.json`
once per page mount, filters out private media, optionally excludes premium items, applies tag/access
filters from the module source config, and renders public or protected thumbnail URLs into the shared
gallery card styling.

Current behavior:

- gallery labels prefer media tags and fall back to a cleaned filename
- sort modes include path and newest
- missing images fall back to `/assets/image-missing.png`
- captions and column count are controlled by module data attributes

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
- `displayMode` is authored on the reader module. Both `paged` and `vertical-scroll` are active
  runtime modes, including safe responsive overrides.
- Protected entry assets starting with `protected/` are mapped to `/api/protected/...`.
- The desktop "dynamic frame" behavior is owned by `transform.js` and only applies outside fullscreen and outside stacked/mobile layouts.
- Fullscreen keeps its own fit-height path and clears the desktop frame while active.
- Vertical mode disables zoom, pan, swipe page turns, and fullscreen, and uses page visibility plus
  scroll position for progress/analytics.
- Progress is persisted with `state.saveProgress()` to the `battleBros_progress` key; vertical saves
  include `scrollRatio`.
- Premium gating is applied in `app.js` after session state is known; non-premium users can have premium entries removed from the active entry list or the whole reader locked when the series is premium-only.

## ⚠️ Deprecated Or Easy-To-Misstate Areas

- `page-config.json` is not a normal reader-page source. Builder pages are primary, and safe mode is the intentional remaining runtime reader consumer.
- Legacy reader fallback for the default `reader` slug has been retired after the series-level fallback audit gate.
- `reader/customization.js` is intentionally a no-op compatibility module.
- Exact builder preview is not controlled by an `exact-preview` URL flag. Use `builderPreview=1`
  with the preview bridge query parameters described above.
- Comments, auth, and API helpers exist as separate modules, but not every reader surface is consolidated onto those abstractions yet.

## 🧭 Maintenance Rule

Update this document when reader modules are added or removed, exported APIs change, builder page
rendering gains a new side-effect module, or the reader boot/data-source flow changes.

## Related Docs

- `docs/reader-code-reference.md`: concise module and flow reference.
- `docs/READER_REFERENCE.md`: reader runtime summary.
- `docs/functions/admin-page-builder.md`: builder-side rendering and shared renderer contracts.

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
- [🖌️ Legacy Customization (customization.js)](#️-legacy-customization-customizationjs)
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
- [📜 Current Behavioral Contracts](#-current-behavioral-contracts)
- [⚠️ Deprecated Or Easy-To-Misstate Areas](#️-deprecated-or-easy-to-misstate-areas)

## 💡 Scope & Canonical Data Sources

The reader is split into three layers:

- **Core reading runtime**: boot, data loading, state, render, controls, transforms, fullscreen, and overlays.
- **Builder-page runtime**: page fetching/rendering plus shared header/layout integration.
- **Support surfaces**: analytics, comments, auth/API helpers, feed/latest widgets, safe-mode redirect, and user settings.

### Canonical Data Sources

- `data.json` or `/series/<seriesId>/data.json`: entry pages, entry metadata, status message, premium flags, unit labels, and entry labels.
- `/api/pages/home/<seriesId>`: effective published homepage page for the series root; resolves the page marked homepage and falls back to the published `reader` page when no homepage is set.
- `/api/admin/pages/home/<seriesId>`: admin-only draft/homepage resolver used when `draft=1` is requested without an explicit page slug.
- `/api/pages/<seriesId>/<slug>`: published builder pages for reader pages.
- `/api/admin/pages/by-slug/<seriesId>/<slug>`: draft builder pages when `draft=1` is requested by an admin.
- `page-config.json` or `/series/<seriesId>/page-config.json`: legacy page config fallback for the default reader slug only.
- `/api/posts/latest` and `/api/posts`: latest update widget and feed content.
- `localStorage`: reading progress, reader analytics opt-out, visitor id, and some UI preferences.

## ⚙️ Boot And Runtime Flow

1. `index.html` loads `reader/app.js` and `reader/customization.js`.
2. `reader/app.js` creates a shared boot-state object on `window`, keeps the static shell hidden with `reader-bootstrap-loading`, and loads:
   - series entry data via `loadEntryData()`
   - page config via `loadPageConfigWithFallback()`
   - latest post data via `loadLatestPost()`
3. `loadPageConfigWithFallback()` resolves builder content from two paths:
   - when the URL has an explicit `?page=<slug>`, it loads `/api/pages/<seriesId>/<slug>` or the admin by-slug draft endpoint
   - when no explicit page slug is present, it loads `/api/pages/home/<seriesId>` or the admin homepage draft endpoint so the series root follows homepage assignment instead of hard-coding `reader`
4. Legacy `page-config.json` fallback only applies for the default `reader` slug and only when a builder page was not active. This path is deprecated.
5. After the first render or error state is ready, `app.js` releases bootstrap hiding and exposes `window.BattleBros` subtitle helpers.
6. `reader/customization.js` waits for the boot result and exits early when the builder page already owns the initial DOM, preventing the legacy shell from repainting over builder content.

## 🔌 Main Entry Point (app.js)

The composition root. Loads runtime data, applies premium gating, initializes DOM bindings, coordinates boot-state handoff, lazy-loads `gallery.js` and `fullscreen.js`, and reacts to session changes.

## 💾 Data Hydration (data.js)

Fetches entry data, page config, latest posts, and builder pages. Applies builder-page DOM, theme, panel backgrounds, feed modules, promo carousels, and shared header layout.

Important current behavior:

- `loadHomepageBuilderPage()` is the root-path loader used when no explicit page slug is requested
- root-path builder loading now follows the effective homepage resolver instead of always requesting the `reader` slug directly
- `applyBuilderPageToDOM()` resolves header state once and reuses that same state for both visible copy and shared topbar layout

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

Fullscreen entry/exit, controls-bar visibility, and coordination with frame fitting.

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

Current distinction:

- `getExplicitPageSlug()` returns only a user-supplied `?page=` slug
- the reader no longer invents `reader` as an explicit request at the URL-parsing layer; missing `?page=` now means "use the effective homepage resolver"

## 🛠️ Utilities (utils.js)

Lightweight helpers such as throttling and cached measurement.

## 📝 Logger (logger.js)

Debug logging facade used across reader modules.

## 📄 Builder Page Renderer (page-renderer.js)

Reader-side page renderer built on the shared builder renderers. Exports `renderPage`, `renderModule`, `fetchPage`, `mountPage`, `initEmailForms`, and `initPromoCarousels`.

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

## 🖌️ Legacy Customization (customization.js)

Legacy page-config applier. It now only runs when the builder page did not claim the initial page.

## 📊 Analytics Coordinator (analytics.js)

Sends `reader_page_view`, `reader_entry_complete`, and `reader_entry_exit` events. It tracks visible pages, completion, and entry exit while respecting the `battlebros_count_views=false` opt-out flag in `localStorage`.

Analytics and live tracking are separate systems. `analytics.js` handles reader engagement analytics.

## 📡 Live Tracker (live-tracking.js)

Maintains a lightweight visitor heartbeat to `/api/track/visitor` with visitor id, path, series id, entry label, and page number. It handles active-visitor presence tracking.

## 🎯 Comment Targets (comment-targets.js)

Builds stable target ids such as `battle-bros:entry-5` and post target ids.

## 🗣️ Comments Engine (comic-comments.js)

Self-contained reader comments UI. It handles session checks, sign-in/register/sign-out, comment posting, admin moderation calls, entry-target changes, and comment-panel collapse/expand behavior. It also requests `fitOnPageFrame()` after comment layout changes.

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

Overlay-driven account UI for sign-in, email opt-in, premium-code redeem, comment management, logout, and account deletion.

## 📧 Email Signup form (email.js)

Email signup form handler. Binds submit events, handles API submission, and displays success/error feedback inline.

## 🚀 Latest Posts Widget (latest.js)

Renders the latest-update widget and generates safe preview HTML.

## 📰 Feed Panel (feed-panel.js)

Powers the right-panel feed surface and builder feed modules. It loads `/api/posts`, sanitizes post content, renders preview cards, and toggles feed mode.

## 💬 Chat SSO Integration (chat-sso.js)

Chat/community handoff support.

## 🛡️ Safe Mode Guard (safe-mode.js)

Optional redirect guard. It reads `/page-config.json` on non-local hosts and redirects to `safeModeUrl` when safe mode is enabled.

## 📜 Current Behavioral Contracts

- Two-page mode is derived at render time; it is not a separate persisted mode toggle in `state`.
- Protected entry assets starting with `protected/` are mapped to `/api/protected/...`.
- The desktop "dynamic frame" behavior is owned by `transform.js` and only applies outside fullscreen and outside stacked/mobile layouts.
- Fullscreen keeps its own fit-height path and clears the desktop frame while active.
- Progress is persisted with `state.saveProgress()` to the `battleBros_progress` key.
- Premium gating is applied in `app.js` after session state is known; non-premium users can have premium entries removed from the active entry list or the whole reader locked when the series is premium-only.

## ⚠️ Deprecated Or Easy-To-Misstate Areas

- `page-config.json` is no longer the primary reader-page source. Builder pages are primary.
- Legacy fallback is limited to the default `reader` slug and is documented for removal once the series-level fallback audit is clean and a published `reader` page exists.
- `reader/customization.js` does not blindly repaint the page anymore; it coordinates with the boot-state result from `app.js`.
- Comments, auth, and API helpers exist as separate modules, but not every reader surface is consolidated onto those abstractions yet.

## Related Docs

- `docs/reader-code-reference.md`: concise module and flow reference.
- `docs/READER_REFERENCE.md`: reader runtime summary.
- `docs/functions/admin-page-builder.md`: builder-side rendering and shared renderer contracts.

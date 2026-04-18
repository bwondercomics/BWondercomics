

# Admin Core Suite Logic

This document provides a comprehensive map of the internal functions, orchestration logic, and global infrastructure within the `admin/` root directory.

## Table of Contents

- [💡 Core Concepts](#-core-concepts)
- [🖼️ DOM Registry (dom.js)](#️-dom-registry-domjs)
- [📡 API Layer (api.js)](#-api-layer-apijs)
- [📊 Analytics Coordinator (analytics.js)](#-analytics-coordinator-analyticsjs)
- [🔌 Main Entry Point (app.js)](#-main-entry-point-appjs)
- [🧭 Navigation Manager (nav.js)](#-navigation-manager-navjs)
- [💾 Global State (state.js)](#-global-state-statejs)
- [🔐 Authentication (auth.js)](#-authentication-authjs)
- [🦋 Bluesky Integration (bluesky.js)](#-bluesky-integration-blueskyjs)
- [⚙️ Administrative Config (config.js)](#️-administrative-config-configjs)
- [🛠️ Universal Utilities (core.js)](#️-universal-utilities-corejs)
- [📈 Dashboard Manager (dashboard.js)](#-dashboard-manager-dashboardjs)
- [🎨 Designer Canvas (designer.html)](#-designer-canvas-designerhtml)
- [🌉 Designer Orchestrator (designer.js)](#-designer-orchestrator-designerjs)
- [🩺 Diagnostics Data (diagnostics-data.js)](#-diagnostics-data-diagnostics-datajs)
- [🩺 Diagnostics Manager (diagnostics.js)](#-diagnostics-manager-diagnosticsjs)
- [📊 Diagnostics UI System (diagnostics.css)](#-diagnostics-ui-system-diagnosticscss)
- [📚 Entry Manager (entries.js)](#-entry-manager-entriesjs)
- [🖼️ Image Picker Service (image-picker.js)](#️-image-picker-service-image-pickerjs)
- [🏛️ Master Shell (index.html)](#️-master-shell-indexhtml)
- [🖼️ Media Manager (media.js)](#️-media-manager-mediajs)
- [🛠️ Page Builder Root (page-builder.js)](#️-page-builder-root-page-builderjs)
- [⚙️ Configuration DAL (page-config.js)](#️-configuration-dal-page-configjs)
- [📝 Posts Manager (posts.js)](#-posts-manager-postsjs)
- [🎨 Admin Design System (admin.css)](#-admin-design-system-admincss)
- [🔍 Preview Manager (preview.js)](#-preview-manager-previewjs)
- [📚 Series Manager (series.js)](#-series-manager-seriesjs)
- [🦋 Social Manager (social.js)](#-social-manager-socialjs)
- [🛡️ Moderation Manager (moderation.js)](#️-moderation-manager-moderationjs)
- [☁️ Upload Manager (uploads.js)](#️-upload-manager-uploadsjs)
- [👥 User Manager (users.js)](#-user-manager-usersjs)
- [🧰 Shared Utilities (utils.js)](#-shared-utilities-utilsjs)

## 💡 Core Concepts

The administrative infrastructure is built as a **High-Resiliency Single Page Application (SPA)**. It prioritizes data integrity, visual personality, and decoupled orchestration. Every module adheres to the following five architectural pillars:

### 1. The Manager-Mediator Architecture

The suite uses a **Mediator pattern** to manage complexity.

- **Mediators** (`app.js`, `analytics.js`, `page-builder.js`) act as the application's "Brains," orchestrating the global lifecycle.
- **Coordinators** (`media.js`, `entries.js`, etc.) handle specific domains. They are initialized via factories that receives their dependencies (e.g., routing hooks) from the Mediator, ensuring high-testability and decoupling.

### 2. The Defensive Data Lifecycle

Truth flows through a strictly managed pipeline: **Server JSON → `state.js` → DOM**.

- **Resilience**: Modules like `diagnostics.js` and `entries.js` implement "Self-healing" logic, capable of reconstructing logical schemas from legacy endpoints or physical disk folder scans if primary APIs are unavailable.
- **Draft Persistence**: `localStorage` is used as a secondary "Safety Buffer" (e.g., in `posts.js`) to ensure authoring work is never lost to session drops.

### 3. Registry-First UI Policy

To maximize performance and maintain a "Source of Truth" for the UI, the suite enforces a **Registry Pattern** via `dom.js`.

- **Policy**: Sub-managers are forbidden from using ad-hoc `document.getElementById` calls.
- **Benefit**: This centralizes the UI manifest, prevents memory leaks from dangling DOM references, and ensures a shared vocabulary for all interactive elements.

### 4. Multi-Layer Security Firewall

Administrative safety is enforced across three distinct layers:

- **Role-Gating (`auth.js`)**: Strictly enforces the `admin` role for all dashboard access.
- **Structural Scrubbing (`core.js`)**: Implements a recursive `DOMParser` whitelist for all rich-text inputs to prevent XSS.
- **Secure Transport (`api.js`)**: Enforces `same-origin` credentials and `no-store` cache headers for every backend handshake.

### 5. Contextual Multi-Tenancy (Series Sandboxing)

The panel operates as a multi-project orchestrator. Changing the "Active Series" triggers a comprehensive **Context Swap**:

- **Filesystem Isolation**: Remaps all folder lookups to isolated series directories.
- **UI Localization**: Dynamically re-labels the entire interface (e.g., changing "Chapters" to "Issues") based on series-specific metadata.

## 🖼️ DOM Registry (dom.js)

The foundational registry for the Admin UI. It centralizes all DOM element lookups into a single exported `el` object, maximizing performance by eliminating redundant `document.getElementById` calls across the application.

### Public API (🔌)

#### The `el` Object

The master registry. Every interactive element in the Admin shell is available as a property on this object (e.g., `el.adminDashboard`, `el.btnSave`).

### Internal Orchestration (🔒)

#### Automated Hydration

The module uses a high-performance **ID-to-Property** loop. It iterates through a master array of string constants (IDs matching the `id` attributes in `admin/index.html`) and automatically populates the `el` object.

- **Null-Safety**: Properties for missing elements are initialized as `null` to prevent crashes while providing predictable accessors.
- **Type Hinting**: Extensive JSDoc `@type` annotations are included for each group of elements to provide IDE completions and type-safety for developers.

### Element Categories

The registry is logically grouped into functional categories:

- **Global Shell**: Main containers (`adminDashboard`, `adminHeader`), splash screens, and navigation rails.
- **Authentication**: Login inputs, error feedback spans, and submit buttons.
- **Dashboard Sections**: Individual stat cards (`dashViews24h`), activity lists, and the todo engine.
- **Manager Workspaces**: Full registry for **Chapters**, **Media**, **Blog**, **Subscribers**, **Premium Codes**, and **Banned IPs**.

> [!IMPORTANT]
> To maintain the performance of the Admin SPA, **NEVER** use `document.getElementById` or `document.querySelector` within sub-managers. Always add the ID to the `dom.js` registry and access it via the `el` object.

### Principal Registries

- **Functional Sections**: References to the top-level containers (`dashboardSection`, `chaptersSection`, `analyticsSection`) used by the route switcher in `app.js`.
- **Primary Nav**: Every sidebar button and toggle (`btnAnalytics`, `adminNavToggle`, `stickyHeaderToggle`).
- **Data Modals**: Master references for the multi-purpose `editModal` and `seriesModal`.
- **Surface Canvas**: Handles for the high-performance drawing surfaces (`pbCanvas`, `liveVisitorsChart`).
- **Interactive Forms**: Direct mapping for all inputs in the entry editor, post manager, and media upload flows.

> [!IMPORTANT]
> Because `dom.js` initializes on load, any script that imports it must be executed after the DOM is ready (typically via `DOMContentLoaded`).

## 📡 API Layer (api.js)

The `api.js` module provides a standardized, stateless interface for all communication between the Admin SPA and the Python backend.

### Public API (🔌)

#### `fetchAdminAPI(url, options)`

A robust wrapper around the native `fetch` API specialized for the administrative context.

- **Security Logic**: Enforces `credentials: 'same-origin'` to ensure secure, cookie-based session transport for every request.
- **Cache Policy**: Hard-coded to `cache: 'no-store'` to prevent the browser from serving stale administrative data (e.g., outdated visitor counts or old draft content).
- **Error Normalization**:
  - Intercepts non-OK responses (4xx/5xx).
  - Attempts to parse the backend JSON for `error` or `message` strings.
  - Throws a native JavaScript `Error` with the HTTP status code attached as a property (e.g., `err.status = 403`), allowing callers to handle specific status-based logic.

### Internal Logic (🔒)

- **Safe JSON Parsing**: Uses a `.catch(() => ({}))` pattern during the response parsing phase to ensure that a malformed or non-JSON response doesn't crash the utility, returning an empty object to the error handler instead.

### DOM Dependencies

- **None**: This module is purely data-driven and has no knowledge of the UI.

## 📊 Analytics Coordinator (analytics.js)

The central facade for the analytics dashboard. This module is a pure **Coordinator**; it does not perform data crunching but instead orchestrates the lifecycle and data synchronization between the five specialized sub-modules in the `analytics/` folder.

### Public API (🔌)

#### `createAnalytics({ hideAllSections, setActiveNav })`

The main factory. It initializes the Visitor History, Reader Metrics, Traffic, Live Seismometer, and Reads Over Time engines. Returns a facade object used by `app.js`.

#### `refreshAnalytics({ showLoading = true })`

Triggers a system-wide data refresh.

- **Parallel Sync**: Uses `Promise.all` for the `Reader` and `Weekly Digest` payloads to ensure the Health Indicator and Trend cards are updated simultaneously.
- **Payload Bridging**: Passes the engagement data from the `Reader` module to the `Reads Over Time` module to ensure their entry-selection lists are identical.

#### `showAnalyticsSection()`

The primary routing entry point. It manages the shell transition (hiding sections/setting nav states), scrolls the dashboard into view, and triggers an initial `refreshAnalytics`.

### Internal Helpers (🔒)

- **`loadReaderAnalytics()`**: Wraps the reader loader to intercept the payload and sync it with the historical chart engine.
- **`renderReaderAnalyticsView()`**: Proxy to the reader engine's UI renderer.
- **`loadLiveVisitors()` / `loadAnalyticsSummary()`**: Facade wrappers that delegate to specialized sub-modules while maintaining the shared `options` context.

### DOM Dependencies

- `el.analyticsSection`: The main container revealed/hidden during routing.
- `el.btnAnalytics`: The sidebar navigation button targeted for active styling.

### Workflow Integration

- **Control Initialization**: Executes the initialization sequence for all sub-panel controls (tabs, range selects, search inputs) during the factory phase.
- **Live Triggers**: Re-exports `startLiveVisitors`, `stopLiveVisitors`, and `shiftLiveRange` to expose the seismometer's lifecycle to the global admin shell.

## 🔌 Main Entry Point (app.js)

The orchestrator and dependency injection hub for the Admin SPA. It manages the application lifecycle, global routing, and the initialization of all specialized sub-managers.

### Public API (🔌)

#### `init()`

The bootstrapping entry point for the entire application.

1. **Event Wiring**: Executes `attachEventHandlers()` to bind all buttons in the `index.html` shell.
2. **Preference Recall**: Restores `localStorage` settings for the navigation layout and sticky header.
3. **Session Verification**: Asynchronously checks for a valid admin session via `auth.js`.
4. **Shell Reveal**: Hides the splash screen and reveals either the `loginScreen` or `adminDashboard`.

#### `showDashboard()`

The post-authentication sequence. It fetches the `seriesIndex`, `posts`, and `media` data in parallel and renders the default dashboard view.

#### `hideAllSections()`

The primitive SPA router logic. It hides all 12 functional areas of the dashboard (Chapters, Blog, Analytics, etc.) and stops any active real-time polling (like live visitor tracking) to save resources.

#### `setActiveNav(btn)`

Synchronizes the visual "active" state of the sidebar navigation buttons based on the current functional view.

#### `renumberPages()`

A critical administrative utility that triggers a backend file-renaming operation to synchronize physical image paths with the database's ordering state.

### Internal Helpers (🔒)

#### Header & Layout Mechanics

- **`updateHeaderMetrics()`**: Dynamically calculates the height of the admin header and sets the `--admin-header-height` CSS variable to ensure content isn't obscured by the sticky header.
- **`handleHeaderScroll()`**: A high-frequency scroll listener that hides or reveals the administrative header based on threshold scroll offsets (24px).
- **`applyHeaderSticky(enabled)`**: Toggles the permanent visibility of the header and updates the `header-sticky` class on the root dashboard container.

#### Connectivity & Safety

- **`loadInnerNetTarget()`**: An asynchronous connectivity check that pings the specific "Inner-Net" backend to verify internal network status.
- **`setSafeModeEnabled(enabled)`**: Orchestrates the persistence of site-wide redirection settings to the shared `page-config.json`.

### DOM Dependencies

- **Global Containers**: `el.adminDashboard`, `el.loginScreen`, `el.adminHeader`, `el.adminContent`.
- **Navigation Cluster**: Every sidebar button (e.g., `el.btnDashboard`, `el.btnAnalytics`).
- **Functional Sections**: Root IDs for every sub-module workspace (e.g., `el.chaptersSection`, `el.mediaSection`).
- **Utility Toggles**: `el.stickyHeaderToggle`, `el.countViewsToggle`, `el.safeModeToggle`.

## 🧭 Navigation Manager (nav.js)

The "UI Recall" orchestrator. It manages the physical orientation and visual preferences of the administrative suite, ensuring a consistent user experience across sessions via `localStorage`.

### Public API (🔌)

#### `initNavPreferences()`

The bootstrap coordinator. Retrieves stored preferences (Layout, Collapse state, Scanlines) and applies them immediately to the DOM to prevent layout jumping during initialization.

#### `applyNavLayout(layout)`

The orientation engine. Supports three primary positions: `left`, `right`, and `top`. It normalizes layout strings and applies the corresponding `admin-layout--{type}` class to the `#adminDashboard` shell.

#### `setNavCollapsed(collapsed)`

Manages the sidebar's reduced footprint. It toggles the `.nav-collapsed` class and ensures that ARIA attributes reflect the correct interactive state for screen readers.

#### `toggleSettingsPanel()`

Orchestrates the visibility of the primary settings overlay.

### Internal Logic (🔒)

#### "Retro" Filter Management

Controls the global `admin-scanlines-off` class, allowing users to toggle the atmospheric CRT-style scanline overlay defined in the CSS system.

#### Collapsed Drawer Safety

Ensures structural integrity by automatically closing floating utility panels (like Settings or Inner-Net panels) whenever the sidebar is collapsed into its reduced state.

#### Defensive Persistence (`readStorage` / `writeStorage`)

Provides a safe, exception-guarded interface for `localStorage`. This ensures the Admin UI remains functional even in strictly locked or private browsing environments where storage might be restricted.

### DOM Dependencies

- `el.adminDashboard`: Receives the layout and collapse classes.
- `el.adminNav`: The target for orientation and collapse transitions.
- `el.navLayoutSelect`: Synchronized with the active layout state.

## 💾 Global State (state.js)

The `state.js` module acts as the "Working Memory" and constants registry for the entire administrative suite. It centralizes all application state and logical constants to ensure consistency across managers.

### 1. The State Object (`state`)

A single, global object (`state`) that tracks the current runtime data.

- **Entity Buckets**: Stores primary data arrays like `seriesIndex`, `entries`, `posts`, and `mediaItems`.
- **Workflow Buffers**: Manages ephemeral state for active operations, such as the `previewState`, `uploadQueue`, and `selectedFiles`.
- **Integrity Management**: Tracks the `hasUnsavedChanges` flag used to trigger the "Discard Changes" safety prompts.

### 2. Configuration & Constants

Standardizes all system-wide strings to prevent logical drift.

- **Analytics Endpoints**: Centralized list of all `/api/admin/analytics/...` routes.
- **Storage Keys**: Defines every `localStorage` key used by the `nav.js` and `posts.js` modules (e.g., `SCANLINES_KEY`, `NAV_LAYOUT_KEY`).
- **Defaults**: Holds site-wide constants like the `DEFAULT_SERIES_ID`.

> [!NOTE]
> The `state` object is intended to be reactive; managers update properties directly or via mutation functions, and dependent UI components (like the "Unsaved" indicator) monitor these values to trigger updates.

## 🔐 Authentication (auth.js)

The `auth.js` module acts as the security firewall for the administrative suite, ensuring that all dashboards and data mutators are gated behind a verified `admin` role.

### Public API (🔌)

#### `checkSession(showDashboard)`

Executed during the initial `app.js` bootstrap.

- **Validation**: Fetches the current session and passes it to `isAdminUser()`.
- **Success Path**: If an admin role is confirmed, it triggers the callback to reveal the dashboard.
- **Fail Path**: Displays an error message and keeps the UI locked on the login screen.

#### `login(email, password, showDashboard)`

Orchestrates the credential submission to `/api/login`.

- **Security Logic**: Enforces `credentials: 'same-origin'` for secure cookie transport.
- **Role Gating**: Even if the password is correct, the module manually verifies the `admin` role in the response payload before allowing entry.

#### `logout()`

Cleans up the administrative environment.

1. **Server-side**: Posts to `/api/logout` to invalidate the session cookie.
2. **Client-side**: Resets the login form, clears error states, and toggles the UI visibility back to the login splash.

### Internal Helpers (🔒)

#### `isAdminUser(user)`

The core RBAC (Role-Based Access Control) logic. It normalizes the role string to lowercase and strictly matches against `'admin'`.

#### `setLoginError(message)`

Manages the visual state of the login feedback area. It handles the toggling of the `.error-message` class and visibility styles based on whether a message is provided.

#### `getSessionUser()`

An asynchronous wrapper around `/api/session` that retrieves the user object or returns `null` if the session is invalid or expired.

### DOM Dependencies

- `el.loginScreen` / `el.adminDashboard`: The primary visibility toggles for the SPA.
- `el.loginError`: The target for all authentication feedback messages.
- `el.loginEmail` / `el.loginPassword`: Targeted during logout for secure field clearing.

## 🦋 Bluesky Integration (bluesky.js)

The `bluesky.js` module manages the social bridge between the Admin dashboard and the Bluesky network, facilitating automated posting and notification monitoring.

### Public API (🔌)

#### `loadStatus()`

Fetches the current connection state from `/api/admin/bluesky/status`. It updates the global `cachedStatus` and toggles the connection button labels accordingly.

#### `submitCredentials()`

Handles the POST handshake to the `/api/admin/bluesky/connect` endpoint. It transmits the user's handle and App Password while managing the "Connecting..." UI state and error reporting.

#### `loadNotifications(limit)`

Retrieves a paginated list of social interactions from the Bluesky bridge.

### Internal Helpers (🔒)

#### `setStatusNote(message, isError)`

A specialized UI utility that updates the Bluesky panel's status text, automatically switching colors to `var(--danger)` if an error is detected.

#### `showCredentialsForm()` / `hideCredentialsForm()`

Manages the visibility of the sensitive login overlay. `hideCredentialsForm` also ensures that handle and password fields are cleared from the DOM for security.

### DOM Dependencies

- `el.btnBlueskyConnect` / `el.btnBlueskySubmit`: Primary action triggers.
- `el.blueskyCredentialsForm`: The floating modal for credential entry.
- `el.blueskyHandle` / `el.blueskyAppPassword`: Targeted for credential extraction and secure clearing.
- `el.blueskyStatusNote`: The main feedback channel for connection state.

## ⚙️ Administrative Config (config.js)

A minimal static configuration module used to centralize legacy storage keys and core endpoint paths.

### Public Constants (🔌)

- **`STORAGE_KEY`**: The primary key used for the legacy JSON-blob persistence in `localStorage`.
- **`API_ENDPOINT`**: The default destination for generic data-saving operations (`/api/save`).
- **`MEDIA_FILE`**: The hard-coded filename used for identifying the primary media registry (`media.json`).

### DOM Dependencies

- **None**: Pure constant registry.

## 🛠️ Universal Utilities (core.js)

The `core.js` module provides the shared infrastructure for data persistence and HTML security used across all administrative sub-panels.

### Public API (🔌)

#### `saveToServer(filename, content)`

The primary bridge for DB-backed persistence. It transmits data to the `/api/save` endpoint.

- **Error Context**: Specifically intercepts 403 Forbidden errors to provide contextual advice (e.g., prompting the admin to verify their comment-system login).

#### `sanitizeHtml(input)`

A high-security "Firewall" for rich-text HTML inputs.

- **Structural Scrubbing**: Recursively evaluates the input using a headless `DOMParser`. It strips all tags and attributes not explicitly included in the whitelist.
- **Hardened Links**: Automatically injects safety attributes (`target="_blank"`, `rel="noopener noreferrer"`) into all anchor tags to protect against tab-nabbing.
- **Image Validation**: Strips any images missing a valid `src` protocol.

#### `showError(message)` / `showSuccess(message)`

Standardized UI feedback helpers. Currently implemented as native `alert()` fallbacks to ensure functional UX even if custom toast/banner systems are detached.

### Internal Logic (🔒)

- **`cleanUrl(url)`**: A string utility that identifies and blocks potentially malicious protocols like `javascript:`.
- **`sanitizeNode(node)`**: The recursive engine that drives the whitelist enforcement across the DOM tree.

### DOM Dependencies

- **None**: Operates purely on string inputs and headless DOM fragments.

## 📈 Dashboard Manager (dashboard.js)

The `dashboard.js` module is the "Information Aggregator" of the Admin Suite. It synthesizes real-time metrics and activity feeds from across the entire ecosystem into a unified landing page.

### Public API (🔌)

#### `refreshDashboard({ showLoading, skipPosts })`

The primary data lifecycle engine. It uses `Promise.allSettled` to fetch data from 8 different endpoints in parallel (Comments, Users, Analytics, Bluesky, Todos, etc.), ensuring the dashboard remains functional even if a specific sub-service is down.

#### `showDashboardSection()`

The routing entry point that reveals the dashboard surface and updates the navigation state.

### Internal Logic (🔒)

#### Activity Aggregator (`renderNotifications`)

Orchestrates the "Universal Feed."

- **Multi-Source Merge**: Combines scheduled posts, recent comments, new user registrations, and Bluesky notifications into a single, chronologically sorted list.
- **Tone Mapping**: Assigns semantic styling (`success`, `warn`, `danger`, `accent`) to feed items based on their status (e.g., mapping hidden comments to the `danger` tone).

#### Metrics Engine

- **`updateMetrics()`**: Distills raw arrays into high-level summary strings (e.g., "Next: [Date]").
- **`renderWeeklyDigest()`**: Specifically handles the comparison logic for reader engagement, rendering up/down "Change Indicator" arrows for week-over-week performance.

#### Todo Lifecycle

- **`addTodo()` / `deleteTodo()`**: Manages the persistence and UI state for the administrative task list, using the common `setTodoStatus` helper for feedback.

### DOM Dependencies

- **Stat Cards**: `el.dashViews24h`, `el.dashEntryReads`, `el.dashUserCount`, etc.
- **Activity Lists**: `el.dashNotifications`, `el.dashScheduleList`, `el.dashTodoList`.
- **Digest Panel**: `el.weeklyDigestCard` and its associated change-indicator slots.
- **Controls**: `el.dashTodoInput`, `el.btnDashTodoAdd`, `el.btnDashboardRefresh`.

## 🎨 Designer Canvas (designer.html)

A legacy bridge document that redirects older `designer.html` entry points into the integrated admin builder.

### Communication Interface (🔌)

#### Query Params

Accepts legacy `series` and optional `page` params, then redirects to the canonical route:

`admin/index.html?view=designer&series=<id>&page=<slug>&surface=header`

### Internal Orchestration (🔒)

#### Redirect Bridge

- Sanitizes legacy query params before redirecting.
- Uses top-level navigation when embedded so old iframe-style links escape into the main admin shell.

### DOM Structure

- Minimal status card plus a fallback link to the integrated builder.

## 🌉 Designer Orchestrator (designer.js)

Legacy iframe host logic for the old standalone designer. It is no longer part of the active admin routing path.

### Public API (🔌)

- Deprecated. The admin shell now routes Page Designer entry directly into `page-builder.js`.

### Internal Logic (🔒)

- Retained only for historical reference until the file is removed in a later cleanup pass.

### DOM Dependencies

- None in the active shell path.

## 🩺 Diagnostics Data (diagnostics-data.js)

The `diagnostics-data.js` module serves as the data translation layer for system health reporting. It is responsible for aggregating raw backend metrics into a structured "Diagnostic Snapshot."

### Public API (🔌)

#### `getDiagnosticsSnapshot(fetcher)`

The primary data retriever. It attempts a single high-performance fetch from the modern `/snapshot` endpoint. If unavailable, it orchestrates the legacy fallback sequence.

#### `refreshDiagnosticsSnapshot(fetcher)`

Triggers a server-side recalculation of system health metrics before retrieving the fresh snapshot.

### Internal Orchestration (🔒)

#### The Legacy Fallback (`buildLegacySnapshot`)

A defensive engineering pattern used when the centralized snapshot API is missing.

- **Parallel Aggregation**: Executes 7 distinct API calls (Health, DB-Stats, DB-Overview, Deploy, Backups, Service, Tests) in parallel using `Promise.allSettled`.
- **Schema Normalization**: Explicitly transforms diverse backend formats into the **V1 Diagnostic Schema**, ensuring the UI doesn't have to handle multiple data formats.

#### Structural Normalizers

- **`normalizeLegacyBackups`**: Classifies disparate backup files into `database` vs `filesystem` categories based on filename heuristics and calculates "Pretty" size strings.
- **`mergeStatuses(...values)`**: A pure logic helper that determines the overall system health (e.g., if any sub-system is `error`, the entire snapshot is marked as `error`).

### DOM Dependencies

- **None**: This is a pure data-processing module.

## 🩺 Diagnostics Manager (diagnostics.js)

The `diagnostics.js` module is the View Manager for the system health dashboard. It orchestrates the rendering of the diagnostic snapshot into specialized functional panels.

### Public API (🔌)

#### `initDiagnostics()`

The bootstrapping entry point for the diagnostics section. It binds the refresh controls and triggers the initial `loadSnapshot`.

#### `refreshSnapshot()`

Directly invokes the recalculation of system health and provides high-visibility UI feedback via the `showRefreshIndicator` animation and button disabling.

### Internal Logic (🔒)

#### Staleness Validation (`ageLabel`)

A frontend-exclusive health check. It calculates the delta between `Date.now()` and the snapshot's `generatedAt` timestamp. Any snapshot older than 90 minutes is automatically flagged as "stale," triggering a warning banner regardless of the backend's reported status.

#### Defensive View Rendering

- **`renderDatabase`**: Performs complex flattening of user role counts, Alembic version metadata, and active connection metrics into a consolidated "Database Health" grid and table.
- **`renderBanner`**: The "Global Health Card." It normalizes the overall system status into a color-coded banner (`ok`, `warning`, `error`).

### DOM Dependencies

- **Display Slots**: `diagnosticsHealth`, `diagnosticsServices`, `diagnosticsDatabase`, `diagnosticsDeploy`, `diagnosticsBackups`.
- **Feedback Surface**: `diagnosticsBanner`, `diagnosticsSnapshotTime`.
- **Controls**: `diagnostics-refresh`, `diagnostics-refresh-indicator`.

## 📚 Entry Manager (entries.js)

The heaviest orchestrator in the Admin suite. It manages the entire lifecycle of comic entries (Chapters), from their physical folder paths on disk to their metadata, ordering, and social scheduling.

### Public API (🔌)

#### `loadEntries()` / `saveEntries()`

The dual-pass persistence engine. It attempts to load from `data.json` (DB) before falling back to `localStorage` (Drafts). Saving always performs an atomic update to both the persistent store and the local cache.

#### `editEntry(entryName)`

The form controller. It populates the entry editor with current metadata—handling complex transformations for date-local inputs and visibility toggles—and reveals the edit workspace.

#### `syncEntryPagesFromFolder(entryName)`

The "Self-Healing" utility. It scans the physical disk at the entry's `chapterFolder` and rebuilds the `currentPages` array based on alphabetical file presence.

### Internal Logic (🔒)

#### The Tactile Reorder Engine

A custom-built drag/scroll workspace for reordering pages:

- **Caret Logic**: `setCaretForward` and `queueCaretForward` manage a visual insertion indicator that responds to both mouse-drag and high-precision scroll wheel events.
- **Snap-to-Gutter**: `snapToNearestGutter` calculates the sub-pixel "Insertion Point" between pages, providing a "magnetic" feel to the reorder workspace.

#### Path Internalization

The module uses `inferFolderFromPages` and `replaceRootPrefix` to bridge the gap between static path strings and the application's dynamic `protected/` logic for premium content.

### DOM Dependencies

- **Entry Workspace**: `entryList`, `entryEditSection`, `entryStatus`, `entryAutoPost`.
- **Reorder Suite**: `pageReorderShell`, `pageList`, `insertCaret`, `pagePreviewImg`.
- **Navigation Controls**: `btnInsertPage`, `btnDeletePage`, `btnMoveMode`.

## 🖼️ Image Picker Service (image-picker.js)

A standalone "Service Component" that provides a high-fidelity modal for asset selection, uploading, and focal-point editing. It is decoupled from the main Admin SPA and generates its own ephemeral UI.

### Public API (🔌)

#### `openImagePicker(options)`

The primary async entry point. It returns nothing directly; instead, it orchestrates the UI lifecycle and invokes the provided `onApply` callback with a finalized `item` and `focal` metadata object.

- **Options**: Supports `allowUpload`, `allowCrop`, `cropRatio`, and `initialSelection`.

### Internal Logic (🔒)

#### The Focal Engine (`setFocus`)

The mathematical heart of the picker. It manages a 4-property state object (`fit`, `x`, `y`, `zoom`) and synchronizes three distinct UI layers:

1. **Preview Fragment**: Updates `object-position` and `transform: scale()` on the preview image.
2. **Metadata Sliders**: Syncs the numeric value and percentage labels for X/Y coordinates.
3. **Interactive Overlays**: Repositions the `ip-focus-dot` and `ip-crop-box` relative to the image's "Natural vs Rendered" aspect ratio.

#### Pointer Interaction

- **Direct Selection**: Implements `updateFocusFromPointer` to allow users to click directly on the image to set the focal point.
- **Drag-to-Move**: Supports a full pointer-event lifecycle on the `cropBox`, allowing for intuitive repositioning of the visible area.

#### Integration Logic

The picker is "Fetcher-Agnostic." It requires an external `getItems()` promise and `uploadHandler` function, allowing it to be reused across different series or storage providers.

### DOM Structure (Ephemeral)

- `.ip-modal`: The root container injected into `document.body`.
- `.ip-list-pane`: The scrollable asset gallery.
- `.ip-editor-pane`: The preview and coordinate control workspace.

## 🏛️ Master Shell (index.html)

The physical blueprint for the administrative ecosystem. It defines the Single Page Application (SPA) structure, the security firewall, and the mounting points for all functional modules.

### Structural Architecture (🔌)

#### The Auth Firewall (`#loginScreen`)

A top-level viewport that gates access to the dashboard. It remains active until `auth.js` verifies the session, at which point it is hidden to reveal the `#adminDashboard`.

#### Functional Viewports (`section.section`)

A vertical stack of semantic containers. The SPA router in `app.js` manages visibility by toggling the `display` property on these sections (e.g., `#chaptersSection`, `#analyticsSection`).

### Principal Components (🔒)

#### Navigation Rail (`#adminNav`)

A persistent sidebar that houses the global navigation triggers.

- **Dynamic Orientation**: Supports `admin-layout--left`, `admin-layout--right`, and `admin-layout--top` classes for user-defined layout preferences.
- **Status Indicators**: Contains placeholders for real-time notifications (e.g., `.dashboard-pill`).

#### Workspace Panels

- **Dashboard**: Defines the metric-card grid and the multi-source activity feed surface.
- **Entry Workspace**: Houses the label-based tab system and the "Entries" table mounting point.
- **Moderation Workspace**: Defines the structured forms for Banned IP management and user role assignment.

### Asset Dependencies

- **CSS Stack**: `admin.css` (Core), `diagnostics.css` (Health), and `main.core.18-page-builder.css` (V3 Builder).
- **Fonts**: Righteous and Bebas Neue via Google Fonts.
- **Registry**: Every `id` attribute in this file serves as a binding point for the `dom.js` registry.

## 🖼️ Media Manager (media.js)

The specialized orchestrator for the site's asset library and branding configuration. It manages the physical organization of files and their integration into site-wide metadata stores.

### Public API (🔌)

#### `loadMedia()` / `saveMedia()`

Manages the `media.json` database. Loading includes a mandatory `syncMediaFromDisk` pass to ensure the database accurately reflects the physical files on the server.

#### `showMediaSection()`

reveals the media workspace and initializes the **Branding Monitor**, which tracks the site's active Favicon and Open Graph configurations.

#### `assignPreviewBranding(key)`

A high-privilege mutator that takes the currently selected media item and persists its path to the site's global `page-config.json` as either the `ogImagePath` or `faviconPath`.

### Internal Logic (🔒)

#### Access Hardening (`moveMediaPath`)

The logic engine for premium content safety. It physically migrates files between the public root and the `protected/` filesystem when their access level is toggled in the UI, ensuring that only authenticated users can browse premium assets via the `/api/protected/` proxy.

#### Usage Scanning (`getUsageMap`)

A relational integrity tool. It scans the `posts` state to identify every active reference to a media item. This map is used to render "Unused" badges and provides a safety warning before asset deletion.

#### The Skim-Navigation Deck

Implements specialized keyboard listeners (`ArrowLeft`, `ArrowRight`, `Escape`) that activate when the preview pane is open, allowing for rapid-fire asset inspection and tag editing.

### DOM Dependencies

- **Gallery Layout**: `mediaList`, `mediaGallery`, `mediaSearch`, `mediaSort`.
- **Branding Workspace**: `mediaBrandingOgPreview`, `mediaBrandingFaviconPreview`, `mediaBrandingStatus`.
- **Preview Pane**: `mediaPreview`, `mediaPreviewImg`, `mediaPreviewAccess`, `mediaPreviewSetOg`.

## 🛠️ Page Builder Root (page-builder.js)

The "Orchestrator" for the V3 Modular Builder. It serves as a centralized state machine that federates data and events between the data layer and the three primary UI sub-systems (Sidebar, Canvas, Editor).

### Public API (🔌)

#### `loadPages()` / `refreshCanvas()`

The primary data-to-visual bridge. `loadPages` hydrates the builder's state from the server, while `refreshCanvas` triggers a clean render pass across the interactive workspace.

#### `showSection()`

The entry point from the main Admin shell. It resets the builder's internal state (clearing dirty flags and selection markers) and mounts the builder's responsive shell.

### Internal Logic (🔒)

#### Federated State Binding

Initializes three specialized controllers to handle builder sub-tasks:

1. **Sidebar Panel**: Managed via `createSidebarPanel` (Page management).
2. **Canvas Binder**: Managed via `createCanvasEventBinder` (Drag-and-drop & Layout).
3. **Editor Renderer**: Managed via `createEditorPanelRenderer` (Property editing).

#### Responsive Workspace Solver

Calculates the physical layout of the builder using `getEffectiveEditorMode`. It dynamically switches between `docked`, `overlay`, and `collapsed` modes based on viewport breakpoints and user preferences stored in `localStorage`.

#### Transactional Safety (`dirtyScope`)

Implements a strict "Dirty-Checking" system. The `ensureCleanWorkspace` function blocks navigation if unpersisted changes exist in the `theme`, `header`, `module`, or `section` drafts, forcing a "Save or Discard" decision to protect authoring data.

### DOM Dependencies

- **Builder Shell**: `.page-builder-layout` and its associated data-attributes (`data-editor-mode`, `data-viewport-band`).
- **Control Registry**: `pbToggleEditor`, `pbToggleSidebar`, `pbSaveDraft`, `pbPublish`.

## ⚙️ Configuration DAL (page-config.js)

The specialized Data Access Layer (DAL) for JSON configurations. It manages the loading, normalization, and persistence of the `page-config.json` files used by the site branding system and V3 Page Builder.

### Public API (🔌)

#### `loadSeriesPageConfig(seriesId)`

The series-aware loader. It resolves the specific path for the requested series and hydrates the global `state.pageConfig` object.

#### `updateDefaultPageConfig(updater)`

Implements an atomic "Read-Modify-Write" pattern. It accepts a transformation function that receives a clean clone of the current config, applies changes, and then triggers a server-side save.

#### `getPageConfigSite(config)`

A utility for extracting the `site` metadata object (branding, SEO, favicons) with safe null-checks and type normalization.

### Internal Logic (🔒)

#### The Immutability Firewall (`cloneConfig`)

A defensive utility that enforces a "Pass-by-Value" architecture. To prevent accidental state corruption, all configuration objects are deep-cloned before being returned to callers, ensuring that managers work on isolated drafts.

#### Multi-Series Path Resolution

Implements `getAdminPageConfigPath` to map Series IDs to their respective storage locations. This facilitates sandboxed configurations for different comic issues and standalone landing pages within the same administrative shell.

### DOM Dependencies

- **None**. This is a headless data utility designed to be called by Manager modules.

## 📝 Posts Manager (posts.js)

The orchestrator for the site's blog feed and social broadcasting lifecycle. It manages the creation of "Updates" and coordinates their transmission to social networks.

### Public API (🔌)

#### `loadPosts()` / `savePost()`

The primary persistence interface. `savePost` handles the "Heavy Lifting" of blog publishing—optionally performing image uploads, updating the media library, and triggering social-media broadcasts—before committing the post to the DB.

#### `loadLocalDraft()`

The safety-net utility. It automatically recovers un-saved work from `localStorage` upon module initialization, ensuring that authors do not lose progress during browser crashes or session timeouts.

### Internal Logic (🔒)

#### Bluesky Character Guard

A specialized validation engine that prepares content for social broadcast:

1. **HTML Stripping**: Uses `stripHtmlToText` to calculate the character footprint of the final text.
2. **Budget Enforcement**: Disables the publishing pipeline if the content exceeds the 300-character limit.

#### Focal Translation (`parseFocus`)

The coordinate normalization engine. It translates semantic strings (e.g., "top left") or raw percentages into a strict `$0-100%` numeric format, ensuring feed thumbnails are cropped exactly as intended by the administrator.

#### Form Automation

Manages the complexity of the post editor, including rich-text toolbar binding and the "Scheduled" status transition (automatically switching from `published` to `scheduled` if the date is in the future).

### DOM Dependencies

- **Editor Workspace**: `postTitle`, `postContent`, `postImage`, `postPublishAt`.
- **Feedback UI**: `blueskyCharCounter`, `postStatus`.
- **Triggers**: `btnSavePost`, `btnSaveDraft`, `btnMediaPicker`.

## 🎨 Admin Design System (admin.css)

The "Visual Foundation" of the Admin SPA. It orchestrates the "Cyberpunk/V3" aesthetic through a modular manifest and a centralized token registry in `admin.core.css`.

### Token Registry (🎨)

Defined in `:root`, providing the primary semantic palette:

- **Primary**: `#00d9ff` (Cyan) - Main UI controls and active states.
- **Secondary**: `#ff00ea` (Magenta) - Accents and error-ghosting.
- **Accent**: `#ffed00` (Yellow) - Warnings and high-priority labels.
- **Panels**: `#1a1a2e` (Navy) - Background for modals and editors.

### Key Systems (🔒)

#### Atmospheric Scanlines

Implements a fixed `body::before` overlay with a 4px repeating linear gradient. It is controlled via the `admin-scanlines-off` class, which allows the `nav.js` module to toggle the atmospheric filters site-wide.

#### Transactional Feedback (`.just-moved`)

A utility class used by logical managers to provide user feedback. It triggers a **`shimmy`** animation and neon-green shadow upon successful server writes (e.g., reordering an entry or saving a module).

#### Typography Hierarchy

Enforces the site identity via dual-font weighting:

1. **Righteous**: Used for forms, status messages, and technical copy.
2. **Bebas Neue**: reserved for high-impact headers and buttons, enhanced by the **`glitchText`** chromatic aberration animation.

### Files & Imports

- **Layout**: `admin.layout.css` (Grid shell) and `admin.responsive.css` (Mobile overlays).
- **Core Components**: `admin.entries.css`, `admin.media.css`, `admin.moderation.css`.
- **Ephemeral UI**: `admin.unsaved.css` (Dirty flags) and `admin.confirmation.css`.

## 🔍 Preview Manager (preview.js)

The "Data Integrity & Inspector" tool. It provides a visual sanity check for comic entries and a raw data inspection interface for the underlying JSON database.

### Public API (🔌)

#### `loadPreviewPayload()`

The diagnostic loader. It fetches a raw `data.json` snapshot from the server and renders it into a formatted inspection panel for manual audit of the logical site state.

#### `copyToClipboard()` / `downloadJSON()`

Manual audit utilities. These provide a one-click mechanism for administrators to download or copy the raw site database for offline verification or emergency backup.

#### `updatePreviewChapters()`

The synchronization engine. It reconciles the preview selector with the global `state.entries` map, ensuring that any structural changes made in the Entries module are immediately testable in the previewer.

### Internal Logic (🔒)

#### "Reader-Lite" Pager

Implements a simplified version of the site's comic reader. It manages index-based navigation (`renderPreviewImage`) through page lists, providing a visual confirmation of the database's logical sorting.

#### Path Resolution

The `renderPreviewImage` logic performs safe-path translation, resolving various image origins (relative chapter folders, root media, and absolute URLs) for display within the Admin frame.

### DOM Dependencies

- **Data Inspection**: `previewData` (preformatted JSON), `copySuccess`.
- **Visual Preview**: `previewFrame`, `previewImg`, `previewChapterSelect`, `previewPageLabel`.
- **Navigation**: `previewPrev`, `previewNext`, `btnPreview`.

## 📊 Diagnostics UI System (diagnostics.css)

The "High-Density Visualization" library. It provides the complex grid systems and semantic status indicators used by the Server Health and Database Audit dashboards.

### Status Matrix (🚦)

Defines the universal semantic color-mapping used site-wide:

- **OK**: Green (`#7dff8c`) - Background alpha 0.14.
- **Warning**: Amber (`#ffd166`) - Background alpha 0.14.
- **Error**: Red (`#ff8a8a`) - Background alpha 0.14.

### Key Components (🔒)

#### Multi-Scale Grid Architecture

Implements specialized layout patterns for high-density data:

1. **Stats Grid**: Square metric cards for top-level health summaries.
2. **DB Grid**: Interactive relational cards used for entry and file-audits.
3. **Deploy Grid**: A time-series layout for tracking server deployment history.

#### The Refresh Indicator

A high-priority `fixed` overlay (`refresh-indicator`) that tracks background API polling. It uses transitions on `opacity` and `transform` to provide real-time feedback during dashboard data refreshes.

#### Service Health Cards

Modular cards used in and the **Deployment Dashboard** (`service-card`). These cards use the **`service-status--ok|warn|error`** classes to provide real-time status feedback for individual microservices.

### File Dependencies

- **Integration**: Works in tandem with `diagnostics.js` and `diagnostics-data.js`.
- **Aesthetic**: Inherits from `admin.core.css` but implements its own high-density table and grid overrides.

## 📚 Series Manager (series.js)

The "Context Orchestrator" for the multi-series environment. It manages the switching of administrative contexts and the dynamic localization of the UI based on series metadata.

### Public API (🔌)

#### `switchSeries(seriesId)`

The master context-switcher. It swaps the active series ID, reloads the Entries and Config databases, and triggers a full UI relabeling pass via `applyUnitLabels`.

#### `applyUnitLabels()`

The UI localization engine. It dynamically re-titles buttons, headers, and labels across the entire Admin SPA based on the series' unit labels (e.g., transforming "Entries" into "Episodes").

#### `createNewSeries()` / `editActiveSeries()`

The lifecycle managers for series-level metadata. These handle the bootstrapping of new series-specific directories and JSON data stores on the server.

### Internal Logic (🔒)

#### Path Sandboxing

Implements logic like `getChaptersRoot` and `getChaptersSaveFilename` to ensure that data modifications remain strictly isolated to the active series' directory structure (e.g., `admin/series/10/data.json`).

#### "Last Active" Persistence

Uses `localStorage` to cache the current series context. Upon initialization, it automatically restores the last-used series, ensuring workflow continuity for administrators managing multiple projects.

#### Creation Bootstrapping

When creating a series, the module automatically clones the root `page-config.json` and initializes a blank `data.json` at the new series path, ensuring the Page Builder and Entries modules have a valid starting state.

### DOM Dependencies

- **Selection**: `seriesSelect`, `btnOpenSeries`.
- **Configuration Modal**: `seriesModal`, `seriesForm`, `seriesIdInput`, `seriesTitleInput`.
- **Labels**: `seriesUnitSingular`, `seriesUnitPlural`, `btnAddEntry`.

## 🛡️ Moderation Manager (moderation.js)

The "Safety Firewall" of the administrative suite. It manages user-generated content (comments), security blacklists (IP/User bans), and the dynamic rate-limiting policies that protect the API.

### Public API (🔌)

#### `refreshModeration()`

A multi-settled async orchestrator. It performs parallel fetches for Comments, Banned Users, IP Lists, Blocked Words, and Anti-Spam limits to refresh the moderation workspace.

#### `showModerationSection()`

Reveals the safety workspace and synchronizes the **Live Visitor** monitor to provide real-time context for active moderation sessions.

### Internal Logic (🔒)

#### Policy Mutator (`saveLimits`)

Manages the server-side anti-spam configuration. It sanitizes and persists high-stakes variables including `maxPerWindowIp` and `duplicateWindowSeconds`, allowing for live-tuning of the site's security posture during an attack.

#### Action Suite (`renderComments`)

Implements the high-speed moderation lifecycle. Every comment is injected with a context-aware action rig:

1. **Relational Linking**: `targetLabel` converts internal `targetType` codes into human-readable source labels (e.g., "Feed Post").
2. **Contextual Banning**: `banUserBtn` and `banIpBtn` provide one-click access to the safety database, automatically harvesting User IDs and IP addresses from the comment metadata.

#### Bulk Censorship Processor

Uses `splitPhrases` and `normalizePhrase` to ingest large blocklists. It handles the extraction of clean string targets from messy user input (commas/newlines/whitespace), ensuring the Censorship Engine remains performant.

### DOM Dependencies

- **Feeds**: `moderationCommentsList`, `moderationBannedUsersList`, `moderationBannedIpsList`.
- **Inputs**: `moderationSearch`, `moderationIpInput`, `moderationWordInput`.
- **Policy Control**: `moderationLimitMinInterval`, `moderationLimitMaxUser`, `moderationStatus`.

## 🦋 Social Manager (social.js)

The `social.js` module integrates Bluesky notification monitoring and profile statistics into the global dashboard.

### Public API (🔌)

#### `refreshBluesky()`
Fetches new notifications and updates profile follower deltas via `localStorage`.

#### `showSocialSection()`
Reveals the social panel and initializes the active tab.

### Internal Logic (🔒)
- **`renderBlueskyProfile`**: Normalizes profile data and calculates follower changes since the last cache.
- **`buildNotificationItem`**: Renders robust DOM elements for rich social notes (avatars, relative timestamps).

## ☁️ Upload Manager (uploads.js)

The `uploads.js` module orchestrates drag-and-drop mechanics and API file payload handling for Entry image uploads.

### Public API (🔌)

#### `initUploadHandlers()`
Binds drag-and-drop listeners on `uploadArea` and initializes the file selection callbacks.

### Internal Logic (🔒)
- **`handleFileSelect`**: Enforces strict `image/*` MIME filtering and a 10MB maximum file size limit.
- **`uploadImagesToServer`**: Packages valid imagery as Base64 strings, automatically ensuring a valid `entryFolder` exists using inference logic before sending the API POST.

## 👥 User Manager (users.js)

The `users.js` module handles user roles, newsletter subscriptions, and premium code generation.

### Public API (🔌)

#### `loadUsers()`
The master hydrator, orchestrating parallel fetches for Users List, Email Subscribers, and Premium Codes.

#### `generatePremiumCodes()`
A high-privilege mutator that generates batch access codes for marketing campaigns.

### Internal Logic (🔒)
- **Role Assignment**: Supports inline mutation between `user`, `premium`, and `admin` roles, secured by same-origin credentials.
- **Data Densification**: Combines opt-in dates, IP sources, and recent activity into dense table rows for rapid auditing.

## 🧰 Shared Utilities (utils.js)

A centralized set of stateless helpers used across the administrative SPA.

### Public API (🔌)

- **`escapeHtml`**: Security scrubber preventing XSS in dynamically populated fields.
- **`sortPagesByFilename`**: Numeric sorting for comic pages (e.g. `page10` comes after `page2`).
- **`inferFolderFromPages`**: Core pathing engine that derives the structural `chapterFolder` from analyzing the prefix of current pages, enabling the "Self-Healing" directory features.
- **`generateMediaId`**: Uses a deterministic FNV-1a hash to create stable identifiers from file paths.

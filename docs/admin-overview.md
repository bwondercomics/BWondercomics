# BWonderComics Admin Overview

This document covers the admin panel (content editor) architecture, data flow, and major features. Current code is being modularized; `admin/app.js` remains the primary entry point, with shared constants in `admin/config.js`, DOM references in `admin/dom.js`, and the page-builder workflow coordinated from `admin/page-builder.js`.

## Entry Point and Shared Modules

- `admin/app.js` — Main script; initializes the UI and wires up entries, posts, media, analytics, designer, and page-builder tools.
- `admin/config.js` — Constants: storage keys and API endpoints.
- `admin/dom.js` — Centralized DOM lookups for forms, buttons, lists, modals, and status elements.
- `admin/admin.css` — Extracted styles from `admin/index.html`; this remains the single admin stylesheet entrypoint and imports the section-level CSS files.
- `admin/page-builder.js` — Page-builder orchestrator for shared builder state, top-level routing/bootstrapping, and composition of the extracted builder managers.
- `admin/page-builder/` — Focused builder modules for inspector rendering, canvas rendering, canvas event binding, sidebar rendering, data access, theme editing, module editing, header normalization/editing, shared link editing, and module-type-specific editors.
- `admin/css/admin.page-builder.css` — Stable page-builder stylesheet facade imported by `admin/admin.css`.
- `admin/css/page-builder/` — Internal page-builder stylesheet split by ownership (`layout`, `sidebar`, `canvas`, `insertions`, `inspector`, `controls`, `theme`, `responsive`) so layout and inspector work can evolve without one monolithic CSS file.

## Feature Areas

- Auth/session: Uses the site's account system (`/api/login`, `/api/session`) and requires an `admin` role.
- Analytics: `admin/analytics.js` is the public analytics facade used by `admin/app.js`; analytics screen logic now lives under `admin/analytics/` with focused modules for traffic, reader analytics, reads-over-time, visitor history, live visitors, and shared formatters. The analytics UI is grouped into `Site Traffic`, `Visitor History`, and `Reader Engagement`.
- Entry management (issues/etc): Load/save entries; add/edit/delete; reconcile pages with disk via `/api/list-entry-images`; reorder pages (drag/drop and up/down); renumber flow with confirmation; keep local entry folders under the canonical `comics/<seriesId>/entries/<label-slug>/...` root; and move local pages into or out of `protected/` when effective premium access changes.
- Page ops: Add/remove pages; ensure entry folder creation via `/api/create-entry`; delete images via `/api/delete-image`; move/copy files with `/api/move-path` + `/api/copy-path`.
- Status message: Editable site-wide status stored with entry payload.
- Blog/updates: CRUD for posts via the DB-backed API (`/api/admin/posts`), with draft/scheduled/published and a “publish date/time” field.
- Media library: Load/save `/media.json` (DB-backed); search/filter by tags/path; sync with disk via `/api/list-media`; apply media to posts; tag propagation from posts; per-item access (`public`/`premium`/`private`) and premium visibility (`blur`/`hidden`). Premium/private items are stored under `protected/media/`. Post images may be copied to `media/post-assets/` automatically; that folder is derived and excluded from media sync. Blurred previews live at `media/previews/` and are excluded from the admin list; the preview panel shows both the original and public preview.
- Page builder: Structured page editing for landing/custom pages now opens as a full-page builder shell that hides the normal admin header/nav while active. A top toolbar owns page status/actions, Add Page, live/structure mode, exact Desktop / Tablet / Phone device controls, Save Draft, Publish, side-panel visibility, and Exit. A single side panel owns Pages, Modules, Layers, Settings, and Styles; module fields, theme controls, section settings, page-header settings, and page metadata settings still use explicit local drafts with `Save`/`Discard`, while structural actions such as add, move, reorder, and delete remain immediate. The live same-origin iframe preview is the default canvas and loads `/index.html?...&builderPreview=1&previewSession=...` with viewport presets backed by the builder preview contract (1280x900 / 768x1024 / 375x812). The old structural canvas is retained as **Structure Debug** until later direct-canvas phases land.
- Builder module layout: the inspector shell lives in `admin/page-builder/editor-panel.js`, snapshot-driven canvas markup lives in `admin/page-builder/canvas-renderer.js`, canvas rebinding lives in `admin/page-builder/canvas-events.js`, and page/module rail rendering lives in `admin/page-builder/sidebar-panel.js`. The recent refactor also split draft lifecycle into `draft-manager.js`, structural section/module mutations into `canvas-mutations.js`, page lifecycle actions into `page-actions.js`, iframe preview synchronization into `preview-manager.js`, and responsive shell math into `layout.js`. **Shared module HTML output still lives in `admin/page-builder/shared-renderers.js`** via a `createRenderers(options)` factory consumed by both the public reader (`reader/page-renderer.js`) and builder-owned render paths.
- Page header editing: the header is edited from the canvas itself. Clicking the header preview opens plain-language sections for `Header Copy`, `Navigation Buttons`, `Header Parts`, and `Placement`; the old shared-header tab model is no longer the primary workflow.
- Structured module editing: `gallery`, `video`, `divider`, and `entry-gallery` now use dedicated editors instead of JSON-only fallback controls. The gallery editor uses the same asset picker flow as promo, social, and theme editing, including asset browsing/upload and draft updates through the shared picker contract. The generic raw JSON `Advanced` card is now limited to modules that still round-trip through the generic draft binder; dedicated-binder modules such as `promo`, `social`, and `buttons` no longer advertise a raw fallback they do not save.
- Internal builder-page links: header buttons and `buttons` modules can target another builder page in the active series, a URL, or an anchor target.
- Preview/export: Entry preview image navigation; JSON export/copy; share data assembly.
- UI: Modals for entry edit and renumber confirmation; indicators for unsaved changes; smooth scroll to sections.
- Series settings: Each series can set its own singular/plural label (e.g., `Issue/Issues`, `Chapter/Chapters`) stored in the DB and served at `admin/series.json`. Series-level `premiumOnly` saves now run the same entry access-path sync as entry saves before `admin/series.json` is persisted, so folder moves happen before the metadata write.

## Data Paths and Persistence

- Reads: `/admin/data.json`/`/admin/series/<id>/data.json` (DB-backed JSON views for entries + folders + status), `/media.json` (DB-backed), `/api/admin/pages?series_id=<id>`, `/api/admin/pages/<page_id>`, `/api/admin/pages/home/<id>` for effective homepage/draft preview resolution, and `/api/admin/assets`; image paths under `comics/<seriesId>/entries/` or `protected/comics/<seriesId>/entries/`.
- Writes (server):
  - Entries (DB): `/api/save` for `admin/data.json` and `admin/series/<id>/data.json` writes to Postgres (no disk write).
  - Series index (DB): `/api/save` for `admin/series.json` writes to Postgres (no disk write).
  - Media (DB): `/api/save` for `media.json`
  - Posts (DB): `/api/admin/posts` (create/update/delete)
  - Page builder (DB): `/api/admin/pages`, `/api/admin/pages/<page_id>`, `/api/admin/pages/<page_id>/sections`, `/api/admin/pages/<page_id>/sections/reorder`, `/api/admin/sections/<section_id>`, `/api/admin/sections/<section_id>/modules`, `/api/admin/sections/<section_id>/modules/reorder`, `/api/admin/modules/<module_id>`, `/api/admin/modules/<module_id>/move`
  - Page-builder assets: `/api/admin/assets`, `/api/admin/assets/upload`
  - Files/folders: `/api/create-entry`, `/api/delete-image`, `/api/list-entry-images`, `/api/list-media`, `/api/move-path`, `/api/copy-path`
- Local cache: `localStorage` (`STORAGE_KEY`) for draft entries/status, plus page-builder UI preferences such as `pb-editor-mode` and `pb-sidebar-mode`.
- Access-path validation: local entry image paths are expected to stay under `comics/<seriesId>/entries/...` for public content or `protected/comics/<seriesId>/entries/...` for premium content. `apply_series_data_save(...)` now rejects mismatched local folder/page paths before writing to the DB, while remote URLs and absolute paths are ignored by that validator.
- Header persistence: normal header saves write canonical `page.meta.header.version = 3` on the page record and clear `meta.headerOverrides`. Normal page-builder header editing no longer loads series `page-config.json`; V3 headers resolve with `pageConfig: null`, while legacy page-config/header-module data remains available for migration, backfill, and audit review. Bulk migration is available through `python -m backend.app.backfill_page_headers --series <series-id> [--write]`, which dry-runs by default and writes effective legacy header state into page meta when enabled. That backfill now preserves sanitized shell-level `appearance` plus per-nav-item `appearance`, and its additive `pageReports` output makes dry-run review explicit per changed page. `auditPagesFallbacks(fullSeriesPages)` remains the documented gate used to retire the reader’s legacy startup path, and it tracks runtime-fallback blockers (`missingHeader`, `staleHeaderVersion`, `headerOverrides`) plus the published `reader` page requirement; inert legacy `header` modules are later cleanup, not a runtime-removal blocker once V3 header meta exists. For operational checks, use `loadFallbackRetirementGate(seriesId, deps)` or an equivalent full-detail loader instead of raw `fetchPages(...)` summaries, because the audit needs hydrated `sections`/`modules` data to prove the `legacyHeaderModule` bucket is actually clean.
- Reader-homepage resolution: the public reader root now has a dedicated effective-homepage endpoint at `/api/pages/home/<seriesId>`, while admin draft preview uses `/api/admin/pages/home/<seriesId>`. Both currently resolve the page marked homepage first and fall back to the series `reader` page when no homepage record matches the visibility rules.
- Builder preview contract: `admin/page-builder/preview-contract.js` defines the preview viewport registry, snapshot version, source labels, side-effect policy, explicit responsive media-query map, and the full `postMessage` message-type registry (`REQUEST_SNAPSHOT`, `SNAPSHOT`, `ACK`, `ERROR`, `METRICS`) that the iframe preview bridge uses. The builder marks preview output as `saved` when it reflects the hydrated API page and `working` when an active dirty draft is merged into a cloned page snapshot for preview. Key helpers exported from the contract now cover both snapshot and metrics traffic: `buildPreviewSnapshotMessage(...)`, `buildPreviewControlMessage(...)`, `buildPreviewMetricsMessage(...)`, `validatePreviewEnvelope(...)`, `validatePreviewSnapshotPayload(...)`, `validatePreviewMetricsPayload(...)`, and `isPreviewMessageType(...)`.

## Runtime Flow (High Level)

1. `init` attaches handlers, upload handlers, checks session; shows login or dashboard.
2. Dashboard load: fetch entries → render list; fetch posts → render; fetch media → sync with disk → render; fetch page-builder pages on demand.
3. User actions: entry CRUD/reorder, posts CRUD, media CRUD/sync, page-builder editing, previews, exports.
4. Persistence: localStorage draft save on entry updates; server saves (DB + disk) on explicit actions.

## Visual Flow (Admin)

```mermaid
flowchart TD
  A[init] --> B{session authenticated?}
  B -- no --> C[show login]
  B -- yes --> D[load entries/posts/media]
  D --> E[render dashboard]
  E --> F{User action}
  F -->|entry CRUD/reorder| G[update entries + save draft/server]
  F -->|posts CRUD| H[call /api/admin/posts]
  F -->|media CRUD/sync| I[update media index (DB) + sync disk]
  F -->|page builder| J[load page + edit canvas + save or reorder]
  F -->|preview/export| K[render preview/copy/download]
```

### Entry Edit/Save Flow

```mermaid
flowchart LR
  X[Open edit modal] --> Y[reconcile pages with /api/list-entry-images]
  Y --> Z[render page list (drag/drop + up/down)]
  Z --> W{rename, relabel, or change premium access?}
  W -- yes --> M[canonicalize folder target and move via /api/move-path when needed]
  W -- no --> N[keep current folder target]
  M --> O
  N --> O[ensure entry folder via /api/create-entry]
  O --> P[save entries draft to localStorage]
  P --> Q[POST admin/data.json via /api/save]
  Q --> R[refresh entry list + clear unsaved]
```

## Page Builder Workflow

- Layout: the builder uses a full-page shell with a top toolbar, one collapsible side panel, a central live canvas viewport, and an admin-only overlay layer reserved for later canvas interactions. The side-panel collapsed/expanded choice persists in `localStorage`.
- Explicit-save editing: module forms, theme controls, and section settings edit local draft state first. The inspector footer shows `Save`/`Discard`, and the builder blocks tab switches, module switches, and page switches while a draft is dirty.
- Internal split: `admin/page-builder.js` now acts as a composition root rather than a single monolithic implementation. Rendering is snapshot-based, DOM listeners are rebound after each render from dedicated helper modules, and draft/page/preview/structural workflows are delegated to focused factories under `admin/page-builder/`.
- Page-header editing: the canvas renders a dedicated clickable header surface for the selected page. Header settings are page-scoped, save explicitly, and persist normalized header metadata (`version: 3`) with copy, regions, blocks, and nav items.
- Draft/publish clarity: the top toolbar keeps the page status visible at all times. When a page is unpublished, the page status copy warns that `Open Reader` is loading the draft preview route until the page is published.
- Immediate structure editing: sections and modules can be inserted inline at exact positions; module drag handles support reorder within a column or move across sections/columns; section drag handles reorder sections vertically.
- Header/link model: header buttons and `buttons` modules share the same normalized link target contract, so builder-page links, anchors, and external URLs behave consistently in admin and reader.
- Theme behavior: theme save persists color tokens, panel backgrounds, panel spacing, and empty-state metadata together. `Discard` restores the current page state, and `Reset to Default` rebuilds the full theme draft instead of only resetting colors.
- Canvas density: section headers stay compact by default, while spacing and secondary section controls live in a `Section Settings` drawer for the active section.
- Styling structure: page-builder CSS now stays behind the existing `admin.page-builder.css` import, but the actual rules live under `admin/css/page-builder/` so shell layout, canvas, inspector, shared controls, theme styling, and responsive behavior are maintained in separate files.
- Live canvas and Structure Debug: live mode is the default canvas and uses `admin/page-builder/preview-manager.js` plus `reader/preview-bridge.js` to render the real reader iframe with full reader-shell fidelity. The iframe URL carries `builderPreview=1`, `previewSession`, `page`, `pageId`, and optional `draft=1`; there is no separate `exact-preview` flag. The builder generates a versioned preview snapshot; when any module, theme, header, page-settings, or section draft is dirty, the active local draft is merged into a clone and the UI labels the frame `Previewing unsaved working changes`. When no draft is dirty, the UI labels the frame `Previewing saved draft`. The snapshot is sent to the iframe via `postMessage` after a `REQUEST_SNAPSHOT` handshake, validated on both sides by `preview-contract.js`, and applied inside the iframe through the normal `applyBuilderPageToDOM(...)` path with `previewMode: true`. The preview session is scoped to the active series/page identity; a new token is minted on identity change to prevent stale message acceptance. Desktop, Tablet, and Phone set exact iframe CSS pixel dimensions from `PREVIEW_VIEWPORTS` (`1280x900`, `768x1024`, `375x812`) on both `.pb-preview-frame` and `.pb-preview-iframe`, while `.pb-canvas[data-mode='preview']` handles scrolling instead of shrinking the viewport. The reader bridge posts validated `builder-preview:metrics` payloads back to the admin frame after snapshot application and resize renders; `preview-manager.js` stores those metrics on `.pb-preview-frame.dataset` and can show an admin-side debug overlay when `?previewDebug=1` or `localStorage.pb-preview-debug = "1"` is set. **Structure Debug** switches the canvas to the existing structural renderer for temporary module/section editing until later live-canvas selection phases are implemented.

## Near-Term Modularization Targets

- Split `admin/app.js` by concern: auth/session, chapters/pages, posts/blog, media library, preview/export, utilities.
- Centralize helpers (escape/tag parsing/sorting) into a small utilities module.
- Add happy-dom/Vitest coverage for core flows (entry reorder/save, post save, media sync mapping).

## Analytics Module Layout

- `admin/analytics.js` — Coordinator that preserves the stable `createAnalytics()` API used by the rest of admin.
- `admin/analytics/traffic.js` — Sitewide traffic summary, page reads, landing-entry panels, referrers, countries, browsers, devices, and top events by visitors.
- `admin/analytics/reader.js` — Health header, weekly digest, reader summary cards, ranked lists, and series-safe drilldowns using `entryKey`.
- `admin/analytics/reads-over-time.js` — Reads-over-time canvas chart and controls; per-entry mode accepts `entry_key`.
- `admin/analytics/visitor-history.js` — Searchable/sortable visitor history master-detail UI with path-first list rows and readable activity chips.
- `admin/analytics/live.js` — Live visitors polling, ticker, chart, and live-range controls; frontend now expects `activeCount` + `visitors`.
- `admin/analytics/shared.js` — Shared pure formatters and small helper utilities for analytics modules.

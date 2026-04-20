# BWonderComics Admin Overview

This document covers the admin panel (content editor) architecture, data flow, and major features. Current code is being modularized; `admin/app.js` remains the primary entry point, with shared constants in `admin/config.js`, DOM references in `admin/dom.js`, and the page-builder workflow coordinated from `admin/page-builder.js`.

## Entry Point and Shared Modules

- `admin/app.js` — Main script; initializes the UI and wires up entries, posts, media, analytics, designer, and page-builder tools.
- `admin/config.js` — Constants: storage keys and API endpoints.
- `admin/dom.js` — Centralized DOM lookups for forms, buttons, lists, modals, and status elements.
- `admin/admin.css` — Extracted styles from `admin/index.html`; this remains the single admin stylesheet entrypoint and imports the section-level CSS files.
- `admin/page-builder.js` — Page-builder orchestrator for shared builder state, data mutations, publish/save flows, and top-level bootstrapping.
- `admin/page-builder/` — Focused builder modules for inspector rendering, canvas rendering, canvas event binding, sidebar rendering, data access, theme editing, module editing, header normalization/editing, shared link editing, and module-type-specific editors.
- `admin/css/admin.page-builder.css` — Stable page-builder stylesheet facade imported by `admin/admin.css`.
- `admin/css/page-builder/` — Internal page-builder stylesheet split by ownership (`layout`, `sidebar`, `canvas`, `insertions`, `inspector`, `controls`, `theme`, `responsive`) so layout and inspector work can evolve without one monolithic CSS file.

## Feature Areas

- Auth/session: Uses the site's account system (`/api/login`, `/api/session`) and requires an `admin` role.
- Analytics: `admin/analytics.js` is the public analytics facade used by `admin/app.js`; analytics screen logic now lives under `admin/analytics/` with focused modules for traffic, reader analytics, reads-over-time, visitor history, live visitors, and shared formatters. The analytics UI is grouped into `Site Traffic`, `Visitor History`, and `Reader Engagement`.
- Entry management (issues/etc): Load/save entries; add/edit/delete; reconcile pages with disk via `/api/list-entry-images`; reorder pages (drag/drop and up/down); renumber flow with confirmation; premium/private handling moves pages into `protected/`.
- Page ops: Add/remove pages; ensure entry folder creation via `/api/create-entry`; delete images via `/api/delete-image`; move/copy files with `/api/move-path` + `/api/copy-path`.
- Status message: Editable site-wide status stored with entry payload.
- Blog/updates: CRUD for posts via the DB-backed API (`/api/admin/posts`), with draft/scheduled/published and a “publish date/time” field.
- Media library: Load/save `/media.json` (DB-backed); search/filter by tags/path; sync with disk via `/api/list-media`; apply media to posts; tag propagation from posts; per-item access (`public`/`premium`/`private`) and premium visibility (`blur`/`hidden`). Premium/private items are stored under `protected/media/`. Post images may be copied to `media/post-assets/` automatically; that folder is derived and excluded from media sync. Blurred previews live at `media/previews/` and are excluded from the admin list; the preview panel shows both the original and public preview.
- Page builder: Structured page editing for landing/custom pages, with a page list, canvas, module palette, and right-side inspector. Module fields, theme controls, section settings, page-header settings, and page metadata settings use explicit local drafts with `Save`/`Discard`, while structural actions such as add, move, reorder, and delete remain immediate. The canvas header shows page status (`Published`/`Draft`/`Homepage`), exposes a **Page Settings** entry point for slug/title/type/homepage edits, and makes it explicit when `Open Reader` is opening a draft preview. In normal builder mode, selecting or creating a page now lands on **Page Settings** by default; designer deep links still preserve explicit surfaces such as `header`. The builder toolbar includes an **Edit/Preview** mode toggle: Edit mode shows the structural canvas; Preview mode renders the page using the same shared rendering logic as the public reader, inside a constrained frame with **Desktop / Tablet / Mobile** width presets (1280 / 768 / 375 px).
- Builder module layout: the inspector shell now lives in `admin/page-builder/editor-panel.js`, snapshot-driven canvas markup lives in `admin/page-builder/canvas-renderer.js`, canvas rebinding lives in `admin/page-builder/canvas-events.js`, and page/module rail rendering lives in `admin/page-builder/sidebar-panel.js`. **Shared module HTML output lives in `admin/page-builder/shared-renderers.js`** via a `createRenderers(options)` factory consumed by both the public reader (`reader/page-renderer.js`) and the admin preview (`admin/page-builder/preview-renderers.js`). `admin/page-builder.js` coordinates those modules and owns the mutable builder state.
- Page header editing: the header is edited from the canvas itself. Clicking the header preview opens plain-language sections for `Header Copy`, `Navigation Buttons`, `Header Parts`, and `Placement`; the old shared-header tab model is no longer the primary workflow.
- Structured module editing: `gallery`, `video`, `divider`, and `entry-gallery` now use dedicated editors instead of JSON-only fallback controls. The gallery editor uses the same asset picker flow as promo, social, and theme editing, including asset browsing/upload and draft updates through the shared picker contract. The generic raw JSON `Advanced` card is now limited to modules that still round-trip through the generic draft binder; dedicated-binder modules such as `promo`, `social`, and `buttons` no longer advertise a raw fallback they do not save.
- Internal builder-page links: header buttons and `buttons` modules can target another builder page in the active series, a URL, or an anchor target.
- Preview/export: Entry preview image navigation; JSON export/copy; share data assembly.
- UI: Modals for entry edit and renumber confirmation; indicators for unsaved changes; smooth scroll to sections.
- Series settings: Each series can set its own singular/plural label (e.g., `Issue/Issues`, `Chapter/Chapters`) stored in the DB and served at `admin/series.json`.

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
- Header persistence: normal header saves write canonical `page.meta.header.version = 3` on the page record and clear `meta.headerOverrides`. Bulk migration is available through `python -m backend.app.backfill_page_headers --series <series-id> [--write]`, which dry-runs by default and writes effective legacy header state into page meta when enabled. `auditPagesFallbacks(fullSeriesPages)` remains the documented removal gate for the reader’s deprecated legacy path, and it now tracks runtime-fallback blockers (`missingHeader`, `staleHeaderVersion`, `headerOverrides`) plus the published `reader` page requirement; inert legacy `header` modules are later cleanup, not a runtime-removal blocker once V3 header meta exists.
- Reader-homepage resolution: the public reader root now has a dedicated effective-homepage endpoint at `/api/pages/home/<seriesId>`, while admin draft preview uses `/api/admin/pages/home/<seriesId>`. Both currently resolve the page marked homepage first and fall back to the series `reader` page when no homepage record matches the visibility rules.

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
  Z --> W{rename entry?}
  W -- yes --> M[remap folder mapping; delete old name]
  W -- no --> N[keep folder mapping]
  M --> O
  N --> O[ensure entry folder via /api/create-entry]
  O --> P[save entries draft to localStorage]
  P --> Q[POST admin/data.json via /api/save]
  Q --> R[refresh entry list + clear unsaved]
```

## Page Builder Workflow

- Layout: the builder uses a page rail, central canvas, and right inspector. On wide screens the left rail starts expanded and the inspector starts docked; both user choices persist in `localStorage`.
- Explicit-save editing: module forms, theme controls, and section settings edit local draft state first. The inspector footer shows `Save`/`Discard`, and the builder blocks tab switches, module switches, and page switches while a draft is dirty.
- Internal split: `admin/page-builder.js` now treats the canvas and sidebar as composed modules. Rendering is snapshot-based, while DOM listeners are rebound after each render from dedicated helper modules instead of being inlined into one giant function.
- Page-header editing: the canvas renders a dedicated clickable header surface for the selected page. Header settings are page-scoped, save explicitly, and persist normalized header metadata (`version: 3`) with copy, regions, blocks, and nav items.
- Draft/publish clarity: the canvas header keeps the page status visible at all times. When a page is unpublished, the header warns that `Open Reader` is loading the draft preview route until the page is published.
- Immediate structure editing: sections and modules can be inserted inline at exact positions; module drag handles support reorder within a column or move across sections/columns; section drag handles reorder sections vertically.
- Header/link model: header buttons and `buttons` modules share the same normalized link target contract, so builder-page links, anchors, and external URLs behave consistently in admin and reader.
- Theme behavior: theme save persists color tokens, panel backgrounds, panel spacing, and empty-state metadata together. `Discard` restores the current page state, and `Reset to Default` rebuilds the full theme draft instead of only resetting colors.
- Canvas density: section headers stay compact by default, while spacing and secondary section controls live in a `Section Settings` drawer for the active section.
- Styling structure: page-builder CSS now stays behind the existing `admin.page-builder.css` import, but the actual rules live under `admin/css/page-builder/` so shell layout, canvas, inspector, shared controls, theme styling, and responsive behavior are maintained in separate files.
- Preview mode: the canvas `data-mode` attribute switches between `edit` and `preview`. In preview mode the structural editing controls are hidden and the page is rendered using `renderPreviewPage()` from `admin/page-builder/preview-renderers.js` (which delegates to `shared-renderers.js`). The `.pb-preview-frame` container constrains the output width via a CSS `max-width` transition so switching Desktop → Tablet → Mobile requires no DOM re-render.

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

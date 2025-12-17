# BWonderComics Admin Overview

This document covers the admin panel (content editor) architecture, data flow, and major features. Current code is being modularized; `admin/app.js` remains the primary entry point, with shared constants in `admin/config.js` and DOM references in `admin/dom.js`.

## Entry Point and Shared Modules
- `admin/app.js` — Main script; initializes the UI and wires up chapters/posts/media/designer tools.
- `admin/config.js` — Constants: storage keys and API endpoints.
- `admin/dom.js` — Centralized DOM lookups for forms, buttons, lists, modals, and status elements.

## Feature Areas
- Auth/session: Uses the site's account system (`/api/login`, `/api/session`) and requires an `admin` role.
- Entry management (chapters/issues/etc): Load/save entries; add/edit/delete; reconcile pages with disk via `/api/list-images`; reorder pages (drag/drop and up/down); renumber flow with confirmation.
- Page ops: Add/remove pages; ensure chapter folder creation via `/api/create-chapter`; delete images via `/api/delete-image`.
- Status message: Editable site-wide status stored with chapters.
- Blog/updates: CRUD for posts via the DB-backed API (`/api/admin/posts`), with draft/scheduled/published and a “publish date/time” field.
- Media library: Load/save `media.json`; search/filter by tags/path; sync with disk via `/api/list-media`; apply media to posts; tag propagation from posts.
- Preview/export: Chapter preview image navigation; JSON export/copy; share data assembly.
- UI: Modals for entry edit and renumber confirmation; indicators for unsaved changes; smooth scroll to sections.
- Series settings: Each series can set its own singular/plural label (e.g., `Issue/Issues`, `Chapter/Chapters`) stored in `admin/series.json` and used across admin + reader UI.

## Data Paths and Persistence
- Reads: `admin/data.json`/`admin/series/<id>/data.json` (DB-backed JSON views for chapters + folders + status), `media.json`; image paths under `chapters/` and `comics/<seriesId>/chapters/`.
- Writes (server):
  - Chapters (DB): `/api/save` for `admin/data.json` and `admin/series/<id>/data.json` writes to Postgres (no disk write).
  - Series index (DB): `/api/save` for `admin/series.json` writes to Postgres (no disk write).
  - Media (disk): `/api/save` for `media.json`
  - Posts (DB): `/api/admin/posts` (create/update/delete)
  - Files/folders: `/api/create-chapter`, `/api/delete-image`, `/api/list-images`, `/api/list-media`
- Local cache: `localStorage` (`STORAGE_KEY`) for draft chapters/status.

## Runtime Flow (High Level)
1) `init` attaches handlers, upload handlers, checks session; shows login or dashboard.
2) Dashboard load: fetch chapters → render list; fetch posts → render; fetch media → sync with disk → render.
3) User actions: entry CRUD/reorder, posts CRUD, media CRUD/sync, previews, exports.
4) Persistence: localStorage draft save on entry updates; server saves (DB + disk) on explicit actions.

## Visual Flow (Admin)
```mermaid
flowchart TD
  A[init] --> B{session authenticated?}
  B -- no --> C[show login]
  B -- yes --> D[load chapters/posts/media]
  D --> E[render dashboard]
  E --> F{User action}
  F -->|chapter CRUD/reorder| G[update chapters + save draft/server]
  F -->|posts CRUD| H[call /api/admin/posts]
  F -->|media CRUD/sync| I[update media.json + sync disk]
  F -->|preview/export| J[render preview/copy/download]
```

### Chapter Edit/Save Flow
```mermaid
flowchart LR
  X[Open edit modal] --> Y[reconcile pages with /api/list-images]
  Y --> Z[render page list (drag/drop + up/down)]
  Z --> W{rename chapter?}
  W -- yes --> M[remap folder mapping; delete old name]
  W -- no --> N[keep folder mapping]
  M --> O
  N --> O[ensure chapter folder via /api/create-chapter]
  O --> P[save chapters draft to localStorage]
  P --> Q[POST admin/data.json via /api/save]
  Q --> R[refresh chapter list + clear unsaved]
```

## Near-Term Modularization Targets
- Split `admin/app.js` by concern: auth/session, chapters/pages, posts/blog, media library, preview/export, utilities.
- Centralize helpers (escape/tag parsing/sorting) into a small utilities module.
- Add happy-dom/Vitest coverage for core flows (chapter reorder/save, post save, media sync mapping).

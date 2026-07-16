# Docs Index - 0.8.5 Builder Customization and Refactor Lock

Last updated: 2026-07-16

Current release focus:

- `0.8.5` closes the builder customization roadmap, its authenticated responsive QA corrections,
  and the behavior-preserving builder refactor. That baseline is merged into `main` for the
  remaining `1.0.0` roadmap.
- The next recovery gate is
  `docs/BUILDER_PAGE_SNAPSHOT_AND_BACKUP_HARDENING_PLAN.md`: persisted builder-page history and
  admin restore, validated database/file backups on `/mnt/archive`, and an isolated restore drill
  before store implementation.
- The live builder canvas is the real reader route in a same-origin iframe with validated snapshots,
  target overlays, live drag/drop, chrome-collapsed Preview, device modes, guarded commands/keymaps,
  local draft undo/redo, and text-module inline editing.
- Page scopes are explicit: global pages are site-level, series pages stay attached to a series, and
  reader bindings remain same-series guarantees.
- CMS-backed modules (`reader`, `entry-gallery`, `feed`, `media-gallery`) and page templates are
  structured builder records with shared preview/public rendering.
- Reader-shell visibility is owned by the effective Comic Reader module. Custom pages can omit the
  reader; bound reader pages require exactly one active module and may place ordinary sections above
  or below it.
- Reader modules support paged and vertical-scroll display modes, structured controls/stage/panel
  settings, and safe responsive overrides.
- Sections support 1-6 structural columns, ratio-based layouts, per-column styling, responsive
  reflow, and stable global module ownership.
- Desktop/Tablet/Phone preview dimensions are exact iframe CSS pixels (`1920x1080`, `768x1024`,
  `375x812`), with admin-only scaling for full-HD Desktop.
- Panel visibility and reader-frame borders resolve on the real reader shells; reader controls and
  Feed layout support sparse Tablet/Phone overrides with API capability and round-trip checks.
- Shared builder/reader code now lives under `shared/page-builder/`, backend builder sanitization is
  split under `backend/app/builder_security/`, and JS/Python parity fixtures guard both contracts.

Recommended starting points:

- `docs/SYSTEM_OVERVIEW.md` - how the frontend, backend, admin, reader, diagnostics, and ops pieces fit together.
- `docs/ARCHITECTURE.md` - what runs where, including Caddy, FastAPI, static assets, analytics, and deployment boundaries.
- `docs/ROADMAP.md` - release checklist through `1.0.0`.
- `docs/READER_BUILDER_QA.md` - `0.8.5` reader + builder regression and merge-closeout worksheet.
- `docs/completed-builder-plans/README.md` - index of finished builder architecture, preview,
  customization, inspector, layout, consolidation, incremental-improvement, and refactor plans.
- `docs/BUILDER_PAGE_SNAPSHOT_AND_BACKUP_HARDENING_PLAN.md` - active prerequisite plan for
  builder-page recovery and tested database/file disaster recovery.
- `docs/BUILDER_STRIPE_STORE_PLAN.md` - follow-up plan for builder-authored one-time purchase store pages using Stripe-hosted Checkout.
- `docs/POLISH_BACKLOG_PLAN.md` - post-0.8.5 fixes and small features; items there do not reopen the
  completed builder roadmap unless explicitly promoted into a release gate.
- `docs/admin-overview.md` - admin panel and page-builder behavior.
- `docs/reader-overview.md` - reader runtime behavior and builder-page loading.
- `docs/API_REFERENCE.md` - backend route reference.
- `docs/OPERATIONS.md` - runbook, maintenance shortcuts, diagnostics, and ops workflow.
- `docs/TEST_DOCUMENTATION.md` - current frontend/backend test surfaces and quality gates.
- `docs/VITE_BUILD.md` - public build process and `dist/` verification expectations.
- `deploy/README.md` - server deployment guidance.

Supporting references:

- `docs/DEVELOPER_QUICK_REFERENCE.md` - short command and codebase reference.
- `docs/LLM_CONTEXT.md` - compact context for future codebase work.
- `docs/functions/` - focused function/module references for admin, reader, and page-builder areas.
- `docs/audit_step3_header_appearance.md` - audit notes for the completed header appearance pass.
- `docs/STOAT_SSO_PLAN.md` - Stoat/Revolt subdomain + OIDC SSO implementation plan.

Notes:

- The frontend is plain HTML/CSS/JS, but auth, comments, scheduling, RSS, uploads, page-builder persistence, diagnostics, ops, and analytics proxying require the backend in `backend/`.
- If a change affects the public reader runtime, public HTML, assets, or shared builder modules consumed by the reader bundle, rebuild `dist/` before browser verification.
- Older or legacy notes are in `docs/archive/`; do not use archived docs to guide current behavior.

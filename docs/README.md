# Docs Index - 0.8.0 Reader + Builder Appearance Lock

Last updated: 2026-04-26

Current release focus:

- `0.8.0` locks the reader-first and builder-first architecture that should carry into `1.0.0`.
- Page-scoped header editing is canonical and persists through `page.meta.header.version = 3`; legacy page-config/header-module behavior is fallback-only.
- Header navigation and `buttons` modules now share link and structured appearance contracts, with parity between the admin canvas/preview and the public reader.
- Use `docs/READER_BUILDER_QA.md` as the manual lock-pass worksheet before moving on to UX, ops, and final release hardening.

Recommended starting points:

- `docs/SYSTEM_OVERVIEW.md` - how the frontend, backend, admin, reader, diagnostics, and ops pieces fit together.
- `docs/ARCHITECTURE.md` - what runs where, including Caddy, FastAPI, static assets, analytics, and deployment boundaries.
- `docs/ROADMAP.md` - release checklist through `1.0.0`.
- `docs/READER_BUILDER_QA.md` - `0.8.0` manual QA worksheet for reader + page-builder lock.
- `docs/BUILDER_PLAN.md` - current page-builder architecture, shipped header workflow, appearance contract, and remaining builder risks.
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

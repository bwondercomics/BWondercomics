# BWonderComics 0.8.1 - Builder Preview Parity Lock

BWonderComics is a plain HTML/CSS/JS comic reader and admin panel built with Vite, backed by a FastAPI/Postgres service for dynamic site behavior: auth, comments, posts, RSS, uploads, premium access, DB-backed series and entries, the page builder, diagnostics, ops, and the analytics proxy.

## Current shape

- The reader is builder-first. It loads DB-backed series/entry JSON plus the canonical builder page from `/api/pages/home/<seriesId>` or `/api/pages/<seriesId>/<slug>`. Legacy `page-config.json` startup behavior is fallback-only and is no longer part of normal reader boot.
- The page builder owns per-series landing/custom pages, homepage selection, draft/publish state, page-scoped V3 headers in `page.meta.header`, theme/panel shell state, sections, and modules.
- Builder preview now renders through the real reader shell in a same-origin iframe. `admin/page-builder/preview-manager.js` coordinates the iframe and `reader/preview-bridge.js` applies validated snapshots inside `/index.html?...&builderPreview=1`.
- Desktop, Tablet, and Mobile preview presets use exact iframe viewport dimensions from the shared preview contract: `1280x900`, `768x1024`, and `375x812`.
- Preview snapshots, control messages, and responsive metrics are validated through `admin/page-builder/preview-contract.js`. Unsaved module, theme, header, page-settings, and section drafts are merged into cloned working snapshots for preview without mutating the saved page.
- Preview mode suppresses reader side effects that should not fire from an admin iframe, including analytics/tracking writes, email submission, comment mutations, chat SSO, safe-mode redirects, fullscreen changes, and external navigation clicks.
- Header buttons and `buttons` modules share the same normalized link target model for builder pages, anchors, and external URLs. Header shell, navigation, panel buttons, and builder modules share structured appearance contracts between admin canvas, preview, and public reader.
- Posts, media, series, entries, users, comments, page configs, and builder pages are DB-backed. Entry and media files live on disk under public or protected roots, with premium/private access enforced by the backend.
- Media supports `public`, `premium`, and `private` access. Premium blur previews in `media/previews/` and public post image copies in `media/post-assets/` are derived output.
- Public HTML shells and `manifest.json` can use admin-selected public media for the site OG image and favicon. FastAPI serves branded responses for the main public routes.
- Admin diagnostics is snapshot-backed and read-only. The separate `/ops/` surface handles allowlisted queued commands, run output, and backup actions.
- Umami analytics is optional through the Docker `analytics` profile; the backend serves `/analytics.js` and proxies `/umami/*` when configured.

## Repository layout

- `reader/` - public reader runtime, page loading, comments, tracking, preview bridge, and builder-page rendering.
- `admin/` - admin dashboard, entries, posts, media, analytics, diagnostics, designer, and page-builder UI.
- `admin/page-builder/` - page-builder managers, draft handling, preview contract/sync, shared renderers, module editors, and appearance utilities.
- `backend/app/` - FastAPI app, routes, DB stores, page-builder persistence, branding, diagnostics, ops, analytics, auth, and premium access.
- `assets/` - public chrome, CSS, icons, banners, and static images used by the reader/admin shell.
- `comics/`, `media/`, and `protected/` - public and access-controlled entry/media file roots used by the backend.
- `tests/`, `backend/tests/`, and `tests/visual/` - Vitest, unittest, and Playwright coverage.
- `deploy/` - Caddy, Docker Compose, systemd units, diagnostics timer, ops worker, and deployment notes.

## Quick start (Docker)

1. Create env:
   - `make env` (then fill in secrets in `deploy/bwondercomics.env`)
2. Start the stack:
   - `make up`
   - `make migrate`
3. Open:
   - Site is served by Caddy (domain in `deploy/Caddyfile`)
   - Admin is served from `/admin/` off the repo root
   - Direct API health checks use the configured API port, for example `/healthz`

## Frontend build

Public pages are served from `dist/`.

- Build + snapshot: `./scripts/frontend-build.sh` (writes `dist/` and saves a tarball in `var/releases/`).
- Caddy serves `dist/` for the public site, and `/admin/` directly from the repo (admin changes go live without rebuild).
- If you change anything that affects the public runtime, rebuilding `dist/` is mandatory before you verify the fix in the browser.
- This includes `reader/`, top-level public HTML, `assets/`, and shared builder modules imported by the reader bundle, even when those files live under `admin/`.
- Passing tests against source files does not prove the live site changed until the new bundle has been built.

## Quality gates

- Frontend tests: `npm test`
- Backend tests: `npm run test:backend`
- Visual preview parity tests: `npm run test:visual`
- JS lint: `npm run lint`
- JS format check: `npm run format:check`
- Python lint: `npm run lint:py`
- Python format check: `npm run format:py:check`
- Production build: `npm run build`
- Full JS + backend test shortcut: `npm run test:all`

## Docs

- Overview: `docs/README.md`
- Architecture: `docs/ARCHITECTURE.md`
- Admin panel + page builder: `docs/admin-overview.md`
- Builder preview parity: `docs/BUILDER_PREVIEW_PARITY_PLAN.md`
- Operations: `docs/OPERATIONS.md`
- Deployment: `deploy/README.md`
- Release roadmap: `docs/ROADMAP.md`

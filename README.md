# BWonderComics 0.8.5 - Builder Customization and Refactor Lock

BWonderComics is a plain HTML/CSS/JS comic reader and admin panel built with Vite, backed by a FastAPI/Postgres service for dynamic site behavior: auth, comments, posts, RSS, uploads, premium access, DB-backed series and entries, the page builder, diagnostics, ops, and the analytics proxy.

## Current shape

- The reader is builder-first. It loads DB-backed series/entry JSON plus the canonical builder page from `/api/pages/home/<seriesId>`, `/api/pages/<seriesId>/<slug>`, or `/api/pages/global/by-slug/<slug>` when `pageScope=global` is requested. Legacy `page-config.json` startup behavior is fallback-only and is no longer part of normal reader boot.
- The page builder owns global and per-series pages, homepage selection, same-series reader bindings, draft/publish state, page-scoped V3 headers in `page.meta.header`, theme/panel shell state, sections, modules, and templates for Reader, Feed, Media Gallery, and Entry Gallery pages.
- The builder now opens as a full-page authoring shell. The live canvas is the real reader route in a same-origin iframe, with blocks, layers, settings, styles, selected-target overlays, live drag/drop, chrome-collapsed Preview, guarded keymaps, local draft undo/redo, and text-module inline editing.
- Builder preview is coordinated by `admin/page-builder/preview-manager.js` and `reader/preview-bridge.js`. Snapshots, control messages, target geometry, inline-edit messages, and responsive metrics are validated through `shared/page-builder/preview-contract.js`.
- Desktop, Tablet, and Phone preview presets use exact iframe viewport dimensions from the shared preview contract: `1920x1080`, `768x1024`, and `375x812`. The full-HD Desktop iframe is visually scaled in the admin canvas without changing iframe CSS pixels.
- Unsaved module, theme, header, page-settings, section, and page-wide structure drafts are merged
  into cloned working snapshots for preview without mutating the saved page.
- Admin **History** and **Deleted pages** recovery use retained, validated server snapshots to restore
  saved content or recreate an unpublished/unbound draft, with dirty-workspace protection and a
  fresh canonical/preview state after success.
- Production database and durable-file backups publish validated manifest/checksum sets to the
  separate `/mnt/archive` filesystem on nightly/weekly systemd schedules. `make restore-drill`
  revalidates selected artifact IDs in isolated PostgreSQL 16 and temporary-file resources without
  accepting a production restore target.
- Preview mode suppresses reader side effects that should not fire from an admin iframe, including analytics/tracking writes, email submission, comment mutations, chat SSO, safe-mode redirects, fullscreen changes, and external navigation clicks.
- Header buttons and `buttons` modules share the same normalized link target model for builder pages, anchors, and external URLs. Header shell, navigation, panel buttons, and builder modules share structured appearance contracts between admin canvas, preview, and public reader.
- CMS-backed builder modules are structured: `reader`, `entry-gallery`, `feed`, and `media-gallery` persist sanitized source config, while feed/media-gallery use existing site-wide post/media data and reader/entry modules remain series-aware.
- The 0.8.5 builder closeout adds column-owned panel settings, explicit Desktop/Tablet/Phone
  responsive authoring for reader controls and Feed layout, atomic structure placement saves,
  publication-safe Save Page behavior, an editor registry, a dual-use `shared/page-builder/`
  kernel, and cross-language builder-schema parity coverage.
- Posts, media, series, entries, users, comments, page configs, and builder pages are DB-backed. Entry and media files live on disk under public or protected roots, with premium/private access enforced by the backend.
- Media supports `public`, `premium`, and `private` access. Premium blur previews in `media/previews/` and public post image copies in `media/post-assets/` are derived output.
- Public HTML shells and `manifest.json` can use admin-selected public media for the site OG image and favicon. FastAPI serves branded responses for the main public routes.
- Admin diagnostics is snapshot-backed and read-only. The separate `/ops/` surface handles allowlisted queued commands, run output, and backup actions.
- Umami analytics is optional through the Docker `analytics` profile; the backend serves `/analytics.js` and proxies `/umami/*` when configured.

## Repository layout

- `reader/` - public reader runtime, page loading, comments, tracking, preview bridge, and builder-page rendering.
- `admin/` - admin dashboard, entries, posts, media, analytics, diagnostics, designer, and page-builder UI.
- `admin/page-builder/` - admin-only page-builder orchestration, draft/controllers, preview sync,
  selection, structural commands, and module editors.
- `shared/page-builder/` - dual-use builder/reader contracts, renderers, sanitizers, descriptors,
  responsive resolution/CSS, header config, and preview protocol.
- `backend/app/` - FastAPI app, routes, DB stores, page-builder persistence, branding, diagnostics, ops, analytics, auth, and premium access.
- `scripts/backup_artifacts.py` and `scripts/restore_drill.py` - canonical validated backup
  publication and isolated recovery proof.
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
- This includes `reader/`, top-level public HTML, `assets/`, and `shared/page-builder/` modules
  imported by the reader bundle.
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

## Recovery operations

- Developer backups: `make backup`, `make backup-db`, or `make backup-files` under `var/backups/`.
- Production jobs: `make backup-db-production` and `make backup-files-production`; deployed timers
  run the same canonical implementation against `/mnt/archive/backups/bwondercomics`.
- Isolated recovery proof:
  `make restore-drill DATABASE_ARTIFACT_ID=... FILE_ARTIFACT_ID=...`.
- See `docs/OPERATIONS.md` for provisioning, artifact verification, recorded drills, and the
  separately authorized destructive-disaster-recovery procedure.

## Docs

- Overview: `docs/README.md`
- Architecture: `docs/ARCHITECTURE.md`
- Admin panel + page builder: `docs/admin-overview.md`
- Completed builder plans: `docs/completed-builder-plans/README.md`
- Operations: `docs/OPERATIONS.md`
- Deployment: `deploy/README.md`
- Release roadmap: `docs/ROADMAP.md`

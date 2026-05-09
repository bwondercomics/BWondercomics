# Test Documentation

## Overview

This repo has two active test surfaces:

- Frontend/admin tests via `Vitest` in `tests/`
- Backend tests via Python `unittest` in `backend/tests/`

The test suite is intended to reflect current production terminology and behavior. Use the codebase as the source of truth: `entry` is the current reader/admin naming, and older `chapter` references are legacy.

## Runners

Frontend:

```bash
npm test
```

Frontend coverage:

```bash
npm run test:coverage
```

Backend:

```bash
npm run test:backend
```

Run both:

```bash
npm run test:all
```

Quality gates used for the `0.7.9` to `1.0.0` hardening pass:

```bash
npm run lint
npm run format:check
npm run lint:py
npm run format:py:check
npm run build
```

## Setup

Install JavaScript dependencies:

```bash
npm install
```

Install backend dev dependencies into the repo virtualenv:

```bash
./.venv/bin/pip install -r backend/requirements-dev.txt
```

The Python quality-gate scripts assume Ruff is installed in `./.venv/`, and the JS format scripts call Prettier through `node ./node_modules/prettier/bin/prettier.cjs` to avoid shell wrapper issues.

## Frontend Test Files

- `tests/entries.test.js`: entry parsing, sorting, and normalization helpers in `reader/entries.js`
- `tests/state.test.js`: `reader/state.js` persistence behavior
- `tests/data.test.js`: `reader/data.js` loaders
- `tests/reader-data-builder.test.js`: builder-first page loading, effective-homepage resolution for public and admin draft roots, retired legacy fallback behavior, header-state parity between reader copy and topbar layout, theme/panel application, and empty-panel handling
- `tests/reader-page-renderer.test.js`: `reader/page-renderer.js` module rendering contracts and placeholder states
- `tests/reader-feed-panel.test.js`: `reader/feed-panel.js` and `reader/latest.js` sorting, sanitization, expansion, latest preview, and feed-mode behavior
- `tests/reader-controls.test.js`: `reader/controls.js` navigation and end-of-entry behavior
- `tests/reader-fullscreen.test.js`: `reader/fullscreen.js` enter/exit and controls-bar timing
- `tests/reader-pointer.test.js`: `reader/pointer.js` swipe, drag, double-tap, and edge zones
- `tests/reader-app.test.js`: `reader/app.js` boot, session gating, shortcuts, resize behavior, and bootstrap-loading release against `index.html`
- `tests/reader-customization.test.js`: coordination between `reader/app.js` bootstrap state and no-op `reader/customization.js` so legacy page-config mutations cannot re-enter the reader shell
- `tests/render.test.js`: two-page mode/render helpers
- `tests/transform.test.js`: on-page sizing math
- `tests/on-page-frame.test.js`: DOM/render frame sizing regressions
- `tests/series.test.js`: series path helpers
- `tests/comment-targets.test.js`: comment target ID helpers
- `tests/utils.test.js`: admin utility helpers
- `tests/admin-smoke.test.js`: admin app boot against the live `admin/index.html` contract
- `tests/admin-auth.test.js`: `admin/auth.js` session/login/logout handling
- `tests/admin-posts.test.js`: post save/render flow via `createPostsManager`
- `tests/admin-entries.test.js`: entry create/render flow via `createEntriesApi`
- `tests/admin-media.test.js`: empty media state via `createMediaManager`
- `tests/admin-series.test.js`: `admin/series.js` series-index contract consumption
- `tests/admin-preview.test.js`: `admin/preview.js` preview-data contract consumption
- `tests/admin-page-config.test.js`: `admin/page-config.js` page-config load/save behavior
- `tests/admin-page-builder-data.test.js`: `admin/page-builder/data.js` page/section/module request wrappers and failure handling
- `tests/admin-page-builder-shell.test.js`: `admin/page-builder.js` shell/layout behavior, selection and publish flows, modal page creation, default landing on the page-settings surface in normal builder mode, page-settings save flow, sidebar page reorder success/rollback, section settings save/discard, canvas delete cleanup, page-header editing, default module config wiring, and the Edit/Preview canvas mode toggle with Desktop/Tablet/Mobile width presets
- `tests/admin-page-builder-preview.test.js`: `admin/page-builder/module-editor.js` save/delete flows, structured editor draft updates (including gallery asset-picker regression coverage), and `admin/page-builder/preview-renderers.js` preview contracts, including assertions that dedicated-binder modules no longer render a misleading generic raw-config fallback card
- `tests/admin-page-builder-audit.test.js`: `admin/page-builder/header-config.js` fallback-audit helpers, including series-level removal readiness, the `missingPublishedReaderPage` gate, per-page legacy header dependency buckets, and the rule that inert legacy header modules stop blocking once canonical V3 page-header metadata exists
- `tests/shared-renderers-parity.test.js`: parity tests for `admin/page-builder/shared-renderers.js` — verifies that `createRenderers()` produces equivalent structure for reader and preview option sets, correct mount-placeholder behavior, image URL resolution per resolver, and button link resolution via `getSeriesId`
- `tests/admin-designer.test.js`: admin shell cleanup after removing the legacy designer iframe host
- `tests/media-branding.test.js`: media/admin branding rules
- `tests/diagnostics-snapshot.test.js`: diagnostics UI snapshot and legacy fallback behavior
- `tests/ops-app.test.js`: ops UI rendering states
- `tests/helpers/contracts.js` and `tests/fixtures/contract-fixtures.json`: shared frontend contract fixtures for series data, builder pages/modules, feed/latest payloads, tracking payloads, and user-state contracts
- `tests/helpers/reader-fixture.js`: live reader markup harness from `index.html`

## Backend Test Files

- `backend/tests/test_diagnostics_ops.py`: diagnostics snapshots, ops access controls, and internal ops callbacks
- `backend/tests/test_site_branding.py`: site-branding asset resolution and HTML/manifest branding
- `backend/tests/test_auth_routes.py`: auth/session/register/login/logout route contracts
- `backend/tests/test_comments_routes.py`: comment auth, moderation, duplicate/rate-limit, and censored-phrase handling
- `backend/tests/test_files_routes.py`: page-config/media index contracts, protected asset access, and virtual save behavior
- `backend/tests/test_page_builder_routes.py`: page-builder admin CRUD, slug uniqueness, homepage exclusivity, effective-homepage public/admin endpoint resolution, header-nav style sanitization, section/module move-reorder, and public published-page access
- `backend/tests/test_backfill_page_headers.py`: dry-run and write-mode coverage for canonical V3 header backfill, legacy copy import, nav-style preservation, hidden-block persistence after override cleanup, additive `pageReports`, and sanitized header/nav appearance preservation
- `backend/tests/test_posts_routes.py`: public/admin post visibility, scheduled promotion, protected-image copy, and asset cleanup
- `backend/tests/test_series_contracts.py`: `series.json` and `data.json` payload contracts
- `backend/tests/test_tracking_routes.py`: visitor-session create/update behavior, dedupe, and validation
- `backend/tests/test_user_routes.py`: email subscribe/opt-in, user settings, comment self-service, premium redemption, and account deletion rules
- `backend/tests/helpers.py`: shared in-memory DB, request factory, and contract seeding helpers for series, builder pages, comments, premium codes, and visitor sessions

## Documentation Rules

- Do not claim fixed coverage percentages unless they are generated and current.
- When adding tests, prefer focused module/manager tests over brittle app-wide DOM fixtures.
- If an admin test depends on the live markup contract, reuse the shared HTML fixture rather than hand-maintaining an incomplete DOM template.
- Reuse the shared contract fixture layer for reader/admin/backend contract assertions instead of hand-copying payload shapes.
- Treat `tests/fixtures/contract-fixtures.json` and `backend/tests/helpers.py` as the canonical contract layer; backend payload changes should update those fixtures and at least one frontend plus one backend assertion.
- Frontend coverage is informational, not a percentage gate. CI should still run `npm run test:coverage` and publish the report artifact.
- GitHub Actions enforcement should use the same local commands already documented here: `npm test`, `npm run test:coverage`, and `npm run test:backend`.

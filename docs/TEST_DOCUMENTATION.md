# Test Documentation

## Overview

This repo has three active test surfaces:

- Frontend/admin tests via `Vitest` in `tests/`
- Browser visual parity tests via `Playwright` in `tests/visual/`
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

Browser visual and workflow gates:

```bash
npx playwright install chromium
npm run test:visual
```

`npm run test:visual` is intentionally separate from `npm run test:all` because screenshot
baselines, browser installation, and browser-level release workflow assertions are release-gate
concerns, not the default unit/backend loop. The Playwright server uses strict local Vite port
`127.0.0.1:3107`; override it with `PLAYWRIGHT_VISUAL_PORT` only when that port is unavailable.
On Linux hosts that are missing Chromium runtime libraries such as `libasound.so.2`, run
`npx playwright install-deps chromium` with system package privileges before running the visual
suite.

Quality gates used for the `0.8.5` to `1.0.0` hardening pass:

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
- `tests/reader-data-builder.test.js`: builder-first page loading, effective-homepage resolution for
  public and admin draft roots, retired legacy fallback behavior, explicit `source: 'builder'` /
  `source: 'none'` startup constraints, reader-shell activation/inactivation, authored
  above/below-reader surfaces, scheduled empty-entry preservation, header parity, theme/panel reset,
  and responsive builder DOM application
- `tests/reader-entry-publication.test.js`: scheduled Coming Soon empty states, published page
  rendering, and scheduled-entry selectability
- `tests/reader-vertical.test.js` and `tests/reader-vertical-analytics.test.js`: vertical strip
  rendering, cleanup, entry navigation, scroll restore, visible-page analytics, and completion
- `tests/reader-page-renderer.test.js`: `reader/page-renderer.js` module rendering contracts and placeholder states
- `tests/reader-feed-panel.test.js`: `reader/feed-panel.js` and `reader/latest.js` sorting, sanitization, expansion, latest preview, and feed-mode behavior
- `tests/reader-controls.test.js`: `reader/controls.js` navigation and end-of-entry behavior
- `tests/reader-fullscreen.test.js`: `reader/fullscreen.js` enter/exit and controls-bar timing
- `tests/reader-pointer.test.js`: `reader/pointer.js` swipe, drag, double-tap, and edge zones
- `tests/reader-app.test.js`: `reader/app.js` boot, session gating, shortcuts, resize behavior, and bootstrap-loading release against `index.html`
- `tests/reader-customization.test.js`: coordination between `reader/app.js` bootstrap state and no-op `reader/customization.js` so stale legacy boot results stay defensive compatibility input and cannot re-enter the reader shell
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
- `tests/admin-page-builder-canvas-mutations.test.js`: structural mutation behavior for module duplication, including exact adjacency, independent cloned config, persisted reload order, compensating delete after reorder failure, authoritative page reconciliation, and fail-visible recovery when cleanup/reload both fail
- `tests/admin-page-builder-reader-binding-validation.test.js`: reader-binding lifecycle validation helpers, including missing/duplicate/hidden/wrong-source warning codes, bound-page detection, module-delete/section-delete blocking warnings, and non-default device hide advisory warnings
- `tests/admin-page-builder-structural-commands.test.js`: live structural command integration, including final-drop revalidation, authoritative duplicate eligibility without trusting target module type, Comic Reader rejection, missing-module rejection, and duplicated-target selection
- `tests/admin-page-builder-shell.test.js`: the remaining compact shell smoke/boot contract.
- `tests/admin-page-builder-command-shell.test.js`, `draft-preview-shell.test.js`,
  `header-shell.test.js`, `inline-edit-shell.test.js`, `preview-shell.test.js`,
  `section-shell.test.js`, and `structure-shell.test.js`: behavior-focused slices of the shared
  page-builder shell fixture covering commands/keymaps, manager-owned draft/undo state, header
  canvas editing, stale-safe inline editing, exact preview/chrome behavior, section/device settings,
  and structural mutations/placements.
- `tests/helpers/admin-page-builder-shell.js`: the shared shell harness used by those behavior suites;
  it is test infrastructure, not another production-state owner.
- `tests/admin-page-builder-preview.test.js`: `admin/page-builder/module-editor.js` save/delete flows, structured editor draft updates (including reader customization and gallery asset-picker regression coverage), and `admin/page-builder/preview-renderers.js` preview contracts, including assertions that dedicated-binder modules no longer render a misleading generic raw-config fallback card
- `tests/admin-page-builder-preview-contract.test.js`: `shared/page-builder/preview-contract.js`
  viewport/message/identity validation, including metrics, target traffic, inline-edit envelopes, and
  exact Desktop/Tablet/Phone presets.
- `tests/admin-page-builder-audit.test.js`: `shared/page-builder/header-config.js` fallback-audit
  helpers, including Phase 8 retirement acceptance and canonical V3 readiness.
- `tests/admin-page-builder-data.test.js`, `tests/admin-page-builder-commands.test.js`, and
  `tests/admin-page-builder-history-shell.test.js`: typed no-store recovery requests and structured
  errors; strict bodyless restore; async command dirty/duplicate/conflict behavior; history and
  deleted loading/empty/retry/detail/confirmation states; action/actor/time labels; accessible
  focus/Escape; route/page/scope/series invalidation; committed-versus-refresh result boundaries;
  refresh abortion and stale reconciliation rejection; post-commit reload-required handling;
  canonical current restore with renewed preview state; and deleted-page recovery/Designer routing.
- `tests/shared-renderers-parity.test.js`: parity tests for
  `shared/page-builder/shared-renderers.js`, including builder markers, panel/column ownership,
  reader mounts, responsive CSS, Feed layout, and reader/public option sets.
- `tests/shared-kernel-boundary.test.js`: prevents `shared/page-builder/` from importing admin or
  reader code, prevents reader code from importing admin modules, and locks the Caddy shared-kernel
  source route.
- `tests/builder-config-parity.test.js` and `tests/fixtures/builder-config-parity.json`: the JS half
  of the frozen JS/Python module schema and HTML sanitizer parity contract.
- `tests/responsive-overrides.test.js`, `tests/reader-config.test.js`, and
  `tests/reader-user-settings.test.js`: responsive normalization/emission, reader config/mount data,
  and scoped reader preference behavior.
- `tests/admin-designer.test.js`: admin shell cleanup after removing the legacy designer iframe host
- `tests/media-branding.test.js`: media/admin branding rules
- `tests/diagnostics-snapshot.test.js`: diagnostics UI snapshot and legacy fallback behavior
- `tests/ops-app.test.js`: ops UI rendering states
- `tests/helpers/contracts.js` and `tests/fixtures/contract-fixtures.json`: shared frontend contract fixtures for series data, builder pages/modules, feed/latest payloads, tracking payloads, and user-state contracts
- `tests/helpers/reader-fixture.js`: live reader markup harness from `index.html`
- `tests/reader-preview-bridge.test.js`: `reader/preview-bridge.js` handshake protocol and target geometry collection — `requestPreviewSnapshot(...)` resolves on valid `SNAPSHOT`, rejects on timeout or invalid envelope, sends correct `ACK`/`ERROR` control messages, collects the editor-only page-end target, and rejects cross-origin and cross-source events
- `tests/reader-preview-side-effects.test.js`: end-to-end reader preview side-effect guards — verifies that `?builderPreview=1` suppresses analytics initialization, live tracking, email form submission, comment mutations, chat SSO, safe-mode redirect, user-settings overlay, fullscreen, and external navigation links while leaving read-only reader shell behavior intact
- `tests/visual/builder-preview-parity.spec.js`: Playwright visual parity coverage for the admin builder preview iframe against the public reader route at Desktop, Tablet, and Phone, plus DOM/assertion coverage for no-reader pages and a customized paged reader route. Phase 5 styled 1/2/3/4+ column layouts capture both public output and the matching admin iframe against the same committed baselines.
- `tests/visual/builder-authoring-workflows.spec.js`: stateful full-page authoring coverage including
  exact preview dimensions, live edits, templates, current history restore surviving reload/public
  verification, renewed preview sessions and cleared transient selection/draft/undo state, restored
  iframe/public output, deleted recovery in series/global scopes, bodyless requests, dialog focus and
  responsive bounds, 700px status/toolbar separation, toolbar fit, and the committed recovery
  confirmation screenshot.

## Backend Test Files

- `backend/tests/test_diagnostics_ops.py`: diagnostics snapshots, ops access controls, and internal ops callbacks
- `backend/tests/test_site_branding.py`: site-branding asset resolution and HTML/manifest branding
- `backend/tests/test_auth_routes.py`: auth/session/register/login/logout route contracts
- `backend/tests/test_comments_routes.py`: comment auth, moderation, duplicate/rate-limit, and censored-phrase handling
- `backend/tests/test_files_routes.py`: page-config/media index contracts, protected asset access, and virtual save behavior
- `backend/tests/test_page_builder_routes.py`: page-builder admin CRUD, slug uniqueness, homepage exclusivity, reader-binding module validation, invalid bound-reader publish blocking, effective-homepage public/admin endpoint resolution, header-nav style sanitization, section/module move-reorder, atomic rejection of composite invalid module updates, and public published-page access
- `backend/tests/test_builder_history.py` and `test_builder_history_phase2.py`: recovery migration and
  serialization contracts; exact actor-attributed mutation pre-state payload/hash/count coverage;
  action-aware 30-event retention; strict typed UUID/tuple recovery validation; global, restore,
  pruning, and outer-transaction rollback; fail-closed legacy hybrid detection; validated
  current/deleted restore with stable IDs and reader-binding safeguards; and admin recovery API
  shapes, actor propagation, authorization-before-service, no-store, non-disclosure, filter, and
  body-rejection behavior.
- `backend/tests/test_builder_history_postgres.py`: environment-gated PostgreSQL 16 concurrency
  suite for mutation versus current-page restore, concurrent global homepage creates, concurrent
  restores of the same deleted page, and different deleted pages restored into one series. Workers
  publish `pg_backend_pid()` and an autocommit observer must see the waiter active on a lock with the
  expected blocker in `pg_blocking_pids()` before release. The suite only accepts a database named
  `builder_history_locking_drill`; the 2026-07-31 corrective drill ran all four scenarios
  successfully.
- `backend/tests/test_backup_artifacts.py`, `test_backup_diagnostics.py`, and `test_ops_worker.py`:
  manifest-last database/file backup publication, exact durable-file allowlists, production
  mount/layout failure, integrity-aware retention, fixed service/Make/Ops entry points, status and
  catalog diagnostics, and interrupted worker ownership/acknowledgement behavior.
- `backend/tests/test_restore_drill.py`: manifest/checksum tamper rejection, safe temporary-tree
  extraction, traversal rejection, PostgreSQL 16 scratch command isolation, fail-fast restore and
  row-count mismatch handling, container/volume cleanup, bounded drill logs, and rejection of any
  production database-target argument.
- `backend/tests/test_builder_security.py`: focused coverage for the split builder sanitizer package,
  responsive allowlists, appearance/header contracts, reader config, and destructive column-shrink
  rejection.
- `backend/tests/test_builder_config_parity.py`: the Python half of the shared schema/HTML sanitizer
  parity fixture.
- `backend/tests/test_migrate_panel_settings.py` and `test_migrate_panel_toggles.py`: idempotent,
  conflict-safe panel metadata migrations into column ownership and ratio-driven panel existence.
- `backend/tests/test_backfill_page_headers.py`: dry-run and write-mode coverage for canonical V3 header backfill, no-op behavior on already-clean V3 pages, legacy copy import, nav-style preservation, hidden-block persistence after override cleanup, additive `pageReports`, published-`reader` readiness blocking, and sanitized header/nav appearance preservation

## Phase 8 Runtime Fallback Retirement Coverage

- `tests/admin-page-builder-audit.test.js` is the frontend source of truth for when a series is actually clean enough to retire runtime fallback: a published `reader` page is required and any remaining fallback bucket must keep the audit blocked.
- `tests/reader-data-builder.test.js` locks the post-retirement startup contract by asserting the reader returns only `source: 'builder'` or `source: 'none'`, never falls back to `page-config.json`, renders backfilled V3 header metadata with the same visible state the admin builder preview resolves, and clears controlled theme/panel shell state between sequential snapshot applications.
- `tests/reader-customization.test.js` keeps the legacy customization entrypoint documented as a compatibility no-op so missing builder pages cannot rehydrate the old shell through stale boot data.
- `backend/tests/test_backfill_page_headers.py` complements the frontend gate by proving clean V3 pages stay untouched in dry-run/write mode and that readiness still fails when no published `reader` page exists.
- `backend/tests/test_posts_routes.py`: public/admin post visibility, scheduled promotion, protected-image copy, and asset cleanup
- `backend/tests/test_series_contracts.py`: public/admin `series.json` and `data.json` payload contracts, admin alias authorization/no-store headers, entry publication save normalization, draft/scheduled visibility, and automatic scheduled release
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
- GitHub Actions enforcement should use the same fast local commands already documented here: `npm test`, `npm run test:coverage`, and `npm run test:backend`. The complete release gate remains manual/local and adds formatting, linting, build, and Playwright visual/workflow verification.

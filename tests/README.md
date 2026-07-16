# Test Guide

## Overview

This repo uses three test runners:

- Frontend/admin tests: `Vitest` with `happy-dom`
- Backend tests: Python `unittest`
- Browser visual/workflow tests: `Playwright`

The frontend suite covers reader helpers, interaction flows, builder-driven presentation, DOM/render regressions, and focused admin manager flows. The backend suite covers diagnostics/ops, branding, and the core auth/comment/file/post/series/page-builder/tracking/user route contracts.

## Commands

Run the frontend suite:

```bash
npm test
```

Run the backend suite:

```bash
npm run test:backend
```

Run both:

```bash
npm run test:all
```

Run coverage for the frontend suite:

```bash
npm run test:coverage
```

Run browser visual parity and Phase 12 authoring workflow coverage:

```bash
npx playwright install chromium
npm run test:visual
```

## Setup

Install Node dependencies:

```bash
npm install
```

Install backend dev dependencies into the repo virtualenv:

```bash
./.venv/bin/pip install -r backend/requirements-dev.txt
```

## Current Test Areas

- `tests/entries.test.js`: entry parsing, sorting, and normalization
- `tests/state.test.js`: reader progress persistence
- `tests/data.test.js`: reader data/page-config loading
- `tests/reader-data-builder.test.js`: builder-first page loading, fallback retirement (`source: 'builder'` / `source: 'none'` only), no legacy `page-config.json` startup fetch, backfilled V3 header parity, reader-shell/no-reader DOM application, scheduled empty-entry preservation, and builder target markers
- `tests/reader-entry-publication.test.js`: scheduled COMING SOON empty-state rendering, published page rendering, and scheduled entry selectability
- `tests/reader-page-renderer.test.js`: reader page-builder module rendering contracts
- `tests/reader-feed-panel.test.js`: feed/latest rendering, sanitization, and feed-mode behavior
- `tests/reader-controls.test.js`: reader next/prev/restart behavior
- `tests/reader-fullscreen.test.js`: fullscreen enter/exit and controls timing
- `tests/reader-pointer.test.js`: swipe, drag, double-tap, and edge-zone behavior
- `tests/reader-app.test.js`: reader and no-reader boot against the live `index.html` contract
- `tests/reader-customization.test.js`: reader boot/customization coordination so the legacy customization entrypoint stays a no-op compatibility layer
- `tests/admin-smoke.test.js`: admin app boot against the live markup contract
- `tests/admin-auth.test.js`: admin session/login/logout contract handling
- `tests/admin-posts.test.js`: post save/render flow
- `tests/admin-entries.test.js`: entry create/render flow, scheduled future-date validation, and status-derived Coming Soon labeling
- `tests/admin-media.test.js`: empty media state
- `tests/admin-series.test.js`: series index contract loading, label application, and builder-visible series switching
- `tests/admin-preview.test.js`: preview data contract loading and image rendering
- `tests/admin-page-config.test.js`: page-config cache/save contract behavior
- `tests/admin-page-builder-data.test.js`: page-builder data-layer fetch/create/update/delete wrappers
- `tests/admin-page-builder-shell.test.js`: compact page-builder shell smoke/boot contract.
- `tests/admin-page-builder-command-shell.test.js`, `draft-preview-shell.test.js`,
  `header-shell.test.js`, `inline-edit-shell.test.js`, `preview-shell.test.js`,
  `section-shell.test.js`, and `structure-shell.test.js`: behavior-focused shell coverage for
  command routing, manager-owned drafts/undo, header canvas authoring, inline editing, exact preview
  and chrome modes, section/device settings, and structural placements/mutations.
- `tests/helpers/admin-page-builder-shell.js`: shared shell harness for those suites.
- `tests/admin-page-builder-preview.test.js`: module-editor save/delete flows and preview renderer contracts
- `tests/admin-page-builder-preview-contract.test.js`: shared preview viewport, snapshot, metrics,
  target, inline-edit, and identity/message contracts.
- `tests/admin-page-builder-audit.test.js`: fallback-retirement audit coverage, including published-`reader` readiness and blocking bucket aggregation
- `tests/shared-kernel-boundary.test.js`: dual-use shared-kernel and reader/admin import boundaries,
  plus the Caddy `/shared/page-builder/*` source route.
- `tests/builder-config-parity.test.js` + `tests/fixtures/builder-config-parity.json`: JS/Python
  builder schema and HTML sanitizer parity.
- `tests/responsive-overrides.test.js`, `tests/reader-config.test.js`, and
  `tests/reader-user-settings.test.js`: public/preview responsive, reader-config, and reader-setting
  contracts.
- `tests/admin-designer.test.js`: admin-shell cleanup proving the legacy designer iframe host is gone
- `tests/media-branding.test.js`: admin branding rules
- `tests/diagnostics-snapshot.test.js`: diagnostics snapshot rendering and fallbacks
- `tests/ops-app.test.js`: ops UI rendering states
- `tests/helpers/contracts.js` + `tests/fixtures/contract-fixtures.json`: shared frontend contract fixtures for series, builder pages/modules, feed/latest payloads, tracking, and user-state contracts
- `tests/visual/builder-preview-parity.spec.js`: Playwright screenshot parity and iframe metric coverage for the live builder preview against the public reader at Desktop, Tablet, and Mobile, including shared public/admin baselines for Phase 5 styled 1/2/3/4+ column layouts
- `tests/visual/builder-authoring-workflows.spec.js`: Playwright Phase 12 browser workflow coverage for exact iframe dimensions, series reader bindings, chrome preview collapse/restore, side-panel save/reload, current-device override persistence, inline text Save/Discard, live block drag/drop persistence, and global Feed template page creation
- `backend/tests/helpers.py`: shared backend route harness and contract seed helpers for series, builder pages, comments, premium codes, and visitor sessions
- `backend/tests/test_builder_security.py` and `test_builder_config_parity.py`: split sanitizer
  package behavior and the Python half of the shared parity fixture.
- `backend/tests/test_migrate_panel_settings.py` and `test_migrate_panel_toggles.py`: idempotent,
  conflict-safe panel ownership migrations.
- Remaining `backend/tests/test_*.py`: diagnostics/ops, branding, and core route contracts including
  page-builder, tracking, user flows, and page-header backfill/readiness coverage.

## Notes

- The production code uses `entry` terminology; older references to `chapter` are legacy.
- `npm run test:coverage` only covers the Vitest suite.
- Coverage is informational in this repo right now; CI should run it and publish the report, but it is not a percentage gate.
- The shared contract layer in `tests/fixtures/contract-fixtures.json` and `backend/tests/helpers.py` is authoritative for reader/admin/backend wire-shape assertions.
- Backend payload changes should update that contract layer and at least one frontend test plus one backend test.
- CI uses the same fast local commands via `.github/workflows/tests.yml`: `npm test`, `npm run test:coverage`, and `npm run test:backend`. The full release gate remains manual/local and adds formatting, linting, build, and `npm run test:visual`.

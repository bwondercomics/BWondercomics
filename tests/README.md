# Test Guide

## Overview

This repo uses two test runners:

- Frontend/admin tests: `Vitest` with `happy-dom`
- Backend tests: Python `unittest`

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
- `tests/reader-data-builder.test.js`: builder-first page loading, fallback retirement (`source: 'builder'` / `source: 'none'` only), and DOM application
- `tests/reader-page-renderer.test.js`: reader page-builder module rendering contracts
- `tests/reader-feed-panel.test.js`: feed/latest rendering, sanitization, and feed-mode behavior
- `tests/reader-controls.test.js`: reader next/prev/restart behavior
- `tests/reader-fullscreen.test.js`: fullscreen enter/exit and controls timing
- `tests/reader-pointer.test.js`: swipe, drag, double-tap, and edge-zone behavior
- `tests/reader-app.test.js`: reader boot against the live `index.html` contract
- `tests/admin-smoke.test.js`: admin app boot against the live markup contract
- `tests/admin-auth.test.js`: admin session/login/logout contract handling
- `tests/admin-posts.test.js`: post save/render flow
- `tests/admin-entries.test.js`: entry create/render flow
- `tests/admin-media.test.js`: empty media state
- `tests/admin-series.test.js`: series index contract loading, label application, and builder-visible series switching
- `tests/admin-preview.test.js`: preview data contract loading and image rendering
- `tests/admin-page-config.test.js`: page-config cache/save contract behavior
- `tests/admin-page-builder-data.test.js`: page-builder data-layer fetch/create/update/delete wrappers
- `tests/admin-page-builder-shell.test.js`: page-builder shell behavior including empty state, selection, canonical designer-route entry, publish state, section settings save/discard, canvas delete cleanup, page-header editing, and default module config wiring
- `tests/admin-page-builder-preview.test.js`: module-editor save/delete flows and preview renderer contracts
- `tests/admin-designer.test.js`: admin-shell cleanup proving the legacy designer iframe host is gone
- `tests/media-branding.test.js`: admin branding rules
- `tests/diagnostics-snapshot.test.js`: diagnostics snapshot rendering and fallbacks
- `tests/ops-app.test.js`: ops UI rendering states
- `tests/helpers/contracts.js` + `tests/fixtures/contract-fixtures.json`: shared frontend contract fixtures for series, builder pages/modules, feed/latest payloads, tracking, and user-state contracts
- `backend/tests/helpers.py`: shared backend route harness and contract seed helpers for series, builder pages, comments, premium codes, and visitor sessions
- `backend/tests/test_*.py`: backend diagnostics/ops, branding, and core route contract behavior including page-builder, tracking, and user flows

## Notes

- The production code uses `entry` terminology; older references to `chapter` are legacy.
- `npm run test:coverage` only covers the Vitest suite.
- Coverage is informational in this repo right now; CI should run it and publish the report, but it is not a percentage gate.
- The shared contract layer in `tests/fixtures/contract-fixtures.json` and `backend/tests/helpers.py` is authoritative for reader/admin/backend wire-shape assertions.
- Backend payload changes should update that contract layer and at least one frontend test plus one backend test.
- CI uses the same local commands via `.github/workflows/tests.yml`: `npm test`, `npm run test:coverage`, and `npm run test:backend`.

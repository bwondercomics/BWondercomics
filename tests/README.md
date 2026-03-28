# Test Guide

## Overview
This repo uses two test runners:

- Frontend/admin tests: `Vitest` with `happy-dom`
- Backend tests: Python `unittest`

The frontend suite covers reader helpers, interaction flows, DOM/render regressions, and focused admin manager flows. The backend suite covers diagnostics/ops, branding, and the core auth/comment/file/post/series route contracts.

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
- `tests/reader-controls.test.js`: reader next/prev/restart behavior
- `tests/reader-fullscreen.test.js`: fullscreen enter/exit and controls timing
- `tests/reader-pointer.test.js`: swipe, drag, double-tap, and edge-zone behavior
- `tests/reader-app.test.js`: reader boot against the live `index.html` contract
- `tests/admin-smoke.test.js`: admin app boot against the live markup contract
- `tests/admin-auth.test.js`: admin session/login/logout contract handling
- `tests/admin-posts.test.js`: post save/render flow
- `tests/admin-entries.test.js`: entry create/render flow
- `tests/admin-media.test.js`: empty media state
- `tests/admin-series.test.js`: series index contract loading and label application
- `tests/admin-preview.test.js`: preview data contract loading and image rendering
- `tests/admin-page-config.test.js`: page-config cache/save contract behavior
- `tests/media-branding.test.js`: admin branding rules
- `tests/diagnostics-snapshot.test.js`: diagnostics snapshot rendering and fallbacks
- `tests/ops-app.test.js`: ops UI rendering states
- `tests/helpers/contracts.js` + `tests/fixtures/contract-fixtures.json`: shared frontend contract fixtures
- `backend/tests/helpers.py`: shared backend route harness and contract seed helpers
- `backend/tests/test_*.py`: backend diagnostics/ops, branding, and core route contract behavior

## Notes
- The production code uses `entry` terminology; older references to `chapter` are legacy.
- `npm run test:coverage` only covers the Vitest suite.

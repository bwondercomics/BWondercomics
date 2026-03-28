# Test Guide

## Overview
This repo uses two test runners:

- Frontend/admin tests: `Vitest` with `happy-dom`
- Backend tests: Python `unittest`

The frontend suite covers reader helpers, DOM/render regressions, and focused admin manager flows. The backend suite covers diagnostics/ops and site-branding behavior.

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
- `tests/admin-smoke.test.js`: admin app boot against the live markup contract
- `tests/admin-posts.test.js`: post save/render flow
- `tests/admin-entries.test.js`: entry create/render flow
- `tests/admin-media.test.js`: empty media state
- `tests/media-branding.test.js`: admin branding rules
- `tests/diagnostics-snapshot.test.js`: diagnostics snapshot rendering and fallbacks
- `tests/ops-app.test.js`: ops UI rendering states
- `backend/tests/*.py`: backend diagnostics/ops and branding behavior

## Notes
- The production code uses `entry` terminology; older references to `chapter` are legacy.
- `npm run test:coverage` only covers the Vitest suite.

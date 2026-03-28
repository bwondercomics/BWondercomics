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

## Setup
Install JavaScript dependencies:

```bash
npm install
```

Install backend dev dependencies into the repo virtualenv:

```bash
./.venv/bin/pip install -r backend/requirements-dev.txt
```

## Frontend Test Files
- `tests/entries.test.js`: entry parsing, sorting, and normalization helpers in `reader/entries.js`
- `tests/state.test.js`: `reader/state.js` persistence behavior
- `tests/data.test.js`: `reader/data.js` loaders
- `tests/render.test.js`: two-page mode/render helpers
- `tests/transform.test.js`: on-page sizing math
- `tests/on-page-frame.test.js`: DOM/render frame sizing regressions
- `tests/series.test.js`: series path helpers
- `tests/comment-targets.test.js`: comment target ID helpers
- `tests/utils.test.js`: admin utility helpers
- `tests/admin-smoke.test.js`: admin app boot against the live `admin/index.html` contract
- `tests/admin-posts.test.js`: post save/render flow via `createPostsManager`
- `tests/admin-entries.test.js`: entry create/render flow via `createEntriesApi`
- `tests/admin-media.test.js`: empty media state via `createMediaManager`
- `tests/media-branding.test.js`: media/admin branding rules
- `tests/diagnostics-snapshot.test.js`: diagnostics UI snapshot and legacy fallback behavior
- `tests/ops-app.test.js`: ops UI rendering states

## Backend Test Files
- `backend/tests/test_diagnostics_ops.py`: diagnostics snapshots, ops access controls, and internal ops callbacks
- `backend/tests/test_site_branding.py`: site-branding asset resolution and HTML/manifest branding

## Documentation Rules
- Do not claim fixed coverage percentages unless they are generated and current.
- When adding tests, prefer focused module/manager tests over brittle app-wide DOM fixtures.
- If an admin test depends on the live markup contract, reuse the shared HTML fixture rather than hand-maintaining an incomplete DOM template.

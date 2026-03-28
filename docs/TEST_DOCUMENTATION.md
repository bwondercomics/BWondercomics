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
- `tests/reader-controls.test.js`: `reader/controls.js` navigation and end-of-entry behavior
- `tests/reader-fullscreen.test.js`: `reader/fullscreen.js` enter/exit and controls-bar timing
- `tests/reader-pointer.test.js`: `reader/pointer.js` swipe, drag, double-tap, and edge zones
- `tests/reader-app.test.js`: `reader/app.js` boot, session gating, shortcuts, and resize behavior against `index.html`
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
- `tests/media-branding.test.js`: media/admin branding rules
- `tests/diagnostics-snapshot.test.js`: diagnostics UI snapshot and legacy fallback behavior
- `tests/ops-app.test.js`: ops UI rendering states
- `tests/helpers/contracts.js` and `tests/fixtures/contract-fixtures.json`: shared frontend contract fixtures
- `tests/helpers/reader-fixture.js`: live reader markup harness from `index.html`

## Backend Test Files
- `backend/tests/test_diagnostics_ops.py`: diagnostics snapshots, ops access controls, and internal ops callbacks
- `backend/tests/test_site_branding.py`: site-branding asset resolution and HTML/manifest branding
- `backend/tests/test_auth_routes.py`: auth/session/register/login/logout route contracts
- `backend/tests/test_comments_routes.py`: comment auth, moderation, duplicate/rate-limit, and censored-phrase handling
- `backend/tests/test_files_routes.py`: page-config/media index contracts, protected asset access, and virtual save behavior
- `backend/tests/test_posts_routes.py`: public/admin post visibility, scheduled promotion, protected-image copy, and asset cleanup
- `backend/tests/test_series_contracts.py`: `series.json` and `data.json` payload contracts
- `backend/tests/helpers.py`: shared in-memory DB, request factory, and contract seeding helpers

## Documentation Rules
- Do not claim fixed coverage percentages unless they are generated and current.
- When adding tests, prefer focused module/manager tests over brittle app-wide DOM fixtures.
- If an admin test depends on the live markup contract, reuse the shared HTML fixture rather than hand-maintaining an incomplete DOM template.
- Reuse the shared contract fixture layer for reader/admin/backend contract assertions instead of hand-copying payload shapes.

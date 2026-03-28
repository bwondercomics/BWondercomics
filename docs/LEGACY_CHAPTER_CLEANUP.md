# Legacy "Chapter" Cleanup Plan

Goal: remove internal "chapter" identifiers safely without breaking runtime wiring.

## Work Completed (2026-01-16)
- Renamed reader module: `reader/chapters.js` → `reader/entries.js`; updated imports in `reader/data.js` and tests/docs.
- `comics.html` now reads DB-backed `entries/entryMeta` payloads instead of legacy `chapters/chapterMeta`.
- Added then removed legacy API aliases:
  - Added `/api/create-entry` + `/api/list-entry-images`
  - Removed `/api/create-chapter` + `/api/list-images`
- Renamed remaining endpoints:
  - `/api/renumber-chapter` → `/api/renumber-entry`
  - `/api/upload-images` → `/api/upload-entry-images`
- Updated admin + reader callers to new endpoints and `entryFolder` payload key.
- Fixed `/api/create-entry` 500 (NameError) in `backend/app/routes/files.py`.
- Minimal UI string cleanup:
  - Reader error message now says “entry data”
  - Admin preview export filename now `battle-bros-entries.json`

## Work Completed (2026-03-28)
- Reader state now uses `currentEntry`; the stale `currentChapter` state key was removed.
- Reader data loading docs/tests now reference `loadEntryData()` and `tests/entries.test.js`.
- Test and reference docs were refreshed to use current entry-based naming.

## Current Runtime Locations (still using "chapter")

Reader UI + JS
- `index.html` (DOM ids/classes like `chapterSelect`, `chapterEndOverlay`, `chapter`)
- `assets/css/main.css` (chapter selectors for reader UI + gallery)
- `reader/dom.js` (queries `#chapter` + related nodes)
- `reader/app.js` (select/menu wiring, `chapterChanged` event)
- `reader/controls.js`, `reader/overlays.js` (end overlay + navigation)
- `reader/state.js` (localStorage payload still uses the legacy `chapter` key)
- `reader/gallery.js`, `reader/analytics.js`, `reader/render.js`
- `reader/comment-targets.js`, `reader/comic-comments.js`
- `reader/config.js` (`ENTRY_NUMBER_PATTERN` still accepts chapter/issue/entry labels)

Admin UI + JS
- `admin/index.html` (ids/classes like `chaptersSection`, `chapterList`, `chapterName`, `chapterPremium`, `chapter-item`)
- `admin/dom.js`, `admin/state.js`
- `admin/entries.js` (internal helpers + logs + DOM classes)
- `admin/utils.js` (folder helpers)
- `admin/series.js`, `admin/uploads.js`, `admin/preview.js`
- `admin/media.js`, `admin/users.js`, `admin/posts.js`, `admin/moderation.js`, `admin/app.js`

Backend + schema
- `backend/app/series_store.py` (payload variables still named `chapters` internally)
- `backend/app/premium.py` (legacy `chapters/` path checks)
- `backend/app/main.py` (legacy `/chapters` static mount)
- `backend/app/file_ops.py`, `backend/app/routes/files.py` (local vars)
- `backend/app/models.py`, `backend/alembic/versions/0003_series_entries.py` (default labels "Chapter/Chapters")

## Future Removal Plan (safe, phased)

### Phase A — Add dual wiring (no break risk)
- [ ] Add new DOM ids/classes prefixed with `entry-` while keeping old `chapter-*`.
- [ ] Update JS to query new ids first, then fall back to old ones.
- [ ] Update CSS selectors to target both class names.
- [ ] Dispatch both events (`entryChanged` + legacy `chapterChanged`) for one release.

### Phase B — Internal rename with compatibility
- [x] Rename reader state keys to `currentEntry` / `pages` (localStorage still serializes to `chapter` for compatibility).
- [ ] Rename admin state keys (`chapters` -> `entries`, `chapterMeta` -> `entryMeta`) with a migration layer on load/save.
- [ ] Rename helpers (`getChapterFolder` -> `getEntryFolder`, etc) and keep thin wrappers for old names.

### Phase C — Backend cleanup
- [ ] Remove legacy `/chapters` static mount once filesystem paths are fully migrated.
- [ ] Remove `chapters/` checks in `premium.py` once protected paths are canonical.
- [ ] Rename internal variables in `series_store.py` to `entries` consistently.
- [ ] Ensure defaults remain DB-driven (`unit_label_*` from DB, not hardcoded).

### Phase D — Final cleanup
- [ ] Remove legacy ids/classes, old event name, and wrapper functions.
- [ ] Update tests + docs to use entry language only.
- [ ] Delete/archive any docs that refer to "chapter" as a system concept.

## Exit Criteria
- [ ] No runtime `chapter*` ids/classes referenced in JS/CSS.
- [ ] No `chapter` keys in state or storage payloads.
- [ ] Backend uses entry naming end-to-end.
- [ ] Tests + docs match entry naming exclusively.

# PYRE Premium Move Regression Plan

## Summary

- PYRE should use the same canonical entry layout as the other series:
  `comics/<series-id>/entries/<label-slug>/<entry-folder>`.
- The old `comics/02/chapters/...` layout is not worth preserving as a special case.
- The intermittent migration happened because entry saves ran the folder move logic, but series premium saves only changed `premiumOnly` and saved metadata.
- Entry-level premium in a public series remains supported.

## Implemented Direction

- `getChaptersRoot()` now returns the canonical root `comics/<series-id>/entries`.
- Entry saves and series premium toggles use the same access-path sync logic.
- Effective premium remains:
  `series.premiumOnly || entryMeta[entry].premium`.
- Public-series premium entries move to `protected/...`; non-premium entries in that same public series stay in `comics/...`.
- Series-level premium toggles sync all entry folders before saving series metadata, so the move no longer depends on saving an entry a second time.

## Backend Guard

- `apply_series_data_save` validates access paths before persisting entry data.
- Premium entries with local image pages must use `protected/` folder and page paths.
- Public entries with local image pages must not use `protected/` folder or page paths.
- Remote or absolute page URLs are ignored by this path validator.
- The backend does not move files; `/api/move-path` remains the only folder move endpoint.

## Verification

- Frontend regression coverage:
  - Entry-level premium inside a public series still moves that entry to `protected/`.
  - Series premium toggles sync all entry paths before saving `admin/series.json`.
- Backend regression coverage:
  - Premium entries with public paths are rejected.
  - Public entries with protected paths are rejected.
  - Premium entries inside public series are accepted with protected paths.
  - Premium prefix checks cover canonical and legacy non-default series paths.
  - Entry-level premium inside an otherwise public series only marks that entry folder as premium.

## Operational Notes

- Existing PYRE entries should be canonicalized to `comics/02/entries/chapters/...`.
- If PYRE is made premium, the expected protected target is
  `protected/comics/02/entries/chapters/...`.
- No Caddy `/comics/*` proxy hardening is included here; that remains a separate performance-sensitive change.

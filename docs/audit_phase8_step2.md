# Audit — Phase 8 Step 2: Backfill Canonical Page Headers

## Status

Phase 8 step 2 is now implemented in the backend backfill path and the earlier appearance-loss diagnosis is no longer current.

The Python backfill now matches the intended V3 header contract closely enough for migration review:

- shell-level `header.appearance` is preserved and sanitized
- per-nav-item `appearance` is preserved and sanitized
- canonical V3 `page.meta.header` writes include `appearance` when present
- dry-run and write summaries now expose per-page `pageReports`

## Implemented changes

### Appearance preservation now exists in the Python backfill

[normalize_header_nav_items](/srv/bw-quality/backend/app/backfill_page_headers.py:121) now sanitizes and retains per-item `appearance`, instead of dropping it during migration.

[normalize_header_config](/srv/bw-quality/backend/app/backfill_page_headers.py:192) now carries sanitized shell appearance through the backfill path by calling the shared header-shell sanitizer. That preserves the V3 shape expected by the admin/editor-side contract:

- `appearance.top`
- `appearance.scrolled`
- `appearance.navItemDefaults`

[create_page_header_meta](/srv/bw-quality/backend/app/backfill_page_headers.py:256) now writes `appearance` onto the canonical V3 header payload when the normalized layout contains it.

### Dry-run reporting is now explicit

[summarize_page_report](/srv/bw-quality/backend/app/backfill_page_headers.py:362) and [backfill_series_page_headers](/srv/bw-quality/backend/app/backfill_page_headers.py:445) now return additive `pageReports` entries for each changed page.

Current report fields are:

- `pageId`
- `slug`
- `beforeHeaderVersion`
- `afterHeaderVersion`
- `overridesCleared`
- `navItemCount`
- `navStyles`
- `disabledBlocks`
- `regions`
- `hasAppearance`
- `hasNavItemAppearance`

That makes the dry-run output usable as an actual migration review artifact instead of only a count summary.

## Verification coverage

Backend coverage now proves the implemented behavior instead of only describing missing gaps.

[test_dry_run_reports_projected_cleanup_without_mutating_db](/srv/bw-quality/backend/tests/test_backfill_page_headers.py:12) now asserts the `pageReports` shape and verifies:

- the dry-run still leaves the database untouched
- the report shows the projected V3 header version
- hidden `status` ends up in `disabledBlocks`
- appearance flags stay false for the plain fixture case

[test_write_mode_persists_v3_header_and_clears_overrides](/srv/bw-quality/backend/tests/test_backfill_page_headers.py:68) now explicitly asserts the hidden-block outcome after override cleanup by checking `header.blocks.status.enabled == false`.

[test_write_mode_preserves_stale_header_appearance_payloads](/srv/bw-quality/backend/tests/test_backfill_page_headers.py:140) seeds a stale V2 header with both shell appearance and per-nav-item appearance, then verifies that `--write`:

- upgrades the header to version 3
- keeps the authored title/copy
- preserves shell appearance branches
- preserves nav-item appearance
- sanitizes out-of-range appearance values through the shared sanitizer path

The test deliberately covers the sanitizer behavior too, not just raw pass-through. In the seeded legacy payload, `angle: 400` is clamped to `360` and `opacity: 1.5` is clamped to `1.0`, proving the backfill now applies the same safety rules as normal saves.

## Scope notes

What step 2 now covers:

- canonical V3 backfill for stale or missing page headers
- `meta.headerOverrides` cleanup on write
- appearance preservation during migration
- per-page migration reporting for dry-run review

What step 2 does not complete:

- reader runtime fallback removal
- `reader/customization.js` legacy fetch retirement
- broader fallback-hook cleanup in the admin/runtime layers

Those remain phase 8 step 3 and step 4 work.

## Summary

| Area | Status |
|---|---|
| Earlier appearance-loss audit | Fixed |
| Required backend code path | Implemented in `backfill_page_headers.py` |
| CLI contract change | Additive `pageReports` only |
| Hidden-block assertion gap | Fixed in backend tests |
| Risk of silent appearance loss on `--write` | Removed for the covered V2/V3 migration path |

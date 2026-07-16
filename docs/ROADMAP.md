# Roadmap: `0.8.5` Baseline to `1.0.0`

This roadmap is scoped to the current codebase in `/srv/bw-quality`.
It is a hardening roadmap for the live comic site, not a productization roadmap.

## Release definition

`1.0.0` means:

- Automated quality gates pass from a documented dev environment.
- Reader/admin core flows are manually verified.
- Backup and restore are documented and re-tested.
- Diagnostics and `/ops/` are trusted enough for routine maintenance.
- No blocking reader/admin regression or known data-corrupting path remains.

Out of scope for `1.0.0`:

- Setup wizard or generic self-host onboarding
- Multi-site or hosted product abstractions
- Stoat/Revolt chat SSO work
- Advanced analytics such as cohort, funnel, or retention features
- Additional reader display modes beyond the shipped paged and vertical-scroll modes

Last updated: 2026-07-16

## `0.7.9` Release Baseline

Goal: make the current repo honest, green, and stable enough to harden against.

- [x] Fix the reader bootstrap contract regression around `loadPageConfigWithFallback(...)`.
- [x] Clear the current JS lint failures and warnings in active files.
- [x] Make `format:check`, `lint:py`, and `format:py:check` use stable executables.
- [x] Sync active version strings so the repo does not claim `1.0.0` early.
- [x] Re-run the full automated gate and keep it green.

## `0.8.0` Reader + Builder Lock

Goal: freeze the existing builder-first architecture as the `1.0` shape.

Worksheet: `docs/READER_BUILDER_QA.md`

- [x] Treat per-series pages, `isHomepage`, draft/publish, and open-reader workflow as the canonical page-builder model.
- [ ] Audit daily-use reader flows end to end: saved progress, entry switching, store entries, premium gating, comments, gallery, latest update, and analytics tracking.
- [ ] Update builder-facing docs to remove stale “future feature” language where the behavior already exists.
- [x] Keep current reader/admin/backend contracts stable unless a regression forces a contract fix.

## `0.8.2` Live Builder Authoring Lock

Goal: make the full-page live builder the canonical authoring surface.

- [x] Replace the old builder-only preview with a same-origin reader iframe canvas.
- [x] Support live target selection, selected-target toolbar actions, drag/drop insertion/move, and chrome-collapsed Preview.
- [x] Add explicit global/series page scopes, same-series reader bindings, and builder-page link targets.
- [x] Add structured CMS modules and page templates for Reader, Feed, Media Gallery, and Entry Gallery.
- [x] Add command/keymap plumbing, local draft undo/redo, and text-module inline editing.
- [x] Lock Desktop/Tablet/Phone preview dimensions at `1920x1080`, `768x1024`, and `375x812`, with admin-only scaling for Desktop.
- [x] Add Phase 12 browser workflow coverage and keep full release verification manual/local.
- [x] Implement the reader-as-block/layout customization plan in
      `docs/completed-builder-plans/READER_BLOCK_AND_LAYOUT_CUSTOMIZATION_PLAN.md`.
- [x] Support no-reader custom pages, strict bound-reader lifecycle validation, paged/vertical reader
      customization, authored sections above/below the reader, and responsive 1-6 column styling.
- [x] Close Phase 6 security, scheduling, atomic mutation, coverage, and public/admin visual parity
      gates.

## `0.8.5` Builder Customization and Refactor Lock

Goal: merge the completed builder customization, responsive-contract repair, and structural
refactor as the stable baseline for the remaining 1.0 work.

- [x] Complete customization Phases 0–7, including panel/column ownership, module layout, reader
      controls, header edit-in-place, header/logo/entry-picker styling, and placeable account/links
      shell blocks.
- [x] Close authenticated Pyre QA corrections for panel visibility, reader-frame borders,
      narrow inspector padding controls, responsive reader-control/Feed authoring, atomic structure
      saves, and publication-safe page saves.
- [x] Verify Phone/Tablet portrait values and Desktop rotation fallback on physical devices; keep
      header glow as a separate optional polish item rather than a roadmap completion gate.
- [x] Refactor the builder through Phases A–G: focused shell controllers, module-editor registry,
      shared builder/reader kernel, split backend sanitizer package, schema parity fixtures, and
      behavior-focused shell suites.
- [x] Archive completed builder plans and synchronize active documentation and version metadata.
- [ ] Merge `builder-incremental-improvement` into `main` after final review.

Follow-up terminology, onboarding, mobile edge cases, and visual polish are tracked independently in
`docs/POLISH_BACKLOG_PLAN.md`; they do not hold the completed 0.8.5 builder lock open.

## `0.9.0` Admin/Ops Hardening

Goal: make maintenance trustworthy without terminal guesswork.

- [ ] Verify diagnostics snapshot refresh, queue/worker behavior, permissions, and core status reporting.
- [ ] Confirm admin diagnostics stays read-only and `/ops/` remains the separate command surface.
- [ ] Run a backup on disposable data and perform a restore drill with exact notes.
- [ ] Update runbook steps anywhere the real recovery or ops flow differs from the docs.

## `0.9.5` Freeze and Polish

Goal: stop expanding scope and close the release cleanly.

- [ ] Limit analytics work to at-a-glance usefulness and correctness; do not expand into advanced analytics.
- [ ] Clean up active branding/version inconsistencies in docs, metadata, and visible labels.
- [ ] Add comments only where logic is genuinely non-obvious.
- [ ] Turn remaining release docs into closeout checklists instead of aspirational feature plans.

## `1.0.0` Release Candidate

Goal: ship only when the site is truly stable.

- [ ] `npm test`
- [ ] `npm run test:backend`
- [ ] `npm run lint`
- [ ] `npm run format:check`
- [ ] `npm run lint:py`
- [ ] `npm run format:py:check`
- [ ] `npm run build`
- [ ] Reader manual QA complete
- [ ] Admin manual QA complete
- [ ] Ops manual QA complete
- [ ] Tag `1.0.0`

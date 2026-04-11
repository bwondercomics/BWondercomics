# Roadmap: `0.7.9` Baseline to `1.0.0`

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
- Vertical-comic support unless it directly fixes the current architecture

Last updated: 2026-04-04

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

- [ ] Treat per-series pages, `isHomepage`, draft/publish, and open-reader workflow as the canonical page-builder model.
- [ ] Audit daily-use reader flows end to end: saved progress, entry switching, store entries, premium gating, comments, gallery, latest update, and analytics tracking.
- [ ] Update builder-facing docs to remove stale “future feature” language where the behavior already exists.
- [ ] Keep current reader/admin/backend contracts stable unless a regression forces a contract fix.

## `0.8.5` UX and Terminology Pass

Goal: make the active UI feel intentionally finished.

- [ ] Remove user-facing legacy `chapter` wording where `entry` or series-specific labels should appear.
- [ ] Tighten navigation and “start here” flow for new readers.
- [ ] Complete a real mobile pass for the reader and the key admin/page-builder flows used in normal work.
- [ ] Fix obvious visual rough edges that make the site feel pre-release.

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

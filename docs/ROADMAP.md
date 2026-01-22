# Website 1.0 Final Roadmap (Tracking Checklist)

This roadmap is scoped to the current codebase in `/srv/bw-quality`.
Use it as a living checklist. Mark items as you complete them.

## How to use
- Update the "Last updated" line when you check items.
- Keep notes next to any item that needs follow-up.
- Each phase has clear exit criteria. Do not move on until those are met.

Last updated: 2026-01-21

## Phase 1 - Lock the Machine (stability + data safety)
Goal: the platform runs clean, stable, and predictable.

### Codebase scan
- [x] Resolve or log all TODO/FIXME/HACK/TEMP in `backend/`, `admin/`, `reader/`, `assets/`, `docs/`. *(Verified 2026-01-13 via rg; no code TODOs)*
- [x] Remove dead code and unused imports in `backend/app/`, `admin/*.js`, `reader/*.js`. *(Unused imports removed; dead-code pass completed 2026-01-21)*
- [x] Add/confirm lint + format scripts in `package.json` and backend tooling. *(Ruff config + scripts wired; lint/format verified 2026-01-21)*
- [x] JS lint passes for `admin/` + `reader/`. *(`npm run lint` clean 2026-01-13)*
- [x] JS test suite passes. *(`npm test` clean 2026-01-13)*
- [x] Legacy "chapter" cleanup plan documented. *(`docs/LEGACY_CHAPTER_CLEANUP.md`)*

### Data safety + integrity
- [x] Verify migrations align with live schema (`backend/alembic/`, `backend/app/models.py`). *(DB at 0014_page_builder head on 2026-01-21)*
- [x] Validate DB write paths for comments, entries, posts, analytics events. *(Checks done 2026-01-21; no legacy targets; posts/media OK; display numbers set)*
- [x] Enforce canonical IDs: `series_id + display_number` for entries. *(Implemented in code/docs; needs DB audit)*
- [x] Entries payload is canonical (`entries/entryMeta/entryFolders`); legacy `chapters/*` removed. *(API + reader/admin updated; tests passing)*
- [x] Media thumbnails + previews are DB-backed; posts reuse media thumbs. *(Thumb pipeline + `posts.media_id` in place)*

### Observability + backups
- [ ] Document backup + restore steps in `docs/` and test once. *(Docs updated; restore not re-tested)*
- [ ] Ensure diagnostics health checks cover DB, dist, backups, and fail2ban snapshots. *(Fail2ban + DB ok; dist/backups are separate endpoints)*
- [x] Confirm fail2ban host snapshot timer is running (`deploy/host-status/`). *(Verified by systemctl output 2026-01-12)*

### Core module docs (only non-obvious logic)
- [ ] Add/refresh module headers in: `backend/app/routes/*`, `reader/`, `admin/`. *(Needs pass)*
- [ ] Comment only where logic is non-obvious (analytics rollups, ID mapping). *(Needs pass)*

### Obvious flaw pass
- [ ] Fix any data-corrupting paths. *(Needs verification)*
- [ ] Fix auth/session edge cases. *(Needs targeted review)*
- [ ] Fix broken navigation flows. *(Manual testing pending)*
- [ ] Mobile reader pass (consolidate with Phase 4 mobile work). *(Deferred to Phase 4)*

### Exit criteria
- [ ] No known data corruption paths.
- [ ] Backup + restore verified.
- [ ] Admin diagnostics show green for core services.

---

## Phase 2 - Admin & Ops Polish
Goal: the control room feels real and reliable.

### Admin UX cleanup
- [ ] Finish read-only diagnostics layout (compact, no destructive actions).
- [ ] Create a dedicated Ops surface (status, logs, jobs, backups).
- [ ] Ensure admin actions are explicit and logged.

### Diagnostics split (read-only admin + separate ops)
- [ ] Hourly report job: snapshot diagnostics to JSON (rolling 24-72 hours).
- [ ] Snapshot contents: health, DB stats/overview, deploy status, backups, service status, test status.
- [ ] Admin diagnostics reads latest snapshot only; show "Last updated".
- [ ] Add "Refresh now" button that triggers a new snapshot (still read-only).
- [ ] Ops diagnostics surface at `/ops/*` for commands/logs/backups (separate UI).
- [ ] Protect `/ops/*` with IP allowlist and/or basic auth + admin login.
- [ ] Keep `ADMIN_COMMANDS_ENABLED=false` for normal admin; allow ops surface to enable temporarily.
- [ ] Validate: snapshots update, admin stays read-only, ops can run tests when enabled.

### Analytics revamp
- [x] Fix analytics data pipeline (tracking → rollups → display). *(Working as of Jan 2026)*
- [x] Ignore zero-page entries in Reader Analytics (click-only entries no longer show reads).
- [ ] Revamp analytics UX to surface actionable insights (retention, drop-off points, popular entries).
- [ ] Add retention + session summary metrics with clear definitions.
- [x] Consider time-based comparisons (this week vs last week). *(Reader analytics shows Δ vs previous window; verified 2026-01-21)*

### Exit criteria
- [ ] Common admin tasks require no terminal access.
- [ ] Diagnostics/ops status is trustworthy and readable.
- [ ] Analytics tell a useful story at a glance.

---

## Phase 3 - Platform Setup System
Goal: new installs feel professional and repeatable.

### Setup wizard
- [ ] Build initial setup flow (domain, branding, admin user, default series).
- [ ] Store branding in DB/config instead of hardcoded assets.

### Connectors
- [ ] Stabilize Bluesky connection flow.
- [ ] Define connector slots for future platforms.

### Exit criteria
- [ ] New install configurable in under 30 minutes.

---

## Phase 4 - Pages & Reader UX
Goal: the site feels like a place, not a dev sandbox.

### Page system
- [ ] Basic pages (About, Projects, Contact) using DB-backed content.
- [ ] Rehabilitate designer flow for landing/series pages.

### Reader stability
- [ ] Fast loads, no crashes, tracking works.
- [ ] Clear "start here" and series navigation.
- [ ] Mobile UX pass (reader + key admin flows).

### Exit criteria
- [ ] New visitors understand the site within 10 seconds.

---

## Phase 5 - Freeze and Ship
Goal: call it done.

- [ ] Tag release 1.0 (git tag).
- [ ] Publish install + admin runbook in `docs/`.

---

## Future / Nice to Have
Items moved here to keep 1.0 scope manageable:

- [ ] "Ops Narrator" - AI summary that reports health/analytics anomalies without making changes.
- [ ] Configurable site branding/theme (only needed if shipping as a platform to others).
- [ ] Additional social connectors beyond Bluesky.
- [ ] Advanced analytics (cohort analysis, funnel visualization).

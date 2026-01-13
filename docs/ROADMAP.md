# Website 1.0 Final Roadmap (Tracking Checklist)

This roadmap is scoped to the current codebase in `/srv/bw-quality`.
Use it as a living checklist. Mark items as you complete them.

## How to use
- Update the "Last updated" line when you check items.
- Keep notes next to any item that needs follow-up.
- Each phase has clear exit criteria. Do not move on until those are met.

Last updated: 2026-01-12

## Phase 1 - Lock the Machine (stability + data safety)
Goal: the platform runs clean, stable, and predictable.

Codebase scan
- [ ] Resolve or log all TODO/FIXME/HACK/TEMP in `backend/`, `admin/`, `reader/`, `assets/`, `docs/`.
- [ ] Remove dead code and unused imports in `backend/app/` and `admin/*.js`.
- [ ] Add/confirm lint + format scripts in `package.json` and backend tooling.

Data safety + integrity
- [ ] Verify migrations align with live schema (`backend/alembic/`, `backend/app/models.py`).
- [ ] Validate DB write paths for comments, entries, posts, analytics events.
- [ ] Enforce canonical IDs: `series_id + display_number` for entries and new comment targets.

Observability + backups
- [ ] Document backup + restore steps in `docs/` and test once.
- [ ] Ensure diagnostics health checks cover DB, dist, backups, and fail2ban snapshots.
- [ ] Confirm fail2ban host snapshot timer is running (`deploy/host-status/`).

Core module docs (only non-obvious logic)
- [ ] Add/refresh module headers in: `backend/app/routes/*`, `reader/`, `admin/`.
- [ ] Comment only where logic is non-obvious (analytics rollups, ID mapping).

Obvious flaw pass
- [ ] Fix any data-corrupting paths.
- [ ] Fix auth/session edge cases.
- [ ] Fix broken navigation flows.
- [ ] Fix mobile reader issues.
- [ ] Fix analytics inaccuracies.

Exit criteria
- [ ] No known data corruption paths.
- [ ] Backup + restore verified.
- [ ] Admin diagnostics show green for core services.

## Phase 2 - Admin & Ops Polish
Goal: the control room feels real and reliable.

Admin UX cleanup
- [ ] Finish read-only diagnostics layout (compact, no destructive actions).
- [ ] Create a dedicated Ops surface (status, logs, jobs, backups).
- [ ] Ensure admin actions are explicit and logged.

Reader analytics
- [ ] Validate analytics rollups and labels (reader analytics page).
- [ ] Add retention + session summary metrics with definitions.

Exit criteria
- [ ] Common admin tasks require no terminal access.
- [ ] Diagnostics/ops status is trustworthy and readable.

## Phase 3 - Platform Setup System
Goal: new installs feel professional and repeatable.

Setup wizard
- [ ] Build initial setup flow (domain, branding, admin user, default series).
- [ ] Store branding in DB/config instead of hardcoded assets.

Branding system
- [ ] Replace "BWonderComics" branding with configurable site title/theme.
- [ ] Expose theme settings in admin.

Connectors
- [ ] Stabilize Bluesky connection flow.
- [ ] Define connector slots for future platforms.

Exit criteria
- [ ] New install configurable in under 30 minutes.

## Phase 4 - Pages & Reader UX
Goal: the site feels like a place, not a dev sandbox.

Page system
- [ ] Basic pages (About, Projects, Contact) using DB-backed content.
- [ ] Rehabilitate designer flow for landing/series pages.

Reader stability
- [ ] Fast loads, no crashes, tracking works.
- [ ] Clear "start here" and series navigation.

Exit criteria
- [ ] New visitors understand the site within 10 seconds.

## Phase 5 - Freeze and Ship
Goal: call it done.

- [ ] Tag release 1.0 (git tag).
- [ ] Publish install + admin runbook in `docs/`.

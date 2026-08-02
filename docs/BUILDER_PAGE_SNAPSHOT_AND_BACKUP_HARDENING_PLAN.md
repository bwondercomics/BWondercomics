# Builder Page Snapshot and Backup/Restore Hardening Plan

Status: In progress; builder recovery Phases 1-3 complete; Phase 4 implemented in this checkout but
live migration/schedule evidence pending; Phase 5 pending
Created: 2026-07-16
Owner surfaces: builder persistence and admin recovery UI, database/file backup automation, restore
verification, and operations documentation

## Purpose

Add two deliberately separate recovery layers before payment and order data arrive:

1. **Builder page snapshots** provide fast, page-level recovery from an accidental save, structural
   edit, or deletion without replacing the whole database.
2. **Database and file backups** provide disaster recovery when the database, server disk, or
   application files are lost or corrupted.

The snapshot system is not a replacement for PostgreSQL backups. A snapshot lives in the same
database as the page it protects, so a failed database or primary disk can remove both. The backup
system is not a practical substitute for page history because restoring the whole database to undo
one builder mistake would roll back unrelated users, content, comments, and future orders.

This plan completes the recovery gate in `docs/ROADMAP_TO_1.0.md` before
`docs/BUILDER_STRIPE_STORE_PLAN.md` begins.

## Settled Decisions

- Keep the 1.0.0 store to one-time purchases; premium access continues through manually issued
  premium codes rather than subscriptions.
- The first store product is physical. Stripe Checkout will collect shipping addresses and use
  simple server-controlled flat shipping prices by supported region. Dynamic carrier quotes are
  not required for v1.
- `/mnt/archive` is the selected off-primary-disk backup destination.
- Builder snapshots retain canonical structured page data. They do not store iframe DOM, preview
  overlays, generated HTML, or unsaved local drafts.
- Restores use current backend validation and sanitization. A historical payload is never copied
  directly into live tables without passing the current structural contract.
- Restore actions are admin-only, explicit, and transactional. A failed restore leaves both the
  current page and its snapshot history unchanged.

## Trusted References

Local source of truth:

- `docs/ROADMAP_TO_1.0.md` (§2.1, §3, §4, and §5) - page recovery, off-primary-disk backup, restore
  drill, and launch gates.
- `backend/app/models.py`, `backend/alembic/versions/0014_page_builder.py`, and
  `backend/alembic/versions/0017_page_scope_bindings.py` - current normalized `BuilderPage`,
  `BuilderSection`, `BuilderModule`, scope, and binding persistence model.
- `backend/app/page_store.py` and `backend/app/routes/page_builder.py` - authoritative page mutation,
  sanitization, transaction, binding, and admin-route boundaries.
- `admin/page-builder/data.js`, `admin/page-builder/draft-manager.js`,
  `admin/page-builder/page-actions.js`, and `admin/page-builder/canvas-mutations.js` - explicit
  draft saves, immediate structural mutations, deletion flows, and canonical response handling.
- `docs/functions/admin-page-builder.md` - current distinction between transient drafts and saved
  API records.
- `Makefile`, `scripts/backup_artifacts.py`, the compatibility and restore scripts,
  `deploy/bwondercomics-backup-{db,files}.*`, `docs/OPERATIONS.md`, and `deploy/README.md` - canonical
  backup, legacy restore, timer, and runbook surfaces.
- `deploy/bwondercomics-compose.yml` - PostgreSQL 16 deployment and the mounted application-data
  paths that must be covered.

Official PostgreSQL 16 references:

- SQL dump and restore overview: https://www.postgresql.org/docs/16/backup-dump.html
- `pg_dump`: https://www.postgresql.org/docs/16/app-pgdump.html
- `pg_restore`: https://www.postgresql.org/docs/16/app-pgrestore.html

The PostgreSQL documentation establishes the operational rules used here: `pg_dump` produces a
transactionally consistent logical backup without blocking ordinary readers or writers; custom
archives are inspected and restored with `pg_restore`; a restore should target a clean database;
`--exit-on-error`/`--single-transaction` prevent silently accepting a partial restore; and restored
databases should be analyzed before use.

## Current State and Confirmed Gaps

### Builder recovery

- Builder pages are normalized across `builder_pages`, `builder_sections`, `builder_modules`, and
  `builder_page_bindings`.
- `BuilderPageSnapshot` retains a versioned baseline and complete pre-state events for every
  committed page, binding, section, module, placement, reorder, migration, and delete mutation.
  Snapshot insert/prune and the owning mutation commit or roll back together.
- Admin-only list, deleted-candidate, validated-detail, and bodyless restore APIs are shipped with
  structured errors, authentication-before-lookup, and `Cache-Control: no-store`.
- The builder toolbar exposes **History** for the active page, while Pages scope controls always
  expose **Deleted pages**. The modal supports validated detail, dirty-workspace blocking,
  confirmation, conflict/retry states, accessible focus, and a persistent success status.
- Current restore replaces canonical saved content while preserving live routing, order,
  publication/homepage state, and bindings. Deleted restore appends an unpublished, non-homepage,
  unbound draft. Both reset local drafts/undo state and start a fresh preview session.
- Local builder undo/redo remains intentionally limited to unsaved drafts. An untouched legacy page
  can still have empty persisted history until its first covered mutation because Phase 2 uses lazy
  coverage rather than a bulk backfill.

### Disaster recovery

- `scripts/backup_artifacts.py` is now the single implementation behind Make, Ops, compatibility
  scripts, and explicit database/file systemd units. Developer targets stay under `var/backups/`;
  production targets hard-set `/mnt/archive/backups/bwondercomics` and fail closed.
- Schema-v1 checksum/manifest-backed publication, mandatory production source/layout checks,
  byte-verified retention, bounded status records, and mode-explicit freshness/error diagnostics are
  implemented and tested. Production uses the pinned `.backup-venv`; local developer backups may
  keep using `.venv`.
- The current restore paths either load plain SQL into an existing database or destructively drop
  the named database. Neither path is the required isolated scratch restore drill.
- Live host inspection on 2026-08-02 confirmed `/dev/sdb1` is a distinct ext4 filesystem mounted
  read/write by the host with no recorded error-remount since boot. The remaining blocker is
  permissions: `/mnt/archive/backups` is root-owned and the `dbmelville` service account cannot
  create the canonical hierarchy. The old BWonderComics timer invokes the rewired compatibility
  target and therefore produces local custom-format manifest-backed artifacts in `var/backups/`;
  it is still the wrong schedule/destination. The stale BattleBros timer still fails; replacement
  installation needs sudo.
- The legacy environment copy was moved, without reading or deleting it, from ordinary backups to
  `var/secret-recovery-quarantine/` with mode `0600`. Credential rotation remains a separate
  security follow-up. All legacy DB/file dumps remain preserved for Phase 5.

## Scope

### In scope

- Versioned, bounded JSON snapshots for builder pages.
- Snapshot coverage for all committed page-content mutations and destructive deletes.
- Admin history and recovery for existing and recently deleted pages.
- Transactional restore through current validators/sanitizers.
- One canonical production database-backup path using PostgreSQL custom-format archives.
- One canonical application-file backup path covering durable public and protected content.
- `/mnt/archive` mount/permission checks that fail closed.
- Checksums, manifests, archive validation, retention, and systemd scheduling.
- An isolated PostgreSQL 16 restore drill plus a temporary-directory file restore drill.
- Durable runbook steps and evidence-based 1.0/store gates.

### Out of scope

- General-purpose document branching, collaborative editing, or merge/conflict UI.
- Persisting every keystroke or every transient preview snapshot.
- Restoring individual modules or sections as standalone records in v1.
- Point-in-time recovery/WAL archiving, continuous replication, or high availability.
- Cloud/off-site replication beyond the selected `/mnt/archive` drive. It can be added later
  without changing the snapshot contract.
- Backing up derived frontend builds, preview images, caches, logs, or test artifacts as primary
  data.
- Storing an unencrypted production environment/secrets file in the regular backup set.
- The roadmap's other ops tasks: diagnostics timer, ops-worker decision, Umami pin, and Caddy
  headers remain separate work even if they are performed during the same ops day.

## Recovery Model

```text
unsaved builder draft
        |
        | explicit Save or immediate structural mutation
        v
canonical builder tables <---- page snapshot restore
        |                           ^
        | snapshot before mutation |
        v                           |
builder_page_snapshots -------------

canonical database + durable files
        |
        | scheduled validated artifacts
        v
/mnt/archive/backups/bwondercomics
        |
        | isolated disaster-recovery drill
        v
scratch PostgreSQL + temporary file tree
```

The two restore directions never cross implicitly. Page restore mutates only one builder page.
Disaster restore reconstructs an isolated full environment first and requires a separate explicit
production-recovery decision.

## Proposed Snapshot Contract

### Database record

Add `BuilderPageSnapshot` through the next Alembic migration with these fields:

```text
id                  UUID primary key
page_id             UUID, indexed, deliberately not a cascading foreign key
scope               series | global
series_id           nullable series id copied from the page
slug                copied page slug for deleted-page discovery
action              bounded action identifier
created_by_user_id  nullable FK to users, ON DELETE SET NULL
payload_version     integer, initially 1
payload              JSON, full canonical recovery document
payload_hash         SHA-256 of stable serialized recovery content
created_at           timezone-aware timestamp, indexed
```

`page_id` must survive deletion of `builder_pages`, so it cannot use the current cascading page
relationships. The copied scope/series/slug fields make deleted snapshots discoverable without
loading or trusting arbitrary JSON. The actor is supplied by the authenticated admin route, not by
the client payload.

Recommended indexes and constraints:

- `(page_id, created_at DESC)` for page history;
- `(scope, series_id, created_at DESC)` for recently deleted discovery;
- `payload_version > 0`;
- an allowlisted action set enforced by service code;
- default retention of the newest 30 snapshot events per page. Only a consecutive event with both
  the same canonical payload hash and the same server action is deduplicated; actor identity is not
  part of that key. This preserves action/actor/timestamp evidence when, for example, an unchanged
  created state is subsequently deleted.

### Version 1 recovery document

```json
{
  "snapshotVersion": 1,
  "page": {
    "id": "uuid",
    "scope": "series",
    "seriesId": "battle-bros",
    "slug": "reader",
    "title": "Reader",
    "pageType": "reader",
    "isPublished": true,
    "isHomepage": true,
    "sortIndex": 0,
    "meta": {},
    "sections": []
  },
  "bindings": [
    {
      "seriesId": "battle-bros",
      "role": "reader"
    }
  ]
}
```

Sections contain their canonical IDs, structural settings, and ordered modules; modules contain
their canonical IDs, type, column, order, and sanitized config. Timestamps may be kept for display
and audit context, but restore writes a new `updated_at` and does not pretend the restored version
was never changed.

The payload is produced by a dedicated recovery serializer over the ORM records. It may reuse the
existing safe page/section/module serializers, but it must not depend on the public response shape
remaining sufficient forever. `snapshotVersion` is independent of the responsive runtime contract
and provides an explicit migration/adaptation point.

### Snapshot timing

Create the snapshot and mutation in one database transaction:

- New page: record one baseline snapshot after the initial page is assembled, in the same commit.
- Existing page: record the complete **pre-mutation** state before the first ORM field changes.
- Page delete: record the complete pre-delete state before removing bindings or the page.
- Restore: record the current state as `pre_restore` before applying the selected snapshot.
- Validation/no-op failure: roll back; do not leave a snapshot that implies a change succeeded.

Pre-mutation snapshots make the immediately previous good state available after a bad save. Stable
payload hashing skips consecutive identical payloads so retries and no-op saves do not consume the
retention window.

Every mutation that changes more than one page must snapshot every affected page. This includes
homepage reassignment, scoped page reorder, and binding changes. Unsaved preview messages and local
draft history never create server snapshots.

### Action identifiers

Use stable server-owned actions such as:

- `page_created`, `page_updated`, `page_deleted`, `page_reordered`;
- `bindings_updated`;
- `section_added`, `section_updated`, `section_deleted`, `sections_reordered`;
- `module_added`, `module_updated`, `module_deleted`, `module_moved`, `modules_reordered`;
- `module_placements_saved`;
- `pre_restore`.

The client can display friendly labels, but it cannot choose the stored action or actor.

## Restore Semantics

### Existing page

- Require admin authentication and a clean builder workspace.
- Lock the current page row for the restore transaction.
- Validate `snapshotVersion`, page identity, and current scope.
- Record the current complete page as `pre_restore` so the restore itself can be undone.
- Replace page content and nested section/module records through current structural validators and
  module/config sanitizers.
- Preserve the page's current identity/routing fields in v1: `id`, `scope`, `seriesId`, `slug`,
  `sortIndex`, `isPublished`, `isHomepage`, and current bindings. Restoring an older content version
  therefore does not silently republish, move, rebind, or change URLs.
- Restore `title`, `pageType`, `meta`, sections, modules, settings, responsive overrides, and stable
  nested IDs when they remain valid.
- Update `updated_at`, commit once, and return the canonical current page response.

Preserving current routing is the safer default for a live site. Publication, homepage, slug, and
binding changes remain explicit existing admin actions. The full historical routing state remains
in the snapshot for audit and a possible later opt-in restore mode.

### Deleted page

- Surface deleted candidates from snapshots whose `page_id` no longer exists.
- Require the original scope and series to still exist and the original slug to be free. Reject
  conflicts; never overwrite or rename another current page automatically.
- Recreate the original page and nested record IDs so internal identity remains coherent.
- Append it to the current scope order as an unpublished, non-homepage, unbound draft regardless of
  historical publication state.
- Require the admin to review it and explicitly republish/rebind it through normal controls.

### Contract drift and failures

- Route every restored field through current validation/sanitization. Unknown future payload
  versions fail with a clear unsupported-version response.
- If a module type or setting is no longer valid, reject the whole restore and report the exact
  incompatible path. Do not silently drop content from a recovery operation.
- Use one transaction for snapshot creation, replacement, and retention pruning. Any error rolls
  back the entire restore.
- Return structured conflict/error codes so the admin UI can distinguish missing history,
  incompatible history, scope/slug conflict, and validation failure.

## Proposed Admin APIs

All routes require the current admin session and return `Cache-Control: no-store`:

- `GET /api/admin/pages/{page_id}/snapshots`
  - newest first; summary metadata only;
  - works for a current page and may return retained history after deletion.
- `GET /api/admin/page-snapshots/deleted?scope={scope}&series_id={series_id}`
  - lists recoverable pages whose original page ID no longer exists.
- `GET /api/admin/page-snapshots/{snapshot_id}`
  - returns sanitized snapshot detail for confirmation/inspection without PII or unrelated data.
- `POST /api/admin/page-snapshots/{snapshot_id}/restore`
  - restores the selected version using the existing/deleted rules above;
  - accepts no replacement page data from the client.

Do not add a public snapshot endpoint. Do not allow client-supplied page IDs, actor IDs, action
labels, payload versions, or snapshot JSON on restore.

## Admin Experience

- Add a **History** action for the active page, near the existing page-level Save/Publish actions.
- Show timestamp, server-owned action label, actor display name when available, and whether the
  snapshot is the state before a save/delete/restore.
- Disable restore while any local module, section, theme, header, page-settings, or structure draft
  is dirty. Reuse `ensureCleanWorkspace(...)` instead of creating a second dirty-state policy.
- Confirm that restoring replaces saved content and may immediately affect a currently published
  page.
- After success, replace `currentPage` with the canonical response, reset transient draft/undo
  state, refresh the iframe snapshot/targets, and show a durable success status.
- Add a small **Deleted pages** recovery entry in the page sidebar or History surface. A restored
  deleted page appears as an unpublished draft requiring explicit review and publication.
- Keep v1 history simple: no visual diff engine, branching, naming, pinning, or standalone
  module/section restore.

## Backup Artifact Contract

### Canonical destinations

```text
/mnt/archive/backups/bwondercomics/
├── database/
├── files/
├── manifests/
└── drill-logs/
```

Production systemd units must set the destination explicitly. Developer-invoked backups may still
use `var/backups/` when `REQUIRE_ARCHIVE_MOUNT=0`, but production scheduling sets
`REQUIRE_ARCHIVE_MOUNT=1` and fails unless `/mnt/archive` is a writable mount from a separate
filesystem.

### Database backup

- Consolidate `make backup-db`, `scripts/backup-db.sh`, and the production systemd service around
  one implementation.
- Run the PostgreSQL 16 client from the deployed database container so client/server major versions
  match.
- Use `pg_dump --format=custom` for a compressed, inspectable archive restored by `pg_restore`.
- Write to a unique `.partial` path, capture stderr, and publish the final artifact only after
  `pg_dump` exits successfully and `pg_restore --list` validates the archive.
- Generate SHA-256 and a non-secret JSON manifest containing creation time, database name, server
  and client versions, Alembic version, artifact size, selected source row counts, and checksum.
- Apply restrictive directory/file permissions and prune old artifacts only after a new validated
  backup is durable.
- Retain at least 30 daily database backups for the 1.0 launch window unless capacity measurements
  justify a longer policy.

### File backup

- Use the checked-in allowlist for `comics/`, `protected/comics/`, original `media/`, original
  `protected/media/`, and `assets/uploads/`. Page-config persistence is database-backed and is not
  archived as a legacy file.
- Explicitly classify rebuildable paths such as `dist/`, releases, post-asset copies, blurred
  previews, caches, logs, and test output rather than letting different scripts make different
  assumptions.
- Write a compressed archive to `.partial`, validate its listing, generate SHA-256 plus a manifest,
  and atomically publish it.
- Schedule file backups weekly and retain enough history to cover at least eight weeks.
- Do not copy `deploy/bwondercomics.env` into this unencrypted archive. Document a separate manual
  secret-recovery requirement without printing or committing secret values.

### Scheduling and failure behavior

- Split nightly database and weekly file backups into explicit systemd services/timers or explicit
  schedules that report their own status.
- Add `RequiresMountsFor=/mnt/archive` and an implementation-level `mountpoint` plus writable probe.
  Refuse to fall back to the primary disk when production archive mode is enabled.
- Use nonzero exits for dump, validation, checksum, manifest, or mount failures so systemd and the
  diagnostics snapshot can report a real failure.
- Reserve exit `75` for lock contention. The DB and file units wait 15,300 and 8,100 seconds,
  respectively, and systemd retries only that status after 15 minutes; ordinary failures exit `1`
  and do not auto-retry.
- Keep only bounded logs without database contents, secrets, customer data, or raw SQL payloads.
- Update diagnostics/ops backup age and artifact discovery if their current path assumptions change.

## Restore Drill Contract

### Database drill

The drill never targets the live database and never requires stopping the live API:

1. Select a validated archive and verify its checksum/manifest.
2. Start an isolated disposable PostgreSQL 16 container and storage volume with no application
   traffic attached.
3. Create a clean scratch database from `template0`.
4. Restore with `pg_restore --exit-on-error --single-transaction` and appropriate scratch-only
   ownership/ACL options.
5. Run `ANALYZE`.
6. Verify Alembic version, required tables/constraints, selected source row counts, builder page
   loading, snapshot payload readability, and representative content/order records once they exist.
7. Record artifact checksum, start/end time, duration, verification results, and operator in a
   non-PII drill log.
8. Destroy the scratch container and volume after success; retain failure logs long enough to fix
   and rerun the drill.

### File drill

1. Verify the file archive checksum/manifest.
2. Extract only into a newly created temporary directory, never the live repository tree.
3. Validate the expected allowlisted roots, representative public/protected files, archive size and
   file counts, and absence of unexpected absolute/traversal paths.
4. Remove the temporary tree after recording the result.

### Production recovery runbook

After the isolated drill passes, update `docs/OPERATIONS.md` with a separate production-disaster
procedure that includes authorization, maintenance mode/API stop, a fresh pre-restore safety dump
when possible, clean-database restore, migrations/version checks, file restore, validation, service
restart, and rollback/escalation steps. The drill command must not accept the production database as
an ordinary argument.

## Implementation Phases

### Phase 1 - Snapshot persistence foundation

Goal: introduce a versioned recovery record and transaction-safe serializer without changing admin
behavior.

Implementation:

- Add the Alembic migration and `BuilderPageSnapshot` model.
- Add stable recovery serialization, hashing, retention, and action constants in a focused builder
  history service rather than growing `page_store.py` indefinitely.
- Thread the authenticated admin user ID from page-builder routes into mutation services.
- Add settings for bounded retention only if the default cannot remain a module constant.
- Add baseline snapshots for new pages.

Acceptance criteria:

- Migration upgrade/downgrade is covered.
- Recovery JSON contains canonical sanitized data and stable nested IDs.
- Snapshot rows survive page deletion and user deletion.
- Identical consecutive states do not consume retention slots.
- Creating a page still returns the existing API response and changes no public behavior.

Completion note (2026-07-16): Complete. Revision `0018_builder_page_snapshots` adds the non-cascading
page-history record, actor `ON DELETE SET NULL` foreign key, scope/version checks, and descending
history/discovery indexes. `backend/app/builder_history.py` now owns the strict version-1 recovery
serializer, full server action vocabulary, stable content hash, consecutive deduplication, and
in-transaction 30-row retention. All page-builder mutation routes pass the authenticated actor into
keyword-only service arguments, while Phase 1 captures only transactional `page_created` baselines;
authenticated admin-created pages retain the admin actor, while the supported legacy `PageConfig`
CLI conversion flushes and captures its complete migrated graph with a null actor under the same
caller-owned commit. Existing-page coverage, backfill, restore, APIs, and UI remain Phase 2-3 work.
Admin and self-service user deletion explicitly clear snapshot actor IDs in addition to the database
FK contract.

Verification completed: isolated Alembic operations upgrade/downgrade schema inspection; a scratch
PostgreSQL 16 drill through `0017 -> 0018 -> 0017 -> head` with the live table, checks, foreign key,
and indexes inspected; `npm run format:check`; `npm run format:py:check`; `npm run lint:py`;
`npm run test:backend` (140 passed); and `git diff --check`.

### Phase 2 - Complete mutation coverage and restore service

Goal: guarantee that every committed builder-page mutation has a recoverable pre-state.

Implementation:

- Cover page metadata/publication, homepage side effects, scope reorder, bindings, section/module
  CRUD, layout/settings, moves/reorders, full-page placements, and page deletion.
- Refactor commit ownership only as far as necessary to make snapshot plus mutation atomic.
- Implement existing-page and deleted-page restore semantics with locks, current sanitizers, stable
  IDs, structured conflicts, and `pre_restore` history.
- Prune retention inside successful mutation transactions.

Acceptance criteria:

- Every successful mutation creates the expected distinct pre-state.
- Validation failures and rolled-back mutations create no misleading history.
- Multi-page mutations snapshot every affected page.
- Restore either completes fully or leaves the database unchanged.
- A deleted page can be recreated safely as an unpublished/unbound draft.
- Restoring a current published page preserves its routing/publication state while recovering its
  saved content.

Completion note (2026-07-29): Complete. Every page, binding, section, module, placement, delete,
header-backfill, and panel-migration writer now validates first, locks affected pages in
deterministic UUID order, captures each distinct complete pre-state with the authenticated actor
when available, and commits or rolls back the snapshot and mutation together. Exact page/section/
module membership is required for reorder operations, cross-page module moves are rejected, and
semantic no-ops preserve timestamps and retention.

`backend/app/builder_history.py` now validates stored integrity/version/action/metadata, sanitizer
parity, UUID uniqueness, and structural ordering before inspection or restore. Current-page restore
records `pre_restore`, reconciles content by stable ID, rechecks reader bindings, and preserves live
routing/publication/bindings/creation time. Deleted-page restore serializes on retained history,
checks series/slug/identity conflicts, and recreates original IDs as an appended unpublished,
non-homepage, unbound draft. Admin-only list, deleted-candidate, detail, and no-body restore routes
return structured errors with `Cache-Control: no-store`; actor email and payload hashes are not
exposed. The Phase 3 completion note below records the subsequently delivered frontend data
helpers, dirty-workspace protection, confirmation/status/focus UI, and preview refresh.

Verification completed: focused history/page-builder/migration suites; `npm run test:backend`
(158 passed, one environment-gated PostgreSQL drill skipped); the PostgreSQL 16 two-session drill
(1 passed) proving restore waits for a concurrent mutation page lock; `npm run format:check`;
`npm run format:py:check`; `npm run lint:py`; and `git diff --check`.

Corrective completion addendum (2026-07-31): Phase 2 scope writers now serialize before re-reading
mutable state: global scope uses the reserved PostgreSQL transaction advisory lock
`pg_advisory_xact_lock(0x42574250, 1)` (`BWBP/global/v1`), while series scope uses the matching
`Series` row lock. The protocol covers page create/update/delete/reorder, bindings, deleted-page
restore, legacy conversion, and panel migration write modes; page-local section/module mutations
and current-page restore continue to serialize on the page row. SQLite deliberately no-ops this
scope helper for unit tests, and unsupported database dialects fail before writing.

Retention is event-aware: only an identical consecutive payload-and-action pair deduplicates, and
the newest 30 events are retained transactionally. Legacy `PageConfig` conversion now locks the
series and fails closed when any builder page already exists, retaining the reader-specific skip
and warning explicitly for other hybrid scopes. Stored recovery JSON validates into a frozen typed
tree with UUID values and tuple collections; malformed/noncanonical/hash/metadata failures return
`snapshot_validation_failed` (400), retired version/sanitizer/type contracts return
`snapshot_incompatible` (409), and unsafe live-page serialization returns
`current_page_incompatible` (409), each with the exact failing path.

Corrective verification completed: focused history/page-builder/panel/header suites (77 passed);
`npm run test:backend` (168 passed, four environment-gated PostgreSQL cases skipped in the normal
SQLite run); and the guarded PostgreSQL 16 suite (4 passed) with an autocommit observer proving an
active lock wait and exact `pg_blocking_pids()` relationship for mutation versus current restore,
concurrent global homepage creation, duplicate deleted-page restore, and two deleted pages appended
into one series. Formatting, Python formatting/lint, and `git diff --check` were rerun after the
documentation closeout.

### Phase 3 - Admin history and recovery UI

Goal: make recovery usable without SQL or direct API calls.

Implementation:

- Add the admin-only data helpers and History/deleted-page UI.
- Reuse canonical dirty-workspace guards and command/result handling.
- Reload the canonical page and reset transient draft state after restore.
- Add accessible status, focus, confirmation, empty, loading, conflict, and failure states.

Acceptance criteria:

- An admin can restore an older current-page version and recover a deleted page.
- Non-admin and public requests cannot discover snapshot metadata.
- Dirty local work cannot be discarded by initiating restore.
- The live preview and saved/public page agree after reload.

Completion note (2026-08-01): Complete. `admin/page-builder/history-panel.js` owns the native modal
timeline/deleted-page views, abort and request-generation protection, server-detail validation,
human event labels, actor fallback, accessible focus/close behavior, confirmation copy, and the
persistent recovery status. Typed helpers in `data.js` preserve structured server errors and send a
strictly bodyless restore POST. `BUILDER_COMMANDS.RESTORE_SNAPSHOT` rechecks the consolidated dirty
workspace immediately before the request and serializes duplicate submissions.

Restore success routes through a dedicated page lifecycle action: the full server page replaces
`currentPage` without a stale nested merge, scoped/link pages and bindings refresh with canonical
response fallback, every draft/selection/structure/inline/undo state resets, the preview session is
explicitly renewed, and Pages/layers/editor/live canvas rerender. The deletion warning now points
admins to retained Deleted pages recovery. Phase 4 backup artifact/scheduling work and Phase 5
restore drills remain unchanged.

Verification completed: recovery data/command/history-shell tests (28 passed); Phase 2 backend
recovery tests (21 passed); `npm test` (680 passed, one skipped); `npm run test:backend` (168 passed,
four environment-gated PostgreSQL cases skipped); formatting and JavaScript/Python lint gates;
production build; `git diff --check`; and `npm run test:visual` (23 passed). The visual recovery
workflows cover current restore reload/public checks, both deleted scopes, strict bodyless requests,
responsive bounds, focus, toolbar fit, and the committed confirmation screenshot. The first full
visual run exposed an empty live-status element occupying an unintended grid row; moving it to a
non-layout overlay restored both Tablet parity baselines, and the complete rerun passed. The
stateful Playwright routes exercise the requested save/restore/delete/recover semantics; no separate
authenticated live-site manual recovery session was performed in this implementation run.

Corrective addendum (2026-08-01): Restore now captures an immutable snapshot/context generation
before the POST and invalidates History on builder/route loads, ordinary page activation, scope
changes, and series changes. A committed response is applied only to its original context. Canonical
state replacement, draft/selection/undo reset, preview-session renewal, Designer route replacement,
and rendering complete before the modal closes; list/binding refresh then runs independently with an
abort signal and stale-context guard. Malformed success responses or post-commit client failures are
reported as committed/reload-required rather than retryable restore failures. The modal now gives
each loading/detail/error/restoring transition an explicit focus target and `aria-busy` state,
connects confirmation labels/descriptions, preserves Back/Cancel/recovered-row focus, and uses an
atomic non-interactive status below the stacked toolbar at 760px. `current_page_incompatible` also
has dedicated safe failure copy.

Corrective verification completed: recovery data/command/history-shell tests (36 passed);
`npm test` (688 passed, one skipped); `npm run test:backend` (168 passed, four environment-gated
PostgreSQL cases skipped); formatting and JavaScript/Python lint gates; production build;
`git diff --check`; and a complete `npm run test:visual` rerun (23 passed). The browser recovery
workflow now proves renewed preview identity, cleared transient selection/draft/undo UI, restored
iframe content before reload, rendered public output afterward, and non-overlap at 700px. The first
complete corrective visual run exposed recovered-row focus being lost when the asynchronous refresh
rerendered the page list; focus is now re-established on the refreshed row and both the focused and
complete visual reruns passed. No authenticated live environment was available for a separate
save-two/restore/`pre_restore`/delete/recover manual session, so that manual gate remains explicitly
unverified.

### Phase 4 - Backup artifact and scheduling hardening

Goal: produce validated database and file artifacts on the selected archive disk through one
authoritative path.

Implementation:

- Resolve the read-only `/mnt/archive` mount and ownership outside the application before enabling
  timers.
- Consolidate backup entry points, choose the durable-file allowlist, and remove secret-file copying
  from ordinary full backups.
- Add custom-format dump, partial-file, validation, checksum, manifest, permissions, and retention
  behavior.
- Point explicit nightly DB and weekly file units at `/mnt/archive/backups/bwondercomics` with
  fail-closed mount checks.
- Update `Makefile`, deployment docs, operations docs, and diagnostics/ops path assumptions together.

Acceptance criteria:

- A missing, read-only, or wrong-filesystem archive mount makes the production job fail visibly.
- No successful job writes the production artifact to `var/backups/` as a fallback.
- Database and file archives validate before publication and have matching manifests/checksums.
- No ordinary artifact contains the production environment file or secrets.
- Three consecutive nightly database backups and one weekly file backup are visible on
  `/mnt/archive` before live Stripe keys are allowed.

Repository implementation note (`2026-08-02`): implemented in this checkout. The canonical engine
now requires a pinned production runtime, all five real source roots, and real fixed archive
directories on the archive device; rechecks the layout under the lock; records per-root file counts;
parses checksum lines exactly; byte-hashes up to 60 sets before retention; and fails with
`retention_integrity_failed` before any deletion when the available protected floor cannot be
proved. Production/local diagnostics are explicit, status records are parsed independently of the
optional catalog, and Admin/Ops show source, root, freshness, and attempts even with no artifacts.
Lock contention exits `75` for the units' sole 15-minute retry path. The Ops worker acknowledges
stale/interrupted `.working` markers without rerunning commands and retains them when the API is
unavailable. Focused artifact, diagnostics, worker, frontend, and unit-contract tests cover the
corrective behavior. Earlier host evidence remains useful: the fail-closed production command did
not create or fall back from the unprovisioned archive root, and a disposable live-`0017` custom
archive validated successfully before being removed. Phase 4 remains incomplete until an operator
provisions the runtime/layout, installs the replacement timers disabled, restarts and verifies the
worker identity, records a service-owned `0017_page_scope_bindings` artifact whose sole missing
critical table is `builder_page_snapshots`, applies `0018_builder_page_snapshots`, records a head
artifact with no missing critical tables, runs both hardened services successfully, enables the
timers, and observes three scheduled DB sets plus one scheduled file set.

### Phase 5 - Restore drill and gate closeout

Goal: prove the artifacts are recoverable and make the procedure repeatable.

Implementation:

- Add the isolated PostgreSQL 16 drill helper and temporary-directory file verification helper.
- Run both against real current artifacts.
- Record the commands, artifact identifiers/checksums, timings, verification results, and recovery
  notes in `docs/OPERATIONS.md` without PII or secrets.
- Re-run the relevant builder, backend, operations, and documentation gates.
- Update this plan and `docs/ROADMAP_TO_1.0.md` with dated completion evidence.

Acceptance criteria:

- A current database archive restores into isolated PostgreSQL with zero ignored restore errors.
- Alembic state, critical records, builder pages, and page snapshots pass verification.
- A current file archive extracts and validates in a temporary tree.
- The drill is repeatable from checked-in instructions.
- The roadmap recovery gate is closed before Store Phase 1 begins; live Stripe keys remain gated on
  the consecutive-backup window and documented drill evidence.

## Required Tests

### Backend

- Migration, constraints, indexes, payload version, and page-delete survival.
- Canonical serialization and stable hash/deduplication.
- Retention boundary and pruning only after successful replacement.
- Snapshot coverage for every page/section/module/binding/reorder mutation.
- No snapshot on authentication, validation, or transaction failure.
- Multi-page homepage/reorder/binding effects.
- Current-page restore, `pre_restore` undo path, and publication/routing preservation.
- Deleted-page recovery, slug/scope conflict, missing series, and forced draft/unbound state.
- Current sanitizer rejection of incompatible historical content.
- Admin-only route access and `Cache-Control: no-store`.

### Frontend

- Snapshot list/detail/deleted-list/restore data helpers.
- History loading, empty/error states, action labels, confirmations, and accessible focus behavior.
- Dirty-workspace restore guard.
- Successful restore replaces canonical state, resets drafts/undo, and refreshes preview targets.
- Deleted-page recovery refreshes the correct global/series sidebar.

### Backup and restore helpers

- Missing archive mount, read-only destination, dump failure, archive-list failure, checksum failure,
  and insufficient permissions all return nonzero without publishing a final artifact.
- Successful database/file backups atomically publish artifact plus matching manifest/checksum.
- Retention never removes the last known-good artifact and runs only after success.
- Restore drill rejects checksum mismatch and never accepts the production database target.
- Scratch restore uses an empty PostgreSQL 16 database, exits on the first error, verifies expected
  schema/data, and cleans up.
- File drill extracts only to a temporary target and rejects unsafe archive paths.

## Verification Gate

Implementation phases use targeted tests while developing, then the final closeout runs:

- `git diff --check`
- `npm run format:check`
- `npm run format:py:check`
- `npm run lint`
- `npm test`
- `npm run test:backend`
- `npm run build`
- `npm run test:visual` when the History UI changes committed visual surfaces
- one manual admin flow: save two distinct page versions, restore the older version, reload, delete
  the page, recover it as a draft, and verify public/preview behavior
- three consecutive scheduled DB artifacts plus one scheduled file artifact on `/mnt/archive`
- one isolated DB restore drill and one temporary-tree file restore drill with recorded evidence

## Completion Record

When all phases are complete, add a dated closeout note containing:

- migration and recovery-contract version;
- snapshot retention and mutation coverage;
- admin restore behavior, including deleted-page safeguards;
- canonical backup destinations, schedules, retention, and secret exclusions;
- archive checksums/artifact dates used by the drill;
- scratch restore duration and verification summary;
- exact automated and manual gates run;
- any residual limitation, especially that `/mnt/archive` is off the primary disk but not off-site.

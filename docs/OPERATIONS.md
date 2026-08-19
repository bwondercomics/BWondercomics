# Operations (runbook)

This is the “don’t make me think” guide for running and maintaining the self‑hosted BWonderComics stack.

## Prereqs

- Docker + Docker Compose (v2) installed
- A filled env file at `deploy/bwondercomics.env`

## Active services (current)

As of **2026-01-17**, the live stack is running:

- `bwondercomics-api` (FastAPI) — host `:8001` → container `:8000`
- `bwondercomics-db` (Postgres) — `127.0.0.1:5434` → `:5432`
- `caddy` (reverse proxy/static) — `:80`, `:443`
- `umami` (analytics UI) — `127.0.0.1:3001` → `:3000`
- `umami-db` (Postgres for Umami)

To verify current state on the server:
`sudo docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-compose.yml ps`

Note: update this section whenever services or ports change.

## The easy way (Makefile)

From the repo root:

- Start/update the stack: `make up`
- Apply DB migrations: `make migrate`
- Follow logs: `make logs` (or `make api-logs`)
- Check status: `make ps`
- Backups: `make backup`

If you don’t have `make`, run the equivalent commands shown in `Makefile`.

## Day‑to‑day recipes

### First run

1. Create env file: `make env` (or `cp deploy/bwondercomics.env.example deploy/bwondercomics.env`)
2. Start services: `make up`
3. Run migrations: `make migrate`
4. Open:
   - Site (via Caddy): `http://localhost/`
   - Admin: `http://localhost/admin/`
   - API (direct, debug only): `http://localhost:8000/healthz`

### Deploy/update on a server

1. Pull latest code: `git pull`
2. Rebuild/restart: `make up`
3. Run migrations: `make migrate`
4. Optional: tail logs: `make api-logs`

### Enable analytics (Umami)

1. In `deploy/bwondercomics.env`, set:
   - `UMAMI_DB_PASSWORD` (generate: `openssl rand -hex 24`)
   - `UMAMI_APP_SECRET` (generate: `openssl rand -hex 32`)
   - `UMAMI_API_USERNAME` and `UMAMI_API_PASSWORD` (Umami user for the admin analytics API; create a read-only account)
2. Start Umami: `make analytics-up` (or `make up-analytics` on a fresh server)
3. Open:
   - Umami via the site proxy: `http://localhost/umami/`
   - Admin analytics summary: `http://localhost/admin/` → **Analytics** (shows counts fetched from Umami; no embedded dashboard)
4. After creating a site in Umami, set `UMAMI_WEBSITE_ID=...` in `deploy/bwondercomics.env`, then run `make restart`.

### Back up everything that matters

The project has two kinds of “state”:

- **Database state (Postgres)**: users, comments, posts, series, entries, media index, page configs
- **File state (on disk)**:
  - Public entry pages: `comics/*/entries/`
  - Premium/private entry pages: `protected/comics/*/entries/`
  - Public media: `media/`
  - Premium/private media: `protected/media/`
  - Post copies (derived): `media/post-assets/`
  - Premium blur previews (derived): `media/previews/`

`scripts/backup_artifacts.py` is the only backup implementation. It creates PostgreSQL custom
archives and allowlisted durable-file archives, validates them, and publishes the JSON manifest
last as the commit marker. Make, Ops, systemd, and the compatibility shell scripts delegate to it.

Developer commands remain local and do not require `/mnt/archive`:

- `make backup-db`
- `make backup-files`
- `make backup`
- override the local destination with `BACKUP_DIR=/tmp/example make backup`

Local artifacts use the same validated layout under `var/backups/`. Legacy filename-shaped SQL,
gzip, or tar files without a valid schema-v1 manifest are not reported as healthy backups.

Production commands hard-set the destination and mount policy; caller overrides cannot redirect
them to primary storage:

- `make backup-db-production`
- `make backup-files-production`
- `make backup-production`

Production artifacts use this layout:

```text
/mnt/archive/backups/bwondercomics/
├── database/database-<UTC>-<run-id>.dump
├── files/files-<UTC>-<run-id>.tar.gz
└── manifests/
    ├── <artifact-id>.sha256
    └── <artifact-id>.json
```

The helper requires `/mnt/archive` to be a real mount on a different device from the repository,
requires the canonical root plus `database/`, `files/`, and `manifests/` to be pre-provisioned real
directories on that device, and performs an actual service-user write/fsync probe. Symlinks, bind
mounts back to primary storage, and resolved paths outside the canonical root fail closed. File jobs
also require all five allowlisted source roots to be real readable directories; empty roots are
valid, while missing or traversal-failing roots abort before a manifest is published. Production
never falls back to `var/backups/`.

#### Provision and install production schedules

First inspect the filesystem rather than blindly remounting it:

```bash
findmnt -no TARGET,SOURCE,FSTYPE,OPTIONS /mnt/archive
journalctl -k --no-pager | grep -Ei 'sdb|ext4|I/O error|read-only'
sudo tune2fs -l /dev/sdb1 | grep -E 'Filesystem state|Errors behavior|Last checked'
```

Repair an unclean filesystem offline before continuing. Once the filesystem is healthy and mounted
read/write, provision the pinned runtime and every archive/status directory as `dbmelville`:

```bash
cd /srv/bw-quality
sudo -u dbmelville make backup-runtime
sudo install -d -m 0750 -o dbmelville -g dbmelville /mnt/archive/backups/bwondercomics
sudo install -d -m 0750 -o dbmelville -g dbmelville \
  /mnt/archive/backups/bwondercomics/database \
  /mnt/archive/backups/bwondercomics/files \
  /mnt/archive/backups/bwondercomics/manifests \
  /mnt/archive/backups/bwondercomics/drill-logs
sudo install -d -m 0750 -o dbmelville -g dbmelville \
  /srv/bw-quality/var/diagnostics/backups \
  /srv/bw-quality/var/ops/queue \
  /srv/bw-quality/var/ops/logs
sudo -u dbmelville test -x /srv/bw-quality/.backup-venv/bin/python
sudo -u dbmelville test -w /mnt/archive/backups/bwondercomics
sudo -u dbmelville test -w /srv/bw-quality/var/diagnostics/backups
```

All five source roots must exist even when they are empty: `comics/`, `protected/comics/`, `media/`,
`protected/media/`, and `assets/uploads/`. Provision any missing root with owner/group
`dbmelville`; do not replace one with a symlink.

Install the replacement units but leave both timers disabled. Disable the obsolete timers only
after recording their current state, then restart the Ops worker and verify its real process
identity:

```bash
sudo cp deploy/bwondercomics-backup-db.service deploy/bwondercomics-backup-db.timer \
  deploy/bwondercomics-backup-files.service deploy/bwondercomics-backup-files.timer \
  /etc/systemd/system/
sudo cp deploy/ops/bwondercomics-ops-worker.service \
  /etc/systemd/system/bwondercomics-ops-worker.service
sudo systemctl daemon-reload
sudo systemctl disable --now bwondercomics-backup.timer battlebros-backup.timer
sudo systemctl disable --now bwondercomics-backup-db.timer bwondercomics-backup-files.timer
sudo systemctl restart bwondercomics-ops-worker.service
systemctl show bwondercomics-ops-worker.service -p User -p Group -p MainPID
ps -o user=,group=,pid=,args= -p "$(systemctl show -p MainPID --value bwondercomics-ops-worker.service)"
```

On startup the worker converts a valid stale `.working` marker to a failed `worker_interrupted` run
only after the API acknowledges it; it never reruns that command. SIGTERM terminates the active
child and reports failure when possible, otherwise the marker remains for startup recovery.

#### Migration-safe first artifacts and service checks

While the live database is still at `0017_page_scope_bindings`, start the hardened DB service once
and identify its new manifest from `var/diagnostics/backups/database.json`. The pre-migration
artifact must be service-owned and must report `builder_page_snapshots` as the sole missing critical
table:

```bash
sudo systemctl start bwondercomics-backup-db.service
jq -e '.lastAttempt.status == "ok"' var/diagnostics/backups/database.json
PRE_MANIFEST="/mnt/archive/backups/bwondercomics/manifests/$(jq -r '.lastSuccess.artifactId' var/diagnostics/backups/database.json).json"
PRE_ARTIFACT="/mnt/archive/backups/bwondercomics/$(jq -r '.relativePath' "$PRE_MANIFEST")"
jq -e '.database.alembicVersion == "0017_page_scope_bindings" and .database.missingCriticalTables == ["builder_page_snapshots"]' "$PRE_MANIFEST"
test "$(stat -c '%U:%G' "$PRE_MANIFEST")" = "dbmelville:dbmelville"
test "$(stat -c '%U:%G' "$PRE_ARTIFACT")" = "dbmelville:dbmelville"
```

Stop if that exact contract is not true. Apply the migration, then start the DB service again. The
post-migration artifact must be at `0018_builder_page_snapshots` with no missing critical tables:

```bash
make migrate
sudo systemctl start bwondercomics-backup-db.service
POST_MANIFEST="/mnt/archive/backups/bwondercomics/manifests/$(jq -r '.lastSuccess.artifactId' var/diagnostics/backups/database.json).json"
POST_ARTIFACT="/mnt/archive/backups/bwondercomics/$(jq -r '.relativePath' "$POST_MANIFEST")"
jq -e '.database.alembicVersion == "0018_builder_page_snapshots" and .database.missingCriticalTables == []' "$POST_MANIFEST"
test "$(stat -c '%U:%G' "$POST_MANIFEST")" = "dbmelville:dbmelville"
test "$(stat -c '%U:%G' "$POST_ARTIFACT")" = "dbmelville:dbmelville"
```

Start the hardened file service once and require successful attempt/catalog ownership before
enabling either timer:

```bash
sudo systemctl start bwondercomics-backup-files.service
jq -e '.lastAttempt.status == "ok"' var/diagnostics/backups/files.json
test "$(stat -c '%U:%G' var/diagnostics/backups/database.json)" = "dbmelville:dbmelville"
test "$(stat -c '%U:%G' var/diagnostics/backups/files.json)" = "dbmelville:dbmelville"
test "$(stat -c '%U:%G' var/diagnostics/backups/catalog.json)" = "dbmelville:dbmelville"
sudo systemctl enable --now bwondercomics-backup-db.timer bwondercomics-backup-files.timer
systemctl list-timers --all 'bwondercomics-backup-*'
```

The database timer runs daily at `03:00 UTC`; the file timer runs Sundays at `04:00 UTC`; both use
`Persistent=true` and a `6h30min` service timeout. Lock contention alone returns `75` and receives a
15-minute retry. DB and file lock waits are 15,300 and 8,100 seconds; ordinary backup errors return
`1` and are not retried automatically. Inspect failures with:

```bash
systemctl status bwondercomics-backup-db.service bwondercomics-backup-files.service --no-pager
journalctl -u bwondercomics-backup-db.service -u bwondercomics-backup-files.service --since today
jq . var/diagnostics/backups/database.json
jq . var/diagnostics/backups/files.json
jq . var/diagnostics/backups/catalog.json
```

The Phase 4 observation gate closed on 2026-08-19. The timer produced eight consecutive nightly
database sets from `database-20260812T030002Z-ca4baefae23f` through
`database-20260819T030002Z-bac87e071852`, plus scheduled weekly file set
`files-20260816T040001Z-db28719014b0`. All attempts and manifests validated; the catalog reported
zero corrupt sets. Continue treating enabled schedules—not manual starts or systemd retries—as the
recurring-health evidence.

#### Verify and retain artifacts

From the archive root, verify the checksum and manifest metadata, then independently list the
archive. Do not treat an artifact without its matching valid JSON manifest as committed.

```bash
cd /mnt/archive/backups/bwondercomics
jq . manifests/<artifact-id>.json
sha256sum --check manifests/<artifact-id>.sha256
docker compose --env-file /srv/bw-quality/deploy/bwondercomics.env \
  -f /srv/bw-quality/deploy/bwondercomics-compose.yml exec -T bwondercomics-db \
  pg_restore --list < database/<artifact-id>.dump
tar -tzf files/<artifact-id>.tar.gz
```

Database retention keeps every validated set from the last 30 days and at least the newest 30.
File retention keeps every validated set from the last 56 days and at least the newest eight.
Before pruning, the helper byte-hashes up to 60 newest candidate sets until it can prove the
protected floor and an eligible deletion candidate. Corrupt sets never count toward the floor. If
the available floor cannot be proved within the cap, it records `retention_integrity_failed`, keeps
the newly published artifact as `lastSuccess`, deletes nothing, and exits nonzero. Otherwise it
removes only byte-verified eligible sets, manifest marker first. The catalog records the bounded
integrity scan. Crash-orphaned `.partial` staging paths are ignored and cleaned after 24 hours by a
later serialized run.

Safe failure codes are recorded under `var/diagnostics/backups/`. A failed latest attempt is an
error while the prior `lastSuccess` remains visible. Correct mount/permission/lock/dump/validation
causes and rerun the same production target; do not rename an incomplete set into place manually.
The deployed Compose API explicitly uses `BWC_BACKUP_DIAGNOSTICS_MODE=production`, so missing
production records are errors and fresh `var/backups/` artifacts cannot make production healthy.
Local development defaults to `local`. Any other mode is a settings error.

The durable-file allowlist contains only `comics/`, `protected/comics/`, original `media/`, original
`protected/media/`, and `assets/uploads/`. It excludes previews, post copies, builds, releases,
caches, logs, diagnostics/Ops state, tests, and environment/secret files. Page configuration is now
database-backed and is not included as a file.

The legacy environment copy formerly under ordinary backups was quarantined without reading it at
`var/secret-recovery-quarantine/bwondercomics.env.bak.20260210-135117` with mode `0600` on
2026-08-02. Rotate credentials as a separate security task. Maintain an encrypted/offline secret
recovery procedure; ordinary backups intentionally cannot recreate production secrets.

### Isolated restore drill

`scripts/restore_drill.py` proves recoverability without accepting a production database target.
Select committed schema-v1 database and file artifact IDs, then run:

```bash
cd /srv/bw-quality
make restore-drill \
  DATABASE_ARTIFACT_ID=database-YYYYMMDDTHHMMSSZ-xxxxxxxxxxxx \
  FILE_ARTIFACT_ID=files-YYYYMMDDTHHMMSSZ-xxxxxxxxxxxx
```

The helper re-hashes each artifact and validates its exact manifest/checksum contract before doing
anything else. The database drill starts the locally available `postgres:16-alpine` image with no
network, creates a fixed scratch database from `template0`, streams the custom archive through
`pg_restore --exit-on-error --single-transaction --no-owner --no-privileges --no-tablespaces`,
runs `ANALYZE`, and compares Alembic state plus every critical-table row count with the manifest. It
also loads a bounded ordered builder graph and verifies snapshot constraints, indexes, and every
stored versioned payload. The container and its anonymous storage volume are removed on success or
failure.

The file drill manually extracts only regular allowlisted members into a newly created temporary
directory. It rejects absolute/traversal, duplicate, non-file, out-of-root, and sensitive paths;
then compares file counts, per-root counts, and uncompressed bytes with the manifest before removing
the temporary tree. Neither drill writes into the repository data roots. A mode-`0640` non-secret
success or failure record is written under `/mnt/archive/backups/bwondercomics/drill-logs/`.

#### Recorded drill: 2026-08-12

- Database artifact `database-20260812T001940Z-03c34abf4194`, SHA-256
  `30d3e811f3b230762134dbed26e576320f99a8cc27973888fb90cc6d5c3502ac`, restored and verified in
  4.252 seconds. PostgreSQL major 16, Alembic `0018_builder_page_snapshots`, all 12 critical table
  counts, builder graph, snapshot schema, and cleanup passed. The new snapshot table contained zero
  rows, matching the immediate post-migration manifest, so there was no stored payload to inspect in
  this first drill.
- File artifact `files-20260812T002104Z-4e3e93cdaa70`, SHA-256
  `6f6fd092b97b293e91e0405e1885db47ac03009df3a2ee2ba23c41a86ecc2b21`, restored and verified in
  4.923 seconds. All 286 allowlisted files (575,861,942 uncompressed bytes) matched the five
  per-root counts; sensitive-path rejection and temporary-tree cleanup passed.
- Combined record:
  `drill-logs/restore-drill-20260812T003924Z-15fb10d6d61e.json` (10.498 seconds total). Two earlier
  failure records demonstrate fail-closed cleanup while correcting the helper; neither touched the
  production database or live file roots.

#### Final snapshot-bearing drill: 2026-08-19

- Database artifact `database-20260819T050323Z-ee1c072fb897`, SHA-256
  `49b1a3363cf5f7fea29e81198b207daa613c927cc56f933cacf1f92fdcd81424`, restored and verified in
  4.506 seconds. PostgreSQL major 16, Alembic `0018_builder_page_snapshots`, all 12 critical table
  counts, the builder graph, snapshot schema, and all 33 stored snapshot payloads passed. The
  isolated container and anonymous volume were removed.
- Scheduled file artifact `files-20260816T040001Z-db28719014b0`, SHA-256
  `3a08acf149a5b26243c5a77ec4b24578598a23f8d0dc0ca76bf372b0c0262a4f`, restored and verified in
  4.980 seconds. All 286 allowlisted files (575,861,942 uncompressed bytes), the five per-root
  counts, sensitive-path checks, and temporary-tree cleanup passed.
- Combined record:
  `drill-logs/restore-drill-20260819T050339Z-f78438f7dd32.json` (11.208 seconds total). This drill
  followed the authenticated `mechamoms/test` save-two/restore/delete/recover exercise, closing the
  first drill's zero-snapshot limitation without touching production data during restoration.

### Production disaster recovery (destructive; authorization required)

The isolated drill above is the normal verification command. A production restore is a separate,
deliberately manual incident procedure. It must have an identified incident owner, a second-person
review when available, exact artifact IDs/checksums, an announced maintenance window, and a written
rollback decision before any destructive command runs.

1. Confirm the failure domain and preserve evidence. Do not replace a healthy database merely to
   test a backup. Record service state, logs, current Alembic revision, target artifact IDs, and why
   repair in place is unsafe.
2. If the current database is readable, run `bwondercomics-backup-db.service` once and verify the
   new safety artifact before proceeding. Preserve the current durable-file roots separately if
   corruption is not already present.
3. Verify the selected database/file manifests and checksums, run the isolated `make restore-drill`
   command against those exact IDs, and require a successful drill log. Never restore from a bare
   archive that lacks its committed manifest and checksum.
4. Put the site into the announced maintenance state, stop `bwondercomics-api`, and stop the backup
   timers for the incident. Keep PostgreSQL available only to the recovery operator. Confirm the
   Compose project, volume, database name, and artifact paths a second time.
5. Recreate the named application database from `template0`, then stream the selected custom
   archive through PostgreSQL 16 `pg_restore` with `--exit-on-error --single-transaction`. Apply
   scratch-tested owner/ACL handling deliberately; do not accept ignored restore errors. Run
   `ANALYZE` afterward.
6. If file recovery is required, extract into a new staging directory first. Compare the extracted
   roots and counts with the manifest, retain or snapshot the current live roots, and only then
   synchronize the five allowlisted roots (`comics/`, `protected/comics/`, `media/`,
   `protected/media/`, and `assets/uploads/`). Ordinary artifacts intentionally contain no
   environment file or secrets; restore those through the separate encrypted secret procedure.
7. Run migrations only when the restored artifact revision is older than the deployed code. Verify
   Alembic state, critical row counts, builder pages/snapshots, representative public/protected
   media, authentication, and admin/public health before restarting normal traffic.
8. Restart the API, remove maintenance mode, re-enable both backup timers, and record start/end
   times plus validation results. If any verification fails, stop traffic again and restore the
   pre-incident safety artifact or escalate; do not improvise partial table/file merges.

### Legacy restore commands (not drill evidence)

The existing Make commands accept legacy plain-SQL/tar inputs and are destructive. They do not
validate schema-v1 manifests and must not be cited as recovery proof.

- Restore DB: `make restore-db FILE=var/backups/db-YYYYMMDD-HHMMSS.sql CONFIRM=1`
- Restore files: `make restore-files FILE=var/backups/files-YYYYMMDD-HHMMSS.tar.gz CONFIRM=1`

## Where data lives

- Postgres data is stored in a Docker volume (`bwondercomics-db`).
  - The database name inside Postgres can differ (e.g., `bwondercomics_quality` via `BWC_DB_NAME`).
  - Volume name and database name are separate; they do not need to match.
- Uploaded images live in the repo tree:
  - Series pages: `comics/<seriesId>/entries/` (public) or `protected/comics/<seriesId>/entries/` (premium/private)
- Media library files live under `media/` (public) or `protected/media/` (premium/private).
- `media/post-assets/` is derived (auto-copied post images) and should not be edited manually.
- `media/previews/` is derived (blurred previews for premium media) and should not be edited manually.
- `protected/` is server-only and ignored by git (tracked only via `protected/.gitkeep`).

## Frontend builds

- Edit source files in `reader/`, `admin/`, `assets/`, and top-level HTML files.
- Rebuild static output with `./scripts/frontend-build.sh` (also snapshots `dist/` into `var/releases/`).

## Diagnostics + Ops

- Admin diagnostics is read-only with respect to host operations and is backed by
  `var/diagnostics/admin/latest.json`. Manual refresh only regenerates that snapshot.
- The hourly refresh timer calls `deploy/host-status/diagnostics_refresh.py`. The host collector
  first writes non-secret, mode-0640 `var/diagnostics/host.json` atomically, then requests the
  combined API snapshot.
- Host diagnostics covers root/archive capacity and mount safety, Compose container health,
  diagnostics/Ops/backup systemd units, and certificate expiry for the main and chat hosts. Disk
  thresholds are 20% warning and 10% error; certificate thresholds are 30 and 7 days; host data
  warns after 90 minutes and errors after two hours.
- `/ops/` is a separate surface for queued commands, run output, and detailed backups.
- `/ops/` uses the same admin account/session as `/admin/`; if the cookie is missing or expired, the page falls back to its own login form.
- Protect `/ops/` with both `OPS_ALLOWED_IPS` (backend, comma-separated) and `CADDY_OPS_ALLOWED_IPS` (proxy, space-separated).
- Recommended local-only policy:
  `OPS_ALLOWED_IPS=127.0.0.1/32,::1/128,10.0.0.0/24`
  `CADDY_OPS_ALLOWED_IPS=127.0.0.1/32 ::1/128 10.0.0.0/24`
- If you change either allowlist in `deploy/bwondercomics.env`, recreate `bwondercomics-api` and `caddy`; restarting containers is not enough to reload env-file changes.
- Production intentionally uses `ADMIN_COMMANDS_ENABLED=true` with both LAN/local allowlists. Set it
  false and disable the worker if browser-triggered commands are ever retired.
- The API host port is bound to loopback. Do not re-expose it on `0.0.0.0`; doing so bypasses the
  Caddy `/ops/` IP gate.
- The host ops worker reads queue files from `var/ops/queue/` and writes logs to `var/ops/logs/`.
- The worker must run as `dbmelville` so browser-triggered production backups share ownership with
  manual and scheduled artifacts.
- Ensure `var/diagnostics/admin` and `var/ops/{queue,logs}` are writable by the API container user, or refresh/queue actions will fail with permission errors.
- Queue publication is atomic and mode 0640. `queue_publish_failed`, `command_unavailable`, and
  `worker_interrupted` are terminal failure codes; `run_create_failed` is returned when the
  durable database row cannot be created. Stale work is never rerun automatically.
- Apply Alembic head before starting the worker. Revision `0019_admin_ops_legacy_command`
  non-destructively preserves early-installation command history while relaxing its obsolete
  extra `command` column for catalog-based runs.
- A missing `HOST_AUTOMATION_TOKEN` exits with configuration status 78. The worker does not restart
  that status and rate-limits other startup failures.
- Install the timer and worker from `deploy/README.md`, then run the read-only
  `make admin-ops-check` acceptance command.

### Admin/Ops acceptance

After any environment, unit, Caddy, API-bind, or Umami-image change:

```bash
cd /srv/bw-quality
make admin-ops-check

systemctl show bwondercomics-ops-worker.service \
  -p User -p Group -p MainPID -p ActiveState -p SubState -p NRestarts
systemctl list-timers --all --no-pager diagnostics-refresh.timer

stat -c '%U:%G %a %n' \
  var/diagnostics/host.json \
  var/diagnostics/admin/latest.json \
  var/ops/queue \
  var/ops/logs
```

From an authenticated, allowlisted `/ops/` session, queue `stack-logs` as the non-disruptive worker
smoke test. Require `queued` → `running` → `completed`, bounded output, no leftover `.json` or
`.working` marker, and no increase in the worker restart count. Confirm `/ops/` remains 403 from a
non-allowlisted client.

The public Caddy contract is one-year per-host HSTS without `includeSubDomains` or preload, nosniff,
`strict-origin-when-cross-origin`, `SAMEORIGIN`, and CSP `frame-ancestors 'self'`. A broader CSP is
deliberately deferred because the builder emits inline styles.

Umami is pinned to version `3.0.3` at digest
`sha256:28f263fe06f79ebffa5a6a6e9bd33b7a278e9342a88e0bdac812416c9f9e4361`. Upgrade it only as a
separate migration with an Umami database backup and raw-SQL analytics-panel validation.

Live acceptance completed on 2026-08-19: the final `make admin-ops-check` requires current
Alembic head in addition to the configuration, unit, host-health, bind, image, and header checks.
The allowlisted `stack-logs` run completed with exit 0, bounded output, mode-0640 service-owned
logging, no queue markers, and zero worker restarts. Main/admin/Ops-denial/chat responses carried
the required headers; Umami 3.0.3 heartbeat and existing analytics panels passed; the MechMoms
`test` builder preview rendered under the same-origin frame policy. Host status retains one
expected warning for the stopped optional `chat-legacy-ui` rollback container (`stoat-web`);
required and actively deployed containers have no errors.

## Common issues

- **Admin says “not an admin”**: the first registered account becomes `admin`; after that, an existing admin must promote roles in the **Users** section.
- **Ports already in use**: change `BWC_API_PORT` / `BWC_DB_PORT` in `deploy/bwondercomics.env`.
- **403 on admin saves**: make sure you’re signed in and your account role is `admin`.

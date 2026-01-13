# Operations (runbook)

This is the “don’t make me think” guide for running and maintaining the self‑hosted BWonderComics stack.

## Prereqs
- Docker + Docker Compose (v2) installed
- A filled env file at `deploy/bwondercomics.env`

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
- **File state (on disk)**: comic page images (`comics/*/entries/`), media library files (`media/`)

Run:
- `make backup` (writes to `var/backups/` by default)

### Restore (be careful)
DB restore and file restore are destructive by nature.

- Restore DB: `make restore-db FILE=var/backups/db-YYYYMMDD-HHMMSS.sql CONFIRM=1`
- Restore files: `make restore-files FILE=var/backups/files-YYYYMMDD-HHMMSS.tar.gz CONFIRM=1`

## Where data lives
- Postgres data is stored in a Docker volume (`bwondercomics-db`).
  - The database name inside Postgres can differ (e.g., `bwondercomics_quality` via `BWC_DB_NAME`).
  - Volume name and database name are separate; they do not need to match.
- Uploaded images live in the repo tree:
  - Series pages: `comics/<seriesId>/entries/`
- Media library files live under `media/` (index + tags are stored in Postgres).

## Frontend builds
- Edit source files in `reader/`, `admin/`, `assets/`, and top-level HTML files.
- Rebuild static output with `./scripts/frontend-build.sh` (also snapshots `dist/` into `var/releases/`).

## Common issues
- **Admin says “not an admin”**: the first registered account becomes `admin`; after that, an existing admin must promote roles in the **Users** section.
- **Ports already in use**: change `BWC_API_PORT` / `BWC_DB_PORT` in `deploy/bwondercomics.env`.
- **403 on admin saves**: make sure you’re signed in and your account role is `admin`.

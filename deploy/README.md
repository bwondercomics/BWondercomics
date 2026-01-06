# BWonderComics LAN Deployment

This repo includes a backend for serving the BWonderComics site and providing API endpoints for the admin panel (saving JSON, uploads, and auth/comments).

Backend: FastAPI + Postgres (`backend/`, `deploy/bwondercomics-db-compose.yml`).

## Quick Start (LAN)

## FastAPI + Postgres (recommended)

### Option A: Docker stack (recommended; no pip/venv on host)

```bash
cd /srv/bwondercomics
docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-compose.yml up -d --build
docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-compose.yml exec bwondercomics-api alembic -c backend/alembic.ini upgrade head
```

Open:
- Same machine: `http://localhost:8000/`
- Another device on LAN: `http://<server-lan-ip>:8000/`

### Option B: Host Python (requires python3-venv + pip)

1) Create the env file:

```bash
cd /srv/bwondercomics
cp deploy/bwondercomics.env.example deploy/bwondercomics.env
chmod 600 deploy/bwondercomics.env
```

Edit `deploy/bwondercomics.env` and set at least:
- `APP_SECRET` (generate: `openssl rand -hex 32`)
- `BWC_DB_PASSWORD` (generate: `openssl rand -hex 24`)

2) Start Postgres (localhost-only):

```bash
cd /srv/bwondercomics
docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-db-compose.yml up -d
```

3) Install backend deps:

```bash
cd /srv/bwondercomics
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
```

4) Run migrations:

```bash
cd /srv/bwondercomics
. .venv/bin/activate
alembic -c backend/alembic.ini upgrade head
```

5) Run:

```bash
cd /srv/bwondercomics
set -a
. ./deploy/bwondercomics.env
set +a
. .venv/bin/activate
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --proxy-headers
```

Open:
- Same machine: `http://localhost:8000/`
- Another device on LAN: `http://<server-lan-ip>:8000/`

### systemd (FastAPI)

Use the included units:
- `deploy/bwondercomics-api.service` (system)
- `deploy/bwondercomics-api.user.service` (user)


## Firewall (UFW)

If UFW is enabled, allow LAN access:

```bash
sudo ufw allow from 10.0.0.0/24 to any port 8000 proto tcp
```

## Nightly Backups (systemd timer)

This backs up the persistent data directory (by default, `/srv/bwondercomics/var/bwondercomics`) to your archive drive.

1) Ensure the destination exists and is writable by the service user:

```bash
sudo mkdir -p /mnt/archive/backups/bwondercomics
sudo chown -R dbmelville:dbmelville /mnt/archive/backups/bwondercomics
```

2) Install + enable the timer:

```bash
sudo cp /srv/bwondercomics/deploy/bwondercomics-backup.service /etc/systemd/system/bwondercomics-backup.service
sudo cp /srv/bwondercomics/deploy/bwondercomics-backup.timer /etc/systemd/system/bwondercomics-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now bwondercomics-backup.timer
```

3) Run once immediately and check:

```bash
sudo systemctl start bwondercomics-backup.service
sudo systemctl status bwondercomics-backup.service --no-pager
systemctl list-timers | rg bwondercomics-backup || true
```

Backups land in `/mnt/archive/backups/bwondercomics/` and old backups are pruned after 30 days by default (edit the `RETENTION_DAYS` value in `deploy/bwondercomics-backup.service`).

## Analytics (Umami)

Umami is an optional part of the Docker stack (compose profile: `analytics`). The FastAPI backend proxies Umami under `/umami/` and serves `/analytics.js` to inject the tracker into the main site pages.

1) Set the Umami secrets in `deploy/bwondercomics.env`:

- `UMAMI_DB_PASSWORD` (generate: `openssl rand -hex 24`)
- `UMAMI_APP_SECRET` (generate: `openssl rand -hex 32`)
- `UMAMI_API_USERNAME` + `UMAMI_API_PASSWORD` (create a read-only user in Umami; used by the admin Analytics tab to call the API)

2) Start Umami (if the stack is already up):

```bash
cd /srv/bwondercomics
make analytics-up
```

3) Open Umami:

- Via the main site (recommended): `http://<server-lan-ip>:8000/umami/`
- Default login: `admin` / `umami` (change it right away in Umami settings)

4) Create a website in Umami and copy the Website ID, then add it to the server env:

Edit `deploy/bwondercomics.env` and set:

```bash
UMAMI_WEBSITE_ID=<paste-website-id>
```

5) Restart the backend so `/analytics.js` picks up the Website ID:

```bash
make restart
```

Notes:
- By default, the backend proxies Umami at `/umami`, so the tracker and admin API calls stay same-origin.
- Docker stack: use `UMAMI_UPSTREAM=http://umami:3000` (this is the backend default when running in Docker).
- Host Python backend: use `UMAMI_UPSTREAM=http://127.0.0.1:3000` (and keep `UMAMI_BIND=127.0.0.1` so Umami isn’t exposed to the LAN).
- Don’t set `UMAMI_BASE_PATH` when using the `/umami` proxy (the proxy handles the path rewriting).
- When you go live, you’ll usually put Umami behind a reverse proxy (e.g. `stats.bwondercomics.com`) and set `UMAMI_BASE_URL=https://stats.bwondercomics.com`.

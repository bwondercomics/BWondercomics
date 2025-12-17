# BWonderComics LAN Deployment

This repo includes a backend for serving the BWonderComics site and providing API endpoints for the admin panel (saving JSON, uploads, and auth/comments).

Recommended backend: FastAPI + Postgres (`backend/`, `deploy/bwondercomics-db-compose.yml`).
Legacy backend: single-file Python server (`legacy/server.py`) with JSON-on-disk auth/comments (units in `deploy/legacy/`).

## Quick Start (LAN)

## FastAPI + Postgres (recommended)

### Option A: Docker stack (recommended; no pip/venv on host)

```bash
cd /srv/bwondercomics
docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-compose.yml up -d --build
docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-compose.yml exec bwondercomics-api alembic -c backend/alembic.ini upgrade head
```

(Optional legacy import)

```bash
docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-compose.yml exec bwondercomics-api python -m backend.app.import_legacy
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

5) (Optional) Import legacy users/comments from `DATA_ROOT`/`data/`/`comments/`:

```bash
cd /srv/bwondercomics
. .venv/bin/activate
python -m backend.app.import_legacy
```

6) Run:

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

Note: stop any legacy `bwondercomics`/`battlebros` service first if it's running, since both bind port `8000`.

## Legacy `legacy/server.py` (JSON-on-disk)

1) Create the persistent data dir (users + comments):

```bash
cd /srv/bwondercomics
mkdir -p var/bwondercomics
chmod 700 var/bwondercomics
```

2) Create the env file (secrets + bind/port):

```bash
cd /srv/bwondercomics
cp deploy/bwondercomics.env.example deploy/bwondercomics.env
chmod 600 deploy/bwondercomics.env
```

Edit `deploy/bwondercomics.env` as needed.

3) Run:

```bash
cd /srv/bwondercomics
set -a
. ./deploy/bwondercomics.env
set +a
python3 legacy/server.py
```

Open:
- Same machine: `http://localhost:8000/`
- Another device on LAN: `http://<server-lan-ip>:8000/`

## systemd (optional)

### Option A: system service (best; needs sudo)

1) Install the unit:

```bash
sudo cp /srv/bwondercomics/deploy/legacy/bwondercomics.service /etc/systemd/system/bwondercomics.service
sudo systemctl daemon-reload
```

2) Enable and start:

```bash
sudo systemctl enable --now bwondercomics
sudo systemctl status bwondercomics --no-pager
```

3) Logs:

```bash
sudo journalctl -u bwondercomics -f
```

### Option B: user service (no sudo; persists after reboot only with linger)

1) Install + start for your user:

```bash
mkdir -p ~/.config/systemd/user
cp /srv/bwondercomics/deploy/legacy/bwondercomics.user.service ~/.config/systemd/user/bwondercomics.service
systemctl --user daemon-reload
systemctl --user enable --now bwondercomics.service
```

2) For automatic start on reboot (without you logging in), enable linger (needs sudo once):

```bash
sudo loginctl enable-linger "$USER"
```

3) Logs:

```bash
journalctl --user -u bwondercomics -f
```

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

This runs Umami locally (Postgres + Umami) and injects the tracker into the main site pages via `/analytics.js` served by the FastAPI backend.

1) Create the Umami env file:

```bash
cd /srv/bwondercomics
cp deploy/umami.env.example deploy/umami.env
chmod 600 deploy/umami.env
```

Edit `deploy/umami.env` and set `UMAMI_DB_PASSWORD` + `UMAMI_APP_SECRET` (generate with `openssl rand -hex 32`).

2) Start Umami:

```bash
cd /srv/bwondercomics
docker compose --env-file deploy/umami.env -f deploy/umami-compose.yml up -d
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
docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-compose.yml restart bwondercomics-api
```

Notes:
- By default, the backend proxies Umami at `/umami`, so the admin panel can embed it and the tracker can load from the same origin.
- If you want to hide port `3000` from the LAN, set `UMAMI_BIND=127.0.0.1` in `deploy/umami.env`, and set `UMAMI_UPSTREAM=http://127.0.0.1:3000` in `deploy/bwondercomics.env`.
- When you go live, you’ll usually put Umami behind a reverse proxy (e.g. `stats.bwondercomics.com`) and set `UMAMI_BASE_URL=https://stats.bwondercomics.com`.

## Migrating from legacy `battlebros` names

If you already installed older unit/env names, see `deploy/legacy/` for the legacy units and update paths to `legacy/server.py`.

If your existing data lives in `/srv/bwondercomics/var/battlebros`, either keep it (leave `DATA_ROOT` pointed there) or move it and update `DATA_ROOT`:

```bash
mv /srv/bwondercomics/var/battlebros /srv/bwondercomics/var/bwondercomics
```

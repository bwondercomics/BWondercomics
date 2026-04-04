# BWonderComics LAN Deployment

This repo includes a backend for serving the BWonderComics site and providing API endpoints for the admin panel (saving JSON, uploads, and auth/comments).

Backend: FastAPI + Postgres (`backend/`, `deploy/bwondercomics-db-compose.yml`).

## Quick Start (LAN)

## FastAPI + Postgres (recommended)

### Option A: Docker stack (recommended; no pip/venv on host)

```bash
cd /srv/bw-quality
docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-compose.yml up -d --build
docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-compose.yml exec bwondercomics-api alembic -c backend/alembic.ini upgrade head
```

Open:

- Same machine: `http://localhost:8000/`
- Another device on LAN: `http://<server-lan-ip>:8000/`

### Option B: Host Python (requires python3-venv + pip)

1. Create the env file:

```bash
cd /srv/bw-quality
cp deploy/bwondercomics.env.example deploy/bwondercomics.env
chmod 600 deploy/bwondercomics.env
```

Edit `deploy/bwondercomics.env` and set at least:

- `APP_SECRET` (generate: `openssl rand -hex 32`)
- `BWC_DB_PASSWORD` (generate: `openssl rand -hex 24`)

2. Start Postgres (localhost-only):

```bash
cd /srv/bw-quality
docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-db-compose.yml up -d
```

3. Install backend deps:

```bash
cd /srv/bw-quality
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
```

4. Run migrations:

```bash
cd /srv/bw-quality
. .venv/bin/activate
alembic -c backend/alembic.ini upgrade head
```

5. Run:

```bash
cd /srv/bw-quality
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

## Deploying public branding changes

The OG image and favicon are controlled through the admin Media tab and stored on the default `page-config.json` record as `site.ogImagePath` and `site.faviconPath`.

When you change the public page head markup, `backend/app/site_branding.py`, `backend/app/routes/site_branding.py`, or `deploy/Caddyfile`, deploy with:

```bash
cd /srv/bw-quality
./scripts/frontend-build.sh
docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-compose.yml restart bwondercomics-api caddy
```

Notes:

- Restarting `bwondercomics-api` is required because uvicorn is not running with hot reload.
- Restarting `caddy` is required if the Caddyfile changed or if the exact-path branding proxy routes were not active yet.
- Origin HTML/manifest responses use `Cache-Control: no-store`, so the change is visible on the next request. Social platforms may still hold a cached preview.
- Only `public` media can be used for branding. Invalid or protected paths fall back to `assets/banner1.png` for OG and `assets/boywondericon.png` for favicon.

## Firewall (UFW)

If UFW is enabled, allow LAN access:

```bash
sudo ufw allow from 10.0.0.0/24 to any port 8000 proto tcp
```

## Nightly Backups (systemd timer)

This backs up the persistent data directory (by default, `/srv/bwondercomics/var/bwondercomics`) to your archive drive.

1. Ensure the destination exists and is writable by the service user:

```bash
sudo mkdir -p /mnt/archive/backups/bwondercomics
sudo chown -R dbmelville:dbmelville /mnt/archive/backups/bwondercomics
```

2. Install + enable the timer:

```bash
sudo cp /srv/bw-quality/deploy/bwondercomics-backup.service /etc/systemd/system/bwondercomics-backup.service
sudo cp /srv/bw-quality/deploy/bwondercomics-backup.timer /etc/systemd/system/bwondercomics-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now bwondercomics-backup.timer
```

3. Run once immediately and check:

```bash
sudo systemctl start bwondercomics-backup.service
sudo systemctl status bwondercomics-backup.service --no-pager
systemctl list-timers | rg bwondercomics-backup || true
```

Backups land in `/mnt/archive/backups/bwondercomics/` and old backups are pruned after 30 days by default (edit the `RETENTION_DAYS` value in `deploy/bwondercomics-backup.service`).

## Diagnostics Snapshot Timer + Ops Worker

The admin **Diagnostics** tab is now snapshot-backed and read-only. The separate `/ops/` surface handles queued commands, run output, and backup actions.

Set these in `deploy/bwondercomics.env`:

- `HOST_AUTOMATION_TOKEN` (generate: `openssl rand -hex 32`)
- `OPS_ALLOWED_IPS` (backend allowlist, comma-separated IP/CIDR entries, for example `127.0.0.1/32,::1/128,10.0.0.0/24`)
- `CADDY_OPS_ALLOWED_IPS` (proxy allowlist, space-separated IP/CIDR entries, for example `127.0.0.1/32 ::1/128 10.0.0.0/24`)
- `ADMIN_COMMANDS_ENABLED=true` only when you want the `/ops/` page to queue host jobs

Recommended LAN-only setup:

```bash
OPS_ALLOWED_IPS=127.0.0.1/32,::1/128,10.0.0.0/24
CADDY_OPS_ALLOWED_IPS=127.0.0.1/32 ::1/128 10.0.0.0/24
```

Notes:

- Caddy and the backend do not parse allowlists the same way, so keep `OPS_ALLOWED_IPS` and `CADDY_OPS_ALLOWED_IPS` in sync using the formats above.
- If you change either allowlist in `deploy/bwondercomics.env`, recreate `bwondercomics-api` and `caddy`; a plain container restart will not reload updated env-file values.
- `/ops/` is intended for LAN/local access. If you browse the public site through a VPN or public egress IP, Caddy will still deny `/ops/` unless that network is explicitly allowlisted.

Install the hourly diagnostics refresh timer:

```bash
sudo cp /srv/bw-quality/deploy/host-status/diagnostics-refresh.service /etc/systemd/system/diagnostics-refresh.service
sudo cp /srv/bw-quality/deploy/host-status/diagnostics-refresh.timer /etc/systemd/system/diagnostics-refresh.timer
sudo systemctl daemon-reload
sudo systemctl enable --now diagnostics-refresh.timer
```

Install the host ops worker:

```bash
sudo cp /srv/bw-quality/deploy/ops/bwondercomics-ops-worker.service /etc/systemd/system/bwondercomics-ops-worker.service
sudo systemctl daemon-reload
sudo systemctl enable --now bwondercomics-ops-worker.service
```

Notes:

- Admin diagnostics reads the latest file in `var/diagnostics/admin/latest.json`.
- The worker processes queue files from `var/ops/queue/` and writes run logs to `var/ops/logs/`.
- If `OPS_ALLOWED_IPS` or `CADDY_OPS_ALLOWED_IPS` is empty, `/ops/` stays disabled.
- Ensure `var/diagnostics`, `var/diagnostics/admin`, `var/diagnostics/admin/history`, `var/ops/queue`, and `var/ops/logs` are writable by the API container user (`uid=1000` in the default compose setup), or diagnostics refreshes and queued ops jobs will fail with permission errors.

## Analytics (Umami)

Umami is an optional part of the Docker stack (compose profile: `analytics`). The FastAPI backend proxies Umami under `/umami/` and serves `/analytics.js` to inject the tracker into the main site pages.

1. Set the Umami secrets in `deploy/bwondercomics.env`:

- `UMAMI_DB_PASSWORD` (generate: `openssl rand -hex 24`)
- `UMAMI_APP_SECRET` (generate: `openssl rand -hex 32`)
- `UMAMI_API_USERNAME` + `UMAMI_API_PASSWORD` (create a read-only user in Umami; used by the admin Analytics tab to call the API)

2. Start Umami (if the stack is already up):

```bash
cd /srv/bw-quality
make analytics-up
```

3. Open Umami:

- Via the main site (recommended): `http://<server-lan-ip>:8000/umami/`
- Default login: `admin` / `umami` (change it right away in Umami settings)

4. Create a website in Umami and copy the Website ID, then add it to the server env:

Edit `deploy/bwondercomics.env` and set:

```bash
UMAMI_WEBSITE_ID=<paste-website-id>
```

5. Restart the backend so `/analytics.js` picks up the Website ID:

```bash
make restart
```

Notes:

- By default, the backend proxies Umami at `/umami`, so the tracker and admin API calls stay same-origin.
- Docker stack: use `UMAMI_UPSTREAM=http://umami:3000` (this is the backend default when running in Docker).
- Host Python backend: use `UMAMI_UPSTREAM=http://127.0.0.1:3000` (and keep `UMAMI_BIND=127.0.0.1` so Umami isn’t exposed to the LAN).
- Don’t set `UMAMI_BASE_PATH` when using the `/umami` proxy (the proxy handles the path rewriting).
- When you go live, you’ll usually put Umami behind a reverse proxy (e.g. `stats.bwondercomics.com`) and set `UMAMI_BASE_URL=https://stats.bwondercomics.com`.

## Chat (Stoat/Revolt) + OIDC

The compose file includes an optional `chat` profile with:

- `stoat-web`
- `stoat-api`
- `stoat-events`
- `stoat-autumn`
- `stoat-january`
- `stoat-redis`
- `stoat-mongodb`
- `stoat-rabbitmq`

There is also an optional `chat-delta` profile with `stoat-delta` for releases that separate API and Delta.

Important compatibility note (2026-02-10):

- The pinned web image is `ghcr.io/revoltchat/client@sha256:5cc05853c215a02ee3d1f71390ad00af06c7ef53602b4b21f419f8702607d8c8`.
- This pins the currently working legacy client so deploys are deterministic (no floating `:master`).
- This client still serves native chat login forms only.
- It does not currently expose an OIDC callback/provider login UI path in the deployed login bundle.
- To bridge this gap on x86_64, `GET /api/chat/sso/start` now performs server-side Stoat session bootstrap and redirects to `https://chat.bwondercomics.com/sso/bootstrap`, which hydrates the client auth store automatically.
- Caddy hardening now redirects `/login`, `/login/create`, `/login/reset`, and `/login/resend` to `https://bwondercomics.com/api/chat/sso/start` (so native chat login UI is not exposed), and blocks public `auth/account/create|reset_password|reverify` endpoints on the chat domain.
- Caddy hardening now proxies `POST /servers/create` (including `/api` and `/0.8` variants) through FastAPI admin-gating so regular users are blocked while site admins can still create/manage servers.
- Caddy hardening also blocks public invite creation (`POST /channels/{id}/invites`) and invite-join (`POST /invites/{code}`) routes on the chat domain.
- Optional `CHAT_OFFICIAL_INVITE_CODE` lets backend SSO auto-join every signed-in site user to one official server.
- `autumn` and `january` are now routed under `https://chat.bwondercomics.com/autumn` and `/january`; this is required for avatar/media and voice workflows in the client.
- Stoat's newer `for-web` image is the long-term path, but upstream docs currently note no `amd64` web-client build.

### 1) Set env values

In `deploy/bwondercomics.env`, set at least:

```bash
OIDC_ISSUER=https://bwondercomics.com
CHAT_PUBLIC_URL=https://chat.bwondercomics.com
CHAT_API_PUBLIC_URL=https://chat.bwondercomics.com/api
CHAT_LOGIN_URL=https://chat.bwondercomics.com/login
OIDC_CLIENT_STOAT_ID=stoat
OIDC_CLIENT_STOAT_SECRET=<set-a-random-secret>
OIDC_CLIENT_STOAT_REDIRECT_URIS=https://chat.bwondercomics.com/login/callback
CHAT_OFFICIAL_INVITE_CODE=<your-main-server-invite-code>
STOAT_RABBITMQ_USER=rabbituser
STOAT_RABBITMQ_PASSWORD=rabbitpass
```

Also set the Stoat image tags and any release-specific env vars required by your pinned Stoat version.

If RabbitMQ was already initialized with different credentials, either:

- recreate the `stoat-rabbitmq` volume, or
- add/update the `rabbituser` account in the running broker so it matches `STOAT_RABBITMQ_USER`/`STOAT_RABBITMQ_PASSWORD`.

### 2) Start chat services

```bash
cd /srv/bw-quality
make chat-up
```

If you only changed the web image tag, you can recreate only the web container:

```bash
docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-compose.yml --profile chat up -d stoat-web
```

If your pinned release requires a dedicated Delta service:

```bash
docker compose --env-file deploy/bwondercomics.env -f deploy/bwondercomics-compose.yml --profile chat --profile chat-delta up -d stoat-delta
```

### 3) Restart backend after OIDC env changes

```bash
cd /srv/bwondercomics
make restart
```

### 4) Verify OIDC endpoints

```bash
curl -fsSL https://bwondercomics.com/.well-known/openid-configuration | jq .
curl -fsSL https://bwondercomics.com/.well-known/jwks.json | jq .
```

Expected:

- discovery returns issuer `https://bwondercomics.com`
- discovery includes `authorization_endpoint` at `https://bwondercomics.com/oidc/authorize`
- JWKS returns at least one key and the configured `kid`

### 5) Verify chat routing

```bash
curl -I https://chat.bwondercomics.com/
```

If you need live logs while testing:

```bash
make chat-logs
```

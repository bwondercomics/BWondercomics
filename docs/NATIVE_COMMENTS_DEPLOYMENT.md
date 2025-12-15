# Deploying Built-In Auth + Comments

This project includes a lightweight self-hosted account + comments system in `server.py`.

## Local-Only Quick Start (No Router Needed)
On the Ubuntu server machine:
1) Get the repo onto the machine.
2) Set env vars and run:
   - `export APP_SECRET="$(openssl rand -hex 32)"`
   - `export REGISTRATION_MODE=open` (or `invite`)
   - `export INVITE_CODE=YOUR_CODE` (only if using invite mode)
   - `export DATA_ROOT=/var/lib/battlebros` (recommended)
   - `export HOST=0.0.0.0` (so other devices on your LAN can reach it)
   - `export PORT=8000`
   - `python3 server.py`
3) Open:
   - On the server machine: `http://localhost:8000/`
   - From another device on the same Wi‑Fi/LAN: `http://<server-lan-ip>:8000/`

If UFW is enabled: `sudo ufw allow 8000/tcp`

## What’s Stored Where
- Users: `<DATA_ROOT>/users.json` (or `data/users.json` if `DATA_ROOT` not set)
- Comments: `<DATA_ROOT>/comments/<targetId>.json` (or `comments/<targetId>.json` if `DATA_ROOT` not set)

These folders are in `.gitignore` and should be backed up on your server machine.

## Environment Variables
- `APP_SECRET` (required): signing key for session cookies. Generate: `openssl rand -hex 32`
- `PORT` (optional, default `8000`)
- `HOST` (optional, default empty, binds all)
- `COOKIE_SECURE` (optional): set to `true` when behind HTTPS (or rely on `X-Forwarded-Proto: https`)
- `REGISTRATION_MODE` (optional): `open` | `invite` | `closed`
- `INVITE_CODE` (required if `REGISTRATION_MODE=invite`)
- `DATA_ROOT` (optional): absolute path for persistence (stores `users.json` and a `comments/` subfolder)

## Recommended Server Setup (Ubuntu)
1) Copy the repo to your server machine.
2) Set env vars (at minimum `APP_SECRET`).
3) Run it behind a reverse proxy with HTTPS (Caddy or Nginx).
   - Proxy `https://yourdomain` → `http://127.0.0.1:8000`
   - Ensure proxy sends `X-Forwarded-Proto: https` so cookies can be `Secure`.
4) Run as a service (systemd) so it survives reboots.
5) Back up `DATA_ROOT` (or `data/` + `comments/`) on a schedule.

## Notes
- The first registered account becomes `admin` automatically.
- Chapter comments are keyed by the current chapter selector value; feed comments are keyed by post id/title.

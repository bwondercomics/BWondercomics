# Battle Bros LAN Deployment

This repo includes a small Python server (`server.py`) that serves the site and provides API endpoints for the admin panel (saving JSON, uploads, and built-in auth/comments).

## Quick Start (LAN)

1) Create the persistent data dir (users + comments):

```bash
cd /srv/bwondercomics
mkdir -p var/battlebros
chmod 700 var/battlebros
```

2) Create the env file (secrets + bind/port):

```bash
cd /srv/bwondercomics
cp deploy/battlebros.env.example deploy/battlebros.env
chmod 600 deploy/battlebros.env
```

Edit `deploy/battlebros.env` as needed.

3) Run:

```bash
cd /srv/bwondercomics
set -a
. ./deploy/battlebros.env
set +a
python3 server.py
```

Open:
- Same machine: `http://localhost:8000/`
- Another device on LAN: `http://<server-lan-ip>:8000/`

## systemd (optional)

### Option A: system service (best; needs sudo)

1) Install the unit:

```bash
sudo cp /srv/bwondercomics/deploy/battlebros.service /etc/systemd/system/battlebros.service
sudo systemctl daemon-reload
```

2) Enable and start:

```bash
sudo systemctl enable --now battlebros
sudo systemctl status battlebros --no-pager
```

3) Logs:

```bash
sudo journalctl -u battlebros -f
```

### Option B: user service (no sudo; persists after reboot only with linger)

1) Install + start for your user:

```bash
mkdir -p ~/.config/systemd/user
cp /srv/bwondercomics/deploy/battlebros.user.service ~/.config/systemd/user/battlebros.service
systemctl --user daemon-reload
systemctl --user enable --now battlebros.service
```

2) For automatic start on reboot (without you logging in), enable linger (needs sudo once):

```bash
sudo loginctl enable-linger "$USER"
```

3) Logs:

```bash
journalctl --user -u battlebros -f
```

## Firewall (UFW)

If UFW is enabled, allow LAN access:

```bash
sudo ufw allow from 10.0.0.0/24 to any port 8000 proto tcp
```

## Nightly Backups (systemd timer)

This backs up the persistent data directory (`/srv/bwondercomics/var/battlebros`) to your archive drive.

1) Ensure the destination exists and is writable by the service user:

```bash
sudo mkdir -p /mnt/archive/backups/battlebros
sudo chown -R dbmelville:dbmelville /mnt/archive/backups/battlebros
```

2) Install + enable the timer:

```bash
sudo cp /srv/bwondercomics/deploy/battlebros-backup.service /etc/systemd/system/battlebros-backup.service
sudo cp /srv/bwondercomics/deploy/battlebros-backup.timer /etc/systemd/system/battlebros-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now battlebros-backup.timer
```

3) Run once immediately and check:

```bash
sudo systemctl start battlebros-backup.service
sudo systemctl status battlebros-backup.service --no-pager
systemctl list-timers | rg battlebros-backup || true
```

Backups land in `/mnt/archive/backups/battlebros/` and old backups are pruned after 30 days by default (edit the `RETENTION_DAYS` value in `deploy/battlebros-backup.service`).

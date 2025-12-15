# Deploying Remark42 to Ubuntu Server

## Quick Setup for Your Ubuntu Server

### Step 1: Install Docker on Ubuntu Server (5 minutes)

SSH into your Ubuntu server, then run:

```bash
# Update package list
sudo apt update

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group (so you don't need sudo)
sudo usermod -aG docker $USER

# Log out and back in for group changes to take effect
exit
# Then SSH back in
```

**Verify Docker is installed:**
```bash
docker --version
docker compose version
```

---

### Step 2: Transfer Files to Ubuntu Server (5 minutes)

You need to copy these files from your Windows development machine to Ubuntu:

**Required files:**
- `docker-compose.yml`
- `.env.example`

**From Windows (PowerShell):**

```powershell
# Replace USER and SERVER_IP with your Ubuntu server details
scp docker-compose.yml USER@SERVER_IP:~/
scp .env.example USER@SERVER_IP:~/
```

**OR use FileZilla/WinSCP** if you prefer a GUI.

---

### Step 3: Configure on Ubuntu Server (5 minutes)

SSH into your Ubuntu server:

```bash
ssh USER@SERVER_IP
```

**Generate secret key:**
```bash
openssl rand -hex 32
```
Copy the output!

**Create `.env` file:**
```bash
cp .env.example .env
nano .env
```

**Edit the values:**
```bash
REMARK_SECRET=<paste-your-generated-secret>
GOOGLE_CLIENT_ID=<your-google-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
ADMIN_EMAIL=<your-email@gmail.com>
REMARK_URL=http://YOUR_SERVER_IP:8080
```

Press `Ctrl+X`, then `Y`, then `Enter` to save.

---

### Step 4: Start Remark42 (2 minutes)

```bash
# Start Remark42
docker compose up -d

# Check if it's running
docker compose ps

# View logs
docker compose logs -f
```

You should see:
```
NAME      IMAGE                      STATUS
remark42  umputun/remark42:latest    Up
```

---

### Step 5: Configure Router/Firewall (10 minutes)

**On your router:**
1. Find "Port Forwarding" settings
2. Forward external port `8080` → Ubuntu server's local IP, port `8080`

**On Ubuntu server (if firewall is enabled):**
```bash
# Allow port 8080
sudo ufw allow 8080

# Check firewall status
sudo ufw status
```

---

### Step 6: Update Google OAuth (5 minutes)

**Get your public IP:**
```bash
curl ifconfig.me
```

**In Google Cloud Console:**
1. Go to your OAuth credentials
2. Add new Authorized redirect URI:
   ```
   http://YOUR_PUBLIC_IP:8080/auth/google/callback
   ```
3. Save changes

---

### Step 7: Update Your Website (2 minutes)

**On your Windows development computer:**

Edit `feed.html` (line ~13):
```javascript
var remark_config = {
  host: 'http://YOUR_PUBLIC_IP:8080',  // Change this
  site_id: 'bwondercomics',
  // ...
};
```

Edit `reader/comic-comments.js` (line ~32):
```javascript
window.remark_config = {
  host: 'http://YOUR_PUBLIC_IP:8080',  // Change this
  site_id: 'bwondercomics',
  // ...
};
```

---

### Step 8: Test It! (5 minutes)

1. **From your development machine**, open:
   ```
   file:///C:/Users/dbmel/battle-bros-reader-dev/feed.html
   ```

2. **Scroll to comments section**

3. **Click "Sign in with Google"**

4. **Post a test comment** ✅

---

## Useful Commands

```bash
# View logs
docker compose logs -f

# Restart Remark42
docker compose restart

# Stop Remark42
docker compose down

# Start Remark42
docker compose up -d

# Check status
docker compose ps

# Update Remark42 to latest version
docker compose pull
docker compose up -d
```

---

## Troubleshooting

### Can't connect to Remark42
1. Check Docker is running: `docker compose ps`
2. Check logs: `docker compose logs -f`
3. Verify port forwarding on router
4. Check Ubuntu firewall: `sudo ufw status`

### Google OAuth fails
1. Verify redirect URI matches: `http://YOUR_IP:8080/auth/google/callback`
2. Check `.env` file has correct Client ID/Secret
3. Restart Docker: `docker compose restart`

### Want to use a domain name instead of IP?

**Use free Dynamic DNS** (if your home IP changes):
1. Sign up for DuckDNS: https://www.duckdns.org
2. Get subdomain: `battlebros.duckdns.org`
3. Update `REMARK_URL` in `.env`
4. Update Google OAuth redirect URI
5. Use in feed.html and comic-comments.js

---

## Production Setup (Optional - for HTTPS)

For production with SSL/HTTPS, you'll want:

1. **Domain name** pointing to your server
2. **Reverse proxy** (Nginx or Caddy)
3. **Let's Encrypt SSL** (free)

Let me know if you want instructions for this!

---

## Data Backup

**Comments are stored in:**
```
~/remark42_data/
```

**To backup:**
```bash
# Create backup
tar -czf remark42-backup-$(date +%Y%m%d).tar.gz remark42_data/

# Copy to your Windows machine
scp remark42-backup-*.tar.gz USER@WINDOWS_IP:~/backups/
```

**To restore:**
```bash
tar -xzf remark42-backup-YYYYMMDD.tar.gz
docker compose restart
```

---

## Summary

✅ Your setup:
- Ubuntu Server running Remark42
- Accessible from internet via your public IP
- Free (except electricity!)
- Full control over data

Next step: Deploy your website to make it accessible online, then update the URLs to your production domain!

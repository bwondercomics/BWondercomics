# Remark42 Comment System Setup Guide (archived)

> Note: The site now ships with a built-in auth + comments API. Use this guide only if you still want to run Remark42 instead of the native system.

## Quick Start (30 minutes)

Follow these steps to get comments working on your feed!

---

## Step 1: Get Google OAuth Credentials (10 minutes)

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com
   - Sign in with your Google account

2. **Create a New Project**
   - Click "Select a project" → "New Project"
   - Name: "Battle Bros Comments"
   - Click "Create"

3. **Configure OAuth Consent Screen**
   - Go to "APIs & Services" → "OAuth consent screen"
   - User Type: **External**
   - Click "Create"
   
   Fill in:
   - App name: `Battle Bros Comments`
   - User support email: (your email)
   - Developer contact: (your email)
   - Click "Save and Continue"
   - Skip scopes → "Save and Continue"
   - Skip test users → "Save and Continue"

4. **Create OAuth Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: **Web application**
   - Name: `Remark42`
   
   **Authorized redirect URIs:**
   - Add: `http://localhost:8080/auth/google/callback`
   - (Later add your production URL: `https://bwondercomics.com/auth/google/callback`)
   
   - Click "Create"

5. **Copy Your Credentials**
   - You'll see a popup with**Client ID** and **Client Secret**
   - Keep this window open or copy them somewhere safe!

---

## Step 2: Install Docker on Your Server Computer (5 minutes)

### Windows:
1. Download Docker Desktop: https://www.docker.com/products/docker-desktop
2. Run installer
3. Restart computer
4. Launch Docker Desktop

### Mac:
1. Download Docker Desktop for Mac
2. Install and launch it

### Linux:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Log out and back in
```

**Verify installation:**
```bash
docker --version
docker compose version
```

---

## Step 3: Configure Remark42 (5 minutes)

1. **Navigate to your project** folder:
   ```bash
   cd C:\Users\dbmel\battle-bros-reader-dev
   ```

2. **Generate a secret key:**
   
   **Windows PowerShell:**
   ```powershell
   -join ((33..126) | Get-Random -Count 64 | ForEach-Object {[char]$_})
   ```
   
   **Mac/Linux:**
   ```bash
   openssl rand -hex 32
   ```
   
   Copy the output!

3. **Create `.env` file:**
   
   Copy `.env.example` to `.env`:
   ```bash
   copy .env.example .env     # Windows
   cp .env.example .env       # Mac/Linux
   ```

4. **Edit `.env` file** (use Notepad, VS Code, etc.):
   
   Replace the placeholder values:
   ```
   REMARK_SECRET=<paste-your-generated-secret-here>
   GOOGLE_CLIENT_ID=<paste-client-id-from-google>.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=<paste-client-secret-from-google>
   ADMIN_EMAIL=<your-google-email@gmail.com>
   REMARK_URL=http://localhost:8080
   ```

---

## Step 4: Start Remark42 Server (2 minutes)

**From your project folder:**

```bash
docker compose up -d
```

**Check if it's running:**
```bash
docker compose ps
```

You should see:
```
NAME      IMAGE                      STATUS
remark42  umputun/remark42:latest    Up
```

**View logs (optional):**
```bash
docker compose logs -f
```
Press `Ctrl+C` to stop viewing logs.

---

## Step 5: Test Comments! (5 minutes)

1. **Open your feed:**
   ```
   file:///C:/Users/dbmel/battle-bros-reader-dev/feed.html
   ```
   OR if your server is running:
   ```
   http://localhost:5000/feed.html
   ```

2. **Scroll to the bottom** of any post

3. **You should see:** "💬 Comments" section

4. **Click "Sign in with Google"**

5. **Complete Google sign-in**

6. **Type a test comment** and hit submit!

7. **Comment should appear immediately** below the post ✅

---

## Troubleshooting

### "Can't connect to Remark42 server"
- Check Docker is running: `docker compose ps`
- Restart: `docker compose restart`
- Check URL in feed.html matches: `http://localhost:8080`

### "Google sign-in fails"
- Double-check redirect URI in Google Console:
  `http://localhost:8080/auth/google/callback`
- Verify Client ID/Secret in `.env` file
- Restart Docker: `docker compose restart`

### "No comments showing"
- Open browser console (F12) and check for errors
- Verify Remark42 script loaded (look in Network tab)

---

## For Production (When You're Ready)

### 1. Set Up Domain

Point a subdomain to your server computer:
```
comments.bwondercomics.com → Your server's IP
```

### 2. Update Configuration

**In `.env`:**
```
REMARK_URL=https://comments.bwondercomics.com
```

**In Google Cloud Console:**
- Add redirect URI: `https://comments.bwondercomics.com/auth/google/callback`

**In `feed.html`** (line 13):
```javascript
host: 'https://comments.bwondercomics.com',
```

### 3. Add HTTPS (Required for production)

Use a reverse proxy like Nginx or Caddy with Let's Encrypt SSL.

---

## Admin Access

**Moderate comments:**
http://localhost:8080/web/admin.html

Sign in with your admin Google account (from `ADMIN_EMAIL` in `.env`)

**You can:**
- Delete comments
- Block users
- Pin comments
- Export backup

---

## Commands Reference

```bash
# Start Remark42
docker compose up -d

# Stop Remark42
docker compose down

# Restart Remark42
docker compose restart

# View logs
docker compose logs -f

# Update Remark42
docker compose pull
docker compose up -d

# Backup data
# Data is stored in: remark42_data/
# Just copy this folder to backup your comments!
```

---

## Next Steps

After you have comments working:
1. Add more posts to `posts.json`
2. Each post will automatically get its own comment section
3. Share your feed with readers!
4. Monitor comments via admin panel

Need help? Check the [implementation plan](file:///C:/Users/dbmel/.gemini/antigravity/brain/faa53ec9-62f6-44ff-be86-9559c075aa49/implementation_plan.md) for more details.

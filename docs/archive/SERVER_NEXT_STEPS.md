# Next Steps: From Fresh Ubuntu Server to Running Remark42 (archived)

## Your Current Setup ✅

- Ubuntu Server installed (headless, no GUI)
- OpenSSH enabled
- SSD with OS (EFI + root partition)
- HDD for archive (not yet mounted)
- Boots successfully from SSD

---

## Phase 1: Initial Server Access & Configuration (15 minutes)

### Step 1: SSH into Your Server

**From your Windows PC (PowerShell or Terminal):**

```powershell
# First, find your server's IP address
# On the Ubuntu server console, run:
ip addr show

# Look for something like: 192.168.1.XXX
# Then from Windows:
ssh USERNAME@192.168.1.XXX
```

**First login:**

- Type `yes` when asked about fingerprint
- Enter your password
- You're in! 🎉

---

### Step 2: Update System & Install Essential Tools

```bash
# Update package lists
sudo apt update

# Upgrade installed packages
sudo apt upgrade -y

# Install useful tools
sudo apt install -y curl wget git nano htop net-tools
```

---

### Step 3: Set Static IP (Recommended)

**Find your current network config:**

```bash
ip addr show
# Note your interface name (e.g., enp2s0, eth0, ens33)

ip route | grep default
# Note your gateway IP (e.g., 192.168.1.1)
```

**Edit netplan config:**

```bash
# Find your netplan file
ls /etc/netplan/

# Edit it (usually 00-installer-config.yaml or similar)
sudo nano /etc/netplan/00-installer-config.yaml
```

**Replace content with** (adjust IPs for your network):

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    enp2s0: # Replace with YOUR interface name
      addresses:
        - 192.168.1.100/24 # Choose an unused IP in your range
      routes:
        - to: default
          via: 192.168.1.1 # Your router/gateway IP
      nameservers:
        addresses:
          - 8.8.8.8
          - 8.8.4.4
```

**Apply changes:**

```bash
sudo netplan apply

# Verify new IP
ip addr show
```

**Now you can always SSH to:** `ssh USERNAME@192.168.1.100`

---

## Phase 2: Install Docker (5 minutes)

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group (no sudo needed)
sudo usermod -aG docker $USER

# Apply group changes
newgrp docker

# Verify installation
docker --version
docker compose version
```

✅ **Docker is ready!**

---

## Phase 3: Mount Archive HDD (10 minutes)

### Find Your HDD

```bash
# List all disks
lsblk

# Or with more detail
sudo fdisk -l
```

Look for your HDD (probably `/dev/sdb` or similar, larger size).

### Format & Mount

```bash
# ⚠️ CAUTION: Make sure this is the RIGHT disk!
# Format as ext4 (DESTROYS ALL DATA on that disk!)
sudo mkfs.ext4 /dev/sdb

# Create mount point
sudo mkdir -p /mnt/archive

# Get the UUID of the drive
sudo blkid /dev/sdb
# Copy the UUID value

# Add to fstab for automatic mounting
sudo nano /etc/fstab
```

**Add this line at the end:**

```
UUID=your-uuid-here  /mnt/archive  ext4  defaults  0  2
```

**Mount it:**

```bash
# Mount the drive
sudo mount -a

# Verify it's mounted
df -h | grep archive

# Set ownership to your user
sudo chown -R $USER:$USER /mnt/archive
```

✅ **Archive drive ready!**

---

## Phase 4: Deploy Remark42 (15 minutes)

### Create Project Directory

```bash
# Create directory for Remark42
mkdir -p ~/remark42
cd ~/remark42
```

### Transfer Files from Windows

**From your Windows PC (PowerShell):**

```powershell
# Navigate to your project
cd C:\Users\dbmel\battle-bros-reader-dev

# Transfer docker-compose.yml
scp docker-compose.yml USERNAME@192.168.1.100:~/remark42/

# Transfer .env.example
scp .env.example USERNAME@192.168.1.100:~/remark42/
```

### Configure Remark42

**Back on Ubuntu server:**

```bash
cd ~/remark42

# Generate secret key
openssl rand -hex 32
# Copy this output!

# Create .env from example
cp .env.example .env

# Edit configuration
nano .env
```

**Fill in these values:**

```bash
REMARK_SECRET=<paste-generated-secret-here>
GOOGLE_CLIENT_ID=<your-google-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
ADMIN_EMAIL=<your-email@gmail.com>
REMARK_URL=http://192.168.1.100:8080
```

Save: `Ctrl+X`, `Y`, `Enter`

### Start Remark42

```bash
# Start Remark42
docker compose up -d

# Check if running
docker compose ps

# View logs
docker compose logs -f
# Press Ctrl+C to exit logs
```

You should see:

```
NAME      IMAGE                      STATUS
remark42  umputun/remark42:latest    Up
```

✅ **Remark42 is running!**

---

## Phase 5: Configure Router & Test (15 minutes)

### Router Port Forwarding

1. **Open router admin** (usually http://192.168.1.1)
2. **Find "Port Forwarding" or "Virtual Server"**
3. **Add rule:**
   - External Port: `8080`
   - Internal IP: `192.168.1.100`
   - Internal Port: `8080`
   - Protocol: `TCP`
4. **Save**

### Update Google OAuth

**Get your public IP:**

```bash
curl ifconfig.me
```

**In Google Cloud Console:**

1. Go to your OAuth credentials
2. Add redirect URI:
   ```
   http://YOUR_PUBLIC_IP:8080/auth/google/callback
   ```
3. Save

### Update Your Website

**On Windows, edit `feed.html` (line ~13):**

```javascript
var remark_config = {
  host: 'http://192.168.1.100:8080', // Your server's IP
  site_id: 'bwondercomics',
  components: ['embed'],
  theme: 'dark',
  locale: 'en',
};
```

**Edit `reader/comic-comments.js` (line ~32):**

```javascript
window.remark_config = {
  host: 'http://192.168.1.100:8080', // Your server's IP
  site_id: 'bwondercomics',
  // ...
};
```

### Test Comments!

1. Open `feed.html` in your browser
2. Scroll to comments section
3. Click "Sign in with Google"
4. Post a test comment
5. **Success!** 🎉

---

## Phase 6: Future Enhancements

### Archive Organization

```bash
# Create directory structure for comics
mkdir -p /mnt/archive/comics/chapters
mkdir -p /mnt/archive/comics/covers
mkdir -p /mnt/archive/backups
mkdir -p /mnt/archive/media

# Symlink for easy access
ln -s /mnt/archive ~/archive
```

### Useful Commands

```bash
# Remark42 management
docker compose logs -f          # View logs
docker compose restart          # Restart
docker compose down             # Stop
docker compose up -d            # Start
docker compose pull && docker compose up -d  # Update

# System monitoring
htop                            # System resources
df -h                          # Disk usage
docker stats                   # Docker container stats

# Archive space
du -sh /mnt/archive/*          # Check each folder size
```

### Backup Remark42 Data

```bash
# Backup comments to archive
tar -czf /mnt/archive/backups/remark42-$(date +%Y%m%d).tar.gz ~/remark42/remark42_data/

# List backups
ls -lh /mnt/archive/backups/
```

---

## Troubleshooting

### Can't SSH?

```bash
# On server console, check SSH is running
sudo systemctl status ssh

# Check IP address
ip addr show
```

### Docker permission denied?

```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Re-login or run
newgrp docker
```

### Can't access Remark42 from Windows?

```bash
# Check if running
docker compose ps

# Check firewall (if enabled)
sudo ufw status
sudo ufw allow 8080

# Check from server itself
curl http://localhost:8080/ping
```

---

## Summary

✅ **What you've built:**

- Dedicated Ubuntu Server
- Docker running Remark42
- Static IP for reliable access
- Archive drive for comics/backups
- SSH access from your main PC

✅ **What works now:**

- Comments on feed posts
- Comments on comic chapters
- Self-hosted, $0/month except electricity
- Full data ownership

🚀 **Next possibilities:**

- Build admin panel for comic uploads
- Set up automatic deployments
- Add reverse proxy (Nginx) with HTTPS
- Create backup automation
- Build comic management tools

Ready to test your setup or need help with any step?

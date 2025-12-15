# Admin Panel Deployment Guide

## For Developers

This guide explains how to deploy and configure the Battle Bros Admin Panel.

## 📦 Deployment Options

### Option 1: Static File Hosting (Simplest)

The admin panel is a single HTML file that works on any web server.

**Steps:**
1. Copy the entire `/admin/` folder to your web server
2. Access via `https://yourdomain.com/admin/`
3. Done!

**Supported Platforms:**
- GitHub Pages ✅
- Netlify ✅
- Vercel ✅
- AWS S3 + CloudFront ✅
- Any web server (Apache, Nginx, etc.) ✅

### Option 2: GitHub Pages (Recommended for this project)

Since the main site uses GitHub Pages:

1. The admin panel is already included in the repository
2. After merging to main, it's automatically deployed
3. Access at: `https://yourdomain.com/admin/`

**No special configuration needed!**

### Option 3: Password Protection (Recommended)

The admin panel has built-in password authentication, but you can add server-level protection:

#### Apache (.htaccess)
```apache
<FilesMatch "index\.html">
  AuthType Basic
  AuthName "Admin Area"
  AuthUserFile /path/to/.htpasswd
  Require valid-user
</FilesMatch>
```

#### Nginx
```nginx
location /admin/ {
  auth_basic "Admin Area";
  auth_basic_user_file /etc/nginx/.htpasswd;
}
```

#### Netlify (_headers file)
```
/admin/*
  Basic-Auth: yourusername:yourpassword
```

## 🔧 Configuration

### Admin Access

The admin panel uses the site's account system (`/api/login`, `/api/session`) and requires an account with `role=admin`.

- Fresh install: the first registered user becomes `admin` automatically.
- After that: admins can promote users in the **Users** section.

For production, keep `/admin/` protected (HTTPS + reverse-proxy auth and/or IP allowlist/VPN).

### Customizing the Interface

#### Change Colors
Edit CSS variables (lines 14-22):
```css
:root {
  --primary: #00d9ff;
  --secondary: #ff00ea;
  --accent: #ffed00;
  /* etc. */
}
```

#### Change Default Chapter Data
Edit the `chapters` object in the `loadChapters()` function (lines 698-821).

#### Disable Features
Comment out sections you don't need in the JavaScript.

## 🔒 Security Hardening

### Production Checklist

- [ ] Change default password
- [ ] Enable HTTPS (SSL/TLS certificate)
- [ ] Add server-level authentication (Apache/Nginx)
- [ ] Implement rate limiting
- [ ] Set up CSP headers
- [ ] Enable HSTS
- [ ] Regular security audits
- [ ] Monitor access logs
- [ ] Use strong passwords
- [ ] Keep backups of chapter data

### Content Security Policy

Add to your server configuration:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:
```

### HTTPS Enforcement

**Always use HTTPS for the admin panel!**

For GitHub Pages:
1. Go to repository Settings > Pages
2. Check "Enforce HTTPS"
3. Done!

For other platforms, use Let's Encrypt or your hosting provider's SSL.

## 🚀 Integration with CI/CD

### GitHub Actions Example

```yaml
name: Deploy Admin Panel

on:
  push:
    branches: [main]
    paths:
      - 'admin/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to hosting
        run: |
          # Your deployment script here
```

### Pre-commit Hooks

Validate admin panel changes before committing:

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check if admin/index.html changed
if git diff --cached --name-only | grep -q "admin/index.html"; then
  echo "Admin panel changed. Running validation..."
  # Add validation logic here
fi
```

## 🔍 Testing

### Local Testing

1. Start a local server:
   ```bash
   cd battle-bros-reader
   python3 -m http.server 8080
   ```

2. Open browser: `http://localhost:8080/admin/`

3. Test all features:
   - Login
   - Edit chapters
   - Add chapters
   - Delete chapters
   - Preview/Export
   - Mobile view

### Cross-Browser Testing

Test on:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS, Android)

### Automated Testing

Consider adding:
- End-to-end tests (Playwright, Cypress)
- Unit tests for JavaScript functions
- Accessibility tests (axe, WAVE)

## 📊 Monitoring

### Access Logs

Monitor who's accessing the admin panel:

```bash
# Apache
tail -f /var/log/apache2/access.log | grep "/admin/"

# Nginx
tail -f /var/log/nginx/access.log | grep "/admin/"
```

### Google Analytics (Optional)

Add to `<head>` section if you want to track usage:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_TRACKING_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_TRACKING_ID');
</script>
```

## 🐛 Troubleshooting

### Issue: 404 Error

**Cause**: Admin folder not uploaded or path incorrect

**Solution**:
- Verify `/admin/` folder exists on server
- Check file permissions (755 for directory, 644 for files)
- Clear browser cache

### Issue: CORS Errors

**Cause**: Loading from file:// protocol

**Solution**:
- Always use a web server (http:// or https://)
- Use Python, Node, or any local server

### Issue: Login Not Working

**Cause**: JavaScript disabled or password mismatch

**Solution**:
- Check browser console for errors
- Verify password is correct
- Enable JavaScript
- Try incognito/private mode

### Issue: Changes Not Saving

**Cause**: localStorage disabled or full

**Solution**:
- Enable localStorage in browser settings
- Clear browser data
- Check storage quota

## 🔄 Updating the Admin Panel

### Update Process

1. Pull latest changes from repository
2. Test locally
3. Deploy to staging (if available)
4. Test on staging
5. Deploy to production
6. Verify production works
7. Monitor for issues

### Rollback Plan

If something goes wrong:

1. Keep previous version backed up
2. Replace with backup:
   ```bash
   cp -r admin.backup/ admin/
   ```
3. Clear browser caches
4. Investigate issue before re-deploying

## 📱 Mobile Deployment

The admin panel is mobile-responsive, but for best mobile experience:

1. Test on actual devices (not just browser DevTools)
2. Consider creating a PWA manifest for "Add to Home Screen"
3. Optimize for touch interactions
4. Test on slow connections

## 🎯 Best Practices

1. **Always use HTTPS** - Never deploy admin panel over HTTP
2. **Change default password** - Before going live
3. **Regular backups** - Export chapter data regularly
4. **Monitor access** - Check logs for suspicious activity
5. **Keep documentation updated** - When making changes
6. **Test before deploying** - Always test locally first
7. **Use version control** - Track all changes
8. **Implement proper authentication** - For production use

## 🆘 Support & Maintenance

### Regular Maintenance Tasks

- [ ] Weekly: Check access logs
- [ ] Monthly: Backup chapter data
- [ ] Quarterly: Security audit
- [ ] Yearly: Update dependencies (fonts, etc.)

### Getting Help

1. Check browser console for errors
2. Review this deployment guide
3. Check GitHub issues
4. Contact repository maintainers

## 📝 Deployment Checklist

Before deploying to production:

- [ ] Changed default password
- [ ] Tested all features locally
- [ ] Enabled HTTPS
- [ ] Set up server-level auth (optional)
- [ ] Configured CSP headers
- [ ] Set up monitoring/logging
- [ ] Created backup strategy
- [ ] Tested on multiple browsers
- [ ] Tested on mobile devices
- [ ] Documented custom changes
- [ ] Trained content editors
- [ ] Set up emergency contacts

---

**Need help?** Check the README.md and QUICK_START.md files, or contact the development team.

# GitHub Auto-Deploy Specification for Battle Bros Admin Panel

## Overview
This document outlines how to implement automatic GitHub deployment for the Battle Bros Admin Panel, allowing content changes to be published directly to the live website without manual file editing.

## Current State
- Admin panel exists at `/admin/index.html` in the `feature/admin-panel` branch
- Changes are saved to browser localStorage
- Manual workflow: Edit → Export JSON → Copy/Paste into index.html → Commit → Push
- GitHub Personal Access Token stored in Repository Secrets as `ADMIN_TOKEN`

## Target State
- Edit chapters in admin panel
- Click "Publish" button
- Changes automatically commit to GitHub
- GitHub Action updates index.html
- Site deploys automatically via GitHub Pages
- Total time: 1-2 minutes from click to live

## Architecture

### Phase 1: Admin Panel Updates
Modify `/admin/index.html` to support GitHub integration:

1. **Add GitHub Settings UI**
   - New "Settings" section in admin panel
   - Store repo details (owner, repo name, branch)
   - No token input needed (using GitHub Actions instead)

2. **Create Data Export File**
   - Export chapter data to `/admin/data.json`
   - This file will be committed to trigger the workflow
   - Format: `{"chapters": {...}, "lastUpdated": "2025-11-13T22:27:29Z"}`

3. **Add Publish Button**
   - Replace "Preview Changes" with "Publish to GitHub"
   - Uses GitHub API to commit `admin/data.json`
   - Requires user's GitHub token (entered in UI, stored in localStorage)
   - Shows progress: "Committing → Running workflow → Deploying → Done!"

### Phase 2: GitHub Actions Workflow
Create `.github/workflows/update-chapters.yml` (deprecated):

**Trigger**: When `admin/data.json` is modified on `feature/admin-panel` or `main` branch

**Steps**:
1. Checkout repository
2. Read `/admin/data.json`
3. Read current `/index.html`
4. Find and replace the chapters object (around line 1762)
5. Commit updated `index.html`
6. Push changes
7. GitHub Pages auto-deploys

**Uses**: Repository Secret `ADMIN_TOKEN` for authentication

### Phase 3: Merge to Main
Once tested on `feature/admin-panel` branch:
1. Merge to `main` branch
2. Admin panel becomes live at `https://bwondercomics.com/admin/`
3. Workflow runs on main branch
4. Changes go live immediately

## Implementation Details

### 1. Admin Panel Changes (`/admin/index.html`)

#### A. Add GitHub API Integration
```javascript
// GitHub API Configuration
const GITHUB_CONFIG = {
  owner: 'bwondercomics',
  repo: 'battle-bros-reader',
  branch: 'feature/admin-panel' for testing
  dataFile: 'admin/data.json'
};

// Publish to GitHub function
async function publishToGitHub(chaptersData) {
  const token = localStorage.getItem('battlebros_github_user_token');
  
  if (!token) {
    alert('Please enter your GitHub token in Settings first!');
    showSettingsModal();
    return;
  }
  
  try {
    // 1. Prepare data
    const dataToCommit = {
      chapters: chaptersData,
      lastUpdated: new Date().toISOString(),
      publishedBy: 'Admin Panel'
    };
    
    // 2. Get current file SHA (required for updates)
    const currentFile = await fetch(
      `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.dataFile}?ref=${GITHUB_CONFIG.branch}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    
    let sha = null;
    if (currentFile.ok) {
      const fileData = await currentFile.json();
      sha = fileData.sha;
    }
    
    // 3. Commit the file
    const content = btoa(JSON.stringify(dataToCommit, null, 2)); // Base64 encode
    
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.dataFile}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Update chapters via Admin Panel - ${new Date().toISOString()}`,
          content: content,
          branch: GITHUB_CONFIG.branch,
          sha: sha // Include if updating existing file
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    
    alert('✅ Published successfully! GitHub Action is updating the site. Check back in 1-2 minutes.');
    
  } catch (error) {
    console.error('Publish error:', error);
    alert(`❌ Publish failed: ${error.message}`);
  }
}
```

#### B. Add Settings Modal
```html
<!-- Settings Modal -->
<div id="settingsModal" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <h2 class="modal-title">GitHub Settings</h2>
      <button class="btn-close" id="btnCloseSettings">&times;</button>
    </div>
    <div class="form-editor">
      <div class="form-group">
        <label class="form-label">Your GitHub Personal Access Token</label>
        <input 
          type="password" 
          id="githubToken" 
          class="form-input" 
          placeholder="ghp_xxxxxxxxxxxx"
        />
        <p style="font-size: 0.8rem; color: var(--accent); margin-top: 5px;">
          ⚠️ This token is stored in your browser only and never sent to the server.
          <br>Create one at: <a href="https://github.com/settings/tokens" target="_blank">github.com/settings/tokens</a>
          <br>Required scope: <strong>repo</strong>
        </p>
      </div>
      <button class="btn-save" id="btnSaveToken">Save Token</button>
    </div>
  </div>
</div>
```

#### C. Update UI
- Change "Preview Changes" button to "Publish to GitHub"
- Add "Settings" button in header for token management
- Add publish status indicator

### 2. GitHub Actions Workflow (`.github/workflows/update-chapters.yml`) (deprecated)

```yaml
name: Update Chapters from Admin Panel

on:
  push:
    paths:
      - 'admin/data.json'
    branches:
      - main
      - feature/admin-panel

permissions:
  contents: write

jobs:
  update-chapters:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.ADMIN_TOKEN }}
      
      - name: Read chapter data
        id: read-data
        run: |
          echo "Reading admin/data.json..."
          cat admin/data.json
      
      - name: Update index.html with new chapter data
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.ADMIN_TOKEN }}
          script: |
            const fs = require('fs');
            
            // Read the new chapter data
            const adminData = JSON.parse(fs.readFileSync('admin/data.json', 'utf8'));
            const newChapters = adminData.chapters;
            
            // Read current index.html
            let indexHtml = fs.readFileSync('index.html', 'utf8');
            
            // Find and replace the chapters object
            // Looking for: const chapters = { ... };
            const chaptersRegex = /const chapters = \{[\s\S]*?\};/;
            
            const newChaptersString = `const chapters = ${JSON.stringify(newChapters, null, 6)};`;
            
            indexHtml = indexHtml.replace(chaptersRegex, newChaptersString);
            
            // Write updated index.html
            fs.writeFileSync('index.html', indexHtml, 'utf8');
            
            console.log('✅ Successfully updated index.html with new chapter data');
      
      - name: Commit and push changes
        run: |
          git config --local user.email "github-actions[bot]@users.noreply.github.com"
          git config --local user.name "github-actions[bot]"
          git add index.html
          git commit -m "🤖 Auto-update chapters from Admin Panel [$(date -u +'%Y-%m-%d %H:%M:%S UTC')]" || echo "No changes to commit"
          git push
      
      - name: Deployment status
        run: |
          echo "✅ Deployment complete! GitHub Pages will rebuild automatically."
          echo "🌐 Check your site in 1-2 minutes at: https://bwondercomics.com"
```

### 3. Initial Setup File (`/admin/data.json`)

Create this file to initialize the workflow:

```json
{
  "chapters": {
    "Chapter 1": [
      "chapters/01/01.png",
      "chapters/01/02.png",
      "chapters/01/03.png",
      "chapters/01/04.png",
      "chapters/01/05.png",
      "chapters/01/06.png",
      "chapters/01/07.png",
      "chapters/01/08.png",
      "banner1.png",
      "banner2.png"
    ],
    "Chapter 2": [
      "chapters/02/01.png",
      "chapters/02/02.png",
      "chapters/02/03.png",
      "chapters/02/04.png",
      "chapters/02/05.png",
      "chapters/02/06.png",
      "chapters/02/07.png",
      "chapters/02/08.png"
    ],
    "Chapter 3": [
      "chapters/03/01.png",
      "chapters/03/02.png",
      "chapters/03/03.png",
      "chapters/03/04.png",
      "chapters/03/05.png",
      "chapters/03/06.png",
      "chapters/03/07.png",
      "chapters/03/08.png",
      "chapters/03/09.png",
      "chapters/03/10.png",
      "chapters/03/11.png",
      "chapters/03/12.png",
      "chapters/03/13.png",
      "chapters/03/14.png"
    ],
    "Chapter 4": [
      "chapters/04/01.png",
      "chapters/04/02.png",
      "chapters/04/03.png",
      "chapters/04/04.png",
      "chapters/04/05.png",
      "chapters/04/06.png",
      "chapters/04/07.png",
      "chapters/04/08.png",
      "chapters/04/09.png",
      "chapters/04/10.png"
    ],
    "Chapter 5": [
      "chapters/05/01.png",
      "chapters/05/02.png",
      "chapters/05/03.png",
      "chapters/05/04.png",
      "chapters/05/05.png",
      "chapters/05/06.png",
      "chapters/05/07.png",
      "chapters/05/08.png",
      "chapters/05/09.png",
      "chapters/05/10.png",
      "chapters/05/11.png",
      "chapters/05/12.png"
    ],
    "Chapter 6": [
      "chapters/06/01.png",
      "chapters/06/02.png",
      "chapters/06/03.png",
      "chapters/06/04.png",
      "chapters/06/05.png",
      "chapters/06/06.png",
      "chapters/06/07.png",
      "chapters/06/08.png",
      "chapters/06/09.png",
      "chapters/06/10.png",
      "chapters/06/11.png",
      "chapters/06/12.png",
      "chapters/06/13.png",
      "chapters/06/14.png",
      "chapters/06/15.png"
    ],
    "Chapter 7": [
      "chapters/07/01.png",
      "chapters/07/02.png",
      "chapters/07/03.png",
      "chapters/07/04.png",
      "chapters/07/05.png",
      "chapters/07/06.png",
      "chapters/07/07.png",
      "chapters/07/08.png",
      "chapters/07/09.png",
      "chapters/07/10.png",
      "chapters/07/11.png"
    ]
  },
  "lastUpdated": "2025-11-13T22:27:29Z",
  "publishedBy": "Initial Setup"
}
```

## Security Considerations

### User's GitHub Token (Stored in Browser)
- ✅ Stored in localStorage only
- ✅ Never committed to repository
- ✅ Only used for API calls from user's browser
- ✅ Can be revoked anytime at github.com/settings/tokens
- ⚠️ User should create token with ONLY `repo` scope
- ⚠️ User should use token expiration (90 days recommended)

### Repository Secret (ADMIN_TOKEN)
- ✅ Already stored in Repository Secrets
- ✅ Only accessible to GitHub Actions
- ✅ Never exposed in logs or code
- ✅ Used by workflow to commit changes

### Admin Panel Access
- ✅ Uses the site's account system + admin role checks (signed HttpOnly cookie session)
- ⚠️ Consider adding IP whitelist for extra security
- ⚠️ Always serve over HTTPS

## User Workflow

### First Time Setup
1. Navigate to `https://bwondercomics.com/admin/`
2. Sign in with an `admin` account
3. Click "Settings" button
4. Enter GitHub Personal Access Token
5. Click "Save Token"
6. Token stored in browser

### Publishing Changes
1. Sign in to the admin panel
2. Edit chapters (add/remove/reorder)
3. Click "Publish to GitHub"
4. Admin panel commits `admin/data.json`
5. GitHub Action triggers automatically
6. Workflow updates `index.html`
7. GitHub Pages rebuilds site
8. Changes live in 1-2 minutes!

### Checking Status
- After clicking "Publish", go to: `https://github.com/bwondercomics/battle-bros-reader/actions`
- See the workflow running in real-time
- Green checkmark = successful deployment
- Red X = check logs for errors

## Testing Plan

### Phase 1: Test on feature/admin-panel branch
1. Create workflow file
2. Update admin panel code
3. Test publish functionality
4. Verify index.html updates correctly
5. Check that chapter changes appear on test site

### Phase 2: Merge to main
1. Once tested, merge `feature/admin-panel` → `main`
2. Admin panel goes live at `https://bwondercomics.com/admin/`
3. Test publish on production
4. Monitor for issues

## Rollback Plan

If something goes wrong:
1. GitHub maintains full version history
2. Revert commit in GitHub UI
3. Or manually edit index.html back
4. Or restore from previous commit

## Future Enhancements

- [ ] Add preview environment (publish to test branch first)
- [ ] Email notification when publish completes
- [ ] Automatic backups before each publish
- [ ] Multi-user support with audit log
- [ ] Image upload directly through admin panel
- [ ] Scheduled publishing (publish at specific time)
- [ ] A/B testing for chapter layouts

## Files to Create/Modify

### New Files
1. `.github/workflows/update-chapters.yml` - GitHub Actions workflow (deprecated)
2. `admin/data.json` - Chapter data file
3. `admin/GITHUB_AUTO_DEPLOY_SPEC.md` - This document

### Modified Files
1. `admin/index.html` - Add GitHub API integration, Settings modal, Publish button
2. `admin/README.md` - Update with new publish workflow documentation
3. `admin/QUICK_START.md` - Update step 7 with new publish process

## Questions for Implementation

1. Should we test on `feature/admin-panel` branch first or go straight to `main`?
2. Do you want email notifications when publishes complete?
3. Should there be a "Preview" option to see changes before publishing?
4. Any specific error handling or logging requirements?

## Support Resources

- GitHub API Documentation: https://docs.github.com/en/rest
- GitHub Actions Documentation: https://docs.github.com/en/actions
- Creating Personal Access Tokens: https://github.com/settings/tokens
- Repository Secrets: https://github.com/bwondercomics/battle-bros-reader/settings/secrets/actions

---

**Status**: Specification complete, ready for implementation
**Created**: 2025-11-13
**For**: Battle Bros Reader Admin Panel Auto-Deploy Feature
**Repository**: bwondercomics/battle-bros-reader
**Issue**: #16

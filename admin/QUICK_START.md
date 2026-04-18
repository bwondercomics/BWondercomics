# Battle Bros Admin - Quick Start Guide

## For content editors (non-technical users)

### Step 1: Access the admin panel

1. Open your web browser.
2. Go to: `https://yoursite.com/admin/` (or `http://localhost:8000/admin/` for local testing).
3. You should see the login screen.

### Step 2: Login

1. Enter your account email + password.
2. Click **Sign In**.
3. You must be an `admin` user to access the dashboard (admins can promote users in the **Users** tab).

### Step 3: Edit an entry

1. Find the entry you want to edit in the list.
2. Click **Edit**.
3. In the popup:
   - Update the entry name or entry number if needed.
   - Add/remove pages.
   - Use **Move Pages** to reorder pages (drag or use Up/Down).
4. Click **Save Changes** (this writes to the database).

### Step 4: Add a new entry

1. Click **+ Add New Entry**.
2. Enter a name (e.g., "Entry 8") and optional entry number.
3. Use **Upload New Images** to add pages, or add paths manually.
4. Click **Save Changes**.

### Step 5: Preview and publish

- Saving writes to the database immediately. There is no manual copy/paste into HTML.
- Use **Preview/Export** to sanity-check or download a backup of the JSON.

### Step 6: Create a blog/update post

1. Open the **Blog/Updates** tab.
2. Write your post, set image/tags, and choose draft/scheduled/published.
3. Click **Publish Post** (or **Save Draft**).

### Step 7: Optional admin tasks

- **Users**: promote roles or review premium/email status.
- **Premium Codes**: generate and deactivate supporter codes.
- **Moderation**: review comments, bans, censored words, rate limits, and live visitors.
- **Analytics**: view Umami stats.
- **Page Designer**: open the integrated builder header editor for the active series.

## Tips and tricks

- Image paths use forward slashes: `comics/<seriesId>/entries/issues/08/01.png`.
- Uploaded pages are stored on disk; entry metadata lives in Postgres.
- Drafts are saved in your browser; use **Save Changes** to persist to the server.
- If you enable premium access on a series or entry, only premium/admin users (or codes) can view it.

## Common mistakes

- "Changes disappeared": Make sure you clicked **Save Changes**; drafts are local only.
- "I can't login": Verify email/password and that your account has `admin` role.
- "Pages not showing": Check file paths and confirm images exist on disk.

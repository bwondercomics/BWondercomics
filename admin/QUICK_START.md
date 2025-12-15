# Battle Bros Admin - Quick Start Guide

## 🎮 For Content Editors (Non-Technical Users)

### Step 1: Access the Admin Panel
1. Open your web browser
2. Go to: `https://yoursite.com/admin/` (or `http://localhost:8080/admin/` for local testing)
3. You'll see the login screen

### Step 2: Login
1. Enter your account email + password
2. Click **SIGN IN**
3. You must be an `admin` user to access the dashboard

### Step 3: Edit a Chapter
1. Find the chapter you want to edit in the list
2. Click the blue **EDIT** button
3. In the popup:
   - Change the chapter name if needed
   - Add new pages by clicking **+ ADD PAGE**
   - Remove pages by clicking the red **Remove** button next to any page
4. Click **SAVE CHANGES** when done

### Step 4: Add a New Chapter
1. Scroll to the bottom of the chapter list
2. Click the yellow **+ ADD NEW CHAPTER** button
3. Enter a chapter name (e.g., "Chapter 8")
4. Add page paths one by one:
   - Click **+ ADD PAGE**
   - Enter the path like: `chapters/08/01.png`
   - Repeat for each page
5. Click **SAVE CHANGES**

### Step 5: Delete a Chapter
1. Find the chapter to delete
2. Click the red **DELETE** button
3. Confirm you want to delete it
4. The chapter is removed

### Step 6: Preview Your Changes
1. Click the purple **PREVIEW CHANGES** button in the top right
2. Scroll down to see the "Preview & Export" section
3. You'll see all your chapters as JSON data

### Step 7: Publish Changes to the Live Site
**This step requires copying and pasting into code - ask a developer if you're not comfortable:**

1. After clicking **PREVIEW CHANGES**, click **COPY TO CLIPBOARD**
2. Open your code editor and find `index.html`
3. Look for line 1762 (search for "const chapters = {")
4. Replace the entire chapters object with your copied JSON
5. Save the file
6. Deploy/upload to your web server

**OR** ask your developer to:
1. Download the JSON file by clicking **DOWNLOAD JSON**
2. Send it to them
3. They'll update the website for you

## 💡 Tips & Tricks

### Image Paths
- Always use forward slashes: `chapters/01/01.png` ✅
- Not backslashes: `chapters\01\01.png` ❌
- Paths are relative to the website root
- Make sure the image files actually exist in those locations!

### Chapter Names
- You can use any name: "Chapter 1", "Prologue", "Bonus Pages", etc.
- Keep names short and clear
- Names appear in the reader's chapter dropdown

### Ordering Chapters
- Chapters appear in the order they're listed
- To reorder: Delete and re-add in the order you want
- (Future version will have drag-and-drop!)

### Saving Your Work
- Changes are automatically saved as drafts in your browser
- They won't appear on the live site until you publish them
- If you close your browser, your drafts are saved
- To discard all drafts: Logout and clear browser data

### Mobile Editing
- The admin works on phones and tablets!
- Landscape mode is easier for editing
- All features work on mobile

## 🚨 Common Mistakes

### "My changes disappeared!"
- Did you click **SAVE CHANGES** after editing?
- Check if you're in the right browser (drafts are per-browser)
- Try logging out and back in

### "The page paths don't work!"
- Check spelling and capitalization
- Make sure files exist at those paths
- Use forward slashes, not backslashes
- Include the file extension (.png, .jpg)

### "I can't login!"
- Check that your email/password are correct
- Make sure your account has `role=admin` (admins can promote users in the **Users** tab)
- Try a hard refresh and sign in again

### "Changes don't appear on the website!"
- Remember: Changes are only drafts until published!
- You need to copy the JSON and update index.html
- Ask a developer to help publish changes

## 🛟 Need Help?

### Before Asking for Help
1. Try logging out and back in
2. Check the browser console for errors (F12 key)
3. Try a different browser
4. Read this guide again

### Getting Support
- Check the full README.md in the `/admin/` folder
- Contact your web developer
- Review the ADMIN_GUI_EDITOR_SPEC.md document

## 🎯 Workflow Example

**Scenario**: You want to add Chapter 8 with 5 new pages.

1. **Login** to admin panel
2. Click **+ ADD NEW CHAPTER**
3. Enter "Chapter 8" as the name
4. Click **+ ADD PAGE** and enter `chapters/08/01.png`
5. Repeat for pages 02, 03, 04, 05
6. Click **SAVE CHANGES**
7. Click **PREVIEW CHANGES** to verify
8. Click **COPY TO CLIPBOARD**
9. Send the JSON to your developer OR paste into index.html yourself
10. Deploy the updated file
11. Check the live site - Chapter 8 should appear!

## ✅ Best Practices

1. **Make small changes** - Edit one chapter at a time
2. **Preview often** - Check your work before publishing
3. **Keep backups** - Download JSON before major changes
4. **Test locally first** - If possible, test on a development site
5. **Ask for help** - When in doubt, consult your developer

---

**Remember**: The admin panel is for editing chapter information. To add actual comic pages (images), you still need to upload image files to the server first!

Happy editing! 🎮✨

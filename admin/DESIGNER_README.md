# Battle Bros Page Designer

## 🎨 Legacy Bridge

`admin/designer.html` is no longer the real editing surface. It now redirects into the integrated admin builder and opens the page-scoped header editor for the selected series.

## 🚀 Quick Start

1. Start the site stack (see `deploy/README.md`).
2. Open `http://localhost:8000/admin/index.html?view=designer&series=<series-id>&surface=header` or click **Page Designer** from the admin panel.
3. Legacy links to `admin/designer.html` still work, but they only bridge into the builder.

## ✨ Current Editing Surface

### Page-Scoped Header Editor

- **Header Copy**: Edit page title, subtitle, and rotating subtitle lines
- **Navigation Buttons**: Add, remove, reorder, and retarget page-header buttons
- **Header Parts**: Toggle built-in header blocks on or off
- **Placement**: Move header blocks across left/center/right regions without raw JSON editing

## 💾 Saving Your Work

- Use **Save Draft** or **Publish Changes** from the integrated builder.
- Header edits persist to the builder page record, not to standalone designer-local draft state.

## 📁 Files

- `admin/designer.html` - Redirect bridge into the integrated builder
- `admin/index.html?view=designer&series=<id>&surface=header` - Canonical designer route
- `page.meta.header` - Canonical page-scoped header source of truth

## 🎯 How It Works

1. Open the canonical designer route or click **Page Designer** in admin.
2. The admin shell opens the integrated builder in header-edit mode for the active series.
3. Select another page from the builder rail to keep editing headers page-by-page.
4. Save Draft or Publish Changes from the builder.

## 🔧 Configuration Structure

```json
{
  "layout": {
    "leftPanel": { "enabled": true, "order": 1 },
    "viewport": { "enabled": true, "order": 2 },
    "rightPanel": { "enabled": true, "order": 3 }
  },
  "theme": {
    "primary": "#00d9ff",
    "secondary": "#ff00ea",
    "accent": "#ffed00",
    ...
  },
  "content": {
    "header": { "title": "...", "subtitle": "..." },
    "leftPanel": { "topText": "...", "image": "..." },
    "rightPanel": { "buttons": [...] }
  }
}
```

## 📸 Image Uploads

**Supported Methods:**

1. **Drag & Drop**: Drag image files onto upload areas
2. **Click to Browse**: Click upload area to select files
3. **URL Input**: Paste image URLs directly

**Supported Formats:**

- PNG, JPG, JPEG, GIF, WebP

**Storage:**

- Images are converted to base64 and stored in the config
- For production, consider using a CDN or image hosting service

## 🎨 Creating Custom Themes

1. Go to **Theme** tab
2. Either:
   - Select a preset as starting point
   - Manually adjust each color
3. Colors update in real-time
4. Save when satisfied

**Color Tips:**

- Use high contrast for readability
- Test on different screen sizes
- Consider color blindness accessibility

## 🐛 Troubleshooting

**Preview not loading?**

- Check that local server is running
- Refresh the preview iframe
- Check browser console for errors

**Images not uploading?**

- Ensure file is a supported image format
- Check file size (large images may be slow)
- Try URL input instead

**Changes not saving?**

- Check browser localStorage is enabled
- Try a different browser
- Check browser console for errors

## 🚀 Next Steps

- [ ] Add image optimization
- [ ] Add undo/redo functionality
- [ ] Add export/import config feature
- [ ] Add more preset themes

## 📝 Notes

- Publishing requires the backend to be running (and an admin session cookie).
- Draft changes are stored in the browser until published.
- Safe to experiment - original files unchanged until publish
- Works best in modern browsers (Chrome, Firefox, Edge, Safari)

---

**Need Help?** Check the main admin panel README or implementation plan for more details.

# Battle Bros Page Designer

## 🎨 Visual Page Customization Tool

The Page Designer is a standalone visual editor that lets you customize your Battle Bros comic reader without touching code!

## 🚀 Quick Start

1. **Start your local server:**
   ```bash
   cd c:\Users\dbmel\battle-bros-reader-dev
   .\start-server.bat
   ```

2. **Access the Designer:**
   - Open http://localhost:8000/admin/designer.html
   - Or from the admin panel, click "🎨 Page Designer"

## ✨ Features

### 🎨 Theme Editor
- **Color Pickers**: Customize all colors (primary, secondary, accent, backgrounds)
- **Quick Presets**: One-click themes
  - ⚡ Cyberpunk (default neon theme)
  - 🕹️ Retro Arcade (warm orange/yellow)
  - ✨ Minimal Clean (modern blue/purple)
  - 💫 Neon Nights (bright green/pink on black)
- **Live Color Sync**: Color picker and hex input stay in sync

### 📝 Content Editor
- **Header**: Edit title and subtitle
- **Left Panel**: 
  - Top and bottom text
  - Image upload (drag-and-drop or click)
  - URL input for remote images
- **Right Panel**:
  - Image upload (drag-and-drop or click)
  - Social buttons (add/remove/edit)
  - Icon, text, and URL for each button

### 📐 Layout Control
- **Drag-and-Drop**: Reorder panels (left, viewer, right)
- **Toggle Visibility**: Show/hide panels
- **Visual Preview**: See layout changes immediately

### 👁️ Live Preview
- **Iframe Preview**: See changes in real-time
- **Responsive Testing**: Switch between desktop/tablet/mobile views
- **Refresh**: Update preview with latest changes

## 💾 Saving Your Work

### Save Draft
- Click "💾 Save Draft" to save to browser localStorage
- Your changes persist across sessions
- Safe to experiment without publishing

### Publish
- Click "🚀 Publish" to make changes live
- Currently saves JSON to download
- **TODO**: GitHub integration coming soon

## 📁 Files

- `admin/designer.html` - The visual designer tool
- `admin/page-config.json` - Page configuration data
- Main reader will load this config automatically

## 🎯 How It Works

1. **Edit** your page using the visual tools
2. **Preview** changes in the live iframe
3. **Save Draft** to localStorage (temporary)
4. **Publish** to update `page-config.json` (permanent)
5. Main reader at `/index.html` loads the config automatically

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

- [ ] Implement GitHub publishing
- [ ] Add image optimization
- [ ] Add undo/redo functionality
- [ ] Add export/import config feature
- [ ] Add more preset themes

## 📝 Notes

- This is a client-side tool (no server required)
- All changes are stored in browser until published
- Safe to experiment - original files unchanged until publish
- Works best in modern browsers (Chrome, Firefox, Edge, Safari)

---

**Need Help?** Check the main admin panel README or implementation plan for more details.

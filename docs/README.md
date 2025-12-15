# battle-bros-reader
Battle Bros comic reader

## About

bwondercomics official website, and Battle Bros comic reader 

## AI Agent Collaboration

This project uses specialized AI agents to enhance development:

- **ComicBot**: Creative UX designer focused on comic reader experience, visual design, and reader engagement
- **TechAdvisor**: Technical architect focused on code quality, performance, security, and best practices

These agents work together to create features that are both delightful and technically excellent. Learn more about their collaboration in [.github/agents/AGENT_COLLABORATION.md](.github/agents/AGENT_COLLABORATION.md).

## Features

- Smooth page-by-page navigation
- Zoom and pan for detailed viewing
- Fully responsive design (mobile, tablet, desktop)
- Keyboard shortcuts
- Retro cyberpunk aesthetic with neon effects
- Progress saving (remembers your place)
- Two-page spread mode on larger screens
- Fullscreen reading mode
- Edge-zone navigation
- Animated page transitions
- Dynamic chapter loading from admin panel

## Usage

Simply open `index.html` in a web browser to start reading. The reader automatically saves your progress.

### Keyboard Shortcuts

- Left/Right - Previous/Next page
- `+ / -` - Zoom in/out
- `0` - Reset zoom
- `F` - Toggle fullscreen
- Double-click - Fit to screen

## Development

This is a static HTML/CSS/JavaScript application with no build process required. All assets are served directly.

### Chapter Data Management

The reader loads chapter data dynamically from `admin/data.json`. When you update chapters in the admin panel, changes are immediately reflected in the reader - no code changes needed!

**Data Structure:**
```json
{
  "chapters": {
    "Chapter 1": ["chapters/01/01.png", "chapters/01/02.png"],
    "Chapter 2": ["chapters/02/01.png"]
  }
}
```

### Contributing

To contribute or modify:
1. Edit `index.html` for structure and logic
2. Use the admin panel to manage chapter data (or edit `admin/data.json` directly)
3. Comic pages are organized in `/chapters/` directory
4. Test across different browsers and devices

For questions about UX/design improvements, consult **ComicBot**.  
For technical implementation or performance questions, consult **TechAdvisor**.

## Architecture & Docs
- High-level architecture: `ARCHITECTURE.md`
- Reader overview + diagrams: `reader-overview.md`
- Admin overview + diagrams: `admin-overview.md`


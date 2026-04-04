# Vite Build Process

## Overview

Vite is now configured as the build tool for the BWonderComics reader, providing:

- Fast development server with hot module replacement (HMR)
- Production builds with minification and tree-shaking
- Automatic console.log removal in production
- Source maps for debugging

## Development Workflow

### Start Development Server

```bash
npm run dev
```

- Default Vite port is `5173` (use `--host 0.0.0.0 --port 5173` for LAN access)
- LAN example: `http://10.0.0.166:5173`
- Hot reload - changes appear instantly without refresh
- API proxy configured to `http://localhost:8001` (bw-quality test server)

### Build for Production

```bash
npm run build
```

- Creates optimized files in `dist/` directory
- Minifies JavaScript and CSS
- Removes all `console.log` statements
- Generates source maps for debugging
- Tree-shakes unused code

### Preview Production Build

```bash
npm run preview
```

- Runs on `http://localhost:4173`
- Serves the built files from `dist/`
- Test production build locally before deployment

## Configuration

**File:** `vite.config.js`

Key settings:

- **Multi-page setup:** index.html, feed.html, comics.html, media.html, admin/index.html
- **API proxy:** `/api` → `http://localhost:8001`
- **Minification:** Terser with console.log removal
- **Source maps:** Enabled for debugging
- **LAN access:** Server binds to `0.0.0.0`

## Deployment

For production deployment:

1. Run `npm run build`
2. Deploy the `dist/` folder contents
3. Configure your web server to serve from `dist/`

## Notes

- Development server defaults to port 5173
- Production builds are in `dist/` (git-ignored)
- Source maps help debug minified production code
- Console.logs are automatically removed in production builds

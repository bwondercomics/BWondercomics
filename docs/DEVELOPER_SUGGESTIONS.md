# Developer Suggestions Checklist

- Harden admin auth: server-side auth/session tokens, HTTPS-only cookies, rate-limit login; drop hardcoded password and avoid storing secrets in localStorage.
- Clarify writes in production: decide on a write path (small backend or GitHub Actions) because `server.py` writes don’t work on static hosting; document the deployment flow.
- Validate inputs: enforce JSON schemas for chapters/posts/media and guard image paths/sizes in `server.py`; reject invalid/oversized uploads.
- Security headers/CSP: add CSP plus `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` via hosting or `server.py`.
- Image pipeline: compress chapter/media images, add thumbnails/placeholders, and cap dimensions at upload time.
- Caching strategy: cache static assets; keep JSON `no-store`; add versioned querystrings for images to avoid stale caches.
- Error/observability: surface fetch/save failures in the UI; add structured logging in `server.py`; optional client error endpoint.
- Testing: add smoke tests for reader interactions, API endpoint tests, and JSON schema checks for data files.
- Accessibility: audit focus/ARIA for overlays, edge zones, controls; offer reduced-motion toggle.
- Code maintainability: split monolithic JS into modules, lint/format; remove legacy patch scripts if unused.
- Deploy hygiene: fix `robots.txt`/`sitemap.xml` domain/paths; keep a pre-deploy checklist (auth/HTTPS/CSP/cache) in docs.

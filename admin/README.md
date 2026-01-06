# BWonderComics Admin

The admin UI is served at `/admin/` by the FastAPI backend and manages:
- Series (including per-series entry labels like `Entry/Entries` + premium flag)
- Entries (chapters/issues/etc) and their page ordering
- Blog/feed posts (draft/scheduled/published) + RSS + optional Bluesky sharing
- Media library (DB-backed; served at `/media.json`)
- Page Designer output (DB-backed; served at `/page-config.json` and `/series/<id>/page-config.json`)
- Users + roles, premium codes, and email subscribers
- Moderation (comments, bans, censored words, comment rate limits, live visitor activity)
- Analytics (Umami stats)

## Auth
Uses the site account system (`/api/login`, `/api/session`) and requires `role=admin`.

## Persistence
- **Postgres (DB-backed)**: series, entries, posts, media items, page configs, users, comments, moderation, premium codes.
- **On disk**: uploaded images under `chapters/` and `comics/<seriesId>/chapters/`, plus media files under `media/`.

## Run / deploy
See `deploy/README.md` and `docs/SYSTEM_OVERVIEW.md`.

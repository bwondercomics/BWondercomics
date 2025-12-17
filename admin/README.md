# BWonderComics Admin

The admin UI is served at `/admin/` by the FastAPI backend and manages:
- Series (including per-series entry labels like `Issue/Issues`)
- Entries (chapters/issues/etc) and their page ordering
- Blog/feed posts (draft/scheduled/published) + RSS
- Media library (`media.json`)
- Page Designer output (`admin/page-config.json` and `admin/series/<id>/page-config.json`)

## Auth
Uses the site account system (`/api/login`, `/api/session`) and requires `role=admin`.

## Persistence
- **Postgres (DB-backed)**: series, entries, posts, users, comments.
- **On disk (saved via `POST /api/save`)**: `media.json`, page config files, and uploaded images under `chapters/` and `comics/<seriesId>/chapters/`.

## Run / deploy
See `deploy/README.md` and `docs/SYSTEM_OVERVIEW.md`.


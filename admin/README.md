# BWonderComics Admin

The admin UI is served at `/admin/` by the FastAPI backend and manages:
- Series (including per-series entry labels like `Issue/Issues`)
- Entries (chapters/issues/etc) and their page ordering
- Blog/feed posts (draft/scheduled/published) + RSS
- Media library (`/media.json`, DB-backed)
- Page Designer output (`/admin/page-config.json` and `/admin/series/<id>/page-config.json`, DB-backed)

## Auth
Uses the site account system (`/api/login`, `/api/session`) and requires `role=admin`.

## Persistence
- **Postgres (DB-backed)**: series, entries, posts, users, comments, media index, page configs.
- **On disk**: uploaded images under `chapters/` and `comics/<seriesId>/chapters/`, plus media files under `media/`.

## Run / deploy
See `deploy/README.md` and `docs/SYSTEM_OVERVIEW.md`.

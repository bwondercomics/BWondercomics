# BWonderComics Admin

The admin UI is served at `/admin/` (static) and manages:

- Series (including per-series entry labels like `Entry/Entries` + premium flag)
- Entries (chapters/issues/etc) and their page ordering
- Blog/feed posts (draft/scheduled/published) + RSS + optional Bluesky sharing
- Media library (DB-backed; served at `/media.json`)
- Page Designer entry now opens the integrated page builder header editor
- Legacy page-config output (`/page-config.json` and `/series/<id>/page-config.json`) remains as a
  fallback-backed data surface while older pages are still being migrated
- Users + roles, premium codes, and email subscribers
- Moderation (comments, bans, censored words, comment rate limits, live visitor activity)
- Analytics (Umami stats)

## Auth

Uses the site account system (`/api/login`, `/api/session`) and requires `role=admin`.

## Persistence

- **Postgres (DB-backed)**: series, entries, posts, media items, page configs, users, comments, moderation, premium codes.
- **On disk**: uploaded images under `comics/<seriesId>/entries/` (primary), plus media files under `media/`.

## Run / deploy

See `deploy/README.md` and `docs/SYSTEM_OVERVIEW.md`.

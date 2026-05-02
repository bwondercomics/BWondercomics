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
- **On disk**: uploaded entry images under `comics/<seriesId>/entries/<label-slug>/...` for public access or `protected/comics/<seriesId>/entries/<label-slug>/...` for premium access, plus media files under `media/`.
- **Premium sync behavior**: saving an entry or toggling a series `premiumOnly` flag now runs the same folder/path sync first, so file moves happen before the DB-backed save is accepted.

## Run / deploy

See `deploy/README.md` and `docs/SYSTEM_OVERVIEW.md`.

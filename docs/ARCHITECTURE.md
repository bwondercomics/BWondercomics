# BWonderComics architecture

This repo is “static-first”: the site is plain HTML/CSS/JS, and a small backend adds the dynamic pieces you can’t do on a purely static host (auth, comments, scheduling, admin write APIs, RSS, analytics proxy).

## Components
- Frontend (static): `index.html`, `feed.html`, `media.html`, `comics.html`, plus `reader/` + `admin/` JS modules.
- Backend (dynamic): FastAPI app in `backend/` (Docker-friendly).
- Database: Postgres (recommended) for users, comments, and posts.

## Data sources
- Chapters/entries + status message: Postgres (served to the frontend as DB-backed JSON at `admin/data.json` and `admin/series/<id>/data.json`).
- Blog/feed posts: Postgres `posts` table (supports draft/scheduled/published).
- Comments + accounts: Postgres (`users`, `comments` tables).
- Media library: `media.json` + files under `media/` (still JSON-on-disk for now).

## Runtime routing
The FastAPI app serves both:
- API routes under `/api/*` (and `/rss.xml`), and
- the static site mounted at `/` (repo root).

## API (current contract)
- Series + entries (DB-backed JSON views, used by reader/admin):
  - `GET /admin/series.json`
  - `GET /admin/data.json`
  - `GET /admin/series/{id}/data.json`
- Public posts:
  - `GET /api/posts` → `{ posts: Post[] }` (published only; scheduled posts appear once due)
  - `GET /api/posts/latest` → `{ post: Post | null }`
- Admin posts (admin cookie required):
  - `GET /api/admin/posts`
  - `POST /api/admin/posts`
  - `PUT /api/admin/posts/{id}`
  - `DELETE /api/admin/posts/{id}`
- RSS:
  - `GET /rss.xml` (generated from DB; only `share=true` and publishable)
- Auth + comments:
  - `POST /api/login`, `POST /api/register`, `GET /api/session`, `POST /api/logout`
  - `GET /api/comments?targetId=...`, `POST /api/comments`
  - moderation + users: `GET /api/admin/users`, `POST /api/admin/users/role`, `POST /api/admin/comments`

## Scheduling model (posts)
- `status=draft` → never public, forces `share=false`
- `status=scheduled` + `date` in the future → becomes public automatically once `date <= now`
- `status=published` → public immediately

## Analytics
If Umami is enabled, the backend serves:
- `GET /analytics.js` (injects the Umami tracker script)
- `/umami/*` proxy (so the tracker + admin embed can be same-origin)

## Legacy / compatibility
- `posts.json` is treated as a legacy seed: the backend can import it into Postgres.
- The old JSON chapter files are treated as a seed; the backend imports them into Postgres and then serves DB-backed JSON at the same paths.
- The legacy single-file backend lives at `legacy/server.py` (deprecated).

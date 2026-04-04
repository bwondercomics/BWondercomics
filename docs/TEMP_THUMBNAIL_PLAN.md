# TEMP: Thumbnail + Preview Pipeline Plan

Goal: DB-backed thumbnails/previews with premium cover visibility and no fake blur.

Recent related changes (builder/promos):

- Promo image picker is now **simple select/upload** (no crop/focus/zoom). This does **not** affect thumbnail generation or media previews.

## 1) Inventory (read-only)

- [x] Map entry gallery cover source (DB-backed `entryMeta.coverImage` or first page path in `entries`).
- [x] Map feed image source (post image) and where it renders.
- [x] Map media gallery grid source (media_items.path).
- [x] Map admin upload flows (media + posts).
- [x] Produce a source → path → desired thumbnail mapping.

## 2) DB schema (source of truth)

- [x] Add entry cover thumbnail field (`entries.cover_thumb_path`). _(Migration applied: `0012_media_thumbnails`.)_
- [x] Add media thumbnail field (`media_items.thumb_path`). _(Migration applied: `0012_media_thumbnails`.)_
- [x] Add media blurred preview field (`media_items.preview_path`) and store the generated preview path in the DB (no derived-only paths in UI). _(Column applied; pipeline live.)_
- [x] Add post → media link (`posts.media_id`) to reuse media thumbnails in feeds. _(Migration applied: `0013_posts_media_id`.)_
- [x] Decide folder layout under `media/previews/`.
- [x] Write migration + backfill approach.

Folder layout (all JPEG):

- `media/previews/thumbs/` (media thumbnails)
- `media/previews/blurred/` (premium blur previews)
- `media/previews/covers/` (entry cover thumbnails)

Backfill approach (plan only, no tool yet):

- Generate thumbnails/previews from existing sources and store the paths in DB.
- Use a one-off admin/ops command that:
  - Scans `media_items` and regenerates `thumb_path` + `preview_path` where missing.
  - Scans entries for `cover_image` and generates `cover_thumb_path` where missing.
  - Skips items with missing source files and logs them.
  - Writes DB updates in batches; no filesystem deletions during backfill.

## 3) Backend pipeline (Pillow)

- [x] Generate compressed thumbnails (JPEG) for entries/media. _(Entries + media done.)_
- [x] Generate compressed blurred previews (JPEG) for premium blur. _(Thumbnail-sized blur in `media/previews/blurred/`.)_
- [x] Update on change; delete on removal. _(Media thumbnails + previews; entry cover thumbnails on save/removal.)_
- [x] Ensure previews are excluded from list-media/sync. _(Still filtered by `media/previews/`.)_
- [x] Persist paths in DB. _(`thumb_path` + `preview_path` + `cover_thumb_path` now written.)_
- [x] Ensure post-created media generates previews. _(Posts now call preview generation.)_

## 4) Admin updates

- [x] Add device upload to media library.
- [x] Show preview image + missing indicator in media preview panel; grid uses thumbnails.
- [x] Ensure premium toggle swaps normal thumbnail ↔ blurred preview for public.
- [x] Post images always become media items; posts reuse media thumbnails.
- [x] Upload preview updates now refresh correctly (DB flush before preview sync).

## 5) Frontend updates

- [ ] Entry gallery keeps DB source but uses cover thumbnail field instead of full-size path.
- [x] Media gallery uses thumbnail; full image loads on open.
- [x] Feed uses media thumbnails from posts API (`thumbPath` via `posts.media_id`); full image loads on open (no separate post thumbnails).
- [x] Update `rightPanelFeed` in `index.html` to use DB thumbnail fields instead of direct paths.
- [x] Update `feed.html` to use DB thumbnail fields instead of direct paths.
- [ ] Premium/hidden rules apply to thumbnails correctly (media done; entry gallery pending).

## 6) Backfill + regen

- [ ] Script to generate thumbnails/previews for existing items.
- [ ] Populate DB fields for current content.

## 7) Verification

- [ ] Public sees blurred preview for premium items; originals remain protected.
- [ ] Premium/admin see originals.
- [ ] Entry covers visible to non-premium; pages still locked.
- [ ] No duplicate preview items in admin gallery.
- [x] Post images generate thumbnails immediately and show in feed + galleries.

## 8) Entry gallery refactor (post-DB fields)

- [ ] Rename legacy `galleryoverlay` UI to `entrygallery` in `index.html`.
- [ ] Swap cover source to DB-backed thumbnail fields (keep `entryMeta` as the source of truth).
- [ ] Ensure premium covers render for non-premium users (thumbnails only).
- [ ] Remove legacy “chapter” wording from entry gallery UI/JS.
- [ ] Coordinate with `docs/LEGACY_CHAPTER_CLEANUP.md` to avoid breaking legacy DOM ids/classes during the refactor.

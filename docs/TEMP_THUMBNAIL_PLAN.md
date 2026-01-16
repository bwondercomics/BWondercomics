# TEMP: Thumbnail + Preview Pipeline Plan

Goal: DB-backed thumbnails/previews with premium cover visibility and no fake blur.

## 1) Inventory (read-only)
- [x] Map entry gallery cover source (DB-backed `entryMeta.coverImage` or first page path in `entries`).
- [x] Map feed image source (post image) and where it renders.
- [x] Map media gallery grid source (media_items.path).
- [x] Map admin upload flows (media + posts).
- [x] Produce a source → path → desired thumbnail mapping.

## 2) DB schema (source of truth)
- [ ] Add entry cover thumbnail field (e.g., `entries.cover_thumb_path`).
- [ ] Add media thumbnail field (`media_items.thumb_path`).
- [ ] Add media blurred preview field (`media_items.preview_path`) and store the generated preview path in the DB (no derived-only paths in UI).
- [ ] Decide folder layout under `media/previews/`.
- [ ] Write migration + backfill approach.

## 3) Backend pipeline (Pillow)
- [ ] Generate compressed thumbnails (JPEG) for entries/media/posts.
- [ ] Generate compressed blurred previews (JPEG) for premium blur.
- [ ] Update on change; delete on removal.
- [ ] Ensure previews are excluded from list-media/sync.
- [ ] Persist paths in DB.

## 4) Admin updates
- [ ] Add device upload to media library.
- [ ] Show preview/thumbnail status in media preview panel.
- [ ] Ensure premium toggle swaps normal thumbnail ↔ blurred preview for public.

## 5) Frontend updates
- [ ] Entry gallery keeps DB source but uses cover thumbnail field instead of full-size path.
- [ ] Media gallery uses thumbnail; full image loads on open.
- [ ] Feed uses thumbnail; full image loads on open.
- [ ] Update `rightPanelFeed` in `index.html` to use DB thumbnail fields instead of direct paths.
- [ ] Update `feed.html` to use DB thumbnail fields instead of direct paths.
- [ ] Premium/hidden rules apply to thumbnails correctly.

## 6) Backfill + regen
- [ ] Script to generate thumbnails/previews for existing items.
- [ ] Populate DB fields for current content.

## 7) Verification
- [ ] Public sees blurred preview for premium items; originals remain protected.
- [ ] Premium/admin see originals.
- [ ] Entry covers visible to non-premium; pages still locked.
- [ ] No duplicate preview items in admin gallery.

## 8) Entry gallery refactor (post-DB fields)
- [ ] Rename legacy `galleryoverlay` UI to `entrygallery` in `index.html`.
- [ ] Swap cover source to DB-backed thumbnail fields (keep `entryMeta` as the source of truth).
- [ ] Ensure premium covers render for non-premium users (thumbnails only).
- [ ] Remove legacy “chapter” wording from entry gallery UI/JS.
- [ ] Coordinate with `docs/LEGACY_CHAPTER_CLEANUP.md` to avoid breaking legacy DOM ids/classes during the refactor.

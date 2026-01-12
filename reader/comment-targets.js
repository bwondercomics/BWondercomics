// Comment target helpers shared by reader/comment UIs.

const MAX_TARGET_LENGTH = 120;

export function slugifyTarget(raw = "", fallback = "chapter") {
  const base = (raw || fallback).toString().trim();
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safe = cleaned || fallback;
  return safe.slice(0, MAX_TARGET_LENGTH);
}

function normalizeDisplayNumber(value) {
  if (Number.isFinite(value)) return value;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildEntryTargetId({ seriesId, entryName, displayNumber }) {
  const series = String(seriesId || "battle-bros").trim() || "battle-bros";
  const number = normalizeDisplayNumber(displayNumber);
  const chapterSlug =
    number == null ? slugifyTarget(entryName || "chapter") : `entry-${number}`;

  const prefix = `${series}:`;
  const remaining = Math.max(1, MAX_TARGET_LENGTH - prefix.length);
  const trimmedChapter =
    chapterSlug.slice(0, remaining).replace(/-+$/g, "") || "chapter";
  return `${prefix}${trimmedChapter}`.slice(0, MAX_TARGET_LENGTH);
}

export function buildPostTargetId(postId) {
  const base = `post:${String(postId || "").trim() || "post"}`;
  return slugifyTarget(base, "post");
}

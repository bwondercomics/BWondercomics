import { el } from "./dom.js";
import { MEDIA_FILE } from "./config.js";
import { state } from "./state.js";
import { saveToServer } from "./core.js";
import { escapeHtml, parseTags, generateMediaId } from "./utils.js";

function createMediaManager({ hideAllSections, setActiveNav, onUseMedia } = {}) {
  const onUse =
    typeof onUseMedia === "function" ? onUseMedia : () => undefined;

  async function loadMedia() {
    try {
      const response = await fetch("/media.json", { cache: "no-cache" });
      if (!response.ok) throw new Error("Failed to load media library");
      const data = await response.json();
      state.mediaItems = Array.isArray(data)
        ? data.map((m) => ({
          id: m.id || generateMediaId(m.path),
          path: m.path || "",
          tags: Array.isArray(m.tags) ? m.tags : parseTags(m.tags || ""),
        }))
        : [];
    } catch (error) {
      console.warn("Error loading media library, starting empty:", error);
      state.mediaItems = [];
    }
    await syncMediaFromDisk(false);
    renderMedia();
  }

  async function saveMedia(showMessage = false) {
    try {
      await saveToServer(MEDIA_FILE, state.mediaItems);
      if (showMessage) setMediaStatus("Media library saved.");
    } catch (error) {
      console.error("Failed to save media:", error);
      setMediaStatus("Failed to save media library", true);
    }
  }

  function setMediaStatus(message, isError = false) {
    if (!el.mediaStatus) return;
    el.mediaStatus.textContent = message;
    el.mediaStatus.style.display = "block";
    el.mediaStatus.style.background = isError
      ? "var(--danger)"
      : "var(--success)";
    el.mediaStatus.style.color = isError ? "var(--text)" : "var(--bg-dark)";
    setTimeout(() => {
      el.mediaStatus.style.display = "none";
    }, 2500);
  }

  function showMediaSection() {
    if (hideAllSections) hideAllSections();
    if (el.mediaSection) {
      el.mediaSection.style.display = "block";
      el.mediaSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    renderMedia();
    if (setActiveNav) setActiveNav(el.btnMedia);
  }

  function renderMedia() {
    if (!el.mediaList) return;
    const term = (el.mediaSearch?.value || "").trim().toLowerCase();
    el.mediaList.innerHTML = "";

    const filtered = state.mediaItems.filter((item) => {
      if (!term) return true;
      return (
        item.path.toLowerCase().includes(term) ||
        (item.tags || []).some((t) => t.toLowerCase().includes(term))
      );
    });

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "chapter-item";
      empty.textContent = "No media found. Add an item above.";
      el.mediaList.appendChild(empty);
      return;
    }

    filtered.forEach((item) => {
      const tagsText = (item.tags || []).join(", ");
      const div = document.createElement("div");
      div.className = "chapter-item";
      div.innerHTML = `
        <div class="chapter-info">
          <div class="chapter-name">${escapeHtml(item.path)}</div>
          <div class="chapter-meta" style="opacity:0.8;">${escapeHtml(
            tagsText || "No tags",
          )}</div>
        </div>
        <div class="chapter-actions">
          <button class="btn-small btn-edit" data-use="${escapeHtml(
            item.id,
          )}">Use</button>
          <button class="btn-small btn-delete" data-remove="${escapeHtml(
            item.id,
          )}">Delete</button>
        </div>
      `;
      el.mediaList.appendChild(div);
    });

    el.mediaList.querySelectorAll("[data-use]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-use");
        const item = state.mediaItems.find((m) => m.id === id);
        if (item) onUse(item);
      });
    });

    el.mediaList.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-remove");
        await deleteMediaItem(id);
      });
    });
  }

  async function syncMediaFromDisk(showMessage = true) {
    try {
      const response = await fetch("/api/list-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Failed to list media folder");

      const diskPaths = result.paths || [];
      const existingMap = new Map(state.mediaItems.map((m) => [m.path, m]));
      let added = 0;
      let updated = 0;

      // Map image paths to tags from posts (if any)
      const postTagMap = new Map(
        (state.posts || [])
          .filter((p) => p.image)
          .map((p) => [
            p.image,
            Array.isArray(p.imageTags)
              ? p.imageTags
              : parseTags(p.imageTags || ""),
          ]),
      );

      diskPaths.forEach((p) => {
        const inferredTags = inferTagsForPath(p);
        const postTags = normalizeTags(postTagMap.get(p));
        const existing = existingMap.get(p);
        if (existing) {
          const currentTags = normalizeTags(existing.tags);
          const merged = mergeTags(currentTags, inferredTags, postTags);
          if (!tagsEqual(currentTags, merged)) {
            existing.tags = merged;
            updated += 1;
          }
        } else {
          state.mediaItems.push({
            id: generateMediaId(p),
            path: p,
            tags: mergeTags([], inferredTags, postTags),
          });
          added += 1;
        }
      });

      if (added > 0 || updated > 0) {
        await saveMedia();
        renderMedia();
      }

      if (showMessage) {
        setMediaStatus(
          added || updated
            ? `Synced ${added} new item(s)${
              updated ? `, updated ${updated} tag set(s)` : ""
            }.`
            : "Media folder is already synced.",
        );
      }
    } catch (error) {
      console.error("Media sync failed:", error);
      if (showMessage) setMediaStatus("Failed to sync media folder.", true);
    }
  }

  async function upsertMediaEntry(path, tags = []) {
    if (!path) return;
    const normalizedTags = normalizeTags(tags);
    const existing = state.mediaItems.find((m) => m.path === path);
    if (existing) {
      const merged = mergeTags(normalizeTags(existing.tags), normalizedTags);
      existing.tags = merged;
    } else {
      state.mediaItems.push({
        id: generateMediaId(path),
        path,
        tags: normalizedTags,
      });
    }
    renderMedia();
    await saveMedia();
  }

  async function addMediaItem() {
    const path = (el.mediaPath?.value || "").trim();
    const tags = parseTags(el.mediaTags?.value || "");
    if (!path) {
      setMediaStatus("Path is required.", true);
      return;
    }

    const existing = state.mediaItems.find((m) => m.path === path);
    if (existing) {
      existing.tags = tags;
      setMediaStatus("Updated existing media tags.");
    } else {
      state.mediaItems.push({ id: generateMediaId(path), path, tags });
      setMediaStatus("Added media item.");
    }

    el.mediaPath.value = "";
    if (el.mediaTags) el.mediaTags.value = "";
    renderMedia();
    await saveMedia();
  }

  function inferTagsForPath(path = "") {
    const lower = path.toLowerCase();
    const tags = [];
    if (lower.includes("patreon")) tags.push("patreon");
    if (lower.includes("volume")) tags.push("volume", "store");
    if (lower.includes("cover")) tags.push("cover");
    return tags;
  }

  function normalizeTags(tags) {
    if (!tags) return [];
    if (!Array.isArray(tags)) return parseTags(tags || "");
    return tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  }

  function mergeTags(...tagGroups) {
    const out = [];
    tagGroups.flat().forEach((tag) => {
      const t = String(tag).trim().toLowerCase();
      if (t && !out.includes(t)) out.push(t);
    });
    return out;
  }

  function tagsEqual(a = [], b = []) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  async function deleteMediaItem(id) {
    const item = state.mediaItems.find((m) => m.id === id);
    if (!item) return;
    const confirmed = window.confirm(
      `Delete media item "${item.path}" from the library?`,
    );
    if (!confirmed) return;

    // Warn about posts using this image
    const usedBy = (state.posts || [])
      .filter((p) => p.image === item.path)
      .map((p) => p.title || p.id)
      .slice(0, 5);
    if (usedBy.length) {
      const proceed = window.confirm(
        `This image is used by posts: ${usedBy.join(", ")}. Continue?`,
      );
      if (!proceed) return;
    }

    state.mediaItems = state.mediaItems.filter((m) => m.id !== id);
    await saveMedia(true);
    renderMedia();
  }

  return {
    addMediaItem,
    deleteMediaItem,
    loadMedia,
    renderMedia,
    saveMedia,
    setMediaStatus,
    showMediaSection,
    syncMediaFromDisk,
    upsertMediaEntry,
  };
}

export { createMediaManager };

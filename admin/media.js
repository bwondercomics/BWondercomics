import { el } from "./dom.js";
import { MEDIA_FILE } from "./config.js";
import { state } from "./state.js";
import { saveToServer } from "./core.js";
import { escapeHtml, parseTags, generateMediaId } from "./utils.js";

function createMediaManager({ hideAllSections, setActiveNav, onUseMedia } = {}) {
  const onUse =
    typeof onUseMedia === "function" ? onUseMedia : () => undefined;
  let selectedMediaId = null;
  let currentMediaOrder = [];
  let currentMediaIndex = -1;
  let previewKeyHandlerBound = false;

  const ACCESS_OPTIONS = ["public", "premium", "private"];
  const PREMIUM_VISIBILITY_OPTIONS = ["blur", "hidden"];
  const POST_ASSET_ROOT = "media/post-assets";

  function normalizeAccess(raw, fallbackPublic = true) {
    const value = String(raw || "").trim().toLowerCase();
    if (ACCESS_OPTIONS.includes(value)) return value;
    return fallbackPublic ? "public" : "private";
  }

  function normalizePremiumVisibility(raw) {
    const value = String(raw || "").trim().toLowerCase();
    return PREMIUM_VISIBILITY_OPTIONS.includes(value) ? value : "blur";
  }

  function getAccessLabel(item) {
    if (!item) return "Unknown";
    if (item.access === "premium") {
      const mode = item.premiumVisibility === "hidden" ? "hidden" : "blurred";
      return `Premium (${mode})`;
    }
    if (item.access === "private") return "Private";
    return "Public";
  }

  function stripProtectedPrefix(path = "") {
    return String(path || "").replace(/^protected\//, "");
  }

  function ensureProtectedPath(path = "") {
    const clean = stripProtectedPrefix(path).replace(/^\/+/, "");
    return `protected/${clean}`;
  }

  function getPathExtension(path = "") {
    const match = String(path || "").match(/(\.[a-zA-Z0-9]+)$/);
    return match ? match[1].toLowerCase() : "";
  }

  function getPostAssetPath(item, sourcePath = "") {
    const ext = getPathExtension(sourcePath || item?.path);
    const suffix = ext || ".png";
    return `${POST_ASSET_ROOT}/${item.id}${suffix}`;
  }

  function getPostAssetPrefix(item) {
    return `${POST_ASSET_ROOT}/${item.id}.`;
  }

  function resolveMediaSrc(path = "") {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith("/")) return path;
    if (path.startsWith("protected/")) {
      const rel = stripProtectedPrefix(path);
      return `/api/protected/${rel}`;
    }
    return `/${path}`;
  }

  function resolvePreviewSrc(item) {
    const id = String(item?.id || "").trim();
    if (!id) return "";
    return `/media/previews/${encodeURIComponent(id)}.jpg`;
  }

  function getPostsUsingMedia(item) {
    const prefix = getPostAssetPrefix(item);
    return (state.posts || []).filter((post) => {
      const image = post?.image || "";
      return image === item.path || (prefix && image.startsWith(prefix));
    });
  }

  async function updatePostImage(post, imagePath) {
    if (!post || !post.id) return;
    const payload = {
      title: post.title || "Update",
      content: post.content || "",
      image: imagePath,
      imageTags: Array.isArray(post.imageTags) ? post.imageTags : parseTags(post.imageTags || ""),
      imageFocus: post.imageFocus || "center",
      share: post.share !== false,
      shareBluesky: post.shareBluesky === true,
      status: post.status || "published",
      date: post.date || null,
    };
    const response = await fetch(`/api/admin/posts/${encodeURIComponent(post.id)}`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || "Failed to update post image");
    }
    const saved = result.post || null;
    if (saved) {
      const idx = state.posts.findIndex((p) => p.id === saved.id);
      if (idx !== -1) {
        state.posts[idx] = {
          ...saved,
          status: saved.status || "published",
          imageFocus: saved.imageFocus || "center",
          share: saved.share !== false,
          shareBluesky: saved.shareBluesky === true,
          imageTags: Array.isArray(saved.imageTags)
            ? saved.imageTags
            : parseTags(saved.imageTags || ""),
        };
      }
    }
  }

  async function ensurePostAsset(item, sourcePath, postsUsing) {
    if (!item || !sourcePath || !postsUsing?.length) return;
    const destPath = getPostAssetPath(item, sourcePath);
    const resp = await fetch("/api/copy-path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: sourcePath, to: destPath }),
    });
    if (!resp.ok) {
      const result = await resp.json().catch(() => ({}));
      throw new Error(result.error || "Unable to copy post asset");
    }
    for (const post of postsUsing) {
      if (post.image === destPath) continue;
      await updatePostImage(post, destPath);
    }
  }

  function getUsageMap() {
    const usage = new Map();
    (state.posts || []).forEach((post) => {
      if (!post?.image) return;
      usage.set(post.image, (usage.get(post.image) || 0) + 1);
      const match = post.image.match(/^media\/post-assets\/([^./]+)\./);
      if (match) {
        const item = state.mediaItems.find((m) => m.id === match[1]);
        if (item?.path) {
          usage.set(item.path, (usage.get(item.path) || 0) + 1);
        }
      }
    });
    return usage;
  }

  function getSortMode() {
    return (el.mediaSort?.value || "library").trim();
  }

  function applySort(items, usageMap) {
    const mode = getSortMode();
    if (mode === "library") return items;
    const sorted = [...items];
    if (mode === "name") {
      sorted.sort((a, b) => (a.path || "").localeCompare(b.path || ""));
    } else if (mode === "tags") {
      sorted.sort(
        (a, b) => (b.tags?.length || 0) - (a.tags?.length || 0),
      );
    } else if (mode === "usage") {
      sorted.sort(
        (a, b) =>
          (usageMap.get(b.path) || 0) - (usageMap.get(a.path) || 0),
      );
    }
    return sorted;
  }

  async function loadMedia() {
    try {
      const response = await fetch("/media.json", { cache: "no-cache" });
      if (!response.ok) throw new Error("Failed to load media library");
      const data = await response.json();
      state.mediaItems = Array.isArray(data)
        ? data
            .filter((m) => m && m.path && !String(m.path).startsWith("media/previews/"))
            .map((m) => {
          const fallbackPublic = m.public !== false;
          const access = normalizeAccess(m.access ?? m.visibility, fallbackPublic);
          const premiumVisibility = normalizePremiumVisibility(
            m.premiumVisibility ?? m.premium_visibility,
          );
          return {
            id: m.id || generateMediaId(m.path),
            path: m.path || "",
            tags: Array.isArray(m.tags) ? m.tags : parseTags(m.tags || ""),
            access,
            premiumVisibility,
            public: access === "public",
          };
        })
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

  async function moveMediaPath(item, nextAccess) {
    const currentPath = item?.path || "";
    if (!currentPath) return currentPath;
    const wantsProtected = nextAccess !== "public";
    const desiredPath = wantsProtected
      ? ensureProtectedPath(currentPath)
      : stripProtectedPrefix(currentPath);
    if (desiredPath === currentPath) return currentPath;

    const resp = await fetch("/api/rename-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: currentPath, to: desiredPath }),
    });
    if (!resp.ok) {
      const result = await resp.json().catch(() => ({}));
      throw new Error(result.error || "Unable to move media file");
    }
    return desiredPath;
  }

  function showMediaSection() {
    if (hideAllSections) hideAllSections();
    if (el.mediaSection) {
      el.mediaSection.style.display = "block";
      el.mediaSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (el.adminContent) {
      el.adminContent.classList.add("media-content-wide");
    }
    bindAddMediaControls();
    renderMedia();
    if (setActiveNav) setActiveNav(el.btnMedia);
  }

  function renderMedia() {
    if (!el.mediaList || !el.mediaGallery) return;
    const term = (el.mediaSearch?.value || "").trim().toLowerCase();
    el.mediaList.innerHTML = "";
    el.mediaGallery.innerHTML = "";

    const usageMap = getUsageMap();
    const filtered = state.mediaItems.filter((item) => {
      if (String(item.path || "").startsWith("media/previews/")) return false;
      if (!term) return true;
      return (
        item.path.toLowerCase().includes(term) ||
        (item.tags || []).some((t) => t.toLowerCase().includes(term))
      );
    });
    const sorted = applySort(filtered, usageMap);
    currentMediaOrder = sorted.map((item) => item.id);
    currentMediaIndex = selectedMediaId
      ? currentMediaOrder.indexOf(selectedMediaId)
      : -1;

    if (el.mediaListCount || el.mediaGalleryCount) {
      const total = state.mediaItems.length;
      const countText = term ? `${sorted.length}/${total}` : String(sorted.length);
      if (el.mediaListCount) el.mediaListCount.textContent = countText;
      if (el.mediaGalleryCount) el.mediaGalleryCount.textContent = countText;
    }

    if (!sorted.length) {
      currentMediaOrder = [];
      currentMediaIndex = -1;
      const emptyList = document.createElement("div");
      emptyList.className = "chapter-item media-item";
      emptyList.textContent = "No media found. Add an item above.";
      el.mediaList.appendChild(emptyList);

      const emptyGallery = document.createElement("div");
      emptyGallery.className = "chapter-item";
      emptyGallery.textContent = "No media to preview.";
      el.mediaGallery.appendChild(emptyGallery);
      renderMediaPreview(null, 0);
      return;
    }

    sorted.forEach((item) => {
      item.access = normalizeAccess(item.access, item.public !== false);
      item.premiumVisibility = normalizePremiumVisibility(item.premiumVisibility);
      item.public = item.access === "public";
      const usageCount = usageMap.get(item.path) || 0;
      const tagsText = (item.tags || []).join(", ");
      const visibilityText = getAccessLabel(item);
      const div = document.createElement("div");
      div.className = "chapter-item media-item";
      if (item.id === selectedMediaId) {
        div.classList.add("media-item--selected");
      }
      div.innerHTML = `
        <div class="chapter-info">
          <div class="chapter-name">${escapeHtml(item.path)}</div>
          <div class="chapter-meta" style="opacity:0.8;">${escapeHtml(
            tagsText || "No tags",
          )}</div>
          <div class="chapter-meta" style="opacity:0.7;">${escapeHtml(
            usageCount ? `Used in ${usageCount} post(s)` : "Unused",
          )}</div>
          <div class="chapter-meta" style="opacity:0.7;">${escapeHtml(
            visibilityText,
          )}</div>
        </div>
        <div class="chapter-actions">
          <button class="btn-small btn-edit" data-use="${escapeHtml(
            item.id,
          )}">Use</button>
          <button class="btn-small btn-secondary" data-copy="${escapeHtml(
            item.id,
          )}">Copy</button>
          <button class="btn-small btn-secondary" data-tags="${escapeHtml(
            item.id,
          )}">Edit tags</button>
          <button class="btn-small btn-delete" data-remove="${escapeHtml(
            item.id,
          )}">Delete</button>
        </div>
      `;
      el.mediaList.appendChild(div);

      div.addEventListener("click", (event) => {
        if (event.target.closest("button")) return;
        selectedMediaId = item.id;
        renderMedia();
      });

      const card = document.createElement("div");
      card.className = "media-card";
      if (item.id === selectedMediaId) {
        card.classList.add("media-item--selected");
      }
      const resolvedSrc = resolveMediaSrc(item.path);
      card.innerHTML = `
        <img src="${escapeHtml(resolvedSrc)}" alt="${escapeHtml(item.path)}" loading="lazy" />
        <div class="media-card-body">
          <div class="media-card-title">${escapeHtml(item.path)}</div>
          <div class="media-card-tags">${escapeHtml(tagsText || "No tags")}</div>
          <div class="media-card-tags">${escapeHtml(
            usageCount ? `Used in ${usageCount} post(s)` : "Unused",
          )}</div>
          <div class="media-card-tags">${escapeHtml(visibilityText)}</div>
          <div class="media-card-actions">
            <button class="btn-small btn-edit" data-use="${escapeHtml(
              item.id,
            )}">Use</button>
            <button class="btn-small btn-secondary" data-copy="${escapeHtml(
              item.id,
            )}">Copy</button>
            <button class="btn-small btn-delete" data-remove="${escapeHtml(
              item.id,
            )}">Delete</button>
          </div>
        </div>
      `;
      el.mediaGallery.appendChild(card);
      card.addEventListener("click", (event) => {
        if (event.target.closest("button")) return;
        selectedMediaId = item.id;
        renderMedia();
      });
    });

    const selectedItem = selectedMediaId
      ? state.mediaItems.find((item) => item.id === selectedMediaId)
      : null;
    renderMediaPreview(
      selectedItem,
      selectedItem ? usageMap.get(selectedItem.path) || 0 : 0,
    );

    const attachActions = (container) => {
      container.querySelectorAll("[data-use]").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.stopPropagation();
          const id = btn.getAttribute("data-use");
          const item = state.mediaItems.find((m) => m.id === id);
          if (item) {
            selectedMediaId = item.id;
            onUse(item);
            renderMedia();
          }
        });
      });

      container.querySelectorAll("[data-copy]").forEach((btn) => {
        btn.addEventListener("click", async (event) => {
          event.stopPropagation();
          const id = btn.getAttribute("data-copy");
          const item = state.mediaItems.find((m) => m.id === id);
          if (!item) return;
          try {
            await navigator.clipboard.writeText(item.path);
            setMediaStatus("Path copied to clipboard.");
          } catch {
            window.prompt("Copy media path:", item.path);
          }
        });
      });

      container.querySelectorAll("[data-tags]").forEach((btn) => {
        btn.addEventListener("click", async (event) => {
          event.stopPropagation();
          const id = btn.getAttribute("data-tags");
          const item = state.mediaItems.find((m) => m.id === id);
          if (!item) return;
          const current = (item.tags || []).join(", ");
          const next = window.prompt("Edit tags (comma separated):", current);
          if (next === null) return;
          item.tags = parseTags(next);
          await saveMedia(true);
          renderMedia();
        });
      });

      container.querySelectorAll("[data-remove]").forEach((btn) => {
        btn.addEventListener("click", async (event) => {
          event.stopPropagation();
          const id = btn.getAttribute("data-remove");
          await deleteMediaItem(id);
        });
      });
    };

    attachActions(el.mediaList);
    attachActions(el.mediaGallery);
  }

  function renderMediaPreview(item, usageCount) {
    if (!el.mediaPreview || !el.mediaPreviewImg || !el.mediaPreviewInfo) return;
    if (!item) {
      el.mediaPreview.style.display = "none";
      el.mediaPreview.setAttribute("aria-hidden", "true");
      return;
    }

    const tagsText = (item.tags || []).join(", ") || "No tags";
    el.mediaPreview.style.display = "grid";
    el.mediaPreview.setAttribute("aria-hidden", "false");
    el.mediaPreviewImg.src = resolveMediaSrc(item.path);
    el.mediaPreviewImg.alt = item.path;
    if (el.mediaPreviewBlurImg && el.mediaPreviewBlurMissing) {
      const previewSrc = resolvePreviewSrc(item);
      el.mediaPreviewBlurMissing.style.display = "none";
      el.mediaPreviewBlurImg.style.display = "block";
      if (!previewSrc) {
        el.mediaPreviewBlurImg.removeAttribute("src");
        el.mediaPreviewBlurImg.style.display = "none";
        el.mediaPreviewBlurMissing.style.display = "flex";
        el.mediaPreviewBlurMissing.textContent = "Preview missing";
      } else {
        el.mediaPreviewBlurImg.onerror = () => {
          el.mediaPreviewBlurImg.style.display = "none";
          el.mediaPreviewBlurMissing.style.display = "flex";
          el.mediaPreviewBlurMissing.textContent = "Preview missing";
        };
        el.mediaPreviewBlurImg.onload = () => {
          el.mediaPreviewBlurMissing.style.display = "none";
          el.mediaPreviewBlurImg.style.display = "block";
        };
        el.mediaPreviewBlurImg.src = previewSrc;
        el.mediaPreviewBlurImg.alt = `${item.path} preview`;
      }
    }
    if (el.mediaPreviewPath) el.mediaPreviewPath.textContent = item.path;
    if (el.mediaPreviewTags) el.mediaPreviewTags.textContent = `Tags: ${tagsText}`;
    if (el.mediaPreviewUsage) {
      const usageText = usageCount
        ? `Used in ${usageCount} post(s)`
        : "Unused in posts";
      el.mediaPreviewUsage.textContent = usageText;
    }
    if (el.mediaPreviewUse) el.mediaPreviewUse.dataset.mediaId = item.id;
    if (el.mediaPreviewCopy) el.mediaPreviewCopy.dataset.mediaId = item.id;
    if (el.mediaPreviewTagsBtn) el.mediaPreviewTagsBtn.dataset.mediaId = item.id;
    if (el.mediaPreviewDelete) el.mediaPreviewDelete.dataset.mediaId = item.id;
    if (el.mediaPreviewAccess) {
      el.mediaPreviewAccess.dataset.mediaId = item.id;
      el.mediaPreviewAccess.value = item.access || "public";
    }
    if (el.mediaPreviewPremiumVisibility) {
      el.mediaPreviewPremiumVisibility.dataset.mediaId = item.id;
      el.mediaPreviewPremiumVisibility.value = item.premiumVisibility || "blur";
    }
    if (el.mediaPreviewPremiumRow) {
      el.mediaPreviewPremiumRow.style.display =
        item.access === "premium" ? "block" : "none";
    }
    if (el.mediaPreviewPrev) {
      el.mediaPreviewPrev.disabled = currentMediaIndex <= 0;
      el.mediaPreviewPrev.dataset.mediaId = item.id;
    }
    if (el.mediaPreviewNext) {
      el.mediaPreviewNext.disabled =
        currentMediaIndex === -1 || currentMediaIndex >= currentMediaOrder.length - 1;
      el.mediaPreviewNext.dataset.mediaId = item.id;
    }
    bindPreviewActions();
  }

  function updateAddMediaVisibilityUI() {
    if (!el.mediaAccess || !el.mediaPremiumVisibilityRow) return;
    const accessValue = normalizeAccess(el.mediaAccess.value, true);
    el.mediaAccess.value = accessValue;
    el.mediaPremiumVisibilityRow.style.display =
      accessValue === "premium" ? "block" : "none";
  }

  function bindAddMediaControls() {
    if (el.mediaAccess && !el.mediaAccess.dataset.bound) {
      el.mediaAccess.dataset.bound = "true";
      el.mediaAccess.addEventListener("change", () => {
        updateAddMediaVisibilityUI();
      });
    }
    updateAddMediaVisibilityUI();
  }

  function selectMediaByIndex(nextIndex) {
    if (nextIndex < 0 || nextIndex >= currentMediaOrder.length) return;
    const nextId = currentMediaOrder[nextIndex];
    if (!nextId) return;
    selectedMediaId = nextId;
    renderMedia();
  }

  function handlePreviewKeydown(event) {
    if (!el.mediaPreview || el.mediaPreview.style.display === "none") return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectMediaByIndex(currentMediaIndex - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      selectMediaByIndex(currentMediaIndex + 1);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      selectedMediaId = null;
      renderMedia();
    }
  }

  function bindPreviewActions() {
    if (el.mediaPreviewUse && !el.mediaPreviewUse.dataset.bound) {
      el.mediaPreviewUse.dataset.bound = "true";
      el.mediaPreviewUse.addEventListener("click", () => {
        const id = el.mediaPreviewUse.dataset.mediaId;
        const item = state.mediaItems.find((m) => m.id === id);
        if (!item) return;
        selectedMediaId = item.id;
        onUse(item);
        renderMedia();
      });
    }

    if (el.mediaPreviewCopy && !el.mediaPreviewCopy.dataset.bound) {
      el.mediaPreviewCopy.dataset.bound = "true";
      el.mediaPreviewCopy.addEventListener("click", async () => {
        const id = el.mediaPreviewCopy.dataset.mediaId;
        const item = state.mediaItems.find((m) => m.id === id);
        if (!item) return;
        try {
          await navigator.clipboard.writeText(item.path);
          setMediaStatus("Path copied to clipboard.");
        } catch {
          window.prompt("Copy media path:", item.path);
        }
      });
    }

    if (el.mediaPreviewTagsBtn && !el.mediaPreviewTagsBtn.dataset.bound) {
      el.mediaPreviewTagsBtn.dataset.bound = "true";
      el.mediaPreviewTagsBtn.addEventListener("click", async () => {
        const id = el.mediaPreviewTagsBtn.dataset.mediaId;
        const item = state.mediaItems.find((m) => m.id === id);
        if (!item) return;
        const current = (item.tags || []).join(", ");
        const next = window.prompt("Edit tags (comma separated):", current);
        if (next === null) return;
        item.tags = parseTags(next);
        await saveMedia(true);
        renderMedia();
      });
    }

    if (el.mediaPreviewAccess && !el.mediaPreviewAccess.dataset.bound) {
      el.mediaPreviewAccess.dataset.bound = "true";
      el.mediaPreviewAccess.addEventListener("change", async () => {
        const id = el.mediaPreviewAccess.dataset.mediaId;
        const item = state.mediaItems.find((m) => m.id === id);
        if (!item) return;
        const nextAccess = normalizeAccess(el.mediaPreviewAccess.value, true);
        const postsUsing = getPostsUsingMedia(item);
        try {
          const nextPath = await moveMediaPath(item, nextAccess);
          item.path = nextPath;
          if (postsUsing.length) {
            await ensurePostAsset(item, nextPath, postsUsing);
          }
        } catch (error) {
          console.warn("Failed to update media access:", error);
          setMediaStatus(`Media update failed: ${error.message}`, true);
          el.mediaPreviewAccess.value = item.access || "public";
          return;
        }
        item.access = nextAccess;
        item.public = nextAccess === "public";
        if (nextAccess !== "premium") {
          item.premiumVisibility = "blur";
        }
        await saveMedia(true);
        renderMedia();
      });
    }

    if (el.mediaPreviewPremiumVisibility && !el.mediaPreviewPremiumVisibility.dataset.bound) {
      el.mediaPreviewPremiumVisibility.dataset.bound = "true";
      el.mediaPreviewPremiumVisibility.addEventListener("change", async () => {
        const id = el.mediaPreviewPremiumVisibility.dataset.mediaId;
        const item = state.mediaItems.find((m) => m.id === id);
        if (!item) return;
        const nextVisibility = normalizePremiumVisibility(el.mediaPreviewPremiumVisibility.value);
        item.premiumVisibility = nextVisibility;
        await saveMedia(true);
        renderMedia();
      });
    }

    if (el.mediaPreviewDelete && !el.mediaPreviewDelete.dataset.bound) {
      el.mediaPreviewDelete.dataset.bound = "true";
      el.mediaPreviewDelete.addEventListener("click", async () => {
        const id = el.mediaPreviewDelete.dataset.mediaId;
        if (!id) return;
        await deleteMediaItem(id);
      });
    }

    if (el.mediaPreviewClose && !el.mediaPreviewClose.dataset.bound) {
      el.mediaPreviewClose.dataset.bound = "true";
      el.mediaPreviewClose.addEventListener("click", () => {
        selectedMediaId = null;
        renderMedia();
      });
    }

    if (el.mediaPreviewPrev && !el.mediaPreviewPrev.dataset.bound) {
      el.mediaPreviewPrev.dataset.bound = "true";
      el.mediaPreviewPrev.addEventListener("click", () => {
        selectMediaByIndex(currentMediaIndex - 1);
      });
    }

    if (el.mediaPreviewNext && !el.mediaPreviewNext.dataset.bound) {
      el.mediaPreviewNext.dataset.bound = "true";
      el.mediaPreviewNext.addEventListener("click", () => {
        selectMediaByIndex(currentMediaIndex + 1);
      });
    }

    if (!previewKeyHandlerBound) {
      previewKeyHandlerBound = true;
      document.addEventListener("keydown", handlePreviewKeydown);
    }
  }

  async function syncMediaFromDisk(showMessage = true) {
    try {
      const response = await fetch("/api/list-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to list media folder");
      }

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
        if (String(p).startsWith("media/previews/")) return;
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
            access: "public",
            premiumVisibility: "blur",
            public: true,
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
    if (String(path).startsWith(`${POST_ASSET_ROOT}/`)) return;
    if (String(path).startsWith("media/previews/")) return;
    const normalizedTags = normalizeTags(tags);
    const existing = state.mediaItems.find((m) => m.path === path);
    if (existing) {
      const merged = mergeTags(normalizeTags(existing.tags), normalizedTags);
      existing.tags = merged;
    } else {
      const newItem = {
        id: generateMediaId(path),
        path,
        tags: normalizedTags,
        access: "public",
        premiumVisibility: "blur",
        public: true,
      };
      state.mediaItems.push(newItem);
      selectedMediaId = newItem.id;
    }
    renderMedia();
    await saveMedia();
  }

  async function addMediaItem() {
    let path = (el.mediaPath?.value || "").trim();
    const tags = parseTags(el.mediaTags?.value || "");
    const access = normalizeAccess(el.mediaAccess?.value, true);
    const premiumVisibility = normalizePremiumVisibility(el.mediaPremiumVisibility?.value);
    if (!path) {
      setMediaStatus("Path is required.", true);
      return;
    }

    const existing = state.mediaItems.find((m) => m.path === path);
    if (existing) {
      const postsUsing = getPostsUsingMedia(existing);
      try {
        const nextPath = await moveMediaPath(existing, access);
        existing.path = nextPath;
        path = nextPath;
        if (postsUsing.length) {
          await ensurePostAsset(existing, nextPath, postsUsing);
        }
      } catch (error) {
        console.warn("Failed to move media file:", error);
        setMediaStatus(`Media move failed: ${error.message}`, true);
        return;
      }
      existing.tags = tags;
      existing.access = access;
      existing.premiumVisibility = premiumVisibility;
      existing.public = access === "public";
      setMediaStatus("Updated existing media tags.");
    } else {
      try {
        const tempItem = { path };
        const nextPath = await moveMediaPath(tempItem, access);
        path = nextPath;
      } catch (error) {
        console.warn("Failed to move media file:", error);
        setMediaStatus(`Media move failed: ${error.message}`, true);
        return;
      }
      const newItem = {
        id: generateMediaId(path),
        path,
        tags,
        access,
        premiumVisibility,
        public: access === "public",
      };
      state.mediaItems.push(newItem);
      selectedMediaId = newItem.id;
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
    if (selectedMediaId === id) selectedMediaId = null;
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

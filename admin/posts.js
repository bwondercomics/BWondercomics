import { el } from "./dom.js";
import { state, POST_DRAFT_KEY } from "./state.js";
import { sanitizeHtml } from "./core.js";
import { escapeHtml, parseTags, readFileAsBase64 } from "./utils.js";

const POSTS_API = "/api/admin/posts";
const BLUESKY_CHAR_LIMIT = 300;

function stripHtmlToText(value = "") {
  const parser = new DOMParser();
  const doc = parser.parseFromString(value, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

function buildBlueskyText(title = "", content = "") {
  const cleanTitle = String(title || "").trim();
  const body = stripHtmlToText(content || "");
  const parts = [];
  if (cleanTitle) parts.push(cleanTitle);
  if (body) parts.push(body);
  return parts.join("\n\n").trim();
}

function isoToDateTimeLocal(iso = "") {
  const value = String(iso || "").trim();
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(
    dt.getDate(),
  )}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function dateTimeLocalToIso(raw = "") {
  const value = String(raw || "").trim();
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString();
}

function createPostsManager({
  hideAllSections,
  setActiveNav,
  upsertMediaEntry,
} = {}) {
  const upsertMedia =
    typeof upsertMediaEntry === "function"
      ? upsertMediaEntry
      : async () => {};

  function setPostStatus(message, isError = false) {
    if (!el.postStatus) return;
    el.postStatus.textContent = message;
    el.postStatus.style.display = "block";
    el.postStatus.style.background = isError
      ? "var(--danger)"
      : "var(--success)";
    el.postStatus.style.color = isError ? "var(--text)" : "var(--bg-dark)";
    setTimeout(() => {
      el.postStatus.style.display = "none";
    }, 3000);
  }

  function getBlueskyTextFromForm() {
    const title = el.postTitle?.value || "";
    const rawContent = (el.postContent?.innerHTML || "").trim();
    const content = sanitizeHtml(rawContent);
    return buildBlueskyText(title, content);
  }

  function hasBlueskyImage() {
    const imageValue = (el.postImage?.value || "").trim();
    const hasFile = !!el.postImageFile?.files?.length;
    return Boolean(imageValue || hasFile);
  }

  function updateBlueskyCounter() {
    if (!el.blueskyCharCounter) return;
    const text = getBlueskyTextFromForm();
    const count = text.length;
    const active = el.postShareBluesky?.checked === true;
    const imageOnly = !text && hasBlueskyImage();
    const suffix = imageOnly ? " (image only)" : " (title + content)";

    el.blueskyCharCounter.textContent = `Bluesky text: ${count}/${BLUESKY_CHAR_LIMIT}${suffix}`;
    el.blueskyCharCounter.classList.toggle(
      "is-over",
      active && count > BLUESKY_CHAR_LIMIT,
    );
    el.blueskyCharCounter.classList.toggle("is-muted", !active);

    if (el.btnSavePost) {
      const blocked =
        active &&
        (count > BLUESKY_CHAR_LIMIT || (!text && !hasBlueskyImage()));
      el.btnSavePost.disabled = blocked;
    }
  }

  function bindBlueskyCounter() {
    const handler = () => updateBlueskyCounter();
    if (el.postTitle) el.postTitle.addEventListener("input", handler);
    if (el.postContent) el.postContent.addEventListener("input", handler);
    if (el.postShareBluesky) el.postShareBluesky.addEventListener("change", handler);
    if (el.postImage) el.postImage.addEventListener("input", handler);
    if (el.postImageFile) el.postImageFile.addEventListener("change", handler);
    updateBlueskyCounter();
  }

  function showBlogSection() {
    if (hideAllSections) hideAllSections();
    if (el.blogSection) {
      el.blogSection.style.display = "block";
      el.blogSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    renderPosts();
    if (setActiveNav) setActiveNav(el.btnBlog);
  }

  function resetPostForm() {
    state.editingPostId = null;
    el.postTitle.value = "";
    el.postImage.value = "";
    if (el.postImageFile) el.postImageFile.value = "";
    if (el.postImageTags) el.postImageTags.value = "";
    if (el.postImageFocus) el.postImageFocus.value = "center";
    if (el.postPublishAt) el.postPublishAt.value = "";
    if (el.postContent) el.postContent.innerHTML = "";
    el.postShare.checked = true;
    if (el.postShareBluesky) el.postShareBluesky.checked = false;
    el.btnSavePost.textContent = "Publish Post";
    if (el.btnSaveDraft) el.btnSaveDraft.textContent = "Save Draft";
    updateBlueskyCounter();
  }

  function getPostPreview(content = "") {
    const trimmed = content.trim();
    if (trimmed.length <= 140) return trimmed || "No preview text";
    return `${trimmed.slice(0, 140)}...`;
  }

  function formatPostDate(dateStr) {
    if (!dateStr) return "Date not set";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "Date not set";
    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function renderPosts() {
    el.postList.innerHTML = "";

    if (!state.posts.length) {
      const empty = document.createElement("div");
      empty.className = "chapter-item";
      empty.textContent = "No posts yet. Create the first update!";
      el.postList.appendChild(empty);
      return;
    }

    const sorted = [...state.posts].sort(
      (a, b) =>
        new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
    );

    sorted.forEach((post) => {
      const item = document.createElement("div");
      item.className = "chapter-item";
      const dateLabel = formatPostDate(post.date);
      const preview = getPostPreview(
        (post.content || "").replace(/<[^>]+>/g, ""),
      );
      const statusLabel =
        post.status === "draft"
          ? '<span style="color: var(--accent); font-size: 0.85rem;">Draft</span>'
          : post.status === "scheduled"
            ? '<span style="color: var(--primary); font-size: 0.85rem;">Scheduled</span>'
            : '<span style="color: var(--success); font-size: 0.85rem;">Published</span>';
      const shareLabel =
        post.share === false
          ? '<span style="color: var(--danger); font-size: 0.85rem;">Not broadcasting</span>'
          : '<span style="color: var(--success); font-size: 0.85rem;">Broadcasting</span>';
      const blueskyLabel =
        post.shareBluesky === true
          ? '<span style="color: var(--primary); font-size: 0.85rem;">Bluesky on</span>'
          : '<span style="color: var(--danger); font-size: 0.85rem;">Bluesky off</span>';
      const tagText =
        post.imageTags && post.imageTags.length
          ? `Tags: ${post.imageTags.join(", ")}`
          : "";
      const blueskyError =
        post.blueskyError && post.blueskyError.trim()
          ? `Bluesky error: ${post.blueskyError}`
          : "";

      item.innerHTML = `
        <div class="chapter-info">
          <div class="chapter-name">${escapeHtml(post.title?.trim() || "Update")}</div>
          <div class="chapter-meta">${dateLabel} - ${shareLabel} - ${blueskyLabel} - ${statusLabel}</div>
          ${
            tagText
              ? `<div class="chapter-meta" style="opacity:0.8;">${escapeHtml(
                tagText,
              )}</div>`
              : ""
          }
          <div class="chapter-meta" style="opacity:0.8;">${escapeHtml(
            preview,
          )}</div>
          ${
            blueskyError
              ? `<div class="chapter-meta" style="color: var(--danger);">${escapeHtml(
                blueskyError,
              )}</div>`
              : ""
          }
        </div>
        <div class="chapter-actions">
          <button type="button" class="btn-small btn-edit" data-post="${
            post.id
          }">Edit</button>
          <button type="button" class="btn-small btn-delete" data-post="${
            post.id
          }">Delete</button>
        </div>
      `;
      el.postList.appendChild(item);
    });

    el.postList.querySelectorAll("[data-post]").forEach((btn) => {
      const id = btn.getAttribute("data-post");
      if (btn.classList.contains("btn-edit")) {
        btn.addEventListener("click", () => populatePostForm(id));
      } else if (btn.classList.contains("btn-delete")) {
        btn.addEventListener("click", () => deletePost(id));
      }
    });
  }

  async function loadPosts() {
    // Fetch admin post list from the DB.
    try {
      const response = await fetch(POSTS_API, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to load posts. Make sure you are signed in as an admin (via comments login).",
        );
      }
      const posts = Array.isArray(data.posts) ? data.posts : [];
      state.posts = posts
        .filter((p) => p && typeof p === "object")
        .map((p) => ({
          ...p,
          status: p.status || "published",
          imageFocus: p.imageFocus || "center",
          share: p.share !== false,
          shareBluesky: p.shareBluesky === true,
          blueskyError: p.blueskyError || "",
          imageTags: Array.isArray(p.imageTags)
            ? p.imageTags
            : parseTags(p.imageTags || ""),
        }));
      renderPosts();
    } catch (error) {
      console.error("Error loading posts:", error);
      state.posts = [];
      renderPosts();
      setPostStatus(
        error.message ||
          "Could not load existing posts. Create a new one to get started.",
        true,
      );
    }
  }

  function loadLocalDraft() {
    try {
      const raw = localStorage.getItem(POST_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (!draft) return;
      if (state.editingPostId) return;
      if (el.postTitle && !el.postTitle.value) {
        el.postTitle.value = draft.title || "";
        el.postImage.value = draft.image || "";
        if (el.postImageTags) {
          el.postImageTags.value = (draft.imageTags || []).join(", ");
        }
        if (el.postPublishAt && draft.publishAt) {
          el.postPublishAt.value = String(draft.publishAt || "");
        }
        if (el.postContent) {
          el.postContent.innerHTML = draft.content || "";
        }
      if (el.postShare) el.postShare.checked = draft.share !== false;
      if (el.postShareBluesky && draft.shareBluesky !== undefined) {
        el.postShareBluesky.checked = draft.shareBluesky === true;
      }
      updateBlueskyCounter();
      setPostStatus("Loaded saved draft from browser storage.");
    }
  } catch (e) {
      console.warn("Could not load local draft", e);
    }
  }

  function populatePostForm(postId) {
    const post = state.posts.find((p) => p.id === postId);
    if (!post) return;
    state.editingPostId = post.id;
    el.postTitle.value = post.title || "";
    el.postImage.value = post.image || "";
    if (el.postImageTags) {
      el.postImageTags.value = (post.imageTags || []).join(", ");
    }
    if (el.postImageFocus) el.postImageFocus.value = post.imageFocus || "center";
    if (el.postPublishAt) {
      el.postPublishAt.value = isoToDateTimeLocal(post.date || "");
    }
    if (el.postContent) el.postContent.innerHTML = post.content || "";
    el.postShare.checked = post.share !== false;
    if (el.postShareBluesky) {
      el.postShareBluesky.checked = post.shareBluesky === true;
    }
    el.btnSavePost.textContent = "Update Post";
    updateBlueskyCounter();
    showBlogSection();
  }

  async function deletePost(postId) {
    if (state.isDeletingPost) return;
    state.isDeletingPost = true;

    const post = state.posts.find((p) => p.id === postId);
    if (!post) {
      state.isDeletingPost = false;
      return;
    }

    const confirmed = window.confirm(
      `Delete the post "${post.title}"? This cannot be undone.`,
    );
    if (!confirmed) {
      state.isDeletingPost = false;
      return;
    }

    // Prevent double clicks while saving
    el.postList.querySelectorAll(".btn-delete").forEach((btn) => {
      if (btn instanceof HTMLButtonElement) {
        btn.disabled = true;
      }
    });

    try {
      const response = await fetch(
        `${POSTS_API}/${encodeURIComponent(postId)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Failed to delete post");
      }
      state.posts = state.posts.filter((p) => p.id !== postId);
      renderPosts();
      setPostStatus("Post deleted.");
    } catch (error) {
      console.error("Failed to delete post:", error);
      setPostStatus(error.message || "Failed to delete post.", true);
    } finally {
      state.isDeletingPost = false;
      el.postList.querySelectorAll(".btn-delete").forEach((btn) => {
        if (btn instanceof HTMLButtonElement) {
          btn.disabled = false;
        }
      });
    }
  }

  async function savePost(options = {}) {
    // Validate form, optionally upload image, then upsert via /api/admin/posts.
    const requestedStatus = options.status || "published";
    const title = el.postTitle.value.trim();
    const imageTags = parseTags(el.postImageTags?.value || "");
    const imageFocus = el.postImageFocus?.value || "center";
    const rawContent = (el.postContent?.innerHTML || "").trim();
    const content = sanitizeHtml(rawContent);
    const share = el.postShare.checked;
    const shareBluesky = el.postShareBluesky?.checked === true;
    const blueskyText = buildBlueskyText(title, content);
    let image = el.postImage.value.trim();
    const uploadFile = el.postImageFile?.files?.[0];
    const publishAtIso = dateTimeLocalToIso(el.postPublishAt?.value || "");

    if (!content) {
      setPostStatus("Post content is required.", true);
      return;
    }

    if (uploadFile) {
      try {
        setPostStatus("Uploading image...");
        const payload = {
          name: uploadFile.name,
          data: await readFileAsBase64(uploadFile),
        };
        const response = await fetch("/api/upload-media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: payload }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Upload failed");
        image = result.path || image;
        el.postImage.value = image;
        if (el.postImageFile) el.postImageFile.value = "";
        await upsertMedia(image, imageTags);
        updateBlueskyCounter();
        setPostStatus("Image uploaded and added to media library.");
      } catch (error) {
        console.error("Post image upload failed:", error);
        setPostStatus(`Image upload failed: ${error.message}`, true);
        return;
      }
    } else if (image) {
      await upsertMedia(image, imageTags);
    }

    const publishAtDate = publishAtIso ? new Date(publishAtIso) : null;
    let status = requestedStatus;
    if (
      status === "published" &&
      publishAtDate &&
      !Number.isNaN(publishAtDate.getTime()) &&
      publishAtDate.getTime() > Date.now()
    ) {
      status = "scheduled";
    }
    const safeShare = status === "draft" ? false : share;
    const safeShareBluesky = status === "draft" ? false : shareBluesky;
    const allowEmptyBluesky = hasBlueskyImage();

    if (safeShareBluesky) {
      if (!blueskyText && !allowEmptyBluesky) {
        setPostStatus(
          "Bluesky text is required when no image is set.",
          true,
        );
        return;
      }
      if (blueskyText.length > BLUESKY_CHAR_LIMIT) {
        setPostStatus(
          `Bluesky text exceeds ${BLUESKY_CHAR_LIMIT} characters.`,
          true,
        );
        return;
      }
    }

    const payload = {
      title,
      image,
      imageTags,
      imageFocus,
      content,
      date: publishAtIso || null,
      share: safeShare,
      shareBluesky: safeShareBluesky,
      status,
    };

    try {
      localStorage.setItem(
        POST_DRAFT_KEY,
        JSON.stringify({
          title,
          image,
          imageTags,
          content,
          share: safeShare,
          shareBluesky: safeShareBluesky,
          status,
          imageFocus,
          publishAt: el.postPublishAt?.value || "",
        }),
      );
    } catch (e) {
      console.warn("Could not persist draft locally", e);
    }

    try {
      const url = state.editingPostId
        ? `${POSTS_API}/${encodeURIComponent(state.editingPostId)}`
        : POSTS_API;
      const method = state.editingPostId ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Failed to save post");
      const saved = result.post;
      if (!saved) throw new Error("Server did not return post");

      const normalized = {
        ...saved,
        status: saved.status || "published",
        imageFocus: saved.imageFocus || "center",
        share: saved.share !== false,
        shareBluesky: saved.shareBluesky === true,
        imageTags: Array.isArray(saved.imageTags)
          ? saved.imageTags
          : parseTags(saved.imageTags || ""),
      };

      const idx = state.posts.findIndex((p) => p.id === normalized.id);
      if (idx !== -1) state.posts[idx] = normalized;
      else state.posts.unshift(normalized);

      renderPosts();
      resetPostForm();

      if (normalized.status === "draft") {
        setPostStatus("Draft saved.");
      } else if (normalized.status === "scheduled") {
        setPostStatus("Post scheduled.");
        localStorage.removeItem(POST_DRAFT_KEY);
      } else {
        if (normalized.blueskyError) {
          setPostStatus(
            `Post published, Bluesky failed: ${normalized.blueskyError}`,
            true,
          );
        } else {
          setPostStatus("Post published.");
        }
        localStorage.removeItem(POST_DRAFT_KEY);
      }
    } catch (error) {
      console.error("Failed to save post:", error);
      setPostStatus(error.message || "Failed to save post.", true);
    }
  }

  function bindRichTextToolbar() {
    const toolbar = document.getElementById("postToolbar");
    if (!toolbar || !el.postContent) return;
    toolbar.querySelectorAll(".rich-btn").forEach((btn) => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const cmd = btn.dataset.cmd;
        if (!cmd) return;
        el.postContent.focus();
        if (cmd === "createLink") {
          const url = prompt("Enter URL");
          if (url) document.execCommand("createLink", false, url);
          return;
        }
        if (cmd === "insertImage") {
          const url = prompt("Enter image URL");
          if (url) document.execCommand("insertImage", false, url);
          return;
        }
        if (cmd === "formatBlock") {
          const block = btn.dataset.value || "p";
          document.execCommand("formatBlock", false, block);
          return;
        }
        document.execCommand(cmd, false, null);
      });
    });
  }

  function applyMediaToPost(item) {
    if (el.postImage) el.postImage.value = item.path || "";
    if (el.postImageTags) {
      el.postImageTags.value = (item.tags || []).join(", ");
    }
    updateBlueskyCounter();
    state.pendingMediaSelection = null;
    showBlogSection();
    setPostStatus("Image selected from media.");
  }

  return {
    applyMediaToPost,
    bindBlueskyCounter,
    bindRichTextToolbar,
    deletePost,
    loadLocalDraft,
    loadPosts,
    renderPosts,
    resetPostForm,
    savePost,
    setPostStatus,
    showBlogSection,
  };
}

export { createPostsManager };

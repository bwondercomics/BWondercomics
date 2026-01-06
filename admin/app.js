import {
  STORAGE_KEY,
  API_ENDPOINT,
  MEDIA_FILE,
  MEDIA_URL,
} from "./config.js";
import { el } from "./dom.js";
import { checkSession, login, logout } from "./auth.js";
import { createChaptersApi } from "./chapters.js";
import {
  escapeHtml,
  parseTags,
  sortPagesByFilename,
  generateMediaId,
  inferFolderFromPages,
  ensureChapterFolder,
  getChapterFolder,
} from "./utils.js";

const POST_DRAFT_KEY = "battlebros_post_draft";

const state = {
  seriesIndex: { version: 1, defaultSeriesId: "battle-bros", series: [] },
  activeSeriesId: "battle-bros",
  chapters: {},
  chapterFolders: {},
  chapterMeta: {},
  statusMessage: "",
  premiumOnly: false,
  currentEditingChapter: null,
  posts: [],
  mediaItems: [],
  editingPostId: null,
  previewState: { chapter: "", pages: [], index: 0 },
  pendingMediaSelection: null,
  selectedFiles: [],
  uploadQueue: [],
  currentPages: [],
  hasUnsavedChanges: false,
  draggingIndex: null,
  isUploading: false,
  isDeletingPost: false,
};

function sanitizeHtml(input = "") {
  const parser = new DOMParser();
  const doc = parser.parseFromString(input, "text/html");
  const allowedTags = new Set([
    "b",
    "strong",
    "i",
    "em",
    "u",
    "a",
    "p",
    "br",
    "ul",
    "ol",
    "li",
    "span",
    "img",
    "h1",
    "h2",
    "h3",
    "h4",
    "blockquote",
  ]);

  const cleanUrl = (url = "") => {
    const trimmed = url.trim();
    if (!trimmed) return "";
    const lowered = trimmed.toLowerCase();
    if (lowered.startsWith("javascript:")) return "";
    return trimmed;
  };

  const sanitizeNode = (node) => {
    [...node.children].forEach((child) => {
      if (!allowedTags.has(child.tagName.toLowerCase())) {
        child.replaceWith(...child.childNodes);
      } else {
        // strip unwanted attributes
        [...child.attributes].forEach((attr) => {
          const name = attr.name.toLowerCase();
          const val = attr.value;
          const tag = child.tagName.toLowerCase();
          const allowedAttrs =
            tag === "a"
              ? ["href", "title", "target", "rel"]
              : tag === "img"
                ? ["src", "alt", "title"]
                : [];
          if (!allowedAttrs.includes(name)) {
            child.removeAttribute(attr.name);
          }
        });

        if (child.tagName.toLowerCase() === "a") {
          const href = cleanUrl(child.getAttribute("href") || "");
          if (!href) {
            child.removeAttribute("href");
          } else {
            child.setAttribute("href", href);
            child.setAttribute("target", "_blank");
            child.setAttribute("rel", "noopener noreferrer");
          }
        }
        if (child.tagName.toLowerCase() === "img") {
          const src = cleanUrl(child.getAttribute("src") || "");
          if (!src) {
            child.remove();
            return;
          }
          child.setAttribute("src", src);
          const alt = child.getAttribute("alt") || "";
          child.setAttribute("alt", alt);
        }
        sanitizeNode(child);
      }
    });
  };

  sanitizeNode(doc.body);
  return doc.body.innerHTML.trim();
}

function showError(message) {
  // Fallback to alert to keep UX functional even if a banner is missing
  alert(`ERROR: ${message}`);
}

function showSuccess(message) {
  alert(`SUCCESS: ${message}`);
}

async function saveToServer(filename, content) {
  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, content }),
  });

  if (!response.ok) {
    let message = `Failed to save ${filename}`;
    try {
      const data = await response.json().catch(() => null);
      const errorText = data && typeof data === "object" ? data.error : null;
      if (errorText) {
        message += `: ${errorText}`;
        if (response.status === 403 && /admin/i.test(String(errorText))) {
          message +=
            " (Sign in to comments as an admin, then retry.)";
        }
      }
    } catch (err) {
      console.error("Error reading save response", err);
    }
    throw new Error(message);
  }

  return true;
}

const DEFAULT_SERIES_ID = "battle-bros";
const ACTIVE_SERIES_KEY = "battlebros_admin_active_series";
const ANALYTICS_ENDPOINT = "/api/admin/analytics/summary";

function defaultUnitLabelsForSeries(seriesId) {
  const id = sanitizeSeriesId(seriesId) || DEFAULT_SERIES_ID;
  if (id === DEFAULT_SERIES_ID) return { singular: "Issue", plural: "Issues" };
  return { singular: "Chapter", plural: "Chapters" };
}

function getActiveSeriesMeta() {
  const id = getActiveSeriesId();
  const list = state.seriesIndex?.series || [];
  return list.find((s) => s && s.id === id) || null;
}

function getUnitLabels() {
  const current = getActiveSeriesMeta();
  const defaults = defaultUnitLabelsForSeries(getActiveSeriesId());
  const singular = String(current?.unitLabelSingular || "").trim() || defaults.singular;
  const plural = String(current?.unitLabelPlural || "").trim() || defaults.plural;
  return { singular: singular.slice(0, 30), plural: plural.slice(0, 30) };
}

function applyUnitLabels() {
  const { singular, plural } = getUnitLabels();

  if (el.btnChapters) el.btnChapters.textContent = plural;
  const title = document.getElementById("chaptersSectionTitle");
  if (title) title.textContent = `${plural} Management`;
  if (el.btnAddChapter) el.btnAddChapter.textContent = `+ Add New ${singular}`;

  const previewLabel = document.getElementById("previewEntryLabel");
  if (previewLabel) previewLabel.textContent = singular;

  const nameLabel = document.getElementById("entryNameLabel");
  if (nameLabel) nameLabel.textContent = `${singular} Name`;
  if (el.chapterName) el.chapterName.placeholder = `e.g., ${singular} 1`;

  const accessLabel = document.getElementById("entryAccessLabel");
  if (accessLabel) accessLabel.textContent = `${singular} Access`;
}

function sanitizeSeriesId(raw = "") {
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function getActiveSeriesId() {
  return sanitizeSeriesId(state.activeSeriesId) || DEFAULT_SERIES_ID;
}

function getChaptersRoot() {
  const id = getActiveSeriesId();
  return id === DEFAULT_SERIES_ID ? "chapters" : `comics/${id}/chapters`;
}

function getChaptersDataFileUrl() {
  const id = getActiveSeriesId();
  return id === DEFAULT_SERIES_ID ? "/admin/data.json" : `/admin/series/${id}/data.json`;
}

function getChaptersSaveFilename() {
  const id = getActiveSeriesId();
  return id === DEFAULT_SERIES_ID ? "admin/data.json" : `admin/series/${id}/data.json`;
}

function getChaptersStorageKey() {
  return `${STORAGE_KEY}:${getActiveSeriesId()}`;
}

const chaptersApi = createChaptersApi({
  state,
  el,
  saveToServer,
  showSuccess,
  showError,
  getUnitLabels,
  getDataFileUrl: getChaptersDataFileUrl,
  getSaveFilename: getChaptersSaveFilename,
  getChaptersRoot: getChaptersRoot,
  getStorageKey: getChaptersStorageKey,
  STORAGE_KEY,
});

function setActiveNav(active) {
  const navButtons = [
    el.btnChapters,
    el.btnBlog,
    el.btnMedia,
    el.btnUsers,
    el.btnAnalytics,
    el.btnPreview,
  ];
  navButtons.forEach((btn) => {
    if (!btn) return;
    btn.classList.toggle("nav-btn--active", btn === active);
  });
}

function hideAllSections() {
  if (el.chaptersSection) el.chaptersSection.style.display = "none";
  if (el.blogSection) el.blogSection.style.display = "none";
  if (el.previewSection) el.previewSection.style.display = "none";
  if (el.analyticsSection) el.analyticsSection.style.display = "none";
  if (el.mediaSection) el.mediaSection.style.display = "none";
  if (el.usersSection) el.usersSection.style.display = "none";
}

function showChaptersSection() {
  hideAllSections();
  if (el.chaptersSection) {
    el.chaptersSection.style.display = "block";
    el.chaptersSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  setActiveNav(el.btnChapters);
}

function showBlogSection() {
  hideAllSections();
  if (el.blogSection) {
    el.blogSection.style.display = "block";
    el.blogSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  renderPosts();
  setActiveNav(el.btnBlog);
}

function showPreviewSection() {
  hideAllSections();
  if (el.previewSection) {
    el.previewSection.style.display = "block";
    el.previewSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  setActiveNav(el.btnPreview);
}

function formatStat(value) {
  if (value === null || value === undefined) return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString("en-US");
}

function setAnalyticsValue(target, value) {
  if (!target) return;
  target.textContent = formatStat(value);
}

function setAnalyticsStatus(message, isError = false) {
  if (!el.analyticsStatus) return;
  el.analyticsStatus.textContent = message || "";
  el.analyticsStatus.style.display = message ? "block" : "none";
  el.analyticsStatus.className = isError ? "error-message" : "success-message";
}

function renderAnalyticsSummary(summary) {
  const ranges = summary?.ranges || {};
  const last24h = ranges.last24h || {};
  const last7d = ranges.last7d || {};

  setAnalyticsValue(el.statViews24h, last24h.pageviews);
  setAnalyticsValue(el.statVisitors24h, last24h.visitors);
  setAnalyticsValue(el.statViews7d, last7d.pageviews);
  setAnalyticsValue(el.statVisitors7d, last7d.visitors);

  const ts = summary?.generatedAt ? new Date(summary.generatedAt) : null;
  const tsText = ts ? ts.toLocaleString() : "just now";
  const siteNote = summary?.websiteId ? ` for site ${summary.websiteId}` : "";
  setAnalyticsStatus(`Updated ${tsText}${siteNote}.`);
}

function clearAnalyticsSummary() {
  setAnalyticsValue(el.statViews24h, null);
  setAnalyticsValue(el.statVisitors24h, null);
  setAnalyticsValue(el.statViews7d, null);
  setAnalyticsValue(el.statVisitors7d, null);
}

async function loadAnalyticsSummary({ showLoading = true } = {}) {
  if (showLoading) setAnalyticsStatus("Loading analytics…");
  try {
    const res = await fetch(ANALYTICS_ENDPOINT, { cache: "no-store" });
    let payload = null;
    try {
      payload = await res.json();
    } catch (err) {
      payload = null;
    }

    if (!res.ok) {
      const errorText =
        (payload && typeof payload === "object" && payload.error) ||
        `HTTP ${res.status}`;
      throw new Error(errorText);
    }

    renderAnalyticsSummary(payload || {});
  } catch (err) {
    clearAnalyticsSummary();
    setAnalyticsStatus(
      `Analytics error: ${err?.message || "Unable to load Umami stats."}`,
      true,
    );
  }
}

function showAnalyticsSection() {
  hideAllSections();
  if (el.analyticsSection) {
    el.analyticsSection.style.display = "block";
    el.analyticsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  setActiveNav(el.btnAnalytics);
  loadAnalyticsSummary({ showLoading: true });
}

async function loadSeriesIndex() {
  try {
    const res = await fetch("/admin/series.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load series.json");
    const data = await res.json();
    const series = Array.isArray(data.series) ? data.series : [];
    const defaultSeriesId =
      sanitizeSeriesId(data.defaultSeriesId) || DEFAULT_SERIES_ID;
    state.seriesIndex = {
      version: data.version || 1,
      defaultSeriesId,
      series,
    };
  } catch (err) {
    state.seriesIndex = {
      version: 1,
      defaultSeriesId: DEFAULT_SERIES_ID,
      series: [],
    };
  }

  if (!Array.isArray(state.seriesIndex.series)) state.seriesIndex.series = [];
  if (!state.seriesIndex.series.some((s) => s && s.id === DEFAULT_SERIES_ID)) {
    state.seriesIndex.series.unshift({
      id: DEFAULT_SERIES_ID,
      title: "Battle Bros",
      description: "Battle Bros comic reader",
      premiumOnly: false,
    });
  }

  const storedActive = sanitizeSeriesId(localStorage.getItem(ACTIVE_SERIES_KEY));
  const canUseStored = storedActive && state.seriesIndex.series.some((s) => s.id === storedActive);
  state.activeSeriesId = canUseStored ? storedActive : state.seriesIndex.defaultSeriesId;
}

function renderSeriesSelect() {
  if (!el.seriesSelect) return;
  const current = getActiveSeriesId();
  el.seriesSelect.innerHTML = "";

  const sorted = [...(state.seriesIndex.series || [])].sort((a, b) =>
    (a.title || a.id || "").localeCompare(b.title || b.id || ""),
  );

  sorted.forEach((s) => {
    if (!s || !s.id) return;
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.title ? `${s.title} (${s.id})` : s.id;
    el.seriesSelect.appendChild(opt);
  });

  el.seriesSelect.value = current;
  updateSeriesLinks();
}

function updateSeriesLinks() {
  const id = getActiveSeriesId();
  if (el.btnOpenSeries) {
    el.btnOpenSeries.href = `../index.html?series=${encodeURIComponent(id)}`;
  }
}

async function switchSeries(nextIdRaw) {
  const nextId = sanitizeSeriesId(nextIdRaw) || DEFAULT_SERIES_ID;
  if (nextId === getActiveSeriesId()) return;

  if (state.hasUnsavedChanges) {
    const { plural } = getUnitLabels();
    const proceed = window.confirm(
      `You have unsaved changes in ${plural}. Switch series anyway?`,
    );
    if (!proceed) {
      renderSeriesSelect();
      return;
    }
  }

  state.activeSeriesId = nextId;
  localStorage.setItem(ACTIVE_SERIES_KEY, nextId);

  await chaptersApi.loadChapters();
  chaptersApi.renderStatusMessageInput();
  chaptersApi.renderChapterList();
  applyUnitLabels();
  updateSeriesLinks();
  showChaptersSection();
}

async function createNewSeries() {
  const rawId = prompt("New series ID (letters/numbers/-/_):");
  const id = sanitizeSeriesId(rawId);
  if (!id) return;
  if (state.seriesIndex.series.some((s) => s.id === id)) {
    alert(`Series "${id}" already exists.`);
    return;
  }

  const title = (prompt("Series title:", id) || id).trim();
  const premiumOnly = window.confirm("Should this series be premium-only?");
  const defaults = defaultUnitLabelsForSeries(id);
  const unitLabelSingular =
    (prompt("Entry label (singular):", defaults.singular) || defaults.singular).trim();
  const unitLabelPlural =
    (prompt("Entry label (plural):", defaults.plural) || defaults.plural).trim();

  const nextIndex = {
    ...state.seriesIndex,
    series: [
      ...(state.seriesIndex.series || []),
      {
        id,
        title,
        description: "",
        premiumOnly,
        unitLabelSingular,
        unitLabelPlural,
      },
    ],
  };

  const now = new Date().toISOString();
  const dataFile = `admin/series/${id}/data.json`;
  const pageConfigFile = `admin/series/${id}/page-config.json`;

  const defaultPageConfig = await (async () => {
    try {
      const res = await fetch("/admin/page-config.json", { cache: "no-store" });
      if (!res.ok) throw new Error("missing");
      const cfg = await res.json();
      return cfg && typeof cfg === "object" ? cfg : {};
    } catch {
      return {};
    }
  })();

  const pageConfig = {
    ...defaultPageConfig,
    content: {
      ...(defaultPageConfig.content || {}),
      header: {
        ...((defaultPageConfig.content || {}).header || {}),
        title,
      },
    },
  };

  await saveToServer("admin/series.json", nextIndex);
  await saveToServer(dataFile, {
    chapters: {},
    chapterFolders: {},
    chapterMeta: {},
    statusMessage: "",
    premiumOnly,
    lastUpdated: now,
    publishedBy: "Admin Panel",
  });
  await saveToServer(pageConfigFile, pageConfig);

  // Create the series chapters root folder so uploads work immediately.
  await fetch("/api/create-chapter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapterFolder: `comics/${id}/chapters` }),
  }).catch(() => { });

  state.seriesIndex = nextIndex;
  await switchSeries(id);
  renderSeriesSelect();
  applyUnitLabels();
  alert(`Created series "${title}" (${id}).`);
}

async function editActiveSeries() {
  const id = getActiveSeriesId();
  const seriesList = state.seriesIndex.series || [];
  const current = seriesList.find((s) => s && s.id === id);
  if (!current) {
    alert("Series not found.");
    return;
  }

  const title = prompt("Series title:", current.title || id);
  if (title === null) return;
  const description = prompt("Series description:", current.description || "");
  if (description === null) return;

  const coverImage = prompt(
    "Series cover image path (optional).\n\nExamples:\n- assets/banner3.png\n- comics/02/cover.png\n\nLeave blank to auto-pick the first accessible page in the library.",
    current.coverImage || "",
  );
  if (coverImage === null) return;

  const premiumOnly = current.premiumOnly
    ? window.confirm(
      "Series is currently PREMIUM-ONLY.\n\nOK = keep premium-only\nCancel = make public",
    )
    : window.confirm(
      "Series is currently PUBLIC.\n\nOK = make premium-only\nCancel = keep public",
    );

  const defaults = defaultUnitLabelsForSeries(id);
  const unitLabelSingular = (
    prompt("Entry label (singular):", current.unitLabelSingular || defaults.singular) || defaults.singular
  ).trim();
  const unitLabelPlural = (
    prompt("Entry label (plural):", current.unitLabelPlural || defaults.plural) || defaults.plural
  ).trim();

  const nextIndex = {
    ...state.seriesIndex,
    series: seriesList.map((s) =>
      s && s.id === id
        ? (() => {
          const next = {
            ...s,
            title: title.trim() || id,
            description: description.trim(),
            premiumOnly,
            unitLabelSingular,
            unitLabelPlural,
          };
          const cover = String(coverImage || "").trim();
          if (cover) next.coverImage = cover;
          else delete next.coverImage;
          return next;
        })()
        : s,
    ),
  };

  state.seriesIndex = nextIndex;
  await saveToServer("admin/series.json", nextIndex);

  // Keep the series' data.json flag in sync so the reader can enforce it.
  state.premiumOnly = premiumOnly;
  try {
    await chaptersApi.saveChapters(false);
  } catch (e) {
    console.warn("Failed to persist premiumOnly to data file:", e);
  }

  renderSeriesSelect();
  updateSeriesLinks();
  applyUnitLabels();
  alert("Series updated.");
}

// ---------------- BLOG / POSTS ----------------
const POSTS_API = "/api/admin/posts";

function isoToDateTimeLocal(iso = "") {
  const value = String(iso || "").trim();
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function dateTimeLocalToIso(raw = "") {
  const value = String(raw || "").trim();
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString();
}

function setPostStatus(message, isError = false) {
  if (!el.postStatus) return;
  el.postStatus.textContent = message;
  el.postStatus.style.display = "block";
  el.postStatus.style.background = isError ? "var(--danger)" : "var(--success)";
  el.postStatus.style.color = isError ? "var(--text)" : "var(--bg-dark)";
  setTimeout(() => {
    el.postStatus.style.display = "none";
  }, 3000);
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
  el.btnSavePost.textContent = "Publish Post";
  if (el.btnSaveDraft) el.btnSaveDraft.textContent = "Save Draft";
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
    (a, b) => new Date(b.date || 0) - new Date(a.date || 0),
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
    const tagText =
      post.imageTags && post.imageTags.length
        ? `Tags: ${post.imageTags.join(", ")}`
        : "";

    item.innerHTML = `
      <div class="chapter-info">
        <div class="chapter-name">${escapeHtml(post.title || "Untitled")}</div>
        <div class="chapter-meta">${dateLabel} - ${shareLabel} - ${statusLabel}</div>
        ${tagText ? `<div class="chapter-meta" style="opacity:0.8;">${escapeHtml(tagText)}</div>` : ""}
        <div class="chapter-meta" style="opacity:0.8;">${escapeHtml(preview)}</div>
      </div>
      <div class="chapter-actions">
        <button type="button" class="btn-small btn-edit" data-post="${post.id}">Edit</button>
        <button type="button" class="btn-small btn-delete" data-post="${post.id}">Delete</button>
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
      error.message || "Could not load existing posts. Create a new one to get started.",
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
  if (el.postImageTags)
    el.postImageTags.value = (post.imageTags || []).join(", ");
  if (el.postImageFocus) el.postImageFocus.value = post.imageFocus || "center";
  if (el.postPublishAt) el.postPublishAt.value = isoToDateTimeLocal(post.date || "");
  if (el.postContent) el.postContent.innerHTML = post.content || "";
  el.postShare.checked = post.share !== false;
  el.btnSavePost.textContent = "Update Post";
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
    btn.disabled = true;
  });

  try {
    const response = await fetch(`${POSTS_API}/${encodeURIComponent(postId)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
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
      btn.disabled = false;
    });
  }
}

async function savePost(options = {}) {
  const requestedStatus = options.status || "published";
  const title = el.postTitle.value.trim();
  const imageTags = parseTags(el.postImageTags?.value || "");
  const imageFocus = el.postImageFocus?.value || "center";
  const rawContent = (el.postContent?.innerHTML || el.postContent?.value || "").trim();
  const content = sanitizeHtml(rawContent);
  const share = el.postShare.checked;
  let image = el.postImage.value.trim();
  const uploadFile = el.postImageFile?.files?.[0];
  const publishAtIso = dateTimeLocalToIso(el.postPublishAt?.value || "");

  if (!title || !content) {
    setPostStatus("Title and content are required.", true);
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
      await upsertMediaEntry(image, imageTags);
      setPostStatus("Image uploaded and added to media library.");
    } catch (error) {
      console.error("Post image upload failed:", error);
      setPostStatus(`Image upload failed: ${error.message}`, true);
      return;
    }
  } else if (image) {
    await upsertMediaEntry(image, imageTags);
  }

  const now = new Date().toISOString();
  let status = requestedStatus;
  if (status === "published" && publishAtIso) {
    const dt = new Date(publishAtIso);
    if (!Number.isNaN(dt.getTime()) && dt.getTime() > Date.now()) {
      status = "scheduled";
    }
  }
  const safeShare = status === "draft" ? false : share;

  const payload = {
    title,
    image,
    imageTags,
    imageFocus,
    content,
    date: publishAtIso || null,
    share: safeShare,
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
      setPostStatus("Post published.");
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

// ---------------- MEDIA ----------------
async function loadMedia() {
  try {
    const response = await fetch(MEDIA_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error("Failed to load media.json");
    const data = await response.json();
    state.mediaItems = Array.isArray(data)
      ? data.map((m) => ({
        id: m.id || generateMediaId(m.path),
        path: m.path || "",
        tags: Array.isArray(m.tags) ? m.tags : parseTags(m.tags || ""),
      }))
      : [];
  } catch (error) {
    console.warn("Error loading media.json, starting empty:", error);
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
    setMediaStatus("Failed to save media.json", true);
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
  hideAllSections();
  if (el.mediaSection) {
    el.mediaSection.style.display = "block";
    el.mediaSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  renderMedia();
  setActiveNav(el.btnMedia);
}

function setUsersStatus(message, isError = false) {
  if (!el.usersStatus) return;
  el.usersStatus.textContent = message;
  el.usersStatus.style.display = "block";
  el.usersStatus.style.background = isError ? "var(--danger)" : "var(--success)";
  el.usersStatus.style.color = isError ? "var(--text)" : "var(--bg-dark)";
  setTimeout(() => {
    el.usersStatus.style.display = "none";
  }, 3000);
}

function showUsersSection() {
  hideAllSections();
  if (el.usersSection) {
    el.usersSection.style.display = "block";
    el.usersSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  setActiveNav(el.btnUsers);
}

function renderUsers(users = []) {
  if (!el.usersList) return;
  el.usersList.innerHTML = "";

  if (!users.length) {
    const empty = document.createElement("div");
    empty.className = "chapter-item";
    empty.textContent = "No users found yet.";
    el.usersList.appendChild(empty);
    return;
  }

  users.forEach((u) => {
    const item = document.createElement("div");
    item.className = "chapter-item";
    item.innerHTML = `
      <div class="chapter-info">
        <div class="chapter-name">${escapeHtml(u.displayName || u.email || "User")}</div>
        <div class="chapter-meta" style="opacity:0.9;">${escapeHtml(u.email || "")}</div>
        <div class="chapter-meta" style="opacity:0.8;">Role: ${escapeHtml(u.role || "user")}</div>
      </div>
      <div class="chapter-actions" style="gap: 8px; flex-wrap: wrap;">
        <select class="form-input" style="max-width: 150px; padding: 8px 10px;" data-role="${escapeHtml(u.id)}">
          <option value="user">user</option>
          <option value="premium">premium</option>
          <option value="admin">admin</option>
        </select>
        <button class="btn-small btn-edit" type="button" data-save-role="${escapeHtml(u.id)}">Save</button>
      </div>
    `;
    el.usersList.appendChild(item);
    const select = item.querySelector(`[data-role="${CSS.escape(u.id)}"]`);
    if (select) select.value = (u.role || "user").toLowerCase();
  });

  el.usersList.querySelectorAll("[data-save-role]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-save-role");
      const select = el.usersList.querySelector(`[data-role="${CSS.escape(userId)}"]`);
      const role = select ? select.value : "user";
      try {
        const res = await fetch("/api/admin/users/role", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, role }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to update role");
        setUsersStatus("Role updated.");
      } catch (err) {
        setUsersStatus(err.message || "Failed to update role.", true);
      }
    });
  });
}

async function loadUsers() {
  if (!el.usersList) return;
  el.usersList.innerHTML = "";
  const loading = document.createElement("div");
  loading.className = "chapter-item";
  loading.textContent = "Loading users...";
  el.usersList.appendChild(loading);

  try {
    const res = await fetch("/api/admin/users", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        data.error ||
        "Unable to load users. Make sure you are signed in as an admin (via comments login).",
      );
    }
    const users = Array.isArray(data.users) ? data.users : [];
    renderUsers(users);
  } catch (err) {
    el.usersList.innerHTML = "";
    const error = document.createElement("div");
    error.className = "chapter-item";
    error.textContent = err.message || "Failed to load users.";
    el.usersList.appendChild(error);
  }
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
        <div class="chapter-meta" style="opacity:0.8;">${escapeHtml(tagsText || "No tags")}</div>
      </div>
      <div class="chapter-actions">
        <button class="btn-small btn-edit" data-use="${escapeHtml(item.id)}">Use</button>
        <button class="btn-small btn-delete" data-remove="${escapeHtml(item.id)}">Delete</button>
      </div>
    `;
    el.mediaList.appendChild(div);
  });

  el.mediaList.querySelectorAll("[data-use]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-use");
      const item = state.mediaItems.find((m) => m.id === id);
      if (item) applyMediaToPost(item);
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
          Array.isArray(p.imageTags) ? p.imageTags : parseTags(p.imageTags || ""),
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
          ? `Synced ${added} new item(s)${updated ? `, updated ${updated} tag set(s)` : ""}.`
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

function applyMediaToPost(item) {
  if (el.postImage) el.postImage.value = item.path || "";
  if (el.postImageTags) el.postImageTags.value = (item.tags || []).join(", ");
  state.pendingMediaSelection = null;
  showBlogSection();
  setPostStatus("Image selected from media.");
}

// ---------------- PREVIEW ----------------
function updatePreviewChapters(selectedName = "") {
  if (!el.previewChapterSelect) return;
  const names = Object.keys(state.chapters).filter(
    (name) => name && name !== "undefined",
  );
  if (
    state.currentEditingChapter &&
    state.currentEditingChapter !== "undefined" &&
    !names.includes(state.currentEditingChapter)
  ) {
    names.push(state.currentEditingChapter);
  }
  el.previewChapterSelect.innerHTML = "";
  names.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    el.previewChapterSelect.appendChild(opt);
  });
  const target = names.includes(selectedName) ? selectedName : names[0] || "";
  if (target) {
    el.previewChapterSelect.value = target;
    setPreviewChapter(target);
  } else {
    state.previewState = { chapter: "", pages: [], index: 0 };
    renderPreviewImage();
  }
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

function setPreviewChapter(name) {
  state.previewState.chapter = name;
  state.previewState.pages = sortPagesByFilename(getPreviewPages(name));
  state.previewState.index = 0;
  renderPreviewImage();
}

function getPreviewPages(name) {
  return sortPagesByFilename(state.chapters[name] || state.currentPages || []);
}

function renderPreviewImage() {
  if (!el.previewFrame || !el.previewEmpty) return;
  const { pages } = state.previewState;
  if (!pages.length) {
    el.previewFrame.style.display = "none";
    el.previewEmpty.style.display = "block";
    if (el.previewPageLabel) el.previewPageLabel.textContent = "";
    return;
  }

  if (state.previewState.index >= pages.length) {
    state.previewState.index = pages.length - 1;
  }

  const src = pages[state.previewState.index];
  const resolvedSrc = src.startsWith("http")
    ? src
    : src.startsWith("/")
      ? src
      : `../${src}`;
  if (el.previewImg) el.previewImg.src = resolvedSrc;
  if (el.previewPageLabel) {
    el.previewPageLabel.textContent = `Page ${state.previewState.index + 1} / ${pages.length}`;
  }

  el.previewFrame.style.display = "block";
  el.previewEmpty.style.display = "none";
  if (el.previewPrev) el.previewPrev.disabled = state.previewState.index <= 0;
  if (el.previewNext)
    el.previewNext.disabled = state.previewState.index >= pages.length - 1;
}

function copyToClipboard() {
  const jsonData = JSON.stringify(state.chapters, null, 2);
  navigator.clipboard
    .writeText(jsonData)
    .then(() => {
      el.copySuccess.textContent = "Copied to clipboard!";
      el.copySuccess.className = "success-message";
      el.copySuccess.style.display = "block";
      setTimeout(() => {
        el.copySuccess.style.display = "none";
      }, 3000);
    })
    .catch((err) => {
      alert("Failed to copy: " + err);
    });
}

function downloadJSON() {
  const jsonData = JSON.stringify(state.chapters, null, 2);
  const blob = new Blob([jsonData], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "battle-bros-chapters.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------- UPLOAD ----------------
function initUploadHandlers() {
  const uploadArea = document.getElementById("uploadArea");
  const fileInput = document.getElementById("imageUpload");
  const uploadPrompt = document.getElementById("uploadPrompt");
  const uploadPreview = document.getElementById("uploadPreview");
  const btnUploadImages = document.getElementById("btnUploadImages");
  const uploadProgress = document.getElementById("uploadProgress");

  if (!uploadArea || !fileInput || !uploadPrompt || !uploadPreview || !btnUploadImages || !uploadProgress) {
    return;
  }

  const clearDragState = () => uploadArea.classList.remove("drag-over");

  uploadArea.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => handleFileSelect(e.target.files));

  uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.add("drag-over");
  });

  uploadArea.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearDragState();
  });

  uploadArea.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearDragState();
    handleFileSelect(e.dataTransfer?.files || []);
  });

  btnUploadImages.addEventListener("click", uploadImagesToServer);
}

function handleFileSelect(fileList) {
  const uploadPrompt = document.getElementById("uploadPrompt");
  const btnUploadImages = document.getElementById("btnUploadImages");
  const uploadPreview = document.getElementById("uploadPreview");
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const incoming = Array.from(fileList || []);
  if (!incoming.length) return;

  const validFiles = incoming.filter((file) => {
    if (!file.type.startsWith("image/")) {
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      showError(`File ${file.name} is too large (max 10MB)`);
      return false;
    }
    return true;
  });

  if (!validFiles.length) {
    showError("Please select valid image files under 10MB.");
    return;
  }

  validFiles.forEach((file) => {
    const exists = state.selectedFiles.find(
      (f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified,
    );
    if (!exists) state.selectedFiles.push(file);
  });

  uploadPrompt.style.display = state.selectedFiles.length ? "none" : "block";
  btnUploadImages.style.display = state.selectedFiles.length ? "block" : "none";
  renderFilePreview(uploadPreview);
  maybeAutoUpload();
}

function renderFilePreview(uploadPreview) {
  uploadPreview.innerHTML = "";

  state.selectedFiles.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const previewItem = document.createElement("div");
      previewItem.className = "preview-item";
      previewItem.innerHTML = `
        <img src="${e.target.result}" alt="${file.name}">
        <div class="preview-name" title="${file.name}">${file.name}</div>
        <button class="preview-remove" data-index="${index}" title="Remove">Remove</button>
      `;

      previewItem.querySelector(".preview-remove")?.addEventListener("click", (evt) => {
        evt.stopPropagation();
        removeSelectedFile(index);
      });

      uploadPreview.appendChild(previewItem);
    };
    reader.readAsDataURL(file);
  });
}

function removeSelectedFile(index) {
  const uploadPrompt = document.getElementById("uploadPrompt");
  const btnUploadImages = document.getElementById("btnUploadImages");
  const uploadPreview = document.getElementById("uploadPreview");

  state.selectedFiles.splice(index, 1);
  uploadPrompt.style.display = state.selectedFiles.length ? "none" : "block";
  btnUploadImages.style.display = state.selectedFiles.length ? "block" : "none";
  renderFilePreview(uploadPreview);
}

function clearSelectedFiles() {
  const uploadPrompt = document.getElementById("uploadPrompt");
  const uploadPreview = document.getElementById("uploadPreview");
  const btnUploadImages = document.getElementById("btnUploadImages");
  const fileInput = document.getElementById("imageUpload");

  state.selectedFiles = [];
  state.isUploading = false;
  if (uploadPrompt) uploadPrompt.style.display = "block";
  if (uploadPreview) uploadPreview.innerHTML = "";
  if (btnUploadImages) {
    btnUploadImages.style.display = "none";
    btnUploadImages.disabled = false;
    btnUploadImages.textContent = "Upload Selected Images";
  }
  if (fileInput) fileInput.value = "";
}

function maybeAutoUpload() {
  if (!state.selectedFiles.length || state.isUploading) return;
  const chapterName = chaptersApi.getActiveChapterName();
  const uploadProgress = document.getElementById("uploadProgress");
  if (!chapterName) {
    if (uploadProgress) uploadProgress.style.display = "none";
    return; // wait until user sets a chapter name
  }
  uploadImagesToServer();
}

async function uploadImagesToServer() {
  const btnUploadImages = document.getElementById("btnUploadImages");
  const uploadProgress = document.getElementById("uploadProgress");

  if (state.isUploading) return;
  const chapterName = chaptersApi.getActiveChapterName();
  if (!chapterName) {
    showError("Enter a chapter name first.");
    if (uploadProgress) {
      uploadProgress.style.display = "block";
      uploadProgress.textContent = "Enter a chapter name first.";
    }
    return;
  }

  if (!state.selectedFiles.length) {
    showError("No files selected for upload.");
    if (uploadProgress) {
      uploadProgress.style.display = "block";
      uploadProgress.textContent = "No files selected.";
    }
    return;
  }

  const chapterFolder = getChapterFolder(
    chapterName,
    state.chapterFolders,
    state.chapters,
    state.currentPages,
    getChaptersRoot(),
  );

  state.isUploading = true;
  if (uploadProgress) {
    uploadProgress.style.display = "block";
    uploadProgress.textContent = "Uploading...";
  }
  btnUploadImages.disabled = true;
  btnUploadImages.textContent = "Uploading...";

  try {
    await fetch("/api/create-chapter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterFolder }),
    });

    const filesPayload = await Promise.all(
      state.selectedFiles.map(async (file) => ({
        name: file.name,
        data: await readFileAsBase64(file),
      })),
    );

    const response = await fetch("/api/upload-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterFolder, files: filesPayload }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Upload failed");

    const newPaths = result.paths || [];
    state.currentPages = sortPagesByFilename([...state.currentPages, ...newPaths]);
    chaptersApi.renderPageList(state.currentPages);
    chaptersApi.markUnsaved();
    clearSelectedFiles();

    const errors = result.errors?.length || 0;
    if (errors > 0) {
      showError(`Uploaded ${newPaths.length} file(s), ${errors} failed.`);
    } else {
      showSuccess(`Successfully uploaded ${newPaths.length} image(s)!`);
    }
  } catch (error) {
    console.error("Upload error:", error);
    showError(`Upload failed: ${error.message}`);
    if (uploadProgress) uploadProgress.textContent = `Upload failed: ${error.message}`;
  } finally {
    state.isUploading = false;
    btnUploadImages.disabled = false;
    btnUploadImages.textContent = "Upload Selected Images";
    setTimeout(() => {
      if (uploadProgress) uploadProgress.style.display = "none";
    }, 1200);
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------- RENUMBER ----------------
async function renumberPages() {
  const chapterName = chaptersApi.getActiveChapterName();
  const chapterFolder = getChapterFolder(
    chapterName,
    state.chapterFolders,
    state.chapters,
    state.currentPages,
    getChaptersRoot(),
  );
  const btnRenumber = el.btnRenumberPages;
  const originalText = btnRenumber?.textContent || "Renumber Pages";

  try {
    if (btnRenumber) {
      btnRenumber.disabled = true;
      btnRenumber.textContent = "Renumbering...";
    }
    const response = await fetch("/api/renumber-chapter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterFolder, order: state.currentPages }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Renumber failed");
    state.currentPages = result.paths || [];
    chaptersApi.renderPageList(state.currentPages);
    chaptersApi.markUnsaved();
    showSuccess(`Renumbered ${state.currentPages.length} file(s).`);
  } catch (error) {
    console.error("Renumber error:", error);
    showError(`Renumber failed: ${error.message}`);
  } finally {
    if (btnRenumber) {
      btnRenumber.textContent = originalText;
      btnRenumber.disabled = false;
    }
  }
}

// ---------------- INIT ----------------
async function showDashboard() {
  el.loginScreen.style.display = "none";
  el.adminDashboard.style.display = "block";
  showChaptersSection();
  await loadSeriesIndex();
  renderSeriesSelect();
  try {
    await chaptersApi.loadChapters();
  } catch (e) {
    console.error("Chapters failed to load:", e);
  }
  try {
    await loadPosts();
  } catch (e) {
    console.error("Posts failed to load:", e);
  }
  loadLocalDraft();
  try {
    await loadMedia();
  } catch (e) {
    console.error("Media failed to load:", e);
  }
  chaptersApi.renderStatusMessageInput();
  chaptersApi.renderChapterList();
  updateSeriesLinks();
}

function attachEventHandlers() {
  // Login
  el.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (el.loginEmail?.value || "").trim();
    const password = el.loginPassword?.value || "";
    await login(email, password, showDashboard);
  });

  el.btnLogout.addEventListener("click", logout);
  if (el.btnLogoutFromLogin) {
    el.btnLogoutFromLogin.addEventListener("click", logout);
  }

  // Chapters
  if (el.seriesSelect) {
    el.seriesSelect.addEventListener("change", async (e) => {
      await switchSeries(e.target.value);
    });
  }
  if (el.btnAddSeries) {
    el.btnAddSeries.addEventListener("click", async () => {
      await createNewSeries();
    });
  }
  if (el.btnEditSeries) {
    el.btnEditSeries.addEventListener("click", async () => {
      await editActiveSeries();
    });
  }
  if (el.btnSeriesDesigner) {
    el.btnSeriesDesigner.addEventListener("click", () => {
      window.location.href = `designer.html?series=${encodeURIComponent(getActiveSeriesId())}`;
    });
  }
  if (el.btnDesigner) {
    el.btnDesigner.addEventListener("click", () => {
      window.location.href = `designer.html?series=${encodeURIComponent(getActiveSeriesId())}`;
    });
  }
  el.btnAddChapter.addEventListener("click", chaptersApi.addNewChapter);
  if (el.btnSaveStatus) {
    el.btnSaveStatus.addEventListener("click", chaptersApi.saveStatusMessage);
  }
  el.btnCloseModal.addEventListener("click", chaptersApi.hideModal);
  el.btnCancelEdit.addEventListener("click", chaptersApi.hideModal);
  el.editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await chaptersApi.saveChapterEdit();
  });
  el.btnAddPage.addEventListener("click", chaptersApi.addPage);

  // Preview & export
  el.btnPreview.addEventListener("click", () => {
    const jsonData = JSON.stringify(state.chapters, null, 2);
    if (el.previewData) el.previewData.textContent = jsonData;
    showPreviewSection();
    updatePreviewChapters(
      state.currentEditingChapter || Object.keys(state.chapters)[0] || "",
    );
  });
  el.btnCopy.addEventListener("click", copyToClipboard);
  el.btnDownload.addEventListener("click", downloadJSON);
  el.btnBlog.addEventListener("click", showBlogSection);
  if (el.btnChapters) {
    el.btnChapters.addEventListener("click", showChaptersSection);
  }
  el.btnSavePost.addEventListener("click", async (e) => {
    e.preventDefault();
    await savePost();
  });
  if (el.btnSaveDraft) {
    el.btnSaveDraft.addEventListener("click", async (e) => {
      e.preventDefault();
      await savePost({ status: "draft" });
    });
  }
  bindRichTextToolbar();

  if (el.btnMedia) {
    el.btnMedia.addEventListener("click", () => {
      state.pendingMediaSelection = null;
      showMediaSection();
    });
  }
  if (el.btnUsers) {
    el.btnUsers.addEventListener("click", async () => {
      showUsersSection();
      await loadUsers();
    });
  }
  if (el.btnAnalytics) {
    el.btnAnalytics.addEventListener("click", showAnalyticsSection);
  }
  if (el.btnAnalyticsRefresh) {
    el.btnAnalyticsRefresh.addEventListener("click", () => loadAnalyticsSummary({ showLoading: true }));
  }
  if (el.btnRefreshUsers) {
    el.btnRefreshUsers.addEventListener("click", async () => {
      await loadUsers();
    });
  }
  if (el.btnMediaPicker) {
    el.btnMediaPicker.addEventListener("click", () => {
      state.pendingMediaSelection = "post";
      showMediaSection();
    });
  }
  if (el.btnAddMedia) {
    el.btnAddMedia.addEventListener("click", addMediaItem);
  }
  if (el.btnSyncMedia) {
    el.btnSyncMedia.addEventListener("click", () => syncMediaFromDisk(true));
  }
  if (el.mediaSearch) {
    el.mediaSearch.addEventListener("input", renderMedia);
  }
  if (el.previewChapterSelect) {
    el.previewChapterSelect.addEventListener("change", (e) => {
      setPreviewChapter(e.target.value);
    });
  }
  if (el.previewPrev) {
    el.previewPrev.addEventListener("click", () => {
      state.previewState.index = Math.max(0, state.previewState.index - 1);
      renderPreviewImage();
    });
  }
  if (el.previewNext) {
    el.previewNext.addEventListener("click", () => {
      state.previewState.index = Math.min(
        (state.previewState.pages.length || 1) - 1,
        state.previewState.index + 1,
      );
      renderPreviewImage();
    });
  }

  // Renumber
  if (el.btnRenumberPages) {
    el.btnRenumberPages.addEventListener("click", renumberPages);
  }

  // Close modals on backdrop
  el.editModal.addEventListener("click", (e) => {
    if (e.target === el.editModal) chaptersApi.hideModal();
  });
}

async function init() {
  attachEventHandlers();
  initUploadHandlers();
  const isAuthenticated = await checkSession(showDashboard);
  if (!isAuthenticated) {
    el.loginScreen.style.display = "flex";
    el.adminDashboard.style.display = "none";
  }
  console.log("Battle Bros Admin initialized");
}

if (
  document.readyState === "complete" ||
  document.readyState === "interactive"
) {
  setTimeout(init, 0);
} else {
  document.addEventListener("DOMContentLoaded", init);
}

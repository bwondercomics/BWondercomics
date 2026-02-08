import { STORAGE_KEY } from "./config.js";
import { el } from "./dom.js";
import { checkSession, login, logout } from "./auth.js";
import { createEntriesApi } from "./entries.js";
import { getChapterFolder } from "./utils.js";
import { COUNT_VIEWS_KEY, HEADER_STICKY_KEY, NAV_LAYOUT_KEY, state } from "./state.js";
import { saveToServer, showError, showSuccess } from "./core.js";
import {
  applyNavLayout,
  initNavPreferences,
  readStorage,
  setScanlinesEnabled,
  toggleNavCollapsed,
  toggleSettingsPanel,
  writeStorage,
} from "./nav.js";
import { createAnalytics } from "./analytics.js";
import { createDashboard } from "./dashboard.js";
import { createDesigner } from "./designer.js";
import { createPageBuilder } from "./page-builder.js";
import {
  bindEvents as bindBlueskyEvents,
  loadStatus as loadBlueskyStatus,
} from "./bluesky.js";
import { createModerationManager } from "./moderation.js";
import { createSocialManager } from "./social.js";
import { createSeriesManager } from "./series.js";
import { createPostsManager } from "./posts.js";
import { createMediaManager } from "./media.js";
import { createPreviewManager } from "./preview.js";
import { createUploadManager } from "./uploads.js";
import { createUsersManager } from "./users.js";
import { initDiagnostics } from "./diagnostics.js";

const SAFE_MODE_URL = "https://safe.bwondercomics.com";
const SUPPORT_TEXT_HTML = `<span class="bubble-em">WANT TO SUPPORT THE COMIC?</span>
  <span class="bubble-bold">Buy the physical book</span> at the
  <a class="bubble-highlight" href="https://bwondercomics.bigcartel.com/product/battle-bros-volume-1" target="_blank" rel="noopener noreferrer" aria-label="bwondercomics store link">bwondercomics store!</a>`;
let headerStickyEnabled = false;

const DEFAULT_PAGE_CONFIG = {
  theme: {
    primary: "#00d9ff",
    secondary: "#ff00ea",
    accent: "#ffed00",
    bgDark: "#0a0a12",
    bgPanel: "#1a1a2e",
    text: "#ffffff",
    danger: "#ff3838",
  },
  layout: {
    leftPanel: { enabled: true, order: 1 },
    viewport: { enabled: true, order: 2 },
    rightPanel: { enabled: true, order: 3 },
  },
  content: {
    header: {
      title: "BATTLE BROS",
      subtitle: "",
      subtitles: [],
    },
    leftPanel: {
      topText: "TO GO EVEN FURTHER BEYOND",
      bottomText: SUPPORT_TEXT_HTML,
      image: "assets/bookturn.gif",
    },
    rightPanel: {
      image: "assets/banner3.png",
      buttons: [
        { icon: "B", text: "Bluesky", url: "https://bsky.app/profile/bwondercomics.com" },
        { icon: "P", text: "Patreon", url: "https://patreon.com/doylemelville2" },
        { icon: "A", text: "ArtStation", url: "https://doyle-melvilleii.artstation.com" },
        { icon: "S", text: "Buy Print", url: "https://bwondercomics.bigcartel.com/product/battle-bros-volume-1" },
      ],
    },
  },
  site: {
    safeModeRedirect: false,
    safeModeUrl: SAFE_MODE_URL,
  },
};

function getDefaultPageConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_PAGE_CONFIG));
}

function setActiveNav(active) {
  const navButtons = [
    el.btnDashboard,
    el.btnChapters,
    el.btnBlog,
    el.btnSocial,
    el.btnMedia,
    el.btnUsers,
    el.btnModeration,
    el.btnAnalytics,
    el.btnDesigner,
    el.btnPreview,
    el.btnDiagnostics,
  ];
  navButtons.forEach((btn) => {
    if (!btn) return;
    btn.classList.toggle("nav-btn--active", btn === active);
  });
}

function hideAllSections() {
  if (el.adminDashboard) {
    el.adminDashboard.classList.remove("admin-designer-open");
    el.adminDashboard.classList.remove("admin-page-builder-open");
  }
  if (el.adminContent) {
    el.adminContent.classList.remove("media-content-wide");
  }
  if (el.dashboardSection) el.dashboardSection.style.display = "none";
  if (el.chaptersSection) el.chaptersSection.style.display = "none";
  if (el.blogSection) el.blogSection.style.display = "none";
  if (el.socialSection) el.socialSection.style.display = "none";
  if (el.previewSection) el.previewSection.style.display = "none";
  if (el.designerSection) el.designerSection.style.display = "none";
  if (el.pageBuilderSection) el.pageBuilderSection.style.display = "none";
  if (el.analyticsSection) el.analyticsSection.style.display = "none";
  if (el.mediaSection) el.mediaSection.style.display = "none";
  if (el.usersSection) el.usersSection.style.display = "none";
  if (el.moderationSection) el.moderationSection.style.display = "none";
  if (el.diagnosticsSection) el.diagnosticsSection.style.display = "none";
  if (analyticsManager) analyticsManager.stopLiveVisitors();
}

function getCountViewsEnabled() {
  return readStorage(COUNT_VIEWS_KEY) !== "false";
}

function updateHeaderMetrics() {
  if (!el.adminDashboard || !el.adminHeader) return;
  if (el.adminDashboard.classList.contains("header-hidden")) return;
  const height = el.adminHeader.offsetHeight;
  if (!height) return;
  el.adminDashboard.style.setProperty("--admin-header-height", `${height}px`);
}

function setHeaderHidden(hidden) {
  if (!el.adminDashboard) return;
  const shouldHide = Boolean(hidden);
  el.adminDashboard.classList.toggle("header-hidden", shouldHide);
  if (!shouldHide) updateHeaderMetrics();
}

function applyHeaderSticky(enabled) {
  headerStickyEnabled = Boolean(enabled);
  if (el.stickyHeaderToggle) el.stickyHeaderToggle.checked = headerStickyEnabled;
  if (el.adminDashboard) {
    el.adminDashboard.classList.toggle("header-sticky", headerStickyEnabled);
    if (headerStickyEnabled) {
      el.adminDashboard.classList.remove("header-hidden");
    }
  }
  if (!headerStickyEnabled) {
    const current = window.scrollY || 0;
    setHeaderHidden(current > 24);
  } else {
    setHeaderHidden(false);
  }
  updateHeaderMetrics();
  requestAnimationFrame(updateHeaderMetrics);
}

function setHeaderStickyEnabled(enabled) {
  applyHeaderSticky(enabled);
  writeStorage(HEADER_STICKY_KEY, headerStickyEnabled ? "true" : "false");
}

function handleHeaderScroll() {
  if (headerStickyEnabled || !el.adminDashboard) return;
  const current = window.scrollY || 0;
  setHeaderHidden(current > 24);
}

function applyCountViewsEnabled(enabled) {
  const isEnabled = Boolean(enabled);
  if (el.countViewsToggle) el.countViewsToggle.checked = isEnabled;
  if (el.analyticsCountViewsToggle) {
    el.analyticsCountViewsToggle.checked = isEnabled;
  }
  return isEnabled;
}

function setCountViewsEnabled(enabled) {
  const isEnabled = applyCountViewsEnabled(enabled);
  writeStorage(COUNT_VIEWS_KEY, isEnabled ? "true" : "false");
  return isEnabled;
}

async function loadPageConfigForSettings() {
  try {
    const response = await fetch("/page-config.json", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      if (data && typeof data === "object") return data;
    }
  } catch (err) {
    console.warn("Failed to load page config for settings.", err);
  }
  return getDefaultPageConfig();
}

async function loadSafeModeSetting() {
  if (!el.safeModeToggle) return;
  const config = await loadPageConfigForSettings();
  const site = config?.site && typeof config.site === "object" ? config.site : {};
  el.safeModeToggle.checked = site.safeModeRedirect === true;
}

let safeModeSaving = false;

async function setSafeModeEnabled(enabled) {
  if (!el.safeModeToggle || safeModeSaving) return;
  safeModeSaving = true;
  el.safeModeToggle.disabled = true;
  try {
    const config = await loadPageConfigForSettings();
    const site = config?.site && typeof config.site === "object" ? { ...config.site } : {};
    site.safeModeRedirect = Boolean(enabled);
    site.safeModeUrl = site.safeModeUrl || SAFE_MODE_URL;
    const nextConfig = { ...config, site };
    await saveToServer("admin/page-config.json", nextConfig);
  } catch (err) {
    const message = err?.message || "Safe mode update failed.";
    showError(message);
    el.safeModeToggle.checked = !enabled;
  } finally {
    el.safeModeToggle.disabled = false;
    safeModeSaving = false;
  }
}

function toggleInnerNetPanel() {
  if (!el.innerNetPanel) return;
  if (el.innerNetPanel.hasAttribute("hidden")) {
    el.innerNetPanel.removeAttribute("hidden");
    void loadInnerNetTarget();
  } else {
    el.innerNetPanel.setAttribute("hidden", "");
  }
}

async function loadInnerNetTarget() {
  if (!el.innerNetTarget) return;
  el.innerNetTarget.textContent = "loading...";
  try {
    const response = await fetch("/api/admin/inner-net/target", {
      cache: "no-store",
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const errorText =
        payload && typeof payload === "object" ? payload.error : null;
      throw new Error(errorText || `Request failed (${response.status})`);
    }
    const url = payload && typeof payload.url === "string" ? payload.url : "";
    const host =
      payload && typeof payload.host === "string" ? payload.host : "";
    const port =
      payload && payload.port !== undefined && payload.port !== null
        ? String(payload.port)
        : "";
    const source =
      payload && typeof payload.source === "string" ? payload.source : "";
    const value = url || (host ? (port ? `${host}:${port}` : host) : "");
    const suffix = source ? ` (${source})` : "";
    el.innerNetTarget.textContent = value ? `${value}${suffix}` : "unavailable";
  } catch (err) {
    console.warn("Failed to load Inner-Net target.", err);
    el.innerNetTarget.textContent = "unavailable";
  }
}

function showChaptersSection() {
  hideAllSections();
  if (el.chaptersSection) {
    el.chaptersSection.style.display = "block";
    el.chaptersSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  setActiveNav(el.btnChapters);
}

const seriesManager = createSeriesManager();
const previewManager = createPreviewManager({
  hideAllSections,
  setActiveNav,
  getChaptersDataFileUrl: seriesManager.getChaptersDataFileUrl,
  showError,
});

const postsManager = createPostsManager({
  hideAllSections,
  setActiveNav,
  upsertMediaEntry: (...args) => mediaManager.upsertMediaEntry(...args),
});

const mediaManager = createMediaManager({
  hideAllSections,
  setActiveNav,
  onUseMedia: (item) => postsManager.applyMediaToPost(item),
});

const dashboardManager = createDashboard({
  hideAllSections,
  setActiveNav,
  loadPosts: () => postsManager?.loadPosts(),
});

const usersManager = createUsersManager({ hideAllSections, setActiveNav });
const socialManager = createSocialManager({ hideAllSections, setActiveNav });
const analyticsManager = createAnalytics({ hideAllSections, setActiveNav });
const moderationManager = createModerationManager({
  hideAllSections,
  setActiveNav,
  liveVisitors: analyticsManager,
});
const designerManager = createDesigner({
  sanitizeSeriesId: seriesManager.sanitizeSeriesId,
  getActiveSeriesId: seriesManager.getActiveSeriesId,
  hideAllSections,
  setActiveNav,
});

const pageBuilderManager = createPageBuilder({
  sanitizeSeriesId: seriesManager.sanitizeSeriesId,
  getActiveSeriesId: seriesManager.getActiveSeriesId,
  hideAllSections,
  setActiveNav,
});

const entriesApi = createEntriesApi({
  state,
  el,
  saveToServer,
  showSuccess,
  showError,
  getUnitLabels: seriesManager.getUnitLabels,
  getDataFileUrl: seriesManager.getChaptersDataFileUrl,
  getSaveFilename: seriesManager.getChaptersSaveFilename,
  getChaptersRoot: seriesManager.getChaptersRoot,
  getStorageKey: seriesManager.getChaptersStorageKey,
  STORAGE_KEY,
});

seriesManager.bindDependencies({
  entriesApi,
  setDesignerFrameSrc: designerManager.setDesignerFrameSrc,
  onPageBuilderSeriesChange: pageBuilderManager.onSeriesChange,
  showChaptersSection,
});

const uploadManager = createUploadManager({
  entriesApi,
  getChaptersRoot: seriesManager.getChaptersRoot,
  showError,
  showSuccess,
});

// ---------------- RENUMBER ----------------
async function renumberPages() {
  const entryName = entriesApi.getActiveEntryName();
  const chapterFolder = getChapterFolder(
    entryName,
    state.entryFolders,
    state.entries,
    state.currentPages,
    seriesManager.getChaptersRoot(),
  );
  const btnRenumber = el.btnRenumberPages;
  const originalText = btnRenumber?.textContent || "Renumber Pages";

  try {
    if (btnRenumber) {
      btnRenumber.disabled = true;
      btnRenumber.textContent = "Renumbering...";
    }
    const response = await fetch("/api/renumber-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryFolder: chapterFolder, order: state.currentPages }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Renumber failed");
    state.currentPages = result.paths || [];
    entriesApi.renderPageList(state.currentPages);
    entriesApi.markUnsaved();
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
  el.adminDashboard.style.display = "grid";
  // Load DB-backed data into state before rendering sections.
  dashboardManager.showDashboardSection();
  await loadSafeModeSetting();
  void loadInnerNetTarget();
  loadBlueskyStatus();
  await seriesManager.loadSeriesIndex();
  seriesManager.renderSeriesSelect();
  try {
    await entriesApi.loadEntries();
  } catch (e) {
    console.error("Entries failed to load:", e);
  }
  try {
    await postsManager.loadPosts();
  } catch (e) {
    console.error("Posts failed to load:", e);
  }
  postsManager.loadLocalDraft();
  try {
    await mediaManager.loadMedia();
  } catch (e) {
    console.error("Media failed to load:", e);
  }
  entriesApi.renderStatusMessageInput();
  entriesApi.renderEntryLabelTabs();
  entriesApi.renderEntryList();
  seriesManager.updateSeriesLinks();
  await dashboardManager.refreshDashboard({ skipPosts: true });
}

function attachEventHandlers() {
  bindBlueskyEvents();
  socialManager.bindEvents();
  moderationManager.bindEvents();

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
  if (el.adminNavToggle) {
    el.adminNavToggle.addEventListener("click", toggleNavCollapsed);
  }
  if (el.btnSettings) {
    el.btnSettings.addEventListener("click", (e) => {
      e.preventDefault();
      toggleSettingsPanel();
      if (el.innerNetPanel) el.innerNetPanel.setAttribute("hidden", "");
    });
  }
  if (el.btnInnerNet) {
    el.btnInnerNet.addEventListener("click", (e) => {
      e.preventDefault();
      toggleInnerNetPanel();
      if (el.adminSettingsPanel) el.adminSettingsPanel.setAttribute("hidden", "");
    });
  }
  if (el.btnDashboard) {
    el.btnDashboard.addEventListener("click", () => {
      dashboardManager.showDashboardSection();
      dashboardManager.refreshDashboard({ showLoading: true });
    });
  }
  if (el.btnDashboardRefresh) {
    el.btnDashboardRefresh.addEventListener("click", () =>
      dashboardManager.refreshDashboard({ showLoading: true }),
    );
  }
  if (el.navLayoutSelect) {
    el.navLayoutSelect.addEventListener("change", (e) => {
      const target = /** @type {HTMLSelectElement} */ (e.currentTarget);
      const layout = applyNavLayout(target.value);
      writeStorage(NAV_LAYOUT_KEY, layout);
    });
  }
  if (el.scanlinesToggle) {
    el.scanlinesToggle.addEventListener("change", (e) => {
      const target = /** @type {HTMLInputElement} */ (e.currentTarget);
      setScanlinesEnabled(target.checked);
    });
  }
  if (el.stickyHeaderToggle) {
    el.stickyHeaderToggle.addEventListener("change", (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      setHeaderStickyEnabled(target.checked);
    });
  }
  document.addEventListener("click", (event) => {
    const settingsOpen =
      el.adminSettingsPanel && !el.adminSettingsPanel.hasAttribute("hidden");
    const innerNetOpen =
      el.innerNetPanel && !el.innerNetPanel.hasAttribute("hidden");
    if (!settingsOpen && !innerNetOpen) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (el.adminSettingsPanel && el.adminSettingsPanel.contains(target)) return;
    if (el.btnSettings && el.btnSettings.contains(target)) return;
    if (el.innerNetPanel && el.innerNetPanel.contains(target)) return;
    if (el.btnInnerNet && el.btnInnerNet.contains(target)) return;
    if (settingsOpen && el.adminSettingsPanel) {
      el.adminSettingsPanel.setAttribute("hidden", "");
    }
    if (innerNetOpen && el.innerNetPanel) {
      el.innerNetPanel.setAttribute("hidden", "");
    }
  });

  // Entries
  if (el.seriesSelect) {
    el.seriesSelect.addEventListener("change", async (e) => {
      const target = /** @type {HTMLSelectElement} */ (e.currentTarget);
      await seriesManager.switchSeries(target.value);
    });
  }
  if (el.btnAddSeries) {
    el.btnAddSeries.addEventListener("click", async () => {
      await seriesManager.createNewSeries();
    });
  }
  if (el.btnEditSeries) {
    el.btnEditSeries.addEventListener("click", async () => {
      await seriesManager.editActiveSeries();
    });
  }
  if (el.btnSeriesDesigner) {
    el.btnSeriesDesigner.addEventListener("click", () => {
      pageBuilderManager.showPageBuilderSection();
    });
  }
  if (el.btnDesigner) {
    el.btnDesigner.addEventListener("click", () => {
      pageBuilderManager.showPageBuilderSection();
    });
  }
  el.btnAddEntry.addEventListener("click", entriesApi.addNewEntry);
  if (el.btnAddEntryLabel) {
    el.btnAddEntryLabel.addEventListener("click", entriesApi.addEntryLabel);
  }
  if (el.btnSaveStatus) {
    el.btnSaveStatus.addEventListener("click", entriesApi.saveStatusMessage);
  }
  el.btnCloseModal.addEventListener("click", entriesApi.hideModal);
  el.btnCancelEdit.addEventListener("click", entriesApi.hideModal);
  el.editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await entriesApi.saveEntryEdit();
  });
  el.btnAddPage.addEventListener("click", entriesApi.addPage);

  // Preview & export
  el.btnPreview.addEventListener("click", () => {
    previewManager.showPreviewSection();
    previewManager.loadPreviewPayload();
    previewManager.updatePreviewChapters(
      state.currentEditingEntry || Object.keys(state.entries)[0] || "",
    );
  });
  el.btnCopy.addEventListener("click", previewManager.copyToClipboard);
  el.btnDownload.addEventListener("click", previewManager.downloadJSON);
  el.btnBlog.addEventListener("click", () => postsManager.showBlogSection());
  if (el.btnSocial) {
    el.btnSocial.addEventListener("click", () => {
      socialManager.showSocialSection();
      void socialManager.refreshBluesky();
    });
  }
  if (el.btnChapters) {
    el.btnChapters.addEventListener("click", showChaptersSection);
  }
  el.btnSavePost.addEventListener("click", async (e) => {
    e.preventDefault();
    await postsManager.savePost();
  });
  if (el.btnSaveDraft) {
    el.btnSaveDraft.addEventListener("click", async (e) => {
      e.preventDefault();
      await postsManager.savePost({ status: "draft" });
    });
  }
  postsManager.bindRichTextToolbar();
  postsManager.bindBlueskyCounter();

  if (el.btnMedia) {
    el.btnMedia.addEventListener("click", () => {
      state.pendingMediaSelection = null;
      mediaManager.showMediaSection();
    });
  }
  if (el.btnUsers) {
    el.btnUsers.addEventListener("click", async () => {
      usersManager.showUsersSection();
      await usersManager.loadUsers();
    });
  }
  if (el.btnAnalytics) {
    el.btnAnalytics.addEventListener("click", () =>
      analyticsManager.showAnalyticsSection(),
    );
  }
  if (el.btnDiagnostics) {
    el.btnDiagnostics.addEventListener("click", async () => {
      hideAllSections();
      if (el.diagnosticsSection) {
        el.diagnosticsSection.style.display = "block";
        el.diagnosticsSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      setActiveNav(el.btnDiagnostics);
      await initDiagnostics();
    });
  }
  if (el.btnAnalyticsRefresh) {
    el.btnAnalyticsRefresh.addEventListener("click", () =>
      analyticsManager.refreshAnalytics({ showLoading: true }),
    );
  }
  if (el.countViewsToggle) {
    el.countViewsToggle.addEventListener("change", (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      setCountViewsEnabled(target.checked);
    });
  }
  if (el.safeModeToggle) {
    el.safeModeToggle.addEventListener("change", (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      setSafeModeEnabled(target.checked);
    });
  }
  if (el.analyticsCountViewsToggle) {
    el.analyticsCountViewsToggle.addEventListener("change", (event) => {
      const target = /** @type {HTMLInputElement} */ (event.currentTarget);
      setCountViewsEnabled(target.checked);
    });
  }
  if (el.analyticsPagesRange) {
    el.analyticsPagesRange.addEventListener("change", () => {
      analyticsManager.loadAnalyticsPages({ showLoading: true });
    });
  }
  if (el.analyticsReaderRange) {
    el.analyticsReaderRange.addEventListener("change", () => {
      analyticsManager.loadReaderAnalytics({ showLoading: true });
    });
  }
  if (el.analyticsReaderSeries) {
    el.analyticsReaderSeries.addEventListener("change", () => {
      analyticsManager.renderReaderAnalyticsView();
    });
  }
  if (el.liveVisitorsRange) {
    el.liveVisitorsRange.addEventListener("change", () => {
      analyticsManager.loadLiveVisitors({ showLoading: true });
    });
  }
  if (el.btnLiveVisitorsRefresh) {
    el.btnLiveVisitorsRefresh.addEventListener("click", () => {
      analyticsManager.loadLiveVisitors({ showLoading: true });
    });
  }
  if (el.btnLiveVisitorsZoomIn) {
    el.btnLiveVisitorsZoomIn.addEventListener("click", () => {
      analyticsManager.shiftLiveRange(1);
    });
  }
  if (el.btnLiveVisitorsZoomOut) {
    el.btnLiveVisitorsZoomOut.addEventListener("click", () => {
      analyticsManager.shiftLiveRange(-1);
    });
  }
  if (el.btnRefreshUsers) {
    el.btnRefreshUsers.addEventListener("click", async () => {
      await usersManager.loadUsers();
    });
  }
  if (el.btnGeneratePremiumCodes) {
    el.btnGeneratePremiumCodes.addEventListener("click", async () => {
      await usersManager.generatePremiumCodes();
    });
  }
  if (el.btnAddMedia) {
    el.btnAddMedia.addEventListener("click", mediaManager.addMediaItem);
  }
  if (el.btnUploadMedia) {
    el.btnUploadMedia.addEventListener("click", mediaManager.uploadMediaFiles);
  }
  if (el.btnSyncMedia) {
    el.btnSyncMedia.addEventListener("click", () =>
      mediaManager.syncMediaFromDisk(true),
    );
  }
  if (el.mediaSearch) {
    el.mediaSearch.addEventListener("input", mediaManager.renderMedia);
  }
  if (el.mediaSort) {
    el.mediaSort.addEventListener("change", mediaManager.renderMedia);
  }
  if (el.previewChapterSelect) {
    el.previewChapterSelect.addEventListener("change", (e) => {
      const target = /** @type {HTMLSelectElement} */ (e.currentTarget);
      previewManager.setPreviewChapter(target.value);
    });
  }
  if (el.previewPrev) {
    el.previewPrev.addEventListener("click", () => {
      state.previewState.index = Math.max(0, state.previewState.index - 1);
      previewManager.renderPreviewImage();
    });
  }
  if (el.previewNext) {
    el.previewNext.addEventListener("click", () => {
      state.previewState.index = Math.min(
        (state.previewState.pages.length || 1) - 1,
        state.previewState.index + 1,
      );
      previewManager.renderPreviewImage();
    });
  }

  // Renumber
  if (el.btnRenumberPages) {
    el.btnRenumberPages.addEventListener("click", renumberPages);
  }

  // Close modals on backdrop
  el.editModal.addEventListener("click", (e) => {
    if (e.target === el.editModal) entriesApi.hideModal();
  });
}

async function init() {
  attachEventHandlers();
  initNavPreferences();
  applyHeaderSticky(readStorage(HEADER_STICKY_KEY) === "true");
  applyCountViewsEnabled(getCountViewsEnabled());
  updateHeaderMetrics();
  window.addEventListener("scroll", handleHeaderScroll, { passive: true });
  window.addEventListener("resize", updateHeaderMetrics);
  designerManager.initDesignerFrame();
  pageBuilderManager.initPageBuilder();
  uploadManager.initUploadHandlers();
  const isAuthenticated = await checkSession(showDashboard);
  if (!isAuthenticated) {
    el.loginScreen.style.display = "flex";
    el.adminDashboard.style.display = "none";
  }
}

if (
  document.readyState === "complete" ||
  document.readyState === "interactive"
) {
  setTimeout(init, 0);
} else {
  document.addEventListener("DOMContentLoaded", init);
}

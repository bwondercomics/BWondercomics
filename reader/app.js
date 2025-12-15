import { CONFIG } from "./config.js";
import {
  extractChapterNumber,
  sortChapterNames,
  sanitizeChapters,
} from "./chapters.js";
import { state, saveProgress, loadProgress } from "./state.js";
import { loadChapterData, loadPageConfig, loadLatestPost } from "./data.js";
import { el, initElements } from "./dom.js";
import { renderStatusPanel, render } from "./render.js";
import {
  prevPage,
  nextPage,
  restartChapter,
  hideEndOfChapter,
} from "./controls.js";
import {
  fitHeightFullscreen,
  fitToScreen,
  zoomIn,
  zoomOut,
  resetView,
} from "./transform.js";
import { initPointerHandlers } from "./pointer.js";
import {
  toggleShortcutsOverlay,
  closeShortcutsOverlay,
  goToNextChapter,
  changeChapter,
} from "./overlays.js";
import {
  renderGallery,
  toggleGallery,
  attachGalleryButton,
} from "./gallery.js";
import {
  showControlsBar,
  onFullscreenChange,
  toggleFullscreen,
  handleMouseEnterControls,
  handleMouseLeaveControls,
} from "./fullscreen.js";
import { renderLatestUpdate } from "./latest.js";
import { initEmailSignupForm } from "./email.js";
import { getActiveSeriesId } from "./series.js";

(function () {
  "use strict";
  // ==================== CHAPTER HELPERS ====================

  // Helpers now live in reader/chapters.js

  // ==================== SUBTITLES ====================
  let SUBTITLES = [];
  function setSubtitles(list) {
    SUBTITLES = Array.isArray(list) ? list.filter(Boolean) : [];
    setInitialSubtitle();
  }

  // ==================== CHAPTER DATA ====================
  // Chapter data is loaded dynamically from admin/data.json
  let chapters = {};
  let chapterOrder = [];
  let statusMessage = "";
  let chapterMeta = {};
  let premiumOnly = false;

  // ==================== PROGRESS PERSISTENCE ====================

  // ==================== PAGE NAVIGATION ====================

  // Navigation helpers are now in reader/controls.js

  // ==================== POINTER INTERACTIONS ====================
  // Moved to reader/pointer.js

  // ==================== CHAPTER MANAGEMENT ====================

  function initChapterSelect() {
    if (!el.chapter) return;

    const names = chapterOrder.length ? chapterOrder : Object.keys(chapters);

    names.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      el.chapter.appendChild(option);
    });
  }

  // ==================== COVER GALLERY ====================

  // Gallery helpers moved to reader/gallery.js
  // ==================== EVENT HANDLERS ====================

  function attachEventHandlers() {
    // Book turn promo click handler
    const bookTurnPromo = document.getElementById("bookTurnPromo");
    if (bookTurnPromo) {
      bookTurnPromo.addEventListener("click", () => {
        window.open(
          "https://bwondercomics.bigcartel.com/product/battle-bros-volume-1",
          "_blank",
          "noopener,noreferrer",
        );
      });
    }

    // Navigation buttons
    if (el.prevBtn) el.prevBtn.addEventListener("click", prevPage);
    if (el.nextBtn) el.nextBtn.addEventListener("click", nextPage);

    // Zoom and view buttons
    if (el.zoomIn) el.zoomIn.addEventListener("click", zoomIn);
    if (el.zoomOut) el.zoomOut.addEventListener("click", zoomOut);
    if (el.fitBtn) el.fitBtn.addEventListener("click", fitToScreen);
    if (el.fullscreenBtn)
      el.fullscreenBtn.addEventListener("click", toggleFullscreen);

    // Help button
    const helpBtn = document.getElementById("helpBtn");
    if (helpBtn) helpBtn.addEventListener("click", toggleShortcutsOverlay);
    attachGalleryButton();

    if (el.edgeLeftBtn) {
      el.edgeLeftBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        prevPage();
      });
    }
    if (el.edgeRightBtn) {
      el.edgeRightBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        nextPage();
      });
    }

    initPointerHandlers();

    document.addEventListener("keydown", (e) => {
      // Don't interfere if user is typing in an input
      if (e.target.matches("input, textarea, select")) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          prevPage();
          break;
        case "ArrowRight":
          e.preventDefault();
          nextPage();
          break;
        case "+":
        case "=":
          e.preventDefault();
          zoomIn();
          break;
        case "-":
          e.preventDefault();
          zoomOut();
          break;
        case "0":
          e.preventDefault();
          resetView();
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "?":
          e.preventDefault();
          toggleShortcutsOverlay();
          break;
        case "Escape":
          e.preventDefault();
          closeShortcutsOverlay();
          hideEndOfChapter();
          if (document.fullscreenElement) {
            document.exitFullscreen();
          }
          break;
      }
    });

    document.addEventListener("fullscreenchange", onFullscreenChange);

    document.addEventListener("mousemove", (e) => {
      if (document.fullscreenElement) {
        const nearEdge =
          e.clientY < 150 || e.clientY > window.innerHeight - 200;
        if (nearEdge) showControlsBar();
      }
    });

    if (el.topbar) {
      el.topbar.addEventListener("mouseenter", handleMouseEnterControls);
      el.topbar.addEventListener("mouseleave", handleMouseLeaveControls);
    }

    if (el.controls) {
      el.controls.addEventListener("mouseenter", handleMouseEnterControls);
      el.controls.addEventListener("mouseleave", handleMouseLeaveControls);
    }

    if (el.chapter) {
      el.chapter.addEventListener("change", (e) => {
        changeChapter(e.target.value, chapters);
      });
    }

    // Handle window resize and orientation changes
    let resizeTimeout;
    window.addEventListener("resize", () => {
      // Debounce resize events to avoid excessive re-renders
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        render();
      }, 150);
    });

    // Shortcuts overlay buttons
    const shortcutsClose = document.getElementById("shortcutsClose");
    if (shortcutsClose) {
      shortcutsClose.addEventListener("click", closeShortcutsOverlay);
    }

    // End of chapter overlay buttons
    const nextChapterBtn = document.getElementById("nextChapterBtn");
    const restartChapterBtn = document.getElementById("restartChapterBtn");
    const closeEndOverlay = document.getElementById("closeEndOverlay");

    if (nextChapterBtn) {
      nextChapterBtn.addEventListener("click", () =>
        goToNextChapter(chapterOrder, chapters),
      );
    }
    if (restartChapterBtn) {
      restartChapterBtn.addEventListener("click", () =>
        restartChapter(chapters),
      );
    }
    if (closeEndOverlay) {
      closeEndOverlay.addEventListener("click", hideEndOfChapter);
    }
  }

  // ==================== QUOTE RANDOMIZER ====================

  function setInitialSubtitle() {
    if (!el.subtitle) return;
    if (!SUBTITLES.length) {
      el.subtitle.textContent = "";
      return;
    }
    const idx = Math.floor(Math.random() * SUBTITLES.length);
    el.subtitle.textContent = SUBTITLES[idx];
  }

  // ==================== SHORTCUTS OVERLAY ====================

  // ==================== LATEST UPDATE WIDGET ====================

  async function loadLatestUpdate() {
    const body = document.getElementById("latestBody");
    if (!body) return;

    const latest = await loadLatestPost();
    if (!latest) return;
    renderLatestUpdate(latest);
  }

  // ==================== LOAD CHAPTER DATA ====================

  // ==================== DATA LOADERS ====================

  const statusTimerRef = { current: null };

  function handleDataLoadError(error) {
    const viewport = document.getElementById("viewport");
    if (viewport) {
      viewport.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px; text-align: center; gap: 16px;">
            <div style="font-family: 'Bebas Neue', sans-serif; font-size: 32px; color: var(--danger); text-transform: uppercase; letter-spacing: 2px;">
              ERROR LOADING COMIC DATA
            </div>
            <div style="font-size: 16px; color: var(--text); max-width: 500px; line-height: 1.6;">
              Unable to load chapter data from the server. Please refresh the page or contact support if the issue persists.
            </div>
            <div style="font-size: 14px; color: rgba(255,255,255,0.6); font-family: monospace;">
              ${error.message}
            </div>
            <button onclick="window.location.reload()" style="padding: 12px 24px; background: linear-gradient(135deg, var(--primary), var(--secondary)); border: 3px solid var(--accent); color: var(--bg-dark); font-family: 'Bebas Neue'; font-size: 18px; cursor: pointer; text-transform: uppercase; margin-top: 8px;">
              RETRY
            </button>
          </div>
        `;
    }
  }

  // ==================== INITIALIZATION ====================

  function init() {
    initElements();
    initChapterSelect();
    // renderGallery(); // Loaded on open
    setInitialSubtitle();
    renderStatusPanel(statusMessage || "ready", statusTimerRef);
    initEmailSignupForm();

    const availableChapters = chapterOrder.length
      ? chapterOrder
      : Object.keys(chapters);

    if (!availableChapters.length) {
      if (el.chapter) el.chapter.innerHTML = "";
      const viewport = document.getElementById("viewport");
      if (viewport) {
        const message = premiumOnly
          ? "This series is premium-only. Sign in with a premium account to view chapters."
          : "No chapters found for this series yet.";
        viewport.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;gap:10px;">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:32px;color:var(--accent);letter-spacing:2px;">NO CHAPTERS</div>
            <div style="max-width:560px;line-height:1.6;opacity:0.95;">${message}</div>
          </div>
        `;
      }
      return;
    }
    const saved = loadProgress();
    if (saved && chapters[saved.chapter]) {
      state.currentChapter = saved.chapter;
      state.pages = chapters[saved.chapter];
      state.pageIndex = saved.page || 0;
    } else {
      const firstChapter = availableChapters[0];
      state.currentChapter = firstChapter;
      state.pages = chapters[firstChapter] || [];
      state.pageIndex = 0;
    }

    if (el.chapter) el.chapter.value = state.currentChapter;

    attachEventHandlers();
    render();

    console.log("? Battle Bros Reader initialized");
  }

  // ==================== START ====================

  async function start() {
    const seriesId = getActiveSeriesId();

    try {
      const data = await loadChapterData(seriesId);
      if (data) {
        chapters = data.chapters;
        chapterOrder = data.chapterOrder;
        statusMessage = data.statusMessage;
        chapterMeta = data.chapterMeta || {};
        premiumOnly = !!data.premiumOnly;
        console.log(`Chapter data loaded for series: ${seriesId}`);
      }
    } catch (err) {
      handleDataLoadError(err);
      return;
    }

    const fullChapterOrder = Array.isArray(chapterOrder) ? [...chapterOrder] : [];
    const fullChapterMeta = chapterMeta && typeof chapterMeta === "object" ? chapterMeta : {};

    // Apply premium gating (client-side UX; server enforces for protected folders too)
    let sessionUser = null;
    try {
      const res = await fetch("/api/session", { cache: "no-store", credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        sessionUser = data.user || null;
      }
    } catch (err) {
      sessionUser = null;
    }

    const role = (sessionUser?.role || "").toString().toLowerCase();
    const isPremiumUser = role === "admin" || role === "premium";
    const adminNavLink = document.getElementById("adminNavLink");
    if (adminNavLink) {
      adminNavLink.style.display = role === "admin" ? "inline-flex" : "none";
    }
    let lockedChapters = [];
    if (!isPremiumUser) {
      if (premiumOnly) {
        lockedChapters = fullChapterOrder.length ? fullChapterOrder : Object.keys(chapters);
      } else {
        lockedChapters = fullChapterOrder.filter((name) => fullChapterMeta?.[name]?.premium);
      }
    }

    if (premiumOnly && !isPremiumUser) {
      chapters = {};
      chapterOrder = [];
      statusMessage = "PREMIUM_ONLY";
    } else if (!isPremiumUser && chapterMeta && typeof chapterMeta === "object") {
      const filteredOrder = chapterOrder.filter((name) => !(chapterMeta[name]?.premium));
      const filteredChapters = {};
      filteredOrder.forEach((name) => {
        filteredChapters[name] = chapters[name];
      });
      chapters = filteredChapters;
      chapterOrder = filteredOrder;
    }

    renderGallery(chapterOrder, chapters, { lockedChapters, chapterMeta: fullChapterMeta });
    await loadPageConfig(setSubtitles, seriesId);
    loadLatestUpdate();
    init();
  }

  window.addEventListener("bbSessionChanged", (event) => {
    const user = event?.detail?.user || null;
    const role = (user?.role || "").toString().toLowerCase();
    const adminNavLink = document.getElementById("adminNavLink");
    if (adminNavLink) {
      adminNavLink.style.display = role === "admin" ? "inline-flex" : "none";
    }
  });

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    setTimeout(start, 0);
  } else {
    document.addEventListener("DOMContentLoaded", start);
  }

  window.BattleBros = {
    setSubtitle: (text) => {
      if (el.subtitle) el.subtitle.textContent = String(text);
    },
    setRandomSubtitleNow: () => {
      setInitialSubtitle();
    },
    setSubtitles: setSubtitles,
  };
})();

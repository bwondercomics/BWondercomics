// Reader bootstrap: loads data, binds UI, and wires view state.
import { CONFIG } from "./config.js";
import {
  extractChapterNumber,
  sortChapterNames,
  sanitizeChapters,
} from "./chapters.js";
import { state, saveProgress, loadProgress } from "./state.js";
import { logger } from "./logger.js";
import { loadChapterData, loadPageConfig, loadLatestPost } from "./data.js";
import { el, initElements } from "./dom.js";
import { renderStatusPanel, render } from "./render.js";
import { initReaderAnalytics, setActiveEntry } from "./analytics.js";
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

// Code splitting: lazy load heavier modules on demand.
let galleryModule = null;
let fullscreenModule = null;

async function loadGalleryModule() {
  if (!galleryModule) {
    galleryModule = await import("./gallery.js");
  }
  return galleryModule;
}

async function loadFullscreenModule() {
  if (!fullscreenModule) {
    fullscreenModule = await import("./fullscreen.js");
  }
  return fullscreenModule;
}

// Wrapper functions that load modules on-demand
async function renderGallery(...args) {
  const mod = await loadGalleryModule();
  return mod.renderGallery(...args);
}

async function attachGalleryButton() {
  const mod = await loadGalleryModule();
  return mod.attachGalleryButton();
}

async function toggleFullscreen() {
  const mod = await loadFullscreenModule();
  return mod.toggleFullscreen();
}

async function onFullscreenChange(...args) {
  const mod = await loadFullscreenModule();
  return mod.onFullscreenChange(...args);
}

async function showControlsBar() {
  const mod = await loadFullscreenModule();
  return mod.showControlsBar();
}

async function handleMouseEnterControls() {
  const mod = await loadFullscreenModule();
  return mod.handleMouseEnterControls();
}

async function handleMouseLeaveControls() {
  const mod = await loadFullscreenModule();
  return mod.handleMouseLeaveControls();
}
import { renderLatestUpdate } from "./latest.js";
import { initRightPanelFeed } from "./feed-panel.js";
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

  // ==================== PATRON WELCOME ====================
  const PATRON_WELCOME_DURATION_MS = 20000;
  let patronWelcomeTimer = null;

  function updatePatronWelcome(user) {
    const label = document.getElementById("patronWelcome");
    if (!label) return;

    const role = (user?.role || "").toString().toLowerCase();
    const isPremium =
      role === "admin" || role === "premium" || !!user?.premiumActive;
    if (!isPremium) {
      label.classList.remove("is-visible");
      return;
    }

    label.textContent = "WELCOME PATRON";
    label.classList.add("is-visible");
    if (patronWelcomeTimer) {
      window.clearTimeout(patronWelcomeTimer);
    }
    patronWelcomeTimer = window.setTimeout(() => {
      label.classList.remove("is-visible");
      patronWelcomeTimer = null;
    }, PATRON_WELCOME_DURATION_MS);
  }

  // ==================== ENTRY DATA ====================
  // Entry data is loaded dynamically from the series data endpoint
  let entries = {};
  let entryOrder = [];
  let statusMessage = "";
  let entryMeta = {};
  let entryLabels = [];
  let entryLabelsById = {};
  let premiumOnly = false;
  let unitLabelSingular = "Entry";
  let unitLabelPlural = "Entries";
  let chapterSelectBound = false;

  function getUnitLabels() {
    const singular = String(unitLabelSingular || "").trim() || "Entry";
    const plural = String(unitLabelPlural || "").trim() || `${singular}s`;
    return { singular, plural };
  }

  function getEntryLabelFor(name) {
    const meta = entryMeta?.[name] || {};
    const labelId = meta.entryLabelId;
    if (labelId && entryLabelsById[labelId]) {
      return entryLabelsById[labelId];
    }
    if (meta.entryLabelSingular || meta.entryLabelPlural) {
      return {
        singular: String(meta.entryLabelSingular || "").trim() || getUnitLabels().singular,
        plural: String(meta.entryLabelPlural || "").trim() || getUnitLabels().plural
      };
    }
    return getUnitLabels();
  }

  function getEntryDisplayNumber(name) {
    const rawNumber = entryMeta?.[name]?.displayNumber;
    const parsed = Number.isFinite(rawNumber) ? rawNumber : parseInt(rawNumber, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatEntryLabel(name) {
    if (!name) return "";
    const displayNumber = getEntryDisplayNumber(name);
    const meta = entryMeta?.[name] || {};
    const entryLabel = getEntryLabelFor(name);
    const baseLabel = displayNumber == null
      ? name
      : `${entryLabel.singular} ${displayNumber} - ${name}`;
    const isComingSoon = !!meta.comingSoon || String(meta.status || "").toLowerCase() === "scheduled";
    return isComingSoon ? `${baseLabel} (Coming Soon)` : baseLabel;
  }

  function formatEntryTrackingLabel(name) {
    const displayNumber = getEntryDisplayNumber(name);
    if (displayNumber == null) return "";
    const entryLabel = getEntryLabelFor(name);
    return `${entryLabel.singular} ${displayNumber}`;
  }

  function shouldShowInDropdown(name) {
    const meta = entryMeta?.[name] || {};
    if (meta.showInDropdown === false) return false;
    if (String(meta.releaseType || "").toLowerCase() === "store" && !meta.storeUrl) return false;
    return true;
  }

  function isStoreEntry(name) {
    return String(entryMeta?.[name]?.releaseType || "").toLowerCase() === "store";
  }

  function getNavigableEntries() {
    const names = entryOrder.length ? entryOrder : Object.keys(entries);
    return names.filter((name) => !isStoreEntry(name));
  }

  function applyUnitLabels() {
    const { singular, plural } = getUnitLabels();
    const singularUpper = singular.toUpperCase();
    const pluralUpper = plural.toUpperCase();

    const commentsTitle = document.querySelector(
      "#comicCommentsSection .comments-title",
    );
    if (commentsTitle) commentsTitle.textContent = `Discuss This ${singular}`;

    const endTitle = document.querySelector("#chapterEndOverlay h2");
    if (endTitle) endTitle.textContent = `${singularUpper} COMPLETE`;

    const endBody = document.querySelector("#chapterEndOverlay p");
    if (endBody) {
      endBody.textContent = `You've reached the end of this ${singular.toLowerCase()}! Ready for more?`;
    }

    const nextBtn = document.getElementById("nextChapterBtn");
    if (nextBtn) nextBtn.textContent = `Next ${singular}`;

    const restartBtn = document.getElementById("restartChapterBtn");
    if (restartBtn) restartBtn.textContent = `Restart ${singular}`;

    const galleryTitle = document.querySelector("#galleryOverlay h2");
    if (galleryTitle) galleryTitle.textContent = `${singularUpper} GALLERY`;

    window.dispatchEvent(
      new CustomEvent("unitLabelChanged", {
        detail: { singular, plural, singularUpper, pluralUpper },
      }),
    );
  }

  // ==================== PROGRESS PERSISTENCE ====================

  // ==================== PAGE NAVIGATION ====================

  // Navigation helpers are now in reader/controls.js

  // ==================== POINTER INTERACTIONS ====================
  // Moved to reader/pointer.js

  // ==================== CHAPTER MANAGEMENT ====================

  function initChapterSelect() {
    if (!el.chapter) return;

    const names = entryOrder.length ? entryOrder : Object.keys(entries);
    const dropdownNames = names.filter(shouldShowInDropdown);
    el.chapter.innerHTML = "";

    dropdownNames.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      const displayNumber = getEntryDisplayNumber(name);
      if (displayNumber != null) {
        option.dataset.displayNumber = String(displayNumber);
        const trackingLabel = formatEntryTrackingLabel(name);
        if (trackingLabel) option.dataset.entryLabel = trackingLabel;
      }
      el.chapter.appendChild(option);
    });

    buildChapterSelectMenu(dropdownNames);
    bindChapterSelectEvents();
    syncChapterSelectDisplay();
  }

  function getChapterSelectElements() {
    return {
      wrap: document.getElementById("chapterSelect"),
      trigger: document.getElementById("chapterSelectTrigger"),
      name: document.getElementById("chapterSelectName"),
      patron: document.getElementById("chapterSelectPatron"),
      menu: document.getElementById("chapterSelectMenu"),
    };
  }

  function setChapterMenuOpen(isOpen) {
    const { trigger, menu } = getChapterSelectElements();
    if (!trigger || !menu) return;
    menu.classList.toggle("open", isOpen);
    trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  function buildChapterSelectMenu(names) {
    const { menu } = getChapterSelectElements();
    if (!menu) return;
    menu.innerHTML = "";

    names.forEach((name) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chapter-option";
      button.dataset.value = name;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", "false");

      const label = document.createElement("span");
      label.className = "chapter-option-name";
      label.textContent = formatEntryLabel(name);
      button.appendChild(label);

      if (entryMeta?.[name]?.premium) {
        const patron = document.createElement("span");
        patron.className = "chapter-option-patron";
        patron.textContent = "Patron";
        button.appendChild(patron);
      }

      button.addEventListener("click", () => {
        if (el.chapter) {
          el.chapter.value = name;
          el.chapter.dispatchEvent(new Event("change", { bubbles: true }));
        }
        setChapterMenuOpen(false);
      });

      menu.appendChild(button);
    });
  }

  function syncChapterSelectDisplay() {
    const { name, patron, menu } = getChapterSelectElements();
    if (!name || !el.chapter) return;
    const value = el.chapter.value || "";
    name.textContent = value ? formatEntryLabel(value) : getUnitLabels().singular;
    const isPatron = !!entryMeta?.[value]?.premium;
    if (patron) {
      patron.style.display = isPatron ? "inline-flex" : "none";
    }
    if (menu) {
      menu.querySelectorAll(".chapter-option").forEach((option) => {
        const selected = option.dataset.value === value;
        option.setAttribute("aria-selected", selected ? "true" : "false");
        option.classList.toggle("is-selected", selected);
      });
    }
  }

  function bindChapterSelectEvents() {
    if (chapterSelectBound) return;
    const { wrap, trigger, menu } = getChapterSelectElements();
    if (!wrap || !trigger || !menu) return;

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      setChapterMenuOpen(!menu.classList.contains("open"));
    });

    menu.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    document.addEventListener("click", (event) => {
      if (!wrap.contains(event.target)) {
        setChapterMenuOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setChapterMenuOpen(false);
      }
    });

    chapterSelectBound = true;
  }

  // ==================== COVER GALLERY ====================

  // Gallery helpers moved to reader/gallery.js
  // ==================== EVENT HANDLERS ====================

  async function getGifLoopDuration(src) {
    try {
      const res = await fetch(src, { cache: "force-cache" });
      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      const data = new Uint8Array(buffer);
      if (data.length < 13) return null;
      const header = String.fromCharCode(data[0], data[1], data[2]);
      if (header !== "GIF") return null;

      let idx = 6;
      const packed = data[idx + 4];
      idx += 7;
      if (packed & 0x80) {
        const gctSize = 3 * (1 << ((packed & 0x07) + 1));
        idx += gctSize;
      }

      let pendingDelay = 0;
      let totalDelay = 0;

      while (idx < data.length) {
        const blockId = data[idx++];
        if (blockId === 0x3b) break;
        if (blockId === 0x21) {
          const label = data[idx++];
          if (label === 0xf9) {
            const blockSize = data[idx++];
            if (blockSize === 4 && idx + 4 <= data.length) {
              idx++; // packed fields
              pendingDelay = data[idx] + (data[idx + 1] << 8);
              idx += 2;
              idx++; // transparent index
            } else {
              idx += blockSize;
            }
            if (data[idx] === 0x00) idx++;
          } else {
            while (idx < data.length) {
              const size = data[idx++];
              if (size === 0) break;
              idx += size;
            }
          }
        } else if (blockId === 0x2c) {
          idx += 8;
          if (idx >= data.length) break;
          const packedFields = data[idx++];
          if (packedFields & 0x80) {
            const lctSize = 3 * (1 << ((packedFields & 0x07) + 1));
            idx += lctSize;
          }
          idx++; // LZW min code size
          while (idx < data.length) {
            const size = data[idx++];
            if (size === 0) break;
            idx += size;
          }
          const delay = pendingDelay || 10;
          totalDelay += delay;
          pendingDelay = 0;
        } else {
          break;
        }
      }

      return totalDelay ? totalDelay * 10 : null;
    } catch (err) {
      return null;
    }
  }

  function captureStaticFrame(img, src) {
    return new Promise((resolve) => {
      const loader = new Image();
      loader.onload = () => {
        try {
          const width = loader.naturalWidth || loader.width;
          const height = loader.naturalHeight || loader.height;
          if (!width || !height) {
            resolve(null);
            return;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(loader, 0, 0, width, height);
          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          resolve(null);
        }
      };
      loader.onerror = () => resolve(null);
      loader.src = src;
    });
  }

  async function initBookTurnGif(img) {
    const gifSrc = img.getAttribute("src");
    if (!gifSrc) return;

    const [loopDuration, staticSrc] = await Promise.all([
      getGifLoopDuration(gifSrc),
      captureStaticFrame(img, gifSrc),
    ]);
    const durationMs = loopDuration || 2000;
    const stillSrc = staticSrc || "";
    let isPlaying = false;
    let timerId = null;

    const stopPlayback = () => {
      isPlaying = false;
      if (stillSrc) img.src = stillSrc;
    };

    const playLoops = (loops) => {
      if (isPlaying) return;
      isPlaying = true;
      img.src = gifSrc;
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(stopPlayback, durationMs * loops);
    };

    playLoops(5);

    img.addEventListener("mouseenter", () => {
      if (!isPlaying) playLoops(3);
    });
  }

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
      initBookTurnGif(bookTurnPromo);
    }
    initRightPanelFeed();

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
        const nextName = e.target.value;
        const meta = entryMeta?.[nextName] || {};
        if (String(meta.releaseType || "").toLowerCase() === "store" && meta.storeUrl) {
          window.open(meta.storeUrl, "_blank", "noopener,noreferrer");
          el.chapter.value = state.currentChapter;
          syncChapterSelectDisplay();
          return;
        }
        changeChapter(nextName, entries, entryMeta);
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
        goToNextChapter(getNavigableEntries(), entries, entryMeta),
      );
    }
    if (restartChapterBtn) {
      restartChapterBtn.addEventListener("click", () =>
        restartChapter(entries),
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
              Unable to load entry data from the server. Please refresh the page or contact support if the issue persists.
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
    initReaderAnalytics();
    // renderGallery(); // Loaded on open
    setInitialSubtitle();
    renderStatusPanel(statusMessage || "ready", statusTimerRef);
    initEmailSignupForm();

    const navigableEntries = getNavigableEntries();
    const availableEntries = navigableEntries.length
      ? navigableEntries
      : (entryOrder.length ? entryOrder : Object.keys(entries));

    if (!availableEntries.length) {
      if (el.chapter) el.chapter.innerHTML = "";
      const viewport = document.getElementById("viewport");
      if (viewport) {
        const message = premiumOnly
          ? `This series is premium-only. Sign in with a premium account to view ${getUnitLabels().plural.toLowerCase()}.`
          : `No ${getUnitLabels().plural.toLowerCase()} found for this series yet.`;
        viewport.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;gap:10px;">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:32px;color:var(--accent);letter-spacing:2px;">NO ${getUnitLabels().plural.toUpperCase()}</div>
            <div style="max-width:560px;line-height:1.6;opacity:0.95;">${message}</div>
          </div>
        `;
      }
      return;
    }
    const saved = loadProgress();
    if (saved && entries[saved.chapter]) {
      state.currentChapter = saved.chapter;
      state.pages = entries[saved.chapter];
      state.pageIndex = saved.page || 0;
    } else {
      const firstChapter = availableEntries[0];
      state.currentChapter = firstChapter;
      state.pages = entries[firstChapter] || [];
      state.pageIndex = 0;
    }
    state.entryMeta = entryMeta?.[state.currentChapter] || null;
    setActiveEntry();

    if (el.chapter) el.chapter.value = state.currentChapter;
    syncChapterSelectDisplay();
    window.dispatchEvent(
      new CustomEvent("chapterChanged", { detail: { chapter: state.currentChapter } }),
    );

    attachEventHandlers();
    render();

    logger.log("🎬 Battle Bros Reader initialized");
  }

  // ==================== START ====================

  async function start() {
    const seriesId = getActiveSeriesId();

    try {
      const data = await loadChapterData(seriesId);
      if (data) {
        entries = data.entries;
        entryOrder = data.entryOrder;
        statusMessage = data.statusMessage;
        entryMeta = data.entryMeta || {};
        entryLabels = Array.isArray(data.entryLabels) ? data.entryLabels : [];
        entryLabelsById = entryLabels.reduce((acc, label) => {
          if (label && label.id) acc[label.id] = label;
          return acc;
        }, {});
        premiumOnly = !!data.premiumOnly;
        unitLabelSingular = data.unitLabelSingular || "Entry";
        unitLabelPlural = data.unitLabelPlural || "Entries";
        applyUnitLabels();
        logger.log(`Entry data loaded for series: ${seriesId}`);
      }
    } catch (err) {
      handleDataLoadError(err);
      return;
    }

    const fullEntryOrder = Array.isArray(entryOrder) ? [...entryOrder] : [];
    const fullEntryMeta = entryMeta && typeof entryMeta === "object" ? entryMeta : {};

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

    updatePatronWelcome(sessionUser);

    const role = (sessionUser?.role || "").toString().toLowerCase();
    const isPremiumUser =
      role === "admin" || role === "premium" || !!sessionUser?.premiumActive;
    const adminNavLink = document.getElementById("adminNavLink");
    if (adminNavLink) {
      adminNavLink.style.display = role === "admin" ? "inline-flex" : "none";
    }
    let lockedEntries = [];
    if (!isPremiumUser) {
      if (premiumOnly) {
        lockedEntries = fullEntryOrder.length ? fullEntryOrder : Object.keys(entries);
      } else {
        lockedEntries = fullEntryOrder.filter((name) => fullEntryMeta?.[name]?.premium);
      }
    }

    if (premiumOnly && !isPremiumUser) {
      entries = {};
      entryOrder = [];
      statusMessage = "PREMIUM_ONLY";
    } else if (!isPremiumUser && entryMeta && typeof entryMeta === "object") {
      const filteredOrder = entryOrder.filter((name) => !(entryMeta[name]?.premium));
      const filteredEntries = {};
      filteredOrder.forEach((name) => {
        filteredEntries[name] = entries[name];
      });
      entries = filteredEntries;
      entryOrder = filteredOrder;
    }

    renderGallery(entryOrder, entries, {
      lockedEntries,
      entryMeta: fullEntryMeta,
      unitLabelSingular,
    });
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
    updatePatronWelcome(user);
  });

  window.addEventListener("chapterChanged", () => {
    syncChapterSelectDisplay();
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

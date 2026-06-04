// Reader bootstrap: loads data, binds UI, and wires view state.
import { state, loadProgress } from './state.js';
import { logger } from './logger.js';
import { throttle } from './utils.js';
import {
  loadEntryData,
  loadPageConfigWithFallback,
  loadLatestPost,
  applyBuilderPageToDOM,
} from './data.js';
import { el, initElements } from './dom.js';
import { renderStatusPanel, render } from './render.js';
import { initReaderAnalytics, setActiveEntry } from './analytics.js';
import { prevPage, nextPage, restartEntry, hideEndOfEntry } from './controls.js';
import { fitToScreen, zoomIn, zoomOut, resetView } from './transform.js';
import { initPointerHandlers } from './pointer.js';
import {
  toggleFullscreen,
  onFullscreenChange,
  showControlsBar,
  handleMouseEnterControls,
  handleMouseLeaveControls,
} from './fullscreen.js';
import {
  toggleShortcutsOverlay,
  closeShortcutsOverlay,
  goToNextEntry,
  changeEntry,
} from './overlays.js';

// Code splitting: lazy load heavier modules on demand.
let galleryModule = null;
let previewBridgeModule = null;

async function loadGalleryModule() {
  if (!galleryModule) {
    galleryModule = await import('./gallery.js');
  }
  return galleryModule;
}

async function loadPreviewBridgeModule() {
  if (!previewBridgeModule) {
    previewBridgeModule = await import('./preview-bridge.js');
  }
  return previewBridgeModule;
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

function emitPreviewMetrics(reason) {
  loadPreviewBridgeModule()
    .then((mod) => mod.emitPreviewMetrics?.(reason))
    .catch(() => {});
}
import { renderLatestUpdate } from './latest.js';
import { initRightPanelFeed } from './feed-panel.js';
import { initEmailSignupForm } from './email.js';
import {
  getActiveSeriesId,
  getExplicitPageSlug,
  getRequestedPageScope,
  isBuilderPreviewRequested,
  isDraftPageRequested,
} from './series.js';

(function () {
  'use strict';
  const READER_BOOT_CLASS = 'reader-bootstrap-loading';
  const READER_BOOT_TIMEOUT_KEY = '__bwReaderBootRelease';
  const READER_BOOT_STATE_KEY = '__BW_READER_BOOT__';

  function getReaderBootState() {
    const existing = window[READER_BOOT_STATE_KEY];
    if (existing) return existing;

    let resolvePageConfigReady;
    const pageConfigReady = new Promise((resolve) => {
      resolvePageConfigReady = resolve;
    });
    const state = {
      pageConfig: null,
      pageConfigReady,
      pageConfigResolved: false,
      resolvePageConfig(result) {
        if (state.pageConfigResolved) return;
        state.pageConfig = result || { source: 'none' };
        state.pageConfigResolved = true;
        resolvePageConfigReady(state.pageConfig);
      },
    };

    window[READER_BOOT_STATE_KEY] = state;
    return state;
  }

  const readerBootState = getReaderBootState();

  function releaseReaderBootstrap(pageSource = 'none') {
    const root = document.documentElement;
    root.classList.remove(READER_BOOT_CLASS);
    if (document.body) {
      document.body.dataset.readerPageSource = pageSource;
    }

    const timeoutId = window[READER_BOOT_TIMEOUT_KEY];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete window[READER_BOOT_TIMEOUT_KEY];
    }
  }

  // ==================== ENTRY HELPERS ====================

  // Helpers now live in reader/entries.js

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
    const label = document.getElementById('patronWelcome');
    if (!label) return;

    const role = (user?.role || '').toString().toLowerCase();
    const isPremium = role === 'admin' || role === 'premium' || !!user?.premiumActive;
    if (!isPremium) {
      label.classList.remove('is-visible');
      return;
    }

    label.textContent = 'WELCOME PATRON';
    label.classList.add('is-visible');
    if (patronWelcomeTimer) {
      window.clearTimeout(patronWelcomeTimer);
    }
    patronWelcomeTimer = window.setTimeout(() => {
      label.classList.remove('is-visible');
      patronWelcomeTimer = null;
    }, PATRON_WELCOME_DURATION_MS);
  }

  // ==================== ENTRY DATA ====================
  // Entry data is loaded dynamically from the series data endpoint
  let entries = {};
  let entryOrder = [];
  let statusMessage = '';
  let entryMeta = {};
  let entryLabels = [];
  let entryLabelsById = {};
  let premiumOnly = false;
  let unitLabelSingular = 'Entry';
  let unitLabelPlural = 'Entries';
  let entrySelectBound = false;
  let fullEntries = {};
  let fullEntryOrder = [];
  let fullEntryMeta = {};
  let fullStatusMessage = '';
  let fullPremiumOnly = false;
  let currentLockedEntries = [];

  function getUnitLabels() {
    const singular = String(unitLabelSingular || '').trim() || 'Entry';
    const plural = String(unitLabelPlural || '').trim() || `${singular}s`;
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
        singular: String(meta.entryLabelSingular || '').trim() || getUnitLabels().singular,
        plural: String(meta.entryLabelPlural || '').trim() || getUnitLabels().plural,
      };
    }
    return getUnitLabels();
  }

  function getEntryDisplayNumber(name) {
    const rawNumber = entryMeta?.[name]?.displayNumber;
    const parsed = Number.isFinite(rawNumber) ? rawNumber : parseInt(rawNumber, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function applyPremiumGating(user) {
    const role = (user?.role || '').toString().toLowerCase();
    const isPremiumUser = role === 'admin' || role === 'premium' || !!user?.premiumActive;
    const baseEntries = fullEntries && typeof fullEntries === 'object' ? fullEntries : {};
    const baseOrder =
      Array.isArray(fullEntryOrder) && fullEntryOrder.length
        ? fullEntryOrder
        : Object.keys(baseEntries);
    const baseMeta = fullEntryMeta && typeof fullEntryMeta === 'object' ? fullEntryMeta : {};
    let nextEntries = baseEntries;
    let nextOrder = baseOrder;
    const lockedEntries = [];

    statusMessage = fullStatusMessage;
    premiumOnly = fullPremiumOnly;

    if (!isPremiumUser) {
      if (premiumOnly) {
        lockedEntries.push(...baseOrder);
        nextEntries = {};
        nextOrder = [];
        statusMessage = 'PREMIUM_ONLY';
      } else {
        lockedEntries.push(...baseOrder.filter((name) => baseMeta?.[name]?.premium));
        nextOrder = baseOrder.filter((name) => !baseMeta?.[name]?.premium);
        nextEntries = {};
        nextOrder.forEach((name) => {
          nextEntries[name] = baseEntries[name];
        });
      }
    } else {
      nextEntries = { ...baseEntries };
      nextOrder = [...baseOrder];
    }

    entries = nextEntries;
    entryOrder = nextOrder;
    entryMeta = baseMeta;
    return { lockedEntries, isPremiumUser };
  }

  function refreshEntriesForSession(user) {
    const { lockedEntries } = applyPremiumGating(user);
    currentLockedEntries = lockedEntries;
    const current = state.currentEntry;
    const currentExists = current && entries[current];
    if (!currentExists) {
      const next = entryOrder.length ? entryOrder[0] : '';
      state.currentEntry = next;
      state.pageIndex = 0;
    }
    if (state.currentEntry && entries[state.currentEntry]) {
      state.pages = entries[state.currentEntry];
    } else {
      state.pages = [];
    }
    state.entryMeta = entryMeta?.[state.currentEntry] || null;
    setActiveEntry();
    if (el.entry) {
      initEntrySelect();
      if (state.currentEntry) {
        el.entry.value = state.currentEntry;
      }
      syncEntrySelectDisplay();
    }
    render();
    renderGallery(entryOrder, entries, {
      lockedEntries,
      entryMeta: fullEntryMeta,
      unitLabelSingular,
      seriesId: getActiveSeriesId(),
    });
  }

  function formatEntryLabel(name) {
    if (!name) return '';
    const displayNumber = getEntryDisplayNumber(name);
    const meta = entryMeta?.[name] || {};
    const entryLabel = getEntryLabelFor(name);
    const baseLabel =
      displayNumber == null ? name : `${entryLabel.singular} ${displayNumber} - ${name}`;
    const isComingSoon =
      !!meta.comingSoon || String(meta.status || '').toLowerCase() === 'scheduled';
    return isComingSoon ? `${baseLabel} (Coming Soon)` : baseLabel;
  }

  function formatEntryTrackingLabel(name) {
    const displayNumber = getEntryDisplayNumber(name);
    if (displayNumber == null) return '';
    const entryLabel = getEntryLabelFor(name);
    return `${entryLabel.singular} ${displayNumber}`;
  }

  function shouldShowInDropdown(name) {
    const meta = entryMeta?.[name] || {};
    if (meta.showInDropdown === false) return false;
    if (String(meta.releaseType || '').toLowerCase() === 'store' && !meta.storeUrl) return false;
    return true;
  }

  function isStoreEntry(name) {
    return String(entryMeta?.[name]?.releaseType || '').toLowerCase() === 'store';
  }

  function getNavigableEntries() {
    const names = entryOrder.length ? entryOrder : Object.keys(entries);
    return names.filter((name) => !isStoreEntry(name));
  }

  function applyUnitLabels() {
    const { singular, plural } = getUnitLabels();
    const singularUpper = singular.toUpperCase();
    const pluralUpper = plural.toUpperCase();

    const commentsTitle = document.querySelector('#comicCommentsSection .comments-title');
    if (commentsTitle) commentsTitle.textContent = `Discuss This ${singular}`;

    const endTitle = document.querySelector('#entryEndOverlay h2');
    if (endTitle) endTitle.textContent = `${singularUpper} COMPLETE`;

    const endBody = document.querySelector('#entryEndOverlay p');
    if (endBody) {
      endBody.textContent = `You've reached the end of this ${singular.toLowerCase()}! Ready for more?`;
    }

    const nextBtn = document.getElementById('nextEntryBtn');
    if (nextBtn) nextBtn.textContent = `Next ${singular}`;

    const restartBtn = document.getElementById('restartEntryBtn');
    if (restartBtn) restartBtn.textContent = `Restart ${singular}`;

    const galleryTitle = document.querySelector('#entryCoverGallery h2');
    if (galleryTitle) galleryTitle.textContent = 'COVER GALLERY';

    window.dispatchEvent(
      new CustomEvent('unitLabelChanged', {
        detail: { singular, plural, singularUpper, pluralUpper },
      })
    );
  }

  // ==================== PROGRESS PERSISTENCE ====================

  // ==================== PAGE NAVIGATION ====================

  // Navigation helpers are now in reader/controls.js

  // ==================== POINTER INTERACTIONS ====================
  // Moved to reader/pointer.js

  // ==================== ENTRY MANAGEMENT ====================

  function initEntrySelect() {
    if (!el.entry) return;

    const names = entryOrder.length ? entryOrder : Object.keys(entries);
    const dropdownNames = names.filter(shouldShowInDropdown);
    el.entry.innerHTML = '';

    dropdownNames.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      const displayNumber = getEntryDisplayNumber(name);
      if (displayNumber != null) {
        option.dataset.displayNumber = String(displayNumber);
        const trackingLabel = formatEntryTrackingLabel(name);
        if (trackingLabel) option.dataset.entryLabel = trackingLabel;
      }
      el.entry.appendChild(option);
    });

    buildEntrySelectMenu(dropdownNames);
    bindEntrySelectEvents();
    syncEntrySelectDisplay();
  }

  function getEntrySelectElements() {
    return {
      wrap: document.getElementById('entrySelect'),
      trigger: document.getElementById('entrySelectTrigger'),
      name: document.getElementById('entrySelectName'),
      patron: document.getElementById('entrySelectPatron'),
      menu: document.getElementById('entrySelectMenu'),
    };
  }

  function setEntryMenuOpen(isOpen) {
    const { trigger, menu } = getEntrySelectElements();
    if (!trigger || !menu) return;
    menu.classList.toggle('open', isOpen);
    trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  function buildEntrySelectMenu(names) {
    const { menu } = getEntrySelectElements();
    if (!menu) return;
    menu.innerHTML = '';

    names.forEach((name) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'entry-option';
      button.dataset.value = name;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', 'false');

      const label = document.createElement('span');
      label.className = 'entry-option-name';
      label.textContent = formatEntryLabel(name);
      button.appendChild(label);

      if (entryMeta?.[name]?.premium) {
        const patron = document.createElement('span');
        patron.className = 'entry-option-patron';
        patron.textContent = 'Patron';
        button.appendChild(patron);
      }

      button.addEventListener('click', () => {
        if (el.entry) {
          el.entry.value = name;
          el.entry.dispatchEvent(new Event('change', { bubbles: true }));
        }
        setEntryMenuOpen(false);
      });

      menu.appendChild(button);
    });

    // Append locked (premium) entries for non-premium users
    const locked = currentLockedEntries.filter(shouldShowInDropdown);
    locked.forEach((name) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'entry-option entry-option--locked';
      button.dataset.value = name;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', 'false');

      const label = document.createElement('span');
      label.className = 'entry-option-name';
      label.textContent = formatEntryLabel(name);
      button.appendChild(label);

      const patron = document.createElement('span');
      patron.className = 'entry-option-patron';
      patron.textContent = 'Patron';
      button.appendChild(patron);

      button.addEventListener('click', () => {
        setEntryMenuOpen(false);
        const commentsSection = document.getElementById('comicCommentsSection');
        const toggleBtn = document.getElementById('commentToggleBtn');
        if (commentsSection && commentsSection.classList.contains('collapsed') && toggleBtn) {
          toggleBtn.click();
        }
        if (commentsSection && typeof commentsSection.scrollIntoView === 'function') {
          commentsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });

      menu.appendChild(button);
    });
  }

  function syncEntrySelectDisplay() {
    const { name, patron, menu } = getEntrySelectElements();
    if (!name || !el.entry) return;
    const value = el.entry.value || '';
    name.textContent = value ? formatEntryLabel(value) : getUnitLabels().singular;
    const isPatron = !!entryMeta?.[value]?.premium;
    if (patron) {
      patron.style.display = isPatron ? 'inline-flex' : 'none';
    }
    if (menu) {
      menu.querySelectorAll('.entry-option').forEach((option) => {
        const selected = option.dataset.value === value;
        option.setAttribute('aria-selected', selected ? 'true' : 'false');
        option.classList.toggle('is-selected', selected);
      });
    }
  }

  function bindEntrySelectEvents() {
    if (entrySelectBound) return;
    const { wrap, trigger, menu } = getEntrySelectElements();
    if (!wrap || !trigger || !menu) return;

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      setEntryMenuOpen(!menu.classList.contains('open'));
    });

    menu.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    document.addEventListener('click', (event) => {
      if (!wrap.contains(event.target)) {
        setEntryMenuOpen(false);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setEntryMenuOpen(false);
      }
    });

    entrySelectBound = true;
  }

  // ==================== COVER GALLERY ====================

  // Gallery helpers moved to reader/gallery.js
  // ==================== EVENT HANDLERS ====================

  async function getGifLoopDuration(src) {
    try {
      const res = await fetch(src, { cache: 'force-cache' });
      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      const data = new Uint8Array(buffer);
      if (data.length < 13) return null;
      const header = String.fromCharCode(data[0], data[1], data[2]);
      if (header !== 'GIF') return null;

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
    } catch {
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
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(loader, 0, 0, width, height);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };
      loader.onerror = () => resolve(null);
      loader.src = src;
    });
  }

  async function initBookTurnGif(img) {
    const gifSrc = img.getAttribute('src');
    if (!gifSrc) return;

    const [loopDuration, staticSrc] = await Promise.all([
      getGifLoopDuration(gifSrc),
      captureStaticFrame(img, gifSrc),
    ]);
    const durationMs = loopDuration || 2000;
    const stillSrc = staticSrc || '';
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

    img.addEventListener('mouseenter', () => {
      if (!isPlaying) playLoops(3);
    });
  }

  function attachEventHandlers(options = {}) {
    const previewMode = !!options.previewMode;
    if (previewMode) {
      document.addEventListener(
        'click',
        (event) => {
          const link = event.target?.closest?.('a[href]');
          if (!link) return;
          event.preventDefault();
          event.stopPropagation();
        },
        true
      );
    }

    // Book turn promo click handler
    const bookTurnPromo = document.getElementById('bookTurnPromo');
    if (bookTurnPromo) {
      bookTurnPromo.addEventListener('click', (event) => {
        if (previewMode) {
          event.preventDefault();
          return;
        }
        window.open(
          'https://bwondercomics.bigcartel.com/product/battle-bros-volume-1',
          '_blank',
          'noopener,noreferrer'
        );
      });
      initBookTurnGif(bookTurnPromo);
    }
    initRightPanelFeed();

    // Navigation buttons
    if (el.prevBtn) el.prevBtn.addEventListener('click', prevPage);
    if (el.nextBtn) el.nextBtn.addEventListener('click', nextPage);

    // Zoom and view buttons
    if (el.zoomIn) el.zoomIn.addEventListener('click', zoomIn);
    if (el.zoomOut) el.zoomOut.addEventListener('click', zoomOut);
    if (el.fitBtn) el.fitBtn.addEventListener('click', fitToScreen);
    if (el.fullscreenBtn && !previewMode) {
      el.fullscreenBtn.addEventListener('click', toggleFullscreen);
    }

    // Help button
    const helpBtn = document.getElementById('helpBtn');
    if (helpBtn) helpBtn.addEventListener('click', toggleShortcutsOverlay);
    attachGalleryButton();

    if (el.edgeLeftBtn) {
      el.edgeLeftBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        prevPage();
      });
    }
    if (el.edgeRightBtn) {
      el.edgeRightBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        nextPage();
      });
    }

    initPointerHandlers();

    document.addEventListener('keydown', (e) => {
      // Don't interfere if user is typing in an input
      if (e.target.matches('input, textarea, select')) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          prevPage();
          break;
        case 'ArrowRight':
          e.preventDefault();
          nextPage();
          break;
        case '+':
        case '=':
          e.preventDefault();
          zoomIn();
          break;
        case '-':
          e.preventDefault();
          zoomOut();
          break;
        case '0':
          e.preventDefault();
          resetView();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          if (!previewMode) toggleFullscreen();
          break;
        case '?':
          e.preventDefault();
          toggleShortcutsOverlay();
          break;
        case 'Escape':
          e.preventDefault();
          closeShortcutsOverlay();
          hideEndOfEntry();
          if (!previewMode && document.fullscreenElement) {
            document.exitFullscreen();
          }
          break;
      }
    });

    if (!previewMode) {
      document.addEventListener('fullscreenchange', onFullscreenChange);
    }

    // Throttle fullscreen edge detection to reduce overhead (100ms = 10fps max)
    if (!previewMode) {
      document.addEventListener(
        'mousemove',
        throttle((e) => {
          if (document.fullscreenElement) {
            const vh = window.innerHeight;
            // Use percentage-based thresholds for better scaling on small screens
            const topThreshold = Math.min(150, vh * 0.15);
            const bottomThreshold = Math.min(200, vh * 0.2);
            const nearEdge = e.clientY < topThreshold || e.clientY > vh - bottomThreshold;
            if (nearEdge) showControlsBar();
          }
        }, 100)
      );
    }

    if (el.topbar && !previewMode) {
      el.topbar.addEventListener('mouseenter', handleMouseEnterControls);
      el.topbar.addEventListener('mouseleave', handleMouseLeaveControls);
    }

    if (el.controls && !previewMode) {
      el.controls.addEventListener('mouseenter', handleMouseEnterControls);
      el.controls.addEventListener('mouseleave', handleMouseLeaveControls);
    }

    if (el.entry) {
      el.entry.addEventListener('change', (e) => {
        const nextName = e.target.value;
        const meta = entryMeta?.[nextName] || {};
        if (String(meta.releaseType || '').toLowerCase() === 'store' && meta.storeUrl) {
          if (previewMode) {
            el.entry.value = state.currentEntry;
            syncEntrySelectDisplay();
            return;
          }
          window.open(meta.storeUrl, '_blank', 'noopener,noreferrer');
          el.entry.value = state.currentEntry;
          syncEntrySelectDisplay();
          return;
        }
        changeEntry(nextName, entries, entryMeta);
      });
    }

    // Handle window resize and orientation changes
    let resizeTimeout;
    window.addEventListener('resize', () => {
      // Debounce resize events to avoid excessive re-renders
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        render();
        if (previewMode) emitPreviewMetrics('resize');
      }, 150);
    });

    // Shortcuts overlay buttons
    const shortcutsClose = document.getElementById('shortcutsClose');
    if (shortcutsClose) {
      shortcutsClose.addEventListener('click', closeShortcutsOverlay);
    }

    // End of chapter overlay buttons
    const nextEntryBtn = document.getElementById('nextEntryBtn');
    const restartEntryBtn = document.getElementById('restartEntryBtn');
    const closeEndOverlay = document.getElementById('closeEndOverlay');

    if (nextEntryBtn) {
      nextEntryBtn.addEventListener('click', () =>
        goToNextEntry(getNavigableEntries(), entries, entryMeta)
      );
    }
    if (restartEntryBtn) {
      restartEntryBtn.addEventListener('click', () => restartEntry(entries));
    }
    if (closeEndOverlay) {
      closeEndOverlay.addEventListener('click', hideEndOfEntry);
    }
  }

  // ==================== QUOTE RANDOMIZER ====================

  function setInitialSubtitle() {
    if (!el.subtitle) return;
    if (!SUBTITLES.length) {
      el.subtitle.textContent = '';
      return;
    }
    const idx = Math.floor(Math.random() * SUBTITLES.length);
    el.subtitle.textContent = SUBTITLES[idx];
  }

  // ==================== SHORTCUTS OVERLAY ====================

  // ==================== LATEST UPDATE WIDGET ====================

  async function loadLatestUpdate() {
    const body = document.getElementById('latestBody');
    if (!body) return;

    const latest = await loadLatestPost();
    if (!latest) return;
    renderLatestUpdate(latest);
  }

  // ==================== LOAD ENTRY DATA ====================

  // ==================== DATA LOADERS ====================

  const statusTimerRef = { current: null };

  function handleDataLoadError(error) {
    const viewport = document.getElementById('viewport');
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
    readerBootState.resolvePageConfig({ source: 'error' });
    releaseReaderBootstrap('error');
  }

  function handlePreviewLoadError(error) {
    const viewport = document.getElementById('viewport');
    if (viewport) {
      viewport.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;gap:12px;">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:32px;color:var(--danger);letter-spacing:2px;">PREVIEW UNAVAILABLE</div>
            <div style="max-width:560px;line-height:1.6;opacity:0.95;">The builder preview snapshot could not be loaded.</div>
            <div style="font-size:14px;color:rgba(255,255,255,0.65);font-family:monospace;">${error?.message || 'Unknown preview error'}</div>
          </div>
        `;
    }
    readerBootState.resolvePageConfig({ source: 'error', previewMode: true });
    releaseReaderBootstrap('error');
  }

  // ==================== INITIALIZATION ====================

  function init(pageSource = 'none', options = {}) {
    const previewMode = !!options.previewMode;
    initElements();
    initEntrySelect();
    if (!previewMode) {
      initReaderAnalytics();
    }
    // renderGallery(); // Loaded on open
    setInitialSubtitle();
    renderStatusPanel(statusMessage || 'ready', statusTimerRef);
    initEmailSignupForm({ previewMode });

    const navigableEntries = getNavigableEntries();
    const availableEntries = navigableEntries.length
      ? navigableEntries
      : entryOrder.length
        ? entryOrder
        : Object.keys(entries);

    if (!availableEntries.length) {
      if (el.entry) el.entry.innerHTML = '';
      const viewport = document.getElementById('viewport');
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
      releaseReaderBootstrap(pageSource);
      return;
    }
    const saved = loadProgress();
    if (saved && entries[saved.chapter]) {
      state.currentEntry = saved.chapter;
      state.pages = entries[saved.chapter];
      state.pageIndex = saved.page || 0;
    } else {
      const firstEntry = availableEntries[0];
      state.currentEntry = firstEntry;
      state.pages = entries[firstEntry] || [];
      state.pageIndex = 0;
    }
    state.entryMeta = entryMeta?.[state.currentEntry] || null;
    setActiveEntry();

    if (el.entry) el.entry.value = state.currentEntry;
    syncEntrySelectDisplay();
    window.dispatchEvent(
      new CustomEvent('entryChanged', { detail: { chapter: state.currentEntry } })
    );

    attachEventHandlers({ previewMode });
    render();
    releaseReaderBootstrap(pageSource);

    logger.log('🎬 Battle Bros Reader initialized');
  }

  // ==================== START ====================

  async function start() {
    const seriesId = getActiveSeriesId();
    const explicitPageSlug = getExplicitPageSlug();
    const pageScope = getRequestedPageScope();
    const previewMode = isBuilderPreviewRequested();

    try {
      const data = await loadEntryData(seriesId);
      if (data) {
        entries = data.entries;
        entryOrder = data.entryOrder;
        statusMessage = data.statusMessage;
        entryMeta = data.entryMeta || {};
        fullEntries = entries && typeof entries === 'object' ? entries : {};
        fullEntryOrder = Array.isArray(entryOrder) ? [...entryOrder] : [];
        fullEntryMeta = entryMeta && typeof entryMeta === 'object' ? entryMeta : {};
        fullStatusMessage = statusMessage;
        fullPremiumOnly = !!data.premiumOnly;
        entryLabels = Array.isArray(data.entryLabels) ? data.entryLabels : [];
        entryLabelsById = entryLabels.reduce((acc, label) => {
          if (label && label.id) acc[label.id] = label;
          return acc;
        }, {});
        premiumOnly = fullPremiumOnly;
        unitLabelSingular = data.unitLabelSingular || 'Entry';
        unitLabelPlural = data.unitLabelPlural || 'Entries';
        applyUnitLabels();
        logger.log(`Entry data loaded for series: ${seriesId}`);
      }
    } catch (err) {
      handleDataLoadError(err);
      return;
    }

    // Apply premium gating (client-side UX; server enforces for protected folders too)
    let sessionUser = null;
    try {
      const res = await fetch('/api/session', { cache: 'no-store', credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        sessionUser = data.user || null;
      }
    } catch {
      sessionUser = null;
    }

    updatePatronWelcome(sessionUser);

    const role = (sessionUser?.role || '').toString().toLowerCase();
    const { lockedEntries } = applyPremiumGating(sessionUser);
    currentLockedEntries = lockedEntries;
    const adminNavLink = document.getElementById('adminNavLink');
    if (adminNavLink) {
      adminNavLink.style.display = role === 'admin' ? 'inline-flex' : 'none';
    }

    renderGallery(entryOrder, entries, {
      lockedEntries,
      entryMeta: fullEntryMeta,
      unitLabelSingular,
      seriesId,
    });
    if (previewMode) {
      try {
        const previewBridge = await loadPreviewBridgeModule();
        const pageResult = await previewBridge.requestPreviewSnapshot({
          seriesId,
          pageSlug: explicitPageSlug || 'reader',
        });
        readerBootState.resolvePageConfig(pageResult);
        loadLatestUpdate();
        init(pageResult.source, { previewMode: true });
        applyBuilderPageToDOM(pageResult.page, {
          seriesId,
          previewMode: true,
          builderEditing: pageResult.builderEditing === true,
          deviceId: pageResult.deviceId || pageResult.snapshot?.options?.deviceId,
        });
        previewBridge.setPreviewMetricsContext?.(pageResult.snapshot, {
          seriesId,
          pageId: pageResult.snapshot?.pageId,
          pageSlug: pageResult.snapshot?.pageSlug || explicitPageSlug || 'reader',
        });
        previewBridge.emitPreviewMetrics?.('snapshot-applied');
        previewBridge.startPreviewTargetBridge?.(pageResult.snapshot, {
          seriesId,
          pageId: pageResult.snapshot?.pageId,
          pageSlug: pageResult.snapshot?.pageSlug || explicitPageSlug || 'reader',
        });
        previewBridge.subscribePreviewSnapshots?.(
          (nextPageResult) => {
            applyBuilderPageToDOM(nextPageResult.page, {
              seriesId,
              previewMode: true,
              builderEditing: nextPageResult.builderEditing === true,
              deviceId: nextPageResult.deviceId || nextPageResult.snapshot?.options?.deviceId,
            });
            previewBridge.emitPreviewMetrics?.('snapshot-updated');
            if (nextPageResult.builderEditing === true) {
              previewBridge.startPreviewTargetBridge?.(nextPageResult.snapshot, {
                seriesId,
                pageId: nextPageResult.snapshot?.pageId,
                pageSlug: nextPageResult.snapshot?.pageSlug || explicitPageSlug || 'reader',
              });
            } else {
              previewBridge.stopPreviewTargetBridge?.();
            }
          },
          {
            seriesId,
            pageId: pageResult.snapshot?.pageId,
            pageSlug: pageResult.snapshot?.pageSlug || explicitPageSlug || 'reader',
          }
        );
      } catch (err) {
        handlePreviewLoadError(err);
      }
      return;
    }

    const pageResult = await loadPageConfigWithFallback(setSubtitles, seriesId, {
      pageSlug: explicitPageSlug,
      pageScope,
      draft: role === 'admin' && isDraftPageRequested(),
    });
    readerBootState.resolvePageConfig(pageResult);
    loadLatestUpdate();
    init(pageResult.source);
    if (pageResult.source === 'builder' && pageResult.page) {
      // Let reader bootstrap finish first, then reapply builder DOM as the final state.
      applyBuilderPageToDOM(pageResult.page, {
        seriesId,
      });
    }
  }

  window.addEventListener('bbSessionChanged', (event) => {
    const user = event?.detail?.user || null;
    const role = (user?.role || '').toString().toLowerCase();
    const adminNavLink = document.getElementById('adminNavLink');
    if (adminNavLink) {
      adminNavLink.style.display = role === 'admin' ? 'inline-flex' : 'none';
    }
    updatePatronWelcome(user);
    refreshEntriesForSession(user);
  });

  window.addEventListener('entryChanged', () => {
    syncEntrySelectDisplay();
  });

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(start, 0);
  } else {
    document.addEventListener('DOMContentLoaded', start);
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

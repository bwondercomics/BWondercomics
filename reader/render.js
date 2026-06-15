/**
 * Rendering and image management for the Battle Bros comic reader
 * Handles page rendering, image preloading/caching, and UI updates
 */

import { CONFIG } from './config.js';
import { state } from './state.js';
import { el } from './dom.js';
import { markEntryComplete, trackVisiblePages } from './analytics.js';
import { clearOnPageFrame, fitOnPageFrame } from './transform.js';
import { isVerticalMode } from './display-mode.js';
import { renderVertical, teardownVerticalMode } from './vertical.js';

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function getEmptyEntryMessage() {
  const meta = state.entryMeta || {};
  const status = String(meta.status || '').toLowerCase();
  const comingSoon = !!meta.comingSoon || status === 'scheduled';
  const publishAt = formatDateTime(meta.publishAt);
  if (comingSoon) {
    return {
      title: 'COMING SOON',
      detail: publishAt ? `Scheduled for ${publishAt}` : 'Scheduled for a future release.',
    };
  }
  return {
    title: 'NO PAGES YET',
    detail: 'This entry is not available right now.',
  };
}

function ensureEmptyStateContainer() {
  if (!el.viewport) return null;
  let container = document.getElementById('entryEmptyState');
  if (!container) {
    container = document.createElement('div');
    container.id = 'entryEmptyState';
    container.style.cssText = [
      'position: absolute',
      'inset: 0',
      'display: none',
      'align-items: center',
      'justify-content: center',
      'text-align: center',
      'padding: 24px',
      'background: rgba(10, 10, 18, 0.85)',
      'color: var(--text)',
      'z-index: 5',
    ].join('; ');
    el.viewport.appendChild(container);
  }
  return container;
}

export function showEmptyEntryState() {
  const container = ensureEmptyStateContainer();
  if (!container) return;
  const { title, detail } = getEmptyEntryMessage();
  container.innerHTML = `
    <div style="max-width: 520px;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:32px;color:var(--accent);letter-spacing:2px;">${title}</div>
      <div style="margin-top:8px;line-height:1.6;opacity:0.9;">${detail}</div>
    </div>
  `;
  container.style.display = 'flex';
  if (el.stageWrap) el.stageWrap.style.display = 'none';
}

export function hideEmptyEntryState() {
  const container = document.getElementById('entryEmptyState');
  if (container) container.style.display = 'none';
  // Vertical mode keeps the paged stage hidden and renders into its own strip,
  // so only restore the paged stage when paged mode is active.
  if (el.stageWrap && !isVerticalMode()) el.stageWrap.style.display = '';
}

function rememberPageMetric(url, imgEl) {
  if (!url || !imgEl?.naturalWidth || !imgEl?.naturalHeight) return null;
  const metric = {
    width: imgEl.naturalWidth,
    height: imgEl.naturalHeight,
  };
  state.pageMetrics.set(url, metric);
  return metric;
}

/**
 * Renders the status panel with a typewriter animation effect
 * @param {string} message - Status message to display
 * @param {Object} statusTimerRef - Reference object containing the timeout ID for cleanup
 */
export function renderStatusPanel(message, statusTimerRef) {
  const statusMessage = message || '';
  if (!el.statusText) return;
  el.statusText.textContent = '';
  if (statusTimerRef.current) {
    clearTimeout(statusTimerRef.current);
    statusTimerRef.current = null;
  }

  const text = statusMessage || 'ready';
  let i = 0;
  const step = () => {
    if (i <= text.length) {
      // Use substring instead of += to avoid O(n²) string concatenation
      el.statusText.textContent = text.substring(0, i);
      i++;
      if (i <= text.length) {
        statusTimerRef.current = setTimeout(step, 35);
      }
    }
  };
  step();
}

/**
 * Preloads an image and caches it in memory
 * Uses a FIFO cache with a maximum size defined in CONFIG.IMAGE_CACHE_SIZE
 * @param {string} url - Image URL to preload
 * @returns {Promise<HTMLImageElement>} Promise that resolves with the loaded image element
 */
export function preloadImage(url) {
  if (!url) return Promise.reject('no-url');
  if (state.imageCache.has(url)) return state.imageCache.get(url);

  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      rememberPageMetric(url, img);
      resolve(img);
    };
    img.onerror = () => {
      state.imageCache.delete(url);
      reject(new Error('Image load failed: ' + url));
    };
    img.src = url;
  });

  state.imageCache.set(url, promise);

  if (state.imageCache.size > CONFIG.IMAGE_CACHE_SIZE) {
    const firstKey = state.imageCache.keys().next().value;
    state.imageCache.delete(firstKey);
  }

  return promise;
}

/**
 * Loads an image into an img element and manages loading spinner
 * @param {HTMLImageElement} imgEl - Image element to load into
 * @param {HTMLElement} spinnerEl - Loading spinner element to show/hide
 * @param {string} url - Image URL to load
 */
export function loadImage(imgEl, spinnerEl, url) {
  if (!imgEl) return;

  if (!url) {
    if (imgEl.dataset) imgEl.dataset.pageUrl = '';
    imgEl.removeAttribute('src');
    imgEl.alt = '';
    if (spinnerEl) spinnerEl.style.display = 'none';
    return;
  }

  if (spinnerEl) spinnerEl.style.display = '';

  const settleImageLoad = (loaded) => {
    if (spinnerEl) spinnerEl.style.display = 'none';
    imgEl.removeEventListener('load', handleLoad);
    imgEl.removeEventListener('error', handleError);
    if (loaded && imgEl.dataset?.pageUrl === url) {
      rememberPageMetric(url, imgEl);
    }
    if (imgEl.dataset?.pageUrl === url) fitOnPageFrame();
  };

  const handleLoad = () => settleImageLoad(true);
  const handleError = () => settleImageLoad(false);

  imgEl.addEventListener('load', handleLoad);
  imgEl.addEventListener('error', handleError);

  const pageNum = state.pages.indexOf(url) + 1;
  imgEl.alt = `${state.currentEntry} - page ${pageNum}`;
  if (imgEl.dataset) imgEl.dataset.pageUrl = url;

  // Performance: Add lazy loading and async decoding
  imgEl.loading = 'eager'; // Eager loading for comic pages (user is actively reading)
  imgEl.decoding = 'async'; // Async decoding prevents blocking the main thread

  imgEl.src = url;

  preloadImage(url).catch(() => {});
}

/**
 * Preloads upcoming pages for smoother navigation
 * Preloads up to CONFIG.PRELOAD_AHEAD pages ahead of current position
 */
export function preloadUpcoming() {
  const startIdx = state.pageIndex + 2;
  const endIdx = Math.min(state.pages.length, startIdx + CONFIG.PRELOAD_AHEAD);

  for (let i = startIdx; i < endIdx; i++) {
    preloadImage(state.pages[i]).catch(() => {});
  }
}

/**
 * Determines if the viewport is suitable for two-page spread mode
 * Two-page mode requires both sufficient width AND aspect ratio
 * @returns {boolean} True if viewport can display two pages side-by-side
 */
export function isTwoPageMode() {
  const aspectRatio = window.innerWidth / window.innerHeight;
  const hasMinWidth = window.innerWidth >= CONFIG.TWO_PAGE_BREAKPOINT;
  const isWideEnough = aspectRatio > CONFIG.TWO_PAGE_ASPECT_RATIO;
  return hasMinWidth && isWideEnough;
}

/**
 * Checks if two pages can be displayed (viewport is wide enough AND there's a next page)
 * @returns {boolean} True if two-page mode is active and there's a page to show on the right
 */
export function canShowTwoPages() {
  return isTwoPageMode() && state.pageIndex + 1 < state.pages.length;
}

/**
 * Main render function - updates the viewport with current page(s)
 * Handles both single-page and two-page spread modes
 * Triggers page transition animation and preloads upcoming pages
 */
export function render() {
  if (isVerticalMode()) {
    renderVertical();
    return;
  }

  // Paged mode: ensure any vertical strip is torn down and the static stage is
  // restored before rendering into the cached paged nodes.
  teardownVerticalMode();

  if (!state.pages.length) {
    state.isTransitioning = false;
    if (el.stage) el.stage.classList.remove('transitioning');
    clearOnPageFrame();
    showEmptyEntryState();
    updateUI();
    return;
  }

  hideEmptyEntryState();
  state.isTransitioning = true;
  if (el.stage) el.stage.classList.add('transitioning');
  setTimeout(() => {
    if (el.stage) el.stage.classList.remove('transitioning');
    state.isTransitioning = false;
  }, CONFIG.ANIMATION_DURATION);

  const twoPageMode = canShowTwoPages();
  const leftUrl = state.pages[state.pageIndex] || '';
  const rightUrl = state.pages[state.pageIndex + 1] || '';

  if (!twoPageMode) {
    if (el.rightPage) el.rightPage.style.display = 'none';
    loadImage(el.leftImg, el.leftSpinner, leftUrl);
  } else {
    if (el.rightPage) el.rightPage.style.display = '';
    loadImage(el.leftImg, el.leftSpinner, leftUrl);
    loadImage(el.rightImg, el.rightSpinner, rightUrl);
  }

  fitOnPageFrame();
  updateUI();
  preloadUpcoming();
  trackVisiblePages();
}

/**
 * Updates UI elements (page indicator, progress bar, navigation buttons)
 * Called after rendering to reflect current state
 */
export function updateUI() {
  if (!state.pages.length) {
    if (el.indicator) {
      const meta = state.entryMeta || {};
      const status = String(meta.status || '').toLowerCase();
      el.indicator.textContent =
        status === 'scheduled' || meta.comingSoon ? 'COMING SOON' : 'NO PAGES';
    }
    if (el.progressFill) el.progressFill.style.width = '0%';
    if (el.prevBtn) el.prevBtn.disabled = true;
    if (el.nextBtn) el.nextBtn.disabled = true;
    return;
  }

  const total = state.pages.length || 1;
  const current = state.pageIndex + 1;

  // In vertical mode the prev/next buttons navigate entries (not pages), so their
  // disabled state tracks the entry selector position instead of the page index.
  if (isVerticalMode()) {
    if (el.indicator) el.indicator.textContent = `PAGE ${current} / ${total}`;
    if (el.progressFill) el.progressFill.style.width = (current / total) * 100 + '%';
    const entrySelect = el.entry;
    const entryIndex = entrySelect ? entrySelect.selectedIndex : -1;
    const entryCount = entrySelect ? entrySelect.options.length : 0;
    if (el.prevBtn) el.prevBtn.disabled = entryIndex <= 0;
    if (el.nextBtn) el.nextBtn.disabled = entryIndex < 0 || entryIndex >= entryCount - 1;
    return;
  }

  const twoPageMode = canShowTwoPages();

  if (el.indicator) {
    el.indicator.textContent = twoPageMode
      ? `PAGE ${current}-${Math.min(current + 1, total)} / ${total}`
      : `PAGE ${current} / ${total}`;
  }

  if (el.progressFill) {
    const displayed = Math.min(total, state.pageIndex + (twoPageMode ? 2 : 1));
    el.progressFill.style.width = (displayed / total) * 100 + '%';
  }

  if (el.prevBtn) {
    el.prevBtn.disabled = state.pageIndex === 0;
  }

  if (el.nextBtn) {
    const isAtEnd = state.pageIndex >= total - 1;
    const rightIsLast = twoPageMode && state.pageIndex + 1 === total - 1;
    el.nextBtn.disabled = isAtEnd || rightIsLast;
  }

  const finished =
    state.pageIndex >= total - 1 || (twoPageMode && state.pageIndex + 1 >= total - 1);
  if (finished) markEntryComplete();
}

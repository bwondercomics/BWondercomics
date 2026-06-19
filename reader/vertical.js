/**
 * Vertical (Webtoon-style) reader display mode.
 *
 * Renders every page of the current entry into a dedicated `#verticalStrip`
 * container inside `#viewport`, stacked vertically, and derives `state.pageIndex`
 * from scroll position via an IntersectionObserver. The paged static nodes
 * (`#stageWrap`, `el.leftPage`, ...) are never destroyed — they are only hidden —
 * so switching back to paged mode (e.g. a builder preview snapshot) repaints
 * cleanly into the cached nodes.
 */

import { state, saveProgress } from './state.js';
import { el, h } from './dom.js';
import { markEntryComplete, trackVisiblePages } from './analytics.js';
import { showEmptyEntryState, hideEmptyEntryState, updateUI } from './render.js';

const STRIP_ID = 'verticalStrip';
const SCROLL_SAVE_THROTTLE = 400;

let cleanupFn = null;
let restoreState = null;
let lastIndex = -1;
let renderedEntryKey = null;

function getViewport() {
  return el.viewport || document.getElementById('viewport');
}

function ensureVerticalStrip() {
  const viewport = getViewport();
  if (!viewport) return null;
  let strip = document.getElementById(STRIP_ID);
  if (!strip) {
    strip = h('div', { class: 'verticalStrip', id: STRIP_ID });
    viewport.appendChild(strip);
  }
  return strip;
}

function removeVerticalStrip() {
  const strip = document.getElementById(STRIP_ID);
  if (strip && strip.parentNode) strip.parentNode.removeChild(strip);
}

function buildStrip(strip) {
  strip.innerHTML = '';
  const frag = document.createDocumentFragment();
  state.pages.forEach((url, index) => {
    const img = h('img', {
      class: 'verticalPage-img',
      src: url,
      alt: `${state.currentEntry} - page ${index + 1}`,
      draggable: 'false',
      loading: 'lazy',
      decoding: 'async',
    });
    img.addEventListener('load', onImageSettled, { once: true });
    img.addEventListener('error', onImageSettled, { once: true });
    const page = h('div', { class: 'page verticalPage', dataset: { pageIndex: String(index) } }, [
      img,
    ]);
    frag.appendChild(page);
  });
  strip.appendChild(frag);
  return state.pages.length;
}

function onImageSettled() {
  if (restoreState) {
    restoreState.pendingImages = Math.max(0, restoreState.pendingImages - 1);
  }
  // Re-apply scroll restoration as images load/error and change the scroll height.
  applyScrollRestore();
  finishScrollRestoreIfReady();
}

function getScrollableHeight(viewport) {
  return Math.max(0, viewport.scrollHeight - viewport.clientHeight);
}

function getCurrentEntryKey() {
  return String(state.currentEntry || '');
}

function clearScrollRestore() {
  restoreState = null;
}

function finishScrollRestoreIfReady() {
  if (!restoreState?.applied) return;
  if (restoreState.pendingImages <= 0) {
    clearScrollRestore();
  }
}

function applyScrollRestore() {
  if (!restoreState || restoreState.cancelled) return false;
  const viewport = getViewport();
  if (!viewport) return false;
  const denom = getScrollableHeight(viewport);
  if (denom <= 0) return false;
  const nextTop = Math.round(restoreState.ratio * denom);
  restoreState.programmaticScrolls += 1;
  restoreState.lastProgrammaticTop = nextTop;
  viewport.scrollTop = nextTop;
  restoreState.applied = true;
  return true;
}

function handleRestoreScrollEvent(viewport) {
  if (!restoreState || restoreState.cancelled) return;
  if (
    restoreState.programmaticScrolls > 0 &&
    Math.abs(viewport.scrollTop - restoreState.lastProgrammaticTop) <= 1
  ) {
    restoreState.programmaticScrolls -= 1;
    return;
  }
  restoreState.cancelled = true;
  clearScrollRestore();
}

function prepareRestoreForRender(imageCount) {
  if (!restoreState) return false;
  if (restoreState.entryKey && restoreState.entryKey !== getCurrentEntryKey()) {
    clearScrollRestore();
    return false;
  }
  restoreState.pendingImages = Math.max(0, imageCount);
  restoreState.applied = false;
  restoreState.cancelled = false;
  restoreState.programmaticScrolls = 0;
  restoreState.lastProgrammaticTop = null;
  return true;
}

function clearRestoreForDifferentEntry() {
  if (restoreState?.entryKey && restoreState.entryKey !== getCurrentEntryKey()) {
    clearScrollRestore();
  }
}

function scheduleInitialRestore() {
  if (!restoreState) return;
  requestAnimationFrame(() => {
    applyScrollRestore();
    requestAnimationFrame(() => {
      applyScrollRestore();
      finishScrollRestoreIfReady();
    });
  });
}

/**
 * Queues a scroll-position restore (0-1 ratio) applied once the strip is built
 * and images have grown the scroll height. Falls back to the saved page anchor.
 */
export function setVerticalScrollRestore(saved) {
  if (!saved) {
    clearScrollRestore();
    return;
  }
  let ratio = null;
  if (typeof saved.scrollRatio === 'number' && Number.isFinite(saved.scrollRatio)) {
    ratio = saved.scrollRatio;
  } else if (typeof saved.page === 'number' && state.pages.length > 1) {
    ratio = saved.page / (state.pages.length - 1);
  }
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) {
    clearScrollRestore();
    return;
  }
  restoreState = {
    ratio: Math.min(1, Math.max(0, ratio)),
    entryKey: String(saved.chapter || state.currentEntry || ''),
    pendingImages: 0,
    applied: false,
    cancelled: false,
    programmaticScrolls: 0,
    lastProgrammaticTop: null,
  };
}

function computeCenterIndex(viewport) {
  const strip = document.getElementById(STRIP_ID);
  if (!strip) return state.pageIndex;
  const centerY = viewport.scrollTop + viewport.clientHeight / 2;
  let best = 0;
  const children = strip.children;
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    const top = node.offsetTop;
    const bottom = top + node.offsetHeight;
    if (centerY >= top && centerY < bottom) return i;
    if (top <= centerY) best = i;
  }
  return best;
}

function setActivePage(index) {
  const total = state.pages.length;
  if (!total) return;
  const clamped = Math.min(total - 1, Math.max(0, index));
  if (clamped === lastIndex) return;
  lastIndex = clamped;
  state.pageIndex = clamped;
  updateUI();
  trackVisiblePages();
  if (clamped >= total - 1) markEntryComplete();
}

function initVerticalObserver() {
  const viewport = getViewport();
  const strip = document.getElementById(STRIP_ID);
  if (!viewport || !strip) return () => {};

  let rafId = null;
  const onScroll = () => {
    handleRestoreScrollEvent(viewport);
    if (rafId != null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      setActivePage(computeCenterIndex(viewport));
    });
  };

  const observer = new IntersectionObserver(
    () => {
      // Use the actual scroll geometry to pick the center page; the observer just
      // wakes us when visibility changes so we recompute without polling.
      setActivePage(computeCenterIndex(viewport));
    },
    { root: viewport, threshold: [0, 0.25, 0.5, 0.75, 1] }
  );
  Array.from(strip.children).forEach((node) => observer.observe(node));

  let saveTimer = null;
  const onScrollSave = () => {
    if (saveTimer != null) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveProgress(state);
    }, SCROLL_SAVE_THROTTLE);
  };

  viewport.addEventListener('scroll', onScroll, { passive: true });
  viewport.addEventListener('scroll', onScrollSave, { passive: true });

  return () => {
    observer.disconnect();
    viewport.removeEventListener('scroll', onScroll);
    viewport.removeEventListener('scroll', onScrollSave);
    if (rafId != null) cancelAnimationFrame(rafId);
    if (saveTimer != null) clearTimeout(saveTimer);
  };
}

/**
 * Renders the current entry as a continuous vertical strip and (re)binds the
 * scroll/observer lifecycle. Safe to call repeatedly (e.g. on entry change).
 */
export function renderVertical() {
  const entryChanged = renderedEntryKey !== getCurrentEntryKey();

  // Always tear down any prior observer/scroll binding before rebuilding so an
  // entry change or preview snapshot never leaves a stale observer running.
  runCleanup();
  clearRestoreForDifferentEntry();

  if (el.stageWrap) el.stageWrap.style.display = 'none';

  if (!state.pages.length) {
    removeVerticalStrip();
    showEmptyEntryState();
    updateUI();
    return;
  }

  hideEmptyEntryState();
  const strip = ensureVerticalStrip();
  if (!strip) return;
  strip.style.display = '';
  const imageCount = buildStrip(strip);
  const hasRestore = prepareRestoreForRender(imageCount);
  if (entryChanged && !hasRestore) {
    const viewport = getViewport();
    if (viewport) viewport.scrollTop = 0;
  }
  renderedEntryKey = getCurrentEntryKey();

  lastIndex = -1;
  cleanupFn = initVerticalObserver();

  // Establish the initial active page and restore the saved scroll position.
  setActivePage(state.pageIndex);
  scheduleInitialRestore();
  updateUI();
}

function runCleanup() {
  if (typeof cleanupFn === 'function') {
    cleanupFn();
    cleanupFn = null;
  }
}

/**
 * Disconnects the observer/scroll handlers, removes the vertical strip, and
 * restores the paged stage. No-op when vertical mode was never active.
 */
export function teardownVerticalMode() {
  runCleanup();
  clearScrollRestore();
  lastIndex = -1;
  renderedEntryKey = null;
  removeVerticalStrip();
  if (el.stageWrap) el.stageWrap.style.display = '';
}

/** Scrolls the vertical strip back to the top (used by restart in vertical mode). */
export function scrollVerticalToTop() {
  clearScrollRestore();
  const viewport = getViewport();
  if (viewport) viewport.scrollTop = 0;
}

/**
 * Zoom and pan transformation utilities for the Battle Bros comic reader
 * Handles viewport transformations, zoom controls, and fullscreen fitting
 */

import { CONFIG } from './config.js';
import { state } from './state.js';
import { el } from './dom.js';

const STACKED_LAYOUT_QUERY = '(max-aspect-ratio: 7/5)';

function parsePixels(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isVisibleElement(node) {
  if (!node || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return false;
  }
  const style = window.getComputedStyle(node);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function getOuterHeight(node) {
  if (!node || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return 0;
  }
  const rect = node.getBoundingClientRect();
  const style = window.getComputedStyle(node);
  return rect.height + parsePixels(style.marginTop) + parsePixels(style.marginBottom);
}

function shouldUseDynamicOnPageFrame() {
  if (!el.viewport || !el.mainContent || document.fullscreenElement) return false;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (window.matchMedia(STACKED_LAYOUT_QUERY).matches) return false;
  }
  return el.mainContent.clientWidth > 0 && el.mainContent.clientHeight > 0;
}

function getVisiblePageUrls() {
  const leftUrl = state.pages[state.pageIndex] || '';
  if (!leftUrl) {
    return { leftUrl: '', rightUrl: '', pageCount: 0 };
  }

  const rightVisible =
    !!el.rightPage &&
    typeof window !== 'undefined' &&
    typeof window.getComputedStyle === 'function' &&
    window.getComputedStyle(el.rightPage).display !== 'none' &&
    state.pageIndex + 1 < state.pages.length;

  const rightUrl = rightVisible ? state.pages[state.pageIndex + 1] || '' : '';
  return { leftUrl, rightUrl, pageCount: rightUrl ? 2 : 1 };
}

function rememberMetric(url, metric) {
  if (!url || !metric?.width || !metric?.height) return null;
  const normalized = { width: metric.width, height: metric.height };
  state.pageMetrics.set(url, normalized);
  return normalized;
}

function getMetricForUrl(url, imgEl) {
  if (!url) return null;
  if (
    imgEl &&
    imgEl.dataset?.pageUrl === url &&
    imgEl.naturalWidth > 0 &&
    imgEl.naturalHeight > 0
  ) {
    return rememberMetric(url, { width: imgEl.naturalWidth, height: imgEl.naturalHeight });
  }
  return state.pageMetrics.get(url) || null;
}

function getPageChrome(pageEl) {
  if (!pageEl || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return { horizontal: 0, vertical: 0 };
  }
  const style = window.getComputedStyle(pageEl);
  return {
    horizontal: parsePixels(style.borderLeftWidth) + parsePixels(style.borderRightWidth),
    vertical: parsePixels(style.borderTopWidth) + parsePixels(style.borderBottomWidth),
  };
}

function getStageGap() {
  if (!el.stage || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return 0;
  }
  const style = window.getComputedStyle(el.stage);
  return parsePixels(style.columnGap || style.gap);
}

function getAvailableFrameSpace() {
  if (!el.mainContent || !el.viewport) {
    return { width: 0, height: 0 };
  }

  const occupiedHeight = Array.from(el.mainContent.children)
    .filter((node) => node !== el.viewport && isVisibleElement(node))
    .reduce((sum, node) => sum + getOuterHeight(node), 0);

  return {
    width: Math.max(0, el.mainContent.clientWidth),
    height: Math.max(0, el.mainContent.clientHeight - occupiedHeight),
  };
}

export function clearOnPageFrame() {
  if (!el.viewport) return;
  el.viewport.classList.remove('dynamic-frame');
  el.viewport.style.removeProperty('--on-page-frame-width');
  el.viewport.style.removeProperty('--on-page-frame-height');
}

export function calculateOnPageFrameSize({
  pages,
  availableWidth,
  availableHeight,
  gap = 0,
  pageHorizontalChrome = 0,
  pageVerticalChrome = 0,
  fallbackFrame = null,
}) {
  const fallback =
    fallbackFrame?.width > 0 && fallbackFrame?.height > 0
      ? { width: fallbackFrame.width, height: fallbackFrame.height }
      : null;

  if (availableWidth <= 0 || availableHeight <= 0) return fallback;
  if (!Array.isArray(pages) || !pages.length) return fallback;

  const validPages = pages.filter((page) => page?.width > 0 && page?.height > 0);
  if (validPages.length !== pages.length) return fallback;

  const contentWidth = validPages.reduce((sum, page) => sum + page.width, 0);
  const contentHeight = Math.max(...validPages.map((page) => page.height));
  const fixedWidth = pageHorizontalChrome * validPages.length + (validPages.length > 1 ? gap : 0);
  const fixedHeight = pageVerticalChrome;
  const maxContentWidth = availableWidth - fixedWidth;
  const maxContentHeight = availableHeight - fixedHeight;

  if (contentWidth <= 0 || contentHeight <= 0 || maxContentWidth <= 0 || maxContentHeight <= 0) {
    return fallback;
  }

  const scale = Math.min(maxContentWidth / contentWidth, maxContentHeight / contentHeight);
  if (!Number.isFinite(scale) || scale <= 0) return fallback;

  return {
    width: contentWidth * scale + fixedWidth,
    height: contentHeight * scale + fixedHeight,
  };
}

export function fitOnPageFrame() {
  if (!shouldUseDynamicOnPageFrame()) {
    clearOnPageFrame();
    return null;
  }

  const { leftUrl, rightUrl, pageCount } = getVisiblePageUrls();
  if (!pageCount) {
    clearOnPageFrame();
    return null;
  }

  const visiblePages = [getMetricForUrl(leftUrl, el.leftImg)];
  if (pageCount === 2) {
    visiblePages.push(getMetricForUrl(rightUrl, el.rightImg));
  }

  const pageChrome = [getPageChrome(el.leftPage)];
  if (pageCount === 2) {
    pageChrome.push(getPageChrome(el.rightPage));
  }

  const horizontalChrome = Math.max(...pageChrome.map((chrome) => chrome.horizontal), 0);
  const verticalChrome = Math.max(...pageChrome.map((chrome) => chrome.vertical), 0);
  const { width: availableWidth, height: availableHeight } = getAvailableFrameSpace();
  const frame = calculateOnPageFrameSize({
    pages: visiblePages,
    availableWidth,
    availableHeight,
    gap: pageCount === 2 ? getStageGap() : 0,
    pageHorizontalChrome: horizontalChrome,
    pageVerticalChrome: verticalChrome,
    fallbackFrame: state.lastOnPageFrame,
  });

  if (!frame) {
    clearOnPageFrame();
    return null;
  }

  state.lastOnPageFrame = frame;
  el.viewport.classList.add('dynamic-frame');
  // 'fill': the frame spans the full reader column (pages stay centered inside), so the
  // container scales with the column and controls. 'hug' (default) wraps the pages.
  const fillFrame =
    el.viewport.dataset.readerStageFrameFill === 'fill' && availableWidth > frame.width;
  el.viewport.style.setProperty(
    '--on-page-frame-width',
    `${fillFrame ? availableWidth : frame.width}px`
  );
  el.viewport.style.setProperty('--on-page-frame-height', `${frame.height}px`);
  return frame;
}

/**
 * Applies the current scale and pan transformations to the stage element
 * Uses requestAnimationFrame for smooth rendering
 */
export function applyTransform() {
  if (state.rafId) cancelAnimationFrame(state.rafId);

  state.rafId = requestAnimationFrame(() => {
    if (el.stage) {
      el.stage.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.scale})`;
    }
    state.rafId = null;
  });
}

/**
 * Resets zoom and pan to default values (scale=1, no pan offset)
 */
export function resetView() {
  state.scale = 1;
  state.pan = { x: 0, y: 0 };
  applyTransform();
}

/**
 * Increases zoom level by CONFIG.ZOOM_STEP multiplier
 * Clamped to CONFIG.ZOOM_MAX maximum
 */
export function zoomIn() {
  state.scale = Math.min(CONFIG.ZOOM_MAX, state.scale * CONFIG.ZOOM_STEP);
  applyTransform();
}

/**
 * Decreases zoom level by CONFIG.ZOOM_STEP divisor
 * Clamped to CONFIG.ZOOM_MIN minimum
 */
export function zoomOut() {
  const minScale = document.fullscreenElement ? state.fullscreenBaseScale || 1 : CONFIG.ZOOM_MIN;
  state.scale = Math.max(minScale, state.scale / CONFIG.ZOOM_STEP);
  applyTransform();
}

/**
 * Fits content to screen - behavior depends on fullscreen state
 * In fullscreen: fits to viewport height; otherwise: resets to default
 */
export function fitToScreen() {
  if (document.fullscreenElement) {
    fitHeightFullscreen();
  } else {
    resetView();
    fitOnPageFrame();
  }
}

/**
 * Calculates and applies optimal scale to fit content within fullscreen viewport
 * Maintains aspect ratio while maximizing visible area
 * Uses center-center transform origin for balanced scaling
 */
export function fitHeightFullscreen() {
  const img = el.leftImg;
  const stage = el.stage;
  if (!img || !img.complete || !img.naturalHeight || !stage) {
    state.scale = 1;
    state.pan = { x: 0, y: 0 };
    applyTransform();
    return;
  }

  if (el.stage) {
    if (state.prevTransformOrigin === null) {
      state.prevTransformOrigin = window.getComputedStyle(el.stage).transformOrigin || '50% 50%';
    }
    el.stage.style.transformOrigin = 'center center';
  }

  const vpWidth = el.viewport.clientWidth;
  const vpHeight = el.viewport.clientHeight;

  state.scale = 1;
  state.pan = { x: 0, y: 0 };

  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
  stage.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.scale})`;

  void stage.offsetHeight;

  const stageBounds = stage.getBoundingClientRect();
  const stageWidth = stageBounds.width;
  const stageHeight = stageBounds.height;

  let targetScale = Math.min(vpWidth / stageWidth, vpHeight / stageHeight);
  targetScale = Math.max(CONFIG.ZOOM_MIN, Math.min(CONFIG.ZOOM_MAX, targetScale));

  state.scale = targetScale;
  state.pan = { x: 0, y: 0 };
  state.fullscreenBaseScale = state.scale || 1;
  applyTransform();
}

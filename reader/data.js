/**
 * Data loading utilities for the Battle Bros comic reader
 * Handles fetching and parsing chapter data, page config, and latest posts
 */

import { sanitizeEntries, sortEntryNamesWithMeta } from './entries.js';
import {
  getSeriesDataPath,
  getSeriesPageConfigPath,
  getActiveSeriesId,
  getRequestedPageScope,
  sanitizeSeriesId,
  sanitizePageSlug,
} from './series.js';
import { logger } from './logger.js';
import {
  renderPage,
  renderSection,
  renderModule,
  renderPageEndTarget,
  initEmailForms,
  initPromoCarousels,
} from './page-renderer.js';
import { initFeedModules } from './feed-panel.js';
import { initEntryGalleryModules } from './entry-gallery-module.js';
import { initMediaGalleryModules } from './media-gallery-module.js';
import { applySharedHeaderLayout } from './header-layout.js';
import { publishReaderShellState, resolveReaderShellState } from './shell-state.js';
import {
  createEffectivePageHeader,
  resolvePageHeaderState,
} from '../admin/page-builder/header-config.js';
import { escapeHtml } from '../admin/page-builder/helpers.js';
import { mergeAppearance, normalizeAppearance } from '../admin/page-builder/appearance-utils.js';
import { getReaderRuntimeConfig } from '../admin/page-builder/reader-config.js';
import {
  getEffectiveModuleConfig,
  isModuleHiddenForDevice,
} from '../admin/page-builder/responsive-overrides.js';

const BUILDER_THEME_CSS_VARS = Object.freeze([
  '--primary',
  '--secondary',
  '--accent',
  '--bg-dark',
  '--bg-panel',
  '--text',
  '--danger',
]);

const PANEL_BACKGROUND_CSS_VARS = Object.freeze([
  '--panel-bg-image',
  '--panel-bg-size',
  '--panel-bg-position',
  '--panel-bg-opacity',
]);

const READER_CONTROL_STYLE_VARS = Object.freeze([
  '--reader-control-bg',
  '--reader-control-color',
  '--reader-control-border',
  '--reader-control-border-width',
  '--reader-control-border-style',
  '--reader-control-border-color',
  '--reader-control-border-radius',
  '--reader-primary-control-bg',
  '--reader-primary-control-color',
  '--reader-primary-control-border',
  '--reader-primary-control-border-width',
  '--reader-primary-control-border-style',
  '--reader-primary-control-border-color',
  '--reader-primary-control-border-radius',
]);

const HEX_COLOR_WITHOUT_ALPHA_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function resolveHeaderPageForDevice(page, { builderEditing = false, deviceId = '' } = {}) {
  if (!builderEditing || !deviceId) return page;
  const responsiveHeader = page?.meta?.responsive?.[deviceId]?.header;
  const responsiveAppearance = responsiveHeader?.appearance;
  if (!responsiveAppearance || typeof responsiveAppearance !== 'object') return page;

  const baseHeader = page?.meta?.header || {};
  const baseAppearance = baseHeader.appearance || {};
  return {
    ...page,
    meta: {
      ...(page.meta || {}),
      header: {
        ...baseHeader,
        appearance: {
          ...baseAppearance,
          top: mergeAppearance(baseAppearance.top, responsiveAppearance.top),
          scrolled: mergeAppearance(baseAppearance.scrolled, responsiveAppearance.scrolled),
          navItemDefaults: mergeAppearance(
            baseAppearance.navItemDefaults,
            responsiveAppearance.navItemDefaults
          ),
        },
      },
    },
  };
}

/**
 * Loads entry data from the public series endpoint
 * Fetches entry list, page URLs, and status message from the database-backed API
 * @async
 * @returns {Promise<{entries: Object, entryOrder: string[], statusMessage: string}>} Normalized entry data
 * @throws {Error} If fetch fails or data structure is invalid
 */
export async function loadEntryData(seriesId) {
  try {
    const dataPath = getSeriesDataPath(seriesId);
    const response = await fetch(dataPath, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load entry data: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();

    const entryPayload = data.entries && typeof data.entries === 'object' ? data.entries : null;
    if (!entryPayload) {
      throw new Error(`Invalid entry data structure in ${dataPath}`);
    }

    const entryMetaPayload =
      data.entryMeta && typeof data.entryMeta === 'object' ? data.entryMeta : null;
    const entryMeta = entryMetaPayload || {};

    const resolveProtectedPath = (raw = '') => {
      const value = String(raw || '').trim();
      if (!value) return '';
      if (value.startsWith('http') || value.startsWith('/')) return value;
      if (value.startsWith('protected/')) {
        return `/api/protected/${value.replace(/^protected\//, '')}`;
      }
      return value;
    };

    const mappedEntries = Object.fromEntries(
      Object.entries(entryPayload).map(([name, pages]) => [
        name,
        Array.isArray(pages) ? pages.map(resolveProtectedPath) : [],
      ])
    );

    Object.values(entryMeta).forEach((meta) => {
      if (!meta || typeof meta !== 'object') return;
      if (meta.coverImage) {
        meta.coverImage = resolveProtectedPath(meta.coverImage);
      }
    });

    const normalized = sanitizeEntries(mappedEntries, entryMeta);
    const orderedNames = sortEntryNamesWithMeta(Object.keys(normalized.chapters), entryMeta);
    return {
      entries: normalized.chapters,
      entryOrder: orderedNames,
      statusMessage: data.statusMessage || '',
      entryMeta,
      premiumOnly: !!data.premiumOnly,
      unitLabelSingular: String(data.unitLabelSingular || '').trim() || 'Entry',
      unitLabelPlural: String(data.unitLabelPlural || '').trim() || 'Entries',
      entryLabels: Array.isArray(data.entryLabels) ? data.entryLabels : [],
    };
  } catch (error) {
    console.error('Failed to load entry data:', error);
    throw error;
  }
}

/**
 * Loads page configuration from the public page-config endpoint
 * Applies custom subtitles and theme overrides if available
 * @async
 * @param {Function} setSubtitlesFn - Callback function to set subtitles in the UI
 * @returns {Promise<boolean>} True if config loaded successfully, false otherwise
 */
export async function loadPageConfig(setSubtitlesFn, seriesId) {
  const config = await fetchPageConfig(seriesId);
  if (!config) return false;

  if (config.content && config.content.header && Array.isArray(config.content.header.subtitles)) {
    setSubtitlesFn(config.content.header.subtitles);
    logger.log(`✓ Page config loaded from ${getSeriesPageConfigPath(seriesId)}`);
  } else {
    console.warn('No subtitles found in page-config.json');
  }

  return true;
}

export async function fetchPageConfig(seriesId) {
  try {
    const configPath = getSeriesPageConfigPath(seriesId);
    const response = await fetch(configPath, { cache: 'no-store' });
    if (!response.ok) {
      console.warn(`Failed to load page config: ${response.status} ${response.statusText}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to load page config:', error);
    return null;
  }
}

/**
 * Loads the latest post from /api/posts/latest for the "Latest Update" widget
 * Displays loading state and handles errors gracefully
 * @async
 * @returns {Promise<Object|null>} Latest post object sorted by date, or null if none available
 */
export async function loadLatestPost() {
  const body = document.getElementById('latestBody');
  if (!body) return null;

  body.innerHTML = '<div class="latest-loading">Loading...</div>';

  try {
    const response = await fetch('/api/posts/latest', { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to load latest post');
    const data = await response.json().catch(() => ({}));
    const post = data && typeof data === 'object' ? data.post : null;

    if (!post) {
      body.innerHTML = '<div class="latest-empty">No updates yet.</div>';
      return null;
    }

    return post;
  } catch (error) {
    console.error('Latest update widget error:', error);
    body.innerHTML =
      '<div class="latest-empty" style="color: var(--danger);">Could not load updates.</div>';
    return null;
  }
}

/**
 * Loads a page from the page builder API.
 * @param {string} slug - The page slug (e.g., "reader")
 * @param {string} [seriesId] - Optional series ID override
 * @param {{draft?: boolean, pageScope?: 'series'|'global'}} [options] - Load unpublished pages
 * through the admin API when enabled
 * @returns {Promise<Object|null>} The page data or null if not found
 */
export async function loadBuilderPage(slug, seriesId = null, options = {}) {
  const sid = seriesId || getActiveSeriesId();
  const pageSlug = sanitizePageSlug(slug) || 'reader';
  const useDraft = !!options?.draft;
  const pageScope = options?.pageScope === 'global' ? 'global' : 'series';
  const requestUrl =
    pageScope === 'global'
      ? useDraft
        ? `/api/admin/pages/global/by-slug/${encodeURIComponent(pageSlug)}`
        : `/api/pages/global/by-slug/${encodeURIComponent(pageSlug)}`
      : useDraft
        ? `/api/admin/pages/series/${encodeURIComponent(sid)}/by-slug/${encodeURIComponent(pageSlug)}`
        : `/api/pages/${encodeURIComponent(sid)}/${encodeURIComponent(pageSlug)}`;
  try {
    const res = await fetch(requestUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!res.ok) {
      if (res.status === 404) {
        logger.log(`Builder page "${pageSlug}" not found`);
        return null;
      }
      if (useDraft && res.status === 403) {
        logger.warn(`Draft page "${pageSlug}" requires admin access`);
        return null;
      }
      throw new Error(`Failed to load builder page: ${res.status}`);
    }
    const data = await res.json();
    return data.page || null;
  } catch (error) {
    logger.error('Failed to load builder page:', error);
    return null;
  }
}

/**
 * Loads the effective homepage page for a series.
 * Prefers the page marked homepage and falls back to the reader page.
 * @param {string} [seriesId] - Optional series ID override
 * @param {{draft?: boolean}} [options] - Load unpublished pages through the admin API when enabled
 * @returns {Promise<Object|null>} The page data or null if not found
 */
export async function loadHomepageBuilderPage(seriesId = null, options = {}) {
  const sid = seriesId || getActiveSeriesId();
  const useDraft = !!options?.draft;
  const requestUrl = useDraft
    ? `/api/admin/pages/home/${encodeURIComponent(sid)}`
    : `/api/pages/home/${encodeURIComponent(sid)}`;
  try {
    const res = await fetch(requestUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!res.ok) {
      if (res.status === 404) {
        logger.log(`Homepage page not found for series: ${sid}`);
        return null;
      }
      if (useDraft && res.status === 403) {
        logger.warn(`Draft homepage page requires admin access for series: ${sid}`);
        return null;
      }
      throw new Error(`Failed to load homepage page: ${res.status}`);
    }
    const data = await res.json();
    return data.page || null;
  } catch (error) {
    logger.error('Failed to load homepage page:', error);
    return null;
  }
}

/**
 * Extract subtitles from a page builder page.
 * Prefers the first-class page header and falls back through legacy sources.
 * @param {Object} page - The page data from the builder API
 * @param {Object|null} [pageConfig] - Optional legacy page-config fallback
 * @returns {string[]} Array of subtitles
 */
export function extractSubtitlesFromBuilderPage(page, pageConfig = null) {
  if (!page) return [];
  const header = createEffectivePageHeader(page, pageConfig);
  const subtitles = Array.isArray(header?.copy?.subtitles)
    ? header.copy.subtitles.filter(Boolean)
    : [];
  if (subtitles.length > 0) {
    return subtitles;
  }
  return header?.copy?.subtitle ? [header.copy.subtitle] : [];
}

export function resolveBuilderPageReaderSeriesId(page, fallbackSeriesId = getActiveSeriesId()) {
  const fallback = sanitizeSeriesId(fallbackSeriesId) || getActiveSeriesId();
  if (!page || !Array.isArray(page.sections)) return fallback;
  const pageScope = page.scope === 'global' ? 'global' : 'series';
  for (const section of page.sections) {
    for (const module of section.modules || []) {
      if (module?.moduleType !== 'reader') continue;
      const source =
        module.config?.source && typeof module.config.source === 'object'
          ? module.config.source
          : {};
      if (pageScope !== 'global') {
        return sanitizeSeriesId(page.seriesId || '') || fallback;
      }
      if (source.mode === 'specific-series') {
        return sanitizeSeriesId(source.seriesId || '') || fallback;
      }
      if (source.mode === 'active-page-series') {
        return sanitizeSeriesId(page.seriesId || '') || fallback;
      }
      return fallback;
    }
  }
  return fallback;
}

/**
 * Apply page-level theme colors from page builder.
 * Sets CSS custom properties on the document root.
 * @param {Object} page - The page data from the builder API
 */
function applyPageTheme(page) {
  const root = document.documentElement;
  BUILDER_THEME_CSS_VARS.forEach((cssVar) => {
    root.style.removeProperty(cssVar);
  });

  if (!page?.meta?.theme) return;

  Object.entries(page.meta.theme).forEach(([key, value]) => {
    if (!value) return;
    // Convert camelCase to kebab-case: bgDark -> bg-dark
    const cssVar = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
    root.style.setProperty(cssVar, value);
  });

  logger.log('✓ Applied page theme');
}

function resolveAssetUrl(path = '') {
  if (!path) return '';
  const raw = String(path || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  const cleaned = raw.replace(/^assets\//, '');
  return `/assets/${cleaned}`;
}

function applyPanelBackgrounds(page) {
  const backgrounds = page?.meta?.panelBackgrounds || {};
  const leftPanel = document.getElementById('leftPanel');
  const rightPanel = document.getElementById('rightPanel');

  const applyToPanel = (panel, config) => {
    if (!panel) return;
    PANEL_BACKGROUND_CSS_VARS.forEach((cssVar) => {
      panel.style.removeProperty(cssVar);
    });
    if (!config || !config.path) {
      return;
    }
    const url = resolveAssetUrl(config.path);
    panel.style.setProperty('--panel-bg-image', `url("${url}")`);
    panel.style.setProperty('--panel-bg-size', config.fit || 'cover');
    panel.style.setProperty('--panel-bg-position', config.focus || 'center');
    if (config.opacity !== undefined && config.opacity !== null) {
      panel.style.setProperty('--panel-bg-opacity', String(config.opacity));
    }
  };

  applyToPanel(leftPanel, backgrounds.left);
  applyToPanel(rightPanel, backgrounds.right);
}

function resetPanelVisibility() {
  const leftPanel = document.getElementById('leftPanel');
  const rightPanel = document.getElementById('rightPanel');
  if (leftPanel) leftPanel.style.display = '';
  if (rightPanel) rightPanel.style.display = '';
}

function hexToRgba(color, opacity) {
  if (!color || color === 'transparent') return color || '';
  if (!HEX_COLOR_WITHOUT_ALPHA_RE.test(color)) return color;
  const hex = color.slice(1);
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : hex;
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function applyOpacity(color, opacity) {
  if (!color) return '';
  if (opacity == null || opacity === 1) return color;
  return hexToRgba(color, opacity);
}

function resolveAppearanceBackground(background = {}) {
  if (!background.color) return '';
  const opacity = background.opacity ?? 1;
  if (background.type === 'gradient' && background.secondaryColor) {
    const angle = background.angle ?? 135;
    return `linear-gradient(${angle}deg, ${applyOpacity(background.color, opacity)}, ${applyOpacity(
      background.secondaryColor,
      opacity
    )})`;
  }
  return applyOpacity(background.color, opacity);
}

function resolveAppearanceBorder(border = {}) {
  const width = border.width;
  const color = border.color ? applyOpacity(border.color, border.opacity ?? 1) : '';
  if (width === 0) return 'none';
  if (width != null && color) {
    return `${width}px ${border.style || 'solid'} ${color}`;
  }
  return '';
}

function applyReaderControlAppearanceVars(element, appearance, prefix) {
  if (!element) return;
  const baseVar = prefix === 'primary' ? '--reader-primary-control' : '--reader-control';
  const normalized = normalizeAppearance(appearance);
  const background = normalized?.background || {};
  const text = normalized?.text || {};
  const border = normalized?.border || {};
  const backgroundValue = resolveAppearanceBackground(background);
  const borderValue = resolveAppearanceBorder(border);

  [
    `${baseVar}-bg`,
    `${baseVar}-color`,
    `${baseVar}-border`,
    `${baseVar}-border-width`,
    `${baseVar}-border-style`,
    `${baseVar}-border-color`,
    `${baseVar}-border-radius`,
  ].forEach((cssVar) => element.style.removeProperty(cssVar));

  if (backgroundValue) element.style.setProperty(`${baseVar}-bg`, backgroundValue);
  if (text.color) element.style.setProperty(`${baseVar}-color`, text.color);
  if (borderValue) element.style.setProperty(`${baseVar}-border`, borderValue);
  if (border.width != null) {
    element.style.setProperty(`${baseVar}-border-width`, `${border.width}px`);
  }
  if (border.style) {
    element.style.setProperty(`${baseVar}-border-style`, border.style);
  }
  if (border.color) {
    element.style.setProperty(
      `${baseVar}-border-color`,
      applyOpacity(border.color, border.opacity ?? 1)
    );
  }
  if (border.radius != null) {
    element.style.setProperty(`${baseVar}-border-radius`, `${border.radius}px`);
  }
}

function findEffectiveReaderModule(page, options = {}) {
  if (!page || !Array.isArray(page.sections)) return null;
  for (const section of page.sections) {
    for (const module of section?.modules || []) {
      if (module?.moduleType !== 'reader') continue;
      const hidden = isModuleHiddenForDevice(module, {
        builderEditing: options.builderEditing === true,
        deviceId: options.deviceId,
      });
      if (!hidden) return module;
    }
  }
  return null;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function resolveReaderModuleShellSettings(page, options = {}) {
  const readerModule = findEffectiveReaderModule(page, options);
  if (!readerModule) {
    return {
      settings: getReaderRuntimeConfig({}),
      hasExplicitPanels: false,
    };
  }
  const effectiveConfig = getEffectiveModuleConfig(readerModule, {
    builderEditing: options.builderEditing === true,
    deviceId: options.deviceId,
  });
  return {
    settings: getReaderRuntimeConfig(effectiveConfig),
    hasExplicitPanels: isPlainObject(effectiveConfig.panels),
  };
}

export function applyReaderModuleShellSettings(page, options = {}) {
  const { settings, hasExplicitPanels } = resolveReaderModuleShellSettings(page, options);
  const controls = document.getElementById('controls');
  const mainContent = document.getElementById('mainContent');
  const stageWrap = document.getElementById('stageWrap');
  const viewport = document.getElementById('viewport');
  const stage = document.getElementById('stage');
  const leftPanel = document.getElementById('leftPanel');
  const rightPanel = document.getElementById('rightPanel');
  const commentsSection = document.getElementById('comicCommentsSection');
  const commentToggle = document.getElementById('commentToggleBtn');

  // Capture the previously applied mode so we can notify the runtime when a
  // preview snapshot switches display modes (the runtime owns re-rendering).
  const previousDisplayMode = document.body.dataset.readerDisplayMode;
  document.body.dataset.readerDisplayMode = settings.displayMode;
  document.body.dataset.readerRequestedDisplayMode = settings.requestedDisplayMode;
  if (previousDisplayMode !== undefined && previousDisplayMode !== settings.displayMode) {
    window.dispatchEvent(
      new CustomEvent('readerDisplayModeChanged', {
        detail: { displayMode: settings.displayMode, previous: previousDisplayMode },
      })
    );
  }

  if (mainContent) {
    mainContent.dataset.readerControlsPlacement = settings.controls.placement;
    mainContent.dataset.readerControlsSize = settings.controls.size;
  }

  if (controls) {
    controls.dataset.readerControlsPlacement = settings.controls.placement;
    controls.dataset.readerControlsSize = settings.controls.size;
    controls.style.maxWidth = settings.stage.maxWidth == null ? '' : `${settings.stage.maxWidth}px`;
    READER_CONTROL_STYLE_VARS.forEach((cssVar) => controls.style.removeProperty(cssVar));
    applyReaderControlAppearanceVars(
      controls,
      settings.controls.style.defaults.appearance,
      'control'
    );
    applyReaderControlAppearanceVars(
      controls,
      settings.controls.style.primary.appearance,
      'primary'
    );
    setHiddenState(controls, settings.controls.placement === 'hidden');
  }

  [viewport, stageWrap].forEach((element) => {
    if (!element) return;
    element.dataset.readerStageFit = settings.stage.fit;
    element.dataset.readerStageFrameBorder = String(settings.stage.frameBorder);
    element.dataset.readerStageMaxWidth =
      settings.stage.maxWidth == null ? '' : String(settings.stage.maxWidth);
    element.style.maxWidth = settings.stage.maxWidth == null ? '' : `${settings.stage.maxWidth}px`;
  });

  if (stageWrap) {
    stageWrap.dataset.readerStagePageGap = String(settings.stage.pageGap);
  }
  if (stage) {
    stage.style.setProperty('--reader-stage-page-gap', `${settings.stage.pageGap}px`);
  }
  // Vertical mode renders into #verticalStrip (a child of #viewport, not #stage),
  // so expose the page gap on the viewport too for the strip to inherit.
  if (viewport) {
    viewport.style.setProperty('--reader-stage-page-gap', `${settings.stage.pageGap}px`);
  }

  if (hasExplicitPanels) {
    setHiddenState(leftPanel, settings.panels.left.enabled === false);
    setHiddenState(rightPanel, settings.panels.right.enabled === false);
  }
  setHiddenState(commentsSection, settings.showComments === false);
  setHiddenState(commentToggle, settings.showComments === false);
}

function syncReaderShellBuilderMarkers(page, builderEditing, options = {}) {
  const shellActive = options.shellActive !== false;
  const pageTargets = [
    document.body,
    shellActive ? document.querySelector('.viewerWrap') : null,
  ].filter(Boolean);
  pageTargets.forEach((target) => {
    if (builderEditing && page?.id) {
      target.setAttribute('data-builder-page-id', String(page.id));
      return;
    }
    target.removeAttribute('data-builder-page-id');
  });
  if (!shellActive) {
    document.querySelector('.viewerWrap')?.removeAttribute('data-builder-page-id');
  }
  if (!builderEditing) {
    const topbar = document.querySelector('header.topbar#topbar');
    topbar?.removeAttribute('data-builder-page-id');
    topbar?.removeAttribute('data-builder-surface');
  }
}

function ensureBuilderPageContent() {
  let container = document.getElementById('builderPageContent');
  if (container) return container;

  container = document.createElement('div');
  container.id = 'builderPageContent';
  container.className = 'builder-page-content';
  container.hidden = true;

  const main = document.querySelector('main') || document.body;
  main?.appendChild(container);
  return container;
}

function setHiddenState(element, hidden) {
  if (!element) return;
  element.hidden = hidden;
  if (hidden) {
    element.setAttribute('aria-hidden', 'true');
    if ('inert' in element) element.inert = true;
    return;
  }
  element.removeAttribute('aria-hidden');
  if ('inert' in element) element.inert = false;
}

// Above/below-reader content surfaces. On a bound reader page authors may place
// normal sections before or after the required reader module; those render here as
// full-width page content (not reader panels), bracketing the static reader stage.
const READER_SURFACE_IDS = Object.freeze({
  above: 'builderAboveReader',
  below: 'builderBelowReader',
});
const READER_PAGE_END_TARGET_ID = 'builderReaderPageEndTarget';

function ensureReaderSurface(placement) {
  const id = READER_SURFACE_IDS[placement];
  let surface = document.getElementById(id);
  if (surface) return surface;

  surface = document.createElement('div');
  surface.id = id;
  surface.className = `builder-reader-surface builder-reader-surface--${placement}`;
  surface.hidden = true;

  const main = document.querySelector('main');
  const viewerWrap = main?.querySelector('.viewerWrap');
  if (main && viewerWrap) {
    if (placement === 'above') {
      main.insertBefore(surface, viewerWrap);
    } else {
      viewerWrap.insertAdjacentElement('afterend', surface);
    }
  } else {
    (main || document.body).appendChild(surface);
  }
  return surface;
}

function clearReaderSurfaces() {
  Object.keys(READER_SURFACE_IDS).forEach((placement) => {
    const surface = ensureReaderSurface(placement);
    surface.innerHTML = '';
    setHiddenState(surface, true);
  });
}

function removeReaderPageEndTarget() {
  const target = document.getElementById(READER_PAGE_END_TARGET_ID);
  target?.closest('.pb-page-end-target-anchor')?.remove();
}

function syncReaderPageEndTarget(page, builderEditing) {
  removeReaderPageEndTarget();
  if (!builderEditing || !page?.id) return;

  const belowSurface = ensureReaderSurface('below');
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderPageEndTarget(page, { builderEditing: true });
  const anchor = wrapper.firstElementChild;
  const target = anchor?.querySelector?.('[data-builder-surface="page-end"]');
  if (!anchor || !target) return;
  target.id = READER_PAGE_END_TARGET_ID;
  anchor.classList.add('builder-reader-page-end-target-anchor');
  belowSurface.insertAdjacentElement('afterend', anchor);
}

function initBuilderSurfaceModules(container, options = {}) {
  initEmailForms(container, { previewMode: !!options.previewMode });
  initPromoCarousels(container);
  initEntryGalleryModules(container);
  initFeedModules(container);
  initMediaGalleryModules(container);
}

function renderReaderSurface(placement, page, entries, options = {}) {
  const surface = ensureReaderSurface(placement);
  if (!entries.length) {
    surface.innerHTML = '';
    setHiddenState(surface, true);
    return;
  }
  const builderEditing = options.builderEditing === true;
  const deviceId = options.deviceId;
  surface.innerHTML = entries
    .map(({ section, sectionIndex }) =>
      renderSection(section, { builderEditing, deviceId, sectionIndex })
    )
    .join('');
  initBuilderSurfaceModules(surface, options);
  setHiddenState(surface, false);
}

// Index of the section that contains the active (effective) reader module.
function findReaderSectionIndex(page, readerModule) {
  if (!readerModule || !Array.isArray(page?.sections)) return -1;
  return page.sections.findIndex((section) =>
    (section?.modules || []).some((module) => module === readerModule)
  );
}

function clearReaderShellBuilderTargets() {
  document.querySelector('.viewerWrap')?.removeAttribute('data-builder-page-id');
  document.querySelectorAll('.viewerWrap [data-builder-module-id]').forEach((element) => {
    element.removeAttribute('data-builder-module-id');
    element.removeAttribute('data-builder-module-type');
  });
  document.querySelectorAll('.viewerWrap [data-builder-section-id]').forEach((element) => {
    element.removeAttribute('data-builder-section-id');
    element.removeAttribute('data-builder-section-index');
    element.removeAttribute('data-builder-layout');
  });
  document.querySelectorAll('.viewerWrap [data-builder-column-index]').forEach((element) => {
    element.removeAttribute('data-builder-column-index');
  });
}

function applyReaderShellDomState(shellState) {
  const active = shellState?.active === true;
  const builderContent = ensureBuilderPageContent();
  setHiddenState(builderContent, active);

  [
    document.querySelector('.viewerWrap'),
    document.getElementById('leftPanel'),
    document.getElementById('rightPanel'),
    document.getElementById('stageWrap'),
    document.getElementById('controls'),
    document.getElementById('edgeLeft'),
    document.getElementById('edgeRight'),
    document.getElementById('comicCommentsSection'),
    document.getElementById('entryCoverGallery'),
    document.getElementById('shortcutsOverlay'),
    document.getElementById('entryEndOverlay'),
  ].forEach((element) => setHiddenState(element, !active));

  if (active) {
    builderContent.innerHTML = '';
  } else {
    clearReaderShellBuilderTargets();
  }
  // Reset the above/below-reader surfaces on every apply; the active branch
  // repopulates them from the page's non-reader sections when appropriate.
  clearReaderSurfaces();
  removeReaderPageEndTarget();
}

function applyReaderHeaderChromeState(shellState) {
  const active = shellState?.active === true;
  [
    document.querySelector('.entry-controls'),
    document.getElementById('entry'),
    document.getElementById('statusPanel'),
  ].forEach((element) => setHiddenState(element, !active));
}

function renderBuilderPageContent(page, options = {}) {
  const container = ensureBuilderPageContent();
  container.innerHTML = renderPage(page, {
    builderEditing: options.builderEditing === true,
    deviceId: options.deviceId,
  });
  initEmailForms(container, { previewMode: !!options.previewMode });
  initPromoCarousels(container);
  initEntryGalleryModules(container);
  initFeedModules(container);
  initMediaGalleryModules(container);
}

function builderMarkerAttrs(attrs = {}, enabled = false) {
  if (!enabled) return '';
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
    .map(([key, value]) => ` ${key}="${escapeHtml(String(value))}"`)
    .join('');
}

function getPanelModuleColumnIndex(item, side) {
  const rawIndex = item?.module?.columnIndex;
  const parsed = Number(rawIndex);
  if (Number.isFinite(parsed)) return parsed;
  if (side === 'right') {
    const layout = item?.section?.layout || '1';
    return Math.max(0, layout.split('-').length - 1);
  }
  return 0;
}

function renderPanelBuilderEditingStack(side, modules, options = {}) {
  const groups = new Map();
  modules.forEach((item) => {
    const sectionIndex = Number.isFinite(Number(item.sectionIndex)) ? Number(item.sectionIndex) : 0;
    const columnIndex = getPanelModuleColumnIndex(item, side);
    const sectionId = item.section?.id || `section-${sectionIndex}`;
    const groupKey = `${sectionId}:${columnIndex}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        section: item.section || {},
        sectionIndex,
        columnIndex,
        modules: [],
      });
    }
    groups.get(groupKey).modules.push(item.module);
  });

  return Array.from(groups.values())
    .map(({ section, sectionIndex, columnIndex, modules: groupModules }) => {
      const layout = String(section.layout || '1');
      const sectionAttrs = builderMarkerAttrs(
        {
          'data-builder-section-id': section.id,
          'data-builder-section-index': sectionIndex,
          'data-builder-layout': layout,
        },
        true
      );
      const columnAttrs = builderMarkerAttrs(
        {
          'data-builder-column-index': columnIndex,
        },
        true
      );
      const modulesHtml = groupModules
        .map((module) => renderModule(module, { builderEditing: true, deviceId: options.deviceId }))
        .join('');
      return `
        <div class="pb-builder-panel-section"${sectionAttrs}>
          <div class="pb-builder-panel-column"${columnAttrs}>${modulesHtml}</div>
        </div>
      `;
    })
    .join('');
}

/**
 * Apply page builder modules to the existing DOM elements.
 * Updates header, panels, and other elements based on module config.
 * @param {Object} page - The page data from the builder API
 */
export function applyBuilderPageToDOM(page, options = {}) {
  const builderEditing = options.builderEditing === true;
  const deviceId = options.deviceId;
  const shellState = publishReaderShellState(
    resolveReaderShellState(page, { builderEditing, deviceId })
  );
  applyReaderShellDomState(shellState);

  if (!page || !page.sections) {
    syncReaderShellBuilderMarkers(null, false, { shellActive: false });
    applyReaderHeaderChromeState(shellState);
    renderBuilderPageContent(null, options);
    return shellState;
  }
  syncReaderShellBuilderMarkers(page, builderEditing, { shellActive: shellState.active });
  const headerPage = resolveHeaderPageForDevice(page, { builderEditing, deviceId });
  const headerState = resolvePageHeaderState({
    page: headerPage,
    pageConfig: options.pageConfig || null,
  });
  const effectiveHeader = headerState.meta;
  applySharedHeaderLayout(options.pageConfig || null, {
    seriesId: options.seriesId || getActiveSeriesId(),
    page: headerPage,
    headerState,
    builderEditing,
  });
  applyReaderHeaderChromeState(shellState);

  // Apply theme first
  applyPageTheme(page);
  applyPanelBackgrounds(page);

  // Apply effective page header copy.
  const titleEl = document.querySelector('.topbar .title h1');
  if (titleEl && effectiveHeader.copy?.title) {
    titleEl.textContent = effectiveHeader.copy.title;
  }
  const subtitleEl = document.getElementById('subtitle');
  const subtitleText = effectiveHeader.copy?.subtitle || effectiveHeader.copy?.subtitles?.[0] || '';
  if (subtitleEl) {
    subtitleEl.textContent = subtitleText;
  }
  if (window.BattleBros?.setSubtitles) {
    const subtitles = extractSubtitlesFromBuilderPage(page, options.pageConfig || null);
    window.BattleBros.setSubtitles(subtitles);
  }

  if (!shellState.active) {
    renderBuilderPageContent(page, options);
    logger.log('✓ Applied no-reader builder page to DOM');
    return shellState;
  }

  // Locate the reader module's section. Sections before it render into the
  // above-reader surface and sections after it into the below-reader surface as
  // normal page content; only the reader's own section feeds the reader panels.
  const readerModule = findEffectiveReaderModule(page, { builderEditing, deviceId });
  const readerSectionIndex = findReaderSectionIndex(page, readerModule);
  const aboveSections = [];
  const belowSections = [];
  if (readerSectionIndex >= 0) {
    page.sections.forEach((section, sectionIndex) => {
      if (sectionIndex < readerSectionIndex) {
        aboveSections.push({ section, sectionIndex });
      } else if (sectionIndex > readerSectionIndex) {
        belowSections.push({ section, sectionIndex });
      }
    });
  }
  renderReaderSurface('above', page, aboveSections, {
    builderEditing,
    deviceId,
    previewMode: !!options.previewMode,
  });
  renderReaderSurface('below', page, belowSections, {
    builderEditing,
    deviceId,
    previewMode: !!options.previewMode,
  });
  syncReaderPageEndTarget(page, builderEditing);

  const panelSpacing = page?.meta?.panelSpacing || {};
  const panelBackgrounds = page?.meta?.panelBackgrounds || {};

  const PANEL_MODULE_TYPES = new Set([
    'text',
    'image',
    'html',
    'social',
    'email-signup',
    'buttons',
    'spacer',
    'promo',
    'feed',
    'entry-gallery',
    'media-gallery',
    'gallery',
    'video',
  ]);

  // Panels are reader-owned: only the reader module's own section feeds them, so
  // above/below-reader sections stay page content rather than being pulled into panels.
  const panelSections =
    readerSectionIndex >= 0
      ? [[readerSectionIndex, page.sections[readerSectionIndex]]]
      : Array.from(page.sections.entries());

  const findPanelModules = (side) => {
    const results = [];
    for (const [sectionIndex, section] of panelSections) {
      const layout = section.layout || '1';
      const colCount = layout.split('-').length;
      const leftIndex = 0;
      const rightIndex = colCount > 1 ? colCount - 1 : 0;
      for (const mod of section.modules || []) {
        if (!PANEL_MODULE_TYPES.has(mod.moduleType)) continue;
        if (side === 'left' && mod.columnIndex === leftIndex) {
          results.push({ module: mod, section, sectionIndex });
        } else if (
          side === 'right' &&
          (builderEditing ? Number(mod.columnIndex || 0) > leftIndex : colCount > 1) &&
          (builderEditing || mod.columnIndex === rightIndex)
        ) {
          results.push({ module: mod, section, sectionIndex });
        }
      }
    }
    return results;
  };

  // Apply left/right panel content based on columns
  const leftModules = findPanelModules('left');
  const rightModules = findPanelModules('right');
  renderPanelStack('left', leftModules, panelSpacing, panelBackgrounds, {
    previewMode: !!options.previewMode,
    builderEditing,
    deviceId,
  });
  renderPanelStack('right', rightModules, panelSpacing, panelBackgrounds, {
    previewMode: !!options.previewMode,
    builderEditing,
    deviceId,
  });

  // Check panel visibility from section settings (reader-owned: only the reader
  // section's panelEnabled controls the reader panels).
  resetPanelVisibility();
  for (const [, section] of panelSections) {
    const settings = section.settings || {};
    if (settings.panelEnabled) {
      const leftPanel = document.getElementById('leftPanel');
      const rightPanel = document.getElementById('rightPanel');
      if (leftPanel && settings.panelEnabled.left === false) {
        leftPanel.style.display = 'none';
      } else if (leftPanel) {
        leftPanel.style.display = '';
      }
      if (rightPanel && settings.panelEnabled.right === false) {
        rightPanel.style.display = 'none';
      } else if (rightPanel) {
        rightPanel.style.display = '';
      }
    }
  }

  applyReaderModuleShellSettings(page, { builderEditing, deviceId });

  logger.log('✓ Applied page builder config to DOM');
  return shellState;
}

/**
 * Render builder modules into panel stacks.
 */
function renderPanelStack(side, modules, panelSpacing = {}, panelBackgrounds = {}, options = {}) {
  const panelId = side === 'left' ? 'leftPanel' : 'rightPanel';
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const builderEditing = options.builderEditing === true;

  const legacyRightSelectors = [
    '#rightPanelFeedBar',
    '#latestUpdate',
    '#rightPanelFeed',
    '.right-stack',
  ];
  if (side === 'right') {
    legacyRightSelectors.forEach((selector) => {
      const el = panel.querySelector(selector);
      if (el) el.style.display = 'none';
    });
    panel.querySelectorAll('.right-panel-builder').forEach((el) => el.remove());
  }

  let container = null;
  if (side === 'left') {
    container = panel.querySelector('.left-panel-content');
    if (!container) {
      container = document.createElement('div');
      panel.appendChild(container);
    }
  } else {
    container = panel.querySelector('.panel-builder--right');
    if (!container) {
      container = document.createElement('div');
      panel.appendChild(container);
    }
  }
  container.classList.add('panel-builder');
  container.classList.toggle('panel-builder--left', side === 'left');
  container.classList.toggle('panel-builder--right', side === 'right');
  if (builderEditing) {
    container.dataset.builderSurface = side === 'left' ? 'left-panel' : 'right-panel';
  } else {
    container.removeAttribute('data-builder-surface');
  }
  const isEmptyPanel = !modules.length;
  panel.classList.toggle('side-panel--empty', isEmptyPanel);
  container.classList.toggle('panel-builder--empty', isEmptyPanel);

  const gapValue = panelSpacing?.[side];
  if (gapValue !== undefined && gapValue !== null && gapValue !== '') {
    const parsed = Number(gapValue);
    if (!Number.isNaN(parsed)) {
      container.style.setProperty('--pb-panel-gap', `${Math.max(0, parsed)}px`);
    }
  } else {
    container.style.removeProperty('--pb-panel-gap');
  }

  // Sort by sortIndex
  modules.sort((a, b) => (a.module.sortIndex || 0) - (b.module.sortIndex || 0));

  if (isEmptyPanel) {
    const hideEmptyText = !!panelBackgrounds?.[side]?.hideEmptyText;
    container.innerHTML = hideEmptyText ? '' : '<div class="pb-page-empty">No panel modules.</div>';
    return;
  }

  container.innerHTML = builderEditing
    ? renderPanelBuilderEditingStack(side, modules, { deviceId: options.deviceId })
    : modules.map(({ module }) => renderModule(module)).join('');
  initEmailForms(container, { previewMode: !!options.previewMode });
  initPromoCarousels(container);
  initEntryGalleryModules(container);
  initFeedModules(container);
  initMediaGalleryModules(container);
}

/**
 * Loads the builder page that owns reader startup.
 * Normal startup no longer reads legacy page-config.json; missing builder pages
 * resolve to a safe empty state instead of repainting the old reader shell.
 *
 * **Retired fallback contract**
 * - `source: 'builder'` — normal path; page was found in the builder API.
 * - `source: 'none'`    — builder returned nothing for the requested page.
 *
 * `createEffectivePageHeader(page, null)` is the steady-state header contract
 * for migrated V3 pages. Legacy page-config data is still accepted by lower
 * level helpers for migration/safety tests, but not fetched here.
 *
 * @param {Function} setSubtitlesFn - Callback to set subtitles
 * @param {string} [seriesId] - Optional series ID override
 * @param {{pageSlug?: string, pageScope?: 'series'|'global', draft?: boolean}} [options] - Page
 * selection and draft mode
 * @returns {Promise<{source: 'builder' | 'none', page?: Object}>} Result with source indicator
 */
export async function loadPageConfigWithFallback(setSubtitlesFn, seriesId = null, options = {}) {
  const sid = seriesId || getActiveSeriesId();
  const requestedPageSlug = sanitizePageSlug(options?.pageSlug || '');
  const pageSlug = requestedPageSlug || 'reader';
  const pageScope = options?.pageScope || getRequestedPageScope();
  const useHomepageResolver = pageScope !== 'global' && !requestedPageSlug;
  const useDraft = !!options?.draft;

  // Try page builder first
  const builderPage = useHomepageResolver
    ? await loadHomepageBuilderPage(sid, { draft: useDraft })
    : await loadBuilderPage(pageSlug, sid, { draft: useDraft, pageScope });
  if (builderPage) {
    const subtitles = extractSubtitlesFromBuilderPage(builderPage, null);
    if (subtitles.length > 0) {
      setSubtitlesFn(subtitles);
    }
    logger.log(`✓ Loaded builder page "${builderPage.slug || pageSlug}" for series: ${sid}`);
    return { source: 'builder', page: builderPage };
  }

  return { source: 'none' };
}

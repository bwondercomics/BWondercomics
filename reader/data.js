/**
 * Data loading utilities for the Battle Bros comic reader
 * Handles fetching and parsing chapter data, page config, and latest posts
 */

import { sanitizeEntries, sortEntryNamesWithMeta } from './entries.js';
import {
  getSeriesDataPath,
  getSeriesPageConfigPath,
  getActiveSeriesId,
  sanitizePageSlug,
} from './series.js';
import { logger } from './logger.js';
import { renderModule, initEmailForms, initPromoCarousels } from './page-renderer.js';
import { initFeedModules } from './feed-panel.js';

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

    const entryMetaPayload = data.entryMeta && typeof data.entryMeta === 'object' ? data.entryMeta : null;
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
        Array.isArray(pages) ? pages.map(resolveProtectedPath) : []
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
      entryLabels: Array.isArray(data.entryLabels) ? data.entryLabels : []
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
  try {
    const configPath = getSeriesPageConfigPath(seriesId);
    const response = await fetch(configPath, { cache: 'no-store' });
    if (!response.ok) {
      console.warn(`Failed to load page config: ${response.status} ${response.statusText}`);
      return false;
    }
    const config = await response.json();

    if (config.content && config.content.header && Array.isArray(config.content.header.subtitles)) {
      setSubtitlesFn(config.content.header.subtitles);
      logger.log(`✓ Page config loaded from ${configPath}`);
    } else {
      console.warn('No subtitles found in page-config.json');
    }

    return true;
  } catch (error) {
    console.error('Failed to load page config:', error);
    return false;
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
    body.innerHTML = '<div class="latest-empty" style="color: var(--danger);">Could not load updates.</div>';
    return null;
  }
}

/**
 * Loads a page from the page builder API.
 * @param {string} slug - The page slug (e.g., "reader")
 * @param {string} [seriesId] - Optional series ID override
 * @param {{draft?: boolean}} [options] - Load unpublished pages through the admin API when enabled
 * @returns {Promise<Object|null>} The page data or null if not found
 */
export async function loadBuilderPage(slug, seriesId = null, options = {}) {
  const sid = seriesId || getActiveSeriesId();
  const pageSlug = sanitizePageSlug(slug) || 'reader';
  const useDraft = !!options?.draft;
  const requestUrl = useDraft
    ? `/api/admin/pages/by-slug/${encodeURIComponent(sid)}/${encodeURIComponent(pageSlug)}`
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
 * Extract subtitles from a page builder page.
 * Looks for header modules and extracts their subtitles array.
 * @param {Object} page - The page data from the builder API
 * @returns {string[]} Array of subtitles
 */
export function extractSubtitlesFromBuilderPage(page) {
  if (!page || !page.sections) return [];

  for (const section of page.sections) {
    for (const mod of section.modules || []) {
      if (mod.moduleType === 'header' && mod.config) {
        // Try subtitles array first, then fall back to single subtitle
        if (Array.isArray(mod.config.subtitles) && mod.config.subtitles.length > 0) {
          return mod.config.subtitles;
        }
        if (mod.config.subtitle) {
          return [mod.config.subtitle];
        }
      }
    }
  }
  return [];
}

/**
 * Apply page-level theme colors from page builder.
 * Sets CSS custom properties on the document root.
 * @param {Object} page - The page data from the builder API
 */
function applyPageTheme(page) {
  if (!page?.meta?.theme) return;

  const theme = page.meta.theme;
  const root = document.documentElement;

  Object.entries(theme).forEach(([key, value]) => {
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
    if (!config || !config.path) {
      panel.style.removeProperty('--panel-bg-image');
      panel.style.removeProperty('--panel-bg-size');
      panel.style.removeProperty('--panel-bg-position');
      panel.style.removeProperty('--panel-bg-opacity');
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

/**
 * Apply page builder modules to the existing DOM elements.
 * Updates header, panels, and other elements based on module config.
 * @param {Object} page - The page data from the builder API
 */
export function applyBuilderPageToDOM(page) {
  if (!page || !page.sections) return;

  // Apply theme first
  applyPageTheme(page);
  applyPanelBackgrounds(page);
  const panelSpacing = page?.meta?.panelSpacing || {};
  const panelBackgrounds = page?.meta?.panelBackgrounds || {};

  // Find modules by type across all sections
  const findModulesByType = (type) => {
    const results = [];
    for (const section of page.sections) {
      for (const mod of section.modules || []) {
        if (mod.moduleType === type) {
          results.push({ module: mod, section });
        }
      }
    }
    return results;
  };

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
    'gallery',
    'video'
  ]);

  const findPanelModules = (side) => {
    const results = [];
    for (const section of page.sections) {
      const layout = section.layout || '1';
      const colCount = layout.split('-').length;
      const leftIndex = 0;
      const rightIndex = colCount > 1 ? colCount - 1 : 0;
      for (const mod of section.modules || []) {
        if (!PANEL_MODULE_TYPES.has(mod.moduleType)) continue;
        if (side === 'left' && mod.columnIndex === leftIndex) {
          results.push({ module: mod, section });
        } else if (side === 'right' && colCount > 1 && mod.columnIndex === rightIndex) {
          results.push({ module: mod, section });
        }
      }
    }
    return results;
  };

  // Apply header module (title/subtitle)
  const headers = findModulesByType('header');
  if (headers.length > 0) {
    const config = headers[0].module.config || {};
    const titleEl = document.querySelector('.topbar .title h1');
    if (titleEl && config.title) {
      titleEl.textContent = config.title;
    }
    const subtitleEl = document.getElementById('subtitle');
    if (subtitleEl && config.subtitle) {
      subtitleEl.textContent = config.subtitle;
    }
  }

  // Apply left/right panel content based on columns
  const leftModules = findPanelModules('left');
  const rightModules = findPanelModules('right');
  renderPanelStack('left', leftModules, panelSpacing, panelBackgrounds);
  renderPanelStack('right', rightModules, panelSpacing, panelBackgrounds);

  // Check panel visibility from section settings
  for (const section of page.sections) {
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

  logger.log('✓ Applied page builder config to DOM');
}

/**
 * Render builder modules into panel stacks.
 */
function renderPanelStack(side, modules, panelSpacing = {}, panelBackgrounds = {}) {
  const panelId = side === 'left' ? 'leftPanel' : 'rightPanel';
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const legacyRightSelectors = ['#rightPanelFeedBar', '#latestUpdate', '#rightPanelFeed', '.right-stack'];
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

  const gapValue = panelSpacing?.[side];
  if (gapValue !== undefined && gapValue !== null && gapValue !== "") {
    const parsed = Number(gapValue);
    if (!Number.isNaN(parsed)) {
      container.style.setProperty('--pb-panel-gap', `${Math.max(0, parsed)}px`);
    }
  } else {
    container.style.removeProperty('--pb-panel-gap');
  }

  // Sort by sortIndex
  modules.sort((a, b) => (a.module.sortIndex || 0) - (b.module.sortIndex || 0));

  if (!modules.length) {
    const hideEmptyText = !!panelBackgrounds?.[side]?.hideEmptyText;
    container.innerHTML = hideEmptyText ? '' : '<div class="pb-page-empty">No panel modules.</div>';
    return;
  }

  container.innerHTML = modules.map(({ module }) => renderModule(module)).join('');
  initEmailForms(container);
  initPromoCarousels(container);
  initFeedModules(container);
}

/**
 * Loads page configuration with fallback.
 * Tries a builder page first, then falls back to legacy page-config for the default reader page only.
 * @param {Function} setSubtitlesFn - Callback to set subtitles
 * @param {string} [seriesId] - Optional series ID override
 * @param {{pageSlug?: string, draft?: boolean}} [options] - Page selection and draft mode
 * @returns {Promise<{source: string, page?: Object}>} Result with source indicator
 */
export async function loadPageConfigWithFallback(setSubtitlesFn, seriesId = null, options = {}) {
  const sid = seriesId || getActiveSeriesId();
  const pageSlug = sanitizePageSlug(options?.pageSlug || '') || 'reader';
  const useDraft = !!options?.draft;
  const allowLegacyFallback = pageSlug === 'reader' && !useDraft;

  // Check for no-fallback mode via localStorage (set in page builder admin)
  const noFallback = localStorage.getItem('pb-no-fallback') === '1';

  // Try page builder first
  const builderPage = await loadBuilderPage(pageSlug, sid, { draft: useDraft });
  if (builderPage) {
    const subtitles = extractSubtitlesFromBuilderPage(builderPage);
    if (subtitles.length > 0) {
      setSubtitlesFn(subtitles);
    }
    logger.log(`✓ Loaded builder page "${pageSlug}" for series: ${sid}`);
    return { source: 'builder', page: builderPage };
  }

  if (!allowLegacyFallback) {
    return { source: 'none' };
  }

  // No fallback mode - stop here and show what we got (nothing)
  if (noFallback) {
    console.warn('NO-FALLBACK MODE: Page builder returned nothing. No legacy fallback applied.');
    return { source: 'none' };
  }

  // Fall back to legacy page-config
  const legacyLoaded = await loadPageConfig(setSubtitlesFn, sid);
  if (legacyLoaded) {
    return { source: 'legacy' };
  }

  return { source: 'none' };
}

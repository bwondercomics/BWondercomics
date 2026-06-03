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
import { applySharedHeaderLayout } from './header-layout.js';
import {
  createEffectivePageHeader,
  resolvePageHeaderState,
} from '../admin/page-builder/header-config.js';
import { escapeHtml } from '../admin/page-builder/helpers.js';
import { mergeAppearance } from '../admin/page-builder/appearance-utils.js';

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

function syncReaderShellBuilderMarkers(page, builderEditing) {
  const pageTargets = [document.body, document.querySelector('.viewerWrap')].filter(Boolean);
  pageTargets.forEach((target) => {
    if (builderEditing && page?.id) {
      target.setAttribute('data-builder-page-id', String(page.id));
      return;
    }
    target.removeAttribute('data-builder-page-id');
  });
  if (!builderEditing) {
    const topbar = document.querySelector('header.topbar#topbar');
    topbar?.removeAttribute('data-builder-page-id');
    topbar?.removeAttribute('data-builder-surface');
  }
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
  if (!page || !page.sections) {
    syncReaderShellBuilderMarkers(null, false);
    return;
  }
  syncReaderShellBuilderMarkers(page, builderEditing);
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

  // Apply theme first
  applyPageTheme(page);
  applyPanelBackgrounds(page);
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
    'gallery',
    'video',
  ]);

  const findPanelModules = (side) => {
    const results = [];
    for (const [sectionIndex, section] of page.sections.entries()) {
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

  // Check panel visibility from section settings
  resetPanelVisibility();
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
  initFeedModules(container);
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
 * @param {{pageSlug?: string, draft?: boolean}} [options] - Page selection and draft mode
 * @returns {Promise<{source: 'builder' | 'none', page?: Object}>} Result with source indicator
 */
export async function loadPageConfigWithFallback(setSubtitlesFn, seriesId = null, options = {}) {
  const sid = seriesId || getActiveSeriesId();
  const requestedPageSlug = sanitizePageSlug(options?.pageSlug || '');
  const pageSlug = requestedPageSlug || 'reader';
  const useHomepageResolver = !requestedPageSlug;
  const useDraft = !!options?.draft;

  // Try page builder first
  const builderPage = useHomepageResolver
    ? await loadHomepageBuilderPage(sid, { draft: useDraft })
    : await loadBuilderPage(pageSlug, sid, { draft: useDraft });
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

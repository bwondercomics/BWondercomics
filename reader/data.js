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
import {
  appearanceToInlineStyle,
  mergeAppearance,
  normalizeAppearance,
} from '../admin/page-builder/appearance-utils.js';
import { getReaderRuntimeConfig } from '../admin/page-builder/reader-config.js';
import {
  getEffectiveColumnSettings,
  getEffectiveModuleConfig,
  isModuleHiddenForDevice,
} from '../admin/page-builder/responsive-overrides.js';
import {
  buildColumnInlineStyle,
  EDITOR_EMPTY_COLUMN_MIN_HEIGHT,
} from '../admin/page-builder/shared-renderers.js';
import { buildPanelResponsiveCss } from '../admin/page-builder/responsive-css.js';

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
  '--reader-control-font-size',
  '--reader-control-font-weight',
  '--reader-control-text-transform',
  '--reader-control-padding-x',
  '--reader-primary-control-bg',
  '--reader-primary-control-color',
  '--reader-primary-control-border',
  '--reader-primary-control-border-width',
  '--reader-primary-control-border-style',
  '--reader-primary-control-border-color',
  '--reader-primary-control-border-radius',
  '--reader-primary-control-font-size',
  '--reader-primary-control-font-weight',
  '--reader-primary-control-text-transform',
]);

const HEX_COLOR_WITHOUT_ALPHA_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

// Module types eligible to render inside reader side panels. findPanelModules surfaces only these
// from the reader section's columns; any other type dropped into a panel column would persist but
// never render. Keep in sync with the insertable section-column module descriptors (see the
// drift-guard test). 'reader' is intentionally excluded — it is the singleton reader shell module.
export const PANEL_MODULE_TYPES = new Set([
  'text',
  'image',
  'html',
  'social',
  'email-signup',
  'buttons',
  'spacer',
  'divider',
  'promo',
  'feed',
  'entry-gallery',
  'media-gallery',
  'gallery',
  'video',
  'account',
  'links-grid',
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

function applyPanelBackgroundToPanel(panel, config) {
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
}

// Unconditional clear of both panels' background vars. Safe to call on every page
// (including no-reader pages, which early-return before the panel render path) so a
// reader→no-reader navigation never leaves stale --panel-bg-* vars on the shell.
function clearPanelBackgrounds() {
  applyPanelBackgroundToPanel(document.getElementById('leftPanel'), null);
  applyPanelBackgroundToPanel(document.getElementById('rightPanel'), null);
  applyPanelShellAppearance(document.getElementById('leftPanel'), null);
  applyPanelShellAppearance(document.getElementById('rightPanel'), null);
  applyPanelShellWeights(null);
}

const PANEL_SHELL_WEIGHT_VARS = Object.freeze([
  '--pb-shell-left-weight',
  '--pb-shell-center-weight',
  '--pb-shell-right-weight',
]);

// Share the shell row proportionally between the left panel, the reader area, and the right
// panel from the reader section's column weights. Only meaningful when the layout has 3+
// columns (left / middle / right all exist); with fewer, the stock fixed panel width applies.
// The CSS lives in main.core.09-side-panels.css, gated to the side-by-side (landscape)
// layout so the aspect-ratio reflow keeps its own widths, and the 250px panel floor remains.
function applyPanelShellWeights(layout) {
  const wrap = document.querySelector('.viewerWrap');
  if (!wrap) return;
  const ratios = String(layout || '')
    .split('-')
    .map((part) => Number(part))
    .filter((num) => Number.isFinite(num) && num > 0);
  if (ratios.length < 3) {
    wrap.removeAttribute('data-pb-shell-weights');
    PANEL_SHELL_WEIGHT_VARS.forEach((cssVar) => wrap.style.removeProperty(cssVar));
    return;
  }
  const centerWeight = ratios.slice(1, -1).reduce((sum, num) => sum + num, 0);
  wrap.setAttribute('data-pb-shell-weights', ratios.join('-'));
  wrap.style.setProperty('--pb-shell-left-weight', String(ratios[0]));
  wrap.style.setProperty('--pb-shell-center-weight', String(centerWeight));
  wrap.style.setProperty('--pb-shell-right-weight', String(ratios[ratios.length - 1]));
}

// The style properties a panel column's appearance may set on the `<aside>` shell. Cleared
// before every apply so removing a setting restores the stock chrome (same pattern as the
// header's controlled topbar props).
const PANEL_SHELL_APPEARANCE_PROPS = Object.freeze([
  'background',
  'color',
  'border',
  'border-width',
  'border-style',
  'border-color',
  'border-radius',
  'font-size',
  'font-weight',
  'text-transform',
]);

// Apply a panel column's appearance to the `<aside>` shell — the element the user sees as
// "the panel" (stock chrome: 4px primary border + dark gradient). The inner column wrapper
// keeps layout styling only (padding/min-height/alignment); painting appearance there just
// draws a box inside the panel. `side-panel--custom-chrome` hides the decorative ::before
// strip so a custom border/background is not visually polluted by the stock accent bar.
function applyPanelShellAppearance(panel, appearance) {
  if (!panel) return;
  PANEL_SHELL_APPEARANCE_PROPS.forEach((prop) => panel.style.removeProperty(prop));
  const styleText = appearance ? appearanceToInlineStyle(appearance) : '';
  let applied = false;
  if (styleText) {
    styleText.split(';').forEach((token) => {
      const separator = token.indexOf(':');
      if (separator === -1) return;
      const prop = token.slice(0, separator).trim();
      const value = token.slice(separator + 1).trim();
      if (value && PANEL_SHELL_APPEARANCE_PROPS.includes(prop)) {
        panel.style.setProperty(prop, value);
        applied = true;
      }
    });
  }
  panel.classList.toggle('side-panel--custom-chrome', applied);
}

// Apply resolved per-side panel background configs. Phase 2 resolves these from the
// reader section's column (see resolvePanelColumnBackground); this is called only on
// the reader path, after the panel columns are known.
function applyPanelBackgrounds({ left, right } = {}) {
  applyPanelBackgroundToPanel(document.getElementById('leftPanel'), left);
  applyPanelBackgroundToPanel(document.getElementById('rightPanel'), right);
}

// Resolve a side's panel background from the reader section's column, falling back to
// legacy page.meta.panelBackgrounds[side] for pages not yet migrated to column data.
function resolvePanelColumnBackground(panelColumn, side, page) {
  const fallback = page?.meta?.panelBackgrounds?.[side] || null;
  if (!panelColumn?.exists) return fallback;
  const colSettings = getEffectiveColumnSettings(panelColumn.section, panelColumn.columnIndex);
  return colSettings?.panelBackground || fallback;
}

// Panel existence follows the reader section's column ratio. The left panel always exists
// (column 0); the right panel exists only once the section has 2+ columns
// (rightPanelColumn.exists). Visibility uses the `hidden` attribute (backed by the global
// `[hidden] { display: none !important }` rule); any stale inline `display` from an earlier
// snapshot is cleared so `hidden` is the single visibility mechanism.
function applyPanelExistence(rightPanelColumn) {
  const leftPanel = document.getElementById('leftPanel');
  const rightPanel = document.getElementById('rightPanel');
  if (leftPanel) {
    leftPanel.style.removeProperty('display');
    setHiddenState(leftPanel, false);
  }
  if (rightPanel) {
    rightPanel.style.removeProperty('display');
    // With no reader-owned column (e.g. a page with no reader section) keep today's default
    // of showing the panel; otherwise existence follows the section's column count.
    const rightExists = rightPanelColumn ? rightPanelColumn.exists === true : true;
    setHiddenState(rightPanel, !rightExists);
  }
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
    `${baseVar}-font-size`,
    `${baseVar}-font-weight`,
    `${baseVar}-text-transform`,
  ].forEach((cssVar) => element.style.removeProperty(cssVar));

  if (backgroundValue) element.style.setProperty(`${baseVar}-bg`, backgroundValue);
  if (text.color) element.style.setProperty(`${baseVar}-color`, text.color);
  // Phase 3 typography: font tokens from the appearance text group.
  if (text.size != null) element.style.setProperty(`${baseVar}-font-size`, `${text.size}px`);
  if (text.weight) element.style.setProperty(`${baseVar}-font-weight`, text.weight);
  if (text.transform) element.style.setProperty(`${baseVar}-text-transform`, text.transform);
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

function resolveReaderModuleShellSettings(page, options = {}) {
  const readerModule = findEffectiveReaderModule(page, options);
  if (!readerModule) {
    return getReaderRuntimeConfig({});
  }
  const effectiveConfig = getEffectiveModuleConfig(readerModule, {
    builderEditing: options.builderEditing === true,
    deviceId: options.deviceId,
  });
  return getReaderRuntimeConfig(effectiveConfig);
}

// Custom reader-button labels (Phase 3). The hardcoded markup text is captured once per
// button and restored when a page has no custom label; `data-reader-label` also lets the
// runtime writers that toggle text (fullscreen FULL/EXIT) restore the authored label.
const READER_CONTROL_LABEL_BUTTONS = Object.freeze({
  prev: 'prevBtn',
  next: 'nextBtn',
  help: 'helpBtn',
  fit: 'fitBtn',
  zoomIn: 'zoomIn',
  zoomOut: 'zoomOut',
  fullscreen: 'fullscreenBtn',
});

function applyReaderControlLabels(labels = {}) {
  Object.entries(READER_CONTROL_LABEL_BUTTONS).forEach(([key, id]) => {
    const button = document.getElementById(id);
    if (!button) return;
    if (button.dataset.readerDefaultLabel === undefined) {
      button.dataset.readerDefaultLabel = button.textContent.trim();
    }
    const custom = String(labels?.[key] || '').trim();
    if (custom) {
      button.dataset.readerLabel = custom;
      button.textContent = custom;
    } else {
      delete button.dataset.readerLabel;
      button.textContent = button.dataset.readerDefaultLabel;
    }
  });
}

export function applyReaderModuleShellSettings(page, options = {}) {
  const settings = resolveReaderModuleShellSettings(page, options);
  const controls = document.getElementById('controls');
  const mainContent = document.getElementById('mainContent');
  const stageWrap = document.getElementById('stageWrap');
  const viewport = document.getElementById('viewport');
  const stage = document.getElementById('stage');
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
    // The bar itself (the .controls container): inline appearance with clear-then-apply,
    // same controlled-props pattern as the panel shell.
    applyPanelShellAppearance(controls, settings.controls.style.bar?.appearance || null);
    controls.classList.remove('side-panel--custom-chrome');
    controls.dataset.readerControlsGlow = settings.controls.style.glow === false ? 'off' : 'on';
    // Granular horizontal button padding (Phase 3); null keeps the size preset's padding.
    const paddingX = settings.controls.style.defaults?.padding;
    if (paddingX != null) {
      controls.style.setProperty('--reader-control-padding-x', `${paddingX}px`);
    }
    applyReaderControlLabels(settings.controls.labels);
    setHiddenState(controls, settings.controls.placement === 'hidden');
  }

  // End-of-entry completion popup: data attrs consumed by reader/controls.js at show time.
  const entryEndOverlay = document.getElementById('entryEndOverlay');
  if (entryEndOverlay) {
    entryEndOverlay.dataset.readerEndOfEntry =
      settings.endOfEntry?.enabled === false ? 'off' : 'on';
    entryEndOverlay.dataset.readerEndTitle = settings.endOfEntry?.title || '';
    entryEndOverlay.dataset.readerEndBody = settings.endOfEntry?.body || '';
  }

  [viewport, stageWrap].forEach((element) => {
    if (!element) return;
    element.dataset.readerStageFit = settings.stage.fit;
    element.dataset.readerStageFrameFill = settings.stage.frameFill || 'hug';
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

// Build one styled panel-column wrapper for a reader-owned column. Builder-editing mode emits the
// section/column markers the bridge collects and floors empty columns to the editor affordance
// height; public mode emits the marker-free `.pb-panel-column`. Both carry the same inline layout
// style (padding, min-height, alignment) and the `pb-column--hidden` class, resolved from the
// column's settings. Appearance (background/border/text) is deliberately NOT painted here — it
// styles the `<aside>` shell via applyPanelShellAppearance, because the shell is what the user
// sees as "the panel". Alignment uses `align-self`: the panel wrapper is a flex item
// (column-direction parent), so align-self controls the horizontal axis exactly like justify-self
// does for grid columns.
function renderPanelColumnWrapper({
  section,
  sectionId,
  sectionIndex,
  layout,
  columnIndex,
  modulesHtml = '',
  builderEditing = false,
  deviceId,
  isEmpty = false,
}) {
  const colSettings = section
    ? getEffectiveColumnSettings(section, columnIndex, { builderEditing, deviceId })
    : {};
  const minHeightFloor = builderEditing && isEmpty ? EDITOR_EMPTY_COLUMN_MIN_HEIGHT : 0;
  const columnStyle = buildColumnInlineStyle(colSettings, {
    minHeightFloor,
    alignmentProperty: 'align-self',
    includeAppearance: false,
  });
  const styleAttr = columnStyle ? ` style="${columnStyle}"` : '';
  const hiddenClass = colSettings?.hidden === true ? ' pb-column--hidden' : '';

  if (builderEditing) {
    const sectionAttrs = builderMarkerAttrs(
      {
        'data-builder-section-id': sectionId,
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
    return `
        <div class="pb-builder-panel-section"${sectionAttrs}>
          <div class="pb-builder-panel-column${hiddenClass}"${columnAttrs}${styleAttr}>${modulesHtml}</div>
        </div>
      `;
  }
  return `<div class="pb-panel-column${hiddenClass}"${styleAttr}>${modulesHtml}</div>`;
}

// Group panel modules by `${sectionId}:${columnIndex}` and render each group through the styled
// wrapper. Serves both the builder and public non-empty paths; only marker emission and the
// renderModule options differ by mode.
function renderPanelColumnStack(side, modules, { builderEditing = false, deviceId } = {}) {
  const groups = new Map();
  modules.forEach((item) => {
    const sectionIndex = Number.isFinite(Number(item.sectionIndex)) ? Number(item.sectionIndex) : 0;
    const columnIndex = getPanelModuleColumnIndex(item, side);
    const section = item.section || {};
    const sectionId = section.id || `section-${sectionIndex}`;
    const groupKey = `${sectionId}:${columnIndex}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { section, sectionIndex, columnIndex, modules: [] });
    }
    groups.get(groupKey).modules.push(item.module);
  });

  return Array.from(groups.values())
    .map(({ section, sectionIndex, columnIndex, modules: groupModules }) =>
      renderPanelColumnWrapper({
        section,
        sectionId: section.id,
        sectionIndex,
        layout: String(section.layout || '1'),
        columnIndex,
        modulesHtml: groupModules
          .map((module) =>
            builderEditing
              ? renderModule(module, { builderEditing: true, deviceId })
              : renderModule(module)
          )
          .join(''),
        builderEditing,
        deviceId,
        isEmpty: false,
      })
    )
    .join('');
}

/**
 * Apply page builder modules to the existing DOM elements.
 * Updates header, panels, and other elements based on module config.
 * @param {Object} page - The page data from the builder API
 */
function pageHasModuleType(page, moduleType) {
  return (page?.sections || []).some((section) =>
    (section.modules || []).some((mod) => mod?.moduleType === moduleType)
  );
}

// Shell chrome as blocks (Phase 6): when a page places an `account` or `links-grid`
// module, the corresponding fixed shell button hides; pages without the module keep
// today's fixed buttons (zero-change default). Inline display beats the feed-mode CSS
// rule that would otherwise re-show the links button.
function syncShellChromeModules(page) {
  const gearBtn = document.getElementById('userSettingsBtn');
  if (gearBtn) {
    gearBtn.style.display = pageHasModuleType(page, 'account') ? 'none' : '';
  }
  const linksBtn = document.getElementById('linksGridBtn');
  if (linksBtn) {
    linksBtn.style.display = pageHasModuleType(page, 'links-grid') ? 'none' : '';
  }
}

export function applyBuilderPageToDOM(page, options = {}) {
  const builderEditing = options.builderEditing === true;
  const deviceId = options.deviceId;
  const shellState = publishReaderShellState(
    resolveReaderShellState(page, { builderEditing, deviceId })
  );
  applyReaderShellDomState(shellState);
  syncShellChromeModules(page);

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
  // Clear panel art up front so a reader→no-reader navigation (which early-returns
  // below) can't leave stale vars; the resolved per-side config is applied after the
  // reader section's panel columns are known.
  clearPanelBackgrounds();

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

  // Panels are reader-owned: only the reader module's own section feeds them, so
  // above/below-reader sections stay page content rather than being pulled into panels.
  const panelSections =
    readerSectionIndex >= 0
      ? [[readerSectionIndex, page.sections[readerSectionIndex]]]
      : Array.from(page.sections.entries());

  // Left/right panel ownership resolves identically in edit and public mode so a panel that looks
  // right in the editor renders the same way when published. Left is column 0; the right panel
  // exists only once the section has 2+ columns and owns exactly the last column. A dropped module
  // lands at exactly leftIndex/rightIndex, so it stays in the same panel across both modes.
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
        } else if (side === 'right' && colCount > 1 && mod.columnIndex === rightIndex) {
          results.push({ module: mod, section, sectionIndex });
        }
      }
    }
    return results;
  };

  // Apply left/right panel content based on columns
  const leftModules = findPanelModules('left');
  const rightModules = findPanelModules('right');

  // Reader-owned panels resolve drops to the reader section's structural columns. Use the stable
  // structural layout (not the device/effective layout) so a mobile reflow that visually collapses
  // columns does not disable a panel. The right panel is droppable only once the section has 2+
  // columns, which keeps the right-panel-disabled invariant identical to findPanelModules above.
  const readerPanelSection = readerSectionIndex >= 0 ? page.sections[readerSectionIndex] : null;
  const readerPanelLayout = String(readerPanelSection?.layout || '1');
  const readerPanelColCount = readerPanelLayout.split('-').filter(Boolean).length;
  const buildPanelColumn = (side) =>
    readerPanelSection
      ? {
          section: readerPanelSection,
          sectionId: readerPanelSection.id,
          sectionIndex: readerSectionIndex,
          layout: readerPanelLayout,
          columnIndex: side === 'left' ? 0 : readerPanelColCount - 1,
          exists: side === 'left' ? true : readerPanelColCount > 1,
          droppable: side === 'left' ? true : readerPanelColCount > 1,
        }
      : null;

  const leftPanelColumn = buildPanelColumn('left');
  const rightPanelColumn = buildPanelColumn('right');

  renderPanelStack('left', leftModules, panelSpacing, panelBackgrounds, {
    previewMode: !!options.previewMode,
    builderEditing,
    deviceId,
    panelColumn: leftPanelColumn,
  });
  renderPanelStack('right', rightModules, panelSpacing, panelBackgrounds, {
    previewMode: !!options.previewMode,
    builderEditing,
    deviceId,
    panelColumn: rightPanelColumn,
  });

  // Panel background art reads from the reader section's column (Phase 2), with a
  // fallback to legacy page.meta.panelBackgrounds[side] for un-migrated pages.
  applyPanelBackgrounds({
    left: resolvePanelColumnBackground(leftPanelColumn, 'left', page),
    right: resolvePanelColumnBackground(rightPanelColumn, 'right', page),
  });

  // Panel existence follows the reader section's column ratio: the left panel always exists
  // (column 0); the right panel exists only once the section has 2+ columns
  // (rightPanelColumn.exists). No runtime toggle can hide a panel anymore.
  applyPanelExistence(rightPanelColumn);

  // Panel width follows the same ratio: with 3+ columns the shell row shares its width
  // proportionally (left panel / reader area / right panel). Uses the stable structural
  // layout, matching panel existence.
  applyPanelShellWeights(readerPanelLayout);

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

  // Phase 2: panel module spacing and empty-state text come from the reader section's
  // column (panelGap / panelBackground.hideEmptyText), falling back to the legacy
  // page.meta values (panelSpacing / panelBackgrounds) when the column carries nothing.
  const panelColumnSettings = options.panelColumn?.exists
    ? getEffectiveColumnSettings(options.panelColumn.section, options.panelColumn.columnIndex, {
        builderEditing,
        deviceId: options.deviceId,
      })
    : null;

  // The column's appearance styles the aside shell itself — the visible panel — overriding
  // the stock chrome. Unset appearance restores the defaults (clear-then-apply).
  applyPanelShellAppearance(panel, panelColumnSettings?.appearance || null);

  // Public panels emit their column's device overrides as scoped @media CSS (the
  // builder preview already JS-merges the active device branch). This keeps a panel's
  // responsive hidden/padding/min-height in parity with the preview on the published
  // page; the wrapper is flex, so a re-shown column uses display:flex (not block).
  // Appearance branches target the aside shell, everything else the column wrapper.
  const panelResponsiveCss =
    !builderEditing && options.panelColumn?.exists
      ? buildPanelResponsiveCss(options.panelColumn.section, options.panelColumn.columnIndex, {
          wrapperSelector: `#${panelId} .pb-panel-column`,
          shellSelector: `#${panelId}`,
        })
      : '';
  const panelResponsiveStyleTag = panelResponsiveCss ? `<style>${panelResponsiveCss}</style>` : '';

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

  const columnGap = panelColumnSettings?.panelGap;
  const gapValue = columnGap !== undefined && columnGap !== null ? columnGap : panelSpacing?.[side];
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
    // In edit mode, render an empty droppable column marker for reader-owned panels so the panel
    // resolves to the reader section's structural column via the existing column target path. The
    // right panel is only droppable once the section has 2+ columns (`panelColumn.droppable`), which
    // enforces the right-panel-disabled-until-2-columns invariant at the source. The wrapper also
    // carries the column's appearance/min-height so an empty panel still shows its authored styling.
    const panelColumn = options.panelColumn;
    if (builderEditing && panelColumn?.droppable) {
      container.innerHTML = renderPanelColumnWrapper({
        section: panelColumn.section,
        sectionId: panelColumn.sectionId,
        sectionIndex: panelColumn.sectionIndex,
        layout: panelColumn.layout,
        columnIndex: panelColumn.columnIndex,
        builderEditing: true,
        deviceId: options.deviceId,
        isEmpty: true,
      });
      return;
    }
    const columnPanelBackground = panelColumnSettings?.panelBackground;
    const hideEmptyText = columnPanelBackground
      ? !!columnPanelBackground.hideEmptyText
      : !!panelBackgrounds?.[side]?.hideEmptyText;
    const emptyContent = hideEmptyText ? '' : '<div class="pb-page-empty">No panel modules.</div>';
    // Public empty panels owned by the reader section still get the styled column wrapper so authored
    // border/min-height render even with no modules; without a reader-owned column (e.g. no reader
    // section, or a right panel before the section has 2+ columns) fall back to bare content.
    container.innerHTML =
      (!builderEditing && panelColumn?.exists
        ? renderPanelColumnWrapper({
            section: panelColumn.section,
            columnIndex: panelColumn.columnIndex,
            modulesHtml: emptyContent,
            builderEditing: false,
            isEmpty: true,
          })
        : emptyContent) + panelResponsiveStyleTag;
    return;
  }

  container.innerHTML =
    renderPanelColumnStack(side, modules, {
      builderEditing,
      deviceId: options.deviceId,
    }) + panelResponsiveStyleTag;
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

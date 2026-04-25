import { normalizeAppearance } from './appearance-utils.js';
import { sanitizeAnchor, sanitizeHref } from './sanitize.js';

const DEFAULT_SERIES_ID = 'battle-bros';

function createId(prefix = 'item') {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizePageSlug(raw = '') {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function sanitizeHash(raw = '') {
  return sanitizeAnchor(raw);
}

function normalizeSeriesId(raw = '') {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || DEFAULT_SERIES_ID;
}

function normalizeLinkTarget(rawTarget = null, legacyUrl = '') {
  const target =
    rawTarget && typeof rawTarget === 'object' && !Array.isArray(rawTarget) ? rawTarget : {};
  const fallbackUrl = String(legacyUrl || target.url || '').trim();
  const rawKind = target.kind || (fallbackUrl.startsWith('#') ? 'anchor' : 'url');
  const kind = ['builder-page', 'url', 'anchor'].includes(rawKind) ? rawKind : 'url';
  const safeUrl = kind === 'url' ? sanitizeHref(fallbackUrl) : '';
  const safeHash = kind === 'anchor' ? sanitizeHash(target.hash || fallbackUrl) : '';
  const pageSlug = kind === 'builder-page' ? sanitizePageSlug(target.pageSlug) : '';
  if (kind === 'builder-page' && !pageSlug) {
    return {
      kind: 'url',
      pageSlug: '',
      url: safeUrl || '#',
      hash: '',
      openInNewTab: target.openInNewTab === true && isExternalUrl(safeUrl),
    };
  }
  return {
    kind,
    pageSlug,
    url: kind === 'url' ? safeUrl || '#' : '',
    hash: kind === 'anchor' ? safeHash || '#' : '',
    openInNewTab: kind === 'url' ? target.openInNewTab === true && isExternalUrl(safeUrl) : false,
  };
}

function normalizeHeaderNavItem(item = {}) {
  return {
    id: item.id || createId('nav'),
    label: String(item.label || item.text || '').trim() || 'Link',
    enabled: item.enabled !== false,
    style: ['primary', 'secondary'].includes(item.style) ? item.style : 'primary',
    link: normalizeLinkTarget(item.link, item.url),
    appearance: normalizeAppearance(item.appearance),
  };
}

function normalizeHeaderNavItems(items = []) {
  return Array.isArray(items) ? items.map(normalizeHeaderNavItem) : [];
}

function normalizeButtonItem(button = {}) {
  return {
    id: button.id || createId('btn'),
    text: String(button.text || '').trim() || 'Button',
    enabled: button.enabled !== false,
    style: String(button.style || 'primary').trim() || 'primary',
    link: normalizeLinkTarget(button.link, button.url),
    appearance: normalizeAppearance(button.appearance),
  };
}

function normalizeButtonsConfig(config = {}) {
  const defaults =
    config?.defaults && typeof config.defaults === 'object' && !Array.isArray(config.defaults)
      ? config.defaults
      : {};
  return {
    ...JSON.parse(JSON.stringify(config || {})),
    defaults: {
      ...JSON.parse(JSON.stringify(defaults)),
      appearance: normalizeAppearance(defaults.appearance),
    },
    buttons: Array.isArray(config.buttons) ? config.buttons.map(normalizeButtonItem) : [],
  };
}

function buildReaderPageHref(pageSlug, seriesId = DEFAULT_SERIES_ID) {
  const params = new URLSearchParams({
    series: normalizeSeriesId(seriesId),
    page: sanitizePageSlug(pageSlug) || 'reader',
  });
  return `index.html?${params.toString()}`;
}

function isExternalUrl(raw = '') {
  return /^https?:\/\//i.test(String(raw || '').trim());
}

function resolveLinkTargetHref(target, options = {}) {
  const seriesId = normalizeSeriesId(options.seriesId || DEFAULT_SERIES_ID);
  const link = normalizeLinkTarget(target);
  if (link.kind === 'builder-page') {
    return buildReaderPageHref(link.pageSlug, seriesId);
  }
  if (link.kind === 'anchor') {
    return link.hash || '#';
  }
  return link.url || '#';
}

function shouldOpenLinkInNewTab(target) {
  const link = normalizeLinkTarget(target);
  return link.kind === 'url' && link.openInNewTab === true && isExternalUrl(link.url);
}

function isBuilderPageTargetMissing(target, pages = []) {
  const link = normalizeLinkTarget(target);
  if (link.kind !== 'builder-page' || !link.pageSlug) return false;
  return !pages.some((page) => sanitizePageSlug(page?.slug) === link.pageSlug);
}

export {
  buildReaderPageHref,
  isBuilderPageTargetMissing,
  normalizeButtonItem,
  normalizeButtonsConfig,
  normalizeHeaderNavItem,
  normalizeHeaderNavItems,
  normalizeLinkTarget,
  normalizeSeriesId,
  resolveLinkTargetHref,
  sanitizePageSlug,
  shouldOpenLinkInNewTab,
};

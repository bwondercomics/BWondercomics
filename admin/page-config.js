import { saveToServer } from './core.js';
import { state } from './state.js';
import { DEFAULT_SERIES_ID } from './state.js';

function cloneConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
  return JSON.parse(JSON.stringify(config));
}

function normalizeConfig(config) {
  return cloneConfig(config);
}

function normalizeSeriesId(seriesId = '') {
  const cleaned = String(seriesId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || DEFAULT_SERIES_ID;
}

function getAdminPageConfigPath(seriesId = DEFAULT_SERIES_ID) {
  const sid = normalizeSeriesId(seriesId);
  return sid === DEFAULT_SERIES_ID ? '/api/admin/page-config.json' : `/api/admin/series/${sid}/page-config.json`;
}

function getPageConfigSaveFilename(seriesId = DEFAULT_SERIES_ID) {
  const sid = normalizeSeriesId(seriesId);
  return sid === DEFAULT_SERIES_ID ? 'admin/page-config.json' : `admin/series/${sid}/page-config.json`;
}

export function getCachedPageConfig() {
  return state.pageConfig ? cloneConfig(state.pageConfig) : null;
}

export function getPageConfigSite(config = state.pageConfig) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
  const site = config.site;
  if (!site || typeof site !== 'object' || Array.isArray(site)) return {};
  return site;
}

export async function loadDefaultPageConfig(options = {}) {
  const { force = false, fallback = null } = options;
  if (!force && state.pageConfig) {
    return cloneConfig(state.pageConfig);
  }

  try {
    const response = await fetch('/page-config.json', { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      state.pageConfig = normalizeConfig(data);
      return cloneConfig(state.pageConfig);
    }
  } catch (error) {
    console.warn('Failed to load page config.', error);
  }

  state.pageConfig = normalizeConfig(fallback);
  return cloneConfig(state.pageConfig);
}

export async function loadSeriesPageConfig(seriesId = DEFAULT_SERIES_ID, options = {}) {
  const { force = false, fallback = null } = options;
  const sid = normalizeSeriesId(seriesId);
  if (!force && state.pageConfig && state.activeSeriesId === sid) {
    return cloneConfig(state.pageConfig);
  }

  try {
    const response = await fetch(getAdminPageConfigPath(sid), { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      state.pageConfig = normalizeConfig(data);
      return cloneConfig(state.pageConfig);
    }
  } catch (error) {
    console.warn('Failed to load series page config.', error);
  }

  state.pageConfig = normalizeConfig(fallback);
  return cloneConfig(state.pageConfig);
}

export async function saveDefaultPageConfig(nextConfig) {
  const normalized = normalizeConfig(nextConfig);
  await saveToServer('admin/page-config.json', normalized);
  state.pageConfig = normalized;
  return cloneConfig(state.pageConfig);
}

export async function saveSeriesPageConfig(seriesId = DEFAULT_SERIES_ID, nextConfig) {
  const normalized = normalizeConfig(nextConfig);
  await saveToServer(getPageConfigSaveFilename(seriesId), normalized);
  state.pageConfig = normalized;
  return cloneConfig(state.pageConfig);
}

export async function updateDefaultPageConfig(updater, options = {}) {
  const { fallback = null } = options;
  const current = await loadDefaultPageConfig({ fallback });
  const next =
    typeof updater === 'function' ? updater(cloneConfig(current)) : normalizeConfig(updater);
  return saveDefaultPageConfig(next);
}

export async function updateSeriesPageConfig(seriesId = DEFAULT_SERIES_ID, updater, options = {}) {
  const { fallback = null } = options;
  const current = await loadSeriesPageConfig(seriesId, { fallback });
  const next =
    typeof updater === 'function' ? updater(cloneConfig(current)) : normalizeConfig(updater);
  return saveSeriesPageConfig(seriesId, next);
}

export { getAdminPageConfigPath, getPageConfigSaveFilename };

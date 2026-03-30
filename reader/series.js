// Series helpers: sanitize query param and map to DB-backed endpoints.
export const DEFAULT_SERIES_ID = 'battle-bros';

export function sanitizeSeriesId(raw = '') {
  const cleaned = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 64);
}

export function sanitizePageSlug(raw = '') {
  const cleaned = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 100);
}

export function getActiveSeriesId() {
  // Resolve active series from URL query, defaulting to the main series.
  const params = new URLSearchParams(window.location.search);
  return sanitizeSeriesId(params.get('series') || '') || DEFAULT_SERIES_ID;
}

export function getRequestedPageSlug() {
  const params = new URLSearchParams(window.location.search);
  return sanitizePageSlug(params.get('page') || '') || 'reader';
}

export function isDraftPageRequested() {
  const params = new URLSearchParams(window.location.search);
  const raw = String(params.get('draft') || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function getSeriesDataPath(seriesId = DEFAULT_SERIES_ID) {
  // DB-backed chapters JSON endpoint.
  const id = sanitizeSeriesId(seriesId) || DEFAULT_SERIES_ID;
  return id === DEFAULT_SERIES_ID ? 'data.json' : `series/${id}/data.json`;
}

export function getSeriesPageConfigPath(seriesId = DEFAULT_SERIES_ID) {
  // DB-backed page config JSON endpoint.
  const id = sanitizeSeriesId(seriesId) || DEFAULT_SERIES_ID;
  return id === DEFAULT_SERIES_ID
    ? 'page-config.json'
    : `series/${id}/page-config.json`;
}

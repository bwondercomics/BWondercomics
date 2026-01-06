export const DEFAULT_SERIES_ID = 'battle-bros';

export function sanitizeSeriesId(raw = '') {
  const cleaned = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 64);
}

export function getActiveSeriesId() {
  const params = new URLSearchParams(window.location.search);
  return sanitizeSeriesId(params.get('series') || '') || DEFAULT_SERIES_ID;
}

export function getSeriesDataPath(seriesId = DEFAULT_SERIES_ID) {
  const id = sanitizeSeriesId(seriesId) || DEFAULT_SERIES_ID;
  return id === DEFAULT_SERIES_ID ? '/admin/data.json' : `/admin/series/${id}/data.json`;
}

export function getSeriesPageConfigPath(seriesId = DEFAULT_SERIES_ID) {
  const id = sanitizeSeriesId(seriesId) || DEFAULT_SERIES_ID;
  return id === DEFAULT_SERIES_ID ? '/admin/page-config.json' : `/admin/series/${id}/page-config.json`;
}

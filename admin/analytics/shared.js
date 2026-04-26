function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatStat(value) {
  if (value === null || value === undefined) return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  return num.toLocaleString('en-US');
}

function formatPercent(value) {
  if (value === null || value === undefined) return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${Math.round(num * 100)}%`;
}

function formatRangeMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`;
}

function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return '0m';
  const minutes = Math.floor(total / 60);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours > 0) return `${hours}h ${remainder}m`;
  return `${minutes}m`;
}

function formatTimeAgo(value) {
  if (!value) return 'just now';
  const date = parseDate(value);
  if (!date) return 'just now';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDateTime(value) {
  const date = parseDate(value);
  if (!date) return '—';
  return date.toLocaleString();
}

function getCssVar(name, fallback) {
  if (!document?.documentElement) return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRangeLabel(rangeKey) {
  if (rangeKey === '24h') return 'Last 24h';
  if (rangeKey === '30d') return 'Last 30d';
  return 'Last 7d';
}

function isValidRange(rangeKey) {
  return rangeKey === '24h' || rangeKey === '7d' || rangeKey === '30d';
}

function formatBucketLabel(rangeKey, timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  if (rangeKey === '24h') {
    return date.toLocaleTimeString('en-US', { hour: 'numeric' });
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatShortDate(value) {
  const date = parseDate(value);
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export {
  escapeHtml,
  formatBucketLabel,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatRangeLabel,
  formatRangeMinutes,
  formatShortDate,
  formatStat,
  formatTimeAgo,
  getCssVar,
  isValidRange,
};

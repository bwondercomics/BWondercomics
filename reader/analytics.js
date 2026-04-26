// Reader analytics: track page views, exits, and completion events via Umami.
import { CONFIG } from './config.js';
import { state } from './state.js';
import { getActiveSeriesId } from './series.js';
import { setLiveReaderContext } from './live-tracking.js';

const EVENT_PAGE_VIEW = 'reader_page_view';
const EVENT_ENTRY_COMPLETE = 'reader_entry_complete';
const EVENT_ENTRY_EXIT = 'reader_entry_exit';
const COUNT_VIEWS_KEY = 'battlebros_count_views';

let lastVisibleKey = '';
let lastExitKey = '';
let completedEntryKey = '';
let pendingEvents = [];

function getTracker() {
  const tracker = window.umami;
  if (!tracker) return null;
  if (typeof tracker.track === 'function') return tracker.track.bind(tracker);
  if (typeof tracker === 'function') return tracker;
  return null;
}

function canTrackViews() {
  try {
    return localStorage.getItem(COUNT_VIEWS_KEY) !== 'false';
  } catch {
    return true;
  }
}

function trackEvent(name, data) {
  if (!canTrackViews()) {
    pendingEvents = [];
    return;
  }
  const tracker = getTracker();
  if (!tracker) {
    pendingEvents.push({ name, data });
    return;
  }
  flushPending(tracker);
  try {
    tracker(name, data);
  } catch {
    // Ignore analytics failures to avoid breaking the reader.
  }
}

function flushPending(tracker) {
  const active = tracker || getTracker();
  if (!active || !pendingEvents.length) return false;
  const queued = pendingEvents;
  pendingEvents = [];
  queued.forEach((event) => {
    try {
      active(event.name, event.data);
    } catch {
      // Ignore analytics failures to avoid breaking the reader.
    }
  });
  return true;
}

function parseEntryNumber(raw) {
  const parsed = Number.isFinite(raw) ? raw : parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatEntryLabel(seriesId, entryDescriptor) {
  if (!seriesId || !entryDescriptor) return '';
  return `${seriesId} | ${entryDescriptor}`;
}

function formatPageLabel(seriesId, entryDescriptor, pageNumber) {
  if (!seriesId || !entryDescriptor) return '';
  return `${seriesId} | ${entryDescriptor} | ${pageNumber}`;
}

function getEntryTrackingInfo() {
  const seriesId = getActiveSeriesId();
  const entryName = state.currentEntry || '';
  let entryNumber = null;
  let entryDescriptor = '';

  const select = document.getElementById('entry');
  if (select && select.options && select.options.length) {
    let option = select.options[select.selectedIndex];
    if (entryName && option && option.value !== entryName) {
      option = Array.from(select.options).find((opt) => opt.value === entryName) || option;
    }
    entryNumber = parseEntryNumber(option?.dataset?.displayNumber);
    const optionLabel = String(option?.dataset?.entryLabel || '').trim();
    if (optionLabel) entryDescriptor = optionLabel;
  }

  if (!entryDescriptor) {
    entryDescriptor = entryNumber != null ? `Entry ${entryNumber}` : entryName;
  }

  const entryLabel = seriesId && entryDescriptor ? formatEntryLabel(seriesId, entryDescriptor) : '';
  const entryKey =
    seriesId && entryDescriptor
      ? entryNumber != null
        ? `${seriesId}::entry-${entryNumber}`
        : `${seriesId}::${entryName}`
      : '';

  return { seriesId, entryName, entryNumber, entryDescriptor, entryLabel, entryKey };
}

function canShowTwoPages() {
  const aspectRatio = window.innerWidth / window.innerHeight;
  const hasMinWidth = window.innerWidth >= CONFIG.TWO_PAGE_BREAKPOINT;
  const isWideEnough = aspectRatio > CONFIG.TWO_PAGE_ASPECT_RATIO;
  return hasMinWidth && isWideEnough && state.pageIndex + 1 < state.pages.length;
}

function getVisiblePageIndexes() {
  const total = state.pages.length;
  if (!total) return [];
  const indexes = [state.pageIndex];
  if (canShowTwoPages()) indexes.push(state.pageIndex + 1);
  return indexes.filter((idx) => idx >= 0 && idx < total);
}

export function setActiveEntry() {
  const { entryKey } = getEntryTrackingInfo();
  if (entryKey && completedEntryKey && completedEntryKey !== entryKey) {
    completedEntryKey = '';
  }
  lastVisibleKey = '';
  lastExitKey = '';
}

export function resetEntryCompletion() {
  completedEntryKey = '';
}

export function trackVisiblePages() {
  const { seriesId, entryName, entryNumber, entryDescriptor, entryLabel } = getEntryTrackingInfo();
  const total = state.pages.length;
  if (!seriesId || !entryDescriptor || !total) return;

  const indexes = getVisiblePageIndexes();
  if (!indexes.length) return;

  const visibleKey = `${seriesId}::${entryDescriptor}::${indexes.join(',')}`;
  if (visibleKey === lastVisibleKey) return;
  lastVisibleKey = visibleKey;

  const entryValue = entryNumber != null ? String(entryNumber) : entryName;

  indexes.forEach((idx) => {
    const pageNumber = idx + 1;
    trackEvent(EVENT_PAGE_VIEW, {
      series: seriesId,
      entry: entryValue,
      entryLabel,
      entryNumber: entryNumber != null ? entryNumber : undefined,
      page: pageNumber,
      pageLabel: formatPageLabel(seriesId, entryDescriptor, pageNumber),
      totalPages: total,
    });
  });

  const lastVisible = Math.max(...indexes) + 1;
  setLiveReaderContext({
    seriesId,
    entryTitle: entryDescriptor,
    entryLabel,
    pageNumber: lastVisible,
  });
}

export function markEntryComplete() {
  const { seriesId, entryName, entryNumber, entryDescriptor, entryLabel, entryKey } =
    getEntryTrackingInfo();
  const total = state.pages.length;
  if (!seriesId || !entryDescriptor || !total) return;
  if (completedEntryKey === entryKey) return;
  completedEntryKey = entryKey;

  trackEvent(EVENT_ENTRY_COMPLETE, {
    series: seriesId,
    entry: entryNumber != null ? String(entryNumber) : entryName,
    entryLabel,
    entryNumber: entryNumber != null ? entryNumber : undefined,
    totalPages: total,
  });
}

export function trackEntryExit(reason = 'exit') {
  const { seriesId, entryName, entryNumber, entryDescriptor, entryLabel, entryKey } =
    getEntryTrackingInfo();
  const total = state.pages.length;
  if (!seriesId || !entryDescriptor || !total) return;

  const indexes = getVisiblePageIndexes();
  if (!indexes.length) return;
  const lastVisible = Math.min(total, Math.max(...indexes) + 1);

  const exitKey = `${entryKey}::${lastVisible}`;
  if (exitKey === lastExitKey) return;
  lastExitKey = exitKey;

  const stopLabel = formatPageLabel(seriesId, entryDescriptor, lastVisible);
  const finished = completedEntryKey === entryKey;

  trackEvent(EVENT_ENTRY_EXIT, {
    series: seriesId,
    entry: entryNumber != null ? String(entryNumber) : entryName,
    entryLabel,
    entryNumber: entryNumber != null ? entryNumber : undefined,
    page: lastVisible,
    stopLabel,
    totalPages: total,
    finished,
    reason,
  });
}

export function initReaderAnalytics() {
  if (!canTrackViews()) return;
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (!pendingEvents.length || attempts > 10 || flushPending()) {
      window.clearInterval(timer);
      return;
    }
  }, 1000);

  window.addEventListener('pagehide', () => {
    trackEntryExit('pagehide');
  });
}

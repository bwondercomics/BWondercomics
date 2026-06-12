import { waitForReaderShellState } from './shell-state.js';

const TRACK_ENDPOINT = '/api/track/visitor';
const VISITOR_ID_KEY = 'battlebros_visitor_id';
const COUNT_VIEWS_KEY = 'battlebros_count_views';
const HEARTBEAT_MS = 60_000;
const MIN_UPDATE_MS = 15_000;

let started = false;
let visitorId = null;
let lastSentAt = 0;
let memoryVisitorId = null;
let context = {
  path: '',
  title: '',
  origin: '',
  referrer: '',
  seriesId: '',
  entryTitle: '',
  entryLabel: '',
  pageNumber: null,
};

function isBuilderPreview() {
  try {
    const raw = new URLSearchParams(window.location.search || '').get('builderPreview');
    return ['1', 'true', 'yes'].includes(
      String(raw || '')
        .trim()
        .toLowerCase()
    );
  } catch {
    return false;
  }
}

function canTrack() {
  try {
    return localStorage.getItem(COUNT_VIEWS_KEY) !== 'false';
  } catch {
    return true;
  }
}

function buildVisitorId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  const rand = Math.random().toString(36).slice(2);
  const stamp = Date.now().toString(36);
  return `v-${rand}${stamp}`;
}

function getVisitorId() {
  if (memoryVisitorId) return memoryVisitorId;
  try {
    const stored = localStorage.getItem(VISITOR_ID_KEY);
    if (stored) {
      memoryVisitorId = stored;
      return stored;
    }
    const next = buildVisitorId();
    localStorage.setItem(VISITOR_ID_KEY, next);
    memoryVisitorId = next;
    return next;
  } catch {
    memoryVisitorId = buildVisitorId();
    return memoryVisitorId;
  }
}

function buildPayload() {
  return {
    visitorId,
    path: context.path || '',
    title: context.title || '',
    origin: context.origin || '',
    referrer: context.referrer || '',
    seriesId: context.seriesId || '',
    entryTitle: context.entryTitle || '',
    entryLabel: context.entryLabel || '',
    pageNumber: typeof context.pageNumber === 'number' ? context.pageNumber : null,
  };
}

function sendUpdate({ force = false, keepalive = false } = {}) {
  if (!started || !visitorId || !canTrack()) return;
  const now = Date.now();
  if (!force && now - lastSentAt < MIN_UPDATE_MS) return;
  lastSentAt = now;

  const payload = buildPayload();
  if (navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify(payload)], {
      type: 'application/json',
    });
    navigator.sendBeacon(TRACK_ENDPOINT, blob);
    return;
  }
  fetch(TRACK_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive,
  }).catch(() => {});
}

function updateContext(partial) {
  context = { ...context, ...partial };
}

export function setLiveReaderContext({ seriesId, entryTitle, entryLabel, pageNumber } = {}) {
  if (!started || !canTrack()) return;
  updateContext({
    seriesId: seriesId || context.seriesId,
    entryTitle: entryTitle || context.entryTitle,
    entryLabel: entryLabel || context.entryLabel,
    pageNumber: typeof pageNumber === 'number' ? pageNumber : context.pageNumber,
  });
  sendUpdate();
}

export function updateLiveContext(partial = {}) {
  if (!started || !canTrack()) return;
  updateContext(partial);
  sendUpdate();
}

export async function initLiveTracking() {
  if (started || !canTrack() || isBuilderPreview()) return;
  const shellState = await waitForReaderShellState();
  if (started || !canTrack() || isBuilderPreview() || shellState.active !== true) return;
  started = true;
  visitorId = getVisitorId();
  updateContext({
    path: `${window.location.pathname}${window.location.search || ''}`,
    title: document.title || '',
    origin: window.location.origin || '',
    referrer: document.referrer || '',
  });
  sendUpdate({ force: true });

  window.setInterval(() => {
    sendUpdate();
  }, HEARTBEAT_MS);

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      sendUpdate({ force: true, keepalive: true });
    }
  });

  window.addEventListener('pagehide', () => {
    sendUpdate({ force: true, keepalive: true });
  });
}

initLiveTracking();

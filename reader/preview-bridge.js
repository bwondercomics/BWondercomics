import {
  BUILDER_PREVIEW_MESSAGE_TYPES,
  BUILDER_PREVIEW_SNAPSHOT_VERSION,
  PREVIEW_MEDIA_QUERIES,
  buildPreviewControlMessage,
  buildPreviewMetricsMessage,
  getPreviewViewport,
  isPreviewViewportId,
  validatePreviewEnvelope,
} from '../admin/page-builder/preview-contract.js';
import { CONFIG } from './config.js';
import {
  getActiveSeriesId,
  getPreviewPageId,
  getPreviewSessionToken,
  getRequestedPageSlug,
} from './series.js';

const DEFAULT_TIMEOUT_MS = 5000;
const OVERFLOW_SELECTORS = Object.freeze([
  'header.topbar',
  '.header-actions',
  '.viewerWrap',
  '.controls',
  '.pb-page',
  '.pb-section',
  '.pb-buttons',
  '.pb-html',
]);

let activePreviewContext = null;
let activeSnapshotSubscriptionCleanup = null;

function getExpectedIdentity(overrides = {}) {
  return {
    previewSession: overrides.previewSession || getPreviewSessionToken(),
    snapshotVersion: BUILDER_PREVIEW_SNAPSHOT_VERSION,
    seriesId: overrides.seriesId || getActiveSeriesId(),
    pageId: overrides.pageId || getPreviewPageId(),
    pageSlug: overrides.pageSlug || getRequestedPageSlug(),
  };
}

function postToParent(message) {
  if (!window.parent) return;
  window.parent.postMessage(message, window.location.origin);
}

function isExpectedSource(event) {
  return event.origin === window.location.origin && event.source === window.parent;
}

function createBridgeError(message) {
  const err = new Error(message || 'Invalid preview snapshot.');
  err.name = 'BuilderPreviewBridgeError';
  return err;
}

function getSnapshotExpectedIdentity(snapshot, overrides = {}) {
  return {
    previewSession: overrides.previewSession || getPreviewSessionToken(),
    snapshotVersion: snapshot?.snapshotVersion || BUILDER_PREVIEW_SNAPSHOT_VERSION,
    seriesId: snapshot?.seriesId || overrides.seriesId || getActiveSeriesId(),
    pageId: snapshot?.pageId || overrides.pageId || getPreviewPageId(),
    pageSlug: snapshot?.pageSlug || overrides.pageSlug || getRequestedPageSlug(),
  };
}

export function setPreviewMetricsContext(snapshot, overrides = {}) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  activePreviewContext = {
    expected: getSnapshotExpectedIdentity(snapshot, overrides),
    snapshot,
  };
  return activePreviewContext;
}

function resolveSnapshotViewport(snapshot) {
  const rawViewport = snapshot?.options?.viewport || {};
  if (isPreviewViewportId(rawViewport.id)) {
    return { ...getPreviewViewport(rawViewport.id) };
  }
  return {
    id: String(rawViewport.id || 'desktop'),
    label: String(rawViewport.label || 'Desktop'),
    width: Number(rawViewport.width) || window.innerWidth || 0,
    height: Number(rawViewport.height) || window.innerHeight || 0,
  };
}

function collectBranchFlags() {
  return Object.entries(PREVIEW_MEDIA_QUERIES).reduce((acc, [key, config]) => {
    acc[key] =
      typeof window.matchMedia === 'function' ? !!window.matchMedia(config.query).matches : false;
    return acc;
  }, {});
}

function isPreviewTwoPageMode() {
  const aspectRatio = window.innerWidth / window.innerHeight;
  const hasMinWidth = window.innerWidth >= CONFIG.TWO_PAGE_BREAKPOINT;
  const isWideEnough = aspectRatio > CONFIG.TWO_PAGE_ASPECT_RATIO;
  return hasMinWidth && isWideEnough;
}

function getElementOverflowOffenders(viewportWidth) {
  const offenders = [];
  const tolerance = 1;
  OVERFLOW_SELECTORS.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node, index) => {
      if (typeof node.getBoundingClientRect !== 'function') return;
      const rect = node.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const leftOverflow = rect.left < -tolerance;
      const rightOverflow = rect.right > viewportWidth + tolerance;
      if (!leftOverflow && !rightOverflow) return;
      offenders.push({
        selector,
        index,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        viewportWidth,
        side: leftOverflow && rightOverflow ? 'both' : leftOverflow ? 'left' : 'right',
      });
    });
  });
  return offenders;
}

function collectOverflowMetrics(viewportWidth) {
  const docEl = document.documentElement;
  const body = document.body;
  const rootScrollWidth = Math.max(docEl?.scrollWidth || 0, body?.scrollWidth || 0);
  const rootClientWidth = Math.max(docEl?.clientWidth || 0, body?.clientWidth || 0, viewportWidth);
  const rootHasOverflow = rootScrollWidth > rootClientWidth + 1;
  const offenders = getElementOverflowOffenders(viewportWidth);
  return {
    hasOverflow: rootHasOverflow || offenders.length > 0,
    rootHasOverflow,
    offenders,
  };
}

export function collectPreviewMetrics(snapshot = activePreviewContext?.snapshot) {
  if (!snapshot) return null;
  const viewport = resolveSnapshotViewport(snapshot);
  const innerWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
  const innerHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
  return {
    viewport,
    innerWidth,
    innerHeight,
    pageSlug: snapshot.pageSlug || '',
    snapshotVersion: snapshot.snapshotVersion,
    twoPageMode: isPreviewTwoPageMode(),
    branchFlags: collectBranchFlags(),
    overflow: collectOverflowMetrics(innerWidth),
  };
}

export function emitPreviewMetrics(reason = 'manual') {
  if (!activePreviewContext) return null;
  const metrics = collectPreviewMetrics(activePreviewContext.snapshot);
  if (!metrics) return null;
  metrics.reason = reason;
  postToParent(buildPreviewMetricsMessage(metrics, activePreviewContext.expected));
  return metrics;
}

export function validatePreviewMessageEvent(event, expected = getExpectedIdentity()) {
  if (!isExpectedSource(event)) {
    return { valid: false, reason: 'Unexpected preview message source.' };
  }
  return validatePreviewEnvelope(event.data, expected);
}

export function requestPreviewSnapshot(options = {}) {
  const expected = getExpectedIdentity(options);
  const timeoutMs =
    typeof options.timeoutMs === 'number' && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let timeoutId = null;

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const sendError = (reason) => {
      postToParent(
        buildPreviewControlMessage(BUILDER_PREVIEW_MESSAGE_TYPES.ERROR, {
          ...expected,
          error: reason,
        })
      );
    };

    const handleMessage = (event) => {
      if (!isExpectedSource(event)) return;
      const message = event.data;
      if (!message || message.type !== BUILDER_PREVIEW_MESSAGE_TYPES.SNAPSHOT) return;

      const validation = validatePreviewEnvelope(message, expected);
      if (!validation.valid) {
        cleanup();
        sendError(validation.reason);
        reject(createBridgeError(validation.reason));
        return;
      }

      cleanup();
      setPreviewMetricsContext(message.snapshot, expected);
      postToParent(buildPreviewControlMessage(BUILDER_PREVIEW_MESSAGE_TYPES.ACK, expected));
      resolve({
        source: 'builder',
        page: message.snapshot.page,
        previewMode: true,
        builderEditing: message.snapshot.options?.builderEditing === true,
        snapshot: message.snapshot,
      });
    };

    window.addEventListener('message', handleMessage);
    timeoutId = window.setTimeout(() => {
      cleanup();
      const reason = 'Timed out waiting for preview snapshot.';
      sendError(reason);
      reject(createBridgeError(reason));
    }, timeoutMs);

    postToParent(
      buildPreviewControlMessage(BUILDER_PREVIEW_MESSAGE_TYPES.REQUEST_SNAPSHOT, expected)
    );
  });
}

export function subscribePreviewSnapshots(onSnapshot, options = {}) {
  if (activeSnapshotSubscriptionCleanup) {
    activeSnapshotSubscriptionCleanup();
    activeSnapshotSubscriptionCleanup = null;
  }

  const expected = getExpectedIdentity(options);

  const sendError = (reason) => {
    postToParent(
      buildPreviewControlMessage(BUILDER_PREVIEW_MESSAGE_TYPES.ERROR, {
        ...expected,
        error: reason,
      })
    );
  };

  const handleMessage = (event) => {
    if (!isExpectedSource(event)) return;
    const message = event.data;
    if (!message || message.type !== BUILDER_PREVIEW_MESSAGE_TYPES.SNAPSHOT) return;

    const validation = validatePreviewEnvelope(message, expected);
    if (!validation.valid) {
      sendError(validation.reason);
      return;
    }

    setPreviewMetricsContext(message.snapshot, expected);
    postToParent(buildPreviewControlMessage(BUILDER_PREVIEW_MESSAGE_TYPES.ACK, expected));
    try {
      onSnapshot?.({
        source: 'builder',
        page: message.snapshot.page,
        previewMode: true,
        builderEditing: message.snapshot.options?.builderEditing === true,
        snapshot: message.snapshot,
      });
    } catch (err) {
      sendError(err?.message || 'Failed to apply preview snapshot.');
    }
  };

  window.addEventListener('message', handleMessage);
  activeSnapshotSubscriptionCleanup = () => {
    window.removeEventListener('message', handleMessage);
  };
  return activeSnapshotSubscriptionCleanup;
}

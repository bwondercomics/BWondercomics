import {
  BUILDER_PREVIEW_MESSAGE_TYPES,
  BUILDER_PREVIEW_SNAPSHOT_VERSION,
  buildPreviewControlMessage,
  validatePreviewEnvelope,
} from '../admin/page-builder/preview-contract.js';
import {
  getActiveSeriesId,
  getPreviewPageId,
  getPreviewSessionToken,
  getRequestedPageSlug,
} from './series.js';

const DEFAULT_TIMEOUT_MS = 5000;

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
      postToParent(buildPreviewControlMessage(BUILDER_PREVIEW_MESSAGE_TYPES.ACK, expected));
      resolve({
        source: 'builder',
        page: message.snapshot.page,
        previewMode: true,
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

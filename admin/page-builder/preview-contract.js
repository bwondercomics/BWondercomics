export const PREVIEW_VIEWPORT_ORDER = Object.freeze(['desktop', 'tablet', 'mobile']);

export const PREVIEW_VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ id: 'desktop', label: 'Desktop', width: 1280, height: 900 }),
  tablet: Object.freeze({ id: 'tablet', label: 'Tablet', width: 768, height: 1024 }),
  mobile: Object.freeze({ id: 'mobile', label: 'Mobile', width: 375, height: 812 }),
});

export const BUILDER_PREVIEW_SNAPSHOT_VERSION = 1;

export const BUILDER_PREVIEW_MESSAGE_TYPES = Object.freeze({
  REQUEST_SNAPSHOT: 'builder-preview:request-snapshot',
  SNAPSHOT: 'builder-preview:snapshot',
  ACK: 'builder-preview:ack',
  ERROR: 'builder-preview:error',
});

export const BUILDER_PREVIEW_SOURCES = Object.freeze({
  SAVED: 'saved',
  WORKING: 'working',
});

export const DEFAULT_BUILDER_PREVIEW_SIDE_EFFECTS = Object.freeze({
  emailSubmissions: 'stubbed',
  analyticsWrites: 'disabled',
  commentsSubmissions: 'disabled',
  externalNavigation: 'disabled',
  fullscreen: 'disabled',
});

/**
 * @typedef {'desktop'|'tablet'|'mobile'} BuilderPreviewViewportId
 * @typedef {'saved'|'working'} BuilderPreviewSource
 * @typedef {'draft'|'published'} BuilderPreviewDraftMode
 *
 * @typedef {Object} BuilderPreviewViewport
 * @property {BuilderPreviewViewportId} id
 * @property {string} label
 * @property {number} width
 * @property {number} height
 *
 * @typedef {Object} BuilderPreviewOptions
 * @property {BuilderPreviewViewport} viewport
 * @property {Record<string, string>} sideEffects
 * @property {{top: number, left: number}} scrollState
 *
 * @typedef {Object} BuilderPreviewSnapshotPayload
 * @property {string} seriesId
 * @property {string} pageId
 * @property {string} pageSlug
 * @property {BuilderPreviewDraftMode} draftMode
 * @property {number} snapshotVersion
 * @property {BuilderPreviewSource} source
 * @property {Object} page
 * @property {BuilderPreviewOptions} options
 */

const VALID_PREVIEW_MESSAGE_TYPES = new Set(Object.values(BUILDER_PREVIEW_MESSAGE_TYPES));

export function isPreviewViewportId(id) {
  return Object.prototype.hasOwnProperty.call(PREVIEW_VIEWPORTS, String(id || ''));
}

export function getPreviewViewport(id) {
  const normalizedId = String(id || '');
  return PREVIEW_VIEWPORTS[
    isPreviewViewportId(normalizedId) ? normalizedId : PREVIEW_VIEWPORT_ORDER[0]
  ];
}

export function isPreviewSource(source) {
  return source === BUILDER_PREVIEW_SOURCES.SAVED || source === BUILDER_PREVIEW_SOURCES.WORKING;
}

export function getPreviewStatusCopy(source) {
  return source === BUILDER_PREVIEW_SOURCES.WORKING
    ? 'Previewing unsaved working changes'
    : 'Previewing saved draft';
}

function normalizeIdentity(value) {
  return String(value || '').trim();
}

function validationResult(valid, reason = '') {
  return valid ? { valid: true, reason: '' } : { valid: false, reason };
}

export function isPreviewMessageType(type) {
  return VALID_PREVIEW_MESSAGE_TYPES.has(String(type || ''));
}

export function buildPreviewSnapshotMessage(snapshot, previewSession) {
  return {
    type: BUILDER_PREVIEW_MESSAGE_TYPES.SNAPSHOT,
    previewSession: normalizeIdentity(previewSession),
    snapshot,
  };
}

export function buildPreviewControlMessage(type, details = {}) {
  return {
    type,
    previewSession: normalizeIdentity(details.previewSession),
    snapshotVersion: details.snapshotVersion ?? BUILDER_PREVIEW_SNAPSHOT_VERSION,
    seriesId: normalizeIdentity(details.seriesId),
    pageId: normalizeIdentity(details.pageId),
    pageSlug: normalizeIdentity(details.pageSlug),
    ...(details.error ? { error: String(details.error) } : {}),
  };
}

export function validatePreviewSnapshotPayload(snapshot, expected = {}) {
  if (!snapshot || typeof snapshot !== 'object') {
    return validationResult(false, 'Snapshot must be an object.');
  }
  if (snapshot.snapshotVersion !== BUILDER_PREVIEW_SNAPSHOT_VERSION) {
    return validationResult(false, 'Unsupported snapshot version.');
  }
  if (!isPreviewSource(snapshot.source)) {
    return validationResult(false, 'Unsupported preview source.');
  }
  if (snapshot.draftMode !== 'draft' && snapshot.draftMode !== 'published') {
    return validationResult(false, 'Unsupported draft mode.');
  }
  if (
    !snapshot.page ||
    typeof snapshot.page !== 'object' ||
    !Array.isArray(snapshot.page.sections)
  ) {
    return validationResult(false, 'Snapshot page is missing sections.');
  }

  const identityChecks = [
    ['seriesId', expected.seriesId],
    ['pageId', expected.pageId],
    ['pageSlug', expected.pageSlug],
  ];
  for (const [key, expectedValue] of identityChecks) {
    const normalizedExpected = normalizeIdentity(expectedValue);
    if (normalizedExpected && normalizeIdentity(snapshot[key]) !== normalizedExpected) {
      return validationResult(false, `Snapshot ${key} mismatch.`);
    }
  }

  return validationResult(true);
}

export function validatePreviewEnvelope(message, expected = {}) {
  if (!message || typeof message !== 'object') {
    return validationResult(false, 'Preview message must be an object.');
  }
  if (!isPreviewMessageType(message.type)) {
    return validationResult(false, 'Unknown preview message type.');
  }
  const expectedSession = normalizeIdentity(expected.previewSession);
  if (expectedSession && normalizeIdentity(message.previewSession) !== expectedSession) {
    return validationResult(false, 'Preview session mismatch.');
  }
  if (message.type === BUILDER_PREVIEW_MESSAGE_TYPES.SNAPSHOT) {
    return validatePreviewSnapshotPayload(message.snapshot, expected);
  }
  if (
    message.snapshotVersion !== undefined &&
    message.snapshotVersion !== BUILDER_PREVIEW_SNAPSHOT_VERSION
  ) {
    return validationResult(false, 'Unsupported snapshot version.');
  }
  const identityChecks = [
    ['seriesId', expected.seriesId],
    ['pageId', expected.pageId],
    ['pageSlug', expected.pageSlug],
  ];
  for (const [key, expectedValue] of identityChecks) {
    const normalizedExpected = normalizeIdentity(expectedValue);
    if (normalizedExpected && normalizeIdentity(message[key]) !== normalizedExpected) {
      return validationResult(false, `Preview message ${key} mismatch.`);
    }
  }
  return validationResult(true);
}

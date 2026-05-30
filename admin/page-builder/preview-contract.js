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
  METRICS: 'builder-preview:metrics',
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

export const PREVIEW_MEDIA_QUERIES = Object.freeze({
  aspectMax7By5: Object.freeze({
    label: 'Aspect <= 7/5',
    query: '(max-aspect-ratio: 7/5)',
    expected: Object.freeze({ desktop: false, tablet: true, mobile: true }),
  }),
  aspectMax5By7: Object.freeze({
    label: 'Aspect <= 5/7',
    query: '(max-aspect-ratio: 5/7)',
    expected: Object.freeze({ desktop: false, tablet: false, mobile: true }),
  }),
  maxWidth768: Object.freeze({
    label: 'Width <= 768px',
    query: '(max-width: 768px)',
    expected: Object.freeze({ desktop: false, tablet: true, mobile: true }),
  }),
  maxWidth480: Object.freeze({
    label: 'Width <= 480px',
    query: '(max-width: 480px)',
    expected: Object.freeze({ desktop: false, tablet: false, mobile: true }),
  }),
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
 * @property {boolean} builderEditing
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
 *
 * @typedef {Object} BuilderPreviewMetricsPayload
 * @property {BuilderPreviewViewport} viewport
 * @property {number} innerWidth
 * @property {number} innerHeight
 * @property {string} pageSlug
 * @property {number} snapshotVersion
 * @property {boolean} twoPageMode
 * @property {Record<string, boolean>} branchFlags
 * @property {{hasOverflow: boolean, rootHasOverflow: boolean, offenders: Array<Object>}} overflow
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

export function buildPreviewMetricsMessage(metrics, details = {}) {
  return {
    type: BUILDER_PREVIEW_MESSAGE_TYPES.METRICS,
    previewSession: normalizeIdentity(details.previewSession),
    snapshotVersion:
      details.snapshotVersion ?? metrics?.snapshotVersion ?? BUILDER_PREVIEW_SNAPSHOT_VERSION,
    seriesId: normalizeIdentity(details.seriesId),
    pageId: normalizeIdentity(details.pageId),
    pageSlug: normalizeIdentity(details.pageSlug ?? metrics?.pageSlug),
    metrics,
  };
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
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
  if (
    snapshot.options &&
    Object.prototype.hasOwnProperty.call(snapshot.options, 'builderEditing') &&
    typeof snapshot.options.builderEditing !== 'boolean'
  ) {
    return validationResult(false, 'Snapshot builderEditing option is invalid.');
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

export function validatePreviewMetricsPayload(metrics, expected = {}) {
  if (!isPlainObject(metrics)) {
    return validationResult(false, 'Metrics must be an object.');
  }

  const viewport = metrics.viewport;
  if (!isPlainObject(viewport)) {
    return validationResult(false, 'Metrics viewport is missing.');
  }
  if (!isPreviewViewportId(viewport.id)) {
    return validationResult(false, 'Metrics viewport id is unsupported.');
  }
  const expectedViewport = getPreviewViewport(viewport.id);
  if (typeof viewport.label !== 'string') {
    return validationResult(false, 'Metrics viewport label is invalid.');
  }
  if (
    !isFiniteNumber(viewport.width) ||
    !isFiniteNumber(viewport.height) ||
    viewport.width !== expectedViewport.width ||
    viewport.height !== expectedViewport.height
  ) {
    return validationResult(false, 'Metrics viewport dimensions are invalid.');
  }

  if (!isFiniteNumber(metrics.innerWidth) || !isFiniteNumber(metrics.innerHeight)) {
    return validationResult(false, 'Metrics inner dimensions are invalid.');
  }
  if (metrics.snapshotVersion !== BUILDER_PREVIEW_SNAPSHOT_VERSION) {
    return validationResult(false, 'Unsupported metrics snapshot version.');
  }
  const expectedPageSlug = normalizeIdentity(expected.pageSlug);
  if (typeof metrics.pageSlug !== 'string') {
    return validationResult(false, 'Metrics page slug is invalid.');
  }
  if (expectedPageSlug && normalizeIdentity(metrics.pageSlug) !== expectedPageSlug) {
    return validationResult(false, 'Metrics pageSlug mismatch.');
  }
  if (typeof metrics.twoPageMode !== 'boolean') {
    return validationResult(false, 'Metrics two-page state is invalid.');
  }

  if (!isPlainObject(metrics.branchFlags)) {
    return validationResult(false, 'Metrics branch flags are missing.');
  }
  for (const key of Object.keys(PREVIEW_MEDIA_QUERIES)) {
    if (typeof metrics.branchFlags[key] !== 'boolean') {
      return validationResult(false, `Metrics branch flag ${key} is invalid.`);
    }
  }

  if (!isPlainObject(metrics.overflow)) {
    return validationResult(false, 'Metrics overflow summary is missing.');
  }
  if (
    typeof metrics.overflow.hasOverflow !== 'boolean' ||
    typeof metrics.overflow.rootHasOverflow !== 'boolean' ||
    !Array.isArray(metrics.overflow.offenders)
  ) {
    return validationResult(false, 'Metrics overflow summary is invalid.');
  }
  for (const offender of metrics.overflow.offenders) {
    if (!isPlainObject(offender) || typeof offender.selector !== 'string') {
      return validationResult(false, 'Metrics overflow offender is invalid.');
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
  if (message.type === BUILDER_PREVIEW_MESSAGE_TYPES.METRICS) {
    if (message.snapshotVersion !== BUILDER_PREVIEW_SNAPSHOT_VERSION) {
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
    return validatePreviewMetricsPayload(message.metrics, expected);
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

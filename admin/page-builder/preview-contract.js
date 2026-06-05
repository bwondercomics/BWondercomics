export const PREVIEW_VIEWPORT_ORDER = Object.freeze(['desktop', 'tablet', 'mobile']);

export const PREVIEW_VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ id: 'desktop', label: 'Desktop', width: 1280, height: 900 }),
  tablet: Object.freeze({ id: 'tablet', label: 'Tablet', width: 768, height: 1024 }),
  mobile: Object.freeze({ id: 'mobile', label: 'Mobile', width: 375, height: 812 }),
});

export const BUILDER_DEVICE_ORDER = PREVIEW_VIEWPORT_ORDER;

export const BUILDER_DEVICES = Object.freeze({
  desktop: Object.freeze({ ...PREVIEW_VIEWPORTS.desktop, label: 'Desktop' }),
  tablet: Object.freeze({ ...PREVIEW_VIEWPORTS.tablet, label: 'Tablet' }),
  mobile: Object.freeze({ ...PREVIEW_VIEWPORTS.mobile, label: 'Phone' }),
});

export const BUILDER_PREVIEW_SNAPSHOT_VERSION = 1;

export const BUILDER_PREVIEW_MESSAGE_TYPES = Object.freeze({
  REQUEST_SNAPSHOT: 'builder-preview:request-snapshot',
  SNAPSHOT: 'builder-preview:snapshot',
  ACK: 'builder-preview:ack',
  ERROR: 'builder-preview:error',
  METRICS: 'builder-preview:metrics',
  TARGETS: 'builder-preview:targets',
  TARGET_HOVER: 'builder-preview:target-hover',
  TARGET_SELECT: 'builder-preview:target-select',
  TARGET_ACTION: 'builder-preview:target-action',
  INLINE_EDIT_START: 'builder-preview:inline-edit-start',
  INLINE_EDIT_CHANGE: 'builder-preview:inline-edit-change',
  INLINE_EDIT_COMMIT: 'builder-preview:inline-edit-commit',
  INLINE_EDIT_CANCEL: 'builder-preview:inline-edit-cancel',
});

export const BUILDER_PREVIEW_TARGET_KINDS = Object.freeze({
  PAGE: 'page',
  HEADER: 'header',
  SECTION: 'section',
  COLUMN: 'column',
  MODULE: 'module',
});

export const BUILDER_PREVIEW_TARGET_ACTIONS = Object.freeze({
  REFRESH_TARGETS: 'refresh-targets',
  CLEAR_HOVER: 'clear-hover',
  SCROLL_INTO_VIEW: 'scroll-into-view',
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
 * @typedef {'desktop'|'tablet'|'mobile'} BuilderDeviceId
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
 * @property {BuilderDeviceId=} deviceId
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
 *
 * @typedef {Object} BuilderPreviewTargetRef
 * @property {'page'|'header'|'section'|'column'|'module'} kind
 * @property {string} key
 * @property {string} pageId
 * @property {string=} sectionId
 * @property {number=} columnIndex
 * @property {string=} moduleId
 * @property {string=} moduleType
 * @property {string=} surface
 *
 * @typedef {Object} BuilderPreviewTargetRect
 * @property {number} top
 * @property {number} left
 * @property {number} right
 * @property {number} bottom
 * @property {number} width
 * @property {number} height
 *
 * @typedef {Object} BuilderPreviewTargetGeometry
 * @property {BuilderPreviewTargetRef} target
 * @property {BuilderPreviewTargetRect} rect
 * @property {boolean} visible
 * @property {number} order
 * @property {string} label
 */

const VALID_PREVIEW_MESSAGE_TYPES = new Set(Object.values(BUILDER_PREVIEW_MESSAGE_TYPES));
const VALID_PREVIEW_TARGET_KINDS = new Set(Object.values(BUILDER_PREVIEW_TARGET_KINDS));
const VALID_PREVIEW_TARGET_ACTIONS = new Set(Object.values(BUILDER_PREVIEW_TARGET_ACTIONS));
const TARGET_MESSAGE_TYPES = new Set([
  BUILDER_PREVIEW_MESSAGE_TYPES.TARGETS,
  BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_HOVER,
  BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_SELECT,
  BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_ACTION,
]);
const INLINE_EDIT_MESSAGE_TYPES = new Set([
  BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_START,
  BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE,
  BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_COMMIT,
  BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CANCEL,
]);
const MAX_TARGET_ITEMS = 500;
const MAX_TARGET_STRING_LENGTH = 180;
const MAX_TARGET_LABEL_LENGTH = 120;
const MAX_INLINE_EDIT_VALUE_LENGTH = 50000;
const MAX_RECT_ABS_VALUE = 1000000;
const INLINE_EDIT_FIELDS = new Set(['content']);

export function isPreviewViewportId(id) {
  return Object.prototype.hasOwnProperty.call(PREVIEW_VIEWPORTS, String(id || ''));
}

export function isBuilderDeviceId(id) {
  return Object.prototype.hasOwnProperty.call(BUILDER_DEVICES, String(id || ''));
}

export function getPreviewViewport(id) {
  const normalizedId = String(id || '');
  return PREVIEW_VIEWPORTS[
    isPreviewViewportId(normalizedId) ? normalizedId : PREVIEW_VIEWPORT_ORDER[0]
  ];
}

export function getBuilderDevice(id) {
  const normalizedId = String(id || '');
  return BUILDER_DEVICES[isBuilderDeviceId(normalizedId) ? normalizedId : BUILDER_DEVICE_ORDER[0]];
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

export function buildPreviewTargetMessage(type, payload = {}, details = {}) {
  const message = {
    type,
    previewSession: normalizeIdentity(details.previewSession),
    snapshotVersion:
      details.snapshotVersion ?? payload.snapshotVersion ?? BUILDER_PREVIEW_SNAPSHOT_VERSION,
    seriesId: normalizeIdentity(details.seriesId),
    pageId: normalizeIdentity(details.pageId),
    pageSlug: normalizeIdentity(details.pageSlug),
    sequence: Number.isSafeInteger(payload.sequence) ? payload.sequence : 0,
  };

  if (payload.reason) {
    message.reason = String(payload.reason).slice(0, MAX_TARGET_LABEL_LENGTH);
  }

  if (type === BUILDER_PREVIEW_MESSAGE_TYPES.TARGETS) {
    message.targets = Array.isArray(payload.targets) ? payload.targets : [];
    return message;
  }

  if (type === BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_ACTION) {
    message.action = String(payload.action || '');
    if (payload.target !== undefined) {
      message.target = payload.target;
    }
    return message;
  }

  message.target = payload.target ?? null;
  return message;
}

export function buildPreviewInlineEditMessage(type, payload = {}, details = {}) {
  const message = {
    type,
    previewSession: normalizeIdentity(details.previewSession),
    snapshotVersion:
      details.snapshotVersion ?? payload.snapshotVersion ?? BUILDER_PREVIEW_SNAPSHOT_VERSION,
    seriesId: normalizeIdentity(details.seriesId),
    pageId: normalizeIdentity(details.pageId),
    pageSlug: normalizeIdentity(details.pageSlug),
    sequence: Number.isSafeInteger(payload.sequence) ? payload.sequence : 0,
    target: payload.target ?? null,
    field: String(payload.field || ''),
  };

  if (payload.value !== undefined) {
    message.value = String(payload.value).slice(0, MAX_INLINE_EDIT_VALUE_LENGTH);
  }
  if (payload.reason) {
    message.reason = String(payload.reason).slice(0, MAX_TARGET_LABEL_LENGTH);
  }

  return message;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isBoundedString(value, maxLength = MAX_TARGET_STRING_LENGTH, allowEmpty = false) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  if (!allowEmpty && !normalized) return false;
  return normalized.length <= maxLength;
}

function isSafeNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
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
  if (
    snapshot.options &&
    Object.prototype.hasOwnProperty.call(snapshot.options, 'deviceId') &&
    !isBuilderDeviceId(snapshot.options.deviceId)
  ) {
    return validationResult(false, 'Snapshot deviceId option is invalid.');
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

export function validatePreviewTargetRef(target) {
  if (!isPlainObject(target)) {
    return validationResult(false, 'Target reference must be an object.');
  }
  if (!VALID_PREVIEW_TARGET_KINDS.has(target.kind)) {
    return validationResult(false, 'Target kind is unsupported.');
  }
  if (!isBoundedString(target.key)) {
    return validationResult(false, 'Target key is invalid.');
  }
  if (!isBoundedString(target.pageId)) {
    return validationResult(false, 'Target pageId is invalid.');
  }

  for (const field of ['sectionId', 'moduleId', 'moduleType', 'surface']) {
    if (
      target[field] !== undefined &&
      target[field] !== null &&
      !isBoundedString(target[field], MAX_TARGET_STRING_LENGTH, true)
    ) {
      return validationResult(false, `Target ${field} is invalid.`);
    }
  }
  if (target.columnIndex !== undefined && target.columnIndex !== null) {
    if (!isSafeNonNegativeInteger(target.columnIndex)) {
      return validationResult(false, 'Target columnIndex is invalid.');
    }
  }

  if (target.kind === BUILDER_PREVIEW_TARGET_KINDS.MODULE && !isBoundedString(target.moduleId)) {
    return validationResult(false, 'Module target is missing moduleId.');
  }
  if (target.kind === BUILDER_PREVIEW_TARGET_KINDS.SECTION && !isBoundedString(target.sectionId)) {
    return validationResult(false, 'Section target is missing sectionId.');
  }
  if (target.kind === BUILDER_PREVIEW_TARGET_KINDS.COLUMN) {
    if (!isBoundedString(target.sectionId)) {
      return validationResult(false, 'Column target is missing sectionId.');
    }
    if (!isSafeNonNegativeInteger(target.columnIndex)) {
      return validationResult(false, 'Column target is missing columnIndex.');
    }
  }
  if (
    target.kind === BUILDER_PREVIEW_TARGET_KINDS.HEADER &&
    target.surface !== undefined &&
    target.surface !== 'page-header'
  ) {
    return validationResult(false, 'Header target surface is invalid.');
  }

  return validationResult(true);
}

function validatePreviewTargetRect(rect) {
  if (!isPlainObject(rect)) {
    return validationResult(false, 'Target rect must be an object.');
  }
  for (const field of ['top', 'left', 'right', 'bottom', 'width', 'height']) {
    if (!isFiniteNumber(rect[field]) || Math.abs(rect[field]) > MAX_RECT_ABS_VALUE) {
      return validationResult(false, `Target rect ${field} is invalid.`);
    }
  }
  if (rect.width < 0 || rect.height < 0) {
    return validationResult(false, 'Target rect dimensions are invalid.');
  }
  return validationResult(true);
}

export function validatePreviewTargetGeometry(targetGeometry) {
  if (!isPlainObject(targetGeometry)) {
    return validationResult(false, 'Target geometry must be an object.');
  }
  const targetValidation = validatePreviewTargetRef(targetGeometry.target);
  if (!targetValidation.valid) return targetValidation;

  const rectValidation = validatePreviewTargetRect(targetGeometry.rect);
  if (!rectValidation.valid) return rectValidation;

  if (typeof targetGeometry.visible !== 'boolean') {
    return validationResult(false, 'Target visibility is invalid.');
  }
  if (!isSafeNonNegativeInteger(targetGeometry.order)) {
    return validationResult(false, 'Target order is invalid.');
  }
  if (!isBoundedString(targetGeometry.label, MAX_TARGET_LABEL_LENGTH, true)) {
    return validationResult(false, 'Target label is invalid.');
  }
  return validationResult(true);
}

export function validatePreviewTargetsPayload(message) {
  if (!isPlainObject(message)) {
    return validationResult(false, 'Target message must be an object.');
  }
  if (!isSafeNonNegativeInteger(message.sequence)) {
    return validationResult(false, 'Target sequence is invalid.');
  }
  if (!Array.isArray(message.targets) || message.targets.length > MAX_TARGET_ITEMS) {
    return validationResult(false, 'Target list is invalid.');
  }
  for (const targetGeometry of message.targets) {
    const validation = validatePreviewTargetGeometry(targetGeometry);
    if (!validation.valid) return validation;
  }
  return validationResult(true);
}

export function validatePreviewTargetStatePayload(message, { allowNull = false } = {}) {
  if (!isPlainObject(message)) {
    return validationResult(false, 'Target state message must be an object.');
  }
  if (!isSafeNonNegativeInteger(message.sequence)) {
    return validationResult(false, 'Target sequence is invalid.');
  }
  if (allowNull && message.target === null) {
    return validationResult(true);
  }
  return validatePreviewTargetRef(message.target);
}

export function validatePreviewTargetActionPayload(message) {
  if (!isPlainObject(message)) {
    return validationResult(false, 'Target action message must be an object.');
  }
  if (!isSafeNonNegativeInteger(message.sequence)) {
    return validationResult(false, 'Target sequence is invalid.');
  }
  if (!VALID_PREVIEW_TARGET_ACTIONS.has(message.action)) {
    return validationResult(false, 'Target action is unsupported.');
  }
  if (message.action === BUILDER_PREVIEW_TARGET_ACTIONS.SCROLL_INTO_VIEW) {
    return validatePreviewTargetRef(message.target);
  }
  if (message.target !== undefined && message.target !== null) {
    return validatePreviewTargetRef(message.target);
  }
  return validationResult(true);
}

export function validatePreviewInlineEditPayload(message) {
  if (!isPlainObject(message)) {
    return validationResult(false, 'Inline edit message must be an object.');
  }
  if (!INLINE_EDIT_MESSAGE_TYPES.has(message.type)) {
    return validationResult(false, 'Inline edit message type is unsupported.');
  }
  if (!isSafeNonNegativeInteger(message.sequence)) {
    return validationResult(false, 'Inline edit sequence is invalid.');
  }
  const targetValidation = validatePreviewTargetRef(message.target);
  if (!targetValidation.valid) return targetValidation;
  if (message.target.kind !== BUILDER_PREVIEW_TARGET_KINDS.MODULE) {
    return validationResult(false, 'Inline edit target must be a module.');
  }
  if (message.target.moduleType !== 'text') {
    return validationResult(false, 'Inline edit target module type is unsupported.');
  }
  if (!INLINE_EDIT_FIELDS.has(message.field)) {
    return validationResult(false, 'Inline edit field is unsupported.');
  }
  if (
    message.type === BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE ||
    message.type === BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_COMMIT
  ) {
    if (typeof message.value !== 'string') {
      return validationResult(false, 'Inline edit value is required.');
    }
    if (message.value.length > MAX_INLINE_EDIT_VALUE_LENGTH) {
      return validationResult(false, 'Inline edit value is too long.');
    }
  } else if (
    message.value !== undefined &&
    (typeof message.value !== 'string' || message.value.length > MAX_INLINE_EDIT_VALUE_LENGTH)
  ) {
    return validationResult(false, 'Inline edit value is invalid.');
  }
  if (
    message.reason !== undefined &&
    !isBoundedString(message.reason, MAX_TARGET_LABEL_LENGTH, true)
  ) {
    return validationResult(false, 'Inline edit reason is invalid.');
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
    (TARGET_MESSAGE_TYPES.has(message.type) || INLINE_EDIT_MESSAGE_TYPES.has(message.type)) &&
    message.snapshotVersion !== BUILDER_PREVIEW_SNAPSHOT_VERSION
  ) {
    return validationResult(false, 'Unsupported snapshot version.');
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
  if (TARGET_MESSAGE_TYPES.has(message.type)) {
    if (message.type === BUILDER_PREVIEW_MESSAGE_TYPES.TARGETS) {
      return validatePreviewTargetsPayload(message);
    }
    if (message.type === BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_HOVER) {
      return validatePreviewTargetStatePayload(message, { allowNull: true });
    }
    if (message.type === BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_SELECT) {
      return validatePreviewTargetStatePayload(message);
    }
    return validatePreviewTargetActionPayload(message);
  }
  if (INLINE_EDIT_MESSAGE_TYPES.has(message.type)) {
    return validatePreviewInlineEditPayload(message);
  }
  return validationResult(true);
}

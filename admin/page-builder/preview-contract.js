export const PREVIEW_VIEWPORT_ORDER = Object.freeze(['desktop', 'tablet', 'mobile']);

export const PREVIEW_VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ id: 'desktop', label: 'Desktop', width: 1280, height: 900 }),
  tablet: Object.freeze({ id: 'tablet', label: 'Tablet', width: 768, height: 1024 }),
  mobile: Object.freeze({ id: 'mobile', label: 'Mobile', width: 375, height: 812 }),
});

export const BUILDER_PREVIEW_SNAPSHOT_VERSION = 1;

export const BUILDER_PREVIEW_MESSAGE_TYPES = Object.freeze({
  SNAPSHOT: 'builder-preview:snapshot',
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

import { normalizeAppearance } from './appearance-utils.js';

export const READER_DISPLAY_MODES = Object.freeze(['paged', 'vertical-scroll']);
export const READER_CONTROLS_PLACEMENTS = Object.freeze(['above', 'below', 'overlay', 'hidden']);
export const READER_CONTROLS_SIZES = Object.freeze(['compact', 'medium', 'large']);
export const READER_STAGE_FITS = Object.freeze(['dynamic-frame', 'width', 'height', 'natural']);
export const READER_STAGE_MAX_WIDTH_MIN = 320;
export const READER_STAGE_MAX_WIDTH_MAX = 2400;

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function pickKeyword(value, allowed, fallback) {
  const normalized = String(value || '').trim();
  return allowed.includes(normalized) ? normalized : fallback;
}

function coerceBool(value, fallback = true) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') {
    const raw = value.trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(raw)) return false;
    if (['true', '1', 'yes', 'on'].includes(raw)) return true;
  }
  return Boolean(value);
}

function clampInt(value, fallback, minimum, maximum) {
  let parsed;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return fallback;
    parsed = Math.trunc(value);
  } else if (typeof value === 'string') {
    // Match Python int(): reject trailing units/decimals so crafted input
    // (e.g. "480px", "12.5") falls back identically on client and server.
    if (!/^\s*-?\d+\s*$/.test(value)) return fallback;
    parsed = parseInt(value, 10);
  } else {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, parsed));
}

function normalizeStageMaxWidth(value) {
  if (value === null || value === undefined || value === '') return null;
  return clampInt(value, null, READER_STAGE_MAX_WIDTH_MIN, READER_STAGE_MAX_WIDTH_MAX);
}

function normalizeReaderControlsStyle(rawStyle = {}) {
  const source = isObject(rawStyle) ? rawStyle : {};
  const defaults =
    source.defaults && isObject(source.defaults)
      ? normalizeAppearance(source.defaults.appearance)
      : null;
  const primary =
    source.primary && isObject(source.primary)
      ? normalizeAppearance(source.primary.appearance)
      : null;
  return {
    defaults: { appearance: defaults },
    primary: { appearance: primary },
  };
}

export function normalizeReaderConfig(rawConfig = {}) {
  const config = isObject(rawConfig) ? rawConfig : {};
  const controls = isObject(config.controls) ? config.controls : {};
  const stage = isObject(config.stage) ? config.stage : {};
  const source = isObject(config.source) ? cloneValue(config.source) : {};

  // Panel existence is driven by the reader section's column ratio, not reader-module
  // config. Legacy `config.panels` / `config.showPanels` on saved configs are ignored here
  // (tolerated so old configs still parse) and are no longer emitted, so nothing downstream
  // can reintroduce a runtime panel toggle.
  return {
    source,
    displayMode: pickKeyword(config.displayMode, READER_DISPLAY_MODES, 'paged'),
    showComments: coerceBool(config.showComments, true),
    controls: {
      placement: pickKeyword(controls.placement, READER_CONTROLS_PLACEMENTS, 'below'),
      size: pickKeyword(controls.size, READER_CONTROLS_SIZES, 'medium'),
      style: normalizeReaderControlsStyle(controls.style),
    },
    stage: {
      fit: pickKeyword(stage.fit, READER_STAGE_FITS, 'dynamic-frame'),
      pageGap: clampInt(stage.pageGap, 8, 0, 64),
      frameBorder: coerceBool(stage.frameBorder, true),
      maxWidth: normalizeStageMaxWidth(stage.maxWidth),
    },
  };
}

export function normalizeReaderResponsiveBranch(rawBranch = {}) {
  const branch = isObject(rawBranch) ? rawBranch : {};
  const base = normalizeReaderConfig(branch);
  const payload = {};
  if (Object.prototype.hasOwnProperty.call(branch, 'displayMode')) {
    payload.displayMode = base.displayMode;
  }
  if (Object.prototype.hasOwnProperty.call(branch, 'showComments')) {
    payload.showComments = base.showComments;
  }
  if (isObject(branch.controls)) {
    payload.controls = {};
    if (Object.prototype.hasOwnProperty.call(branch.controls, 'placement')) {
      payload.controls.placement = base.controls.placement;
    }
    if (Object.prototype.hasOwnProperty.call(branch.controls, 'size')) {
      payload.controls.size = base.controls.size;
    }
  }
  if (isObject(branch.stage)) {
    payload.stage = {};
    if (Object.prototype.hasOwnProperty.call(branch.stage, 'fit')) {
      payload.stage.fit = base.stage.fit;
    }
    if (Object.prototype.hasOwnProperty.call(branch.stage, 'pageGap')) {
      payload.stage.pageGap = base.stage.pageGap;
    }
  }
  return payload;
}

export function getReaderRuntimeConfig(rawConfig = {}) {
  const config = normalizeReaderConfig(rawConfig);
  // The runtime now honors the authored display mode. `requestedDisplayMode`
  // is kept identical for parity/diagnostics and preview-bridge comparisons.
  return {
    ...config,
    displayMode: config.displayMode,
    requestedDisplayMode: config.displayMode,
  };
}

export function getReaderMountDataAttributes(rawConfig = {}) {
  const config = normalizeReaderConfig(rawConfig);
  return {
    'data-display-mode': config.displayMode,
    'data-controls-placement': config.controls.placement,
    'data-controls-size': config.controls.size,
    'data-stage-fit': config.stage.fit,
    'data-stage-page-gap': String(config.stage.pageGap),
    'data-stage-frame-border': String(config.stage.frameBorder),
    'data-stage-max-width': config.stage.maxWidth == null ? '' : String(config.stage.maxWidth),
    'data-show-comments': String(config.showComments),
  };
}

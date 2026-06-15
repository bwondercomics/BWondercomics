import { normalizeAppearance } from './appearance-utils.js';

export const READER_DISPLAY_MODES = Object.freeze(['paged', 'vertical-scroll']);
export const READER_RUNTIME_DISPLAY_MODE = 'paged';
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
  const panels = isObject(config.panels) ? config.panels : {};
  const legacyPanelsEnabled = coerceBool(config.showPanels, true);
  const leftPanel = isObject(panels.left) ? panels.left : {};
  const rightPanel = isObject(panels.right) ? panels.right : {};
  const leftPanelEnabled = coerceBool(leftPanel.enabled, legacyPanelsEnabled);
  const rightPanelEnabled = coerceBool(rightPanel.enabled, legacyPanelsEnabled);
  const source = isObject(config.source) ? cloneValue(config.source) : {};

  return {
    source,
    displayMode: pickKeyword(config.displayMode, READER_DISPLAY_MODES, 'paged'),
    showPanels: leftPanelEnabled || rightPanelEnabled,
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
    panels: {
      left: { enabled: leftPanelEnabled },
      right: { enabled: rightPanelEnabled },
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
  if (isObject(branch.panels)) {
    const panelsPayload = {};
    const left = isObject(branch.panels.left) ? branch.panels.left : null;
    const right = isObject(branch.panels.right) ? branch.panels.right : null;
    if (left && Object.prototype.hasOwnProperty.call(left, 'enabled')) {
      panelsPayload.left = { enabled: base.panels.left.enabled };
    }
    if (right && Object.prototype.hasOwnProperty.call(right, 'enabled')) {
      panelsPayload.right = { enabled: base.panels.right.enabled };
    }
    if (Object.keys(panelsPayload).length) {
      payload.panels = panelsPayload;
    }
  }
  return payload;
}

export function getReaderRuntimeConfig(rawConfig = {}) {
  const config = normalizeReaderConfig(rawConfig);
  return {
    ...config,
    displayMode: READER_RUNTIME_DISPLAY_MODE,
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
    'data-left-panel-enabled': String(config.panels.left.enabled),
    'data-right-panel-enabled': String(config.panels.right.enabled),
    'data-show-panels': String(config.showPanels),
    'data-show-comments': String(config.showComments),
  };
}

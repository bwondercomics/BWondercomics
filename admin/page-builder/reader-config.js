import { normalizeAppearance } from './appearance-utils.js';

export const READER_DISPLAY_MODES = Object.freeze(['paged', 'vertical-scroll']);
export const READER_CONTROLS_PLACEMENTS = Object.freeze(['above', 'below', 'overlay', 'hidden']);
export const READER_CONTROLS_SIZES = Object.freeze(['compact', 'medium', 'large']);
export const READER_STAGE_FITS = Object.freeze(['dynamic-frame', 'width', 'height', 'natural']);
export const READER_STAGE_FRAME_FILLS = Object.freeze(['hug', 'fill']);
export const READER_STAGE_MAX_WIDTH_MIN = 320;
export const READER_STAGE_MAX_WIDTH_MAX = 2400;

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toSparseObject(value) {
  if (!isObject(value)) return value == null ? undefined : value;
  const entries = Object.entries(value)
    .map(([key, item]) => [key, toSparseObject(item)])
    .filter(([, item]) => item !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
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
  const defaultsSource = isObject(source.defaults) ? source.defaults : {};
  const defaults = normalizeAppearance(defaultsSource.appearance);
  const primary =
    source.primary && isObject(source.primary)
      ? normalizeAppearance(source.primary.appearance)
      : null;
  const bar =
    source.bar && isObject(source.bar) ? normalizeAppearance(source.bar.appearance) : null;
  return {
    defaults: {
      appearance: defaults,
      // Horizontal button padding in px; null = the size preset's padding.
      padding:
        defaultsSource.padding === null ||
        defaultsSource.padding === undefined ||
        defaultsSource.padding === ''
          ? null
          : clampInt(defaultsSource.padding, null, 0, 48),
    },
    primary: { appearance: primary },
    bar: { appearance: bar },
    // Neon box/text shadows on the bar, buttons, and page indicator. On = stock look.
    glow: coerceBool(source.glow, true),
  };
}

// Custom reader-button labels (Phase 3): sparse — only authored labels persist; the
// hardcoded button text stays the default for unset keys.
export const READER_CONTROL_LABEL_KEYS = Object.freeze([
  'prev',
  'next',
  'help',
  'fit',
  'zoomIn',
  'zoomOut',
  'fullscreen',
]);

function normalizeReaderControlsLabels(rawLabels = {}) {
  const source = isObject(rawLabels) ? rawLabels : {};
  const labels = {};
  READER_CONTROL_LABEL_KEYS.forEach((key) => {
    const value = String(source[key] || '')
      .trim()
      .slice(0, 24);
    if (value) labels[key] = value;
  });
  return labels;
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
  const endOfEntry = isObject(config.endOfEntry) ? config.endOfEntry : {};

  return {
    source,
    displayMode: pickKeyword(config.displayMode, READER_DISPLAY_MODES, 'paged'),
    showComments: coerceBool(config.showComments, true),
    // Completion popup shown after the last page: on by default (stock behavior);
    // optional title/body replace the dynamic default copy.
    endOfEntry: {
      enabled: coerceBool(endOfEntry.enabled, true),
      title: String(endOfEntry.title || '').slice(0, 120),
      body: String(endOfEntry.body || '').slice(0, 300),
    },
    controls: {
      placement: pickKeyword(controls.placement, READER_CONTROLS_PLACEMENTS, 'below'),
      size: pickKeyword(controls.size, READER_CONTROLS_SIZES, 'medium'),
      style: normalizeReaderControlsStyle(controls.style),
      labels: normalizeReaderControlsLabels(controls.labels),
    },
    stage: {
      fit: pickKeyword(stage.fit, READER_STAGE_FITS, 'dynamic-frame'),
      // 'hug' = the dynamic frame wraps the pages (stock); 'fill' = the frame spans the
      // reader column so the pages container scales with the column and controls.
      frameFill: pickKeyword(stage.frameFill, READER_STAGE_FRAME_FILLS, 'hug'),
      pageGap: clampInt(stage.pageGap, 8, 0, 64),
      frameBorder: coerceBool(stage.frameBorder, true),
      maxWidth: normalizeStageMaxWidth(stage.maxWidth),
    },
  };
}

// A reader device branch keeps only fields the PUBLIC runtime can honor per device:
// the visibility flag (emitted as scoped display CSS) and control-button styling
// (emitted as scoped --reader-control-* CSS vars plus padding). Display mode, controls
// placement/size, stage, and comments are global-only — the published page applies them
// as data attributes/JS at mount, which cannot vary by device, so retaining them here
// would preview settings the public page ignores.
export function normalizeReaderResponsiveBranch(rawBranch = {}) {
  const branch = isObject(rawBranch) ? rawBranch : {};
  const base = normalizeReaderConfig(branch);
  const payload = {};
  if (Object.prototype.hasOwnProperty.call(branch, 'hidden')) {
    payload.hidden = branch.hidden === true;
  }
  if (isObject(branch.controls)) {
    const rawStyle = isObject(branch.controls.style) ? branch.controls.style : {};
    if (Object.keys(rawStyle).length) {
      const style = {};
      if (isObject(rawStyle.defaults)) {
        const defaults = {};
        if (Object.prototype.hasOwnProperty.call(rawStyle.defaults, 'appearance')) {
          const appearance = toSparseObject(base.controls.style.defaults.appearance);
          if (appearance) defaults.appearance = appearance;
        }
        if (Object.prototype.hasOwnProperty.call(rawStyle.defaults, 'padding')) {
          const padding = base.controls.style.defaults.padding;
          if (padding != null) defaults.padding = padding;
        }
        if (Object.keys(defaults).length) style.defaults = defaults;
      }
      ['primary', 'bar'].forEach((key) => {
        if (
          !isObject(rawStyle[key]) ||
          !Object.prototype.hasOwnProperty.call(rawStyle[key], 'appearance')
        ) {
          return;
        }
        const appearance = toSparseObject(base.controls.style[key].appearance);
        if (appearance) style[key] = { appearance };
      });
      // Glow is intentionally global-only for this focused responsive scope.
      if (Object.keys(style).length) payload.controls = { style };
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
    'data-stage-frame-fill': config.stage.frameFill,
    'data-stage-page-gap': String(config.stage.pageGap),
    'data-stage-frame-border': String(config.stage.frameBorder),
    'data-stage-max-width': config.stage.maxWidth == null ? '' : String(config.stage.maxWidth),
    'data-show-comments': String(config.showComments),
  };
}

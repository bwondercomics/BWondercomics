import {
  cloneValue,
  getAppearanceInputValue,
  isObject,
  removeAppearanceLeaf,
  renderAppearanceControls,
  setAppearanceLeaf,
  syncAppearanceColorInputs,
  toSparseAppearance,
} from './appearance-editor.js';
import { escapeAttr, escapeHtml } from './helpers.js';
import { renderInspectorSection } from './inspector-sections.js';
import {
  READER_CONTROLS_PLACEMENTS,
  READER_CONTROLS_SIZES,
  READER_STAGE_FITS,
  normalizeReaderConfig,
  normalizeReaderResponsiveBranch,
} from './reader-config.js';
import { pruneEmptyResponsiveOverrides } from './responsive-overrides.js';

function optionList(options, selected, labels = {}) {
  return options
    .map(
      (value) =>
        `<option value="${escapeAttr(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(labels[value] || value)}</option>`
    )
    .join('');
}

function removeNullAppearanceBranches(style = {}) {
  const next = {};
  const defaults = toSparseAppearance(style.defaults?.appearance);
  const defaultsPadding = style.defaults?.padding;
  const primary = toSparseAppearance(style.primary?.appearance);
  const bar = toSparseAppearance(style.bar?.appearance);
  if (defaults || defaultsPadding != null) {
    next.defaults = {};
    if (defaults) next.defaults.appearance = defaults;
    if (defaultsPadding != null) next.defaults.padding = defaultsPadding;
  }
  if (primary) next.primary = { appearance: primary };
  if (bar) next.bar = { appearance: bar };
  if (style.glow === false) next.glow = false;
  return Object.keys(next).length ? next : {};
}

export function normalizeReaderDraftConfig(rawConfig = {}) {
  const source = isObject(rawConfig.source) ? cloneValue(rawConfig.source) : {};
  const normalized = normalizeReaderConfig(rawConfig);
  // Panel existence is column-driven; `normalizeReaderConfig` no longer emits `panels` /
  // `showPanels`. Any legacy keys already on `rawConfig` pass through the spread untouched
  // (tolerated dead data) but are not re-derived here.
  const next = {
    ...cloneValue(rawConfig),
    source,
    displayMode: normalized.displayMode,
    showComments: normalized.showComments,
    controls: {
      placement: normalized.controls.placement,
      size: normalized.controls.size,
    },
    stage: normalized.stage,
  };
  const style = removeNullAppearanceBranches(normalized.controls.style);
  if (Object.keys(style).length) {
    next.controls.style = style;
  }
  // Custom button labels: sparse — only authored labels persist.
  if (Object.keys(normalized.controls.labels || {}).length) {
    next.controls.labels = normalized.controls.labels;
  }
  // Re-normalize every device branch, not only the one being edited: legacy branches may
  // carry fields the responsive contract no longer supports (displayMode, placement, size,
  // stage, comments). The backend prunes them on save, so the draft must match or the
  // round-trip comparison would report a false mismatch.
  if (isObject(next.responsive)) {
    const responsive = {};
    Object.entries(next.responsive).forEach(([deviceId, branch]) => {
      responsive[deviceId] = normalizeReaderResponsiveBranch(branch);
    });
    next.responsive = responsive;
  }
  next.responsive = pruneEmptyResponsiveOverrides(next.responsive);
  if (!Object.keys(next.responsive).length) {
    delete next.responsive;
  }
  return next;
}

function setReaderPathValue(target, path, value) {
  const segments = path.split('.');
  let cursor = target;
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      cursor[segment] = value;
      return;
    }
    if (!isObject(cursor[segment])) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  });
}

function getReaderInputValue(input) {
  if (input.type === 'checkbox') return input.checked;
  if (input.type === 'number') {
    if (input.value === '') return null;
    const parsed = parseInt(input.value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return input.value;
}

function renderLayoutControls(config) {
  return renderInspectorSection({
    kicker: 'Reader',
    title: 'Display And Controls',
    summary: config.displayMode === 'vertical-scroll' ? 'Vertical Scroll' : 'Paged',
    copy: 'Configure the paged reader shell without custom CSS.',
    body: `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Display Mode</label>
        <select class="pb-editor-select" data-reader-key="displayMode">
          <option value="paged" ${config.displayMode === 'paged' ? 'selected' : ''}>Paged</option>
          <option value="vertical-scroll" ${
            config.displayMode === 'vertical-scroll' ? 'selected' : ''
          }>Vertical Scroll</option>
        </select>
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Controls Placement</label>
        <select class="pb-editor-select" data-reader-key="controls.placement">
          ${optionList(READER_CONTROLS_PLACEMENTS, config.controls.placement, {
            above: 'Above Reader',
            below: 'Below Reader',
            overlay: 'Overlay',
            hidden: 'Hidden',
          })}
        </select>
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Controls Size</label>
        <select class="pb-editor-select" data-reader-key="controls.size">
          ${optionList(READER_CONTROLS_SIZES, config.controls.size, {
            compact: 'Compact',
            medium: 'Medium',
            large: 'Large',
          })}
        </select>
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Button Padding (px)</label>
        <input type="number" class="pb-editor-input" data-reader-key="controls.style.defaults.padding" min="0" max="48" placeholder="Preset default" value="${config.controls.style.defaults.padding == null ? '' : escapeAttr(String(config.controls.style.defaults.padding))}">
        <div class="pb-editor-hint">Horizontal padding of every control button. Blank keeps the size preset's padding.</div>
      </div>
    `,
  });
}

// Custom button labels (Phase 3): sparse — blank fields keep the built-in text.
const READER_CONTROL_LABEL_FIELDS = [
  ['prev', 'Previous Page', '< BACK'],
  ['next', 'Next Page', 'NEXT >'],
  ['help', 'Help', 'HELP ?'],
  ['fit', 'Fit (primary)', 'FIT'],
  ['zoomOut', 'Zoom Out', '- ZOOM'],
  ['zoomIn', 'Zoom In', '+ ZOOM'],
  ['fullscreen', 'Fullscreen', 'FULL'],
];

function renderControlsLabels(config) {
  const labels = config.controls.labels || {};
  const customized = Object.keys(labels).length;
  const fields = READER_CONTROL_LABEL_FIELDS.map(
    ([key, label, placeholder]) => `
      <div class="pb-editor-field">
        <label class="pb-editor-label">${label}</label>
        <input type="text" class="pb-editor-input" maxlength="24" data-reader-key="controls.labels.${key}" placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(labels[key] || '')}">
      </div>
    `
  ).join('');
  return renderInspectorSection({
    kicker: 'Reader',
    title: 'Button Labels',
    summary: customized ? `${customized} customized` : 'Default',
    copy: 'Rename the reader control buttons. Blank fields keep the built-in text (the fullscreen button still shows EXIT while fullscreen).',
    body: fields,
  });
}

function renderStageControls(config) {
  return renderInspectorSection({
    kicker: 'Reader',
    title: 'Stage',
    summary: config.stage.fit,
    copy: 'Tune the paged reader frame and page spacing.',
    body: `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Fit</label>
        <select class="pb-editor-select" data-reader-key="stage.fit">
          ${optionList(READER_STAGE_FITS, config.stage.fit, {
            'dynamic-frame': 'Dynamic Frame',
            width: 'Fit Width',
            height: 'Fit Height',
            natural: 'Natural',
          })}
        </select>
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Page Gap (px)</label>
        <input type="number" class="pb-editor-input" data-reader-key="stage.pageGap" min="0" max="64" value="${escapeAttr(String(config.stage.pageGap))}">
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Frame Width</label>
        <select class="pb-editor-select" data-reader-key="stage.frameFill">
          <option value="hug" ${config.stage.frameFill !== 'fill' ? 'selected' : ''}>Hug Pages</option>
          <option value="fill" ${config.stage.frameFill === 'fill' ? 'selected' : ''}>Fill Column</option>
        </select>
        <div class="pb-editor-hint">Fill Column makes the pages container span the reader column (like the controls) instead of wrapping the pages.</div>
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">
          <input type="checkbox" data-reader-key="stage.frameBorder" ${config.stage.frameBorder ? 'checked' : ''}> Show Page Frame Border
        </label>
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Max Stage Width (px)</label>
        <input type="number" class="pb-editor-input" data-reader-key="stage.maxWidth" min="320" max="2400" placeholder="Auto" value="${config.stage.maxWidth == null ? '' : escapeAttr(String(config.stage.maxWidth))}">
      </div>
    `,
  });
}

function renderVisibilityControls(config) {
  // Panel existence is driven by the section layout and styled via the Column/Panel inspector
  // (click a panel in the canvas). Only reader comments remain here.
  return renderInspectorSection({
    kicker: 'Reader',
    title: 'Comments',
    summary: config.showComments ? 'Comments On' : 'Comments Off',
    copy: 'Toggle reader comments. Side panels are styled by clicking them in the canvas.',
    body: `
      <div class="pb-editor-field">
        <label class="pb-editor-label">
          <input type="checkbox" data-reader-key="showComments" ${config.showComments ? 'checked' : ''}> Show Comments
        </label>
      </div>
    `,
  });
}

function renderControlsAppearance(config, { deviceOnly = false } = {}) {
  return renderInspectorSection({
    kicker: 'Appearance',
    title: 'Reader Controls',
    summary: config.controls.style.defaults.appearance ? 'Custom' : 'Default',
    copy: 'Use sparse appearance overrides for reader buttons.',
    body: `
      ${
        deviceOnly
          ? ''
          : `<div class="pb-editor-field">
        <label class="pb-editor-label">
          <input type="checkbox" data-reader-key="controls.style.glow" ${config.controls.style.glow !== false ? 'checked' : ''}> Neon Glow
        </label>
        <div class="pb-editor-hint">The box/text glow on the bar, buttons, and page counter. Controls Defaults styles every button and the page counter; Primary Control styles the FIT button.</div>
      </div>`
      }
      ${renderAppearanceControls(
        config.controls.style.defaults.appearance,
        'readerControlsDefaults',
        null,
        'Controls Defaults',
        'Optional appearance applied to every reader control button.'
      )}
      ${renderAppearanceControls(
        config.controls.style.primary.appearance,
        'readerControlsPrimary',
        null,
        'Primary Control',
        'Optional appearance applied to the primary reader control.'
      )}
      ${renderAppearanceControls(
        config.controls.style.bar.appearance,
        'readerControlsBar',
        null,
        'Controls Bar',
        'Optional appearance for the toolbar container itself (background + opacity for transparency, border, radius).'
      )}
    `,
  });
}

function renderEndOfEntryControls(config) {
  const endOfEntry = config.endOfEntry || {};
  const enabled = endOfEntry.enabled !== false;
  return renderInspectorSection({
    kicker: 'Reader',
    title: 'Completion Popup',
    summary: enabled ? 'Popup On' : 'Popup Off',
    copy: 'The overlay shown after the last page of an entry.',
    body: `
      <div class="pb-editor-field">
        <label class="pb-editor-label">
          <input type="checkbox" data-reader-key="endOfEntry.enabled" ${enabled ? 'checked' : ''}> Show Completion Popup
        </label>
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Custom Title (optional)</label>
        <input type="text" class="pb-editor-input" maxlength="120" data-reader-key="endOfEntry.title" placeholder="Entry complete" value="${escapeAttr(endOfEntry.title || '')}">
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Custom Message (optional)</label>
        <input type="text" class="pb-editor-input" maxlength="300" data-reader-key="endOfEntry.body" placeholder="Ready for more?" value="${escapeAttr(endOfEntry.body || '')}">
      </div>
    `,
  });
}

// Device scope offers only what the published page can vary per device: button padding
// and control appearance (emitted as root-device-scoped CSS). Display mode, controls
// placement/size, stage, and comments apply at mount and are global-only, so their
// editors render solely in the global scope.
function renderDeviceButtonControls(config) {
  const padding = config.controls.style.defaults.padding;
  return renderInspectorSection({
    kicker: 'Reader',
    title: 'Buttons',
    summary: padding == null ? 'Inherited padding' : `${padding}px padding`,
    copy: 'Only button padding and control styling can vary per device. Display mode, controls placement and size, stage, and comments are global settings.',
    body: `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Button Padding (px)</label>
        <input type="number" class="pb-editor-input" data-reader-key="controls.style.defaults.padding" min="0" max="48" placeholder="Inherited" value="${padding == null ? '' : escapeAttr(String(padding))}">
        <div class="pb-editor-hint">Horizontal padding of every control button on this device. Blank inherits the global value.</div>
      </div>
    `,
  });
}

export function renderReaderEditor(config = {}, { deviceOnly = false } = {}) {
  const normalized = normalizeReaderConfig(config);
  if (deviceOnly) {
    return [
      renderDeviceButtonControls(normalized),
      renderControlsAppearance(normalized, { deviceOnly: true }),
    ].join('');
  }
  return [
    renderLayoutControls(normalized),
    renderEndOfEntryControls(normalized),
    renderControlsAppearance(normalized),
    renderControlsLabels(normalized),
    renderStageControls(normalized),
    renderVisibilityControls(normalized),
  ].join('');
}

export function bindReaderEditorEvents({
  el,
  draftConfig,
  setDraftConfig,
  renderEditorPanel,
  markDirty,
  activeDeviceId = 'desktop',
  responsiveEditScope = 'global',
}) {
  let config = normalizeReaderDraftConfig(draftConfig || {});
  const useDeviceScope = responsiveEditScope === 'device';

  const commit = (nextConfig, rerender = false) => {
    if (!useDeviceScope) {
      syncSourceFields(nextConfig);
    }
    if (useDeviceScope && isObject(nextConfig.responsive?.[activeDeviceId])) {
      nextConfig.responsive[activeDeviceId] = normalizeReaderResponsiveBranch(
        nextConfig.responsive[activeDeviceId]
      );
    }
    config = normalizeReaderDraftConfig(nextConfig);
    setDraftConfig(config);
    markDirty('module');
    if (rerender) {
      renderEditorPanel?.();
    }
  };

  const syncSourceFields = (nextConfig) => {
    const sourceFields = Array.from(el.pbModuleEditor.querySelectorAll('[data-source-key]'));
    if (!sourceFields.length) return;
    const source = isObject(nextConfig.source) ? cloneValue(nextConfig.source) : {};
    sourceFields.forEach((input) => {
      const key = input.dataset.sourceKey;
      if (!key) return;
      if (input.type === 'checkbox') {
        source[key] = input.checked;
      } else if (input.type === 'number') {
        const parsed = parseInt(input.value, 10);
        source[key] = Number.isFinite(parsed) ? parsed : 0;
      } else {
        source[key] = input.value;
      }
    });
    if (source.mode !== 'specific-series') {
      delete source.seriesId;
    }
    nextConfig.source = source;
  };

  if (!useDeviceScope) {
    el.pbModuleEditor.querySelectorAll('[data-source-key]').forEach((input) => {
      const eventName =
        input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(eventName, () => {
        const nextConfig = normalizeReaderDraftConfig(config);
        syncSourceFields(nextConfig);
        commit(nextConfig, input.dataset.sourceKey === 'mode');
      });
    });
  }

  el.pbModuleEditor.querySelectorAll('[data-reader-key]').forEach((input) => {
    const eventName = input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      const key = input.dataset.readerKey;
      if (!key) return;
      const nextConfig = normalizeReaderDraftConfig(config);
      const value = getReaderInputValue(input);
      if (useDeviceScope) {
        nextConfig.responsive =
          nextConfig.responsive && typeof nextConfig.responsive === 'object'
            ? nextConfig.responsive
            : {};
        const branch =
          nextConfig.responsive[activeDeviceId] &&
          typeof nextConfig.responsive[activeDeviceId] === 'object'
            ? nextConfig.responsive[activeDeviceId]
            : {};
        nextConfig.responsive[activeDeviceId] = branch;
        setReaderPathValue(branch, key, value);
      } else {
        setReaderPathValue(nextConfig, key, value);
      }
      commit(nextConfig, input.tagName === 'SELECT');
    });
  });

  const resolveAppearanceTarget = (nextConfig, scope) => {
    let scopeConfig = nextConfig;
    if (useDeviceScope) {
      nextConfig.responsive = isObject(nextConfig.responsive) ? nextConfig.responsive : {};
      nextConfig.responsive[activeDeviceId] = isObject(nextConfig.responsive[activeDeviceId])
        ? nextConfig.responsive[activeDeviceId]
        : {};
      scopeConfig = nextConfig.responsive[activeDeviceId];
    }
    scopeConfig.controls = isObject(scopeConfig.controls) ? scopeConfig.controls : {};
    scopeConfig.controls.style = isObject(scopeConfig.controls.style)
      ? scopeConfig.controls.style
      : {};
    const key =
      scope === 'readerControlsPrimary'
        ? 'primary'
        : scope === 'readerControlsBar'
          ? 'bar'
          : 'defaults';
    if (!isObject(scopeConfig.controls.style[key])) {
      scopeConfig.controls.style[key] = {};
    }
    return scopeConfig.controls.style[key];
  };

  el.pbModuleEditor.querySelectorAll('[data-appearance-toggle="true"]').forEach((input) => {
    input.addEventListener('change', () => {
      const scope = input.dataset.appearanceScope;
      const key = input.dataset.appearanceKey;
      const nextConfig = normalizeReaderDraftConfig(config);
      const target = resolveAppearanceTarget(nextConfig, scope);
      if (input.checked) {
        const pairedInput = el.pbModuleEditor.querySelector(
          `[data-appearance-input="true"][data-appearance-scope="${scope}"][data-appearance-key="${key}"]:not([data-appearance-input-kind="hex"])`
        );
        const value = getAppearanceInputValue(pairedInput);
        if (value !== null) {
          setAppearanceLeaf(target.appearance || (target.appearance = {}), key, value);
        }
      } else if (target.appearance) {
        removeAppearanceLeaf(target.appearance, key);
      }
      const sparse = toSparseAppearance(target.appearance);
      if (sparse) {
        target.appearance = sparse;
      } else {
        delete target.appearance;
      }
      commit(nextConfig);
      renderEditorPanel?.();
    });
  });

  el.pbModuleEditor.querySelectorAll('[data-appearance-input="true"]').forEach((input) => {
    const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      const scope = input.dataset.appearanceScope;
      const key = input.dataset.appearanceKey;
      const value = syncAppearanceColorInputs(el.pbModuleEditor, input);
      if (value === null) return;
      const toggle = el.pbModuleEditor.querySelector(
        `[data-appearance-toggle="true"][data-appearance-scope="${scope}"][data-appearance-key="${key}"]`
      );
      if (toggle && !toggle.checked) return;
      const nextConfig = normalizeReaderDraftConfig(config);
      const target = resolveAppearanceTarget(nextConfig, scope);
      setAppearanceLeaf(target.appearance || (target.appearance = {}), key, value);
      const sparse = toSparseAppearance(target.appearance);
      if (sparse) {
        target.appearance = sparse;
      } else {
        delete target.appearance;
      }
      commit(nextConfig);
    });
  });
}

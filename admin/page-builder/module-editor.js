import { escapeAttr, escapeHtml } from '../../shared/page-builder/helpers.js';
import { renderInspectorSection } from './inspector-sections.js';
import { getModuleEditor } from './module-editor-registry.js';
import {
  getModuleDescriptor,
  getModuleEditorKind,
  getModuleSourceModes,
  getModuleStyleSectors,
} from '../../shared/page-builder/module-descriptors.js';
import {
  getBuilderDeviceLabel,
  getEffectiveModuleConfig,
  isModuleHiddenForDevice,
  isModuleResponsiveField,
  setResponsiveOverrideValue,
} from '../../shared/page-builder/responsive-overrides.js';

function cloneConfig(config = {}) {
  return JSON.parse(JSON.stringify(config || {}));
}

const SOURCE_MODE_LABELS = Object.freeze({
  'active-page-series': 'Active Page Series',
  'specific-series': 'Specific Series',
  'all-series': 'All Series',
  site: 'Site-wide',
});

function normalizeSourceMode(moduleType, source = {}, pageScope = 'series') {
  const modes = getEffectiveSourceModes(moduleType, pageScope);
  if (!modes.length) return '';
  const requested = String(source?.mode || '').trim();
  if (modes.includes(requested)) return requested;
  if (moduleType === 'reader' && pageScope === 'global' && modes.includes('specific-series')) {
    return 'specific-series';
  }
  if (
    moduleType === 'entry-gallery' &&
    pageScope === 'global' &&
    modes.includes('specific-series')
  ) {
    return 'specific-series';
  }
  if (modes.includes('active-page-series') && pageScope !== 'global') return 'active-page-series';
  return modes[0];
}

function getEffectiveSourceModes(moduleType, pageScope = 'series') {
  const modes = getModuleSourceModes(moduleType);
  if (moduleType === 'reader') {
    return modes.filter((mode) =>
      pageScope === 'global' ? mode === 'specific-series' : mode === 'active-page-series'
    );
  }
  return modes.filter((mode) => {
    if (mode === 'active-page-series' && pageScope === 'global') return false;
    return true;
  });
}

function normalizeSourceConfig(moduleType, config = {}, currentPage = null) {
  const pageScope = currentPage?.scope === 'global' ? 'global' : 'series';
  const source = config?.source && typeof config.source === 'object' ? config.source : {};
  const mode = normalizeSourceMode(moduleType, source, pageScope);
  if (!mode) return {};
  const nextSource = {
    ...cloneConfig(source),
    mode,
  };
  if (mode === 'specific-series') {
    nextSource.seriesId =
      String(nextSource.seriesId || currentPage?.seriesId || '').trim() ||
      (pageScope === 'global' ? '' : String(currentPage?.seriesId || '').trim());
  } else {
    delete nextSource.seriesId;
  }
  if (moduleType === 'feed') {
    nextSource.mode = 'site';
    delete nextSource.seriesId;
  }
  if (moduleType === 'media-gallery') {
    nextSource.mode = 'site';
    delete nextSource.seriesId;
  }
  return nextSource;
}

function getKnownSeriesIds(currentPage = null, pages = []) {
  const ids = new Set();
  const collect = (page) => {
    const id = String(page?.seriesId || '').trim();
    if (id) ids.add(id);
  };
  collect(currentPage);
  (pages || []).forEach(collect);
  return [...ids].sort();
}

function findSelectedModule(currentPage, selectedModuleId) {
  if (!selectedModuleId) return null;
  for (const section of currentPage?.sections || []) {
    const found = (section.modules || []).find((module) => module.id === selectedModuleId);
    if (found) return found;
  }
  return null;
}

function renderSectionCard(kicker, title, copy, body) {
  return renderInspectorSection({
    kicker,
    title,
    summary: title,
    copy,
    body,
  });
}

function renderAccordionCard(title, copy, body) {
  return renderInspectorSection({
    kicker: title,
    title,
    summary: title,
    copy,
    body,
  });
}

function renderRawConfigCard(config) {
  return renderAccordionCard(
    'Advanced',
    'Raw JSON stays available for cases that are not covered by the structured controls.',
    `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Raw Config (JSON)</label>
        <textarea class="pb-editor-textarea pb-editor-textarea--code" data-key="_raw">${escapeHtml(JSON.stringify(config, null, 2))}</textarea>
      </div>
    `
  );
}

// Reads the shared Size & Alignment fields ([data-layout-key]) into a sparse layout
// object. Blank/default values drop their key; returns null when nothing is set (the
// caller should then delete config.layout entirely). The DOM fields are the source of
// truth — the card always renders every key with its current value.
function collectModuleLayoutFromFields(root) {
  const layoutFields = Array.from(root.querySelectorAll('[data-layout-key]'));
  if (!layoutFields.length) return null;
  const layout = {};
  layoutFields.forEach((input) => {
    const key = input.dataset.layoutKey;
    if (!key) return;
    const raw = String(input.value ?? '').trim();
    const isDefault =
      !raw || (key === 'widthMode' && raw === 'full') || (key === 'align' && raw === 'stretch');
    if (isDefault) return;
    if (input.type === 'number') {
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed > 0) layout[key] = parsed;
    } else {
      layout[key] = raw;
    }
  });
  if (layout.widthMode === undefined) delete layout.width;
  return Object.keys(layout).length ? layout : null;
}

function collectGenericModuleDraft(root, baseConfig = {}, options = {}) {
  const nextConfig = cloneConfig(baseConfig);
  const keyedInputs = Array.from(root.querySelectorAll('[data-key]'));
  const rawInput = keyedInputs.find((input) => input.dataset.key === '_raw');
  const scopeControl = root.querySelector('[data-responsive-edit-scope]');
  const responsiveEditScope =
    scopeControl?.value === 'device'
      ? 'device'
      : options.responsiveEditScope === 'device'
        ? 'device'
        : 'global';
  const moduleType = options.moduleType || '';
  const activeDeviceId = scopeControl?.dataset.responsiveDeviceId || options.activeDeviceId;
  if (rawInput && responsiveEditScope !== 'device') {
    try {
      Object.assign(nextConfig, JSON.parse(rawInput.value));
    } catch {
      // Keep the last valid structured draft if raw JSON is invalid.
    }
  }

  keyedInputs.forEach((input) => {
    const key = input.dataset.key;
    if (!key || key === '_raw') return;
    let value;
    if (input.type === 'checkbox') {
      value = input.checked;
    } else if (input.type === 'number') {
      value = parseInt(input.value, 10) || 0;
    } else {
      value = input.value;
    }
    if (responsiveEditScope === 'device' && isModuleResponsiveField(moduleType, key)) {
      const globalValue = cloneConfig(baseConfig)[key];
      setResponsiveOverrideValue(nextConfig, activeDeviceId, key, value);
      if (globalValue === undefined) {
        delete nextConfig[key];
      } else {
        nextConfig[key] = globalValue;
      }
    } else if (responsiveEditScope !== 'device') {
      nextConfig[key] = value;
    }
  });

  // Shared wrapper layout: [data-layout-key] fields collect into config.layout (sparse —
  // blank/default values delete their key; an empty layout object is removed entirely).
  if (root.querySelector('[data-layout-key]')) {
    const layout = collectModuleLayoutFromFields(root);
    if (responsiveEditScope === 'device' && isModuleResponsiveField(moduleType, 'layout')) {
      setResponsiveOverrideValue(nextConfig, activeDeviceId, 'layout', layout);
    } else if (responsiveEditScope !== 'device') {
      if (layout) nextConfig.layout = layout;
      else delete nextConfig.layout;
    }
  }

  const sourceFields = Array.from(root.querySelectorAll('[data-source-key]'));
  if (sourceFields.length > 0 && responsiveEditScope !== 'device') {
    const source = cloneConfig(nextConfig.source || {});
    sourceFields.forEach((input) => {
      const key = input.dataset.sourceKey;
      if (!key) return;
      if (input.type === 'checkbox') {
        source[key] = input.checked;
      } else if (input.type === 'number') {
        source[key] = parseInt(input.value, 10) || 0;
      } else {
        source[key] = input.value;
      }
    });
    if (source.mode !== 'specific-series') {
      delete source.seriesId;
    }
    nextConfig.source = normalizeSourceConfig(
      moduleType,
      { ...nextConfig, source },
      options.currentPage || null
    );
  }

  const styleFields = root.querySelectorAll('[data-style-key]');
  if (styleFields.length > 0 && responsiveEditScope !== 'device') {
    nextConfig.style = nextConfig.style || {};
    styleFields.forEach((input) => {
      const key = input.dataset.styleKey;
      if (!key) return;
      if (input.type === 'checkbox') {
        nextConfig.style[key] = input.checked;
      } else if (input.type === 'number' || input.type === 'range') {
        nextConfig.style[key] = parseFloat(input.value);
      } else {
        nextConfig.style[key] = input.value;
      }
    });
  }

  return nextConfig;
}

function renderCmsSourceCard(moduleType, config = {}, currentPage = null, pages = []) {
  const pageScope = currentPage?.scope === 'global' ? 'global' : 'series';
  const modes = getEffectiveSourceModes(moduleType, pageScope);
  if (!modes.length) return '';
  const source = normalizeSourceConfig(moduleType, config, currentPage);
  const modeOptions = modes
    .map(
      (mode) =>
        `<option value="${escapeAttr(mode)}" ${source.mode === mode ? 'selected' : ''}>${escapeHtml(SOURCE_MODE_LABELS[mode] || mode)}</option>`
    )
    .join('');
  const knownSeriesIds = getKnownSeriesIds(currentPage, pages);
  const seriesOptions = knownSeriesIds
    .map(
      (id) =>
        `<option value="${escapeAttr(id)}" ${source.seriesId === id ? 'selected' : ''}>${escapeHtml(id)}</option>`
    )
    .join('');
  const seriesControl =
    source.mode === 'specific-series'
      ? knownSeriesIds.length
        ? `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Series</label>
        <select class="pb-editor-select" data-source-key="seriesId">
          ${seriesOptions}
        </select>
      </div>
    `
        : `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Series ID</label>
        <input type="text" class="pb-editor-input" data-source-key="seriesId" value="${escapeAttr(source.seriesId || '')}">
      </div>
    `
      : '';
  return renderSectionCard(
    'Source',
    'Content Source',
    SOURCE_MODE_LABELS[source.mode] || source.mode,
    `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Source</label>
        <select class="pb-editor-select" data-source-key="mode" ${modes.length <= 1 ? 'disabled' : ''}>
          ${modeOptions}
        </select>
      </div>
      ${seriesControl}
    `
  );
}

function renderResponsiveScopeCard({
  activeDeviceId,
  responsiveEditScope,
  hidden,
  supportsDeviceFields,
}) {
  if (!supportsDeviceFields) return '';
  const deviceLabel = getBuilderDeviceLabel(activeDeviceId);
  const showDeviceControls = responsiveEditScope === 'device';
  return renderSectionCard(
    'Device',
    'Edit Scope',
    responsiveEditScope === 'device' ? deviceLabel : 'Global',
    `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Scope</label>
        <select class="pb-editor-select" data-responsive-edit-scope data-responsive-device-id="${escapeAttr(activeDeviceId)}">
          <option value="global" ${responsiveEditScope === 'global' ? 'selected' : ''}>Global</option>
          <option value="device" ${responsiveEditScope === 'device' ? 'selected' : ''}>Current Device (${escapeHtml(deviceLabel)})</option>
        </select>
      </div>
      ${
        showDeviceControls
          ? `
      <div class="pb-editor-field">
        <label class="pb-editor-label">
          <input type="checkbox" data-responsive-module-key="hidden" ${hidden ? 'checked' : ''}> Hidden on ${escapeHtml(deviceLabel)}
        </label>
      </div>
      `
          : ''
      }
    `
  );
}

function bindResponsiveModuleDraftEvents({
  el,
  draftConfig,
  setDraftConfig,
  markDirty,
  activeDeviceId,
  renderEditorPanel,
}) {
  el.pbModuleEditor.querySelectorAll('[data-responsive-module-key]').forEach((input) => {
    const eventName = input.type === 'checkbox' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      const key = input.dataset.responsiveModuleKey;
      if (!key) return;
      const nextConfig = cloneConfig(draftConfig || {});
      let value = input.value;
      if (input.type === 'checkbox') {
        value = input.checked;
      } else if (input.type === 'number') {
        value = parseInt(input.value, 10) || 0;
      }
      setResponsiveOverrideValue(nextConfig, activeDeviceId, key, value);
      setDraftConfig(nextConfig);
      markDirty('module');
      renderEditorPanel?.();
    });
  });
}

function bindGenericModuleDraftEvents({
  el,
  currentPage,
  selectedModule,
  draftConfig,
  setDraftConfig,
  markDirty,
  activeDeviceId,
  responsiveEditScope,
  renderEditorPanel,
}) {
  const syncDraft = (event = null) => {
    setDraftConfig(
      collectGenericModuleDraft(el.pbModuleEditor, draftConfig || selectedModule.config || {}, {
        activeDeviceId,
        currentPage,
        moduleType: selectedModule.moduleType,
        responsiveEditScope,
      })
    );
    markDirty('module');
    if (event?.target?.dataset?.sourceKey === 'mode') {
      renderEditorPanel?.();
    }
  };

  el.pbModuleEditor
    .querySelectorAll('[data-key], [data-style-key], [data-source-key], [data-layout-key]')
    .forEach((input) => {
      const eventName =
        input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(eventName, syncDraft);
    });
}

// Shared "Layout" card: width/height/alignment of the block's wrapper box. Sparse —
// blank fields mean the stock behavior (full width, auto height). Collected into
// config.layout by collectGenericModuleDraft via [data-layout-key].
function renderModuleLayoutCard(config = {}) {
  const layout = config.layout && typeof config.layout === 'object' ? config.layout : {};
  const widthMode = ['percent', 'px'].includes(layout.widthMode) ? layout.widthMode : 'full';
  return renderSectionCard(
    'Layout',
    'Size & Alignment',
    'Resize this block inside its panel or column. Blank fields keep the stock behavior.',
    `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Width</label>
        <select class="pb-editor-select" data-layout-key="widthMode">
          <option value="full" ${widthMode === 'full' ? 'selected' : ''}>Full width</option>
          <option value="percent" ${widthMode === 'percent' ? 'selected' : ''}>Percent of column</option>
          <option value="px" ${widthMode === 'px' ? 'selected' : ''}>Fixed (px)</option>
        </select>
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Width value ${widthMode === 'px' ? '(px)' : '(%)'}</label>
        <input type="number" class="pb-editor-input" data-layout-key="width" min="5" step="5" placeholder="${widthMode === 'px' ? 'e.g. 320' : 'e.g. 60'}" value="${layout.width ?? ''}">
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Max width (px)</label>
        <input type="number" class="pb-editor-input" data-layout-key="maxWidth" min="40" step="10" placeholder="none" value="${layout.maxWidth ?? ''}">
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Height (px)</label>
        <input type="number" class="pb-editor-input" data-layout-key="height" min="40" step="10" placeholder="auto" value="${layout.height ?? ''}">
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Align</label>
        <select class="pb-editor-select" data-layout-key="align">
          <option value="stretch" ${!layout.align ? 'selected' : ''}>Stretch (default)</option>
          <option value="start" ${layout.align === 'start' ? 'selected' : ''}>Left</option>
          <option value="center" ${layout.align === 'center' ? 'selected' : ''}>Center</option>
          <option value="end" ${layout.align === 'end' ? 'selected' : ''}>Right</option>
        </select>
      </div>
    `
  );
}

function renderStyleManagerEmpty(title, copy) {
  return `
    <div class="pb-editor-empty">
      <div class="pb-editor-empty-card">
        <span class="pb-editor-empty-kicker">Styles</span>
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(copy)}</p>
      </div>
    </div>
  `;
}

// Dispatcher-owned plumbing handed to registry entries.
const SHARED_EDITOR_HELPERS = Object.freeze({
  renderCmsSourceCard,
  renderModuleLayoutCard,
});

export function renderModuleEditorContent({
  currentPage,
  selectedModuleId,
  draftConfig = null,
  pages = [],
  activeDeviceId = 'desktop',
  responsiveEditScope = 'global',
}) {
  if (!selectedModuleId) {
    return `
      <div class="pb-editor-empty">
        <div class="pb-editor-empty-card">
          <span class="pb-editor-empty-kicker">No Module Selected</span>
          <h4>Choose the page header or a module</h4>
          <p>Click the page header to edit title, buttons, and layout, or click a module to edit its content and styling. Theme still handles page-wide settings.</p>
        </div>
      </div>
    `;
  }

  const selectedModule = findSelectedModule(currentPage, selectedModuleId);

  if (!selectedModule) {
    return `
      <div class="pb-editor-empty">
        <div class="pb-editor-empty-card">
          <span class="pb-editor-empty-kicker">Selection Missing</span>
          <h4>Module not found</h4>
          <p>The selected module is no longer available. Pick another module on the canvas to continue editing.</p>
        </div>
      </div>
    `;
  }

  const baseConfig = draftConfig || selectedModule.config || {};
  const config =
    responsiveEditScope === 'device'
      ? getEffectiveModuleConfig(
          { ...selectedModule, config: baseConfig },
          { builderEditing: true, deviceId: activeDeviceId }
        )
      : baseConfig;
  const moduleType = selectedModule.moduleType;
  const contentSections = [];
  const supportsDeviceFields = true;
  contentSections.push(
    renderResponsiveScopeCard({
      activeDeviceId,
      responsiveEditScope,
      hidden: isModuleHiddenForDevice(
        { ...selectedModule, config: baseConfig },
        { builderEditing: true, deviceId: activeDeviceId }
      ),
      supportsDeviceFields,
    })
  );

  const entry = getModuleEditor(getModuleEditorKind(moduleType));

  if (responsiveEditScope === 'device') {
    const responsiveFields = getModuleDescriptor(moduleType).responsiveOverrides || [];
    if (entry?.renderDeviceOverrides) {
      contentSections.push(
        ...entry.renderDeviceOverrides({
          config,
          pages,
          moduleType,
          responsiveFields,
          shared: SHARED_EDITOR_HELPERS,
        })
      );
    }
    return contentSections.join('');
  }

  if (!entry) {
    // Unknown editor kind ('raw' descriptor fallback): raw JSON only, no shared cards.
    contentSections.push(
      renderSectionCard(
        'Advanced',
        'Module Config',
        'This module does not have structured controls yet, so edit the config directly.',
        `
          <div class="pb-editor-field">
            <label class="pb-editor-label">Raw Config (JSON)</label>
            <textarea class="pb-editor-textarea pb-editor-textarea--code" data-key="_raw">${escapeHtml(JSON.stringify(config, null, 2))}</textarea>
          </div>
        `
      )
    );
    return contentSections.join('');
  }

  contentSections.push(
    ...entry.renderContent({ config, currentPage, pages, moduleType, shared: SHARED_EDITOR_HELPERS })
  );

  // Shared wrapper layout (config.layout): available on every structured module type.
  if (!entry.omitsLayoutCard) {
    contentSections.push(renderModuleLayoutCard(config));
  }

  // Only modules that still use the generic draft binder can safely keep the
  // generic raw JSON escape hatch. Dedicated editor flows must not render a
  // raw card unless they intentionally parse and persist `_raw`.
  if (entry.retainsRawCard) {
    contentSections.push(renderRawConfigCard(config));
  }

  return contentSections.join('');
}

export function renderModuleStyleEditorContent({
  currentPage,
  selectedModuleId,
  draftConfig = null,
  pages = [],
  activeDeviceId = 'desktop',
  responsiveEditScope = 'global',
}) {
  if (!selectedModuleId) {
    return renderStyleManagerEmpty(
      'Choose a module',
      'Select a module with supported sanitized style controls to edit its appearance.'
    );
  }

  const selectedModule = findSelectedModule(currentPage, selectedModuleId);
  if (!selectedModule) {
    return renderStyleManagerEmpty(
      'Module not found',
      'The selected module is no longer available. Pick another module on the canvas to continue.'
    );
  }

  const moduleType = selectedModule.moduleType;
  const styleSectors = getModuleStyleSectors(moduleType);
  if (!styleSectors.length) {
    return renderStyleManagerEmpty(
      'No style controls',
      'This module does not expose sanitized style sectors in the builder style manager.'
    );
  }

  const entry = getModuleEditor(getModuleEditorKind(moduleType));
  const baseConfig = draftConfig || selectedModule.config || {};
  const styleScope =
    entry?.styleUsesDeviceScope && responsiveEditScope === 'device' ? 'device' : 'global';
  const config =
    styleScope === 'device'
      ? getEffectiveModuleConfig(
          { ...selectedModule, config: baseConfig },
          { builderEditing: true, deviceId: activeDeviceId }
        )
      : baseConfig;

  const sections = entry?.renderStyle
    ? entry.renderStyle({ config, pages, activeDeviceId, styleScope, shared: SHARED_EDITOR_HELPERS })
    : [];

  return sections.length
    ? sections.join('')
    : renderStyleManagerEmpty(
        'No style controls',
        'This module does not expose sanitized style sectors in the builder style manager.'
      );
}

export function bindModuleStyleEditorEvents({
  el,
  currentPage,
  selectedModuleId,
  draftConfig,
  setDraftConfig,
  markDirty,
  renderEditorPanel,
  pages = [],
  activeDeviceId = 'desktop',
  responsiveEditScope = 'global',
}) {
  const selectedModule = findSelectedModule(currentPage, selectedModuleId);
  if (!selectedModule) return;

  const entry = getModuleEditor(getModuleEditorKind(selectedModule.moduleType));
  if (entry?.bindStyle) {
    const styleScope = responsiveEditScope === 'device' ? 'device' : 'global';
    entry.bindStyle({
      el,
      draftConfig,
      setDraftConfig,
      renderEditorPanel,
      markDirty,
      pages,
      activeDeviceId,
      styleScope,
    });
    return;
  }

  if (getModuleStyleSectors(selectedModule.moduleType).length) {
    bindGenericModuleDraftEvents({
      el,
      currentPage,
      selectedModule,
      draftConfig,
      setDraftConfig,
      markDirty,
      activeDeviceId,
      responsiveEditScope: 'global',
      renderEditorPanel,
    });
  }
}

export function bindModuleEditorEvents({
  el,
  currentPage,
  selectedModuleId,
  draftConfig,
  setDraftConfig,
  markDirty,
  renderEditorPanel,
  pages = [],
  openImagePicker,
  fetchAssets,
  uploadAssetFile,
  activeDeviceId = 'desktop',
  responsiveEditScope = 'global',
}) {
  const selectedModule = findSelectedModule(currentPage, selectedModuleId);
  if (!selectedModule) return;

  bindResponsiveModuleDraftEvents({
    el,
    draftConfig,
    setDraftConfig,
    markDirty,
    activeDeviceId,
    renderEditorPanel,
  });

  const entry = getModuleEditor(getModuleEditorKind(selectedModule.moduleType));
  const bindCtx = {
    el,
    currentPage,
    selectedModule,
    draftConfig,
    setDraftConfig,
    renderEditorPanel,
    markDirty,
    pages,
    openImagePicker,
    fetchAssets,
    uploadAssetFile,
    activeDeviceId,
    responsiveEditScope,
  };

  if (responsiveEditScope === 'device') {
    if (entry?.bindDeviceEvents) {
      entry.bindDeviceEvents(bindCtx);
      return;
    }
    if (entry?.deviceBindsGeneric) {
      bindGenericModuleDraftEvents({
        el,
        currentPage,
        selectedModule,
        draftConfig,
        setDraftConfig,
        markDirty,
        activeDeviceId,
        responsiveEditScope,
        renderEditorPanel,
      });
    }
    return;
  }

  // Shared Size & Alignment card (config.layout) for modules with dedicated editors.
  // Their binders rebuild the config through type normalizers that do not know about
  // the shared layout keys, so every commit is routed through a bridge that re-reads
  // the [data-layout-key] fields. This both makes the card functional for these types
  // and stops unrelated edits from erasing a saved layout. Generic modules are covered
  // by collectGenericModuleDraft instead and must not double-bind here.
  const useLayoutBridge =
    entry?.usesLayoutBridge === true && !!el.pbModuleEditor.querySelector('[data-layout-key]');
  let bridgedConfig = cloneConfig(draftConfig || selectedModule.config || {});
  const applyLayoutFieldsToConfig = (config) => {
    const nextConfig = cloneConfig(config || {});
    const layout = collectModuleLayoutFromFields(el.pbModuleEditor);
    if (layout) nextConfig.layout = layout;
    else delete nextConfig.layout;
    return nextConfig;
  };
  const layoutAwareSetDraftConfig = (nextConfig) => {
    bridgedConfig = applyLayoutFieldsToConfig(nextConfig);
    setDraftConfig(bridgedConfig);
  };
  const draftSetter = useLayoutBridge ? layoutAwareSetDraftConfig : setDraftConfig;
  if (useLayoutBridge) {
    el.pbModuleEditor.querySelectorAll('[data-layout-key]').forEach((input) => {
      const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(eventName, () => {
        bridgedConfig = applyLayoutFieldsToConfig(bridgedConfig);
        setDraftConfig(bridgedConfig);
        markDirty('module');
      });
    });
  }

  if (entry?.bindEvents) {
    entry.bindEvents({ ...bindCtx, setDraftConfig: draftSetter });
    return;
  }

  bindGenericModuleDraftEvents({
    el,
    currentPage,
    selectedModule,
    draftConfig,
    setDraftConfig,
    markDirty,
    activeDeviceId,
    responsiveEditScope,
    renderEditorPanel,
  });
}

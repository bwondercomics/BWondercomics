import { escapeAttr, escapeHtml } from './helpers.js';
import {
  renderPromoEditor,
  generatePromoItemId,
  getDefaultPromoItemStyle,
} from './promo-editor.js';
import {
  renderSocialEditor,
  generateSocialButtonId,
  getDefaultSocialButtonStyle,
} from './social-editor.js';
import { bindButtonsEditorEvents, renderButtonsEditor } from './button-editor.js';
import { bindGalleryEditorEvents, renderGalleryEditor } from './gallery-editor.js';
import { bindVideoEditorEvents, renderVideoEditor } from './video-editor.js';
import { bindDividerEditorEvents, renderDividerEditor } from './divider-editor.js';
import { bindEntryGalleryEditorEvents, renderEntryGalleryEditor } from './entry-gallery-editor.js';
import { bindReaderEditorEvents, renderReaderEditor } from './reader-editor.js';
import { renderInspectorSection } from './inspector-sections.js';
import {
  getModuleDescriptor,
  getModuleEditorKind,
  getModuleSourceModes,
  getModuleStyleSectors,
} from './module-descriptors.js';
import {
  getBuilderDeviceLabel,
  getEffectiveModuleConfig,
  isModuleHiddenForDevice,
  isModuleResponsiveField,
  setResponsiveOverrideValue,
} from './responsive-overrides.js';
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

function renderTextAlignmentCard(config = {}) {
  return renderSectionCard(
    'Behavior',
    'Alignment',
    'Choose how the text block aligns inside its container.',
    `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Alignment</label>
        <select class="pb-editor-select" data-key="alignment">
          <option value="left" ${config.alignment === 'left' ? 'selected' : ''}>Left</option>
          <option value="center" ${config.alignment === 'center' ? 'selected' : ''}>Center</option>
          <option value="right" ${config.alignment === 'right' ? 'selected' : ''}>Right</option>
        </select>
      </div>
    `
  );
}

function renderSpacerHeightCard(config = {}) {
  return renderSectionCard(
    'Behavior',
    'Spacing',
    'Increase or reduce the vertical separation introduced by this spacer module.',
    `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Height (px)</label>
        <input type="number" class="pb-editor-input" data-key="height" value="${config.height || 40}">
      </div>
    `
  );
}

function renderDeviceModuleOverrideSections(moduleType, config, pages) {
  const responsiveFields = getModuleDescriptor(moduleType).responsiveOverrides || [];
  if (responsiveFields.includes('layout')) {
    return [renderModuleLayoutCard(config)];
  }
  if (responsiveFields.includes('alignment')) {
    return [renderTextAlignmentCard(config)];
  }
  if (responsiveFields.includes('height')) {
    return [renderSpacerHeightCard(config)];
  }
  if (moduleType === 'gallery' && responsiveFields.includes('columns')) {
    return [renderGalleryEditor(config, { deviceOnly: true })];
  }
  if (moduleType === 'entry-gallery' && responsiveFields.includes('columns')) {
    return [renderEntryGalleryEditor(config, { deviceOnly: true })];
  }
  if (moduleType === 'reader') {
    return [renderReaderEditor(config, { deviceOnly: true })];
  }
  if (moduleType === 'media-gallery' && responsiveFields.includes('columns')) {
    return [
      renderSectionCard(
        'Appearance',
        'Media Gallery Settings',
        'Configure the grid columns for this device.',
        `
        <div class="pb-editor-field">
          <label class="pb-editor-label">Columns</label>
          <input type="number" class="pb-editor-input" data-key="columns" min="1" max="6" value="${config.columns || 3}">
        </div>
      `
      ),
    ];
  }
  if (moduleType === 'buttons' && responsiveFields.includes('defaults')) {
    return [renderButtonsEditor(config, pages, { deviceOnly: true })];
  }
  return [];
}

function renderStyleScopeCard({ activeDeviceId, responsiveEditScope }) {
  const deviceLabel = getBuilderDeviceLabel(activeDeviceId);
  return renderSectionCard(
    'Device',
    'Style Scope',
    responsiveEditScope === 'device' ? deviceLabel : 'Global',
    `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Scope</label>
        <select class="pb-editor-select" data-responsive-edit-scope data-responsive-device-id="${escapeAttr(activeDeviceId)}">
          <option value="global" ${responsiveEditScope === 'global' ? 'selected' : ''}>Global</option>
          <option value="device" ${responsiveEditScope === 'device' ? 'selected' : ''}>Current Device (${escapeHtml(deviceLabel)})</option>
        </select>
      </div>
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

function normalizePromoItem(item = {}) {
  return {
    id: item.id || generatePromoItemId(),
    image: item.image || '',
    linkUrl: item.linkUrl || '',
    imageFit: item.imageFit === 'contain' ? 'contain' : 'cover',
    topText: item.topText || '',
    bottomText: item.bottomText || '',
    textPosition: item.textPosition === 'outside' ? 'outside' : 'overlay',
    style: {
      ...getDefaultPromoItemStyle(),
      ...(item.style || {}),
    },
  };
}

function normalizePromoConfig(config = {}) {
  return {
    ...cloneConfig(config),
    items: (config.items || []).map(normalizePromoItem),
    autoRotate: config.autoRotate !== false,
    interval: config.interval || 5000,
    showNavigation: config.showNavigation !== false,
    showIndicators: config.showIndicators !== false,
    height: config.height || 400,
    transition: config.transition || 'fade',
  };
}

function bindPromoDraftEvents({
  el,
  draftConfig,
  setDraftConfig,
  renderEditorPanel,
  markDirty,
  openImagePicker,
  fetchAssets,
  uploadAssetFile,
}) {
  let config = normalizePromoConfig(draftConfig);
  const items = config.items;

  const commit = (nextConfig, rerenderEditor = false) => {
    config = normalizePromoConfig(nextConfig);
    setDraftConfig(config);
    markDirty('module');
    if (rerenderEditor) {
      renderEditorPanel();
    }
  };

  const updatePromoImageUi = (itemEl, item) => {
    const imageInput = itemEl.querySelector('[data-item-key="image"]');
    const meta = itemEl.querySelector('.pb-promo-image-meta');
    if (imageInput) imageInput.value = item.image || '';
    if (meta) meta.textContent = item.image ? 'Image selected' : 'No image selected';
  };

  document.getElementById('pbPromoAddItem')?.addEventListener('click', () => {
    const nextConfig = normalizePromoConfig(config);
    nextConfig.items.push(normalizePromoItem());
    commit(nextConfig, true);
  });

  el.pbModuleEditor.querySelectorAll('.pb-promo-item').forEach((itemEl) => {
    const index = parseInt(itemEl.dataset.itemIndex, 10);

    itemEl.querySelector('[data-action="remove"]')?.addEventListener('click', () => {
      const nextConfig = normalizePromoConfig(config);
      nextConfig.items.splice(index, 1);
      commit(nextConfig, true);
    });

    itemEl.querySelector('[data-action="move-up"]')?.addEventListener('click', () => {
      if (index <= 0) return;
      const nextConfig = normalizePromoConfig(config);
      [nextConfig.items[index - 1], nextConfig.items[index]] = [
        nextConfig.items[index],
        nextConfig.items[index - 1],
      ];
      commit(nextConfig, true);
    });

    itemEl.querySelector('[data-action="move-down"]')?.addEventListener('click', () => {
      if (index >= items.length - 1) return;
      const nextConfig = normalizePromoConfig(config);
      [nextConfig.items[index], nextConfig.items[index + 1]] = [
        nextConfig.items[index + 1],
        nextConfig.items[index],
      ];
      commit(nextConfig, true);
    });

    itemEl.querySelector('.pb-promo-pick')?.addEventListener('click', async () => {
      const current = config.items[index] || {};
      await openImagePicker({
        title: 'Select promo image',
        getItems: fetchAssets,
        allowUpload: true,
        uploadHandler: uploadAssetFile,
        showEditor: false,
        initialSelection: { path: current.image || '' },
        onApply: ({ item }) => {
          const nextConfig = normalizePromoConfig(config);
          if (!nextConfig.items[index]) return;
          nextConfig.items[index].image = item?.path || '';
          updatePromoImageUi(itemEl, nextConfig.items[index]);
          commit(nextConfig);
        },
      });
    });

    itemEl.querySelector('.pb-promo-clear')?.addEventListener('click', () => {
      const nextConfig = normalizePromoConfig(config);
      if (!nextConfig.items[index]) return;
      nextConfig.items[index].image = '';
      updatePromoImageUi(itemEl, nextConfig.items[index]);
      commit(nextConfig);
    });
  });

  el.pbModuleEditor.querySelectorAll('.pb-promo-input').forEach((input) => {
    const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      const index = parseInt(input.dataset.itemIndex, 10);
      const key = input.dataset.itemKey;
      const nextConfig = normalizePromoConfig(config);
      if (!nextConfig.items[index] || !key) return;
      nextConfig.items[index][key] = input.value;
      commit(nextConfig);
    });
  });

  el.pbModuleEditor
    .querySelectorAll('.pb-promo-style-input, .pb-promo-style-color, .pb-promo-style-range')
    .forEach((input) => {
      const eventName = input.type === 'range' || input.type === 'checkbox' ? 'input' : 'change';
      input.addEventListener(eventName, () => {
        const index = parseInt(input.dataset.itemIndex, 10);
        const key = input.dataset.styleKey;
        const nextConfig = normalizePromoConfig(config);
        if (!nextConfig.items[index] || !key) return;
        if (input.type === 'checkbox') {
          nextConfig.items[index].style[key] = input.checked;
        } else if (input.type === 'range') {
          nextConfig.items[index].style[key] = parseFloat(input.value);
        } else {
          nextConfig.items[index].style[key] = input.value;
        }
        commit(nextConfig);
      });
    });

  const autoRotateCheckbox = document.getElementById('pbPromoAutoRotate');
  const intervalField = document.getElementById('pbPromoIntervalField');
  autoRotateCheckbox?.addEventListener('change', () => {
    if (intervalField) {
      intervalField.style.display = autoRotateCheckbox.checked ? '' : 'none';
    }
    const nextConfig = normalizePromoConfig(config);
    nextConfig.autoRotate = autoRotateCheckbox.checked;
    commit(nextConfig);
  });

  const intervalInput = document.getElementById('pbPromoInterval');
  intervalInput?.addEventListener('input', () => {
    const nextConfig = normalizePromoConfig(config);
    const seconds = parseFloat(intervalInput.value) || 5;
    nextConfig.interval = seconds * 1000;
    commit(nextConfig);
  });

  const showNavCheckbox = document.getElementById('pbPromoShowNav');
  showNavCheckbox?.addEventListener('change', () => {
    const nextConfig = normalizePromoConfig(config);
    nextConfig.showNavigation = showNavCheckbox.checked;
    commit(nextConfig);
  });

  const showIndicatorsCheckbox = document.getElementById('pbPromoShowIndicators');
  showIndicatorsCheckbox?.addEventListener('change', () => {
    const nextConfig = normalizePromoConfig(config);
    nextConfig.showIndicators = showIndicatorsCheckbox.checked;
    commit(nextConfig);
  });

  const heightInput = document.getElementById('pbPromoHeight');
  heightInput?.addEventListener('input', () => {
    const nextConfig = normalizePromoConfig(config);
    nextConfig.height = parseInt(heightInput.value, 10) || 400;
    commit(nextConfig);
  });

  const transitionSelect = document.getElementById('pbPromoTransition');
  transitionSelect?.addEventListener('change', () => {
    const nextConfig = normalizePromoConfig(config);
    nextConfig.transition = transitionSelect.value || 'fade';
    commit(nextConfig);
  });
}

function normalizeSocialButton(button = {}) {
  return {
    id: button.id || generateSocialButtonId(),
    icon: button.icon || '',
    text: button.text || '',
    url: button.url || '',
    style: {
      ...getDefaultSocialButtonStyle(),
      ...(button.style || {}),
    },
  };
}

function normalizeSocialConfig(config = {}) {
  return {
    ...cloneConfig(config),
    buttons: (config.buttons || []).map(normalizeSocialButton),
  };
}

function bindSocialDraftEvents({
  el,
  draftConfig,
  setDraftConfig,
  renderEditorPanel,
  markDirty,
  openImagePicker,
  fetchAssets,
  uploadAssetFile,
}) {
  let config = normalizeSocialConfig(draftConfig);

  const commit = (nextConfig, rerenderEditor = false) => {
    config = normalizeSocialConfig(nextConfig);
    setDraftConfig(config);
    markDirty('module');
    if (rerenderEditor) {
      renderEditorPanel();
    }
  };

  document.getElementById('pbSocialAddButton')?.addEventListener('click', () => {
    const nextConfig = normalizeSocialConfig(config);
    nextConfig.buttons.push(normalizeSocialButton());
    commit(nextConfig, true);
  });

  el.pbModuleEditor.querySelectorAll('.pb-social-item').forEach((itemEl) => {
    const index = parseInt(itemEl.dataset.itemIndex, 10);

    itemEl.querySelector('[data-action="remove"]')?.addEventListener('click', () => {
      const nextConfig = normalizeSocialConfig(config);
      nextConfig.buttons.splice(index, 1);
      commit(nextConfig, true);
    });

    itemEl.querySelector('[data-action="move-up"]')?.addEventListener('click', () => {
      if (index <= 0) return;
      const nextConfig = normalizeSocialConfig(config);
      [nextConfig.buttons[index - 1], nextConfig.buttons[index]] = [
        nextConfig.buttons[index],
        nextConfig.buttons[index - 1],
      ];
      commit(nextConfig, true);
    });

    itemEl.querySelector('[data-action="move-down"]')?.addEventListener('click', () => {
      if (index >= config.buttons.length - 1) return;
      const nextConfig = normalizeSocialConfig(config);
      [nextConfig.buttons[index], nextConfig.buttons[index + 1]] = [
        nextConfig.buttons[index + 1],
        nextConfig.buttons[index],
      ];
      commit(nextConfig, true);
    });

    itemEl.querySelector('.pb-social-icon-pick')?.addEventListener('click', async () => {
      const current = config.buttons[index] || {};
      await openImagePicker({
        title: 'Select button icon',
        getItems: fetchAssets,
        allowUpload: true,
        uploadHandler: uploadAssetFile,
        showEditor: false,
        initialSelection: { path: current.icon || '' },
        onApply: ({ item }) => {
          const nextConfig = normalizeSocialConfig(config);
          if (!nextConfig.buttons[index]) return;
          nextConfig.buttons[index].icon = item?.path || '';
          commit(nextConfig, true);
        },
      });
    });
  });

  el.pbModuleEditor.querySelectorAll('.pb-social-input').forEach((input) => {
    const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      const index = parseInt(input.dataset.itemIndex, 10);
      const key = input.dataset.itemKey;
      const nextConfig = normalizeSocialConfig(config);
      if (!nextConfig.buttons[index] || !key) return;
      nextConfig.buttons[index][key] = input.value;
      commit(nextConfig);
    });
  });

  el.pbModuleEditor
    .querySelectorAll('.pb-social-style-input, .pb-social-style-color, .pb-social-style-range')
    .forEach((input) => {
      const eventName = input.type === 'range' ? 'input' : 'change';
      input.addEventListener(eventName, () => {
        const index = parseInt(input.dataset.itemIndex, 10);
        const key = input.dataset.styleKey;
        const nextConfig = normalizeSocialConfig(config);
        if (!nextConfig.buttons[index] || !key) return;
        if (input.type === 'range' || input.type === 'number') {
          nextConfig.buttons[index].style[key] = parseFloat(input.value);
        } else {
          nextConfig.buttons[index].style[key] = input.value;
        }
        commit(nextConfig);
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

function renderEmailSignupStyleSection(emailStyle = {}) {
  return renderSectionCard(
    'Appearance',
    'Visual Styling',
    'Tune typography and emphasis without editing raw JSON.',
    `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Heading Font</label>
        <select class="pb-editor-select" data-style-key="headingFont">
          <option value="default" ${emailStyle.headingFont === 'default' ? 'selected' : ''}>Default</option>
          <option value="display" ${emailStyle.headingFont === 'display' ? 'selected' : ''}>Display (Bebas)</option>
          <option value="mono" ${emailStyle.headingFont === 'mono' ? 'selected' : ''}>Monospace</option>
        </select>
      </div>
      <div class="pb-editor-field pb-editor-field--row">
        <label class="pb-editor-label">Heading Color</label>
        <input type="color" class="pb-promo-style-color" data-style-key="headingColor" value="${emailStyle.headingColor || '#ffffff'}">
        <label><input type="checkbox" data-style-key="headingGlow" ${emailStyle.headingGlow ? 'checked' : ''}> Glow</label>
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Input Style</label>
        <select class="pb-editor-select" data-style-key="inputStyle">
          <option value="bubble" ${emailStyle.inputStyle === 'bubble' ? 'selected' : ''}>Bubble (glow border)</option>
          <option value="flat" ${emailStyle.inputStyle === 'flat' ? 'selected' : ''}>Flat</option>
        </select>
      </div>
      <div class="pb-editor-field pb-editor-field--row">
        <label class="pb-editor-label">Button Color</label>
        <input type="color" class="pb-promo-style-color" data-style-key="buttonColor" value="${emailStyle.buttonColor || '#00d9ff'}">
        <label><input type="checkbox" data-style-key="buttonGlow" ${emailStyle.buttonGlow ? 'checked' : ''}> Glow</label>
      </div>
    `
  );
}

function renderFeedStyleSection(feedStyle = {}) {
  return renderSectionCard(
    'Appearance',
    'Color Styling',
    'Tune headings, buttons, feed items, and the outer frame.',
    `
      <details class="pb-editor-accordion">
        <summary class="pb-editor-accordion-toggle">Color Options</summary>
        <div class="pb-editor-accordion-content">
          <div class="pb-style-group">
            <div class="pb-style-group-title">Heading & Author</div>
            <div class="pb-editor-field pb-editor-field--row">
              <label class="pb-editor-label">Heading Background</label>
              <input type="color" class="pb-promo-style-color" data-style-key="headingBgColor" value="${feedStyle.headingBgColor || '#ffed00'}">
            </div>
            <div class="pb-editor-field pb-editor-field--row">
              <label class="pb-editor-label">Heading Text</label>
              <input type="color" class="pb-promo-style-color" data-style-key="headingTextColor" value="${feedStyle.headingTextColor || '#0a0a12'}">
            </div>
            <div class="pb-editor-field pb-editor-field--row">
              <label class="pb-editor-label">Author Color</label>
              <input type="color" class="pb-promo-style-color" data-style-key="authorColor" value="${feedStyle.authorColor || '#7ef5e3'}">
            </div>
          </div>
          <div class="pb-style-group">
            <div class="pb-style-group-title">Buttons</div>
            <div class="pb-editor-field pb-editor-field--row">
              <label class="pb-editor-label">Button Background</label>
              <input type="color" class="pb-promo-style-color" data-style-key="buttonBgColor" value="${feedStyle.buttonBgColor || '#00d9ff'}">
            </div>
            <div class="pb-editor-field pb-editor-field--row">
              <label class="pb-editor-label">Button Text</label>
              <input type="color" class="pb-promo-style-color" data-style-key="buttonTextColor" value="${feedStyle.buttonTextColor || '#0a0a12'}">
            </div>
          </div>
          <div class="pb-style-group">
            <div class="pb-style-group-title">Feed Items</div>
            <div class="pb-editor-field pb-editor-field--row">
              <label class="pb-editor-label">Item Title</label>
              <input type="color" class="pb-promo-style-color" data-style-key="itemTitleColor" value="${feedStyle.itemTitleColor || '#ffed00'}">
            </div>
            <div class="pb-editor-field pb-editor-field--row">
              <label class="pb-editor-label">Item Date</label>
              <input type="color" class="pb-promo-style-color" data-style-key="itemDateColor" value="${feedStyle.itemDateColor || '#00d9ff'}">
            </div>
            <div class="pb-editor-field pb-editor-field--row">
              <label class="pb-editor-label">Item Border</label>
              <input type="color" class="pb-promo-style-color" data-style-key="itemBorderColor" value="${feedStyle.itemBorderColor || '#00d9ff'}">
            </div>
          </div>
          <div class="pb-style-group">
            <div class="pb-style-group-title">Container</div>
            <div class="pb-editor-field pb-editor-field--row">
              <label class="pb-editor-label">Border Color</label>
              <input type="color" class="pb-promo-style-color" data-style-key="borderColor" value="${feedStyle.borderColor || '#ffed00'}">
            </div>
          </div>
        </div>
      </details>
    `
  );
}

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

  if (responsiveEditScope === 'device') {
    contentSections.push(...renderDeviceModuleOverrideSections(moduleType, config, pages));
    return contentSections.join('');
  }

  switch (getModuleEditorKind(moduleType)) {
    case 'header':
      contentSections.push(
        renderSectionCard(
          'Content',
          'Header Copy',
          'Primary title and subtitle content for the module.',
          `
          <div class="pb-editor-field">
            <label class="pb-editor-label">Title</label>
            <input type="text" class="pb-editor-input" data-key="title" value="${escapeAttr(config.title || '')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Subtitle</label>
            <input type="text" class="pb-editor-input" data-key="subtitle" value="${escapeAttr(config.subtitle || '')}">
          </div>
        `
        )
      );
      break;

    case 'text':
      contentSections.push(
        renderSectionCard(
          'Content',
          'Rich Text',
          'HTML is supported for emphasis, links, and custom formatting.',
          `
          <div class="pb-editor-field">
            <label class="pb-editor-label">Content (HTML)</label>
            <textarea class="pb-editor-textarea" data-key="content">${escapeHtml(config.content || '')}</textarea>
          </div>
        `
        )
      );
      contentSections.push(renderTextAlignmentCard(config));
      break;

    case 'image':
      contentSections.push(
        renderSectionCard(
          'Content',
          'Image Asset',
          'Set the media source and the copy used for accessibility and captions.',
          `
          <div class="pb-editor-field">
            <label class="pb-editor-label">Image URL</label>
            <input type="text" class="pb-editor-input" data-key="src" value="${escapeAttr(config.src || '')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Alt Text</label>
            <input type="text" class="pb-editor-input" data-key="alt" value="${escapeAttr(config.alt || '')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Caption</label>
            <input type="text" class="pb-editor-input" data-key="caption" value="${escapeAttr(config.caption || '')}">
          </div>
        `
        )
      );
      break;

    case 'spacer':
      contentSections.push(renderSpacerHeightCard(config));
      break;

    case 'html':
      contentSections.push(
        renderSectionCard(
          'Advanced',
          'Custom HTML',
          'Use for bespoke markup when the structured modules are not enough.',
          `
          <div class="pb-editor-field">
            <label class="pb-editor-label">Custom HTML</label>
            <textarea class="pb-editor-textarea pb-editor-textarea--code" data-key="code">${escapeHtml(config.code || '')}</textarea>
          </div>
        `
        )
      );
      break;

    case 'email-signup': {
      contentSections.push(
        renderSectionCard(
          'Content',
          'Signup Copy',
          'Set the visible text and call-to-action copy for the email form.',
          `
          <div class="pb-editor-field">
            <label class="pb-editor-label">Heading</label>
            <input type="text" class="pb-editor-input" data-key="heading" value="${escapeAttr(config.heading || '')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Subtext (optional)</label>
            <input type="text" class="pb-editor-input" data-key="subtext" value="${escapeAttr(config.subtext || '')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Placeholder</label>
            <input type="text" class="pb-editor-input" data-key="placeholder" value="${escapeAttr(config.placeholder || '')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Button Text</label>
            <input type="text" class="pb-editor-input" data-key="buttonText" value="${escapeAttr(config.buttonText || '')}">
          </div>
        `
        )
      );
      contentSections.push(renderEmailSignupStyleSection(config.style || {}));
      break;
    }

    case 'reader':
      contentSections.push(renderCmsSourceCard(moduleType, config, currentPage, pages));
      contentSections.push(renderReaderEditor(config));
      break;

    case 'promo':
      contentSections.push(renderPromoEditor(config));
      break;

    case 'social':
      contentSections.push(renderSocialEditor(config));
      break;

    case 'buttons':
      contentSections.push(renderButtonsEditor(config, pages));
      break;

    case 'feed': {
      contentSections.push(renderCmsSourceCard(moduleType, config, currentPage, pages));
      contentSections.push(
        renderSectionCard(
          'Content',
          'Feed Copy',
          'Set the heading, author treatment, and destination links shown in the module.',
          `
          <div class="pb-editor-field">
            <label class="pb-editor-label">Heading</label>
            <input type="text" class="pb-editor-input" data-key="heading" value="${escapeAttr(config.heading || 'BWC FEED')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Author Label</label>
            <input type="text" class="pb-editor-input" data-key="author" value="${escapeAttr(config.author || '')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Feed Button Label</label>
            <input type="text" class="pb-editor-input" data-key="feedLabel" value="${escapeAttr(config.feedLabel || 'Open feed')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Feed Link</label>
            <input type="text" class="pb-editor-input" data-key="feedHref" value="${escapeAttr(config.feedHref || 'feed.html')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Media Button Label</label>
            <input type="text" class="pb-editor-input" data-key="mediaLabel" value="${escapeAttr(config.mediaLabel || 'Media')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Media Link</label>
            <input type="text" class="pb-editor-input" data-key="mediaHref" value="${escapeAttr(config.mediaHref || 'media.html')}">
          </div>
        `
        )
      );
      contentSections.push(
        renderSectionCard(
          'Behavior',
          'Display Rules',
          'Choose how much of the feed UI is enabled in this module instance.',
          `
          <div class="pb-editor-field">
            <label class="pb-editor-label">
              <input type="checkbox" data-key="showAuthor" ${config.showAuthor !== false ? 'checked' : ''}> Show Author
            </label>
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Feed Limit</label>
            <input type="number" class="pb-editor-input" data-key="limit" value="${config.limit || 5}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">
              <input type="checkbox" data-key="showDropdown" ${config.showDropdown !== false ? 'checked' : ''}> Enable Dropdown Feed
            </label>
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">
              <input type="checkbox" data-key="showMediaButton" ${config.showMediaButton !== false ? 'checked' : ''}> Show Media Button
            </label>
          </div>
        `
        )
      );
      contentSections.push(renderFeedStyleSection(config.style || {}));
      break;
    }

    case 'media-gallery':
      contentSections.push(renderCmsSourceCard(moduleType, config, currentPage, pages));
      contentSections.push(
        renderSectionCard(
          'Content',
          'Media Gallery Settings',
          'Display public and premium media-library items from the site media index.',
          `
          <div class="pb-editor-field">
            <label class="pb-editor-label">Columns</label>
            <input type="number" class="pb-editor-input" data-key="columns" min="1" max="6" value="${config.columns || 3}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Limit</label>
            <input type="number" class="pb-editor-input" data-key="limit" min="1" max="100" value="${config.limit || 24}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">
              <input type="checkbox" data-key="showCaptions" ${config.showCaptions !== false ? 'checked' : ''}> Show Captions
            </label>
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">
              <input type="checkbox" data-key="includePremium" ${config.includePremium !== false ? 'checked' : ''}> Include Premium Items
            </label>
          </div>
        `
        )
      );
      break;

    case 'gallery':
      contentSections.push(renderGalleryEditor(config));
      break;

    case 'video':
      contentSections.push(renderVideoEditor(config));
      break;

    case 'divider':
      contentSections.push(renderDividerEditor(config));
      break;

    case 'entry-gallery':
      contentSections.push(renderCmsSourceCard(moduleType, config, currentPage, pages));
      contentSections.push(renderEntryGalleryEditor(config));
      break;

    // Shell chrome as blocks (Phase 6): the gear / 9-dot buttons keep their live
    // behavior (same overlays as the fixed shell buttons) and expose icon color here;
    // deeper styling is available via the raw config `appearance` key.
    case 'account':
    case 'links-grid':
      contentSections.push(
        renderSectionCard(
          'Behavior',
          moduleType === 'account' ? 'Account Settings Button' : 'Links Grid Button',
          moduleType === 'account'
            ? 'Opens the same Account Settings overlay as the built-in gear button. Placing this block hides the fixed shell button on this page.'
            : 'Returns the right panel to its links view, like the built-in 9-dot button. Placing this block hides the fixed shell button on this page.',
          `
          <div class="pb-editor-field pb-editor-field--row">
            <label class="pb-editor-label">Icon Color</label>
            <input type="color" class="pb-promo-style-color" data-key="iconColor" value="${escapeAttr(config.iconColor || (moduleType === 'account' ? '#ffed00' : '#00d9ff'))}">
          </div>
        `
        )
      );
      break;

    default:
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

  // Only modules that still use the generic draft binder can safely keep the
  // generic raw JSON escape hatch. Dedicated editor flows must not render a
  // raw card unless they intentionally parse and persist `_raw`.
  const MODULES_RETAINING_RAW_CARD = new Set([
    'header',
    'text',
    'image',
    'spacer',
    'email-signup',
    'feed',
    'account',
    'links-grid',
  ]);
  // Shared wrapper layout (config.layout): available on every structured module type.
  if (responsiveEditScope !== 'device' && moduleType !== 'reader') {
    contentSections.push(renderModuleLayoutCard(config));
  }

  if (MODULES_RETAINING_RAW_CARD.has(moduleType) && responsiveEditScope !== 'device') {
    contentSections.push(renderRawConfigCard(config));
  }

  return contentSections.join('');
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

  const baseConfig = draftConfig || selectedModule.config || {};
  const styleScope =
    moduleType === 'buttons' && responsiveEditScope === 'device' ? 'device' : 'global';
  const config =
    styleScope === 'device'
      ? getEffectiveModuleConfig(
          { ...selectedModule, config: baseConfig },
          { builderEditing: true, deviceId: activeDeviceId }
        )
      : baseConfig;
  const sections = [];

  if (moduleType === 'buttons') {
    sections.push(renderStyleScopeCard({ activeDeviceId, responsiveEditScope: styleScope }));
    sections.push(
      renderButtonsEditor(config, pages, {
        deviceOnly: styleScope === 'device',
        styleOnly: true,
      })
    );
  } else if (moduleType === 'email-signup') {
    sections.push(renderEmailSignupStyleSection(config.style || {}));
  } else if (moduleType === 'feed') {
    sections.push(renderFeedStyleSection(config.style || {}));
  }

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

  if (selectedModule.moduleType === 'buttons') {
    const styleScope = responsiveEditScope === 'device' ? 'device' : 'global';
    bindButtonsEditorEvents({
      el,
      draftConfig,
      setDraftConfig,
      renderEditorPanel,
      markDirty,
      pages,
      activeDeviceId,
      responsiveEditScope: styleScope,
      styleOnly: true,
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

  if (responsiveEditScope === 'device') {
    if (selectedModule.moduleType === 'buttons') {
      bindButtonsEditorEvents({
        el,
        draftConfig,
        setDraftConfig,
        renderEditorPanel,
        markDirty,
        pages,
        activeDeviceId,
        responsiveEditScope,
      });
      return;
    }
    if (selectedModule.moduleType === 'gallery') {
      bindGalleryEditorEvents({
        el,
        draftConfig,
        setDraftConfig,
        renderEditorPanel,
        markDirty,
        openImagePicker,
        fetchAssets,
        uploadAssetFile,
        activeDeviceId,
        responsiveEditScope,
      });
      return;
    }
    if (selectedModule.moduleType === 'entry-gallery') {
      bindEntryGalleryEditorEvents({
        el,
        draftConfig,
        setDraftConfig,
        markDirty,
        activeDeviceId,
        responsiveEditScope,
      });
      return;
    }
    if (selectedModule.moduleType === 'reader') {
      bindReaderEditorEvents({
        el,
        draftConfig,
        setDraftConfig,
        renderEditorPanel,
        markDirty,
        activeDeviceId,
        responsiveEditScope,
      });
      return;
    }
    if (
      selectedModule.moduleType === 'text' ||
      selectedModule.moduleType === 'spacer' ||
      selectedModule.moduleType === 'feed'
    ) {
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
  const DEDICATED_EDITOR_TYPES = new Set([
    'promo',
    'social',
    'buttons',
    'gallery',
    'video',
    'divider',
    'entry-gallery',
  ]);
  const useLayoutBridge =
    DEDICATED_EDITOR_TYPES.has(selectedModule.moduleType) &&
    !!el.pbModuleEditor.querySelector('[data-layout-key]');
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

  if (selectedModule.moduleType === 'promo') {
    bindPromoDraftEvents({
      el,
      draftConfig,
      setDraftConfig: draftSetter,
      renderEditorPanel,
      markDirty,
      openImagePicker,
      fetchAssets,
      uploadAssetFile,
      activeDeviceId,
      responsiveEditScope,
    });
    return;
  }

  if (selectedModule.moduleType === 'social') {
    bindSocialDraftEvents({
      el,
      draftConfig,
      setDraftConfig: draftSetter,
      renderEditorPanel,
      markDirty,
      openImagePicker,
      fetchAssets,
      uploadAssetFile,
    });
    return;
  }

  if (selectedModule.moduleType === 'buttons') {
    bindButtonsEditorEvents({
      el,
      draftConfig,
      setDraftConfig: draftSetter,
      renderEditorPanel,
      markDirty,
      pages,
      activeDeviceId,
      responsiveEditScope,
    });
    return;
  }

  if (selectedModule.moduleType === 'gallery') {
    bindGalleryEditorEvents({
      el,
      draftConfig,
      setDraftConfig: draftSetter,
      renderEditorPanel,
      markDirty,
      openImagePicker,
      fetchAssets,
      uploadAssetFile,
      activeDeviceId,
      responsiveEditScope,
    });
    return;
  }

  if (selectedModule.moduleType === 'video') {
    bindVideoEditorEvents({
      el,
      draftConfig,
      setDraftConfig: draftSetter,
      markDirty,
      activeDeviceId,
      responsiveEditScope,
      renderEditorPanel,
    });
    return;
  }

  if (selectedModule.moduleType === 'divider') {
    bindDividerEditorEvents({
      el,
      draftConfig,
      setDraftConfig: draftSetter,
      markDirty,
    });
    return;
  }

  if (selectedModule.moduleType === 'entry-gallery') {
    bindEntryGalleryEditorEvents({
      el,
      draftConfig,
      setDraftConfig: draftSetter,
      markDirty,
      activeDeviceId,
      responsiveEditScope,
      renderEditorPanel,
    });
    return;
  }

  if (selectedModule.moduleType === 'reader') {
    bindReaderEditorEvents({
      el,
      draftConfig,
      setDraftConfig,
      renderEditorPanel,
      markDirty,
      activeDeviceId,
      responsiveEditScope,
    });
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

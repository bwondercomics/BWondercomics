import { renderInspectorSection } from './inspector-sections.js';
import { setResponsiveOverrideValue } from '../../shared/page-builder/responsive-overrides.js';

function normalizeEntryGalleryConfig(config = {}) {
  return {
    ...JSON.parse(JSON.stringify(config || {})),
    source: config.source && typeof config.source === 'object' ? { ...config.source } : {},
    columns: config.columns || 3,
    showLabels: config.showLabels !== false,
  };
}

export function renderEntryGalleryEditor(config = {}, options = {}) {
  const normalized = normalizeEntryGalleryConfig(config);
  const deviceOnly = options.deviceOnly === true;

  return renderInspectorSection({
    kicker: 'Appearance',
    title: 'Entry Gallery Settings',
    summary: `${normalized.columns} columns`,
    copy: 'Configure how the entries in this series are displayed.',
    body: `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Columns</label>
        <input type="number" class="pb-editor-input pb-entry-gallery-input" data-key="columns" min="1" max="6" value="${normalized.columns}">
      </div>
      ${
        deviceOnly
          ? ''
          : `
      <div class="pb-editor-field">
        <label class="pb-editor-label">
          <input type="checkbox" class="pb-entry-gallery-input" data-key="showLabels" ${normalized.showLabels ? 'checked' : ''}> Show Labels
        </label>
      </div>
      `
      }
    `,
  });
}

export function bindEntryGalleryEditorEvents({
  el,
  draftConfig,
  setDraftConfig,
  markDirty,
  activeDeviceId = 'desktop',
  responsiveEditScope = 'global',
  renderEditorPanel,
}) {
  let config = normalizeEntryGalleryConfig(draftConfig);

  const commit = (nextConfig) => {
    config = normalizeEntryGalleryConfig(nextConfig);
    setDraftConfig(config);
    markDirty('module');
  };

  el.pbModuleEditor.querySelectorAll('.pb-entry-gallery-input').forEach((input) => {
    const eventName = input.type === 'checkbox' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      const nextConfig = normalizeEntryGalleryConfig(config);
      const key = input.dataset.key;
      if (key === 'columns') {
        const value = parseInt(input.value, 10) || 3;
        if (responsiveEditScope === 'device') {
          setResponsiveOverrideValue(nextConfig, activeDeviceId, key, value);
        } else {
          nextConfig[key] = value;
        }
      } else if (key === 'showLabels' && responsiveEditScope !== 'device') {
        nextConfig[key] = input.checked;
      }
      commit(nextConfig);
    });
  });

  el.pbModuleEditor.querySelectorAll('[data-source-key]').forEach((input) => {
    const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      if (responsiveEditScope === 'device') return;
      const key = input.dataset.sourceKey;
      if (!key) return;
      const nextConfig = normalizeEntryGalleryConfig(config);
      nextConfig.source =
        nextConfig.source && typeof nextConfig.source === 'object' ? nextConfig.source : {};
      nextConfig.source[key] = input.value;
      if (nextConfig.source.mode !== 'specific-series') {
        delete nextConfig.source.seriesId;
      }
      commit(nextConfig);
      if (key === 'mode') {
        renderEditorPanel?.();
      }
    });
  });
}

// Registry entry for the module editor (see module-editor-registry.js for the contract).
export const entryGalleryModuleEditor = {
  usesLayoutBridge: true,
  renderContent: ({ config, currentPage, pages, moduleType, shared }) => [
    shared.renderCmsSourceCard(moduleType, config, currentPage, pages),
    renderEntryGalleryEditor(config),
  ],
  renderDeviceOverrides: ({ config, responsiveFields }) =>
    responsiveFields.includes('columns')
      ? [renderEntryGalleryEditor(config, { deviceOnly: true })]
      : [],
  bindEvents: bindEntryGalleryEditorEvents,
  bindDeviceEvents: bindEntryGalleryEditorEvents,
};

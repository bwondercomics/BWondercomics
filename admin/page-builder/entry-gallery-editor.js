import { renderInspectorSection } from './inspector-sections.js';
import { setResponsiveOverrideValue } from './responsive-overrides.js';

function normalizeEntryGalleryConfig(config = {}) {
  return {
    ...JSON.parse(JSON.stringify(config || {})),
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
}

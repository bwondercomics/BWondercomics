import { renderInspectorCard } from './inspector-sections.js';

function renderMediaGallerySettingsCard(config = {}) {
  return renderInspectorCard(
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
  );
}

// Registry entry for the module editor (see module-editor-registry.js for the contract).
export const mediaGalleryModuleEditor = {
  renderContent: ({ config, currentPage, pages, moduleType, shared }) => [
    shared.renderCmsSourceCard(moduleType, config, currentPage, pages),
    renderMediaGallerySettingsCard(config),
  ],
  renderDeviceOverrides: ({ config, responsiveFields }) =>
    responsiveFields.includes('columns')
      ? [
          renderInspectorCard(
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
        ]
      : [],
};

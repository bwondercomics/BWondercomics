import { renderInspectorCard } from './inspector-sections.js';

function renderSpacerHeightCard(config = {}) {
  return renderInspectorCard(
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

// Registry entry for the module editor (see module-editor-registry.js for the contract).
export const spacerModuleEditor = {
  retainsRawCard: true,
  deviceBindsGeneric: true,
  renderContent: ({ config }) => [renderSpacerHeightCard(config)],
  renderDeviceOverrides: ({ config, responsiveFields }) =>
    responsiveFields.includes('height') ? [renderSpacerHeightCard(config)] : [],
};

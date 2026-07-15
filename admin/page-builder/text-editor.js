import { escapeHtml } from '../../shared/page-builder/helpers.js';
import { renderInspectorCard } from './inspector-sections.js';

function renderTextAlignmentCard(config = {}) {
  return renderInspectorCard(
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

// Registry entry for the module editor (see module-editor-registry.js for the contract).
export const textModuleEditor = {
  retainsRawCard: true,
  deviceBindsGeneric: true,
  renderContent: ({ config }) => [
    renderInspectorCard(
      'Content',
      'Rich Text',
      'HTML is supported for emphasis, links, and custom formatting.',
      `
          <div class="pb-editor-field">
            <label class="pb-editor-label">Content (HTML)</label>
            <textarea class="pb-editor-textarea" data-key="content">${escapeHtml(config.content || '')}</textarea>
          </div>
        `
    ),
    renderTextAlignmentCard(config),
  ],
  renderDeviceOverrides: ({ config, responsiveFields }) =>
    responsiveFields.includes('alignment') ? [renderTextAlignmentCard(config)] : [],
};

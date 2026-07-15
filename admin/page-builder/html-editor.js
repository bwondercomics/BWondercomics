import { escapeHtml } from '../../shared/page-builder/helpers.js';
import { renderInspectorCard } from './inspector-sections.js';

// Registry entry for the module editor (see module-editor-registry.js for the contract).
// No raw-config card: the code field is already the raw escape hatch.
export const htmlModuleEditor = {
  renderContent: ({ config }) => [
    renderInspectorCard(
      'Advanced',
      'Custom HTML',
      'Use for bespoke markup when the structured modules are not enough.',
      `
          <div class="pb-editor-field">
            <label class="pb-editor-label">Custom HTML</label>
            <textarea class="pb-editor-textarea pb-editor-textarea--code" data-key="code">${escapeHtml(config.code || '')}</textarea>
          </div>
        `
    ),
  ],
};

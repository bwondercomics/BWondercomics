import { escapeAttr } from '../../shared/page-builder/helpers.js';
import { renderInspectorCard } from './inspector-sections.js';

// Registry entry for the module editor (see module-editor-registry.js for the contract).
export const imageModuleEditor = {
  retainsRawCard: true,
  renderContent: ({ config }) => [
    renderInspectorCard(
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
    ),
  ],
};

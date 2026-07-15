import { escapeAttr } from '../../shared/page-builder/helpers.js';
import { renderInspectorCard } from './inspector-sections.js';

// Editor for the legacy in-canvas `header` module (distinct from the page header
// editor in header-editor.js, which edits meta.header).

// Registry entry for the module editor (see module-editor-registry.js for the contract).
export const headerModuleEditor = {
  retainsRawCard: true,
  renderContent: ({ config }) => [
    renderInspectorCard(
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
    ),
  ],
};

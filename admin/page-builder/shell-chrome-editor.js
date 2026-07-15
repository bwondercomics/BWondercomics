import { escapeAttr } from '../../shared/page-builder/helpers.js';
import { renderInspectorCard } from './inspector-sections.js';

// Shell chrome as blocks (Phase 6): the gear / 9-dot buttons keep their live
// behavior (same overlays as the fixed shell buttons) and expose icon color here;
// deeper styling is available via the raw config `appearance` key.
function createShellChromeEditor(moduleType) {
  return {
    retainsRawCard: true,
    renderContent: ({ config }) => [
      renderInspectorCard(
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
      ),
    ],
  };
}

// Registry entries for the module editor (see module-editor-registry.js for the contract).
export const accountModuleEditor = createShellChromeEditor('account');
export const linksGridModuleEditor = createShellChromeEditor('links-grid');

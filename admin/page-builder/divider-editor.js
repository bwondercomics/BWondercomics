import { escapeAttr } from '../../shared/page-builder/helpers.js';
import { renderInspectorSection } from './inspector-sections.js';

function normalizeDividerConfig(config = {}) {
  return {
    style: config.style || 'solid',
    color: config.color || '',
  };
}

export function renderDividerEditor(config = {}) {
  const normalized = normalizeDividerConfig(config);

  return renderInspectorSection({
    kicker: 'Appearance',
    title: 'Divider Styling',
    summary: `${normalized.style || 'solid'} line`,
    copy: 'Choose the style and color of the horizontal ruling line.',
    body: `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Style</label>
        <select class="pb-editor-select pb-divider-input" data-key="style">
          <option value="solid" ${normalized.style === 'solid' ? 'selected' : ''}>Solid</option>
          <option value="dashed" ${normalized.style === 'dashed' ? 'selected' : ''}>Dashed</option>
          <option value="dotted" ${normalized.style === 'dotted' ? 'selected' : ''}>Dotted</option>
        </select>
      </div>
      <div class="pb-editor-field pb-editor-field--row">
        <label class="pb-editor-label">Color</label>
        <input type="color" class="pb-promo-style-color pb-divider-input" data-key="color" value="${escapeAttr(normalized.color || '#ffffff')}">
      </div>
    `,
  });
}

export function bindDividerEditorEvents({ el, draftConfig, setDraftConfig, markDirty }) {
  let config = normalizeDividerConfig(draftConfig);

  const commit = (nextConfig) => {
    config = normalizeDividerConfig(nextConfig);
    setDraftConfig(config);
    markDirty('module');
  };

  el.pbModuleEditor.querySelectorAll('.pb-divider-input').forEach((input) => {
    const eventName = input.type === 'color' || input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      const nextConfig = normalizeDividerConfig(config);
      const key = input.dataset.key;
      if (key) {
        nextConfig[key] = input.value;
      }
      commit(nextConfig);
    });
  });
}

// Registry entry for the module editor (see module-editor-registry.js for the contract).
export const dividerModuleEditor = {
  usesLayoutBridge: true,
  renderContent: ({ config }) => [renderDividerEditor(config)],
  bindEvents: bindDividerEditorEvents,
};

import { escapeAttr } from '../../shared/page-builder/helpers.js';
import { renderInspectorCard } from './inspector-sections.js';

function renderEmailSignupStyleSection(emailStyle = {}) {
  return renderInspectorCard(
    'Appearance',
    'Visual Styling',
    'Tune typography and emphasis without editing raw JSON.',
    `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Heading Font</label>
        <select class="pb-editor-select" data-style-key="headingFont">
          <option value="default" ${emailStyle.headingFont === 'default' ? 'selected' : ''}>Default</option>
          <option value="display" ${emailStyle.headingFont === 'display' ? 'selected' : ''}>Display (Bebas)</option>
          <option value="mono" ${emailStyle.headingFont === 'mono' ? 'selected' : ''}>Monospace</option>
        </select>
      </div>
      <div class="pb-editor-field pb-editor-field--row">
        <label class="pb-editor-label">Heading Color</label>
        <input type="color" class="pb-promo-style-color" data-style-key="headingColor" value="${emailStyle.headingColor || '#ffffff'}">
        <label><input type="checkbox" data-style-key="headingGlow" ${emailStyle.headingGlow ? 'checked' : ''}> Glow</label>
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Input Style</label>
        <select class="pb-editor-select" data-style-key="inputStyle">
          <option value="bubble" ${emailStyle.inputStyle === 'bubble' ? 'selected' : ''}>Bubble (glow border)</option>
          <option value="flat" ${emailStyle.inputStyle === 'flat' ? 'selected' : ''}>Flat</option>
        </select>
      </div>
      <div class="pb-editor-field pb-editor-field--row">
        <label class="pb-editor-label">Button Color</label>
        <input type="color" class="pb-promo-style-color" data-style-key="buttonColor" value="${emailStyle.buttonColor || '#00d9ff'}">
        <label><input type="checkbox" data-style-key="buttonGlow" ${emailStyle.buttonGlow ? 'checked' : ''}> Glow</label>
      </div>
    `
  );
}

// Registry entry for the module editor (see module-editor-registry.js for the contract).
export const emailSignupModuleEditor = {
  retainsRawCard: true,
  renderContent: ({ config }) => [
    renderInspectorCard(
      'Content',
      'Signup Copy',
      'Set the visible text and call-to-action copy for the email form.',
      `
          <div class="pb-editor-field">
            <label class="pb-editor-label">Heading</label>
            <input type="text" class="pb-editor-input" data-key="heading" value="${escapeAttr(config.heading || '')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Subtext (optional)</label>
            <input type="text" class="pb-editor-input" data-key="subtext" value="${escapeAttr(config.subtext || '')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Placeholder</label>
            <input type="text" class="pb-editor-input" data-key="placeholder" value="${escapeAttr(config.placeholder || '')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Button Text</label>
            <input type="text" class="pb-editor-input" data-key="buttonText" value="${escapeAttr(config.buttonText || '')}">
          </div>
        `
    ),
    renderEmailSignupStyleSection(config.style || {}),
  ],
  renderStyle: ({ config }) => [renderEmailSignupStyleSection(config.style || {})],
};

import { escapeAttr, escapeHtml, resolveAssetUrl } from '../../shared/page-builder/helpers.js';
import { renderInspectorSection } from './inspector-sections.js';

export function generateSocialButtonId() {
  return 'social-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

export function getDefaultSocialButtonStyle() {
  return {
    bgColor: '#00d9ff',
    bgOpacity: 1.0,
    textColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#00d9ff',
    borderOpacity: 1.0,
    borderRadius: 8,
  };
}

export function renderSocialEditor(config) {
  const buttons = config.buttons || [];

  const buttonsHtml = buttons
    .map((btn, index) => {
      const style = btn.style || getDefaultSocialButtonStyle();
      const iconPreview = btn.icon
        ? /\.(png|jpe?g|webp|gif|svg)$/i.test(btn.icon)
          ? `<img src="${escapeAttr(resolveAssetUrl(btn.icon))}" alt="" style="width:24px;height:24px;object-fit:contain;vertical-align:middle;">`
          : escapeHtml(btn.icon)
        : 'none';

      return `
      <div class="pb-promo-item pb-social-item" data-item-index="${index}">
        <div class="pb-promo-item-header">
          <span class="pb-promo-item-num">#${index + 1}</span>
          <div class="pb-promo-item-actions">
            <button type="button" class="pb-promo-action" data-action="move-up" ${index === 0 ? 'disabled' : ''} title="Move up">\u2191</button>
            <button type="button" class="pb-promo-action" data-action="move-down" ${index === buttons.length - 1 ? 'disabled' : ''} title="Move down">\u2193</button>
            <button type="button" class="pb-promo-action pb-promo-action--delete" data-action="remove" title="Remove">\u00D7</button>
          </div>
        </div>

        <div class="pb-editor-field">
          <label class="pb-editor-label">Icon</label>
          <div class="pb-editor-inline-actions">
            <input type="text" class="pb-editor-input pb-social-input pb-social-input--icon" data-item-index="${index}" data-item-key="icon" value="${escapeAttr(btn.icon || '')}" placeholder="Emoji or image URL">
            <button type="button" class="btn-secondary pb-social-icon-pick" data-item-index="${index}">Choose</button>
          </div>
          <small class="pb-editor-hint pb-social-icon-preview" data-item-index="${index}">Current: ${iconPreview}</small>
        </div>

        <div class="pb-editor-field">
          <label class="pb-editor-label">Label</label>
          <input type="text" class="pb-editor-input pb-social-input" data-item-index="${index}" data-item-key="text" value="${escapeAttr(btn.text || '')}" placeholder="Button text">
        </div>

        <div class="pb-editor-field">
          <label class="pb-editor-label">URL</label>
          <input type="text" class="pb-editor-input pb-social-input" data-item-index="${index}" data-item-key="url" value="${escapeAttr(btn.url || '')}" placeholder="https://...">
        </div>

        <details class="pb-promo-style-accordion">
          <summary class="pb-promo-style-toggle">Style Options</summary>
          <div class="pb-promo-style-content">
            <div class="pb-style-group">
              <div class="pb-editor-field pb-editor-field--row">
                <label class="pb-editor-label">Background</label>
                <input type="color" class="pb-social-style-color" data-item-index="${index}" data-style-key="bgColor" value="${style.bgColor || '#00d9ff'}">
              </div>
              <div class="pb-editor-field pb-editor-field--row">
                <label class="pb-editor-label">BG Opacity</label>
                <input type="range" class="pb-social-style-range" data-item-index="${index}" data-style-key="bgOpacity" min="0" max="1" step="0.05" value="${typeof style.bgOpacity === 'number' ? style.bgOpacity : 1.0}">
              </div>
              <div class="pb-editor-field pb-editor-field--row">
                <label class="pb-editor-label">Text Color</label>
                <input type="color" class="pb-social-style-color" data-item-index="${index}" data-style-key="textColor" value="${style.textColor || '#ffffff'}">
              </div>
              <div class="pb-editor-field pb-editor-field--row">
                <label class="pb-editor-label">Border Width</label>
                <input type="number" class="pb-editor-input pb-social-style-input" data-item-index="${index}" data-style-key="borderWidth" value="${style.borderWidth ?? 2}" min="0" max="10" style="width:60px;">
              </div>
              <div class="pb-editor-field pb-editor-field--row">
                <label class="pb-editor-label">Border Color</label>
                <input type="color" class="pb-social-style-color" data-item-index="${index}" data-style-key="borderColor" value="${style.borderColor || '#00d9ff'}">
              </div>
              <div class="pb-editor-field pb-editor-field--row">
                <label class="pb-editor-label">Border Opacity</label>
                <input type="range" class="pb-social-style-range" data-item-index="${index}" data-style-key="borderOpacity" min="0" max="1" step="0.05" value="${typeof style.borderOpacity === 'number' ? style.borderOpacity : 1.0}">
              </div>
              <div class="pb-editor-field pb-editor-field--row">
                <label class="pb-editor-label">Border Radius</label>
                <input type="number" class="pb-editor-input pb-social-style-input" data-item-index="${index}" data-style-key="borderRadius" value="${style.borderRadius ?? 8}" min="0" max="50" style="width:60px;">
              </div>
            </div>
          </div>
        </details>
      </div>
    `;
    })
    .join('');

  return renderInspectorSection({
    kicker: 'Content',
    title: 'Social Buttons',
    summary: `${buttons.length} button${buttons.length === 1 ? '' : 's'}`,
    copy: 'Manage button order, icon assets, destination URLs, and per-button styling.',
    body: `
      <div class="pb-promo-items-section">
        <div class="pb-editor-toolbar">
          <button type="button" class="btn-secondary" id="pbSocialAddButton">+ Add Button</button>
        </div>
        <div class="pb-promo-items-list" id="pbSocialButtonsList">
          ${buttonsHtml || '<div class="pb-promo-empty">No buttons. Click "+ Add Button" to create one.</div>'}
        </div>
      </div>
    `,
  });
}

function cloneConfig(config = {}) {
  return JSON.parse(JSON.stringify(config || {}));
}

function normalizeSocialButton(button = {}) {
  return {
    id: button.id || generateSocialButtonId(),
    icon: button.icon || '',
    text: button.text || '',
    url: button.url || '',
    style: {
      ...getDefaultSocialButtonStyle(),
      ...(button.style || {}),
    },
  };
}

function normalizeSocialConfig(config = {}) {
  return {
    ...cloneConfig(config),
    buttons: (config.buttons || []).map(normalizeSocialButton),
  };
}

function bindSocialDraftEvents({
  el,
  draftConfig,
  setDraftConfig,
  renderEditorPanel,
  markDirty,
  openImagePicker,
  fetchAssets,
  uploadAssetFile,
}) {
  let config = normalizeSocialConfig(draftConfig);

  const commit = (nextConfig, rerenderEditor = false) => {
    config = normalizeSocialConfig(nextConfig);
    setDraftConfig(config);
    markDirty('module');
    if (rerenderEditor) {
      renderEditorPanel();
    }
  };

  document.getElementById('pbSocialAddButton')?.addEventListener('click', () => {
    const nextConfig = normalizeSocialConfig(config);
    nextConfig.buttons.push(normalizeSocialButton());
    commit(nextConfig, true);
  });

  el.pbModuleEditor.querySelectorAll('.pb-social-item').forEach((itemEl) => {
    const index = parseInt(itemEl.dataset.itemIndex, 10);

    itemEl.querySelector('[data-action="remove"]')?.addEventListener('click', () => {
      const nextConfig = normalizeSocialConfig(config);
      nextConfig.buttons.splice(index, 1);
      commit(nextConfig, true);
    });

    itemEl.querySelector('[data-action="move-up"]')?.addEventListener('click', () => {
      if (index <= 0) return;
      const nextConfig = normalizeSocialConfig(config);
      [nextConfig.buttons[index - 1], nextConfig.buttons[index]] = [
        nextConfig.buttons[index],
        nextConfig.buttons[index - 1],
      ];
      commit(nextConfig, true);
    });

    itemEl.querySelector('[data-action="move-down"]')?.addEventListener('click', () => {
      if (index >= config.buttons.length - 1) return;
      const nextConfig = normalizeSocialConfig(config);
      [nextConfig.buttons[index], nextConfig.buttons[index + 1]] = [
        nextConfig.buttons[index + 1],
        nextConfig.buttons[index],
      ];
      commit(nextConfig, true);
    });

    itemEl.querySelector('.pb-social-icon-pick')?.addEventListener('click', async () => {
      const current = config.buttons[index] || {};
      await openImagePicker({
        title: 'Select button icon',
        getItems: fetchAssets,
        allowUpload: true,
        uploadHandler: uploadAssetFile,
        showEditor: false,
        initialSelection: { path: current.icon || '' },
        onApply: ({ item }) => {
          const nextConfig = normalizeSocialConfig(config);
          if (!nextConfig.buttons[index]) return;
          nextConfig.buttons[index].icon = item?.path || '';
          commit(nextConfig, true);
        },
      });
    });
  });

  el.pbModuleEditor.querySelectorAll('.pb-social-input').forEach((input) => {
    const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      const index = parseInt(input.dataset.itemIndex, 10);
      const key = input.dataset.itemKey;
      const nextConfig = normalizeSocialConfig(config);
      if (!nextConfig.buttons[index] || !key) return;
      nextConfig.buttons[index][key] = input.value;
      commit(nextConfig);
    });
  });

  el.pbModuleEditor
    .querySelectorAll('.pb-social-style-input, .pb-social-style-color, .pb-social-style-range')
    .forEach((input) => {
      const eventName = input.type === 'range' ? 'input' : 'change';
      input.addEventListener(eventName, () => {
        const index = parseInt(input.dataset.itemIndex, 10);
        const key = input.dataset.styleKey;
        const nextConfig = normalizeSocialConfig(config);
        if (!nextConfig.buttons[index] || !key) return;
        if (input.type === 'range' || input.type === 'number') {
          nextConfig.buttons[index].style[key] = parseFloat(input.value);
        } else {
          nextConfig.buttons[index].style[key] = input.value;
        }
        commit(nextConfig);
      });
    });
}

// Registry entry for the module editor (see module-editor-registry.js for the contract).
export const socialModuleEditor = {
  usesLayoutBridge: true,
  renderContent: ({ config }) => [renderSocialEditor(config)],
  bindEvents: bindSocialDraftEvents,
};

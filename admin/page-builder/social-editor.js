import { escapeAttr, escapeHtml, resolveAssetUrl } from './helpers.js';
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

const sanitizeButton = (btn = {}) => ({
  id: btn.id || generateSocialButtonId(),
  icon: btn.icon || '',
  text: btn.text || '',
  url: btn.url || '',
  style: btn.style || getDefaultSocialButtonStyle(),
});

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

export function bindSocialEditorEvents({
  el,
  currentPage,
  selectedModuleId,
  updateModule,
  renderCanvas,
  renderEditorPanel,
  openImagePicker,
  fetchAssets,
  uploadAssetFile,
}) {
  if (!currentPage || !selectedModuleId) return;

  let selectedModule = null;
  for (const section of currentPage?.sections || []) {
    const found = (section.modules || []).find((m) => m.id === selectedModuleId);
    if (found) {
      selectedModule = found;
      break;
    }
  }
  if (!selectedModule || selectedModule.moduleType !== 'social') return;

  const config = { ...(selectedModule.config || {}) };
  const buttons = [...(config.buttons || [])].map(sanitizeButton);

  async function saveSocialConfig(newConfig, rerenderEditor = false) {
    const merged = {
      ...config,
      ...newConfig,
      buttons: (newConfig.buttons || buttons).map(sanitizeButton),
    };
    const updated = await updateModule(selectedModuleId, { config: merged });
    if (updated) {
      selectedModule.config = updated.config;
      Object.assign(config, updated.config);
      buttons.length = 0;
      buttons.push(...(updated.config.buttons || []).map(sanitizeButton));
      renderCanvas();
      if (rerenderEditor) {
        renderEditorPanel();
      }
    }
  }

  // Add button
  document.getElementById('pbSocialAddButton')?.addEventListener('click', () => {
    buttons.push(sanitizeButton());
    saveSocialConfig({ ...config, buttons }, true);
  });

  // Per-item events
  el.pbModuleEditor.querySelectorAll('.pb-social-item').forEach((itemEl) => {
    const index = parseInt(itemEl.dataset.itemIndex, 10);

    itemEl.querySelector('[data-action="remove"]')?.addEventListener('click', () => {
      buttons.splice(index, 1);
      saveSocialConfig({ ...config, buttons }, true);
    });

    itemEl.querySelector('[data-action="move-up"]')?.addEventListener('click', () => {
      if (index > 0) {
        [buttons[index - 1], buttons[index]] = [buttons[index], buttons[index - 1]];
        saveSocialConfig({ ...config, buttons }, true);
      }
    });

    itemEl.querySelector('[data-action="move-down"]')?.addEventListener('click', () => {
      if (index < buttons.length - 1) {
        [buttons[index], buttons[index + 1]] = [buttons[index + 1], buttons[index]];
        saveSocialConfig({ ...config, buttons }, true);
      }
    });

    // Image picker for icon
    itemEl.querySelector('.pb-social-icon-pick')?.addEventListener('click', async () => {
      const current = buttons[index] || {};
      await openImagePicker({
        title: 'Select button icon',
        getItems: fetchAssets,
        allowUpload: true,
        uploadHandler: uploadAssetFile,
        resolveSrc: resolveAssetUrl,
        showEditor: false,
        initialSelection: { path: current.icon || '' },
        onApply: ({ item }) => {
          if (!buttons[index]) return;
          buttons[index].icon = item?.path || '';
          // Update icon input and preview
          const iconInput = itemEl.querySelector('[data-item-key="icon"]');
          if (iconInput) iconInput.value = buttons[index].icon;
          const preview = itemEl.querySelector('.pb-social-icon-preview');
          if (preview) {
            const src = resolveAssetUrl(buttons[index].icon);
            preview.innerHTML = `Current: <img src="${escapeAttr(src)}" alt="" style="width:24px;height:24px;object-fit:contain;vertical-align:middle;">`;
          }
          saveSocialConfig({ ...config, buttons });
        },
      });
    });
  });

  // Field changes (icon, text, url)
  el.pbModuleEditor.querySelectorAll('.pb-social-input').forEach((input) => {
    input.addEventListener('change', () => {
      const index = parseInt(input.dataset.itemIndex, 10);
      const key = input.dataset.itemKey;
      if (buttons[index] && key) {
        buttons[index][key] = input.value;
        saveSocialConfig({ ...config, buttons });
      }
    });
  });

  // Style changes
  el.pbModuleEditor
    .querySelectorAll('.pb-social-style-input, .pb-social-style-color, .pb-social-style-range')
    .forEach((input) => {
      input.addEventListener('change', () => {
        const index = parseInt(input.dataset.itemIndex, 10);
        const key = input.dataset.styleKey;
        if (buttons[index] && key) {
          if (!buttons[index].style) buttons[index].style = getDefaultSocialButtonStyle();
          if (input.type === 'range' || input.type === 'number') {
            buttons[index].style[key] = parseFloat(input.value);
          } else {
            buttons[index].style[key] = input.value;
          }
          saveSocialConfig({ ...config, buttons });
        }
      });
    });
}

export function collectSocialConfig(el) {
  const buttons = [];
  el.pbModuleEditor.querySelectorAll('.pb-social-item').forEach((itemEl) => {
    const btn = {
      id: generateSocialButtonId(),
      icon: '',
      text: '',
      url: '',
      style: getDefaultSocialButtonStyle(),
    };

    itemEl.querySelectorAll('.pb-social-input').forEach((input) => {
      const key = input.dataset.itemKey;
      if (key) btn[key] = input.value;
    });

    itemEl
      .querySelectorAll('.pb-social-style-input, .pb-social-style-color, .pb-social-style-range')
      .forEach((input) => {
        const key = input.dataset.styleKey;
        if (key) {
          if (input.type === 'range' || input.type === 'number') {
            btn.style[key] = parseFloat(input.value);
          } else {
            btn.style[key] = input.value;
          }
        }
      });

    buttons.push(btn);
  });

  return { buttons };
}

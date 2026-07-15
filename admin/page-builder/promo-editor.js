import { escapeAttr, escapeHtml } from '../../shared/page-builder/helpers.js';
import { renderInspectorSection } from './inspector-sections.js';

export function generatePromoItemId() {
  return 'promo-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

export function getDefaultPromoItemStyle() {
  return {
    imageBorder: true,
    imageBorderColor: '#00d9ff',
    imageGlow: true,
    imageGlowColor: '#00d9ff',
    imageGlowIntensity: 0.5,
    topTextFont: 'default',
    topTextColor: '#ffed00',
    topTextGlow: true,
    topTextGlowColor: '#ffed00',
    bottomTextFont: 'default',
    bottomTextColor: '#ffffff',
    bottomTextGlow: false,
    bottomTextGlowColor: '#00d9ff',
    backgroundColor: 'transparent',
    backgroundOpacity: 0.6,
    backgroundBlur: false,
    backgroundGlow: false,
  };
}

export function renderPromoEditor(config) {
  const items = config.items || [];

  const itemsHtml = items
    .map((item, index) => {
      const style = item.style || getDefaultPromoItemStyle();
      return `
        <div class="pb-promo-item" data-item-index="${index}">
          <div class="pb-promo-item-header">
            <span class="pb-promo-item-num">#${index + 1}</span>
            <div class="pb-promo-item-actions">
              <button type="button" class="pb-promo-action" data-action="move-up" ${index === 0 ? 'disabled' : ''} title="Move up">\u2191</button>
              <button type="button" class="pb-promo-action" data-action="move-down" ${index === items.length - 1 ? 'disabled' : ''} title="Move down">\u2193</button>
              <button type="button" class="pb-promo-action pb-promo-action--delete" data-action="remove" title="Remove">\u00D7</button>
            </div>
          </div>

          <div class="pb-editor-field">
            <label class="pb-editor-label">Image</label>
            <div class="pb-editor-inline-actions">
              <input type="text" class="pb-editor-input pb-promo-input" data-item-index="${index}" data-item-key="image" value="${escapeAttr(item.image || '')}" readonly>
              <button type="button" class="btn-secondary pb-promo-pick" data-item-index="${index}">Choose</button>
              <button type="button" class="btn-secondary pb-promo-clear" data-item-index="${index}">Clear</button>
            </div>
            <small class="pb-editor-hint pb-promo-image-meta" data-item-index="${index}">${item.image ? 'Image selected' : 'No image selected'}</small>
            <div class="pb-editor-field">
              <label class="pb-editor-label">Image Fit</label>
              <select class="pb-editor-select pb-promo-input" data-item-index="${index}" data-item-key="imageFit">
                <option value="cover" ${item.imageFit !== 'contain' ? 'selected' : ''}>Fill (cover)</option>
                <option value="contain" ${item.imageFit === 'contain' ? 'selected' : ''}>Fit (contain)</option>
              </select>
            </div>
            <div class="pb-editor-field">
              <label class="pb-editor-label">Link URL</label>
              <input type="text" class="pb-editor-input pb-promo-input" data-item-index="${index}" data-item-key="linkUrl" value="${escapeAttr(item.linkUrl || '')}">
            </div>
          </div>

          <div class="pb-editor-field">
            <label class="pb-editor-label">Top Text</label>
            <input type="text" class="pb-editor-input pb-promo-input" data-item-index="${index}" data-item-key="topText" value="${escapeAttr(item.topText || '')}">
          </div>

          <div class="pb-editor-field">
            <label class="pb-editor-label">Bottom Text / CTA (HTML allowed)</label>
            <textarea class="pb-editor-textarea pb-promo-input" data-item-index="${index}" data-item-key="bottomText" rows="2">${escapeHtml(item.bottomText || '')}</textarea>
          </div>

          <div class="pb-editor-field">
            <label class="pb-editor-label">Text Position</label>
            <select class="pb-editor-select pb-promo-input" data-item-index="${index}" data-item-key="textPosition">
              <option value="overlay" ${item.textPosition === 'overlay' ? 'selected' : ''}>Overlay (on image)</option>
              <option value="outside" ${item.textPosition === 'outside' ? 'selected' : ''}>Outside (above/below)</option>
            </select>
          </div>

          <details class="pb-promo-style-accordion">
            <summary class="pb-promo-style-toggle">Style Options</summary>
            <div class="pb-promo-style-content">
              <div class="pb-style-group">
                <div class="pb-style-group-title">Image</div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label><input type="checkbox" class="pb-promo-style-input" data-item-index="${index}" data-style-key="imageBorder" ${style.imageBorder ? 'checked' : ''}> Border</label>
                  <input type="color" class="pb-promo-style-color" data-item-index="${index}" data-style-key="imageBorderColor" value="${style.imageBorderColor || '#00d9ff'}">
                </div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label><input type="checkbox" class="pb-promo-style-input" data-item-index="${index}" data-style-key="imageGlow" ${style.imageGlow ? 'checked' : ''}> Glow</label>
                  <input type="color" class="pb-promo-style-color" data-item-index="${index}" data-style-key="imageGlowColor" value="${style.imageGlowColor || '#00d9ff'}">
                  <input type="range" class="pb-promo-style-range" data-item-index="${index}" data-style-key="imageGlowIntensity" min="0" max="1" step="0.1" value="${style.imageGlowIntensity || 0.5}">
                </div>
              </div>

              <div class="pb-style-group">
                <div class="pb-style-group-title">Top Text</div>
                <div class="pb-editor-field">
                  <label class="pb-editor-label">Font</label>
                  <select class="pb-editor-select pb-promo-style-input" data-item-index="${index}" data-style-key="topTextFont">
                    <option value="default" ${style.topTextFont === 'default' ? 'selected' : ''}>Default</option>
                    <option value="display" ${style.topTextFont === 'display' ? 'selected' : ''}>Display (Bebas)</option>
                    <option value="mono" ${style.topTextFont === 'mono' ? 'selected' : ''}>Monospace</option>
                  </select>
                </div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label class="pb-editor-label">Color</label>
                  <input type="color" class="pb-promo-style-color" data-item-index="${index}" data-style-key="topTextColor" value="${style.topTextColor || '#ffed00'}">
                  <label><input type="checkbox" class="pb-promo-style-input" data-item-index="${index}" data-style-key="topTextGlow" ${style.topTextGlow ? 'checked' : ''}> Glow</label>
                  <input type="color" class="pb-promo-style-color" data-item-index="${index}" data-style-key="topTextGlowColor" value="${style.topTextGlowColor || '#ffed00'}">
                </div>
              </div>

              <div class="pb-style-group">
                <div class="pb-style-group-title">Bottom Text</div>
                <div class="pb-editor-field">
                  <label class="pb-editor-label">Font</label>
                  <select class="pb-editor-select pb-promo-style-input" data-item-index="${index}" data-style-key="bottomTextFont">
                    <option value="default" ${style.bottomTextFont === 'default' ? 'selected' : ''}>Default</option>
                    <option value="display" ${style.bottomTextFont === 'display' ? 'selected' : ''}>Display (Bebas)</option>
                    <option value="mono" ${style.bottomTextFont === 'mono' ? 'selected' : ''}>Monospace</option>
                  </select>
                </div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label class="pb-editor-label">Color</label>
                  <input type="color" class="pb-promo-style-color" data-item-index="${index}" data-style-key="bottomTextColor" value="${style.bottomTextColor || '#ffffff'}">
                  <label><input type="checkbox" class="pb-promo-style-input" data-item-index="${index}" data-style-key="bottomTextGlow" ${style.bottomTextGlow ? 'checked' : ''}> Glow</label>
                  <input type="color" class="pb-promo-style-color" data-item-index="${index}" data-style-key="bottomTextGlowColor" value="${style.bottomTextGlowColor || '#00d9ff'}">
                </div>
              </div>

              <div class="pb-style-group">
                <div class="pb-style-group-title">Background</div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label class="pb-editor-label">Color</label>
                  <input type="color" class="pb-promo-style-color" data-item-index="${index}" data-style-key="backgroundColor" value="${style.backgroundColor === 'transparent' ? '#000000' : style.backgroundColor || '#000000'}">
                  <label><input type="checkbox" class="pb-promo-style-input" data-item-index="${index}" data-style-key="backgroundGlow" ${style.backgroundGlow ? 'checked' : ''}> Glow</label>
                </div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label class="pb-editor-label">Opacity</label>
                  <input type="range" class="pb-promo-style-range" data-item-index="${index}" data-style-key="backgroundOpacity" min="0" max="1" step="0.05" value="${typeof style.backgroundOpacity === 'number' ? style.backgroundOpacity : 0.6}">
                  <label><input type="checkbox" class="pb-promo-style-input" data-item-index="${index}" data-style-key="backgroundBlur" ${style.backgroundBlur ? 'checked' : ''}> Blur background</label>
                </div>
              </div>
            </div>
          </details>
        </div>
      `;
    })
    .join('');

  return `
      ${renderInspectorSection({
        kicker: 'Content',
        title: 'Promo Items',
        summary: `${items.length} slide${items.length === 1 ? '' : 's'}`,
        copy: 'Manage slide order, image assets, CTA copy, and slide-specific appearance settings.',
        body: `
        <div class="pb-promo-items-section">
          <div class="pb-editor-toolbar">
            <label class="pb-editor-label">Slides</label>
            <button type="button" class="btn-secondary" id="pbPromoAddItem">+ Add Item</button>
          </div>
        </div>
        <div class="pb-promo-items-list" id="pbPromoItemsList">
          ${itemsHtml || '<div class="pb-promo-empty">No promo items. Click "Add Item" to create one.</div>'}
        </div>
        `,
      })}

      ${renderInspectorSection({
        kicker: 'Behavior',
        title: 'Carousel Behavior',
        summary: config.autoRotate !== false ? 'Auto-rotate on' : 'Manual',
        copy: 'Control autoplay, navigation, height, and motion for the entire promo module.',
        body: `
        <div class="pb-editor-field">
          <label class="pb-editor-label">
            <input type="checkbox" id="pbPromoAutoRotate" ${config.autoRotate !== false ? 'checked' : ''}> Auto-rotate slides
          </label>
        </div>

        <div class="pb-editor-field" id="pbPromoIntervalField" style="${config.autoRotate !== false ? '' : 'display:none'}">
          <label class="pb-editor-label">Rotation Interval (seconds)</label>
          <input type="number" class="pb-editor-input" id="pbPromoInterval" value="${(config.interval || 5000) / 1000}" min="1" max="30" step="0.5">
        </div>

        <div class="pb-editor-field">
          <label class="pb-editor-label">
            <input type="checkbox" id="pbPromoShowNav" ${config.showNavigation !== false ? 'checked' : ''}> Show navigation arrows
          </label>
        </div>

        <div class="pb-editor-field">
          <label class="pb-editor-label">
            <input type="checkbox" id="pbPromoShowIndicators" ${config.showIndicators !== false ? 'checked' : ''}> Show dot indicators
          </label>
        </div>

        <div class="pb-editor-field">
          <label class="pb-editor-label">Module Height (px)</label>
          <input type="number" class="pb-editor-input" id="pbPromoHeight" value="${config.height || 400}" min="200" max="1200">
        </div>

        <div class="pb-editor-field">
          <label class="pb-editor-label">Transition Style</label>
          <select class="pb-editor-select" id="pbPromoTransition">
            <option value="fade" ${config.transition === 'fade' ? 'selected' : ''}>Fade</option>
            <option value="slide" ${config.transition === 'slide' ? 'selected' : ''}>Slide</option>
          </select>
        </div>
        `,
      })}
    `;
}

function cloneConfig(config = {}) {
  return JSON.parse(JSON.stringify(config || {}));
}

function normalizePromoItem(item = {}) {
  return {
    id: item.id || generatePromoItemId(),
    image: item.image || '',
    linkUrl: item.linkUrl || '',
    imageFit: item.imageFit === 'contain' ? 'contain' : 'cover',
    topText: item.topText || '',
    bottomText: item.bottomText || '',
    textPosition: item.textPosition === 'outside' ? 'outside' : 'overlay',
    style: {
      ...getDefaultPromoItemStyle(),
      ...(item.style || {}),
    },
  };
}

function normalizePromoConfig(config = {}) {
  return {
    ...cloneConfig(config),
    items: (config.items || []).map(normalizePromoItem),
    autoRotate: config.autoRotate !== false,
    interval: config.interval || 5000,
    showNavigation: config.showNavigation !== false,
    showIndicators: config.showIndicators !== false,
    height: config.height || 400,
    transition: config.transition || 'fade',
  };
}

function bindPromoDraftEvents({
  el,
  draftConfig,
  setDraftConfig,
  renderEditorPanel,
  markDirty,
  openImagePicker,
  fetchAssets,
  uploadAssetFile,
}) {
  let config = normalizePromoConfig(draftConfig);
  const items = config.items;

  const commit = (nextConfig, rerenderEditor = false) => {
    config = normalizePromoConfig(nextConfig);
    setDraftConfig(config);
    markDirty('module');
    if (rerenderEditor) {
      renderEditorPanel();
    }
  };

  const updatePromoImageUi = (itemEl, item) => {
    const imageInput = itemEl.querySelector('[data-item-key="image"]');
    const meta = itemEl.querySelector('.pb-promo-image-meta');
    if (imageInput) imageInput.value = item.image || '';
    if (meta) meta.textContent = item.image ? 'Image selected' : 'No image selected';
  };

  document.getElementById('pbPromoAddItem')?.addEventListener('click', () => {
    const nextConfig = normalizePromoConfig(config);
    nextConfig.items.push(normalizePromoItem());
    commit(nextConfig, true);
  });

  el.pbModuleEditor.querySelectorAll('.pb-promo-item').forEach((itemEl) => {
    const index = parseInt(itemEl.dataset.itemIndex, 10);

    itemEl.querySelector('[data-action="remove"]')?.addEventListener('click', () => {
      const nextConfig = normalizePromoConfig(config);
      nextConfig.items.splice(index, 1);
      commit(nextConfig, true);
    });

    itemEl.querySelector('[data-action="move-up"]')?.addEventListener('click', () => {
      if (index <= 0) return;
      const nextConfig = normalizePromoConfig(config);
      [nextConfig.items[index - 1], nextConfig.items[index]] = [
        nextConfig.items[index],
        nextConfig.items[index - 1],
      ];
      commit(nextConfig, true);
    });

    itemEl.querySelector('[data-action="move-down"]')?.addEventListener('click', () => {
      if (index >= items.length - 1) return;
      const nextConfig = normalizePromoConfig(config);
      [nextConfig.items[index], nextConfig.items[index + 1]] = [
        nextConfig.items[index + 1],
        nextConfig.items[index],
      ];
      commit(nextConfig, true);
    });

    itemEl.querySelector('.pb-promo-pick')?.addEventListener('click', async () => {
      const current = config.items[index] || {};
      await openImagePicker({
        title: 'Select promo image',
        getItems: fetchAssets,
        allowUpload: true,
        uploadHandler: uploadAssetFile,
        showEditor: false,
        initialSelection: { path: current.image || '' },
        onApply: ({ item }) => {
          const nextConfig = normalizePromoConfig(config);
          if (!nextConfig.items[index]) return;
          nextConfig.items[index].image = item?.path || '';
          updatePromoImageUi(itemEl, nextConfig.items[index]);
          commit(nextConfig);
        },
      });
    });

    itemEl.querySelector('.pb-promo-clear')?.addEventListener('click', () => {
      const nextConfig = normalizePromoConfig(config);
      if (!nextConfig.items[index]) return;
      nextConfig.items[index].image = '';
      updatePromoImageUi(itemEl, nextConfig.items[index]);
      commit(nextConfig);
    });
  });

  el.pbModuleEditor.querySelectorAll('.pb-promo-input').forEach((input) => {
    const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      const index = parseInt(input.dataset.itemIndex, 10);
      const key = input.dataset.itemKey;
      const nextConfig = normalizePromoConfig(config);
      if (!nextConfig.items[index] || !key) return;
      nextConfig.items[index][key] = input.value;
      commit(nextConfig);
    });
  });

  el.pbModuleEditor
    .querySelectorAll('.pb-promo-style-input, .pb-promo-style-color, .pb-promo-style-range')
    .forEach((input) => {
      const eventName = input.type === 'range' || input.type === 'checkbox' ? 'input' : 'change';
      input.addEventListener(eventName, () => {
        const index = parseInt(input.dataset.itemIndex, 10);
        const key = input.dataset.styleKey;
        const nextConfig = normalizePromoConfig(config);
        if (!nextConfig.items[index] || !key) return;
        if (input.type === 'checkbox') {
          nextConfig.items[index].style[key] = input.checked;
        } else if (input.type === 'range') {
          nextConfig.items[index].style[key] = parseFloat(input.value);
        } else {
          nextConfig.items[index].style[key] = input.value;
        }
        commit(nextConfig);
      });
    });

  const autoRotateCheckbox = document.getElementById('pbPromoAutoRotate');
  const intervalField = document.getElementById('pbPromoIntervalField');
  autoRotateCheckbox?.addEventListener('change', () => {
    if (intervalField) {
      intervalField.style.display = autoRotateCheckbox.checked ? '' : 'none';
    }
    const nextConfig = normalizePromoConfig(config);
    nextConfig.autoRotate = autoRotateCheckbox.checked;
    commit(nextConfig);
  });

  const intervalInput = document.getElementById('pbPromoInterval');
  intervalInput?.addEventListener('input', () => {
    const nextConfig = normalizePromoConfig(config);
    const seconds = parseFloat(intervalInput.value) || 5;
    nextConfig.interval = seconds * 1000;
    commit(nextConfig);
  });

  const showNavCheckbox = document.getElementById('pbPromoShowNav');
  showNavCheckbox?.addEventListener('change', () => {
    const nextConfig = normalizePromoConfig(config);
    nextConfig.showNavigation = showNavCheckbox.checked;
    commit(nextConfig);
  });

  const showIndicatorsCheckbox = document.getElementById('pbPromoShowIndicators');
  showIndicatorsCheckbox?.addEventListener('change', () => {
    const nextConfig = normalizePromoConfig(config);
    nextConfig.showIndicators = showIndicatorsCheckbox.checked;
    commit(nextConfig);
  });

  const heightInput = document.getElementById('pbPromoHeight');
  heightInput?.addEventListener('input', () => {
    const nextConfig = normalizePromoConfig(config);
    nextConfig.height = parseInt(heightInput.value, 10) || 400;
    commit(nextConfig);
  });

  const transitionSelect = document.getElementById('pbPromoTransition');
  transitionSelect?.addEventListener('change', () => {
    const nextConfig = normalizePromoConfig(config);
    nextConfig.transition = transitionSelect.value || 'fade';
    commit(nextConfig);
  });
}

// Registry entry for the module editor (see module-editor-registry.js for the contract).
export const promoModuleEditor = {
  usesLayoutBridge: true,
  renderContent: ({ config }) => [renderPromoEditor(config)],
  bindEvents: bindPromoDraftEvents,
};

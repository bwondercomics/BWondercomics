import { escapeAttr, escapeHtml } from './helpers.js';
import {
  renderPromoEditor,
  generatePromoItemId,
  getDefaultPromoItemStyle,
} from './promo-editor.js';
import {
  renderSocialEditor,
  generateSocialButtonId,
  getDefaultSocialButtonStyle,
} from './social-editor.js';
import { bindButtonsEditorEvents, renderButtonsEditor } from './button-editor.js';
import { bindGalleryEditorEvents, renderGalleryEditor } from './gallery-editor.js';
import { bindVideoEditorEvents, renderVideoEditor } from './video-editor.js';
import { bindDividerEditorEvents, renderDividerEditor } from './divider-editor.js';
import { bindEntryGalleryEditorEvents, renderEntryGalleryEditor } from './entry-gallery-editor.js';
function cloneConfig(config = {}) {
  return JSON.parse(JSON.stringify(config || {}));
}

function findSelectedModule(currentPage, selectedModuleId) {
  if (!selectedModuleId) return null;
  for (const section of currentPage?.sections || []) {
    const found = (section.modules || []).find((module) => module.id === selectedModuleId);
    if (found) return found;
  }
  return null;
}

function formatModuleLabel(moduleType) {
  return String(moduleType || 'module')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getModuleSummary(moduleType, config) {
  switch (moduleType) {
    case 'header':
      return config.title || 'Header copy';
    case 'text':
      return (
        config.content
          ?.replace(/<[^>]*>/g, '')
          .trim()
          .slice(0, 90) || 'Rich text block'
      );
    case 'image':
      return config.src || config.alt || 'Image block';
    case 'gallery':
      return `${config.images?.length || 0} image(s)`;
    case 'video':
      return config.url || 'Video module';
    case 'divider':
      return `${config.style === 'dashed' || config.style === 'dotted' ? config.style.charAt(0).toUpperCase() + config.style.slice(1) : 'Solid'} line`;
    case 'entry-gallery':
      return `Series entries (${config.columns || 3} cols)`;
    case 'promo':
      return `${config.items?.length || 0} promo item${(config.items?.length || 0) === 1 ? '' : 's'}`;
    case 'social':
      return `${config.buttons?.length || 0} social button${(config.buttons?.length || 0) === 1 ? '' : 's'}`;
    case 'buttons':
      return `${config.buttons?.length || 0} button${(config.buttons?.length || 0) === 1 ? '' : 's'}`;
    case 'feed':
      return `Feed module · limit ${config.limit || 0}`;
    case 'email-signup':
      return config.heading || 'Email signup form';
    case 'spacer':
      return `${config.height || 40}px spacer`;
    case 'reader':
      return 'Reader embed and comments';
    default:
      return formatModuleLabel(moduleType);
  }
}

function renderSectionCard(kicker, title, copy, body) {
  return `
    <section class="pb-editor-section-card">
      <div class="pb-editor-section-head">
        <div>
          <span class="pb-editor-section-kicker">${kicker}</span>
          <h4 class="pb-editor-section-title">${title}</h4>
        </div>
        <p class="pb-editor-section-copy">${copy}</p>
      </div>
      ${body}
    </section>
  `;
}

function renderAccordionCard(title, copy, body) {
  return `
    <details class="pb-editor-accordion">
      <summary class="pb-editor-accordion-toggle">${title}</summary>
      <div class="pb-editor-accordion-content">
        <p class="pb-editor-accordion-copy">${copy}</p>
        ${body}
      </div>
    </details>
  `;
}

function renderRawConfigCard(config) {
  return renderAccordionCard(
    'Advanced',
    'Raw JSON stays available for cases that are not covered by the structured controls.',
    `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Raw Config (JSON)</label>
        <textarea class="pb-editor-textarea pb-editor-textarea--code" data-key="_raw">${escapeHtml(JSON.stringify(config, null, 2))}</textarea>
      </div>
    `
  );
}

function collectGenericModuleDraft(root, baseConfig = {}) {
  const nextConfig = cloneConfig(baseConfig);
  const keyedInputs = Array.from(root.querySelectorAll('[data-key]'));
  const rawInput = keyedInputs.find((input) => input.dataset.key === '_raw');
  if (rawInput) {
    try {
      Object.assign(nextConfig, JSON.parse(rawInput.value));
    } catch {
      // Keep the last valid structured draft if raw JSON is invalid.
    }
  }

  keyedInputs.forEach((input) => {
    const key = input.dataset.key;
    if (!key || key === '_raw') return;
    if (input.type === 'checkbox') {
      nextConfig[key] = input.checked;
    } else if (input.type === 'number') {
      nextConfig[key] = parseInt(input.value, 10) || 0;
    } else {
      nextConfig[key] = input.value;
    }
  });

  const styleFields = root.querySelectorAll('[data-style-key]');
  if (styleFields.length > 0) {
    nextConfig.style = nextConfig.style || {};
    styleFields.forEach((input) => {
      const key = input.dataset.styleKey;
      if (!key) return;
      if (input.type === 'checkbox') {
        nextConfig.style[key] = input.checked;
      } else if (input.type === 'number' || input.type === 'range') {
        nextConfig.style[key] = parseFloat(input.value);
      } else {
        nextConfig.style[key] = input.value;
      }
    });
  }

  return nextConfig;
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

function bindGenericModuleDraftEvents({
  el,
  selectedModule,
  draftConfig,
  setDraftConfig,
  markDirty,
}) {
  const syncDraft = () => {
    setDraftConfig(
      collectGenericModuleDraft(el.pbModuleEditor, draftConfig || selectedModule.config || {})
    );
    markDirty('module');
  };

  el.pbModuleEditor.querySelectorAll('[data-key], [data-style-key]').forEach((input) => {
    const eventName = input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, syncDraft);
  });
}

export function renderModuleEditorContent({
  currentPage,
  selectedModuleId,
  draftConfig = null,
  pages = [],
}) {
  if (!selectedModuleId) {
    return `
      <div class="pb-editor-empty">
        <div class="pb-editor-empty-card">
          <span class="pb-editor-empty-kicker">No Module Selected</span>
          <h4>Choose the page header or a module</h4>
          <p>Click the page header to edit title, buttons, and layout, or click a module to edit its content and styling. Theme still handles page-wide settings.</p>
        </div>
      </div>
    `;
  }

  const selectedModule = findSelectedModule(currentPage, selectedModuleId);

  if (!selectedModule) {
    return `
      <div class="pb-editor-empty">
        <div class="pb-editor-empty-card">
          <span class="pb-editor-empty-kicker">Selection Missing</span>
          <h4>Module not found</h4>
          <p>The selected module is no longer available. Pick another module on the canvas to continue editing.</p>
        </div>
      </div>
    `;
  }

  const config = draftConfig || selectedModule.config || {};
  const moduleType = selectedModule.moduleType;
  const contentSections = [];

  contentSections.push(`
    <section class="pb-editor-section-card pb-editor-section-card--summary">
      <div class="pb-editor-summary">
        <span class="pb-editor-summary-badge">${escapeHtml(formatModuleLabel(moduleType))}</span>
        <div class="pb-editor-summary-body">
          <h4 class="pb-editor-summary-title">${escapeHtml(getModuleSummary(moduleType, config))}</h4>
          <p class="pb-editor-summary-copy">Grouped controls keep content, behavior, appearance, and raw config close together without a long unstructured form.</p>
        </div>
      </div>
    </section>
  `);

  switch (moduleType) {
    case 'header':
      contentSections.push(
        renderSectionCard(
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
        )
      );
      break;

    case 'text':
      contentSections.push(
        renderSectionCard(
          'Content',
          'Rich Text',
          'HTML is supported for emphasis, links, and custom formatting.',
          `
          <div class="pb-editor-field">
            <label class="pb-editor-label">Content (HTML)</label>
            <textarea class="pb-editor-textarea" data-key="content">${escapeHtml(config.content || '')}</textarea>
          </div>
        `
        )
      );
      contentSections.push(
        renderSectionCard(
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
        )
      );
      break;

    case 'image':
      contentSections.push(
        renderSectionCard(
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
        )
      );
      break;

    case 'spacer':
      contentSections.push(
        renderSectionCard(
          'Behavior',
          'Spacing',
          'Increase or reduce the vertical separation introduced by this spacer module.',
          `
          <div class="pb-editor-field">
            <label class="pb-editor-label">Height (px)</label>
            <input type="number" class="pb-editor-input" data-key="height" value="${config.height || 40}">
          </div>
        `
        )
      );
      break;

    case 'html':
      contentSections.push(
        renderSectionCard(
          'Advanced',
          'Custom HTML',
          'Use for bespoke markup when the structured modules are not enough.',
          `
          <div class="pb-editor-field">
            <label class="pb-editor-label">Custom HTML</label>
            <textarea class="pb-editor-textarea pb-editor-textarea--code" data-key="code">${escapeHtml(config.code || '')}</textarea>
          </div>
        `
        )
      );
      break;

    case 'email-signup': {
      const emailStyle = config.style || {};
      contentSections.push(
        renderSectionCard(
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
        )
      );
      contentSections.push(
        renderSectionCard(
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
        )
      );
      break;
    }

    case 'reader':
      contentSections.push(
        renderSectionCard(
          'Behavior',
          'Reader Visibility',
          'Control whether the reader should show side panels and comments in this module.',
          `
          <div class="pb-editor-field">
            <label class="pb-editor-label">
              <input type="checkbox" data-key="showPanels" ${config.showPanels ? 'checked' : ''}> Show Side Panels
            </label>
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">
              <input type="checkbox" data-key="showComments" ${config.showComments ? 'checked' : ''}> Show Comments
            </label>
          </div>
        `
        )
      );
      break;

    case 'promo':
      contentSections.push(renderPromoEditor(config));
      break;

    case 'social':
      contentSections.push(renderSocialEditor(config));
      break;

    case 'buttons':
      contentSections.push(renderButtonsEditor(config, pages));
      break;

    case 'feed': {
      const feedStyle = config.style || {};
      contentSections.push(
        renderSectionCard(
          'Content',
          'Feed Copy',
          'Set the heading, author treatment, and destination links shown in the module.',
          `
          <div class="pb-editor-field">
            <label class="pb-editor-label">Heading</label>
            <input type="text" class="pb-editor-input" data-key="heading" value="${escapeAttr(config.heading || 'BWC FEED')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Author Label</label>
            <input type="text" class="pb-editor-input" data-key="author" value="${escapeAttr(config.author || '')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Feed Button Label</label>
            <input type="text" class="pb-editor-input" data-key="feedLabel" value="${escapeAttr(config.feedLabel || 'Open feed')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Feed Link</label>
            <input type="text" class="pb-editor-input" data-key="feedHref" value="${escapeAttr(config.feedHref || 'feed.html')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Media Button Label</label>
            <input type="text" class="pb-editor-input" data-key="mediaLabel" value="${escapeAttr(config.mediaLabel || 'Media')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Media Link</label>
            <input type="text" class="pb-editor-input" data-key="mediaHref" value="${escapeAttr(config.mediaHref || 'media.html')}">
          </div>
        `
        )
      );
      contentSections.push(
        renderSectionCard(
          'Behavior',
          'Display Rules',
          'Choose how much of the feed UI is enabled in this module instance.',
          `
          <div class="pb-editor-field">
            <label class="pb-editor-label">
              <input type="checkbox" data-key="showAuthor" ${config.showAuthor !== false ? 'checked' : ''}> Show Author
            </label>
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Feed Limit</label>
            <input type="number" class="pb-editor-input" data-key="limit" value="${config.limit || 5}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">
              <input type="checkbox" data-key="showDropdown" ${config.showDropdown !== false ? 'checked' : ''}> Enable Dropdown Feed
            </label>
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">
              <input type="checkbox" data-key="showMediaButton" ${config.showMediaButton !== false ? 'checked' : ''}> Show Media Button
            </label>
          </div>
        `
        )
      );
      contentSections.push(
        renderSectionCard(
          'Appearance',
          'Color Styling',
          'Tune headings, buttons, feed items, and the outer frame.',
          `
          <details class="pb-editor-accordion" open>
            <summary class="pb-editor-accordion-toggle">Color Options</summary>
            <div class="pb-editor-accordion-content">
              <div class="pb-style-group">
                <div class="pb-style-group-title">Heading & Author</div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label class="pb-editor-label">Heading Background</label>
                  <input type="color" class="pb-promo-style-color" data-style-key="headingBgColor" value="${feedStyle.headingBgColor || '#ffed00'}">
                </div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label class="pb-editor-label">Heading Text</label>
                  <input type="color" class="pb-promo-style-color" data-style-key="headingTextColor" value="${feedStyle.headingTextColor || '#0a0a12'}">
                </div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label class="pb-editor-label">Author Color</label>
                  <input type="color" class="pb-promo-style-color" data-style-key="authorColor" value="${feedStyle.authorColor || '#7ef5e3'}">
                </div>
              </div>
              <div class="pb-style-group">
                <div class="pb-style-group-title">Buttons</div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label class="pb-editor-label">Button Background</label>
                  <input type="color" class="pb-promo-style-color" data-style-key="buttonBgColor" value="${feedStyle.buttonBgColor || '#00d9ff'}">
                </div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label class="pb-editor-label">Button Text</label>
                  <input type="color" class="pb-promo-style-color" data-style-key="buttonTextColor" value="${feedStyle.buttonTextColor || '#0a0a12'}">
                </div>
              </div>
              <div class="pb-style-group">
                <div class="pb-style-group-title">Feed Items</div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label class="pb-editor-label">Item Title</label>
                  <input type="color" class="pb-promo-style-color" data-style-key="itemTitleColor" value="${feedStyle.itemTitleColor || '#ffed00'}">
                </div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label class="pb-editor-label">Item Date</label>
                  <input type="color" class="pb-promo-style-color" data-style-key="itemDateColor" value="${feedStyle.itemDateColor || '#00d9ff'}">
                </div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label class="pb-editor-label">Item Border</label>
                  <input type="color" class="pb-promo-style-color" data-style-key="itemBorderColor" value="${feedStyle.itemBorderColor || '#00d9ff'}">
                </div>
              </div>
              <div class="pb-style-group">
                <div class="pb-style-group-title">Container</div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label class="pb-editor-label">Border Color</label>
                  <input type="color" class="pb-promo-style-color" data-style-key="borderColor" value="${feedStyle.borderColor || '#ffed00'}">
                </div>
              </div>
            </div>
          </details>
        `
        )
      );
      break;
    }

    case 'gallery':
      contentSections.push(renderGalleryEditor(config));
      break;

    case 'video':
      contentSections.push(renderVideoEditor(config));
      break;

    case 'divider':
      contentSections.push(renderDividerEditor(config));
      break;

    case 'entry-gallery':
      contentSections.push(renderEntryGalleryEditor(config));
      break;

    default:
      contentSections.push(
        renderSectionCard(
          'Advanced',
          'Module Config',
          'This module does not have structured controls yet, so edit the config directly.',
          `
          <div class="pb-editor-field">
            <label class="pb-editor-label">Raw Config (JSON)</label>
            <textarea class="pb-editor-textarea pb-editor-textarea--code" data-key="_raw">${escapeHtml(JSON.stringify(config, null, 2))}</textarea>
          </div>
        `
        )
      );
      return contentSections.join('');
  }

  // Only modules that still use the generic draft binder can safely keep the
  // generic raw JSON escape hatch. Dedicated editor flows must not render a
  // raw card unless they intentionally parse and persist `_raw`.
  const MODULES_RETAINING_RAW_CARD = new Set([
    'header',
    'text',
    'image',
    'spacer',
    'email-signup',
    'reader',
    'feed',
  ]);
  if (MODULES_RETAINING_RAW_CARD.has(moduleType)) {
    contentSections.push(renderRawConfigCard(config));
  }

  return contentSections.join('');
}

export function bindModuleEditorEvents({
  el,
  currentPage,
  selectedModuleId,
  draftConfig,
  setDraftConfig,
  markDirty,
  renderEditorPanel,
  pages = [],
  openImagePicker,
  fetchAssets,
  uploadAssetFile,
}) {
  const selectedModule = findSelectedModule(currentPage, selectedModuleId);
  if (!selectedModule) return;

  if (selectedModule.moduleType === 'promo') {
    bindPromoDraftEvents({
      el,
      draftConfig,
      setDraftConfig,
      renderEditorPanel,
      markDirty,
      openImagePicker,
      fetchAssets,
      uploadAssetFile,
    });
    return;
  }

  if (selectedModule.moduleType === 'social') {
    bindSocialDraftEvents({
      el,
      draftConfig,
      setDraftConfig,
      renderEditorPanel,
      markDirty,
      openImagePicker,
      fetchAssets,
      uploadAssetFile,
    });
    return;
  }

  if (selectedModule.moduleType === 'buttons') {
    bindButtonsEditorEvents({
      el,
      draftConfig,
      setDraftConfig,
      renderEditorPanel,
      markDirty,
      pages,
    });
    return;
  }

  if (selectedModule.moduleType === 'gallery') {
    bindGalleryEditorEvents({
      el,
      draftConfig,
      setDraftConfig,
      renderEditorPanel,
      markDirty,
      openImagePicker,
      fetchAssets,
      uploadAssetFile,
    });
    return;
  }

  if (selectedModule.moduleType === 'video') {
    bindVideoEditorEvents({
      el,
      draftConfig,
      setDraftConfig,
      markDirty,
    });
    return;
  }

  if (selectedModule.moduleType === 'divider') {
    bindDividerEditorEvents({
      el,
      draftConfig,
      setDraftConfig,
      markDirty,
    });
    return;
  }

  if (selectedModule.moduleType === 'entry-gallery') {
    bindEntryGalleryEditorEvents({
      el,
      draftConfig,
      setDraftConfig,
      markDirty,
    });
    return;
  }

  bindGenericModuleDraftEvents({
    el,
    selectedModule,
    draftConfig,
    setDraftConfig,
    markDirty,
  });
}

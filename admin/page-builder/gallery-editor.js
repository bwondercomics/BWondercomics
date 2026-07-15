import { escapeAttr, escapeHtml } from '../../shared/page-builder/helpers.js';
import { renderInspectorSection } from './inspector-sections.js';
import { setResponsiveOverrideValue } from '../../shared/page-builder/responsive-overrides.js';

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

export function normalizeGalleryImage(image) {
  if (typeof image === 'string') {
    return { src: image, alt: '' };
  }
  return {
    src: image?.src || '',
    alt: image?.alt || '',
  };
}

export function normalizeGalleryConfig(config = {}) {
  const images = Array.isArray(config.images) ? config.images.map(normalizeGalleryImage) : [];
  return {
    ...cloneValue(config),
    images,
    columns: typeof config.columns === 'number' ? config.columns : 3,
  };
}

export function renderGalleryEditor(config = {}, options = {}) {
  const normalized = normalizeGalleryConfig(config);
  const deviceOnly = options.deviceOnly === true;
  const imagesHtml = normalized.images
    .map(
      (image, index) => `
      <div class="pb-social-item pb-gallery-item" data-item-index="${index}">
        <div class="pb-promo-item-header">
           <div class="pb-gallery-image-preview">
            <img src="${escapeAttr('../' + image.src)}" alt="Thumbnail" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2RkZCIvPjwvc3ZnPg==';">
          </div>
          <div style="flex: 1;">
            <strong>Image ${index + 1}</strong>
            <div class="pb-editor-help" style="word-break: break-all;">${escapeHtml(image.src || 'No image selected')}</div>
          </div>
          <div class="pb-promo-item-actions">
            <button type="button" class="pb-promo-action" data-action="move-up" ${index === 0 ? 'disabled' : ''} title="Move up">\u2191</button>
            <button type="button" class="pb-promo-action" data-action="move-down" ${index === normalized.images.length - 1 ? 'disabled' : ''} title="Move down">\u2193</button>
            <button type="button" class="pb-promo-action danger" data-action="remove" title="Remove">\u00D7</button>
          </div>
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Image Source</label>
          <div style="display: flex; gap: 8px;">
            <input type="text" class="pb-editor-input pb-gallery-input" data-item-index="${index}" data-item-key="src" value="${escapeAttr(image.src || '')}" style="flex: 1;">
            <button type="button" class="btn-secondary" data-action="pick-image" data-item-index="${index}">Browse</button>
          </div>
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Alt Text</label>
          <input type="text" class="pb-editor-input pb-gallery-input" data-item-index="${index}" data-item-key="alt" value="${escapeAttr(image.alt || '')}">
        </div>
      </div>
    `
    )
    .join('');

  const layoutSection = renderInspectorSection({
    kicker: 'Layout',
    title: 'Gallery Layout',
    summary: `${normalized.columns} columns`,
    copy: 'Configure the grid columns for the gallery.',
    body: `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Columns</label>
        <input type="number" class="pb-editor-input pb-gallery-main-input" data-key="columns" min="1" max="6" value="${normalized.columns}">
      </div>
      `,
  });

  if (deviceOnly) return layoutSection;

  return `
    ${layoutSection}
    ${renderInspectorSection({
      kicker: 'Content',
      title: 'Images',
      summary: `${normalized.images.length} image${normalized.images.length === 1 ? '' : 's'}`,
      copy: 'Manage the images displayed in the gallery grid.',
      body: `
      <div class="pb-promo-editor-list">
        ${imagesHtml || '<div class="pb-promo-empty">No images. Click "+ Add Image" to create one.</div>'}
      </div>
      <div class="pb-editor-actions">
        <button type="button" class="btn-secondary" id="pbGalleryAddImage">+ Add Image</button>
      </div>
      `,
    })}
  `;
}

export function bindGalleryEditorEvents({
  el,
  draftConfig,
  setDraftConfig,
  renderEditorPanel,
  markDirty,
  openImagePicker,
  fetchAssets,
  uploadAssetFile,
  activeDeviceId = 'desktop',
  responsiveEditScope = 'global',
}) {
  let config = normalizeGalleryConfig(draftConfig);

  const commit = (nextConfig, rerender = false) => {
    config = normalizeGalleryConfig(nextConfig);
    setDraftConfig(config);
    markDirty('module');
    if (rerender) {
      renderEditorPanel();
    }
  };

  el.pbModuleEditor.querySelectorAll('.pb-gallery-main-input').forEach((input) => {
    input.addEventListener('input', () => {
      const nextConfig = normalizeGalleryConfig(config);
      const key = input.dataset.key;
      if (key === 'columns') {
        const value = parseInt(input.value, 10) || 3;
        if (responsiveEditScope === 'device') {
          setResponsiveOverrideValue(nextConfig, activeDeviceId, key, value);
        } else {
          nextConfig[key] = value;
        }
      }
      commit(nextConfig);
    });
  });

  if (responsiveEditScope === 'device') return;

  document.getElementById('pbGalleryAddImage')?.addEventListener('click', () => {
    const nextConfig = normalizeGalleryConfig(config);
    nextConfig.images.push(normalizeGalleryImage({ src: '', alt: '' }));
    commit(nextConfig, true);
  });

  el.pbModuleEditor.querySelectorAll('.pb-gallery-item').forEach((itemEl) => {
    const index = parseInt(itemEl.dataset.itemIndex, 10);

    itemEl.querySelector('[data-action="remove"]')?.addEventListener('click', () => {
      const nextConfig = normalizeGalleryConfig(config);
      nextConfig.images.splice(index, 1);
      commit(nextConfig, true);
    });

    itemEl.querySelector('[data-action="move-up"]')?.addEventListener('click', () => {
      if (index <= 0) return;
      const nextConfig = normalizeGalleryConfig(config);
      [nextConfig.images[index - 1], nextConfig.images[index]] = [
        nextConfig.images[index],
        nextConfig.images[index - 1],
      ];
      commit(nextConfig, true);
    });

    itemEl.querySelector('[data-action="move-down"]')?.addEventListener('click', () => {
      if (index >= config.images.length - 1) return;
      const nextConfig = normalizeGalleryConfig(config);
      [nextConfig.images[index], nextConfig.images[index + 1]] = [
        nextConfig.images[index + 1],
        nextConfig.images[index],
      ];
      commit(nextConfig, true);
    });

    itemEl.querySelector('[data-action="pick-image"]')?.addEventListener('click', async () => {
      const current = config.images[index] || {};
      await openImagePicker({
        title: 'Select gallery image',
        getItems: fetchAssets,
        allowUpload: true,
        uploadHandler: uploadAssetFile,
        showEditor: false,
        initialSelection: { path: current.src || '' },
        onApply: ({ item }) => {
          const nextConfig = normalizeGalleryConfig(config);
          if (!nextConfig.images[index]) return;
          nextConfig.images[index].src = item?.path || '';
          commit(nextConfig, true);
        },
      });
    });
  });

  el.pbModuleEditor.querySelectorAll('.pb-gallery-input').forEach((input) => {
    input.addEventListener('input', () => {
      const index = parseInt(input.dataset.itemIndex, 10);
      const key = input.dataset.itemKey;
      const nextConfig = normalizeGalleryConfig(config);
      const image = nextConfig.images[index];
      if (!image || !key) return;

      image[key] = input.value;
      commit(nextConfig);
    });
  });
}

export function cloneGalleryConfig(config = {}) {
  return cloneValue(normalizeGalleryConfig(config));
}

// Registry entry for the module editor (see module-editor-registry.js for the contract).
export const galleryModuleEditor = {
  usesLayoutBridge: true,
  renderContent: ({ config }) => [renderGalleryEditor(config)],
  renderDeviceOverrides: ({ config, responsiveFields }) =>
    responsiveFields.includes('columns') ? [renderGalleryEditor(config, { deviceOnly: true })] : [],
  bindEvents: bindGalleryEditorEvents,
  bindDeviceEvents: bindGalleryEditorEvents,
};

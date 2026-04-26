function normalizeEntryGalleryConfig(config = {}) {
  return {
    columns: config.columns || 3,
    showLabels: config.showLabels !== false,
  };
}

export function renderEntryGalleryEditor(config = {}) {
  const normalized = normalizeEntryGalleryConfig(config);

  return `
    <section class="pb-editor-section-card">
      <div class="pb-editor-section-head">
        <div>
          <span class="pb-editor-section-kicker">Appearance</span>
          <h4 class="pb-editor-section-title">Entry Gallery Settings</h4>
        </div>
        <p class="pb-editor-section-copy">Configure how the entries in this series are displayed.</p>
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Columns</label>
        <input type="number" class="pb-editor-input pb-entry-gallery-input" data-key="columns" min="1" max="6" value="${normalized.columns}">
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">
          <input type="checkbox" class="pb-entry-gallery-input" data-key="showLabels" ${normalized.showLabels ? 'checked' : ''}> Show Labels
        </label>
      </div>
    </section>
  `;
}

export function bindEntryGalleryEditorEvents({
  el,
  draftConfig,
  setDraftConfig,
  markDirty,
}) {
  let config = normalizeEntryGalleryConfig(draftConfig);

  const commit = (nextConfig) => {
    config = normalizeEntryGalleryConfig(nextConfig);
    setDraftConfig(config);
    markDirty('module');
  };

  el.pbModuleEditor.querySelectorAll('.pb-entry-gallery-input').forEach((input) => {
    const eventName = input.type === 'checkbox' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      const nextConfig = normalizeEntryGalleryConfig(config);
      const key = input.dataset.key;
      if (key === 'columns') {
         nextConfig[key] = parseInt(input.value, 10) || 3;
      } else if (key === 'showLabels') {
         nextConfig[key] = input.checked;
      }
      commit(nextConfig);
    });
  });
}

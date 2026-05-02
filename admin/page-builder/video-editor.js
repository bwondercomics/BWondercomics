import { escapeAttr } from './helpers.js';

function normalizeVideoConfig(config = {}) {
  return {
    url: config.url || '',
  };
}

export function renderVideoEditor(config = {}) {
  const normalized = normalizeVideoConfig(config);

  return `
    <section class="pb-editor-section-card">
      <div class="pb-editor-section-head">
        <div>
          <span class="pb-editor-section-kicker">Content</span>
          <h4 class="pb-editor-section-title">Video Link</h4>
        </div>
        <p class="pb-editor-section-copy">Must be a valid HTTPS YouTube or Vimeo link.</p>
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Video URL</label>
        <input type="text" class="pb-editor-input pb-video-input" data-key="url" value="${escapeAttr(normalized.url || '')}">
      </div>
    </section>
  `;
}

export function bindVideoEditorEvents({ el, draftConfig, setDraftConfig, markDirty }) {
  let config = normalizeVideoConfig(draftConfig);

  const commit = (nextConfig) => {
    config = normalizeVideoConfig(nextConfig);
    setDraftConfig(config);
    markDirty('module');
  };

  el.pbModuleEditor.querySelectorAll('.pb-video-input').forEach((input) => {
    input.addEventListener('input', () => {
      const nextConfig = normalizeVideoConfig(config);
      nextConfig.url = input.value;
      commit(nextConfig);
    });
  });
}

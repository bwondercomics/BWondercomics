import { escapeAttr } from './helpers.js';
import { renderInspectorSection } from './inspector-sections.js';

function normalizeVideoConfig(config = {}) {
  return {
    url: config.url || '',
  };
}

export function renderVideoEditor(config = {}) {
  const normalized = normalizeVideoConfig(config);

  return renderInspectorSection({
    kicker: 'Content',
    title: 'Video Link',
    summary: normalized.url || 'No URL',
    copy: 'Must be a valid HTTPS YouTube or Vimeo link.',
    body: `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Video URL</label>
        <input type="text" class="pb-editor-input pb-video-input" data-key="url" value="${escapeAttr(normalized.url || '')}">
      </div>
    `,
  });
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

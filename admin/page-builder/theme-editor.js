import { THEME_COLORS, THEME_PRESETS } from './constants.js';
import { renderInspectorSection } from './inspector-sections.js';

// Panel background/spacing moved onto the column (section.settings.columns[i]) and are edited in
// the unified Column/Panel inspector; the theme draft no longer models page.meta panel keys, so
// theme save/reset preserve the legacy meta as a read-time fallback until the migration clears it.
function cloneThemeDraft(draft = {}) {
  return JSON.parse(
    JSON.stringify({
      theme: draft.theme || {},
    })
  );
}

function getThemeSource(currentPage, draftMeta = null) {
  if (draftMeta) return cloneThemeDraft(draftMeta);
  return cloneThemeDraft({
    theme: currentPage?.meta?.theme || {},
  });
}

function updateThemeInputsFromDraft(root, draft) {
  if (!root) return;

  THEME_COLORS.forEach((color) => {
    const value = draft.theme?.[color.key] || color.default;
    const picker = root.querySelector(`.pb-theme-color-picker[data-key="${color.key}"]`);
    const textInput = root.querySelector(`.pb-theme-color-text[data-key="${color.key}"]`);
    if (picker) picker.value = value;
    if (textInput) textInput.value = value;
  });
}

export function renderThemeEditorContent(currentPage, draftMeta = null) {
  const source = getThemeSource(currentPage, draftMeta);
  const theme = source.theme || {};

  const renderSectionCard = (kicker, title, copy, body, summary = title) =>
    renderInspectorSection({
      kicker,
      title,
      summary,
      copy,
      body,
    });

  const colorsHtml = THEME_COLORS.map((color) => {
    const value = theme[color.key] || color.default;
    return `
      <div class="pb-theme-color-row">
        <label class="pb-theme-color-label">${color.label}</label>
        <div class="pb-theme-color-inputs">
          <input type="color" class="pb-theme-color-picker" data-key="${color.key}" value="${value}">
          <input type="text" class="pb-theme-color-text" data-key="${color.key}" value="${value}" maxlength="7">
        </div>
      </div>
    `;
  }).join('');

  const presetsHtml = Object.entries(THEME_PRESETS)
    .map(
      ([key, preset]) =>
        `<button class="pb-theme-preset-btn" type="button" data-preset="${key}">${preset.name}</button>`
    )
    .join('');

  return `
    <div class="pb-editor-stack">
      ${renderSectionCard(
        'Fast Start',
        'Presets',
        'Pick a direction, then tune the tokens below.',
        `<div class="pb-theme-preset-grid">${presetsHtml}</div>`
      )}
      ${renderSectionCard(
        'Palette',
        'Color System',
        'Primary reader tokens for chrome, accents, and panel surfaces. Palette colors are defaults — anything styled directly on an element (panel, block, header part, reader control) keeps its own colors.',
        `<div class="pb-theme-colors">${colorsHtml}</div>`
      )}
    </div>
  `;
}

export function bindThemeEditorEvents({ el, draftMeta, setDraftMeta, markDirty }) {
  if (!el?.pbModuleEditor) return;

  let draft = getThemeSource(null, draftMeta);

  const commitDraft = (nextDraft, { syncDom = false } = {}) => {
    draft = cloneThemeDraft(nextDraft);
    setDraftMeta(draft);
    markDirty('theme');
    if (syncDom) {
      updateThemeInputsFromDraft(el.pbModuleEditor, draft);
    }
  };

  el.pbModuleEditor.querySelectorAll('.pb-theme-color-picker').forEach((picker) => {
    picker.addEventListener('input', () => {
      const key = picker.dataset.key;
      const nextDraft = cloneThemeDraft(draft);
      nextDraft.theme[key] = picker.value;
      commitDraft(nextDraft);
      const textInput = el.pbModuleEditor.querySelector(`.pb-theme-color-text[data-key="${key}"]`);
      if (textInput) textInput.value = picker.value;
    });
  });

  el.pbModuleEditor.querySelectorAll('.pb-theme-color-text').forEach((textInput) => {
    textInput.addEventListener('input', () => {
      const key = textInput.dataset.key;
      const value = textInput.value.trim();
      const nextDraft = cloneThemeDraft(draft);
      nextDraft.theme[key] = value;
      commitDraft(nextDraft);
      if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
        const picker = el.pbModuleEditor.querySelector(`.pb-theme-color-picker[data-key="${key}"]`);
        if (picker) picker.value = value;
      }
    });
  });

  el.pbModuleEditor.querySelectorAll('.pb-theme-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = THEME_PRESETS[btn.dataset.preset];
      if (!preset) return;
      const nextDraft = cloneThemeDraft(draft);
      nextDraft.theme = { ...nextDraft.theme, ...preset.theme };
      commitDraft(nextDraft, { syncDom: true });
    });
  });
}

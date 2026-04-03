import { THEME_COLORS, THEME_PRESETS } from "./constants.js";
import { escapeAttr, formatFocus, normalizeFit, parseFocus } from "./helpers.js";

function cloneThemeDraft(draft = {}) {
  return JSON.parse(JSON.stringify({
    theme: draft.theme || {},
    panelBackgrounds: draft.panelBackgrounds || {},
    panelSpacing: draft.panelSpacing || {},
  }));
}

function getThemeSource(currentPage, draftMeta = null) {
  if (draftMeta) return cloneThemeDraft(draftMeta);
  return cloneThemeDraft({
    theme: currentPage?.meta?.theme || {},
    panelBackgrounds: currentPage?.meta?.panelBackgrounds || {},
    panelSpacing: currentPage?.meta?.panelSpacing || {},
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

  ["left", "right"].forEach((side) => {
    const bg = draft.panelBackgrounds?.[side] || {};
    const spacing = draft.panelSpacing?.[side];
    const pathInput = root.querySelector(`.pb-panel-bg-path[data-panel="${side}"]`);
    const metaEl = root.querySelector(`.pb-panel-bg-meta[data-panel="${side}"]`);
    const opacityInput = root.querySelector(`.pb-panel-bg-opacity[data-panel="${side}"]`);
    const emptyToggle = root.querySelector(`.pb-panel-empty-toggle[data-panel="${side}"]`);
    const gapInput = root.querySelector(`.pb-panel-gap[data-panel="${side}"]`);
    const opacityValue = typeof bg.opacity === "number" ? bg.opacity : 0.18;

    if (pathInput) pathInput.value = bg.path || "";
    if (metaEl) {
      metaEl.textContent = `Fit: ${normalizeFit(bg.fit || "cover")} · Focus: ${bg.focus || "center"} · Opacity: ${opacityValue}`;
    }
    if (opacityInput) opacityInput.value = String(opacityValue);
    if (emptyToggle) emptyToggle.checked = !!bg.hideEmptyText;
    if (gapInput) gapInput.value = spacing ?? "";
  });
}

export function renderThemeEditorContent(currentPage, draftMeta = null) {
  const source = getThemeSource(currentPage, draftMeta);
  const theme = source.theme || {};
  const panelBackgrounds = source.panelBackgrounds || {};
  const panelSpacing = source.panelSpacing || {};
  const leftBg = panelBackgrounds.left || {};
  const rightBg = panelBackgrounds.right || {};
  const leftOpacity = typeof leftBg.opacity === "number" ? leftBg.opacity : 0.18;
  const rightOpacity = typeof rightBg.opacity === "number" ? rightBg.opacity : 0.18;
  const leftHideEmpty = !!leftBg.hideEmptyText;
  const rightHideEmpty = !!rightBg.hideEmptyText;
  const leftGap = panelSpacing.left ?? "";
  const rightGap = panelSpacing.right ?? "";

  const renderSectionCard = (kicker, title, copy, body) => `
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

  const renderPanelSurfaceCard = (panel, title, bg, opacity) => `
    <div class="pb-editor-subcard">
      <div class="pb-editor-subcard-head">
        <span class="pb-editor-subcard-title">${title}</span>
        <span class="pb-editor-subcard-meta">${bg.path ? "Image selected" : "No image"}</span>
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Background Asset</label>
        <div class="pb-editor-inline-actions">
          <input
            type="text"
            class="pb-editor-input pb-panel-bg-path"
            data-panel="${panel}"
            value="${escapeAttr(bg.path || "")}"
            placeholder="assets/uploads/..."
            readonly
          >
          <button type="button" class="btn-secondary pb-panel-bg-pick" data-panel="${panel}">Choose</button>
          <button type="button" class="btn-secondary pb-panel-bg-clear" data-panel="${panel}">Clear</button>
        </div>
      </div>
      <div class="pb-editor-field pb-editor-field--row">
        <label class="pb-editor-label">Opacity</label>
        <input type="range" class="pb-promo-style-range pb-panel-bg-opacity" data-panel="${panel}" min="0" max="1" step="0.05" value="${opacity}">
      </div>
      <small class="pb-editor-hint pb-panel-bg-meta" data-panel="${panel}">Fit: ${normalizeFit(bg.fit || "cover")} · Focus: ${bg.focus || "center"} · Opacity: ${opacity}</small>
    </div>
  `;

  const renderPanelSpacingCard = (panel, title, gap, hideEmpty) => `
    <div class="pb-editor-subcard">
      <div class="pb-editor-subcard-head">
        <span class="pb-editor-subcard-title">${title}</span>
        <span class="pb-editor-subcard-meta">Spacing and empty-panel copy</span>
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Module Spacing (px)</label>
        <input type="number" class="pb-editor-input pb-panel-gap" data-panel="${panel}" min="0" step="1" placeholder="12" value="${gap}">
      </div>
      <div class="pb-editor-field pb-editor-field--row">
        <label class="pb-editor-label">Hide Empty Text</label>
        <input type="checkbox" class="pb-panel-empty-toggle" data-panel="${panel}" ${hideEmpty ? "checked" : ""}>
      </div>
    </div>
  `;

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
  }).join("");

  const presetsHtml = Object.entries(THEME_PRESETS)
    .map(([key, preset]) => `<button class="pb-theme-preset-btn" type="button" data-preset="${key}">${preset.name}</button>`)
    .join("");

  return `
    <div class="pb-editor-stack">
      ${renderSectionCard(
        "Fast Start",
        "Presets",
        "Pick a direction, then tune the tokens and side panels below.",
        `<div class="pb-theme-preset-grid">${presetsHtml}</div>`,
      )}
      ${renderSectionCard(
        "Palette",
        "Color System",
        "Primary reader tokens for chrome, accents, and panel surfaces.",
        `<div class="pb-theme-colors">${colorsHtml}</div>`,
      )}
      ${renderSectionCard(
        "Surfaces",
        "Panel Backgrounds",
        "Left and right reader panels can carry separate background art.",
        `
          <div class="pb-editor-subgrid">
            ${renderPanelSurfaceCard("left", "Left Panel", leftBg, leftOpacity)}
            ${renderPanelSurfaceCard("right", "Right Panel", rightBg, rightOpacity)}
          </div>
        `,
      )}
      ${renderSectionCard(
        "Spacing",
        "Panel Spacing & Empty States",
        "Fine-tune the side-panel rhythm and their empty-state behavior.",
        `
          <div class="pb-editor-subgrid">
            ${renderPanelSpacingCard("left", "Left Panel", leftGap, leftHideEmpty)}
            ${renderPanelSpacingCard("right", "Right Panel", rightGap, rightHideEmpty)}
          </div>
        `,
      )}
    </div>
  `;
}

export function bindThemeEditorEvents({
  el,
  draftMeta,
  setDraftMeta,
  markDirty,
  openImagePicker,
  fetchAssets,
  uploadAssetFile,
  resolveAssetUrl,
}) {
  if (!el?.pbModuleEditor) return;

  let draft = getThemeSource(null, draftMeta);

  const commitDraft = (nextDraft, { syncDom = false } = {}) => {
    draft = cloneThemeDraft(nextDraft);
    setDraftMeta(draft);
    markDirty("theme");
    if (syncDom) {
      updateThemeInputsFromDraft(el.pbModuleEditor, draft);
    }
  };

  el.pbModuleEditor.querySelectorAll(".pb-theme-color-picker").forEach((picker) => {
    picker.addEventListener("input", () => {
      const key = picker.dataset.key;
      const nextDraft = cloneThemeDraft(draft);
      nextDraft.theme[key] = picker.value;
      commitDraft(nextDraft);
      const textInput = el.pbModuleEditor.querySelector(`.pb-theme-color-text[data-key="${key}"]`);
      if (textInput) textInput.value = picker.value;
    });
  });

  el.pbModuleEditor.querySelectorAll(".pb-theme-color-text").forEach((textInput) => {
    textInput.addEventListener("input", () => {
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

  el.pbModuleEditor.querySelectorAll(".pb-theme-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = THEME_PRESETS[btn.dataset.preset];
      if (!preset) return;
      const nextDraft = cloneThemeDraft(draft);
      nextDraft.theme = { ...nextDraft.theme, ...preset.theme };
      commitDraft(nextDraft, { syncDom: true });
    });
  });

  const updatePanelBgUi = (side) => {
    updateThemeInputsFromDraft(el.pbModuleEditor, draft);
    const metaEl = el.pbModuleEditor.querySelector(`.pb-panel-bg-meta[data-panel="${side}"]`);
    if (metaEl) {
      const data = draft.panelBackgrounds?.[side] || {};
      const opacityValue = typeof data.opacity === "number" ? data.opacity : 0.18;
      metaEl.textContent = `Fit: ${normalizeFit(data.fit || "cover")} · Focus: ${data.focus || "center"} · Opacity: ${opacityValue}`;
    }
  };

  el.pbModuleEditor.querySelectorAll(".pb-panel-bg-pick").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const side = btn.dataset.panel;
      if (!side) return;
      const current = draft.panelBackgrounds?.[side] || {};
      const focus = parseFocus(current.focus || "center");
      await openImagePicker({
        title: `Select ${side} panel background`,
        getItems: fetchAssets,
        allowUpload: true,
        uploadHandler: uploadAssetFile,
        resolveSrc: resolveAssetUrl,
        initialSelection: {
          path: current.path || "",
          fit: normalizeFit(current.fit || "cover"),
          x: focus.x,
          y: focus.y,
        },
        onApply: ({ item, fit: nextFit, x, y }) => {
          const nextDraft = cloneThemeDraft(draft);
          nextDraft.panelBackgrounds = nextDraft.panelBackgrounds || {};
          const panel = nextDraft.panelBackgrounds[side] || {};
          nextDraft.panelBackgrounds[side] = {
            ...panel,
            path: item?.path || "",
            fit: normalizeFit(nextFit),
            focus: formatFocus({ x, y }),
            opacity: typeof panel.opacity === "number" ? panel.opacity : 0.18,
            hideEmptyText: !!panel.hideEmptyText,
          };
          commitDraft(nextDraft, { syncDom: true });
          updatePanelBgUi(side);
        },
      });
    });
  });

  el.pbModuleEditor.querySelectorAll(".pb-panel-bg-clear").forEach((btn) => {
    btn.addEventListener("click", () => {
      const side = btn.dataset.panel;
      if (!side) return;
      const nextDraft = cloneThemeDraft(draft);
      if (nextDraft.panelBackgrounds) {
        delete nextDraft.panelBackgrounds[side];
      }
      commitDraft(nextDraft, { syncDom: true });
      updatePanelBgUi(side);
    });
  });

  el.pbModuleEditor.querySelectorAll(".pb-panel-bg-opacity").forEach((input) => {
    input.addEventListener("input", () => {
      const side = input.dataset.panel;
      if (!side) return;
      const nextDraft = cloneThemeDraft(draft);
      const panel = nextDraft.panelBackgrounds?.[side] || {};
      nextDraft.panelBackgrounds[side] = {
        ...panel,
        opacity: Number.isFinite(parseFloat(input.value)) ? parseFloat(input.value) : 0.18,
      };
      commitDraft(nextDraft);
      updatePanelBgUi(side);
    });
  });

  el.pbModuleEditor.querySelectorAll(".pb-panel-empty-toggle").forEach((input) => {
    input.addEventListener("change", () => {
      const side = input.dataset.panel;
      if (!side) return;
      const nextDraft = cloneThemeDraft(draft);
      const panel = nextDraft.panelBackgrounds?.[side] || {};
      nextDraft.panelBackgrounds[side] = {
        ...panel,
        hideEmptyText: input.checked,
      };
      commitDraft(nextDraft);
    });
  });

  el.pbModuleEditor.querySelectorAll(".pb-panel-gap").forEach((input) => {
    input.addEventListener("input", () => {
      const side = input.dataset.panel;
      if (!side) return;
      const nextDraft = cloneThemeDraft(draft);
      nextDraft.panelSpacing = nextDraft.panelSpacing || {};
      const raw = String(input.value || "").trim();
      if (!raw) {
        delete nextDraft.panelSpacing[side];
      } else {
        const parsed = Number(raw);
        if (Number.isNaN(parsed)) return;
        nextDraft.panelSpacing[side] = Math.max(0, Math.round(parsed));
      }
      commitDraft(nextDraft);
    });
  });
}

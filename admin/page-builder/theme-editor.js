import { THEME_COLORS, THEME_PRESETS } from "./constants.js";
import { escapeAttr, formatFocus, normalizeFit, parseFocus } from "./helpers.js";

export function renderThemeEditorContent(currentPage) {
  const theme = currentPage?.meta?.theme || {};
  const panelBackgrounds = currentPage?.meta?.panelBackgrounds || {};
  const leftBg = panelBackgrounds.left || {};
  const rightBg = panelBackgrounds.right || {};

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
    .map(([key, preset]) => `<button class="pb-theme-preset-btn" data-preset="${key}">${preset.name}</button>`)
    .join("");

  return `
      <h3>Page Theme</h3>
      <div class="pb-theme-presets">
        <label class="pb-editor-label">Quick Presets</label>
        <div class="pb-theme-preset-grid">${presetsHtml}</div>
      </div>
      <div class="pb-theme-colors">
        <label class="pb-editor-label">Custom Colors</label>
        ${colorsHtml}
      </div>
      <div class="pb-editor-section-divider"></div>
      <div class="pb-theme-panels">
        <label class="pb-editor-label">Panel Backgrounds</label>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Left Panel</label>
          <div style="display:flex; gap:8px; flex-wrap: wrap;">
            <input type="text" class="pb-editor-input pb-panel-bg-path" data-panel="left" value="${escapeAttr(leftBg.path || "")}" placeholder="assets/uploads/..." readonly>
            <button type="button" class="btn-secondary pb-panel-bg-pick" data-panel="left">Choose</button>
            <button type="button" class="btn-secondary pb-panel-bg-clear" data-panel="left">Clear</button>
          </div>
          <small class="pb-editor-hint pb-panel-bg-meta" data-panel="left">Fit: ${normalizeFit(leftBg.fit || "cover")} · Focus: ${leftBg.focus || "center"}</small>
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Right Panel</label>
          <div style="display:flex; gap:8px; flex-wrap: wrap;">
            <input type="text" class="pb-editor-input pb-panel-bg-path" data-panel="right" value="${escapeAttr(rightBg.path || "")}" placeholder="assets/uploads/..." readonly>
            <button type="button" class="btn-secondary pb-panel-bg-pick" data-panel="right">Choose</button>
            <button type="button" class="btn-secondary pb-panel-bg-clear" data-panel="right">Clear</button>
          </div>
          <small class="pb-editor-hint pb-panel-bg-meta" data-panel="right">Fit: ${normalizeFit(rightBg.fit || "cover")} · Focus: ${rightBg.focus || "center"}</small>
        </div>
      </div>
      <div class="pb-editor-actions">
        <button class="btn-primary" id="pbSaveTheme">Save Theme</button>
        <button class="btn-secondary" id="pbResetTheme">Reset to Default</button>
      </div>
    `;
}

export function bindThemeEditorEvents({
  el,
  getCurrentPage,
  updatePage,
  openImagePicker,
  fetchAssets,
  uploadAssetFile,
  resolveAssetUrl,
}) {
  if (!el?.pbModuleEditor) return;

  // Sync color picker with text input
  el.pbModuleEditor.querySelectorAll(".pb-theme-color-picker").forEach((picker) => {
    picker.addEventListener("input", (e) => {
      const key = picker.dataset.key;
      const textInput = el.pbModuleEditor.querySelector(`.pb-theme-color-text[data-key="${key}"]`);
      if (textInput) textInput.value = e.target.value;
    });
  });

  const ensurePanelBackgrounds = () => {
    const page = getCurrentPage();
    if (!page) return null;
    page.meta = page.meta || {};
    if (!page.meta.panelBackgrounds) page.meta.panelBackgrounds = {};
    return page.meta.panelBackgrounds;
  };

  const updatePanelBgUi = (side) => {
    const page = getCurrentPage();
    const data = page?.meta?.panelBackgrounds?.[side] || {};
    const pathInput = el.pbModuleEditor.querySelector(`.pb-panel-bg-path[data-panel="${side}"]`);
    const metaEl = el.pbModuleEditor.querySelector(`.pb-panel-bg-meta[data-panel="${side}"]`);
    if (pathInput) pathInput.value = data.path || "";
    if (metaEl) {
      metaEl.textContent = `Fit: ${normalizeFit(data.fit || "cover")} · Focus: ${data.focus || "center"}`;
    }
  };

  el.pbModuleEditor.querySelectorAll(".pb-panel-bg-pick").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const page = getCurrentPage();
      if (!page) return;
      const side = btn.dataset.panel;
      const current = page?.meta?.panelBackgrounds?.[side] || {};
      const focus = parseFocus(current.focus || "center");
      const fit = normalizeFit(current.fit || "cover");
      await openImagePicker({
        title: `Select ${side} panel background`,
        getItems: fetchAssets,
        allowUpload: true,
        uploadHandler: uploadAssetFile,
        resolveSrc: resolveAssetUrl,
        initialSelection: {
          path: current.path || "",
          fit,
          x: focus.x,
          y: focus.y,
        },
        onApply: ({ item, fit: nextFit, x, y }) => {
          const backgrounds = ensurePanelBackgrounds();
          if (!backgrounds) return;
          backgrounds[side] = {
            path: item?.path || "",
            fit: normalizeFit(nextFit),
            focus: formatFocus({ x, y }),
          };
          updatePanelBgUi(side);
        },
      });
    });
  });

  el.pbModuleEditor.querySelectorAll(".pb-panel-bg-clear").forEach((btn) => {
    btn.addEventListener("click", () => {
      const side = btn.dataset.panel;
      const backgrounds = ensurePanelBackgrounds();
      if (!backgrounds) return;
      delete backgrounds[side];
      updatePanelBgUi(side);
    });
  });

  el.pbModuleEditor.querySelectorAll(".pb-theme-color-text").forEach((textInput) => {
    textInput.addEventListener("input", (e) => {
      const key = textInput.dataset.key;
      const value = e.target.value;
      if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
        const picker = el.pbModuleEditor.querySelector(`.pb-theme-color-picker[data-key="${key}"]`);
        if (picker) picker.value = value;
      }
    });
  });

  // Preset buttons
  el.pbModuleEditor.querySelectorAll(".pb-theme-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const presetKey = btn.dataset.preset;
      const preset = THEME_PRESETS[presetKey];
      if (!preset) return;

      // Apply preset to color inputs
      Object.entries(preset.theme).forEach(([key, value]) => {
        const picker = el.pbModuleEditor.querySelector(`.pb-theme-color-picker[data-key="${key}"]`);
        const textInput = el.pbModuleEditor.querySelector(`.pb-theme-color-text[data-key="${key}"]`);
        if (picker) picker.value = value;
        if (textInput) textInput.value = value;
      });
    });
  });

  // Save theme
  document.getElementById("pbSaveTheme")?.addEventListener("click", async () => {
    const page = getCurrentPage();
    if (!page) return;

    const theme = {};
    el.pbModuleEditor.querySelectorAll(".pb-theme-color-text").forEach((input) => {
      theme[input.dataset.key] = input.value;
    });

    const meta = { ...(page.meta || {}), theme };
    const updated = await updatePage(page.id, { meta });
    if (updated) {
      page.meta = updated.meta;
      alert("Theme saved!");
    } else {
      alert("Failed to save theme.");
    }
  });

  // Reset theme
  document.getElementById("pbResetTheme")?.addEventListener("click", () => {
    THEME_COLORS.forEach((color) => {
      const picker = el.pbModuleEditor.querySelector(`.pb-theme-color-picker[data-key="${color.key}"]`);
      const textInput = el.pbModuleEditor.querySelector(`.pb-theme-color-text[data-key="${color.key}"]`);
      if (picker) picker.value = color.default;
      if (textInput) textInput.value = color.default;
    });
  });
}

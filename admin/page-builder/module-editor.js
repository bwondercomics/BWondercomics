import { escapeAttr, escapeHtml } from "./helpers.js";
import { renderPromoEditor, bindPromoEditorEvents, collectPromoConfig } from "./promo-editor.js";

export function renderModuleEditorContent({ currentPage, selectedModuleId }) {
  if (!selectedModuleId) {
    return `
      <div class="pb-editor-empty">
        <p>Click on a module to edit its settings.</p>
      </div>
    `;
  }

  // Find the selected module
  let selectedModule = null;
  for (const section of currentPage?.sections || []) {
    const found = (section.modules || []).find((m) => m.id === selectedModuleId);
    if (found) {
      selectedModule = found;
      break;
    }
  }

  if (!selectedModule) {
    return `
      <div class="pb-editor-empty">
        <p>Module not found.</p>
      </div>
    `;
  }

  const config = selectedModule.config || {};
  const moduleType = selectedModule.moduleType;

  let fieldsHtml = "";

  switch (moduleType) {
    case "header":
      fieldsHtml = `
        <div class="pb-editor-field">
          <label class="pb-editor-label">Title</label>
          <input type="text" class="pb-editor-input" data-key="title" value="${escapeAttr(config.title || "")}">
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Subtitle</label>
          <input type="text" class="pb-editor-input" data-key="subtitle" value="${escapeAttr(config.subtitle || "")}">
        </div>
      `;
      break;

    case "text":
      fieldsHtml = `
        <div class="pb-editor-field">
          <label class="pb-editor-label">Content (HTML)</label>
          <textarea class="pb-editor-textarea" data-key="content">${escapeHtml(config.content || "")}</textarea>
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Alignment</label>
          <select class="pb-editor-select" data-key="alignment">
            <option value="left" ${config.alignment === "left" ? "selected" : ""}>Left</option>
            <option value="center" ${config.alignment === "center" ? "selected" : ""}>Center</option>
            <option value="right" ${config.alignment === "right" ? "selected" : ""}>Right</option>
          </select>
        </div>
      `;
      break;

    case "image":
      fieldsHtml = `
        <div class="pb-editor-field">
          <label class="pb-editor-label">Image URL</label>
          <input type="text" class="pb-editor-input" data-key="src" value="${escapeAttr(config.src || "")}">
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Alt Text</label>
          <input type="text" class="pb-editor-input" data-key="alt" value="${escapeAttr(config.alt || "")}">
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Caption</label>
          <input type="text" class="pb-editor-input" data-key="caption" value="${escapeAttr(config.caption || "")}">
        </div>
      `;
      break;

    case "spacer":
      fieldsHtml = `
        <div class="pb-editor-field">
          <label class="pb-editor-label">Height (px)</label>
          <input type="number" class="pb-editor-input" data-key="height" value="${config.height || 40}">
        </div>
      `;
      break;

    case "html":
      fieldsHtml = `
        <div class="pb-editor-field">
          <label class="pb-editor-label">Custom HTML</label>
          <textarea class="pb-editor-textarea" data-key="code" style="min-height: 200px; font-family: monospace;">${escapeHtml(config.code || "")}</textarea>
        </div>
      `;
      break;

    case "email-signup":
      const emailStyle = config.style || {};
      fieldsHtml = `
        <div class="pb-editor-field">
          <label class="pb-editor-label">Heading</label>
          <input type="text" class="pb-editor-input" data-key="heading" value="${escapeAttr(config.heading || "")}">
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Subtext (optional)</label>
          <input type="text" class="pb-editor-input" data-key="subtext" value="${escapeAttr(config.subtext || "")}">
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Placeholder</label>
          <input type="text" class="pb-editor-input" data-key="placeholder" value="${escapeAttr(config.placeholder || "")}">
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Button Text</label>
          <input type="text" class="pb-editor-input" data-key="buttonText" value="${escapeAttr(config.buttonText || "")}">
        </div>

        <div class="pb-editor-section-divider"></div>

        <div class="pb-editor-section-header">
          <label class="pb-editor-label">Style Options</label>
        </div>

        <div class="pb-editor-field">
          <label class="pb-editor-label">Heading Font</label>
          <select class="pb-editor-select" data-style-key="headingFont">
            <option value="default" ${emailStyle.headingFont === "default" ? "selected" : ""}>Default</option>
            <option value="display" ${emailStyle.headingFont === "display" ? "selected" : ""}>Display (Bebas)</option>
            <option value="mono" ${emailStyle.headingFont === "mono" ? "selected" : ""}>Monospace</option>
          </select>
        </div>
        <div class="pb-editor-field pb-editor-field--row">
          <label class="pb-editor-label">Heading Color</label>
          <input type="color" class="pb-promo-style-color" data-style-key="headingColor" value="${emailStyle.headingColor || "#ffffff"}">
          <label><input type="checkbox" data-style-key="headingGlow" ${emailStyle.headingGlow ? "checked" : ""}> Glow</label>
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Input Style</label>
          <select class="pb-editor-select" data-style-key="inputStyle">
            <option value="bubble" ${emailStyle.inputStyle === "bubble" ? "selected" : ""}>Bubble (glow border)</option>
            <option value="flat" ${emailStyle.inputStyle === "flat" ? "selected" : ""}>Flat</option>
          </select>
        </div>
        <div class="pb-editor-field pb-editor-field--row">
          <label class="pb-editor-label">Button Color</label>
          <input type="color" class="pb-promo-style-color" data-style-key="buttonColor" value="${emailStyle.buttonColor || "#00d9ff"}">
          <label><input type="checkbox" data-style-key="buttonGlow" ${emailStyle.buttonGlow ? "checked" : ""}> Glow</label>
        </div>
      `;
      break;

    case "reader":
      fieldsHtml = `
        <div class="pb-editor-field">
          <label class="pb-editor-label">
            <input type="checkbox" data-key="showPanels" ${config.showPanels ? "checked" : ""}> Show Side Panels
          </label>
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">
            <input type="checkbox" data-key="showComments" ${config.showComments ? "checked" : ""}> Show Comments
          </label>
        </div>
      `;
      break;

    case "promo":
      fieldsHtml = renderPromoEditor(config);
      break;

    case "feed":
      fieldsHtml = `
        <div class="pb-editor-field">
          <label class="pb-editor-label">Heading</label>
          <input type="text" class="pb-editor-input" data-key="heading" value="${escapeAttr(config.heading || "BWC FEED")}">
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Author Label</label>
          <input type="text" class="pb-editor-input" data-key="author" value="${escapeAttr(config.author || "")}">
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">
            <input type="checkbox" data-key="showAuthor" ${config.showAuthor !== false ? "checked" : ""}> Show Author
          </label>
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Feed Limit</label>
          <input type="number" class="pb-editor-input" data-key="limit" value="${config.limit || 5}">
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">
            <input type="checkbox" data-key="showDropdown" ${config.showDropdown !== false ? "checked" : ""}> Enable dropdown feed
          </label>
        </div>
        <div class="pb-editor-section-divider"></div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Feed Button Label</label>
          <input type="text" class="pb-editor-input" data-key="feedLabel" value="${escapeAttr(config.feedLabel || "Open feed")}">
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Feed Link</label>
          <input type="text" class="pb-editor-input" data-key="feedHref" value="${escapeAttr(config.feedHref || "feed.html")}">
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">
            <input type="checkbox" data-key="showMediaButton" ${config.showMediaButton !== false ? "checked" : ""}> Show Media Button
          </label>
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Media Button Label</label>
          <input type="text" class="pb-editor-input" data-key="mediaLabel" value="${escapeAttr(config.mediaLabel || "Media")}">
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Media Link</label>
          <input type="text" class="pb-editor-input" data-key="mediaHref" value="${escapeAttr(config.mediaHref || "media.html")}">
        </div>
      `;
      break;

    default:
      fieldsHtml = `
        <div class="pb-editor-field">
          <label class="pb-editor-label">Raw Config (JSON)</label>
          <textarea class="pb-editor-textarea" data-key="_raw" style="font-family: monospace;">${escapeHtml(JSON.stringify(config, null, 2))}</textarea>
        </div>
      `;
  }

  return `
    <h3>${moduleType.toUpperCase()} Settings</h3>
    ${fieldsHtml}
    <div class="pb-editor-actions">
      <button class="btn-primary" id="pbSaveModule">Save</button>
      <button class="btn-secondary" id="pbDeleteModule">Delete</button>
    </div>
  `;
}

export function bindModuleEditorEvents({
  el,
  currentPage,
  selectedModuleId,
  setSelectedModuleId,
  updateModule,
  deleteModule,
  renderCanvas,
  renderEditorPanel,
  openImagePicker,
  fetchAssets,
  uploadAssetFile,
}) {
  // Find the selected module for the save handler
  let selectedModule = null;
  for (const section of currentPage?.sections || []) {
    const found = (section.modules || []).find((m) => m.id === selectedModuleId);
    if (found) {
      selectedModule = found;
      break;
    }
  }
  if (!selectedModule) return;

  const config = selectedModule.config || {};

  // Bind promo-specific events if promo module
  if (selectedModule.moduleType === "promo") {
    bindPromoEditorEvents({
      el,
      currentPage,
      selectedModuleId,
      updateModule,
      renderCanvas,
      renderEditorPanel,
      openImagePicker,
      fetchAssets,
      uploadAssetFile,
    });
  }

  // Bind save button
  document.getElementById("pbSaveModule")?.addEventListener("click", async () => {
    let newConfig;

    // Special handling for promo modules
    if (selectedModule.moduleType === "promo") {
      newConfig = collectPromoConfig(el);
    } else {
      newConfig = { ...config };

      el.pbModuleEditor.querySelectorAll("[data-key]").forEach((input) => {
        const key = input.dataset.key;
        if (key === "_raw") {
          try {
            Object.assign(newConfig, JSON.parse(input.value));
          } catch {
            // Ignore parse errors
          }
        } else if (input.type === "checkbox") {
          newConfig[key] = input.checked;
        } else if (input.type === "number") {
          newConfig[key] = parseInt(input.value, 10) || 0;
        } else {
          newConfig[key] = input.value;
        }
      });

      // Handle style fields for modules that have them (email-signup, etc.)
      const styleFields = el.pbModuleEditor.querySelectorAll("[data-style-key]");
      if (styleFields.length > 0) {
        newConfig.style = newConfig.style || {};
        styleFields.forEach((input) => {
          const key = input.dataset.styleKey;
          if (input.type === "checkbox") {
            newConfig.style[key] = input.checked;
          } else {
            newConfig.style[key] = input.value;
          }
        });
      }
    }

    const updated = await updateModule(selectedModuleId, { config: newConfig });
    if (updated) {
      selectedModule.config = updated.config;
      renderCanvas();
    }
  });

  // Bind delete button
  document.getElementById("pbDeleteModule")?.addEventListener("click", async () => {
    if (await deleteModule(selectedModuleId)) {
      for (const section of currentPage.sections) {
        section.modules = section.modules.filter((m) => m.id !== selectedModuleId);
      }
      if (setSelectedModuleId) setSelectedModuleId(null);
      renderCanvas();
      renderEditorPanel();
    }
  });
}

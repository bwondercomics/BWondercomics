import { escapeAttr, escapeHtml, resolveAssetUrl } from "./helpers.js";

export function generatePromoItemId() {
  return "promo-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
}

export function getDefaultPromoItemStyle() {
  return {
    imageBorder: true,
    imageBorderColor: "#00d9ff",
    imageGlow: true,
    imageGlowColor: "#00d9ff",
    imageGlowIntensity: 0.5,
    topTextFont: "default",
    topTextColor: "#ffed00",
    topTextGlow: true,
    topTextGlowColor: "#ffed00",
    bottomTextFont: "default",
    bottomTextColor: "#ffffff",
    bottomTextGlow: false,
    bottomTextGlowColor: "#00d9ff",
    backgroundColor: "transparent",
    backgroundOpacity: 0.6,
    backgroundBlur: false,
    backgroundGlow: false,
  };
}

export function renderPromoEditor(config) {
  const items = config.items || [];

  const itemsHtml = items.map((item, index) => {
    const style = item.style || getDefaultPromoItemStyle();
    return `
        <div class="pb-promo-item" data-item-index="${index}">
          <div class="pb-promo-item-header">
            <span class="pb-promo-item-num">#${index + 1}</span>
            <div class="pb-promo-item-actions">
              <button type="button" class="pb-promo-action" data-action="move-up" ${index === 0 ? "disabled" : ""} title="Move up">\u2191</button>
              <button type="button" class="pb-promo-action" data-action="move-down" ${index === items.length - 1 ? "disabled" : ""} title="Move down">\u2193</button>
              <button type="button" class="pb-promo-action pb-promo-action--delete" data-action="remove" title="Remove">\u00D7</button>
            </div>
          </div>

          <div class="pb-editor-field">
            <label class="pb-editor-label">Image</label>
            <div style="display:flex; gap:8px; flex-wrap: wrap;">
              <input type="text" class="pb-editor-input pb-promo-input" data-item-index="${index}" data-item-key="image" value="${escapeAttr(item.image || "")}" readonly>
              <button type="button" class="btn-secondary pb-promo-pick" data-item-index="${index}">Choose</button>
              <button type="button" class="btn-secondary pb-promo-clear" data-item-index="${index}">Clear</button>
            </div>
            <small class="pb-editor-hint pb-promo-image-meta" data-item-index="${index}">${item.image ? "Image selected" : "No image selected"}</small>
            <div class="pb-editor-field">
              <label class="pb-editor-label">Image Fit</label>
              <select class="pb-editor-select pb-promo-input" data-item-index="${index}" data-item-key="imageFit">
                <option value="cover" ${item.imageFit !== "contain" ? "selected" : ""}>Fill (cover)</option>
                <option value="contain" ${item.imageFit === "contain" ? "selected" : ""}>Fit (contain)</option>
              </select>
            </div>
            <div class="pb-editor-field">
              <label class="pb-editor-label">Link URL</label>
              <input type="text" class="pb-editor-input pb-promo-input" data-item-index="${index}" data-item-key="linkUrl" value="${escapeAttr(item.linkUrl || "")}">
            </div>
          </div>

          <div class="pb-editor-field">
            <label class="pb-editor-label">Top Text</label>
            <input type="text" class="pb-editor-input pb-promo-input" data-item-index="${index}" data-item-key="topText" value="${escapeAttr(item.topText || "")}">
          </div>

          <div class="pb-editor-field">
            <label class="pb-editor-label">Bottom Text / CTA (HTML allowed)</label>
            <textarea class="pb-editor-textarea pb-promo-input" data-item-index="${index}" data-item-key="bottomText" rows="2">${escapeHtml(item.bottomText || "")}</textarea>
          </div>

          <div class="pb-editor-field">
            <label class="pb-editor-label">Text Position</label>
            <select class="pb-editor-select pb-promo-input" data-item-index="${index}" data-item-key="textPosition">
              <option value="overlay" ${item.textPosition === "overlay" ? "selected" : ""}>Overlay (on image)</option>
              <option value="outside" ${item.textPosition === "outside" ? "selected" : ""}>Outside (above/below)</option>
            </select>
          </div>

          <details class="pb-promo-style-accordion">
            <summary class="pb-promo-style-toggle">Style Options</summary>
            <div class="pb-promo-style-content">
              <div class="pb-style-group">
                <div class="pb-style-group-title">Image</div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label><input type="checkbox" class="pb-promo-style-input" data-item-index="${index}" data-style-key="imageBorder" ${style.imageBorder ? "checked" : ""}> Border</label>
                  <input type="color" class="pb-promo-style-color" data-item-index="${index}" data-style-key="imageBorderColor" value="${style.imageBorderColor || "#00d9ff"}">
                </div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label><input type="checkbox" class="pb-promo-style-input" data-item-index="${index}" data-style-key="imageGlow" ${style.imageGlow ? "checked" : ""}> Glow</label>
                  <input type="color" class="pb-promo-style-color" data-item-index="${index}" data-style-key="imageGlowColor" value="${style.imageGlowColor || "#00d9ff"}">
                  <input type="range" class="pb-promo-style-range" data-item-index="${index}" data-style-key="imageGlowIntensity" min="0" max="1" step="0.1" value="${style.imageGlowIntensity || 0.5}">
                </div>
              </div>

              <div class="pb-style-group">
                <div class="pb-style-group-title">Top Text</div>
                <div class="pb-editor-field">
                  <label class="pb-editor-label">Font</label>
                  <select class="pb-editor-select pb-promo-style-input" data-item-index="${index}" data-style-key="topTextFont">
                    <option value="default" ${style.topTextFont === "default" ? "selected" : ""}>Default</option>
                    <option value="display" ${style.topTextFont === "display" ? "selected" : ""}>Display (Bebas)</option>
                    <option value="mono" ${style.topTextFont === "mono" ? "selected" : ""}>Monospace</option>
                  </select>
                </div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label class="pb-editor-label">Color</label>
                  <input type="color" class="pb-promo-style-color" data-item-index="${index}" data-style-key="topTextColor" value="${style.topTextColor || "#ffed00"}">
                  <label><input type="checkbox" class="pb-promo-style-input" data-item-index="${index}" data-style-key="topTextGlow" ${style.topTextGlow ? "checked" : ""}> Glow</label>
                  <input type="color" class="pb-promo-style-color" data-item-index="${index}" data-style-key="topTextGlowColor" value="${style.topTextGlowColor || "#ffed00"}">
                </div>
              </div>

              <div class="pb-style-group">
                <div class="pb-style-group-title">Bottom Text</div>
                <div class="pb-editor-field">
                  <label class="pb-editor-label">Font</label>
                  <select class="pb-editor-select pb-promo-style-input" data-item-index="${index}" data-style-key="bottomTextFont">
                    <option value="default" ${style.bottomTextFont === "default" ? "selected" : ""}>Default</option>
                    <option value="display" ${style.bottomTextFont === "display" ? "selected" : ""}>Display (Bebas)</option>
                    <option value="mono" ${style.bottomTextFont === "mono" ? "selected" : ""}>Monospace</option>
                  </select>
                </div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label class="pb-editor-label">Color</label>
                  <input type="color" class="pb-promo-style-color" data-item-index="${index}" data-style-key="bottomTextColor" value="${style.bottomTextColor || "#ffffff"}">
                  <label><input type="checkbox" class="pb-promo-style-input" data-item-index="${index}" data-style-key="bottomTextGlow" ${style.bottomTextGlow ? "checked" : ""}> Glow</label>
                  <input type="color" class="pb-promo-style-color" data-item-index="${index}" data-style-key="bottomTextGlowColor" value="${style.bottomTextGlowColor || "#00d9ff"}">
                </div>
              </div>

              <div class="pb-style-group">
                <div class="pb-style-group-title">Background</div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label class="pb-editor-label">Color</label>
                  <input type="color" class="pb-promo-style-color" data-item-index="${index}" data-style-key="backgroundColor" value="${style.backgroundColor === "transparent" ? "#000000" : (style.backgroundColor || "#000000")}">
                  <label><input type="checkbox" class="pb-promo-style-input" data-item-index="${index}" data-style-key="backgroundGlow" ${style.backgroundGlow ? "checked" : ""}> Glow</label>
                </div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label class="pb-editor-label">Opacity</label>
                  <input type="range" class="pb-promo-style-range" data-item-index="${index}" data-style-key="backgroundOpacity" min="0" max="1" step="0.05" value="${typeof style.backgroundOpacity === "number" ? style.backgroundOpacity : 0.6}">
                  <label><input type="checkbox" class="pb-promo-style-input" data-item-index="${index}" data-style-key="backgroundBlur" ${style.backgroundBlur ? "checked" : ""}> Blur background</label>
                </div>
              </div>
            </div>
          </details>
        </div>
      `;
  }).join("");

  return `
      <div class="pb-promo-items-section">
        <div class="pb-editor-field">
          <label class="pb-editor-label">Promo Items</label>
          <button type="button" class="btn-secondary" id="pbPromoAddItem">+ Add Item</button>
        </div>
        <div class="pb-promo-items-list" id="pbPromoItemsList">
          ${itemsHtml || '<div class="pb-promo-empty">No promo items. Click "Add Item" to create one.</div>'}
        </div>
      </div>

      <div class="pb-editor-section-divider"></div>

      <div class="pb-editor-field">
        <label class="pb-editor-label">
          <input type="checkbox" id="pbPromoAutoRotate" ${config.autoRotate !== false ? "checked" : ""}> Auto-rotate slides
        </label>
      </div>

      <div class="pb-editor-field" id="pbPromoIntervalField" style="${config.autoRotate !== false ? "" : "display:none"}">
        <label class="pb-editor-label">Rotation Interval (seconds)</label>
        <input type="number" class="pb-editor-input" id="pbPromoInterval" value="${(config.interval || 5000) / 1000}" min="1" max="30" step="0.5">
      </div>

      <div class="pb-editor-field">
        <label class="pb-editor-label">
          <input type="checkbox" id="pbPromoShowNav" ${config.showNavigation !== false ? "checked" : ""}> Show navigation arrows
        </label>
      </div>

      <div class="pb-editor-field">
        <label class="pb-editor-label">
          <input type="checkbox" id="pbPromoShowIndicators" ${config.showIndicators !== false ? "checked" : ""}> Show dot indicators
        </label>
      </div>

      <div class="pb-editor-field">
        <label class="pb-editor-label">Module Height (px)</label>
        <input type="number" class="pb-editor-input" id="pbPromoHeight" value="${config.height || 400}" min="200" max="1200">
      </div>

      <div class="pb-editor-field">
        <label class="pb-editor-label">Transition Style</label>
        <select class="pb-editor-select" id="pbPromoTransition">
          <option value="fade" ${config.transition === "fade" ? "selected" : ""}>Fade</option>
          <option value="slide" ${config.transition === "slide" ? "selected" : ""}>Slide</option>
        </select>
      </div>
    `;
}

export function bindPromoEditorEvents({
  el,
  currentPage,
  selectedModuleId,
  updateModule,
  renderCanvas,
  renderEditorPanel,
  openImagePicker,
  fetchAssets,
  uploadAssetFile,
}) {
  if (!currentPage || !selectedModuleId) return;

  // Find the selected module
  let selectedModule = null;
  for (const section of currentPage?.sections || []) {
    const found = (section.modules || []).find((m) => m.id === selectedModuleId);
    if (found) {
      selectedModule = found;
      break;
    }
  }
  if (!selectedModule || selectedModule.moduleType !== "promo") return;

  const config = { ...selectedModule.config } || {};

  const sanitizeItem = (item = {}) => ({
    id: item.id || generatePromoItemId(),
    image: item.image || "",
    imageFit: item.imageFit === "contain" ? "contain" : "cover",
    topText: item.topText || "",
    bottomText: item.bottomText || "",
    textPosition: item.textPosition || "overlay",
    style: item.style || getDefaultPromoItemStyle(),
  });

  const items = [...(config.items || [])].map(sanitizeItem);

  // Helper to save and re-render
  // rerenderEditor: true for structural changes (add/remove/move), false for field edits
  async function savePromoConfig(newConfig, rerenderEditor = false) {
    // Merge with existing config to preserve all settings
    const merged = {
      ...config,
      ...newConfig,
      items: (newConfig.items || items).map(sanitizeItem)
    };
    const updated = await updateModule(selectedModuleId, { config: merged });
    if (updated) {
      selectedModule.config = updated.config;
      // Update local references so subsequent saves include all data
      Object.assign(config, updated.config);
      items.length = 0;
      items.push(...(updated.config.items || []).map(sanitizeItem));
      renderCanvas();
      if (rerenderEditor) {
        renderEditorPanel();
      }
    }
  }

  // Add item button
  document.getElementById("pbPromoAddItem")?.addEventListener("click", () => {
    items.push({
      id: generatePromoItemId(),
      image: "",
      imageFit: "cover",
      topText: "",
      bottomText: "",
      textPosition: "overlay",
      style: getDefaultPromoItemStyle(),
    });
    savePromoConfig({ ...config, items }, true);
  });

  const updatePromoImageUi = (itemEl, item) => {
    const imageInput = itemEl.querySelector('[data-item-key="image"]');
    const meta = itemEl.querySelector(".pb-promo-image-meta");
    if (imageInput) imageInput.value = item.image || "";
    if (meta) meta.textContent = item.image ? "Image selected" : "No image selected";
  };

  // Remove/move buttons on items
  el.pbModuleEditor.querySelectorAll(".pb-promo-item").forEach((itemEl) => {
    const index = parseInt(itemEl.dataset.itemIndex, 10);

    itemEl.querySelector('[data-action="remove"]')?.addEventListener("click", () => {
      items.splice(index, 1);
      savePromoConfig({ ...config, items }, true);
    });

    itemEl.querySelector('[data-action="move-up"]')?.addEventListener("click", () => {
      if (index > 0) {
        [items[index - 1], items[index]] = [items[index], items[index - 1]];
        savePromoConfig({ ...config, items }, true);
      }
    });

    itemEl.querySelector('[data-action="move-down"]')?.addEventListener("click", () => {
      if (index < items.length - 1) {
        [items[index], items[index + 1]] = [items[index + 1], items[index]];
        savePromoConfig({ ...config, items }, true);
      }
    });

    itemEl.querySelector(".pb-promo-pick")?.addEventListener("click", async () => {
      const current = items[index] || {};
      await openImagePicker({
        title: "Select promo image",
        getItems: fetchAssets,
        allowUpload: true,
        uploadHandler: uploadAssetFile,
        resolveSrc: resolveAssetUrl,
        showEditor: false,
        initialSelection: {
          path: current.image || ""
        },
        onApply: ({ item }) => {
          if (!items[index]) return;
          items[index].image = item?.path || "";
          updatePromoImageUi(itemEl, items[index]);
          savePromoConfig({ ...config, items });
        },
      });
    });

    itemEl.querySelector(".pb-promo-clear")?.addEventListener("click", () => {
      if (!items[index]) return;
      items[index].image = "";
      updatePromoImageUi(itemEl, items[index]);
      savePromoConfig({ ...config, items });
    });
  });

  // Item field changes (image, topText, bottomText, textPosition)
  el.pbModuleEditor.querySelectorAll(".pb-promo-input").forEach((input) => {
    input.addEventListener("change", () => {
      const index = parseInt(input.dataset.itemIndex, 10);
      const key = input.dataset.itemKey;
      if (items[index]) {
        items[index][key] = input.value;
        savePromoConfig({ ...config, items });
      }
    });
  });

  // Style changes
  el.pbModuleEditor.querySelectorAll(".pb-promo-style-input, .pb-promo-style-color, .pb-promo-style-range").forEach((input) => {
    input.addEventListener("change", () => {
      const index = parseInt(input.dataset.itemIndex, 10);
      const key = input.dataset.styleKey;
      if (items[index]) {
        if (!items[index].style) items[index].style = getDefaultPromoItemStyle();
        if (input.type === "checkbox") {
          items[index].style[key] = input.checked;
        } else if (input.type === "range") {
          items[index].style[key] = parseFloat(input.value);
        } else {
          items[index].style[key] = input.value;
        }
        savePromoConfig({ ...config, items });
      }
    });
  });

  // Auto-rotate toggle
  const autoRotateCheckbox = document.getElementById("pbPromoAutoRotate");
  const intervalField = document.getElementById("pbPromoIntervalField");
  autoRotateCheckbox?.addEventListener("change", () => {
    if (intervalField) {
      intervalField.style.display = autoRotateCheckbox.checked ? "" : "none";
    }
    savePromoConfig({ ...config, items, autoRotate: autoRotateCheckbox.checked });
  });

  // Interval input
  const intervalInput = document.getElementById("pbPromoInterval");
  intervalInput?.addEventListener("change", () => {
    const seconds = parseFloat(/** @type {HTMLInputElement} */ (intervalInput).value) || 5;
    savePromoConfig({ ...config, items, interval: seconds * 1000 });
  });

  // Show navigation checkbox
  const showNavCheckbox = /** @type {HTMLInputElement} */ (document.getElementById("pbPromoShowNav"));
  showNavCheckbox?.addEventListener("change", () => {
    savePromoConfig({ ...config, items, showNavigation: showNavCheckbox.checked });
  });

  // Show indicators checkbox
  const showIndicatorsCheckbox = /** @type {HTMLInputElement} */ (document.getElementById("pbPromoShowIndicators"));
  showIndicatorsCheckbox?.addEventListener("change", () => {
    savePromoConfig({ ...config, items, showIndicators: showIndicatorsCheckbox.checked });
  });

  // Height input
  const heightInput = document.getElementById("pbPromoHeight");
  heightInput?.addEventListener("change", () => {
    const height = parseInt(/** @type {HTMLInputElement} */ (heightInput).value, 10) || 400;
    savePromoConfig({ ...config, items, height });
  });

  // Transition select
  const transitionSelect = document.getElementById("pbPromoTransition");
  transitionSelect?.addEventListener("change", () => {
    savePromoConfig({ ...config, items, transition: /** @type {HTMLSelectElement} */ (transitionSelect).value });
  });
}

export function collectPromoConfig(el) {
  // Collect carousel settings and items for saving
  const items = [];
  el.pbModuleEditor.querySelectorAll(".pb-promo-item").forEach((itemEl) => {
    const item = {
      id: generatePromoItemId(),
      image: "",
      linkUrl: "",
      imageFit: "cover",
      topText: "",
      bottomText: "",
      textPosition: "overlay",
      style: getDefaultPromoItemStyle(),
    };

    // Get basic fields
    itemEl.querySelectorAll(".pb-promo-input").forEach((input) => {
      const key = input.dataset.itemKey;
      if (input.tagName === "TEXTAREA") {
        item[key] = input.value;
      } else if (input.tagName === "SELECT") {
        item[key] = input.value;
      } else {
        item[key] = input.value;
      }
    });

    // Get style fields
    itemEl.querySelectorAll(".pb-promo-style-input, .pb-promo-style-color, .pb-promo-style-range").forEach((input) => {
      const key = input.dataset.styleKey;
      if (input.type === "checkbox") {
        item.style[key] = input.checked;
      } else if (input.type === "range") {
        item.style[key] = parseFloat(input.value);
      } else {
        item.style[key] = input.value;
      }
    });

    items.push(item);
  });

  const autoRotate = document.getElementById("pbPromoAutoRotate")?.checked ?? true;
  const interval = parseFloat(document.getElementById("pbPromoInterval")?.value || 5) * 1000;
  const showNavigation = document.getElementById("pbPromoShowNav")?.checked ?? true;
  const showIndicators = document.getElementById("pbPromoShowIndicators")?.checked ?? true;
  const height = parseInt(document.getElementById("pbPromoHeight")?.value || 400, 10);
  const transition = document.getElementById("pbPromoTransition")?.value || "fade";

  return {
    items,
    autoRotate,
    interval,
    showNavigation,
    showIndicators,
    height,
    transition,
  };
}

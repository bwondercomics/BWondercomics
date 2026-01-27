import { escapeAttr, escapeHtml, formatFocus, normalizeFit, parseFocus, resolveAssetUrl } from "./helpers.js";

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

function getPromoCropRatio(moduleId, height) {
  const heightValue = Number(height) || 400;
  const previewPromo = document.querySelector(
    `.pb-preview-container .pb-module[data-module-id="${moduleId}"] .pb-promo`
  );
  if (previewPromo) {
    const rect = previewPromo.getBoundingClientRect();
    if (rect.width && rect.height) {
      const ratio = rect.width / rect.height;
      if (ratio > 0.35 && ratio < 3) return ratio;
    }
  }

  const panelWidth = Math.min(400, Math.max(250, window.innerWidth * 0.2));
  return panelWidth / heightValue;
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
            <small class="pb-editor-hint pb-promo-image-meta" data-item-index="${index}">Fit: ${normalizeFit(item.imageFit || "cover")} · Focus: ${item.imageFocus || "center"}</small>
            <input type="hidden" class="pb-promo-input" data-item-index="${index}" data-item-key="imageFit" value="${normalizeFit(item.imageFit || "cover")}">
            <input type="hidden" class="pb-promo-input" data-item-index="${index}" data-item-key="imageFocus" value="${escapeAttr(item.imageFocus || "center")}">
            <input type="hidden" class="pb-promo-input" data-item-index="${index}" data-item-key="imageZoom" value="${Number(item.imageZoom || 1)}">
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
  const items = [...(config.items || [])];

  // Helper to save and re-render
  async function savePromoConfig(newConfig) {
    const updated = await updateModule(selectedModuleId, { config: newConfig });
    if (updated) {
      selectedModule.config = updated.config;
      renderCanvas();
      renderEditorPanel();
    }
  }

  // Add item button
  document.getElementById("pbPromoAddItem")?.addEventListener("click", () => {
    items.push({
      id: generatePromoItemId(),
      image: "",
      imageFit: "cover",
      imageFocus: "center",
      imageZoom: 1,
      topText: "",
      bottomText: "",
      textPosition: "overlay",
      style: getDefaultPromoItemStyle(),
    });
    savePromoConfig({ ...config, items });
  });

  const updatePromoImageUi = (itemEl, item) => {
    const imageInput = itemEl.querySelector('[data-item-key="image"]');
    const fitInput = itemEl.querySelector('[data-item-key="imageFit"]');
    const focusInput = itemEl.querySelector('[data-item-key="imageFocus"]');
    const zoomInput = itemEl.querySelector('[data-item-key="imageZoom"]');
    const meta = itemEl.querySelector(".pb-promo-image-meta");
    if (imageInput) imageInput.value = item.image || "";
    if (fitInput) fitInput.value = normalizeFit(item.imageFit || "cover");
    if (focusInput) focusInput.value = item.imageFocus || "center";
    if (zoomInput) zoomInput.value = String(Number(item.imageZoom) || 1);
    if (meta) {
      const zoom = Number(item.imageZoom) || 1;
      meta.textContent = `Fit: ${normalizeFit(item.imageFit || "cover")} · Focus: ${item.imageFocus || "center"} · Zoom: ${zoom.toFixed(2)}x`;
    }
  };

  // Remove/move buttons on items
  el.pbModuleEditor.querySelectorAll(".pb-promo-item").forEach((itemEl) => {
    const index = parseInt(itemEl.dataset.itemIndex, 10);

    itemEl.querySelector('[data-action="remove"]')?.addEventListener("click", () => {
      items.splice(index, 1);
      savePromoConfig({ ...config, items });
    });

    itemEl.querySelector('[data-action="move-up"]')?.addEventListener("click", () => {
      if (index > 0) {
        [items[index - 1], items[index]] = [items[index], items[index - 1]];
        savePromoConfig({ ...config, items });
      }
    });

    itemEl.querySelector('[data-action="move-down"]')?.addEventListener("click", () => {
      if (index < items.length - 1) {
        [items[index], items[index + 1]] = [items[index + 1], items[index]];
        savePromoConfig({ ...config, items });
      }
    });

    itemEl.querySelector(".pb-promo-pick")?.addEventListener("click", async () => {
      const current = items[index] || {};
      const focus = parseFocus(current.imageFocus || "center");
      const fit = normalizeFit(current.imageFit || "cover");
      const zoom = Number(current.imageZoom) || 1;
      const cropRatio = getPromoCropRatio(selectedModuleId, config.height || 400);
      await openImagePicker({
        title: "Select promo image",
        getItems: fetchAssets,
        allowUpload: true,
        uploadHandler: uploadAssetFile,
        resolveSrc: resolveAssetUrl,
        allowCrop: true,
        cropRatio: Number.isFinite(cropRatio) ? cropRatio : null,
        initialSelection: {
          path: current.image || "",
          fit,
          x: focus.x,
          y: focus.y,
          zoom,
        },
        onApply: ({ item, fit: nextFit, x, y, zoom: nextZoom }) => {
          if (!items[index]) return;
          items[index].image = item?.path || "";
          items[index].imageFit = normalizeFit(nextFit);
          items[index].imageFocus = formatFocus({ x, y });
          items[index].imageZoom = Number(nextZoom) || 1;
          updatePromoImageUi(itemEl, items[index]);
          savePromoConfig({ ...config, items });
        },
      });
    });

    itemEl.querySelector(".pb-promo-clear")?.addEventListener("click", () => {
      if (!items[index]) return;
      items[index].image = "";
      items[index].imageFit = "cover";
      items[index].imageFocus = "center";
      items[index].imageZoom = 1;
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
  });
}

export function collectPromoConfig(el) {
  // Collect carousel settings and items for saving
  const items = [];
  el.pbModuleEditor.querySelectorAll(".pb-promo-item").forEach((itemEl) => {
    const item = {
      id: generatePromoItemId(),
      image: "",
      imageFit: "cover",
      imageFocus: "center",
      imageZoom: 1,
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

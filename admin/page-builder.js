import { el } from "./dom.js";
import { DEFAULT_SERIES_ID } from "./state.js";

/**
 * Module type definitions with icons and default configs.
 */
const MODULE_TYPES = [
  { type: "header", label: "Header", icon: "\u{1F4F0}", category: "content" },
  { type: "text", label: "Text", icon: "\u{1F4DD}", category: "content" },
  { type: "image", label: "Image", icon: "\u{1F5BC}", category: "media" },
  { type: "gallery", label: "Gallery", icon: "\u{1F3B4}", category: "media" },
  { type: "video", label: "Video", icon: "\u{1F3AC}", category: "media" },
  { type: "social", label: "Social", icon: "\u{1F517}", category: "engagement" },
  { type: "email-signup", label: "Email", icon: "\u{1F4E7}", category: "engagement" },
  { type: "promo", label: "Promo", icon: "\u{1F3AF}", category: "engagement" },
  { type: "buttons", label: "Buttons", icon: "\u{1F518}", category: "navigation" },
  { type: "spacer", label: "Spacer", icon: "\u2195", category: "layout" },
  { type: "divider", label: "Divider", icon: "\u2796", category: "layout" },
  { type: "reader", label: "Reader", icon: "\u{1F4D6}", category: "special" },
  { type: "entry-gallery", label: "Entries", icon: "\u{1F4DA}", category: "special" },
  { type: "feed", label: "Feed", icon: "\u{1F4F0}", category: "special" },
  { type: "html", label: "HTML", icon: "\u{1F4BB}", category: "advanced" },
];

const LAYOUT_OPTIONS = [
  { value: "1", label: "1 col" },
  { value: "1-1", label: "1:1" },
  { value: "1-2", label: "1:2" },
  { value: "2-1", label: "2:1" },
  { value: "1-1-1", label: "1:1:1" },
  { value: "1-3-1", label: "1:3:1" },
];

const THEME_COLORS = [
  { key: "primary", label: "Primary", default: "#00d9ff" },
  { key: "secondary", label: "Secondary", default: "#ff00ea" },
  { key: "accent", label: "Accent", default: "#ffed00" },
  { key: "bgDark", label: "Background Dark", default: "#0a0a12" },
  { key: "bgPanel", label: "Background Panel", default: "#1a1a2e" },
  { key: "text", label: "Text", default: "#ffffff" },
  { key: "danger", label: "Danger", default: "#ff3838" },
];

const THEME_PRESETS = {
  cyberpunk: {
    name: "Cyberpunk",
    theme: { primary: "#00d9ff", secondary: "#ff00ea", accent: "#ffed00", bgDark: "#0a0a12", bgPanel: "#1a1a2e", text: "#ffffff", danger: "#ff3838" },
  },
  retro: {
    name: "Retro",
    theme: { primary: "#ff6b35", secondary: "#f7c59f", accent: "#efefd0", bgDark: "#004e64", bgPanel: "#00a5cf", text: "#ffffff", danger: "#ff3838" },
  },
  minimal: {
    name: "Minimal",
    theme: { primary: "#2d3436", secondary: "#636e72", accent: "#0984e3", bgDark: "#ffffff", bgPanel: "#f5f5f5", text: "#2d3436", danger: "#d63031" },
  },
  neon: {
    name: "Neon",
    theme: { primary: "#39ff14", secondary: "#ff00ff", accent: "#00ffff", bgDark: "#0d0d0d", bgPanel: "#1a1a1a", text: "#ffffff", danger: "#ff0000" },
  },
};

/**
 * Get default config for a module type.
 */
function getDefaultConfig(moduleType) {
  switch (moduleType) {
    case "header":
      return { title: "Page Title", subtitle: "" };
    case "text":
      return { content: "<p>Enter your text here...</p>", alignment: "left" };
    case "image":
      return { src: "", alt: "", caption: "" };
    case "gallery":
      return { images: [], columns: 3 };
    case "video":
      return { url: "", autoplay: false };
    case "social":
      return { buttons: [] };
    case "email-signup":
      return {
        heading: "Join the List",
        subtext: "",
        placeholder: "your@email.com",
        buttonText: "Subscribe",
        style: {
          headingFont: "display",
          headingColor: "#ffffff",
          headingGlow: false,
          inputStyle: "bubble",
          buttonColor: "#00d9ff",
          buttonGlow: true
        }
      };
    case "promo":
      return {
        items: [],
        autoRotate: true,
        interval: 5000,
        showNavigation: true,
        showIndicators: true,
        height: 400,
        transition: "fade"
      };
    case "buttons":
      return { buttons: [] };
    case "spacer":
      return { height: 40 };
    case "divider":
      return { style: "solid", color: "" };
    case "reader":
      return { showPanels: true, showComments: true };
    case "entry-gallery":
      return { columns: 3, showLabels: true };
    case "feed":
      return { limit: 5 };
    case "html":
      return { code: "" };
    default:
      return {};
  }
}

/**
 * Get a preview string for a module's config.
 */
function getModulePreview(moduleType, config) {
  switch (moduleType) {
    case "header":
      return config.title || "Untitled";
    case "text":
      return config.content?.replace(/<[^>]*>/g, "").slice(0, 50) || "Empty text";
    case "image":
      return config.src ? config.src.split("/").pop() : "No image";
    case "html":
      return config.code?.slice(0, 30) || "Empty HTML";
    case "promo":
      const promoCount = config.items?.length || 0;
      return promoCount === 0 ? "No promos" : `${promoCount} promo${promoCount > 1 ? "s" : ""}`;
    default:
      return moduleType;
  }
}

function createPageBuilder({ sanitizeSeriesId, getActiveSeriesId, hideAllSections, setActiveNav }) {
  let pages = [];
  let currentPage = null;
  let selectedModuleId = null;
  let activeEditorTab = "modules"; // "modules" or "theme"

  function getSeriesId() {
    return sanitizeSeriesId(getActiveSeriesId()) || DEFAULT_SERIES_ID;
  }

  // ==================== API Calls ====================

  async function fetchPages() {
    const seriesId = getSeriesId();
    try {
      const res = await fetch(`/api/admin/pages?series_id=${encodeURIComponent(seriesId)}`);
      if (!res.ok) throw new Error("Failed to fetch pages");
      const data = await res.json();
      pages = data.pages || [];
      return pages;
    } catch (err) {
      console.error("fetchPages error:", err);
      pages = [];
      return [];
    }
  }

  async function fetchPage(pageId) {
    try {
      const res = await fetch(`/api/admin/pages/${pageId}`);
      if (!res.ok) throw new Error("Failed to fetch page");
      const data = await res.json();
      return data.page || null;
    } catch (err) {
      console.error("fetchPage error:", err);
      return null;
    }
  }

  async function createPage(slug, title) {
    const seriesId = getSeriesId();
    try {
      const res = await fetch(`/api/admin/pages?series_id=${encodeURIComponent(seriesId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, title }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create page");
      }
      const data = await res.json();
      return data.page;
    } catch (err) {
      console.error("createPage error:", err);
      alert(err.message || "Failed to create page");
      return null;
    }
  }

  async function deletePage(pageId) {
    try {
      const res = await fetch(`/api/admin/pages/${pageId}`, { method: "DELETE" });
      return res.ok;
    } catch (err) {
      console.error("deletePage error:", err);
      return false;
    }
  }

  async function updatePage(pageId, data) {
    try {
      const res = await fetch(`/api/admin/pages/${pageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update page");
      return (await res.json()).page;
    } catch (err) {
      console.error("updatePage error:", err);
      return null;
    }
  }

  async function addSection(pageId, sectionType = "row", layout = "1") {
    try {
      const res = await fetch(`/api/admin/pages/${pageId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionType, layout }),
      });
      if (!res.ok) throw new Error("Failed to add section");
      const data = await res.json();
      return data.section;
    } catch (err) {
      console.error("addSection error:", err);
      return null;
    }
  }

  async function updateSection(sectionId, data) {
    try {
      const res = await fetch(`/api/admin/sections/${sectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update section");
      return (await res.json()).section;
    } catch (err) {
      console.error("updateSection error:", err);
      return null;
    }
  }

  async function deleteSection(sectionId) {
    try {
      const res = await fetch(`/api/admin/sections/${sectionId}`, { method: "DELETE" });
      return res.ok;
    } catch (err) {
      console.error("deleteSection error:", err);
      return false;
    }
  }

  async function addModule(sectionId, moduleType, columnIndex = 0) {
    try {
      const config = getDefaultConfig(moduleType);
      const res = await fetch(`/api/admin/sections/${sectionId}/modules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleType, columnIndex, config }),
      });
      if (!res.ok) throw new Error("Failed to add module");
      return (await res.json()).module;
    } catch (err) {
      console.error("addModule error:", err);
      return null;
    }
  }

  async function updateModule(moduleId, data) {
    try {
      const res = await fetch(`/api/admin/modules/${moduleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update module");
      return (await res.json()).module;
    } catch (err) {
      console.error("updateModule error:", err);
      return null;
    }
  }

  async function deleteModule(moduleId) {
    try {
      const res = await fetch(`/api/admin/modules/${moduleId}`, { method: "DELETE" });
      return res.ok;
    } catch (err) {
      console.error("deleteModule error:", err);
      return false;
    }
  }

  // ==================== Rendering ====================

  function renderPageList() {
    if (!el.pbPageList) return;

    if (pages.length === 0) {
      el.pbPageList.innerHTML = `
        <div class="pb-page-list-empty" style="color: rgba(255,255,255,0.5); font-size: 0.85rem; padding: 10px;">
          No pages yet. Create one to get started.
        </div>
      `;
      return;
    }

    el.pbPageList.innerHTML = pages
      .map(
        (page) => `
      <div class="pb-page-item ${currentPage?.id === page.id ? "active" : ""}" data-page-id="${page.id}">
        <span class="pb-page-item-title">${escapeHtml(page.title || page.slug)}</span>
        <span class="pb-page-item-actions">
          <button class="pb-page-action delete" data-action="delete" title="Delete page">\u00D7</button>
        </span>
      </div>
    `
      )
      .join("");

    // Bind click events
    el.pbPageList.querySelectorAll(".pb-page-item").forEach((item) => {
      item.addEventListener("click", async (e) => {
        if (e.target.closest(".pb-page-action")) return;
        const pageId = item.dataset.pageId;
        await selectPage(pageId);
      });

      item.querySelector(".pb-page-action.delete")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        const pageId = item.dataset.pageId;
        if (confirm("Delete this page? This cannot be undone.")) {
          if (await deletePage(pageId)) {
            await fetchPages();
            if (currentPage?.id === pageId) {
              currentPage = null;
              selectedModuleId = null;
            }
            renderPageList();
            renderCanvas();
            renderModuleEditor();
          }
        }
      });
    });
  }

  function renderModulePalette() {
    if (!el.pbModulePalette) return;

    el.pbModulePalette.innerHTML = MODULE_TYPES.map(
      (mod) => `
      <div class="pb-module-type" draggable="true" data-module-type="${mod.type}">
        <span class="pb-module-type-icon">${mod.icon}</span>
        <span class="pb-module-type-label">${mod.label}</span>
      </div>
    `
    ).join("");

    // Bind drag events
    el.pbModulePalette.querySelectorAll(".pb-module-type").forEach((item) => {
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", item.dataset.moduleType);
        e.dataTransfer.effectAllowed = "copy";
      });
    });
  }

  function renderCanvas() {
    if (!el.pbCanvas) return;

    if (!currentPage) {
      el.pbCanvas.innerHTML = `
        <div class="pb-canvas-empty">
          <p>Select a page from the sidebar or create a new one to get started.</p>
        </div>
      `;
      return;
    }

    const sections = currentPage.sections || [];

    let html = sections
      .map((section) => {
        const layoutValue = section.layout || "1";
        const columnCount = layoutValue.split("-").length;
        const columnIndices = Array.from({ length: columnCount }, (_, i) => i);

        return `
        <div class="pb-section" data-section-id="${section.id}">
          <div class="pb-section-header">
            <div class="pb-section-layout">
              ${LAYOUT_OPTIONS.map(
                (opt) => `
                <button class="pb-section-layout-btn ${layoutValue === opt.value ? "active" : ""}"
                        data-layout="${opt.value}">${opt.label}</button>
              `
              ).join("")}
            </div>
            <button class="pb-page-action delete" data-action="delete-section" title="Delete section">\u00D7</button>
          </div>
          <div class="pb-section-columns" data-layout="${layoutValue}">
            ${columnIndices
              .map((colIdx) => {
                const modules = (section.modules || []).filter((m) => m.columnIndex === colIdx);
                return `
                <div class="pb-column" data-column-index="${colIdx}">
                  ${modules
                    .map(
                      (mod) => `
                    <div class="pb-module ${selectedModuleId === mod.id ? "selected" : ""}"
                         data-module-id="${mod.id}" data-module-type="${mod.moduleType}">
                      <div class="pb-module-header">
                        <span class="pb-module-type-badge">${mod.moduleType}</span>
                        <button class="pb-page-action delete" data-action="delete-module" title="Delete">\u00D7</button>
                      </div>
                      <div class="pb-module-preview">${escapeHtml(getModulePreview(mod.moduleType, mod.config))}</div>
                    </div>
                  `
                    )
                    .join("")}
                  <div class="pb-drop-zone" data-section-id="${section.id}" data-column-index="${colIdx}">
                    Drop module here
                  </div>
                </div>
              `;
              })
              .join("")}
          </div>
        </div>
      `;
      })
      .join("");

    html += `
      <div class="pb-add-section" id="pbAddSection">
        + Add Section
      </div>
    `;

    el.pbCanvas.innerHTML = html;

    // Bind section events
    el.pbCanvas.querySelectorAll(".pb-section").forEach((sectionEl) => {
      const sectionId = sectionEl.dataset.sectionId;

      // Layout buttons
      sectionEl.querySelectorAll(".pb-section-layout-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const layout = btn.dataset.layout;
          const updated = await updateSection(sectionId, { layout });
          if (updated) {
            const section = currentPage.sections.find((s) => s.id === sectionId);
            if (section) section.layout = layout;
            renderCanvas();
          }
        });
      });

      // Delete section
      sectionEl.querySelector('[data-action="delete-section"]')?.addEventListener("click", async () => {
        if (confirm("Delete this section and all its modules?")) {
          if (await deleteSection(sectionId)) {
            currentPage.sections = currentPage.sections.filter((s) => s.id !== sectionId);
            renderCanvas();
          }
        }
      });
    });

    // Bind module events
    el.pbCanvas.querySelectorAll(".pb-module").forEach((modEl) => {
      const moduleId = modEl.dataset.moduleId;

      modEl.addEventListener("click", (e) => {
        if (e.target.closest(".pb-page-action")) return;
        selectedModuleId = moduleId;
        renderCanvas();
        renderModuleEditor();
      });

      modEl.querySelector('[data-action="delete-module"]')?.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (await deleteModule(moduleId)) {
          if (selectedModuleId === moduleId) selectedModuleId = null;
          for (const section of currentPage.sections) {
            section.modules = section.modules.filter((m) => m.id !== moduleId);
          }
          renderCanvas();
          renderModuleEditor();
        }
      });
    });

    // Bind drop zone events
    el.pbCanvas.querySelectorAll(".pb-drop-zone").forEach((zone) => {
      zone.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        zone.classList.add("drag-over");
      });

      zone.addEventListener("dragleave", () => {
        zone.classList.remove("drag-over");
      });

      zone.addEventListener("drop", async (e) => {
        e.preventDefault();
        zone.classList.remove("drag-over");
        const moduleType = e.dataTransfer.getData("text/plain");
        const sectionId = zone.dataset.sectionId;
        const columnIndex = parseInt(zone.dataset.columnIndex, 10);

        if (moduleType && sectionId) {
          const newModule = await addModule(sectionId, moduleType, columnIndex);
          if (newModule) {
            const section = currentPage.sections.find((s) => s.id === sectionId);
            if (section) {
              section.modules = section.modules || [];
              section.modules.push(newModule);
            }
            selectedModuleId = newModule.id;
            renderCanvas();
            renderModuleEditor();
          }
        }
      });
    });

    // Add section button
    document.getElementById("pbAddSection")?.addEventListener("click", async () => {
      const newSection = await addSection(currentPage.id);
      if (newSection) {
        currentPage.sections.push(newSection);
        renderCanvas();
      }
    });
  }

  function renderEditorPanel() {
    if (!el.pbModuleEditor) return;

    if (!currentPage) {
      el.pbModuleEditor.innerHTML = `
        <div class="pb-editor-empty">
          <p>Select a page to edit its theme and modules.</p>
        </div>
      `;
      return;
    }

    // Render tabs
    const tabsHtml = `
      <div class="pb-editor-tabs">
        <button class="pb-editor-tab ${activeEditorTab === "modules" ? "active" : ""}" data-tab="modules">Modules</button>
        <button class="pb-editor-tab ${activeEditorTab === "theme" ? "active" : ""}" data-tab="theme">Theme</button>
      </div>
    `;

    let contentHtml = "";
    if (activeEditorTab === "theme") {
      contentHtml = renderThemeEditorContent();
    } else {
      contentHtml = renderModuleEditorContent();
    }

    el.pbModuleEditor.innerHTML = tabsHtml + `<div class="pb-editor-content">${contentHtml}</div>`;

    // Bind tab events
    el.pbModuleEditor.querySelectorAll(".pb-editor-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        activeEditorTab = tab.dataset.tab;
        renderEditorPanel();
      });
    });

    // Bind content-specific events
    if (activeEditorTab === "theme") {
      bindThemeEditorEvents();
    } else {
      bindModuleEditorEvents();
    }
  }

  function renderThemeEditorContent() {
    const theme = currentPage.meta?.theme || {};

    let colorsHtml = THEME_COLORS.map((color) => {
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

    let presetsHtml = Object.entries(THEME_PRESETS)
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
      <div class="pb-editor-actions">
        <button class="btn-primary" id="pbSaveTheme">Save Theme</button>
        <button class="btn-secondary" id="pbResetTheme">Reset to Default</button>
      </div>
    `;
  }

  function bindThemeEditorEvents() {
    // Sync color picker with text input
    el.pbModuleEditor.querySelectorAll(".pb-theme-color-picker").forEach((picker) => {
      picker.addEventListener("input", (e) => {
        const key = picker.dataset.key;
        const textInput = el.pbModuleEditor.querySelector(`.pb-theme-color-text[data-key="${key}"]`);
        if (textInput) textInput.value = e.target.value;
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
      const theme = {};
      el.pbModuleEditor.querySelectorAll(".pb-theme-color-text").forEach((input) => {
        theme[input.dataset.key] = input.value;
      });

      const meta = { ...(currentPage.meta || {}), theme };
      const updated = await updatePage(currentPage.id, { meta });
      if (updated) {
        currentPage.meta = updated.meta;
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

  // ==================== Promo Editor ====================

  function generatePromoItemId() {
    return "promo-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
  }

  function getDefaultPromoItemStyle() {
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
      backgroundGlow: false
    };
  }

  function renderPromoEditor(config) {
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
            <label class="pb-editor-label">Image URL</label>
            <input type="text" class="pb-editor-input pb-promo-input" data-item-index="${index}" data-item-key="image" value="${escapeAttr(item.image || "")}">
            <small class="pb-editor-hint">Upload images to /assets/images/ via Media</small>
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
                <div class="pb-editor-field pb-editor-field--row">
                  <select class="pb-editor-select pb-promo-style-input" data-item-index="${index}" data-style-key="topTextFont">
                    <option value="default" ${style.topTextFont === "default" ? "selected" : ""}>Default</option>
                    <option value="display" ${style.topTextFont === "display" ? "selected" : ""}>Display (Bebas)</option>
                    <option value="mono" ${style.topTextFont === "mono" ? "selected" : ""}>Monospace</option>
                  </select>
                  <input type="color" class="pb-promo-style-color" data-item-index="${index}" data-style-key="topTextColor" value="${style.topTextColor || "#ffed00"}">
                </div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label><input type="checkbox" class="pb-promo-style-input" data-item-index="${index}" data-style-key="topTextGlow" ${style.topTextGlow ? "checked" : ""}> Glow</label>
                  <input type="color" class="pb-promo-style-color" data-item-index="${index}" data-style-key="topTextGlowColor" value="${style.topTextGlowColor || "#ffed00"}">
                </div>
              </div>

              <div class="pb-style-group">
                <div class="pb-style-group-title">Bottom Text</div>
                <div class="pb-editor-field pb-editor-field--row">
                  <select class="pb-editor-select pb-promo-style-input" data-item-index="${index}" data-style-key="bottomTextFont">
                    <option value="default" ${style.bottomTextFont === "default" ? "selected" : ""}>Default</option>
                    <option value="display" ${style.bottomTextFont === "display" ? "selected" : ""}>Display (Bebas)</option>
                    <option value="mono" ${style.bottomTextFont === "mono" ? "selected" : ""}>Monospace</option>
                  </select>
                  <input type="color" class="pb-promo-style-color" data-item-index="${index}" data-style-key="bottomTextColor" value="${style.bottomTextColor || "#ffffff"}">
                </div>
                <div class="pb-editor-field pb-editor-field--row">
                  <label><input type="checkbox" class="pb-promo-style-input" data-item-index="${index}" data-style-key="bottomTextGlow" ${style.bottomTextGlow ? "checked" : ""}> Glow</label>
                  <input type="color" class="pb-promo-style-color" data-item-index="${index}" data-style-key="bottomTextGlowColor" value="${style.bottomTextGlowColor || "#00d9ff"}">
                </div>
              </div>

              <div class="pb-style-group">
                <div class="pb-style-group-title">Background</div>
                <div class="pb-editor-field pb-editor-field--row">
                  <input type="color" class="pb-promo-style-color" data-item-index="${index}" data-style-key="backgroundColor" value="${style.backgroundColor === "transparent" ? "#000000" : (style.backgroundColor || "#000000")}">
                  <label><input type="checkbox" class="pb-promo-style-input" data-item-index="${index}" data-style-key="backgroundGlow" ${style.backgroundGlow ? "checked" : ""}> Glow</label>
                </div>
              </div>
            </div>
          </details>
        </div>
      `;
    }).join("");

    return `
      <div class="pb-promo-items-section">
        <div class="pb-editor-section-header">
          <label class="pb-editor-label">Promo Items</label>
          <button type="button" class="btn-small btn-add" id="pbPromoAddItem">+ Add Item</button>
        </div>
        <div class="pb-promo-items-list" id="pbPromoItemsList">
          ${itemsHtml || '<div class="pb-promo-empty">No promo items. Click "Add Item" to create one.</div>'}
        </div>
      </div>

      <div class="pb-editor-section-divider"></div>

      <div class="pb-editor-section-header">
        <label class="pb-editor-label">Carousel Settings</label>
      </div>

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
        <input type="number" class="pb-editor-input" id="pbPromoHeight" value="${config.height || 400}" min="200" max="800">
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

  function bindPromoEditorEvents() {
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
        topText: "",
        bottomText: "",
        textPosition: "overlay",
        style: getDefaultPromoItemStyle()
      });
      savePromoConfig({ ...config, items });
    });

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

  function collectPromoConfig() {
    // Collect carousel settings and items for saving
    const items = [];
    el.pbModuleEditor.querySelectorAll(".pb-promo-item").forEach((itemEl) => {
      const index = parseInt(itemEl.dataset.itemIndex, 10);
      const item = {
        id: generatePromoItemId(),
        image: "",
        topText: "",
        bottomText: "",
        textPosition: "overlay",
        style: getDefaultPromoItemStyle()
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
      transition
    };
  }

  function renderModuleEditorContent() {
    if (!selectedModuleId) {
      return `
        <div class="pb-editor-empty">
          <p>Click on a module to edit its settings.</p>
        </div>
      `;
    }

    // Find the selected module
    let selectedModule = null;
    for (const section of currentPage.sections || []) {
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

  function bindModuleEditorEvents() {
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
      bindPromoEditorEvents();
    }

    // Bind save button
    document.getElementById("pbSaveModule")?.addEventListener("click", async () => {
      let newConfig;

      // Special handling for promo modules
      if (selectedModule.moduleType === "promo") {
        newConfig = collectPromoConfig();
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
        selectedModuleId = null;
        renderCanvas();
        renderEditorPanel();
      }
    });
  }

  // Backward compatibility wrapper
  function renderModuleEditor() {
    renderEditorPanel();
  }

  async function selectPage(pageId) {
    const page = await fetchPage(pageId);
    if (page) {
      currentPage = page;
      selectedModuleId = null;
      renderPageList();
      renderCanvas();
      renderModuleEditor();
    }
  }

  // ==================== Public Methods ====================

  async function showPageBuilderSection() {
    hideAllSections();
    if (el.adminDashboard) {
      el.adminDashboard.classList.remove("admin-designer-open");
      el.adminDashboard.classList.add("admin-page-builder-open");
    }
    if (el.pageBuilderSection) {
      el.pageBuilderSection.style.display = "block";
      el.pageBuilderSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setActiveNav(el.btnDesigner);

    await fetchPages();
    renderPageList();
    renderModulePalette();
    renderCanvas();
    renderModuleEditor();
  }

  function initPageBuilder() {
    // Add page button
    el.pbAddPage?.addEventListener("click", async () => {
      const slug = prompt("Enter page slug (e.g., reader, about, gallery):");
      if (!slug) return;
      const title = prompt("Enter page title:", slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
      if (title === null) return;

      const newPage = await createPage(slug.toLowerCase().trim(), title.trim());
      if (newPage) {
        await fetchPages();
        currentPage = newPage;
        renderPageList();
        renderCanvas();
        renderModuleEditor();
      }
    });

    // Save button (currently saves happen on individual actions)
    el.pbSave?.addEventListener("click", () => {
      alert("Changes are saved automatically as you edit.");
    });
  }

  function onSeriesChange() {
    currentPage = null;
    selectedModuleId = null;
    if (el.pageBuilderSection?.style.display !== "none") {
      showPageBuilderSection();
    }
  }

  return {
    initPageBuilder,
    showPageBuilderSection,
    onSeriesChange,
  };
}

// ==================== Utilities ====================

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  if (!str) return "";
  return String(str).replace(/"/g, "&quot;");
}

export { createPageBuilder };

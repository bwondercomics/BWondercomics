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
      return { heading: "Subscribe", buttonText: "Sign Up" };
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
    default:
      return moduleType;
  }
}

function createPageBuilder({ sanitizeSeriesId, getActiveSeriesId, hideAllSections, setActiveNav }) {
  let pages = [];
  let currentPage = null;
  let selectedModuleId = null;

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

  function renderModuleEditor() {
    if (!el.pbModuleEditor) return;

    if (!selectedModuleId || !currentPage) {
      el.pbModuleEditor.innerHTML = `
        <div class="pb-editor-empty">
          <p>Click on a module to edit its settings.</p>
        </div>
      `;
      return;
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
      el.pbModuleEditor.innerHTML = `
        <div class="pb-editor-empty">
          <p>Module not found.</p>
        </div>
      `;
      return;
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

      default:
        fieldsHtml = `
          <div class="pb-editor-field">
            <label class="pb-editor-label">Raw Config (JSON)</label>
            <textarea class="pb-editor-textarea" data-key="_raw" style="font-family: monospace;">${escapeHtml(JSON.stringify(config, null, 2))}</textarea>
          </div>
        `;
    }

    el.pbModuleEditor.innerHTML = `
      <h3>${moduleType.toUpperCase()} Settings</h3>
      ${fieldsHtml}
      <div class="pb-editor-actions">
        <button class="btn-primary" id="pbSaveModule">Save</button>
        <button class="btn-secondary" id="pbDeleteModule">Delete</button>
      </div>
    `;

    // Bind save button
    document.getElementById("pbSaveModule")?.addEventListener("click", async () => {
      const newConfig = { ...config };

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
        renderModuleEditor();
      }
    });
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
    if (el.adminDashboard) el.adminDashboard.classList.remove("admin-designer-open");
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

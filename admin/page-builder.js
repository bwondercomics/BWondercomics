import { el } from "./dom.js";
import { openImagePicker } from "./image-picker.js";
import { DEFAULT_SERIES_ID } from "./state.js";
import { readFileAsBase64 } from "./utils.js";
import { LAYOUT_OPTIONS, MODULE_TYPES } from "./page-builder/constants.js";
import { escapeAttr, escapeHtml, resolveAssetUrl } from "./page-builder/helpers.js";
import { renderThemeEditorContent, bindThemeEditorEvents } from "./page-builder/theme-editor.js";
import { renderModuleEditorContent, bindModuleEditorEvents } from "./page-builder/module-editor.js";
import {
  fetchPages,
  fetchPage,
  createPage,
  deletePage,
  updatePage,
  fetchAssets,
  uploadAsset,
  addSection,
  updateSection,
  deleteSection,
  addModule,
  updateModule,
  deleteModule
} from "./page-builder/data.js";


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
      return {
        limit: 5,
        heading: "BWC FEED",
        author: "DOYLE MELVILLE II",
        showAuthor: true,
        showDropdown: true,
        feedLabel: "Open feed",
        feedHref: "feed.html",
        showMediaButton: true,
        mediaLabel: "Media",
        mediaHref: "media.html"
      };
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
    case "feed":
      return `Feed (limit ${config.limit || 0})`;
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

  function getCurrentPage() {
    return currentPage;
  }

  function setSelectedModuleId(nextId) {
    selectedModuleId = nextId;
  }

  // ==================== Data helpers ====================

  async function loadPages() {
    pages = await fetchPages(getSeriesId());
    return pages;
  }

  async function createPageForSeries(slug, title) {
    return createPage(getSeriesId(), slug, title);
  }

  async function uploadAssetFile(file) {
    return uploadAsset(file, readFileAsBase64);
  }

  async function addModuleWithDefault(sectionId, moduleType, columnIndex = 0) {
    const config = getDefaultConfig(moduleType);
    return addModule(sectionId, moduleType, columnIndex, config);
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
      .map((page) => {
        const statusLabel = page.isPublished ? "Published" : "Draft";
        const statusClass = page.isPublished ? "published" : "draft";
        return `
      <div class="pb-page-item ${currentPage?.id === page.id ? "active" : ""}" data-page-id="${page.id}">
        <span class="pb-page-item-title">${escapeHtml(page.title || page.slug)}</span>
        <span class="pb-page-status ${statusClass}">${statusLabel}</span>
        <span class="pb-page-item-actions">
          <button class="pb-page-action delete" data-action="delete" title="Delete page">\u00D7</button>
        </span>
      </div>
    `;
      })
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
            await loadPages();
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

    // Update page title display
    if (el.pbPageTitle) {
      if (currentPage) {
        const statusLabel = currentPage.isPublished ? "Published" : "Draft";
        el.pbPageTitle.textContent = `Page: ${currentPage.title} (${statusLabel})`;
      } else {
        el.pbPageTitle.textContent = "";
      }
    }

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
          const newModule = await addModuleWithDefault(sectionId, moduleType, columnIndex);
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
      contentHtml = renderThemeEditorContent(currentPage);
    } else {
      contentHtml = renderModuleEditorContent({ currentPage, selectedModuleId });
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
      bindThemeEditorEvents({
        el,
        getCurrentPage,
        updatePage,
        openImagePicker,
        fetchAssets,
        uploadAssetFile,
        resolveAssetUrl,
      });
    } else {
      bindModuleEditorEvents({
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
      });
    }
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

    await loadPages();
    renderPageList();
    renderModulePalette();
    renderCanvas();
    renderModuleEditor();
  }

  function initPageBuilder() {
    // Editor width toggle (local UI only)
    const layout = document.querySelector(".page-builder-layout");
    if (layout && el.pbToggleEditor) {
      const key = "pb-editor-expanded";
      const applyState = (isExpanded) => {
        layout.classList.toggle("pb-editor-expanded", isExpanded);
        el.pbToggleEditor.textContent = isExpanded ? "Shrink Editor" : "Expand Editor";
      };
      const saved = localStorage.getItem(key) === "1";
      applyState(saved);
      el.pbToggleEditor.addEventListener("click", () => {
        const next = !layout.classList.contains("pb-editor-expanded");
        localStorage.setItem(key, next ? "1" : "0");
        applyState(next);
      });
    }

    // Add page button
    el.pbAddPage?.addEventListener("click", async () => {
      const slug = prompt("Enter page slug (e.g., reader, about, gallery):");
      if (!slug) return;
      const title = prompt("Enter page title:", slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
      if (title === null) return;

      const newPage = await createPageForSeries(slug.toLowerCase().trim(), title.trim());
      if (newPage) {
        await loadPages();
        currentPage = newPage;
        renderPageList();
        renderCanvas();
        renderModuleEditor();
      }
    });

    // Save button - saves all modules in the current page
    el.pbSave?.addEventListener("click", async () => {
      if (!currentPage) return;

      const saveBtn = el.pbSave;
      const originalText = saveBtn.textContent;
      saveBtn.textContent = "Saving...";
      saveBtn.disabled = true;

      try {
        // Save page metadata
        await fetch(`/api/admin/pages/${currentPage.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: currentPage.title,
            slug: currentPage.slug,
            meta: currentPage.meta,
            isPublished: !!currentPage.isPublished
          })
        });

        // Save all modules
        for (const section of currentPage.sections || []) {
          for (const mod of section.modules || []) {
            await fetch(`/api/admin/modules/${mod.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ config: mod.config })
            });
          }
        }

        saveBtn.textContent = "Saved \u2713";
        setTimeout(() => {
          saveBtn.textContent = originalText;
          saveBtn.disabled = false;
        }, 2000);
      } catch (err) {
        console.error("Save error:", err);
        saveBtn.textContent = "Error - Try Again";
        saveBtn.disabled = false;
      }
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

export { createPageBuilder };

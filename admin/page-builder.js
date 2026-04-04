import { el } from './dom.js';
import { openImagePicker } from './image-picker.js';
import { DEFAULT_SERIES_ID } from './state.js';
import { readFileAsBase64 } from './utils.js';
import { LAYOUT_OPTIONS, MODULE_TYPES, THEME_COLORS } from './page-builder/constants.js';
import { escapeAttr, escapeHtml, resolveAssetUrl } from './page-builder/helpers.js';
import { renderThemeEditorContent, bindThemeEditorEvents } from './page-builder/theme-editor.js';
import { renderModuleEditorContent, bindModuleEditorEvents } from './page-builder/module-editor.js';
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
  reorderSections,
  addModule,
  updateModule,
  moveModule,
  reorderModules,
  deleteModule,
} from './page-builder/data.js';

const EDITOR_MODE_KEY = 'pb-editor-mode';
const SIDEBAR_MODE_KEY = 'pb-sidebar-mode';
const WIDE_EDITOR_BREAKPOINT = 1440;
const STACK_EDITOR_BREAKPOINT = 1100;
const SIDEBAR_EXPANDED_WIDTH = 200;
const SIDEBAR_COLLAPSED_WIDTH = 72;

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function getDefaultThemeDraft() {
  return {
    theme: Object.fromEntries(THEME_COLORS.map((color) => [color.key, color.default])),
    panelBackgrounds: {},
    panelSpacing: {},
  };
}

/**
 * Get default config for a module type.
 */
function getDefaultConfig(moduleType) {
  switch (moduleType) {
    case 'header':
      return { title: 'Page Title', subtitle: '' };
    case 'text':
      return { content: '<p>Enter your text here...</p>', alignment: 'left' };
    case 'image':
      return { src: '', alt: '', caption: '' };
    case 'gallery':
      return { images: [], columns: 3 };
    case 'video':
      return { url: '', autoplay: false };
    case 'social':
      return { buttons: [] };
    case 'email-signup':
      return {
        heading: 'Join the List',
        subtext: '',
        placeholder: 'your@email.com',
        buttonText: 'Subscribe',
        style: {
          headingFont: 'display',
          headingColor: '#ffffff',
          headingGlow: false,
          inputStyle: 'bubble',
          buttonColor: '#00d9ff',
          buttonGlow: true,
        },
      };
    case 'promo':
      return {
        items: [],
        autoRotate: true,
        interval: 5000,
        showNavigation: true,
        showIndicators: true,
        height: 400,
        transition: 'fade',
      };
    case 'buttons':
      return { buttons: [] };
    case 'spacer':
      return { height: 40 };
    case 'divider':
      return { style: 'solid', color: '' };
    case 'reader':
      return { showPanels: true, showComments: true };
    case 'entry-gallery':
      return { columns: 3, showLabels: true };
    case 'feed':
      return {
        limit: 5,
        heading: 'BWC FEED',
        author: 'DOYLE MELVILLE II',
        showAuthor: true,
        showDropdown: true,
        feedLabel: 'Open feed',
        feedHref: 'feed.html',
        showMediaButton: true,
        mediaLabel: 'Media',
        mediaHref: 'media.html',
        style: {
          headingBgColor: '#ffed00',
          headingTextColor: '#0a0a12',
          authorColor: '#7ef5e3',
          buttonBgColor: '#00d9ff',
          buttonTextColor: '#0a0a12',
          itemTitleColor: '#ffed00',
          itemDateColor: '#00d9ff',
          itemBorderColor: '#00d9ff',
          borderColor: '#ffed00',
        },
      };
    case 'html':
      return { code: '' };
    default:
      return {};
  }
}

/**
 * Get a preview string for a module's config.
 */
function getModulePreview(moduleType, config) {
  switch (moduleType) {
    case 'header':
      return config.title || 'Untitled';
    case 'text':
      return config.content?.replace(/<[^>]*>/g, '').slice(0, 50) || 'Empty text';
    case 'image':
      return config.src ? config.src.split('/').pop() : 'No image';
    case 'html':
      return config.code?.slice(0, 30) || 'Empty HTML';
    case 'promo': {
      const promoCount = config.items?.length || 0;
      return promoCount === 0 ? 'No promos' : `${promoCount} promo${promoCount > 1 ? 's' : ''}`;
    }
    case 'feed':
      return `Feed (limit ${config.limit || 0})`;
    default:
      return moduleType;
  }
}

function getPageDisplayTitle(page) {
  return page?.title || page?.slug || 'Untitled page';
}

function renderPageStatusBadges(page) {
  if (!page) return '';
  const badges = [
    `<span class="pb-page-status ${page.isPublished ? 'published' : 'draft'}">${page.isPublished ? 'Published' : 'Draft'}</span>`,
  ];
  if (page.isHomepage) {
    badges.push('<span class="pb-page-status homepage">Homepage</span>');
  }
  return badges.join('');
}

function createPageBuilder({ sanitizeSeriesId, getActiveSeriesId, hideAllSections, setActiveNav }) {
  let pages = [];
  let currentPage = null;
  let selectedModuleId = null;
  let activeEditorTab = 'modules';
  let editorResizeBound = false;
  let activeModuleDraftId = null;
  let activeModuleDraft = null;
  let activeThemeDraft = null;
  let activeSectionId = null;
  let activeSectionDraft = null;
  let dirtyScope = null;
  let editorStatus = { type: 'neutral', message: '' };
  let canvasStatus = { type: 'neutral', message: '' };
  let activeInsertTarget = null;
  let draggedModuleId = null;
  let draggedSectionId = null;

  function getSeriesId() {
    return sanitizeSeriesId(getActiveSeriesId()) || DEFAULT_SERIES_ID;
  }

  function getSelectedModuleRecord(moduleId = selectedModuleId) {
    if (!currentPage || !moduleId) return null;
    for (const section of currentPage.sections || []) {
      const found = (section.modules || []).find((module) => module.id === moduleId);
      if (found) return found;
    }
    return null;
  }

  function getSectionRecord(sectionId) {
    return (currentPage?.sections || []).find((section) => section.id === sectionId) || null;
  }

  function findModuleLocation(moduleId) {
    for (const section of currentPage?.sections || []) {
      const modules = section.modules || [];
      const module = modules.find((item) => item.id === moduleId);
      if (module) {
        return { section, module };
      }
    }
    return null;
  }

  function getModuleLabel(moduleType) {
    const match = MODULE_TYPES.find((item) => item.type === moduleType);
    if (match?.label) return match.label;
    return String(moduleType || 'module')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function getViewportEditorBand() {
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    if (width >= WIDE_EDITOR_BREAKPOINT) return 'wide';
    if (width >= STACK_EDITOR_BREAKPOINT) return 'medium';
    return 'stacked';
  }

  function readStoredEditorMode() {
    const saved = localStorage.getItem(EDITOR_MODE_KEY);
    if (saved === 'collapsed' || saved === 'docked' || saved === 'overlay') {
      return saved;
    }
    return null;
  }

  function readStoredSidebarMode() {
    const saved = localStorage.getItem(SIDEBAR_MODE_KEY);
    if (saved === 'collapsed' || saved === 'expanded') {
      return saved;
    }
    return null;
  }

  function getEffectiveEditorMode(storedMode = readStoredEditorMode()) {
    const band = getViewportEditorBand();
    if (!storedMode) {
      return band === 'wide' ? 'docked' : 'overlay';
    }
    if (band === 'wide') {
      return storedMode === 'docked' || storedMode === 'overlay' ? 'docked' : 'collapsed';
    }
    return storedMode === 'collapsed' ? 'collapsed' : 'overlay';
  }

  function getEffectiveSidebarMode(storedMode = readStoredSidebarMode()) {
    const band = getViewportEditorBand();
    if (band === 'stacked') {
      return 'expanded';
    }
    return storedMode === 'collapsed' ? 'collapsed' : 'expanded';
  }

  function getSidebarWidth(sidebarMode) {
    return sidebarMode === 'collapsed'
      ? `${SIDEBAR_COLLAPSED_WIDTH}px`
      : `${SIDEBAR_EXPANDED_WIDTH}px`;
  }

  function getEditorWidth(mode, sidebarMode = getEffectiveSidebarMode()) {
    const navCollapsed = el.adminDashboard?.classList.contains('nav-collapsed');
    const baseWidth = mode === 'docked' ? (navCollapsed ? 620 : 520) : navCollapsed ? 420 : 320;
    const sidebarBonus =
      sidebarMode === 'collapsed' ? SIDEBAR_EXPANDED_WIDTH - SIDEBAR_COLLAPSED_WIDTH : 0;
    return `${baseWidth + sidebarBonus}px`;
  }

  function syncSidebarRailLabel() {
    if (!el.pbSidebarRailLabel) return;
    const activeTab = document.querySelector('.page-builder-sidebar .pb-sidebar-tab.active');
    el.pbSidebarRailLabel.textContent = activeTab?.textContent?.trim() || 'Pages';
  }

  function setEditorStatus(message = '', type = 'neutral') {
    editorStatus = { message, type };
    updateEditorFooterUi();
  }

  function setCanvasStatus(message = '', type = 'neutral') {
    canvasStatus = { message, type };
  }

  function clearDirty(scope = null) {
    if (!scope || dirtyScope === scope) {
      dirtyScope = null;
    }
    updateEditorFooterUi();
  }

  function markDirty(scope) {
    dirtyScope = scope;
    if (scope === 'module') {
      setEditorStatus('Unsaved module changes. Save or discard before switching.', 'warning');
    } else if (scope === 'theme') {
      setEditorStatus('Unsaved theme changes. Save or discard before switching.', 'warning');
    } else if (scope === 'section') {
      setCanvasStatus('Unsaved section settings. Save or discard before switching.', 'warning');
    }
  }

  function updateEditorFooterUi() {
    if (!el.pbModuleEditor) return;
    const footer = el.pbModuleEditor.querySelector('.pb-editor-footer');
    if (!footer) return;

    const footerScope = footer.dataset.scope;
    const isDirty = dirtyScope === footerScope;
    const statusEl = footer.querySelector('[data-editor-status]');
    const saveBtn = footer.querySelector('[data-action="save-current"]');
    const discardBtn = footer.querySelector('[data-action="discard-current"]');

    if (saveBtn) saveBtn.disabled = !isDirty;
    if (discardBtn) discardBtn.disabled = !isDirty;

    if (statusEl) {
      let message = '';
      let type = 'neutral';
      if (isDirty) {
        message =
          footerScope === 'theme'
            ? 'Theme draft has unsaved changes.'
            : 'Module draft has unsaved changes.';
        type = 'warning';
      } else if (editorStatus.message) {
        message = editorStatus.message;
        type = editorStatus.type || 'neutral';
      } else {
        message =
          footerScope === 'theme'
            ? 'Theme changes save explicitly.'
            : 'Module changes save explicitly.';
      }
      statusEl.textContent = message;
      statusEl.dataset.status = type;
    }
  }

  function ensureCleanWorkspace(message) {
    if (!dirtyScope) return true;
    if (dirtyScope === 'section') {
      setCanvasStatus(
        message || 'Save or discard the current section settings before switching.',
        'warning'
      );
      renderCanvas();
      return false;
    }
    setEditorStatus(message || 'Save or discard your current changes before switching.', 'warning');
    return false;
  }

  function normalizeThemeDraft(page) {
    const defaults = getDefaultThemeDraft();
    return {
      theme: {
        ...defaults.theme,
        ...(page?.meta?.theme || {}),
      },
      panelBackgrounds: cloneValue(page?.meta?.panelBackgrounds || {}),
      panelSpacing: cloneValue(page?.meta?.panelSpacing || {}),
    };
  }

  function initializeModuleDraft(moduleId = selectedModuleId) {
    const module = getSelectedModuleRecord(moduleId);
    activeModuleDraftId = module?.id || null;
    activeModuleDraft = module ? cloneValue(module.config || {}) : null;
  }

  function initializeThemeDraft() {
    activeThemeDraft = currentPage ? normalizeThemeDraft(currentPage) : getDefaultThemeDraft();
  }

  function initializeSectionDraft(sectionId) {
    const section = getSectionRecord(sectionId);
    if (!section) return;
    const settings = section.settings || {};
    activeSectionId = sectionId;
    activeSectionDraft = {
      moduleGap: settings.moduleGap ?? '',
      columnGap: settings.columnGap ?? '',
      sectionGap: settings.sectionGap ?? '',
    };
  }

  function resetBuilderState() {
    selectedModuleId = null;
    activeModuleDraftId = null;
    activeModuleDraft = null;
    activeThemeDraft = currentPage ? normalizeThemeDraft(currentPage) : null;
    activeSectionId = null;
    activeSectionDraft = null;
    dirtyScope = null;
    editorStatus = { type: 'neutral', message: '' };
    canvasStatus = { type: 'neutral', message: '' };
    activeInsertTarget = null;
    draggedModuleId = null;
    draggedSectionId = null;
  }

  function syncPageSummary(page) {
    if (!page?.id) return;
    pages = pages.map((item) => (item.id === page.id ? { ...item, ...page } : item));
    if (currentPage?.id === page.id) {
      currentPage = { ...currentPage, ...page };
    }
  }

  function sortModulesForColumn(section, columnIndex) {
    return (section?.modules || [])
      .filter((module) => module.columnIndex === columnIndex)
      .slice()
      .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
  }

  function sortSections(sections = []) {
    return sections.slice().sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
  }

  function applyEditorMode() {
    const layout = document.querySelector('.page-builder-layout');
    if (!layout) return;

    const band = getViewportEditorBand();
    const mode = getEffectiveEditorMode();
    const sidebarMode = getEffectiveSidebarMode();
    const isOpen = mode !== 'collapsed';
    const label = isOpen ? '\u276F' : '\u276E';
    const actionLabel = isOpen ? 'Collapse' : 'Expand';
    const sidebarCollapsed = sidebarMode === 'collapsed';
    const sidebarLabel = sidebarCollapsed ? '\u276F' : '\u276E';
    const sidebarActionLabel = sidebarCollapsed ? 'Expand' : 'Collapse';

    layout.dataset.editorMode = mode;
    layout.dataset.viewportBand = band;
    layout.dataset.sidebarMode = sidebarMode;
    layout.style.setProperty('--pb-sidebar-width', getSidebarWidth(sidebarMode));
    layout.style.setProperty('--pb-editor-width', getEditorWidth(mode, sidebarMode));
    syncSidebarRailLabel();

    if (el.pbToggleEditor) {
      el.pbToggleEditor.textContent = label;
      el.pbToggleEditor.setAttribute('aria-expanded', String(isOpen));
      el.pbToggleEditor.setAttribute('aria-label', `${actionLabel} editor panel`);
      el.pbToggleEditor.dataset.mode = mode;
      el.pbToggleEditor.dataset.viewportBand = band;
    }

    if (el.pbToggleSidebar) {
      el.pbToggleSidebar.textContent = sidebarLabel;
      el.pbToggleSidebar.setAttribute('aria-expanded', String(!sidebarCollapsed));
      el.pbToggleSidebar.setAttribute('aria-label', `${sidebarActionLabel} left panel`);
      el.pbToggleSidebar.hidden = band === 'stacked';
      el.pbToggleSidebar.dataset.mode = sidebarMode;
      el.pbToggleSidebar.dataset.viewportBand = band;
    }
  }

  function toggleEditorMode() {
    const band = getViewportEditorBand();
    const currentMode = getEffectiveEditorMode();
    const nextMode =
      band === 'wide'
        ? currentMode === 'docked'
          ? 'collapsed'
          : 'docked'
        : currentMode === 'collapsed'
          ? 'overlay'
          : 'collapsed';

    localStorage.setItem(EDITOR_MODE_KEY, nextMode);
    applyEditorMode();
  }

  function toggleSidebarMode() {
    if (getViewportEditorBand() === 'stacked') return;
    const nextMode = getEffectiveSidebarMode() === 'collapsed' ? 'expanded' : 'collapsed';
    localStorage.setItem(SIDEBAR_MODE_KEY, nextMode);
    applyEditorMode();
  }

  function getReaderUrl(page) {
    const params = new URLSearchParams({
      series: getSeriesId(),
      page: String(page?.slug || '').trim() || 'reader',
    });
    if (page?.isPublished === false) {
      params.set('draft', '1');
    }
    return `../index.html?${params.toString()}`;
  }

  function setPageActionState(activeButton, busyText) {
    const buttons = [el.pbSaveDraft, el.pbPublish].filter(Boolean);
    const original = new Map(buttons.map((button) => [button, button.textContent]));
    buttons.forEach((button) => {
      button.disabled = true;
      if (button === activeButton) {
        button.textContent = busyText;
      }
    });

    return (button, nextText = null, delayMs = 0) => {
      const restore = () => {
        buttons.forEach((btn) => {
          btn.disabled = false;
          btn.textContent = original.get(btn);
        });
        if (button && nextText) {
          button.textContent = nextText;
          window.setTimeout(() => {
            button.textContent = original.get(button);
          }, 1200);
        }
      };
      if (delayMs > 0) {
        window.setTimeout(restore, delayMs);
        return;
      }
      restore();
    };
  }

  async function updatePublishState(isPublished) {
    if (!currentPage) return;
    if (
      !ensureCleanWorkspace('Save or discard your current changes before updating publish state.')
    ) {
      return;
    }

    const activeButton = isPublished ? el.pbPublish : el.pbSaveDraft;
    if (!activeButton) return;

    const releaseButtons = setPageActionState(
      activeButton,
      isPublished ? 'Publishing...' : 'Saving...'
    );

    try {
      const updated = await updatePage(currentPage.id, {
        title: currentPage.title,
        slug: currentPage.slug,
        pageType: currentPage.pageType,
        meta: currentPage.meta,
        isPublished,
      });
      if (!updated) {
        throw new Error('Failed to update page status');
      }

      syncPageSummary(updated);
      activeThemeDraft = normalizeThemeDraft(currentPage);
      renderPageList();
      renderCanvas();
      renderEditorPanel();
      releaseButtons(activeButton, isPublished ? 'Published' : 'Draft Saved');
    } catch (err) {
      console.error('Page status update error:', err);
      releaseButtons();
      setEditorStatus(
        isPublished ? 'Failed to publish changes.' : 'Failed to save draft.',
        'danger'
      );
      renderEditorPanel();
    }
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

  async function addModuleWithDefault(sectionId, moduleType, columnIndex = 0, sortIndex = null) {
    const config = getDefaultConfig(moduleType);
    return addModule(sectionId, moduleType, columnIndex, config, sortIndex);
  }

  function applyModuleOrderLocally(sectionId, columnIndex, moduleIds) {
    const section = getSectionRecord(sectionId);
    if (!section) return;
    const orderMap = new Map(moduleIds.map((id, index) => [id, index]));
    (section.modules || []).forEach((module) => {
      if (module.columnIndex === columnIndex && orderMap.has(module.id)) {
        module.sortIndex = orderMap.get(module.id);
      }
    });
    section.modules.sort((a, b) => {
      if ((a.columnIndex ?? 0) !== (b.columnIndex ?? 0)) {
        return (a.columnIndex ?? 0) - (b.columnIndex ?? 0);
      }
      return (a.sortIndex ?? 0) - (b.sortIndex ?? 0);
    });
  }

  function applySectionOrderLocally(sectionIds) {
    const rank = new Map(sectionIds.map((id, index) => [id, index]));
    currentPage.sections = (currentPage.sections || [])
      .slice()
      .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    currentPage.sections.forEach((section, index) => {
      section.sortIndex = index;
    });
  }

  async function insertModuleAt(sectionId, columnIndex, insertIndex, moduleType) {
    if (!currentPage) return;
    const section = getSectionRecord(sectionId);
    if (!section) return;

    const newModule = await addModuleWithDefault(sectionId, moduleType, columnIndex);
    if (!newModule) return;

    section.modules = section.modules || [];
    section.modules.push(newModule);

    const orderedIds = sortModulesForColumn(section, columnIndex)
      .map((module) => module.id)
      .filter((id) => id !== newModule.id);
    orderedIds.splice(insertIndex, 0, newModule.id);

    await reorderModules(sectionId, columnIndex, orderedIds);
    applyModuleOrderLocally(sectionId, columnIndex, orderedIds);
    activeInsertTarget = null;
    setCanvasStatus(`${getModuleLabel(moduleType)} module added.`, 'success');
    renderCanvas();
  }

  async function moveModuleToTarget(moduleId, targetSectionId, targetColumnIndex, insertIndex) {
    if (!currentPage) return;
    const location = findModuleLocation(moduleId);
    const targetSection = getSectionRecord(targetSectionId);
    if (!location || !targetSection) return;

    const sourceSection = location.section;
    const sourceModule = location.module;
    const sourceColumnIndex = sourceModule.columnIndex ?? 0;
    const targetOrderedIds = sortModulesForColumn(targetSection, targetColumnIndex)
      .map((module) => module.id)
      .filter((id) => id !== moduleId);
    targetOrderedIds.splice(insertIndex, 0, moduleId);

    if (sourceSection.id === targetSectionId && sourceColumnIndex === targetColumnIndex) {
      await reorderModules(targetSectionId, targetColumnIndex, targetOrderedIds);
      applyModuleOrderLocally(targetSectionId, targetColumnIndex, targetOrderedIds);
      renderCanvas();
      return;
    }

    const movedModule = await moveModule(moduleId, targetSectionId, targetColumnIndex, insertIndex);
    if (!movedModule) return;

    sourceSection.modules = (sourceSection.modules || []).filter(
      (module) => module.id !== moduleId
    );
    targetSection.modules = targetSection.modules || [];
    targetSection.modules.push({
      ...location.module,
      ...movedModule,
    });

    const sourceOrderedIds = sortModulesForColumn(sourceSection, sourceColumnIndex).map(
      (module) => module.id
    );
    if (sourceOrderedIds.length > 0) {
      await reorderModules(sourceSection.id, sourceColumnIndex, sourceOrderedIds);
      applyModuleOrderLocally(sourceSection.id, sourceColumnIndex, sourceOrderedIds);
    }

    await reorderModules(targetSectionId, targetColumnIndex, targetOrderedIds);
    applyModuleOrderLocally(targetSectionId, targetColumnIndex, targetOrderedIds);
    setCanvasStatus('Module moved.', 'success');
    renderCanvas();
  }

  async function insertSectionAt(index) {
    if (!currentPage) return;
    const newSection = await addSection(currentPage.id);
    if (!newSection) return;

    currentPage.sections = currentPage.sections || [];
    currentPage.sections.push(newSection);
    const sectionIds = currentPage.sections
      .map((section) => section.id)
      .filter((id) => id !== newSection.id);
    sectionIds.splice(index, 0, newSection.id);
    await reorderSections(currentPage.id, sectionIds);
    applySectionOrderLocally(sectionIds);
    setCanvasStatus('Section added.', 'success');
    renderCanvas();
  }

  async function reorderSectionToIndex(sectionId, insertIndex) {
    if (!currentPage) return;
    const sectionIds = sortSections(currentPage.sections)
      .map((section) => section.id)
      .filter((id) => id !== sectionId);
    sectionIds.splice(insertIndex, 0, sectionId);
    await reorderSections(currentPage.id, sectionIds);
    applySectionOrderLocally(sectionIds);
    setCanvasStatus('Section reordered.', 'success');
    renderCanvas();
  }

  function renderModulePicker(target) {
    const groups = Array.from(new Set(MODULE_TYPES.map((module) => module.category)));
    return `
      <div class="pb-inline-picker">
        ${groups
          .map((category) => {
            const items = MODULE_TYPES.filter((module) => module.category === category);
            return `
            <div class="pb-inline-picker-group">
              <div class="pb-inline-picker-title">${escapeHtml(category)}</div>
              <div class="pb-inline-picker-grid">
                ${items
                  .map(
                    (module) => `
                  <button
                    type="button"
                    class="pb-inline-picker-item"
                    data-action="insert-module-type"
                    data-module-type="${module.type}"
                    data-section-id="${target.sectionId}"
                    data-column-index="${target.columnIndex}"
                    data-insert-index="${target.insertIndex}"
                  >
                    <span class="pb-inline-picker-icon">${module.icon}</span>
                    <span class="pb-inline-picker-label">${module.label}</span>
                  </button>
                `
                  )
                  .join('')}
              </div>
            </div>
          `;
          })
          .join('')}
      </div>
    `;
  }

  function renderModuleInsertBar(sectionId, columnIndex, insertIndex) {
    const isActive =
      activeInsertTarget &&
      activeInsertTarget.sectionId === sectionId &&
      activeInsertTarget.columnIndex === columnIndex &&
      activeInsertTarget.insertIndex === insertIndex;
    return `
      <div
        class="pb-module-insert ${isActive ? 'active' : ''}"
        data-section-id="${sectionId}"
        data-column-index="${columnIndex}"
        data-insert-index="${insertIndex}"
      >
        <button
          type="button"
          class="pb-inline-insert-trigger"
          data-action="toggle-module-picker"
          data-section-id="${sectionId}"
          data-column-index="${columnIndex}"
          data-insert-index="${insertIndex}"
        >
          + Add Module
        </button>
        ${isActive ? renderModulePicker({ sectionId, columnIndex, insertIndex }) : ''}
      </div>
    `;
  }

  function renderSectionInsertBar(insertIndex) {
    return `
      <div class="pb-section-insert" data-insert-index="${insertIndex}">
        <button
          type="button"
          class="pb-section-insert-trigger"
          data-action="insert-section"
          data-insert-index="${insertIndex}"
        >
          + Add Section
        </button>
      </div>
    `;
  }

  function renderCanvas() {
    if (!el.pbCanvas) return;

    if (el.pbPageTitle) {
      if (!currentPage) {
        el.pbPageTitle.innerHTML = '';
      } else {
        el.pbPageTitle.innerHTML = `
          <div class="pb-page-title-main">
            <div class="pb-page-title-copy">
              <span class="pb-page-title-label">Editing Page</span>
              <span class="pb-page-title-name">${escapeHtml(getPageDisplayTitle(currentPage))}</span>
              <span class="pb-page-title-meta">${escapeHtml(currentPage.slug || 'reader')} · ${escapeHtml(currentPage.pageType || 'custom')}</span>
            </div>
            <div class="pb-page-title-actions">
              <span class="pb-page-title-badges">${renderPageStatusBadges(currentPage)}</span>
              <a class="pb-open-reader-link" href="${escapeAttr(getReaderUrl(currentPage))}" target="_blank" rel="noopener noreferrer">
                Open Reader
              </a>
            </div>
          </div>
        `;
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

    const sections = sortSections(currentPage.sections || []);
    const canvasNotice = canvasStatus.message
      ? `<div class="pb-canvas-notice" data-status="${escapeAttr(canvasStatus.type || 'neutral')}" id="pbCanvasNotice">${escapeHtml(canvasStatus.message)}</div>`
      : '';

    const html = `
      ${canvasNotice}
      ${sections
        .map((section, sectionIndex) => {
          const layoutValue = section.layout || '1';
          const columnCount = layoutValue.split('-').length;
          const columnIndices = Array.from({ length: columnCount }, (_, i) => i);
          const moduleCount = (section.modules || []).length;
          const isSettingsOpen = activeSectionId === section.id;
          const sectionDraft =
            isSettingsOpen && activeSectionDraft
              ? activeSectionDraft
              : {
                  moduleGap: section.settings?.moduleGap ?? '',
                  columnGap: section.settings?.columnGap ?? '',
                  sectionGap: section.settings?.sectionGap ?? '',
                };

          return `
          ${renderSectionInsertBar(sectionIndex)}
          <div class="pb-section ${isSettingsOpen ? 'pb-section--active' : ''}" data-section-id="${section.id}">
            <div class="pb-section-header">
              <div class="pb-section-header-main">
                <button
                  type="button"
                  class="pb-section-drag-handle"
                  data-action="section-drag"
                  data-section-id="${section.id}"
                  draggable="true"
                  title="Reorder section"
                >
                  \u22EE
                </button>
                <div class="pb-section-summary">
                  <span class="pb-section-summary-title">Section ${sectionIndex + 1}</span>
                  <span class="pb-section-summary-meta">${moduleCount} module${moduleCount === 1 ? '' : 's'}</span>
                </div>
              </div>
              <div class="pb-section-header-actions">
                <select class="pb-section-layout-select" data-action="change-layout" data-section-id="${section.id}">
                  ${LAYOUT_OPTIONS.map(
                    (opt) => `
                    <option value="${opt.value}" ${layoutValue === opt.value ? 'selected' : ''}>${opt.label}</option>
                  `
                  ).join('')}
                </select>
                <button
                  type="button"
                  class="btn-small btn-secondary pb-section-settings-toggle"
                  data-action="toggle-section-settings"
                  data-section-id="${section.id}"
                >
                  ${isSettingsOpen ? 'Hide Settings' : 'Section Settings'}
                </button>
                <button class="pb-page-action delete" data-action="delete-section" data-section-id="${section.id}" title="Delete section">\u00D7</button>
              </div>
            </div>
            ${
              isSettingsOpen
                ? `
              <div class="pb-section-settings-card">
                <div class="pb-section-settings-grid">
                  <label class="pb-section-settings-field">
                    <span>Module Gap</span>
                    <input type="number" class="pb-section-settings-input" data-setting="moduleGap" value="${sectionDraft.moduleGap}" min="0" step="1" placeholder="16">
                  </label>
                  <label class="pb-section-settings-field">
                    <span>Column Gap</span>
                    <input type="number" class="pb-section-settings-input" data-setting="columnGap" value="${sectionDraft.columnGap}" min="0" step="1" placeholder="16">
                  </label>
                  <label class="pb-section-settings-field">
                    <span>Section Gap</span>
                    <input type="number" class="pb-section-settings-input" data-setting="sectionGap" value="${sectionDraft.sectionGap}" min="0" step="1" placeholder="24">
                  </label>
                </div>
                <div class="pb-section-settings-actions">
                  <div class="pb-section-settings-status">${dirtyScope === 'section' ? 'Section settings have unsaved changes.' : 'Section spacing saves explicitly.'}</div>
                  <div class="pb-section-settings-buttons">
                    <button type="button" class="btn-secondary" data-action="discard-section-settings" ${dirtyScope === 'section' ? '' : 'disabled'}>Discard</button>
                    <button type="button" class="btn-primary" data-action="save-section-settings" ${dirtyScope === 'section' ? '' : 'disabled'}>Save</button>
                  </div>
                </div>
              </div>
            `
                : ''
            }
            <div class="pb-section-columns" data-layout="${layoutValue}">
              ${columnIndices
                .map((colIdx) => {
                  const modules = sortModulesForColumn(section, colIdx);
                  return `
                  <div class="pb-column" data-column-index="${colIdx}" data-section-id="${section.id}">
                    ${renderModuleInsertBar(section.id, colIdx, 0)}
                    ${modules
                      .map(
                        (mod, moduleIndex) => `
                      <div
                        class="pb-module ${selectedModuleId === mod.id ? 'selected' : ''}"
                        data-module-id="${mod.id}"
                        data-module-type="${mod.moduleType}"
                        draggable="true"
                      >
                        <div class="pb-module-header">
                          <div class="pb-module-header-main">
                            <button type="button" class="pb-module-drag-handle" title="Move module">\u22EE</button>
                            <span class="pb-module-type-badge">${mod.moduleType}</span>
                            ${dirtyScope === 'module' && selectedModuleId === mod.id ? '<span class="pb-module-draft-badge">Draft</span>' : ''}
                          </div>
                          <button class="pb-page-action delete" data-action="delete-module" data-module-id="${mod.id}" title="Delete">\u00D7</button>
                        </div>
                        <div class="pb-module-preview">${escapeHtml(getModulePreview(mod.moduleType, mod.config || {}))}</div>
                      </div>
                      ${renderModuleInsertBar(section.id, colIdx, moduleIndex + 1)}
                    `
                      )
                      .join('')}
                  </div>
                `;
                })
                .join('')}
            </div>
          </div>
        `;
        })
        .join('')}
      ${renderSectionInsertBar(sections.length)}
    `;

    el.pbCanvas.innerHTML = html;

    el.pbCanvas.querySelectorAll('[data-action="insert-section"]').forEach((button) => {
      button.addEventListener('click', async () => {
        const index = parseInt(button.dataset.insertIndex, 10) || 0;
        await insertSectionAt(index);
      });
    });

    el.pbCanvas.querySelectorAll('.pb-section-insert').forEach((insertEl) => {
      insertEl.addEventListener('dragover', (e) => {
        if (!draggedSectionId) return;
        e.preventDefault();
        insertEl.classList.add('drag-over');
      });
      insertEl.addEventListener('dragleave', () => {
        insertEl.classList.remove('drag-over');
      });
      insertEl.addEventListener('drop', async (e) => {
        if (!draggedSectionId) return;
        e.preventDefault();
        insertEl.classList.remove('drag-over');
        const index = parseInt(insertEl.dataset.insertIndex, 10) || 0;
        const sectionId = draggedSectionId;
        draggedSectionId = null;
        await reorderSectionToIndex(sectionId, index);
      });
    });

    el.pbCanvas.querySelectorAll('[data-action="section-drag"]').forEach((handle) => {
      handle.addEventListener('dragstart', (e) => {
        draggedSectionId = handle.dataset.sectionId;
        e.dataTransfer.effectAllowed = 'move';
      });
      handle.addEventListener('dragend', () => {
        draggedSectionId = null;
      });
    });

    el.pbCanvas.querySelectorAll('[data-action="change-layout"]').forEach((select) => {
      select.addEventListener('change', async () => {
        const sectionId = select.dataset.sectionId;
        const layout = select.value;
        const updated = await updateSection(sectionId, { layout });
        if (updated) {
          const section = getSectionRecord(sectionId);
          if (section) section.layout = updated.layout || layout;
          renderCanvas();
        }
      });
    });

    el.pbCanvas.querySelectorAll('[data-action="toggle-section-settings"]').forEach((button) => {
      button.addEventListener('click', () => {
        const sectionId = button.dataset.sectionId;
        if (activeSectionId === sectionId && dirtyScope !== 'section') {
          activeSectionId = null;
          activeSectionDraft = null;
          setCanvasStatus('', 'neutral');
          renderCanvas();
          return;
        }
        if (dirtyScope === 'section' && activeSectionId !== sectionId) {
          setCanvasStatus(
            'Save or discard the current section settings before switching sections.',
            'warning'
          );
          renderCanvas();
          return;
        }
        initializeSectionDraft(sectionId);
        setCanvasStatus('', 'neutral');
        renderCanvas();
      });
    });

    if (activeSectionId) {
      el.pbCanvas.querySelectorAll('.pb-section-settings-input').forEach((input) => {
        input.addEventListener('change', () => {
          if (!activeSectionDraft) return;
          const key = input.dataset.setting;
          const raw = String(input.value || '').trim();
          activeSectionDraft[key] = raw ? Math.max(0, Math.round(Number(raw) || 0)) : '';
          markDirty('section');
          renderCanvas();
        });
      });

      el.pbCanvas
        .querySelector('[data-action="discard-section-settings"]')
        ?.addEventListener('click', () => {
          if (!activeSectionId) return;
          initializeSectionDraft(activeSectionId);
          clearDirty('section');
          setCanvasStatus('Section changes discarded.', 'neutral');
          renderCanvas();
        });

      el.pbCanvas
        .querySelector('[data-action="save-section-settings"]')
        ?.addEventListener('click', async () => {
          if (!activeSectionId || !activeSectionDraft) return;
          const section = getSectionRecord(activeSectionId);
          if (!section) return;
          const settings = {};
          ['moduleGap', 'columnGap', 'sectionGap'].forEach((key) => {
            const value = activeSectionDraft[key];
            if (value !== '' && value !== null && value !== undefined) {
              settings[key] = value;
            }
          });
          const updated = await updateSection(activeSectionId, { settings });
          if (updated) {
            section.settings = updated.settings || settings;
            initializeSectionDraft(activeSectionId);
            clearDirty('section');
            setCanvasStatus('Section settings saved.', 'success');
            renderCanvas();
          } else {
            setCanvasStatus('Failed to save section settings.', 'danger');
            renderCanvas();
          }
        });
    }

    el.pbCanvas.querySelectorAll('.pb-module-insert').forEach((insertEl) => {
      insertEl.addEventListener('dragover', (e) => {
        const moduleType = e.dataTransfer?.getData('text/plain');
        if (!draggedModuleId && !moduleType) return;
        e.preventDefault();
        insertEl.classList.add('drag-over');
      });
      insertEl.addEventListener('dragleave', () => {
        insertEl.classList.remove('drag-over');
      });
      insertEl.addEventListener('drop', async (e) => {
        const droppedModuleType = e.dataTransfer?.getData('text/plain');
        if (!draggedModuleId && !droppedModuleType) return;
        e.preventDefault();
        insertEl.classList.remove('drag-over');
        const sectionId = insertEl.dataset.sectionId;
        const columnIndex = parseInt(insertEl.dataset.columnIndex, 10);
        const insertIndex = parseInt(insertEl.dataset.insertIndex, 10);
        if (draggedModuleId) {
          const moduleId = draggedModuleId;
          draggedModuleId = null;
          await moveModuleToTarget(moduleId, sectionId, columnIndex, insertIndex);
          return;
        }
        if (droppedModuleType) {
          await insertModuleAt(sectionId, columnIndex, insertIndex, droppedModuleType);
        }
      });
    });

    el.pbCanvas.querySelectorAll('[data-action="toggle-module-picker"]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = {
          sectionId: button.dataset.sectionId,
          columnIndex: parseInt(button.dataset.columnIndex, 10),
          insertIndex: parseInt(button.dataset.insertIndex, 10),
        };
        const isSameTarget =
          activeInsertTarget &&
          activeInsertTarget.sectionId === target.sectionId &&
          activeInsertTarget.columnIndex === target.columnIndex &&
          activeInsertTarget.insertIndex === target.insertIndex;
        activeInsertTarget = isSameTarget ? null : target;
        renderCanvas();
      });
    });

    el.pbCanvas.querySelectorAll('[data-action="insert-module-type"]').forEach((button) => {
      button.addEventListener('click', async () => {
        await insertModuleAt(
          button.dataset.sectionId,
          parseInt(button.dataset.columnIndex, 10),
          parseInt(button.dataset.insertIndex, 10),
          button.dataset.moduleType
        );
      });
    });

    el.pbCanvas.querySelectorAll('.pb-module').forEach((modEl) => {
      const moduleId = modEl.dataset.moduleId;

      modEl.addEventListener('dragstart', (e) => {
        draggedModuleId = moduleId;
        e.dataTransfer.effectAllowed = 'move';
      });
      modEl.addEventListener('dragend', () => {
        draggedModuleId = null;
      });

      modEl.addEventListener('click', () => {
        if (selectedModuleId === moduleId) return;
        if (dirtyScope === 'module' || dirtyScope === 'theme' || dirtyScope === 'section') {
          const sameModule = dirtyScope === 'module' && selectedModuleId === moduleId;
          if (!sameModule) {
            ensureCleanWorkspace(
              'Save or discard your current changes before selecting another module.'
            );
            return;
          }
        }
        selectedModuleId = moduleId;
        activeEditorTab = 'modules';
        initializeModuleDraft(moduleId);
        setEditorStatus('', 'neutral');
        renderCanvas();
        renderEditorPanel();
      });

      modEl.querySelector('[data-action="delete-module"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this module? This cannot be undone.')) return;
        const deletingSelected = selectedModuleId === moduleId;
        if (deletingSelected && dirtyScope === 'module') {
          clearDirty('module');
        }
        if (await deleteModule(moduleId)) {
          for (const section of currentPage.sections || []) {
            section.modules = (section.modules || []).filter((module) => module.id !== moduleId);
          }
          if (selectedModuleId === moduleId) {
            selectedModuleId = null;
            activeModuleDraftId = null;
            activeModuleDraft = null;
          }
          setCanvasStatus('Module deleted.', 'success');
          renderCanvas();
          renderEditorPanel();
        }
      });
    });

    el.pbCanvas.querySelectorAll('[data-action="delete-section"]').forEach((button) => {
      button.addEventListener('click', async () => {
        const sectionId = button.dataset.sectionId;
        if (!confirm('Delete this section and all its modules?')) return;
        if (await deleteSection(sectionId)) {
          currentPage.sections = (currentPage.sections || []).filter(
            (section) => section.id !== sectionId
          );
          if (activeSectionId === sectionId) {
            activeSectionId = null;
            activeSectionDraft = null;
            clearDirty('section');
          }
          if (selectedModuleId && !getSelectedModuleRecord(selectedModuleId)) {
            selectedModuleId = null;
            activeModuleDraftId = null;
            activeModuleDraft = null;
          }
          setCanvasStatus('Section deleted.', 'success');
          renderCanvas();
          renderEditorPanel();
        }
      });
    });
  }

  async function saveActiveModuleDraft() {
    const selectedModule = getSelectedModuleRecord();
    if (!selectedModule || !activeModuleDraft) return;
    const updated = await updateModule(selectedModule.id, {
      config: cloneValue(activeModuleDraft),
    });
    if (!updated) {
      setEditorStatus('Failed to save module.', 'danger');
      renderEditorPanel();
      return;
    }
    selectedModule.config = updated.config;
    activeModuleDraftId = selectedModule.id;
    activeModuleDraft = cloneValue(updated.config);
    clearDirty('module');
    setEditorStatus('Module saved.', 'success');
    renderCanvas();
    renderEditorPanel();
  }

  function discardActiveModuleDraft() {
    const selectedModule = getSelectedModuleRecord();
    if (!selectedModule) return;
    activeModuleDraftId = selectedModule.id;
    activeModuleDraft = cloneValue(selectedModule.config || {});
    clearDirty('module');
    setEditorStatus('Module changes discarded.', 'neutral');
    renderEditorPanel();
  }

  async function saveActiveThemeDraft() {
    if (!currentPage || !activeThemeDraft) return;
    const nextMeta = {
      ...(currentPage.meta || {}),
      theme: cloneValue(activeThemeDraft.theme),
      panelBackgrounds: cloneValue(activeThemeDraft.panelBackgrounds),
      panelSpacing: cloneValue(activeThemeDraft.panelSpacing),
    };
    const updated = await updatePage(currentPage.id, { meta: nextMeta });
    if (!updated) {
      setEditorStatus('Failed to save theme.', 'danger');
      renderEditorPanel();
      return;
    }
    syncPageSummary(updated);
    activeThemeDraft = normalizeThemeDraft(currentPage);
    clearDirty('theme');
    setEditorStatus('Theme saved.', 'success');
    renderCanvas();
    renderEditorPanel();
  }

  function discardActiveThemeDraft() {
    activeThemeDraft = normalizeThemeDraft(currentPage);
    clearDirty('theme');
    setEditorStatus('Theme changes discarded.', 'neutral');
    renderEditorPanel();
  }

  function resetActiveThemeDraft() {
    activeThemeDraft = getDefaultThemeDraft();
    markDirty('theme');
    renderEditorPanel();
  }

  function renderEditorPanel() {
    if (!el.pbModuleEditor) return;

    const renderTabs = (disableTabs = false) => `
      <div class="pb-editor-tabs" role="tablist" aria-label="Inspector tabs">
        <button
          class="pb-editor-tab ${activeEditorTab === 'modules' ? 'active' : ''}"
          data-tab="modules"
          role="tab"
          aria-selected="${String(activeEditorTab === 'modules')}"
          ${disableTabs ? 'disabled' : ''}
        >
          Modules
        </button>
        <button
          class="pb-editor-tab ${activeEditorTab === 'theme' ? 'active' : ''}"
          data-tab="theme"
          role="tab"
          aria-selected="${String(activeEditorTab === 'theme')}"
          ${disableTabs ? 'disabled' : ''}
        >
          Theme
        </button>
      </div>
    `;

    const renderFooter = ({ scope, actionsHtml = '' }) => `
      <div class="pb-editor-footer" data-scope="${scope}">
        <div class="pb-editor-footer-status" data-editor-status></div>
        <div class="pb-editor-footer-actions">${actionsHtml}</div>
      </div>
    `;

    const renderShell = ({
      kicker,
      title,
      subtitle,
      contentHtml,
      footerHtml = '',
      disableTabs = false,
    }) => `
      <div class="pb-editor-shell">
        <div class="pb-editor-header">
          <div class="pb-editor-header-copy">
            <div class="pb-editor-heading-line">
              <span class="pb-editor-kicker">${escapeHtml(kicker)}</span>
              <h3 class="pb-editor-title" id="pbEditorTitle">${escapeHtml(title)}</h3>
            </div>
            <p class="pb-editor-subtitle">${escapeHtml(subtitle)}</p>
          </div>
          ${renderTabs(disableTabs)}
        </div>
        <div class="pb-editor-content">${contentHtml}</div>
        ${footerHtml}
      </div>
    `;

    if (!currentPage) {
      el.pbModuleEditor.innerHTML = renderShell({
        kicker: 'Inspector',
        title: 'Choose a Page',
        subtitle: 'Select a page on the left to unlock module editing and theme controls.',
        contentHtml: `
          <div class="pb-editor-empty">
            <div class="pb-editor-empty-card">
              <span class="pb-editor-empty-kicker">Start Here</span>
              <h4>Pick a page from the left rail</h4>
              <p>Once a page is active, use Modules for block editing and Theme for page-wide styling.</p>
            </div>
          </div>
        `,
        disableTabs: true,
      });
      return;
    }

    const selectedModule = getSelectedModuleRecord();
    if (!activeThemeDraft) {
      initializeThemeDraft();
    }
    if (selectedModule && activeModuleDraftId !== selectedModule.id) {
      initializeModuleDraft(selectedModule.id);
    }

    let contentHtml = '';
    let footerHtml = '';
    let kicker = 'Inspector';
    let title = 'Page Inspector';
    let subtitle = `Adjust structure and visual polish for ${getPageDisplayTitle(currentPage)}.`;

    if (activeEditorTab === 'theme') {
      contentHtml = renderThemeEditorContent(currentPage, activeThemeDraft);
      kicker = 'Theme Studio';
      title = 'Page Theme';
      subtitle = `Tune presets, palette, panel backgrounds, and spacing for ${getPageDisplayTitle(currentPage)}.`;
      footerHtml = renderFooter({
        scope: 'theme',
        actionsHtml: `
          <button class="btn-secondary" id="pbDiscardTheme" data-action="discard-current" type="button">Discard</button>
          <button class="btn-secondary" id="pbResetTheme" data-action="reset-theme" type="button">Reset to Default</button>
          <button class="btn-primary" id="pbSaveTheme" data-action="save-current" type="button">Save Theme</button>
        `,
      });
    } else {
      contentHtml = renderModuleEditorContent({
        currentPage,
        selectedModuleId,
        draftConfig: selectedModule ? activeModuleDraft : null,
      });
      kicker = selectedModule ? 'Selected Module' : 'Module Inspector';
      title = selectedModule
        ? `${getModuleLabel(selectedModule.moduleType)} Module`
        : 'Choose a Module';
      subtitle = selectedModule
        ? `Editing ${getModulePreview(selectedModule.moduleType, activeModuleDraft || selectedModule.config || {})}.`
        : 'Select a module in the canvas to edit content, behavior, appearance, and advanced settings.';
      if (selectedModule) {
        footerHtml = renderFooter({
          scope: 'module',
          actionsHtml: `
            <button class="btn-secondary" id="pbDiscardModule" data-action="discard-current" type="button">Discard</button>
            <button class="btn-secondary" id="pbDeleteModule" data-action="delete-module" type="button">Delete</button>
            <button class="btn-primary" id="pbSaveModule" data-action="save-current" type="button">Save</button>
          `,
        });
      }
    }

    el.pbModuleEditor.innerHTML = renderShell({
      kicker,
      title,
      subtitle,
      contentHtml,
      footerHtml,
    });

    el.pbModuleEditor.querySelectorAll('.pb-editor-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const nextTab = tab.dataset.tab;
        if (nextTab === activeEditorTab) return;
        if (
          !ensureCleanWorkspace(
            'Save or discard your current changes before switching inspector tabs.'
          )
        ) {
          renderEditorPanel();
          return;
        }
        activeEditorTab = nextTab;
        if (nextTab === 'theme') {
          initializeThemeDraft();
        } else if (selectedModuleId) {
          initializeModuleDraft(selectedModuleId);
        }
        setEditorStatus('', 'neutral');
        renderEditorPanel();
      });
    });

    if (activeEditorTab === 'theme') {
      bindThemeEditorEvents({
        el,
        draftMeta: activeThemeDraft,
        setDraftMeta: (nextDraft) => {
          activeThemeDraft = cloneValue(nextDraft);
        },
        markDirty,
        openImagePicker,
        fetchAssets,
        uploadAssetFile,
        resolveAssetUrl,
      });

      document.getElementById('pbSaveTheme')?.addEventListener('click', async () => {
        await saveActiveThemeDraft();
      });
      document.getElementById('pbDiscardTheme')?.addEventListener('click', () => {
        discardActiveThemeDraft();
      });
      document.getElementById('pbResetTheme')?.addEventListener('click', () => {
        resetActiveThemeDraft();
      });
    } else if (selectedModule) {
      bindModuleEditorEvents({
        el,
        currentPage,
        selectedModuleId,
        draftConfig: activeModuleDraft,
        setDraftConfig: (nextDraft) => {
          activeModuleDraftId = selectedModuleId;
          activeModuleDraft = cloneValue(nextDraft);
        },
        markDirty,
        renderEditorPanel,
        openImagePicker,
        fetchAssets,
        uploadAssetFile,
      });

      document.getElementById('pbSaveModule')?.addEventListener('click', async () => {
        await saveActiveModuleDraft();
      });
      document.getElementById('pbDiscardModule')?.addEventListener('click', () => {
        discardActiveModuleDraft();
      });
      document.getElementById('pbDeleteModule')?.addEventListener('click', async () => {
        const moduleId = selectedModuleId;
        if (!moduleId) return;
        if (!confirm('Delete this module? This cannot be undone.')) return;
        if (await deleteModule(moduleId)) {
          for (const section of currentPage.sections || []) {
            section.modules = (section.modules || []).filter((module) => module.id !== moduleId);
          }
          selectedModuleId = null;
          activeModuleDraftId = null;
          activeModuleDraft = null;
          clearDirty('module');
          setEditorStatus('Module deleted.', 'success');
          renderCanvas();
          renderEditorPanel();
        } else {
          setEditorStatus('Failed to delete module.', 'danger');
          renderEditorPanel();
        }
      });
    }

    updateEditorFooterUi();
  }

  async function selectPage(pageId) {
    if (!ensureCleanWorkspace('Save or discard your current changes before switching pages.')) {
      return;
    }

    const page = await fetchPage(pageId);
    if (page) {
      currentPage = page;
      resetBuilderState();
      activeThemeDraft = normalizeThemeDraft(currentPage);
      renderPageList();
      renderCanvas();
      renderEditorPanel();
    }
  }

  // ==================== Public Methods ====================

  async function showPageBuilderSection() {
    hideAllSections();
    if (el.adminDashboard) {
      el.adminDashboard.classList.remove('admin-designer-open');
      el.adminDashboard.classList.add('admin-page-builder-open');
    }
    if (el.pageBuilderSection) {
      el.pageBuilderSection.style.display = '';
      el.pageBuilderSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveNav(el.btnDesigner);

    await loadPages();
    renderPageList();
    renderModulePalette();
    renderCanvas();
    renderEditorPanel();
    applyEditorMode();
  }

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
        <div class="pb-page-item ${currentPage?.id === page.id ? 'active' : ''}" data-page-id="${page.id}">
          <div class="pb-page-item-main">
            <span class="pb-page-item-title">${escapeHtml(getPageDisplayTitle(page))}</span>
            <span class="pb-page-item-meta">${escapeHtml(page.slug || 'reader')} · ${escapeHtml(page.pageType || 'custom')}</span>
          </div>
          <span class="pb-page-item-badges">${renderPageStatusBadges(page)}</span>
          <span class="pb-page-item-actions">
            <button class="pb-page-action delete" data-action="delete" title="Delete page">\u00D7</button>
          </span>
        </div>
      `
      )
      .join('');

    el.pbPageList.querySelectorAll('.pb-page-item').forEach((item) => {
      item.addEventListener('click', async (e) => {
        if (e.target.closest('.pb-page-action')) return;
        await selectPage(item.dataset.pageId);
      });

      item.querySelector('.pb-page-action.delete')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!ensureCleanWorkspace('Save or discard your current changes before deleting a page.')) {
          return;
        }
        const pageId = item.dataset.pageId;
        if (confirm('Delete this page? This cannot be undone.')) {
          if (await deletePage(pageId)) {
            await loadPages();
            if (currentPage?.id === pageId) {
              currentPage = null;
              resetBuilderState();
            }
            renderPageList();
            renderCanvas();
            renderEditorPanel();
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
    ).join('');

    el.pbModulePalette.querySelectorAll('.pb-module-type').forEach((item) => {
      item.addEventListener('dragstart', (e) => {
        draggedModuleId = null;
        e.dataTransfer.setData('text/plain', item.dataset.moduleType);
        e.dataTransfer.effectAllowed = 'copy';
      });
    });
  }

  function initPageBuilder() {
    applyEditorMode();

    if (el.pbToggleEditor) {
      el.pbToggleEditor.addEventListener('click', toggleEditorMode);
    }

    if (el.pbToggleSidebar) {
      el.pbToggleSidebar.addEventListener('click', toggleSidebarMode);
    }

    if (!editorResizeBound) {
      window.addEventListener('resize', applyEditorMode);
      editorResizeBound = true;
    }

    el.adminNavToggle?.addEventListener('click', () => {
      window.requestAnimationFrame(() => {
        applyEditorMode();
      });
    });

    const sidebar = document.querySelector('.page-builder-sidebar');
    if (sidebar) {
      sidebar.querySelectorAll('.pb-sidebar-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          sidebar
            .querySelectorAll('.pb-sidebar-tab')
            .forEach((button) => button.classList.remove('active'));
          tab.classList.add('active');
          const target = tab.dataset.tab;
          sidebar.querySelectorAll('.pb-sidebar-content').forEach((content) => {
            content.hidden = content.dataset.content !== target;
          });
          syncSidebarRailLabel();
        });
      });
    }

    el.pbAddPage?.addEventListener('click', async () => {
      if (
        !ensureCleanWorkspace('Save or discard your current changes before creating a new page.')
      ) {
        return;
      }
      const slug = prompt('Enter page slug (e.g., reader, about, gallery):');
      if (!slug) return;
      const title = prompt(
        'Enter page title:',
        slug.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
      );
      if (title === null) return;

      const newPage = await createPageForSeries(slug.toLowerCase().trim(), title.trim());
      if (newPage) {
        await loadPages();
        currentPage = newPage;
        resetBuilderState();
        activeThemeDraft = normalizeThemeDraft(currentPage);
        renderPageList();
        renderCanvas();
        renderEditorPanel();
      }
    });

    el.pbSaveDraft?.addEventListener('click', async () => {
      await updatePublishState(false);
    });

    el.pbPublish?.addEventListener('click', async () => {
      await updatePublishState(true);
    });
  }

  function onSeriesChange() {
    currentPage = null;
    resetBuilderState();
    if (el.pageBuilderSection?.style.display !== 'none') {
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

import { el } from './dom.js';
import { openImagePicker } from './image-picker.js';
import { DEFAULT_SERIES_ID } from './state.js';
import { readFileAsBase64 } from './utils.js';
import { loadSeriesPageConfig } from './page-config.js';
import { MODULE_TYPES, THEME_COLORS } from './page-builder/constants.js';
import { createCanvasEventBinder } from './page-builder/canvas-events.js';
import { renderCanvasSnapshot } from './page-builder/canvas-renderer.js';
import { createEditorPanelRenderer } from './page-builder/editor-panel.js';
import { resolveAssetUrl } from './page-builder/helpers.js';
import {
  createEffectivePageHeader,
  createPageHeaderMeta,
  createDefaultHeaderConfig,
  normalizeHeaderCopy,
  normalizeHeaderConfig,
} from './page-builder/header-config.js';
import { normalizeHeaderNavItems } from './page-builder/link-utils.js';
import { createSidebarPanel } from './page-builder/sidebar-panel.js';
import {
  renderPreviewPage,
  initPreviewEmailForms,
  initPreviewPromoCarousels,
  setPreviewSeriesId,
} from './page-builder/preview-renderers.js';
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
  reorderPages,
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
    case 'gallery':
      const galleryCount = config.images?.length || 0;
      return galleryCount === 0 ? 'No images' : `${galleryCount} image${galleryCount > 1 ? 's' : ''}`;
    case 'video':
      return config.url || 'No video URL';
    case 'divider':
      return `${config.style === 'dashed' || config.style === 'dotted' ? (config.style.charAt(0).toUpperCase() + config.style.slice(1)) : 'Solid'} line`;
    case 'entry-gallery':
      return `Series entries (${config.columns || 3} cols)`;
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

function getReaderLinkLabel(page) {
  return page?.isPublished === false ? 'Open Draft Preview' : 'Open Reader';
}

function getReaderPreviewNote(page) {
  if (page?.isPublished === false) {
    return 'Draft page. Open Reader loads the draft preview until you publish changes.';
  }
  return 'Published page. Open Reader matches the public reader.';
}

function getReaderPreviewStatus(page) {
  return page?.isPublished === false ? 'warning' : 'neutral';
}

function createPageBuilder({ sanitizeSeriesId, getActiveSeriesId, hideAllSections, setActiveNav }) {
  let pages = [];
  let currentPage = null;
  let selectedModuleId = null;
  let selectedCanvasSurface = null;
  let activeEditorTab = 'modules';
  let editorResizeBound = false;
  let activeModuleDraftId = null;
  let activeModuleDraft = null;
  let activeThemeDraft = null;
  let activeHeaderDraft = null;
  let activePageSettingsDraft = null;
  let currentSeriesPageConfig = null;
  let activeSectionId = null;
  let activeSectionDraft = null;
  let dirtyScope = null;
  let editorStatus = { type: 'neutral', message: '' };
  let canvasStatus = { type: 'neutral', message: '' };
  let activeInsertTarget = null;
  let draggedModuleId = null;
  let draggedSectionId = null;
  /** @type {'edit'|'preview'} */
  let canvasMode = 'edit';
  /** @type {'desktop'|'tablet'|'mobile'} */
  let previewWidth = 'desktop';

  const renderEditorPanel = createEditorPanelRenderer({
    el,
    getState: () => ({
      currentPage,
      pages,
      activeEditorTab,
      selectedCanvasSurface,
      selectedModuleId,
      activeThemeDraft,
      activeHeaderDraft,
      activePageSettingsDraft,
      activeModuleDraft,
      activeModuleDraftId,
    }),
    actions: {
      ensureCleanWorkspace,
      initializeThemeDraft,
      initializeHeaderDraft,
      initializePageSettingsDraft,
      initializeModuleDraft,
      setActiveEditorTab: (nextTab) => {
        activeEditorTab = nextTab;
      },
      setActiveThemeDraft: (nextDraft) => {
        activeThemeDraft = cloneValue(nextDraft);
      },
      setActiveHeaderDraft: (nextDraft) => {
        activeHeaderDraft = cloneValue(nextDraft);
      },
      updateActivePageSettingsDraftField: (key, value) => {
        if (!activePageSettingsDraft) return;
        activePageSettingsDraft[key] = value;
        markDirty('page-settings');
        renderEditorPanel();
      },
      setActiveModuleDraft: (nextDraft) => {
        activeModuleDraft = cloneValue(nextDraft);
      },
      setActiveModuleDraftId: (nextDraftId) => {
        activeModuleDraftId = nextDraftId ?? null;
      },
      setSelectedModuleId: (nextModuleId) => {
        selectedModuleId = nextModuleId ?? null;
      },
      clearSelectedModuleState,
      removeModuleFromCurrentPage,
      markDirty,
      clearDirty,
      setEditorStatus,
      saveActiveThemeDraft,
      discardActiveThemeDraft,
      resetActiveThemeDraft,
      saveActiveHeaderDraft,
      discardActiveHeaderDraft,
      saveActivePageSettingsDraft,
      discardActivePageSettingsDraft,
      saveActiveModuleDraft,
      discardActiveModuleDraft,
      renderCanvas,
      updateEditorFooterUi,
    },
    helpers: {
      getSelectedModuleRecord,
      getPageDisplayTitle,
      getModuleLabel,
      getModulePreview,
    },
    deps: {
      openImagePicker,
      fetchAssets,
      uploadAssetFile,
      resolveAssetUrl,
      deleteModule,
    },
  });

  const bindCanvasEvents = createCanvasEventBinder({
    el,
    getState: () => ({
      currentPage,
      selectedModuleId,
      selectedCanvasSurface,
      activeSectionId,
      activeSectionDraft,
      dirtyScope,
      activeInsertTarget,
      draggedModuleId,
      draggedSectionId,
    }),
    actions: {
      insertSectionAt,
      reorderSectionToIndex,
      setDraggedSectionId: (sectionId) => {
        draggedSectionId = sectionId;
      },
      changeSectionLayout,
      toggleSectionSettings,
      updateActiveSectionDraftField,
      discardSectionSettings,
      saveSectionSettings,
      setDraggedModuleId: (moduleId) => {
        draggedModuleId = moduleId;
      },
      moveModuleToTarget,
      insertModuleAt,
      toggleModulePicker,
      selectPageHeaderFromCanvas,
      selectPageSettingsFromCanvas,
      selectModule,
      updateActivePageSettingsDraftField: (key, value) => {
        if (!activePageSettingsDraft) return;
        activePageSettingsDraft[key] = value;
        markDirty('page-settings');
        renderEditorPanel();
      },
      saveActivePageSettingsDraft,
      discardActivePageSettingsDraft,
      deleteModuleFromCanvas,
      deleteSectionFromCanvas,
    },
  });

  const { renderPageList, renderModulePalette, bindSidebarTabs } = createSidebarPanel({
    el,
    getState: () => ({
      currentPage,
      pages,
    }),
    actions: {
      selectPage,
      deletePage: deletePageFromSidebar,
      reorderSidebarPages,
      setDraggedModuleId: (moduleId) => {
        draggedModuleId = moduleId;
      },
      syncSidebarRailLabel,
    },
    helpers: {
      getPageDisplayTitle,
      renderPageStatusBadges,
    },
  });

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
    } else if (scope === 'header') {
      setEditorStatus('Unsaved header changes. Save or discard before switching.', 'warning');
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
            : footerScope === 'header'
              ? 'Header draft has unsaved changes.'
              : 'Module draft has unsaved changes.';
        type = 'warning';
      } else if (editorStatus.message) {
        message = editorStatus.message;
        type = editorStatus.type || 'neutral';
      } else {
        message =
          footerScope === 'theme'
            ? 'Theme changes save explicitly.'
            : footerScope === 'header'
              ? 'Header changes save explicitly.'
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

  function normalizeHeaderDraft(page = currentPage) {
    const effectiveHeader = createEffectivePageHeader(
      page,
      currentSeriesPageConfig,
      normalizeHeaderNavItems
    );
    return {
      header: normalizeHeaderConfig(effectiveHeader, normalizeHeaderNavItems),
      copy: normalizeHeaderCopy(effectiveHeader.copy, {
        title: page?.title || 'Page Title',
        subtitle: '',
        subtitles: [],
      }),
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

  function initializeHeaderDraft() {
    activeHeaderDraft = currentPage
      ? normalizeHeaderDraft(currentPage)
      : {
          header: createDefaultHeaderConfig(),
          copy: normalizeHeaderCopy(null, { title: 'Page Title', subtitle: '', subtitles: [] }),
        };
  }

  function initializePageSettingsDraft() {
    activePageSettingsDraft = currentPage ? {
      slug: currentPage.slug || '',
      title: currentPage.title || '',
      pageType: currentPage.pageType || '',
      isHomepage: currentPage.isHomepage || false,
    } : null;
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

  function clearSelectedModuleState() {
    selectedModuleId = null;
    activeModuleDraftId = null;
    activeModuleDraft = null;
  }

  function clearActiveSectionState() {
    activeSectionId = null;
    activeSectionDraft = null;
    clearDirty('section');
  }

  function removeModuleFromCurrentPage(moduleId) {
    for (const section of currentPage?.sections || []) {
      section.modules = (section.modules || []).filter((module) => module.id !== moduleId);
    }
  }

  function removeSectionFromCurrentPage(sectionId) {
    currentPage.sections = (currentPage.sections || []).filter((section) => section.id !== sectionId);
  }

  function resetBuilderState() {
    clearSelectedModuleState();
    selectedCanvasSurface = null;
    activeThemeDraft = currentPage ? normalizeThemeDraft(currentPage) : null;
    activeHeaderDraft = currentPage ? normalizeHeaderDraft(currentPage) : null;
    initializePageSettingsDraft();
    clearActiveSectionState();
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
      currentPage = {
        ...currentPage,
        ...page,
        meta: cloneValue(page.meta ?? currentPage?.meta ?? {}),
        sections: Array.isArray(page.sections)
          ? cloneValue(page.sections)
          : cloneValue(currentPage?.sections || []),
      };
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
      const nextMeta = buildNormalizedPageMeta(currentPage);
      const updated = await updatePage(currentPage.id, {
        title: currentPage.title,
        slug: currentPage.slug,
        pageType: currentPage.pageType,
        meta: nextMeta,
        isPublished,
      });
      if (!updated) {
        throw new Error('Failed to update page status');
      }

      syncPageSummary(updated);
      activeThemeDraft = normalizeThemeDraft(currentPage);
      activeHeaderDraft = normalizeHeaderDraft(updated);
      renderPageList();
      renderCanvas();
      renderEditorPanel();
      setEditorStatus(
        isPublished
          ? 'Page published. Open Reader now matches the public page.'
          : 'Draft saved. Open Reader now uses the draft preview until you publish.',
        isPublished ? 'success' : 'warning'
      );
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

  async function loadCurrentSeriesPageConfig() {
    const config = await loadSeriesPageConfig(getSeriesId(), {
      force: true,
      fallback: {},
    });
    currentSeriesPageConfig = config && typeof config === 'object' ? cloneValue(config) : {};
    if (!currentSeriesPageConfig.site || typeof currentSeriesPageConfig.site !== 'object') {
      currentSeriesPageConfig.site = {};
    }
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

  function sortCanvasModulesForColumn(section, columnIndex) {
    return sortModulesForColumn(section, columnIndex).filter((module) => module.moduleType !== 'header');
  }

  function getHiddenColumnModuleIds(section, columnIndex) {
    return sortModulesForColumn(section, columnIndex)
      .filter((module) => module.moduleType === 'header')
      .map((module) => module.id);
  }

  function buildColumnOrder(section, columnIndex, visibleModuleIds) {
    return [...getHiddenColumnModuleIds(section, columnIndex), ...visibleModuleIds];
  }

  function getVisibleSectionModuleCount(section) {
    return (section?.modules || []).filter((module) => module.moduleType !== 'header').length;
  }

  function buildNormalizedPageHeader(page = currentPage, draftState = activeHeaderDraft) {
    if (draftState?.header || draftState?.copy) {
      return createPageHeaderMeta(
        draftState?.header,
        draftState?.copy,
        normalizeHeaderNavItems,
        { page }
      );
    }
    return createEffectivePageHeader(page, currentSeriesPageConfig, normalizeHeaderNavItems);
  }

  function buildNormalizedPageMeta(page = currentPage, draftState = activeHeaderDraft) {
    const nextMeta = {
      ...(page?.meta || {}),
      header: cloneValue(buildNormalizedPageHeader(page, draftState)),
    };
    delete nextMeta.headerOverrides;
    return nextMeta;
  }

  async function insertModuleAt(sectionId, columnIndex, insertIndex, moduleType) {
    if (!currentPage) return;
    const section = getSectionRecord(sectionId);
    if (!section) return;

    const newModule = await addModuleWithDefault(sectionId, moduleType, columnIndex);
    if (!newModule) return;

    section.modules = section.modules || [];
    section.modules.push(newModule);

    const visibleOrderedIds = sortCanvasModulesForColumn(section, columnIndex)
      .map((module) => module.id)
      .filter((id) => id !== newModule.id);
    visibleOrderedIds.splice(insertIndex, 0, newModule.id);
    const orderedIds = buildColumnOrder(section, columnIndex, visibleOrderedIds);

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
    const targetVisibleIds = sortCanvasModulesForColumn(targetSection, targetColumnIndex)
      .map((module) => module.id)
      .filter((id) => id !== moduleId);
    targetVisibleIds.splice(insertIndex, 0, moduleId);
    const targetOrderedIds = buildColumnOrder(targetSection, targetColumnIndex, targetVisibleIds);

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

    const sourceVisibleIds = sortCanvasModulesForColumn(sourceSection, sourceColumnIndex).map(
      (module) => module.id
    );
    const sourceOrderedIds = buildColumnOrder(sourceSection, sourceColumnIndex, sourceVisibleIds);
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

  async function changeSectionLayout(sectionId, layout) {
    const updated = await updateSection(sectionId, { layout });
    if (updated) {
      const section = getSectionRecord(sectionId);
      if (section) section.layout = updated.layout || layout;
      renderCanvas();
    }
  }

  function toggleSectionSettings(sectionId) {
    if (activeSectionId === sectionId && dirtyScope !== 'section') {
      clearActiveSectionState();
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
  }

  function updateActiveSectionDraftField(key, rawValue) {
    if (!activeSectionDraft || !key) return;
    const raw = String(rawValue || '').trim();
    activeSectionDraft[key] = raw ? Math.max(0, Math.round(Number(raw) || 0)) : '';
    markDirty('section');
    renderCanvas();
  }

  function discardSectionSettings() {
    if (!activeSectionId) return;
    initializeSectionDraft(activeSectionId);
    clearDirty('section');
    setCanvasStatus('Section changes discarded.', 'neutral');
    renderCanvas();
  }

  async function saveSectionSettings() {
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
      return;
    }

    setCanvasStatus('Failed to save section settings.', 'danger');
    renderCanvas();
  }

  function toggleModulePicker(target) {
    const isSameTarget =
      activeInsertTarget &&
      activeInsertTarget.sectionId === target.sectionId &&
      activeInsertTarget.columnIndex === target.columnIndex &&
      activeInsertTarget.insertIndex === target.insertIndex;
    activeInsertTarget = isSameTarget ? null : target;
    renderCanvas();
  }

  function selectPageHeaderFromCanvas() {
    if (selectedCanvasSurface === 'page-header') return;
    if (
      !ensureCleanWorkspace(
        'Save or discard your current changes before switching to the page header.'
      )
    ) {
      renderEditorPanel();
      return;
    }

    clearSelectedModuleState();
    selectedCanvasSurface = 'page-header';
    activeEditorTab = 'modules';
    initializeHeaderDraft();
    setEditorStatus('', 'neutral');
    renderCanvas();
    renderEditorPanel();
  }

  function selectPageSettingsFromCanvas() {
    if (selectedCanvasSurface === 'page-settings') return;
    if (
      !ensureCleanWorkspace(
        'Save or discard your current changes before editing page settings.'
      )
    ) {
      renderEditorPanel();
      return;
    }

    clearSelectedModuleState();
    selectedCanvasSurface = 'page-settings';
    activeEditorTab = 'modules';
    initializePageSettingsDraft();
    setEditorStatus('', 'neutral');
    renderCanvas();
    renderEditorPanel();
  }

  function selectModule(moduleId) {
    if (selectedModuleId === moduleId) return;
    if (
      dirtyScope === 'module' ||
      dirtyScope === 'theme' ||
      dirtyScope === 'header' ||
      dirtyScope === 'section'
    ) {
      const sameModule = dirtyScope === 'module' && selectedModuleId === moduleId;
      if (!sameModule) {
        ensureCleanWorkspace('Save or discard your current changes before selecting another module.');
        return;
      }
    }

    selectedModuleId = moduleId;
    selectedCanvasSurface = null;
    activeEditorTab = 'modules';
    initializeModuleDraft(moduleId);
    setEditorStatus('', 'neutral');
    renderCanvas();
    renderEditorPanel();
  }

  async function deleteModuleFromCanvas(moduleId) {
    if (!confirm('Delete this module? This cannot be undone.')) return;
    if (selectedModuleId === moduleId && dirtyScope === 'module') {
      clearDirty('module');
    }

    if (await deleteModule(moduleId)) {
      removeModuleFromCurrentPage(moduleId);
      if (selectedModuleId === moduleId) {
        clearSelectedModuleState();
      }
      setCanvasStatus('Module deleted.', 'success');
      renderCanvas();
      renderEditorPanel();
    }
  }

  async function deleteSectionFromCanvas(sectionId) {
    if (!confirm('Delete this section and all its modules?')) return;

    if (await deleteSection(sectionId)) {
      removeSectionFromCurrentPage(sectionId);
      if (activeSectionId === sectionId) {
        clearActiveSectionState();
      }
      if (selectedModuleId && !getSelectedModuleRecord(selectedModuleId)) {
        clearDirty('module');
        clearSelectedModuleState();
      }
      setCanvasStatus('Section deleted.', 'success');
      renderCanvas();
      renderEditorPanel();
    }
  }

  function renderPreview() {
    if (!el.pbCanvas) return;

    const html = currentPage
      ? renderPreviewPage(currentPage)
      : '<div class="pb-canvas-empty"><p>Select a page to preview it.</p></div>';

    el.pbCanvas.dataset.mode = 'preview';
    el.pbCanvas.innerHTML = `
      <div class="pb-preview-frame" data-width="${previewWidth}">
        ${html}
      </div>
    `;

    const frame = el.pbCanvas.querySelector('.pb-preview-frame');
    if (frame) {
      initPreviewEmailForms(frame);
      initPreviewPromoCarousels(frame);
    }
  }

  function renderCanvas() {
    if (!el.pbCanvas) return;

    if (canvasMode === 'preview') {
      renderPreview();
      return;
    }

    el.pbCanvas.dataset.mode = 'edit';

    const { pageTitleHtml, canvasHtml } = renderCanvasSnapshot({
      state: {
        currentPage,
        currentSeriesPageConfig,
        selectedCanvasSurface,
        selectedModuleId,
        activeSectionId,
        activeSectionDraft,
        activeInsertTarget,
        dirtyScope,
        canvasStatus,
        activeHeaderDraft,
      },
      helpers: {
        sortSections,
        sortCanvasModulesForColumn,
        getVisibleSectionModuleCount,
        getPageDisplayTitle,
        renderPageStatusBadges,
        getReaderUrl,
        getReaderLinkLabel,
        getReaderPreviewStatus,
        getReaderPreviewNote,
        getModulePreview,
      },
    });

    if (el.pbPageTitle) {
      el.pbPageTitle.innerHTML = pageTitleHtml;
    }
    el.pbCanvas.innerHTML = canvasHtml;
    bindCanvasEvents();
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

  async function saveActiveHeaderDraft() {
    if (!currentPage || !activeHeaderDraft) return;

    try {
      const nextMeta = buildNormalizedPageMeta(currentPage, activeHeaderDraft);
      const updatedPage = await updatePage(currentPage.id, { meta: nextMeta });

      if (!updatedPage) {
        setEditorStatus('Failed to save the page header.', 'danger');
        renderEditorPanel();
        return;
      }

      syncPageSummary(updatedPage);
      activeHeaderDraft = normalizeHeaderDraft(updatedPage);
      clearDirty('header');
      setEditorStatus('Page header saved.', 'success');
      renderCanvas();
      renderEditorPanel();
    } catch (error) {
      console.error('saveActiveHeaderDraft error:', error);
      setEditorStatus('Failed to save the page header.', 'danger');
      renderEditorPanel();
    }
  }

  function discardActiveHeaderDraft() {
    activeHeaderDraft = normalizeHeaderDraft(currentPage);
    clearDirty('header');
    setEditorStatus('Page header changes discarded.', 'neutral');
    renderCanvas();
    renderEditorPanel();
  }

  async function saveActivePageSettingsDraft() {
    if (!currentPage || !activePageSettingsDraft) return;
    try {
      const updatedPage = await updatePage(currentPage.id, {
        slug: activePageSettingsDraft.slug,
        title: activePageSettingsDraft.title,
        pageType: activePageSettingsDraft.pageType,
        isHomepage: activePageSettingsDraft.isHomepage
      });

      if (!updatedPage) {
        setEditorStatus('Failed to save page settings.', 'danger');
        renderEditorPanel();
        return;
      }

      syncPageSummary(updatedPage);
      initializePageSettingsDraft();
      clearDirty('page-settings');
      setEditorStatus('Page settings saved.', 'success');
      renderPageList();
      renderCanvas();
      renderEditorPanel();
    } catch (error) {
      console.error('saveActivePageSettingsDraft error:', error);
      setEditorStatus('Failed to save page settings.', 'danger');
      renderEditorPanel();
    }
  }

  async function reorderSidebarPages(pageIdArray) {
    const originalPages = [...pages];
    pages.sort((a, b) => pageIdArray.indexOf(a.id) - pageIdArray.indexOf(b.id));
    renderPageList();
    
    const success = await reorderPages(getSeriesId(), pageIdArray);
    if (!success) {
      pages = originalPages;
      setEditorStatus('Failed to reorder pages.', 'danger');
      renderPageList();
    }
  }

  function discardActivePageSettingsDraft() {
    initializePageSettingsDraft();
    clearDirty('page-settings');
    setEditorStatus('Page settings discarded.', 'neutral');
    renderCanvas();
    renderEditorPanel();
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

  async function deletePageFromSidebar(pageId) {
    if (!ensureCleanWorkspace('Save or discard your current changes before deleting a page.')) {
      return;
    }
    if (!confirm('Delete this page? This cannot be undone.')) return;

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
    await loadCurrentSeriesPageConfig();
    renderPageList();
    renderModulePalette();
    renderCanvas();
    renderEditorPanel();
    applyEditorMode();
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
    bindSidebarTabs();

    const addPageModal = /** @type {HTMLElement|null} */ (document.getElementById('pbAddPageModal'));
    const addPageForm = /** @type {HTMLFormElement|null} */ (document.getElementById('pbAddPageForm'));
    const addPageSlugInput = /** @type {HTMLInputElement|null} */ (document.getElementById('pbPageSlugInput'));
    const addPageTitleInput = /** @type {HTMLInputElement|null} */ (document.getElementById('pbPageTitleInput'));

    if (addPageSlugInput && addPageTitleInput) {
      addPageSlugInput.addEventListener('input', () => {
        if (!addPageTitleInput.dataset.manual) {
          addPageTitleInput.value = addPageSlugInput.value
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());
        }
      });
      addPageTitleInput.addEventListener('input', () => {
        addPageTitleInput.dataset.manual = 'true';
      });
    }

    const closeAddPageModal = () => {
      if (addPageModal) {
        addPageModal.classList.remove('active');
      }
    };

    document.getElementById('pbAddPageClose')?.addEventListener('click', closeAddPageModal);
    document.getElementById('pbAddPageCancel')?.addEventListener('click', closeAddPageModal);

    el.pbAddPage?.addEventListener('click', () => {
      if (!ensureCleanWorkspace('Save or discard your current changes before creating a new page.')) {
        return;
      }
      if (addPageForm) {
        addPageForm.reset();
        addPageTitleInput?.removeAttribute('data-manual');
      }
      if (addPageModal) {
        addPageModal.classList.add('active');
        addPageSlugInput?.focus();
      }
    });

    addPageForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const slug = addPageSlugInput?.value.toLowerCase().trim();
      const title = addPageTitleInput?.value.trim();
      if (!slug || !title) return;

      const submitBtn = /** @type {HTMLButtonElement|null} */ (addPageForm.querySelector('button[type="submit"]'));
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating...'; }
      
      const newPage = await createPageForSeries(slug, title);
      try {
        if (newPage) {
          closeAddPageModal();
          await loadPages();
          currentPage = newPage;
          resetBuilderState();
          activeThemeDraft = normalizeThemeDraft(currentPage);
          renderPageList();
          renderCanvas();
          renderEditorPanel();
        }
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create Page'; }
      }
    });

    el.pbSaveDraft?.addEventListener('click', async () => {
      await updatePublishState(false);
    });

    el.pbPublish?.addEventListener('click', async () => {
      await updatePublishState(true);
    });

    // ── View toggle (Edit / Preview) ──────────────────────────────────────────
    if (el.pbViewToggles) {
      el.pbViewToggles.addEventListener('click', (e) => {
        const btn = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-view]'));
        if (!btn) return;
        const nextMode = btn.dataset.view;
        if (nextMode !== 'edit' && nextMode !== 'preview') return;
        if (nextMode === canvasMode) return;

        canvasMode = nextMode;

        // Sync active classes on the toggle buttons
        el.pbViewToggles.querySelectorAll('.pb-view-toggle').forEach((node) => {
          const b = /** @type {HTMLElement} */ (node);
          b.classList.toggle('pb-view-toggle--active', b.dataset.view === canvasMode);
        });

        // Show width toggles only in preview mode
        if (el.pbWidthToggles) {
          el.pbWidthToggles.hidden = canvasMode !== 'preview';
        }

        // Set data-canvas-mode on the layout grid so CSS collapses sidebar + editor
        const layout = /** @type {HTMLElement|null} */ (document.querySelector('.page-builder-layout'));
        if (layout) {
          if (canvasMode === 'preview') {
            layout.dataset.canvasMode = 'preview';
          } else {
            delete layout.dataset.canvasMode;
            // Restore sidebar/editor to their persisted state
            applyEditorMode();
          }
        }

        renderCanvas();
      });
    }

    // ── Width toggle (Desktop / Tablet / Mobile) ──────────────────────────────
    if (el.pbWidthToggles) {
      el.pbWidthToggles.addEventListener('click', (e) => {
        const btn = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-width]'));
        if (!btn) return;
        const nextWidth = btn.dataset.width;
        if (nextWidth !== 'desktop' && nextWidth !== 'tablet' && nextWidth !== 'mobile') return;
        if (nextWidth === previewWidth) return;

        previewWidth = nextWidth;

        el.pbWidthToggles.querySelectorAll('.pb-width-toggle').forEach((node) => {
          const b = /** @type {HTMLElement} */ (node);
          b.classList.toggle('pb-width-toggle--active', b.dataset.width === previewWidth);
        });

        // Update existing preview frame in-place (no full re-render needed)
        const frame = /** @type {HTMLElement|null} */ (el.pbCanvas?.querySelector('.pb-preview-frame'));
        if (frame) {
          frame.dataset.width = previewWidth;
        }
      });
    }
  }

  function onSeriesChange() {
    currentPage = null;
    currentSeriesPageConfig = null;
    resetBuilderState();
    setPreviewSeriesId(getSeriesId());
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

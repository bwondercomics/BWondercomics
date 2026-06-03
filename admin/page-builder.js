import { el } from './dom.js';
import { openImagePicker } from './image-picker.js';
import { DEFAULT_SERIES_ID } from './state.js';
import { readFileAsBase64 } from './utils.js';
import { createCanvasEventBinder } from './page-builder/canvas-events.js';
import { createCanvasMutations } from './page-builder/canvas-mutations.js';
import { renderCanvasSnapshot } from './page-builder/canvas-renderer.js';
import { createDraftManager } from './page-builder/draft-manager.js';
import { createEditorPanelRenderer } from './page-builder/editor-panel.js';
import {
  cloneValue,
  getDefaultConfig,
  getModuleLabel,
  getModulePreview,
  getPageDisplayTitle,
  getReaderLinkLabel,
  getReaderPreviewNote,
  getReaderPreviewStatus,
  renderPageStatusBadges,
  resolveAssetUrl,
} from './page-builder/helpers.js';
import { createEffectivePageHeader, createPageHeaderMeta } from './page-builder/header-config.js';
import {
  SIDEBAR_MODE_KEY,
  getEditorWidth,
  getEffectiveSidebarMode,
  getSidebarWidth,
  getViewportEditorBand,
} from './page-builder/layout.js';
import { normalizeHeaderNavItems } from './page-builder/link-utils.js';
import { createPageActions } from './page-builder/page-actions.js';
import { createPreviewManager } from './page-builder/preview-manager.js';
import { createSidebarPanel } from './page-builder/sidebar-panel.js';
import {
  BUILDER_STRUCTURAL_COMMANDS,
  createStructuralCommandAdapter,
} from './page-builder/structural-commands.js';
import { BUILDER_DEVICE_ORDER } from './page-builder/preview-contract.js';
import {
  isSectionResponsiveField,
  pruneEmptyResponsiveOverrides,
  setResponsiveOverrideValue,
} from './page-builder/responsive-overrides.js';
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

function createPageBuilder({
  sanitizeSeriesId,
  getActiveSeriesId,
  hideAllSections,
  setActiveNav,
  onDesignerRouteChange,
  onExitBuilder,
}) {
  let pages = [];
  let currentPage = null;
  let selectedModuleId = null;
  let selectedCanvasSurface = null;
  let activeEditorTab = 'modules';
  let activeSidePanelTab = 'pages';
  let editorResizeBound = false;
  let activeModuleDraftId = null;
  let activeModuleDraft = null;
  let activeThemeDraft = null;
  let activeHeaderDraft = null;
  let activePageSettingsDraft = null;
  let activeSectionId = null;
  let activeSectionDraft = null;
  let dirtyScope = null;
  let editorStatus = { type: 'neutral', message: '' };
  let canvasStatus = { type: 'neutral', message: '' };
  let activeInsertTarget = null;
  let draggedModuleId = null;
  let draggedSectionId = null;
  let liveDragState = null;
  /** @type {'edit'|'preview'} */
  let canvasMode = 'preview';
  /** @type {'desktop'|'tablet'|'mobile'} */
  let activeDeviceId = BUILDER_DEVICE_ORDER[0];
  /** @type {'global'|'device'} */
  let responsiveEditScope = 'global';
  /** @type {'builder'|'designer'} */
  let activeEntrypoint = 'builder';
  /** @type {''|'header'} */
  let activeDesignerSurface = '';
  let structuralCommands = null;

  function runStructuralCommand(commandId, payload = {}) {
    if (!structuralCommands) return { ok: false, status: 'Structural commands unavailable.' };
    return structuralCommands.runCommand(commandId, payload);
  }

  const draftManager = createDraftManager({
    getState: () => ({
      currentPage,
      selectedModuleId,
      activeModuleDraft,
      activeThemeDraft,
      activeHeaderDraft,
      activePageSettingsDraft,
    }),
    actions: {
      getSelectedModuleRecord,
      getSectionRecord,
      syncPageSummary,
      buildNormalizedPageMeta,
      clearDirty,
      markDirty,
      setEditorStatus,
      setSelectedModuleId: (nextModuleId) => {
        selectedModuleId = nextModuleId ?? null;
      },
      setActiveModuleDraftId: (nextDraftId) => {
        activeModuleDraftId = nextDraftId ?? null;
      },
      setActiveModuleDraft: (nextDraft) => {
        activeModuleDraft = cloneValue(nextDraft);
      },
      setActiveThemeDraft: (nextDraft) => {
        activeThemeDraft = cloneValue(nextDraft);
      },
      setActiveHeaderDraft: (nextDraft) => {
        activeHeaderDraft = cloneValue(nextDraft);
      },
      setActivePageSettingsDraft: (nextDraft) => {
        activePageSettingsDraft = cloneValue(nextDraft);
      },
      setActiveSectionId: (sectionId) => {
        activeSectionId = sectionId ?? null;
      },
      setActiveSectionDraft: (nextDraft) => {
        activeSectionDraft = cloneValue(nextDraft);
      },
      renderCanvas: () => renderCanvas(),
      renderEditorPanel: () => renderEditorPanel(),
      renderPageList: () => renderPageList(),
      syncDesignerRoute: (mode) => syncDesignerRoute(mode),
    },
    deps: {
      updateModule,
      updatePage,
    },
  });

  const renderEditorPanel = createEditorPanelRenderer({
    el,
    getState: () => ({
      currentPage,
      pages,
      activeEditorTab,
      activeSidePanelTab,
      selectedCanvasSurface,
      selectedModuleId,
      activeThemeDraft,
      activeHeaderDraft,
      activePageSettingsDraft,
      activeModuleDraft,
      activeModuleDraftId,
      activeSectionId,
      activeSectionDraft,
      activeDeviceId,
      previewWidth: activeDeviceId,
      responsiveEditScope,
      dirtyScope,
    }),
    actions: {
      ensureCleanWorkspace,
      initializeThemeDraft: draftManager.initializeThemeDraft,
      initializeHeaderDraft: draftManager.initializeHeaderDraft,
      initializePageSettingsDraft: draftManager.initializePageSettingsDraft,
      initializeModuleDraft: draftManager.initializeModuleDraft,
      setActiveEditorTab: (nextTab) => {
        activeEditorTab = nextTab;
      },
      setResponsiveEditScope: (nextScope) => {
        responsiveEditScope = nextScope === 'device' ? 'device' : 'global';
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
      updateActiveSectionDraftField,
      setActiveModuleDraft: (nextDraft) => {
        activeModuleDraft = cloneValue(nextDraft);
      },
      setActiveModuleDraftId: (nextDraftId) => {
        activeModuleDraftId = nextDraftId ?? null;
      },
      setSelectedModuleId: (nextModuleId) => {
        selectedModuleId = nextModuleId ?? null;
      },
      clearSelectedModuleState: draftManager.clearSelectedModuleState,
      removeModuleFromCurrentPage,
      markDirty,
      clearDirty,
      setEditorStatus,
      saveActiveThemeDraft: draftManager.saveActiveThemeDraft,
      discardActiveThemeDraft: draftManager.discardActiveThemeDraft,
      resetActiveThemeDraft: draftManager.resetActiveThemeDraft,
      saveActiveHeaderDraft: draftManager.saveActiveHeaderDraft,
      discardActiveHeaderDraft: draftManager.discardActiveHeaderDraft,
      saveActivePageSettingsDraft: draftManager.saveActivePageSettingsDraft,
      discardActivePageSettingsDraft: draftManager.discardActivePageSettingsDraft,
      saveActiveModuleDraft: draftManager.saveActiveModuleDraft,
      discardActiveModuleDraft: draftManager.discardActiveModuleDraft,
      saveSectionSettings,
      discardSectionSettings,
      renderCanvas,
      updateEditorFooterUi,
    },
    helpers: {
      getSelectedModuleRecord,
      getSectionRecord,
      getPageDisplayTitle,
      getModuleLabel,
      getModulePreview,
    },
    deps: {
      openImagePicker,
      fetchAssets,
      uploadAssetFile: (file) => pageActions.uploadAssetFile(file),
      resolveAssetUrl,
      deleteModule,
    },
  });

  const canvasMutations = createCanvasMutations({
    getState: () => ({
      currentPage,
    }),
    actions: {
      setActiveInsertTarget: (target) => {
        activeInsertTarget = target;
      },
      setCanvasStatus,
      renderCanvas: () => renderCanvas(),
    },
    deps: {
      addModule,
      moveModule,
      reorderModules,
      addSection,
      reorderSections,
      updateSection,
    },
    helpers: {
      getDefaultConfig,
      getModuleLabel,
      sortSections,
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
      insertSectionAt: (insertIndex) =>
        runStructuralCommand(BUILDER_STRUCTURAL_COMMANDS.INSERT_SECTION, {
          sectionIndex: insertIndex,
        }),
      reorderSectionToIndex: (sectionId, insertIndex) =>
        runStructuralCommand(BUILDER_STRUCTURAL_COMMANDS.MOVE_SECTION, {
          sectionId,
          placement: { sectionIndex: insertIndex },
        }),
      setDraggedSectionId: (sectionId) => {
        draggedSectionId = sectionId;
      },
      changeSectionLayout: canvasMutations.changeSectionLayout,
      toggleSectionSettings,
      updateActiveSectionDraftField,
      discardSectionSettings,
      saveSectionSettings,
      setDraggedModuleId: (moduleId) => {
        draggedModuleId = moduleId;
      },
      moveModuleToTarget: (moduleId, sectionId, columnIndex, insertIndex) =>
        runStructuralCommand(BUILDER_STRUCTURAL_COMMANDS.MOVE, {
          moduleId,
          placement: { sectionId, columnIndex, insertIndex },
        }),
      insertModuleAt: (sectionId, columnIndex, insertIndex, moduleType) =>
        runStructuralCommand(BUILDER_STRUCTURAL_COMMANDS.INSERT, {
          moduleType,
          placement: { sectionId, columnIndex, insertIndex },
        }),
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
      saveActivePageSettingsDraft: draftManager.saveActivePageSettingsDraft,
      discardActivePageSettingsDraft: draftManager.discardActivePageSettingsDraft,
      deleteModuleFromCanvas: (moduleId) =>
        runStructuralCommand(BUILDER_STRUCTURAL_COMMANDS.DELETE_SELECTED, {
          target: { kind: 'module', moduleId },
        }),
      deleteSectionFromCanvas: (sectionId) =>
        runStructuralCommand(BUILDER_STRUCTURAL_COMMANDS.DELETE_SELECTED, {
          target: { kind: 'section', sectionId },
        }),
    },
  });

  const { renderPageList, renderLayerTree, renderModulePalette, bindSidebarTabs } =
    createSidebarPanel({
      el,
      getState: () => ({
        currentPage,
        pages,
        activeSectionId,
        selectedCanvasSurface,
        selectedModuleId,
        selectedTarget: getSelectedTarget(),
        activeInsertTarget,
        liveDragState,
      }),
      actions: {
        selectPage: (pageId) => pageActions.selectPage(pageId),
        deletePage: (pageId) => pageActions.deletePageFromSidebar(pageId),
        reorderSidebarPages: (pageIds) => pageActions.reorderSidebarPages(pageIds),
        setDraggedModuleId: (moduleId) => {
          draggedModuleId = moduleId;
        },
        runStructuralCommand,
        selectPageHeader: () => {
          selectPageHeaderFromCanvas();
          showSidePanelTab('settings');
        },
        selectPageSettings: () => {
          selectPageSettingsFromCanvas();
          showSidePanelTab('settings');
        },
        selectModule: (moduleId) => {
          selectModule(moduleId);
          showSidePanelTab('settings');
        },
        selectSection: (sectionId) => {
          selectSectionFromCanvas(sectionId);
          showSidePanelTab('settings');
        },
        selectColumn: (sectionId) => {
          selectSectionFromCanvas(sectionId);
          showSidePanelTab('settings');
        },
        selectInspectorTab: (nextTab) => selectInspectorTab(nextTab),
        setActiveSidePanelTab: (nextTab) => {
          activeSidePanelTab = nextTab || activeSidePanelTab;
        },
        syncSidebarRailLabel,
      },
      helpers: {
        getPageDisplayTitle,
        getModuleLabel,
        renderPageStatusBadges,
      },
    });

  const pageActions = createPageActions({
    el,
    getState: () => ({
      currentPage,
      pages,
      activeDesignerSurface,
    }),
    actions: {
      getSeriesId,
      isDesignerMode,
      ensureCleanWorkspace,
      buildNormalizedPageMeta,
      syncPageSummary,
      resetBuilderState,
      activateHeaderSurface,
      getDefaultDesignerPage,
      normalizeThemeDraft: draftManager.normalizeThemeDraft,
      normalizeHeaderDraft: draftManager.normalizeHeaderDraft,
      initializePageSettingsDraft: draftManager.initializePageSettingsDraft,
      setPages: (nextPages) => {
        pages = nextPages;
      },
      setCurrentPage: (nextPage) => {
        currentPage = nextPage;
      },
      setActiveThemeDraft: (nextDraft) => {
        activeThemeDraft = cloneValue(nextDraft);
      },
      setActiveHeaderDraft: (nextDraft) => {
        activeHeaderDraft = cloneValue(nextDraft);
      },
      setSelectedCanvasSurface: (surface) => {
        selectedCanvasSurface = surface;
      },
      setActiveEditorTab: (nextTab) => {
        activeEditorTab = nextTab;
      },
      setEditorStatus,
      renderPageList: () => renderPageList(),
      renderCanvas: () => renderCanvas(),
      renderEditorPanel: () => renderEditorPanel(),
      syncDesignerRoute: (mode) => syncDesignerRoute(mode),
    },
    deps: {
      fetchPages,
      fetchPage,
      createPage,
      deletePage,
      updatePage,
      uploadAsset,
      reorderPages,
      readFileAsBase64,
    },
  });

  const previewManager = createPreviewManager({
    el,
    getState: () => ({
      currentPage,
      dirtyScope,
      activeModuleDraftId,
      selectedModuleId,
      activeModuleDraft,
      activeThemeDraft,
      activeHeaderDraft,
      activePageSettingsDraft,
      activeSectionId,
      activeSectionDraft,
      activeDeviceId,
      previewWidth: activeDeviceId,
      liveDragState,
    }),
    actions: {
      buildNormalizedPageMeta,
      buildSectionSettingsFromDraft,
      setActiveDeviceId: (nextDeviceId) => {
        activeDeviceId = nextDeviceId;
      },
      setPreviewWidth: (nextWidth) => {
        activeDeviceId = nextWidth;
      },
      selectCanvasTarget,
      renderEditorPanel: () => renderEditorPanel(),
      runStructuralCommand,
    },
    deps: {
      getSeriesId,
    },
  });

  structuralCommands = createStructuralCommandAdapter({
    getState: () => ({
      currentPage,
      selectedTarget: getSelectedTarget(),
      activeInsertTarget,
      liveDragState,
    }),
    actions: {
      ensureCleanWorkspace,
      setLiveDragState: (nextState) => {
        liveDragState = nextState ? cloneValue(nextState) : null;
        previewManager.renderTargetOverlay?.();
      },
      clearLiveDragState: () => {
        liveDragState = null;
        previewManager.renderTargetOverlay?.();
      },
      setActiveInsertTarget: (target) => {
        activeInsertTarget = target ? cloneValue(target) : null;
      },
      createPendingInsertTarget,
      setCanvasStatus,
      insertModuleAt: canvasMutations.insertModuleAt,
      moveModuleToTarget: canvasMutations.moveModuleToTarget,
      insertSectionAt: canvasMutations.insertSectionAt,
      reorderSectionToIndex: canvasMutations.reorderSectionToIndex,
      deleteModuleFromCanvas,
      deleteSectionFromCanvas,
      hideModuleOnCurrentDevice,
      selectModule,
      selectSection: selectSectionFromCanvas,
      showSidePanelTab,
      requestFreshTargets: () => previewManager.requestTargetRefresh?.(),
    },
    helpers: {
      getModuleLabel,
      getSectionCount: () => sortSections(currentPage?.sections || []).length,
    },
  });

  function getSeriesId() {
    return sanitizeSeriesId(getActiveSeriesId()) || DEFAULT_SERIES_ID;
  }

  function isDesignerMode() {
    return activeEntrypoint === 'designer';
  }

  function syncDesignerRoute(mode = 'replace') {
    if (!isDesignerMode() || typeof onDesignerRouteChange !== 'function') return;
    onDesignerRouteChange(
      {
        pageSlug: currentPage?.slug || '',
        surface: activeDesignerSurface || 'header',
      },
      mode
    );
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

  function getSelectedTarget() {
    const pageId = currentPage?.id || null;
    if (!pageId) return null;
    if (selectedCanvasSurface === 'page-header') {
      return { kind: 'header', pageId };
    }
    if (selectedCanvasSurface === 'page-settings') {
      return { kind: 'page', pageId };
    }
    if (selectedCanvasSurface === 'section' && activeSectionId) {
      return { kind: 'section', pageId, sectionId: activeSectionId };
    }
    const selectedModule = getSelectedModuleRecord(selectedModuleId);
    if (selectedModule) {
      const section = (currentPage.sections || []).find((item) =>
        (item.modules || []).some((module) => module.id === selectedModule.id)
      );
      return {
        kind: 'module',
        pageId,
        sectionId: section?.id || null,
        moduleId: selectedModule.id,
      };
    }
    return { kind: 'page', pageId };
  }

  function syncSidebarRailLabel() {
    if (!el.pbSidebarRailLabel) return;
    const activeTab = document.querySelector('.page-builder-sidebar .pb-sidebar-tab.active');
    el.pbSidebarRailLabel.textContent = activeTab?.textContent?.trim() || 'Pages';
  }

  function showSidePanelTab(tabName = 'settings') {
    const sidebar = document.querySelector('.page-builder-sidebar');
    if (!sidebar) return;
    const targetTab = sidebar.querySelector(`.pb-sidebar-tab[data-tab="${tabName}"]`);
    const contentTarget = tabName === 'settings' || tabName === 'styles' ? 'inspector' : tabName;
    if (!targetTab) return;

    activeSidePanelTab = tabName;
    sidebar
      .querySelectorAll('.pb-sidebar-tab')
      .forEach((button) => button.classList.toggle('active', button === targetTab));
    sidebar.querySelectorAll('.pb-sidebar-content').forEach((content) => {
      content.hidden = content.dataset.content !== contentTarget;
    });
    syncSidebarRailLabel();
  }

  function selectInspectorTab(nextTab) {
    if (nextTab === activeEditorTab) return true;
    if (
      !ensureCleanWorkspace('Save or discard your current changes before switching inspector tabs.')
    ) {
      renderEditorPanel();
      return false;
    }

    activeEditorTab = nextTab === 'theme' ? 'theme' : 'modules';
    if (activeEditorTab === 'theme') {
      draftManager.initializeThemeDraft();
    } else if (selectedCanvasSurface === 'page-header') {
      draftManager.initializeHeaderDraft();
    } else if (selectedCanvasSurface === 'page-settings') {
      draftManager.initializePageSettingsDraft();
    } else if (selectedModuleId) {
      draftManager.initializeModuleDraft(selectedModuleId);
    }
    setEditorStatus('', 'neutral');
    renderEditorPanel();
    return true;
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
    refreshLiveCanvasForDraftChange();
  }

  function markDirty(scope) {
    dirtyScope = scope;
    if (scope === 'module') {
      setEditorStatus('Unsaved module changes. Save or discard before switching.', 'warning');
    } else if (scope === 'header') {
      setEditorStatus('Unsaved header changes. Save or discard before switching.', 'warning');
    } else if (scope === 'theme') {
      setEditorStatus('Unsaved theme changes. Save or discard before switching.', 'warning');
    } else if (scope === 'page-settings') {
      setEditorStatus('Unsaved page settings. Save or discard before switching.', 'warning');
    } else if (scope === 'section') {
      setCanvasStatus('Unsaved section settings. Save or discard before switching.', 'warning');
    }
    updateEditorFooterUi();
    refreshLiveCanvasForDraftChange();
  }

  function refreshLiveCanvasForDraftChange() {
    if (canvasMode !== 'preview' || !el.pbCanvas) return;
    renderCanvas();
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
      const cleanMessages = {
        theme: 'Theme changes save explicitly.',
        header: 'Header changes save explicitly.',
        'page-settings': 'Page settings save explicitly.',
        section: 'Section spacing saves explicitly.',
        module: 'Module changes save explicitly.',
      };
      const dirtyMessages = {
        theme: 'Theme draft has unsaved changes.',
        header: 'Header draft has unsaved changes.',
        'page-settings': 'Page settings have unsaved changes.',
        section: 'Section settings have unsaved changes.',
        module: 'Module draft has unsaved changes.',
      };
      if (isDirty) {
        message = dirtyMessages[footerScope] || dirtyMessages.module;
        type = 'warning';
      } else if (editorStatus.message) {
        message = editorStatus.message;
        type = editorStatus.type || 'neutral';
      } else {
        message = cleanMessages[footerScope] || cleanMessages.module;
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

  function removeModuleFromCurrentPage(moduleId) {
    for (const section of currentPage?.sections || []) {
      section.modules = (section.modules || []).filter((module) => module.id !== moduleId);
    }
  }

  function removeSectionFromCurrentPage(sectionId) {
    currentPage.sections = (currentPage.sections || []).filter(
      (section) => section.id !== sectionId
    );
  }

  function resetBuilderState() {
    draftManager.clearSelectedModuleState();
    selectedCanvasSurface = null;
    activeSidePanelTab = 'pages';
    activeThemeDraft = currentPage ? draftManager.normalizeThemeDraft(currentPage) : null;
    activeHeaderDraft = currentPage ? draftManager.normalizeHeaderDraft(currentPage) : null;
    draftManager.initializePageSettingsDraft();
    draftManager.clearActiveSectionState();
    dirtyScope = null;
    editorStatus = { type: 'neutral', message: '' };
    canvasStatus = { type: 'neutral', message: '' };
    activeInsertTarget = null;
    draggedModuleId = null;
    draggedSectionId = null;
    liveDragState = null;
  }

  function getDefaultDesignerPage(pageSlug = '') {
    const requestedSlug = String(pageSlug || '')
      .trim()
      .toLowerCase();
    const requested = requestedSlug
      ? pages.find(
          (page) =>
            String(page?.slug || '')
              .trim()
              .toLowerCase() === requestedSlug
        )
      : null;
    if (requested) return requested;
    return (
      pages.find((page) => page?.slug === 'reader') ||
      pages.find((page) => page?.isHomepage) ||
      pages[0] ||
      null
    );
  }

  function activateHeaderSurface() {
    draftManager.clearSelectedModuleState();
    selectedCanvasSurface = 'page-header';
    activeEditorTab = 'modules';
    draftManager.initializeHeaderDraft();
    setEditorStatus('', 'neutral');
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

  function sortSections(sections = []) {
    return sections.slice().sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
  }

  function sortModulesForColumn(section, columnIndex) {
    return (section?.modules || [])
      .filter(
        (module) =>
          module.moduleType !== 'header' && (Number(module.columnIndex) || 0) === columnIndex
      )
      .slice()
      .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
  }

  function getModuleLocation(moduleId) {
    for (const section of currentPage?.sections || []) {
      const module = (section.modules || []).find((item) => item.id === moduleId);
      if (module) return { section, module };
    }
    return null;
  }

  function createPendingInsertTarget(target, position = 'after') {
    if (target?.kind !== 'module' || !target.moduleId) return null;
    const location = getModuleLocation(target.moduleId);
    if (!location) return null;
    const columnIndex = Number(location.module.columnIndex) || 0;
    const modules = sortModulesForColumn(location.section, columnIndex);
    const moduleIndex = modules.findIndex((module) => module.id === target.moduleId);
    if (moduleIndex < 0) return null;
    return {
      sectionId: location.section.id,
      columnIndex,
      insertIndex: moduleIndex + (position === 'before' ? 0 : 1),
      placement: position === 'before' ? 'before' : 'after',
    };
  }

  async function hideModuleOnCurrentDevice(moduleId) {
    const module = getSelectedModuleRecord(moduleId);
    if (!module) return false;
    const nextConfig = cloneValue(module.config || {}) || {};
    setResponsiveOverrideValue(nextConfig, activeDeviceId, 'hidden', true);
    nextConfig.responsive = pruneEmptyResponsiveOverrides(nextConfig.responsive);
    if (!Object.keys(nextConfig.responsive || {}).length) {
      delete nextConfig.responsive;
    }
    const updated = await updateModule(moduleId, { config: nextConfig });
    if (!updated) {
      setCanvasStatus('Failed to hide module for this device.', 'danger');
      renderCanvas();
      return false;
    }
    module.config = updated.config || nextConfig;
    if (selectedModuleId === moduleId) {
      draftManager.initializeModuleDraft(moduleId);
    }
    setCanvasStatus('Module hidden on current device.', 'success');
    renderCanvas();
    renderEditorPanel();
    return true;
  }

  function applyEditorMode() {
    const layout = document.querySelector('.page-builder-layout');
    if (!layout) return;

    const band = getViewportEditorBand();
    const sidebarMode = getEffectiveSidebarMode();
    const sidebarCollapsed = sidebarMode === 'collapsed';
    const sidebarLabel = sidebarCollapsed ? '\u276F' : '\u276E';
    const sidebarActionLabel = sidebarCollapsed ? 'Expand' : 'Collapse';

    layout.dataset.editorMode = 'side-panel';
    layout.dataset.viewportBand = band;
    layout.dataset.sidebarMode = sidebarMode;
    layout.style.setProperty('--pb-sidebar-width', getSidebarWidth(sidebarMode));
    layout.style.setProperty('--pb-editor-width', getEditorWidth('collapsed', sidebarMode, false));
    syncSidebarRailLabel();

    if (el.pbToggleEditor) {
      el.pbToggleEditor.textContent = sidebarLabel;
      el.pbToggleEditor.setAttribute('aria-expanded', String(!sidebarCollapsed));
      el.pbToggleEditor.setAttribute('aria-label', `${sidebarActionLabel} side panel`);
      el.pbToggleEditor.dataset.mode = sidebarMode;
      el.pbToggleEditor.dataset.viewportBand = band;
      el.pbToggleEditor.hidden = band === 'stacked';
    }

    if (el.pbToggleSidebar) {
      el.pbToggleSidebar.textContent = sidebarCollapsed ? 'Show Panel' : 'Hide Panel';
      el.pbToggleSidebar.setAttribute('aria-expanded', String(!sidebarCollapsed));
      el.pbToggleSidebar.setAttribute('aria-label', `${sidebarActionLabel} side panel`);
      el.pbToggleSidebar.hidden = false;
      el.pbToggleSidebar.dataset.mode = sidebarMode;
      el.pbToggleSidebar.dataset.viewportBand = band;
    }
  }

  function toggleEditorMode() {
    toggleSidebarMode();
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

  function buildNormalizedPageHeader(page = currentPage, draftState = activeHeaderDraft) {
    if (draftState?.header || draftState?.copy) {
      return createPageHeaderMeta(draftState?.header, draftState?.copy, normalizeHeaderNavItems, {
        page,
      });
    }
    return createEffectivePageHeader(page, null, normalizeHeaderNavItems);
  }

  function buildNormalizedPageMeta(page = currentPage, draftState = activeHeaderDraft) {
    const responsive = pruneEmptyResponsiveOverrides(
      draftState && Object.prototype.hasOwnProperty.call(draftState, 'responsive')
        ? draftState.responsive
        : (page?.meta?.responsive ?? {})
    );
    const nextMeta = {
      ...(page?.meta || {}),
      header: cloneValue(buildNormalizedPageHeader(page, draftState)),
    };
    if (Object.keys(responsive).length) {
      nextMeta.responsive = responsive;
    } else {
      delete nextMeta.responsive;
    }
    delete nextMeta.headerOverrides;
    return nextMeta;
  }

  function buildSectionSettingsFromDraft(draft = activeSectionDraft) {
    const settings = cloneValue(draft || {}) || {};
    ['moduleGap', 'columnGap', 'sectionGap', 'paddingTop', 'paddingBottom'].forEach((key) => {
      const value = settings?.[key];
      if (value !== '' && value !== null && value !== undefined) {
        settings[key] = value;
      } else {
        delete settings[key];
      }
    });
    if (!settings.backgroundColor) {
      delete settings.backgroundColor;
    }
    settings.responsive = pruneEmptyResponsiveOverrides(settings.responsive);
    if (!Object.keys(settings.responsive).length) {
      delete settings.responsive;
    }
    return settings;
  }

  function toggleSectionSettings(sectionId) {
    if (activeSectionId === sectionId && dirtyScope !== 'section') {
      draftManager.clearActiveSectionState();
      selectedCanvasSurface = null;
      setCanvasStatus('', 'neutral');
      renderCanvas();
      renderEditorPanel();
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

    draftManager.clearSelectedModuleState();
    selectedCanvasSurface = 'section';
    activeEditorTab = 'modules';
    draftManager.initializeSectionDraft(sectionId);
    setCanvasStatus('', 'neutral');
    renderCanvas();
    renderEditorPanel();
  }

  function updateActiveSectionDraftField(key, rawValue) {
    if (!activeSectionDraft || !key) return;
    const raw = String(rawValue ?? '').trim();
    let value = raw;
    if (['moduleGap', 'columnGap', 'sectionGap', 'paddingTop', 'paddingBottom'].includes(key)) {
      value = raw ? Math.max(0, Math.round(Number(raw) || 0)) : '';
    }
    if (responsiveEditScope === 'device' && isSectionResponsiveField(key)) {
      setResponsiveOverrideValue(activeSectionDraft, activeDeviceId, key, value);
    } else if (key !== 'layout') {
      activeSectionDraft[key] = value;
    }
    markDirty('section');
    renderCanvas();
    renderEditorPanel();
  }

  function discardSectionSettings() {
    if (!activeSectionId) return;
    draftManager.initializeSectionDraft(activeSectionId);
    clearDirty('section');
    setCanvasStatus('Section changes discarded.', 'neutral');
    renderCanvas();
  }

  async function saveSectionSettings() {
    if (!activeSectionId || !activeSectionDraft) return;

    const section = getSectionRecord(activeSectionId);
    if (!section) return;

    const settings = buildSectionSettingsFromDraft(activeSectionDraft);

    const updated = await updateSection(activeSectionId, { settings });
    if (updated) {
      section.settings = updated.settings || settings;
      draftManager.initializeSectionDraft(activeSectionId);
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
    if (selectedCanvasSurface === 'page-header') return true;
    if (
      !ensureCleanWorkspace(
        'Save or discard your current changes before switching to the page header.'
      )
    ) {
      renderEditorPanel();
      return false;
    }

    draftManager.clearSelectedModuleState();
    draftManager.clearActiveSectionState();
    activateHeaderSurface();
    renderCanvas();
    renderEditorPanel();
    syncDesignerRoute('replace');
    return true;
  }

  function selectPageSettingsFromCanvas() {
    if (selectedCanvasSurface === 'page-settings') return true;
    if (
      !ensureCleanWorkspace('Save or discard your current changes before editing page settings.')
    ) {
      renderEditorPanel();
      return false;
    }

    draftManager.clearSelectedModuleState();
    draftManager.clearActiveSectionState();
    selectedCanvasSurface = 'page-settings';
    activeEditorTab = 'modules';
    draftManager.initializePageSettingsDraft();
    setEditorStatus('', 'neutral');
    renderCanvas();
    renderEditorPanel();
    return true;
  }

  function selectModule(moduleId) {
    if (selectedModuleId === moduleId) return true;
    if (!getSelectedModuleRecord(moduleId)) return false;
    if (
      dirtyScope === 'module' ||
      dirtyScope === 'theme' ||
      dirtyScope === 'header' ||
      dirtyScope === 'section'
    ) {
      const sameModule = dirtyScope === 'module' && selectedModuleId === moduleId;
      if (!sameModule) {
        ensureCleanWorkspace(
          'Save or discard your current changes before selecting another module.'
        );
        return false;
      }
    }

    selectedModuleId = moduleId;
    selectedCanvasSurface = null;
    draftManager.clearActiveSectionState();
    activeEditorTab = 'modules';
    draftManager.initializeModuleDraft(moduleId);
    setEditorStatus('', 'neutral');
    renderCanvas();
    renderEditorPanel();
    return true;
  }

  function selectSectionFromCanvas(sectionId) {
    if (!sectionId || !getSectionRecord(sectionId)) return false;
    if (selectedCanvasSurface === 'section' && activeSectionId === sectionId) return true;
    if (dirtyScope === 'section' && activeSectionId !== sectionId) {
      setCanvasStatus(
        'Save or discard the current section settings before switching sections.',
        'warning'
      );
      renderCanvas();
      return false;
    }
    if (
      dirtyScope &&
      dirtyScope !== 'section' &&
      !ensureCleanWorkspace('Save or discard your current changes before selecting a section.')
    ) {
      renderEditorPanel();
      return false;
    }

    draftManager.clearSelectedModuleState();
    selectedCanvasSurface = 'section';
    activeEditorTab = 'modules';
    draftManager.initializeSectionDraft(sectionId);
    setCanvasStatus('', 'neutral');
    renderCanvas();
    renderEditorPanel();
    showSidePanelTab('settings');
    return true;
  }

  function selectCanvasTarget(target) {
    if (!target || typeof target !== 'object') return false;
    if (target.kind === 'module') {
      const accepted = selectModule(target.moduleId);
      if (accepted) showSidePanelTab('settings');
      return accepted;
    }
    if (target.kind === 'header') {
      const accepted = selectPageHeaderFromCanvas();
      if (accepted) showSidePanelTab('settings');
      return accepted;
    }
    if (target.kind === 'page') {
      const accepted = selectPageSettingsFromCanvas();
      if (accepted) showSidePanelTab('settings');
      return accepted;
    }
    if (target.kind === 'section') {
      return selectSectionFromCanvas(target.sectionId);
    }
    if (target.kind === 'column' && target.sectionId) {
      return selectSectionFromCanvas(target.sectionId);
    }
    return false;
  }

  async function deleteModuleFromCanvas(moduleId) {
    if (!confirm('Delete this module? This cannot be undone.')) return false;
    if (selectedModuleId === moduleId && dirtyScope === 'module') {
      clearDirty('module');
    }

    if (await deleteModule(moduleId)) {
      removeModuleFromCurrentPage(moduleId);
      if (selectedModuleId === moduleId) {
        draftManager.clearSelectedModuleState();
      }
      setCanvasStatus('Module deleted.', 'success');
      renderCanvas();
      renderEditorPanel();
      return true;
    }
    return false;
  }

  async function deleteSectionFromCanvas(sectionId) {
    if (!confirm('Delete this section and all its modules?')) return false;

    if (await deleteSection(sectionId)) {
      removeSectionFromCurrentPage(sectionId);
      if (activeSectionId === sectionId) {
        draftManager.clearActiveSectionState();
      }
      if (selectedModuleId && !getSelectedModuleRecord(selectedModuleId)) {
        clearDirty('module');
        draftManager.clearSelectedModuleState();
      }
      setCanvasStatus('Section deleted.', 'success');
      renderCanvas();
      renderEditorPanel();
      return true;
    }
    return false;
  }

  function renderCanvas() {
    if (!el.pbCanvas) return;
    renderLayerTree();
    syncCanvasModeUi();

    if (canvasMode === 'preview') {
      previewManager.renderPreview({ builderEditing: true });
      renderLiveCanvasStatus();
      renderStructureDebugSurface(true);
      return;
    }

    renderLiveCanvasStatus();
    renderStructureDebugSurface(false);
  }

  function renderLiveCanvasStatus() {
    const existing = el.pbCanvas?.querySelector('.pb-live-canvas-status');
    if (!el.pbCanvas || canvasMode !== 'preview' || !canvasStatus.message) {
      existing?.remove();
      return;
    }
    const notice = existing || document.createElement('div');
    notice.className = 'pb-canvas-notice pb-live-canvas-status';
    notice.dataset.status = canvasStatus.type || 'neutral';
    notice.textContent = canvasStatus.message;
    if (!existing) {
      el.pbCanvas.prepend(notice);
    }
  }

  function renderStructureDebugSurface(hidden = false) {
    if (!el.pbCanvas) return;
    if (!hidden) {
      el.pbCanvas.dataset.mode = 'edit';
    }

    const { pageTitleHtml, canvasHtml } = renderCanvasSnapshot({
      state: {
        currentPage,
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
        sortCanvasModulesForColumn: canvasMutations.sortCanvasModulesForColumn,
        getVisibleSectionModuleCount: canvasMutations.getVisibleSectionModuleCount,
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

    if (!hidden) {
      el.pbCanvas.innerHTML = canvasHtml;
      bindCanvasEvents();
      return;
    }

    let debugSurface = el.pbCanvas.querySelector('.pb-structure-debug-surface');
    if (!debugSurface) {
      debugSurface = document.createElement('div');
      debugSurface.className = 'pb-structure-debug-surface';
      el.pbCanvas.appendChild(debugSurface);
    }
    debugSurface.hidden = true;
    debugSurface.setAttribute('aria-hidden', 'true');
    debugSurface.innerHTML = canvasHtml;
    bindCanvasEvents();
  }

  function syncCanvasModeUi() {
    const layout = /** @type {HTMLElement|null} */ (document.querySelector('.page-builder-layout'));
    if (layout) {
      if (canvasMode === 'preview') {
        layout.dataset.canvasMode = 'live';
      } else {
        layout.dataset.canvasMode = 'structure';
      }
    }
    el.pbViewToggles?.querySelectorAll('.pb-view-toggle').forEach((node) => {
      const button = /** @type {HTMLElement} */ (node);
      button.classList.toggle('pb-view-toggle--active', button.dataset.view === canvasMode);
    });
    el.pbWidthToggles?.querySelectorAll('.pb-width-toggle').forEach((node) => {
      const button = /** @type {HTMLElement} */ (node);
      button.classList.toggle('pb-width-toggle--active', button.dataset.width === activeDeviceId);
    });
  }

  function exitBuilder() {
    if (!ensureCleanWorkspace('Save or discard your current changes before exiting the builder.')) {
      renderCanvas();
      renderEditorPanel();
      return;
    }
    activeEntrypoint = 'builder';
    activeDesignerSurface = '';
    if (typeof onExitBuilder === 'function') {
      onExitBuilder();
      return;
    }
    hideAllSections();
  }

  // ==================== Public Methods ====================

  async function showPageBuilderSection(options = {}) {
    const entrypoint = options.entrypoint === 'designer' ? 'designer' : activeEntrypoint;
    const historyMode = options.historyMode === 'push' ? 'push' : 'replace';
    const requestedPageSlug = String(options.pageSlug || '')
      .trim()
      .toLowerCase();
    const requestedSurface =
      entrypoint === 'designer'
        ? options.surface === 'header'
          ? 'header'
          : activeDesignerSurface || 'header'
        : '';

    activeEntrypoint = entrypoint;
    activeDesignerSurface = requestedSurface;
    canvasMode = 'preview';

    hideAllSections();
    if (el.adminDashboard) {
      el.adminDashboard.classList.add('admin-page-builder-open');
    }
    if (el.pageBuilderSection) {
      el.pageBuilderSection.style.display = '';
      el.pageBuilderSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveNav(el.btnDesigner);

    await pageActions.loadPages();
    renderModulePalette();

    if (activeEntrypoint === 'designer') {
      const targetPage = getDefaultDesignerPage(requestedPageSlug);
      if (targetPage) {
        await pageActions.activatePage(targetPage.id, {
          surface: activeDesignerSurface || 'header',
          historyMode,
        });
      } else {
        currentPage = null;
        resetBuilderState();
        renderPageList();
        renderCanvas();
        renderEditorPanel();
        renderLayerTree();
        syncDesignerRoute(historyMode);
      }
    } else {
      renderPageList();
      renderCanvas();
      renderEditorPanel();
    }
    applyEditorMode();
  }

  function initPageBuilder() {
    applyEditorMode();
    previewManager.bindMessageHandler();

    if (el.pbToggleSidebar) {
      el.pbToggleSidebar.addEventListener('click', toggleSidebarMode);
    }

    if (el.pbToggleEditor) {
      el.pbToggleEditor.addEventListener('click', toggleEditorMode);
    }

    el.pbExitBuilder?.addEventListener('click', exitBuilder);

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

    const addPageModal = /** @type {HTMLElement|null} */ (
      document.getElementById('pbAddPageModal')
    );
    const addPageForm = /** @type {HTMLFormElement|null} */ (
      document.getElementById('pbAddPageForm')
    );
    const addPageSlugInput = /** @type {HTMLInputElement|null} */ (
      document.getElementById('pbPageSlugInput')
    );
    const addPageTitleInput = /** @type {HTMLInputElement|null} */ (
      document.getElementById('pbPageTitleInput')
    );

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
      if (
        !ensureCleanWorkspace('Save or discard your current changes before creating a new page.')
      ) {
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

      const submitBtn = /** @type {HTMLButtonElement|null} */ (
        addPageForm.querySelector('button[type="submit"]')
      );
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
      }

      const newPage = await pageActions.createPageForSeries(slug, title);
      try {
        if (newPage) {
          closeAddPageModal();
          await pageActions.loadPages();
          await pageActions.activatePage(newPage.id, {
            surface: isDesignerMode() ? activeDesignerSurface || 'header' : 'page-settings',
            historyMode: 'replace',
            fallbackPage: newPage,
          });
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Page';
        }
      }
    });

    el.pbSaveDraft?.addEventListener('click', async () => {
      await pageActions.updatePublishState(false);
    });

    el.pbPublish?.addEventListener('click', async () => {
      await pageActions.updatePublishState(true);
    });

    // ── View toggle (Edit / Preview) ──────────────────────────────────────────
    if (el.pbViewToggles) {
      el.pbViewToggles.addEventListener('click', (e) => {
        const btn = /** @type {HTMLElement|null} */ (
          /** @type {HTMLElement} */ (e.target).closest('[data-view]')
        );
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

        renderCanvas();
      });
    }

    // ── Width toggle (Desktop / Tablet / Mobile) ──────────────────────────────
    if (el.pbWidthToggles) {
      el.pbWidthToggles.addEventListener('click', (e) => {
        const btn = /** @type {HTMLElement|null} */ (
          /** @type {HTMLElement} */ (e.target).closest('[data-width]')
        );
        if (!btn) return;
        const nextWidth = btn.dataset.width;
        if (!previewManager.setViewport(nextWidth)) return;

        el.pbWidthToggles.querySelectorAll('.pb-width-toggle').forEach((node) => {
          const b = /** @type {HTMLElement} */ (node);
          b.classList.toggle('pb-width-toggle--active', b.dataset.width === activeDeviceId);
        });
      });
    }
  }

  function onSeriesChange() {
    const nextPageSlug = isDesignerMode() ? currentPage?.slug || '' : '';
    currentPage = null;
    resetBuilderState();
    previewManager.resetSession();
    if (el.pageBuilderSection?.style.display !== 'none') {
      showPageBuilderSection({
        entrypoint: activeEntrypoint,
        pageSlug: nextPageSlug,
        surface: activeDesignerSurface,
        historyMode: 'replace',
      });
    }
  }

  return {
    initPageBuilder,
    showPageBuilderSection,
    onSeriesChange,
  };
}

export { createPageBuilder };

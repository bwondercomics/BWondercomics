import { el } from './dom.js';
import { openImagePicker } from './image-picker.js';
import { DEFAULT_SERIES_ID } from './state.js';
import { readFileAsBase64 } from './utils.js';
import { createCanvasEventBinder } from './page-builder/canvas-events.js';
import { createCanvasMutations } from './page-builder/canvas-mutations.js';
import { renderCanvasSnapshot } from './page-builder/canvas-renderer.js';
import { BUILDER_COMMANDS, createBuilderCommandRegistry } from './page-builder/commands.js';
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
import {
  HEADER_REGION_ORDER,
  HEADER_ROW_ORDER,
  createEffectivePageHeader,
  createPageHeaderMeta,
} from './page-builder/header-config.js';
import {
  findBlockPlacement,
  moveBlockAcrossRegions,
  moveBlockAcrossRows,
  moveBlockToPlacement,
} from './page-builder/header-editor.js';
import { createBuilderKeymapManager } from './page-builder/keymaps.js';
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
import { createDraftUndoStack } from './page-builder/undo-stack.js';
import { BUILDER_DEVICE_ORDER } from './page-builder/preview-contract.js';
import {
  READER_BINDING_DEFAULT_DEVICE,
  getReaderBindingInvalidationWarning,
  validateReaderBindingPage,
} from './page-builder/reader-binding-validation.js';
import {
  validateBuilderRuntimeContract,
  isSectionResponsiveField,
  pruneEmptyResponsiveOverrides,
  setResponsiveOverrideValue,
} from './page-builder/responsive-overrides.js';
import { MAX_COLUMNS, parseLayoutRatios, ratiosToLayout } from './page-builder/layout-utils.js';
import { sanitizeBuilderHtml } from './page-builder/sanitize.js';
import {
  fetchSeriesPages,
  fetchGlobalPages,
  fetchPage,
  fetchPageBuilderRuntime,
  createScopedPage,
  deletePage,
  updatePage,
  fetchPageBindings,
  updatePageBindings,
  getLastPageBuilderDataError,
  fetchAssets,
  uploadAsset,
  addSection,
  updateSection,
  deleteSection,
  reorderSections,
  addModule,
  updateModule,
  moveModule,
  saveModulePlacements,
  reorderModules,
  deleteModule,
  reorderScopedPages,
} from './page-builder/data.js';

const PAGE_TEMPLATE_DEFS = Object.freeze({
  blank: { pageType: 'custom' },
  reader: { pageType: 'reader', moduleType: 'reader', seriesOnly: true },
  feed: { pageType: 'feed', moduleType: 'feed' },
  'media-gallery': { pageType: 'gallery', moduleType: 'media-gallery' },
  'entry-gallery': { pageType: 'gallery', moduleType: 'entry-gallery' },
});

function createPageBuilder({
  sanitizeSeriesId,
  getActiveSeriesId,
  hideAllSections,
  setActiveNav,
  onDesignerRouteChange,
  onExitBuilder,
}) {
  let pages = [];
  let linkPages = [];
  let currentPage = null;
  /** @type {'series'|'global'} */
  let activePageScope = 'series';
  let pageBindings = { bindings: {}, warnings: [] };
  let selectedModuleId = null;
  let selectedCanvasSurface = null;
  let selectedColumnIndex = null;
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
  let inlineEditState = null;
  let dirtyScope = null;
  let editorStatus = { type: 'neutral', message: '' };
  let canvasStatus = { type: 'neutral', message: '' };
  let activeInsertTarget = null;
  let draggedModuleId = null;
  let draggedSectionId = null;
  let liveDragState = null;
  /** @type {'edit'|'preview'} */
  let canvasMode = 'preview';
  /** @type {'edit'|'preview'} */
  let editorChromeMode = 'edit';
  /** @type {'edit'|'preview'|null} */
  let preChromeCanvasMode = null;
  let previewChromeRestoreState = null;
  /** @type {'desktop'|'tablet'|'mobile'} */
  let activeDeviceId = BUILDER_DEVICE_ORDER[0];
  /** @type {'global'|'device'} */
  let responsiveEditScope = 'global';
  let builderRuntime = validateBuilderRuntimeContract(null);
  /** @type {'builder'|'designer'} */
  let activeEntrypoint = 'builder';
  /** @type {''|'header'} */
  let activeDesignerSurface = '';
  let structuralCommands = null;
  let commandRegistry = null;
  let keymapManager = null;
  let draftUndoStack = null;

  function runCommand(commandId, payload = {}) {
    if (commandRegistry) return commandRegistry.runCommand(commandId, payload);
    if (structuralCommands) return structuralCommands.runCommand(commandId, payload);
    return { ok: false, status: 'Builder commands unavailable.' };
  }

  function canRunCommand(commandId, payload = {}) {
    return commandRegistry?.canRunCommand(commandId, payload) !== false;
  }

  function runStructuralCommand(commandId, payload = {}) {
    return runCommand(commandId, payload);
  }

  const draftManager = createDraftManager({
    getState: () => ({
      currentPage,
      selectedModuleId,
      activeModuleDraft,
      activeThemeDraft,
      activeHeaderDraft,
      activePageSettingsDraft,
      builderRuntime,
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
      resetDraftHistory: (scope) => {
        draftUndoStack?.reset(scope);
        updateEditorFooterUi();
      },
      renderCanvas: () => renderCanvas(),
      renderEditorPanel: () => renderEditorPanel(),
      renderPageList: () => renderPageList(),
      syncDesignerRoute: (mode) => syncDesignerRoute(mode),
      requestTargetRefresh: () => previewManager.requestTargetRefresh?.(),
    },
    deps: {
      updateModule,
      updatePage,
      saveModulePlacements,
    },
  });

  draftUndoStack = createDraftUndoStack({
    getKey: getDraftHistoryKey,
    getSnapshot: getDraftSnapshot,
    applySnapshot: applyDraftHistorySnapshot,
    onChange: () => updateEditorFooterUi(),
  });

  const renderEditorPanel = createEditorPanelRenderer({
    el,
    getState: () => ({
      currentPage,
      pages: linkPages.length ? linkPages : pages,
      activeEditorTab,
      activeSidePanelTab,
      selectedCanvasSurface,
      selectedModuleId,
      selectedColumnIndex,
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
      builderRuntime,
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
        const safeScope = nextScope === 'device' ? 'device' : 'global';
        if (responsiveEditScope === safeScope) return;
        responsiveEditScope = safeScope;
        resetVisibleResponsiveDraftHistory();
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
      setActiveSectionColumnCount,
      updateActiveSectionColumnRatio,
      updateActiveSectionColumnField,
      selectParentColumn: selectParentColumnFromModule,
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
      runCommand,
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
      dirtyScope,
    }),
    actions: {
      ensureCleanWorkspace,
      setActiveInsertTarget: (target) => {
        activeInsertTarget = target;
      },
      setCanvasStatus,
      renderCanvas: () => renderCanvas(),
      replaceCurrentPageAfterMutationFailure: (nextPage) => {
        currentPage = nextPage;
        draftManager.clearSelectedModuleState();
        draftManager.clearActiveSectionState();
        selectedCanvasSurface = null;
        dirtyScope = null;
        draftManager.clearStructureDraft();
        activeInsertTarget = null;
        liveDragState = null;
        clearInlineEditView('mutation-reconciliation', 'cancel');
        draftUndoStack?.clear();
        activeThemeDraft = draftManager.normalizeThemeDraft(currentPage);
        activeHeaderDraft = draftManager.normalizeHeaderDraft(currentPage);
        draftManager.initializePageSettingsDraft();
        renderPageList();
        renderEditorPanel();
      },
    },
    deps: {
      addModule,
      deleteModule,
      fetchPage,
      moveModule,
      reorderModules,
      addSection,
      reorderSections,
      updateSection,
    },
    helpers: {
      getDefaultConfig,
      getModuleLabel,
      getSeriesId,
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
      setActiveSectionColumnCount,
      updateActiveSectionColumnRatio,
      updateActiveSectionColumnField,
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
      selectColumn: selectColumnFromCanvas,
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
        activePageScope,
        pageBindings,
        activeSectionId,
        selectedCanvasSurface,
        selectedModuleId,
        selectedTarget: getSelectedTarget(),
        activeInsertTarget,
        liveDragState,
      }),
      actions: {
        selectPage: (pageId) => pageActions.selectPage(pageId),
        switchPageScope: async (nextScope) => switchPageScope(nextScope),
        updateReaderBinding: async (pageId) => updateReaderBinding(pageId),
        deletePage: (pageId) => pageActions.deletePageFromSidebar(pageId),
        reorderSidebarPages: (pageIds) => pageActions.reorderSidebarPages(pageIds),
        setDraggedModuleId: (moduleId) => {
          draggedModuleId = moduleId;
        },
        runCommand,
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
        selectColumn: (sectionId, columnIndex) => {
          selectColumnFromCanvas(sectionId, columnIndex);
          showSidePanelTab('settings');
        },
        selectParentColumn: selectParentColumnFromModule,
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
      activePageScope,
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
      setLinkPages: (nextPages) => {
        linkPages = Array.isArray(nextPages) ? nextPages : [];
      },
      setPageBindings: (nextBindings) => {
        pageBindings =
          nextBindings && typeof nextBindings === 'object'
            ? nextBindings
            : { bindings: {}, warnings: [] };
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
        if (surface !== 'column') selectedColumnIndex = null;
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
      fetchPages: (scope, seriesId) =>
        scope === 'global' ? fetchGlobalPages() : fetchSeriesPages(seriesId),
      fetchLinkPages: async (seriesId) => {
        const [seriesPages, globalPages] = await Promise.all([
          fetchSeriesPages(seriesId),
          fetchGlobalPages(),
        ]);
        return [...seriesPages, ...globalPages];
      },
      fetchPage,
      createPage: (scope, seriesId, slug, title) => createScopedPage(scope, seriesId, slug, title),
      deletePage,
      updatePage,
      getLastPageBuilderDataError,
      fetchPageBindings,
      updatePageBindings,
      uploadAsset,
      reorderPages: (scope, seriesId, pageIds) => reorderScopedPages(scope, seriesId, pageIds),
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
      inlineEditState,
      activeDeviceId,
      previewWidth: activeDeviceId,
      liveDragState,
    }),
    actions: {
      buildNormalizedPageMeta,
      buildSectionSettingsFromDraft,
      getSectionLayoutFromDraft,
      setActiveDeviceId: (nextDeviceId) => {
        activeDeviceId = nextDeviceId;
      },
      setPreviewWidth: (nextWidth) => {
        activeDeviceId = nextWidth;
      },
      selectCanvasTarget,
      renderEditorPanel: () => renderEditorPanel(),
      runCommand,
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
      renderCanvas: () => renderCanvas(),
      insertModuleAt: canvasMutations.insertModuleAt,
      duplicateModuleAfter: canvasMutations.duplicateModuleAfter,
      moveModuleToTarget: canvasMutations.moveModuleToTarget,
      stageModuleMoveStep: (moduleId, direction) =>
        draftManager.stageStructureMove(moduleId, direction),
      insertSectionAt: canvasMutations.insertSectionAt,
      reorderSectionToIndex: canvasMutations.reorderSectionToIndex,
      deleteModuleFromCanvas,
      deleteSectionFromCanvas,
      hideModuleOnCurrentDevice,
      selectModule,
      selectSection: selectSectionFromCanvas,
      showSidePanelTab,
      requestFreshTargets: () => previewManager.requestTargetRefresh?.(),
      canMoveHeaderBlocks,
      stepHeaderBlockPlacement,
      moveHeaderBlockToCell,
    },
    helpers: {
      getModuleLabel,
      getSectionCount: () => sortSections(currentPage?.sections || []).length,
    },
  });

  commandRegistry = createBuilderCommandRegistry({
    getState: () => ({
      currentPage,
      dirtyScope,
      editorChromeMode,
      activeInsertTarget,
      liveDragState,
    }),
    actions: {
      canDiscardCurrentDraft,
      canRedoDraft,
      canSaveCurrentDraft,
      canSelectRelativeTarget,
      canUndoDraft,
      cancelTransientState,
      discardCurrentDraft,
      enterChromePreview,
      exitChromePreview,
      redoDraft,
      saveCurrentDraft,
      selectCanvasTarget,
      selectRelativeTarget,
      setDevice: setBuilderDevice,
      startInlineEdit,
      changeInlineEdit,
      commitInlineEdit,
      cancelInlineEdit,
      toggleMenus: toggleSidebarMode,
      undoDraft,
    },
    managers: {
      structuralCommands,
    },
    deps: {
      confirm: (message) => confirm(message),
    },
  });

  keymapManager = createBuilderKeymapManager({
    target: document,
    getState: () => ({
      builderOpen: el.pageBuilderSection?.style.display !== 'none',
      editorChromeMode,
      activeInsertTarget,
      liveDragState,
    }),
    actions: {
      canRunCommand,
      runCommand,
    },
  });

  function getSeriesId() {
    return sanitizeSeriesId(getActiveSeriesId()) || DEFAULT_SERIES_ID;
  }

  function getTemplateDefaultConfig(moduleType) {
    const config = cloneValue(getDefaultConfig(moduleType));
    if (moduleType === 'reader' || moduleType === 'entry-gallery') {
      if (activePageScope === 'global') {
        config.source = {
          ...(config.source && typeof config.source === 'object' ? config.source : {}),
          mode: 'specific-series',
          seriesId: getSeriesId(),
        };
      } else {
        config.source = {
          ...(config.source && typeof config.source === 'object' ? config.source : {}),
          mode: 'active-page-series',
        };
        delete config.source.seriesId;
      }
    }
    return config;
  }

  async function applyPageTemplate(page, templateId) {
    const template = PAGE_TEMPLATE_DEFS[templateId] || PAGE_TEMPLATE_DEFS.blank;
    if (!page?.id || !template.moduleType) {
      if (page?.id && template.pageType && template.pageType !== (page.pageType || 'custom')) {
        await updatePage(page.id, { pageType: template.pageType });
      }
      return;
    }
    if (template.seriesOnly && activePageScope === 'global') {
      setEditorStatus('Reader templates can only be created in Series Pages.', 'danger');
      return;
    }

    const pageType = template.pageType || page.pageType || 'custom';
    if (pageType !== (page.pageType || 'custom')) {
      await updatePage(page.id, { pageType });
    }

    const section = await addSection(page.id, 'row', '1');
    if (!section?.id) {
      setEditorStatus('Page created, but the template section could not be added.', 'danger');
      return;
    }
    const insertedModule = await addModule(
      section.id,
      template.moduleType,
      0,
      getTemplateDefaultConfig(template.moduleType)
    );

    const readerBinding = pageBindings?.bindings?.reader?.pageId;
    if (templateId === 'reader' && activePageScope === 'series' && !readerBinding) {
      await updateReaderBinding(page.id, {
        ...page,
        scope: 'series',
        seriesId: getSeriesId(),
        sections: [
          ...(page.sections || []),
          {
            ...section,
            modules: insertedModule ? [insertedModule] : [],
          },
        ],
      });
    }
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

  function getTargetKey(target) {
    if (!target || typeof target !== 'object') return '';
    if (target.key) return String(target.key);
    if (target.kind === 'module' && target.moduleId) return `module:${target.moduleId}`;
    if (target.kind === 'section' && target.sectionId) return `section:${target.sectionId}`;
    if (target.kind === 'header' && target.pageId) return `header:${target.pageId}`;
    if (target.kind === 'page' && target.pageId) return `page:${target.pageId}`;
    if (target.kind === 'column' && target.sectionId && Number.isSafeInteger(target.columnIndex)) {
      return `column:${target.sectionId}:${target.columnIndex}`;
    }
    return '';
  }

  function getSelectedTarget() {
    const pageId = currentPage?.id || null;
    if (!pageId) return null;
    if (selectedCanvasSurface === 'page-header') {
      return { kind: 'header', key: `header:${pageId}`, pageId };
    }
    if (selectedCanvasSurface === 'page-settings') {
      return { kind: 'page', key: `page:${pageId}`, pageId };
    }
    if (selectedCanvasSurface === 'section' && activeSectionId) {
      return {
        kind: 'section',
        key: `section:${activeSectionId}`,
        pageId,
        sectionId: activeSectionId,
      };
    }
    const selectedModule = getSelectedModuleRecord(selectedModuleId);
    if (selectedModule) {
      const section = (currentPage.sections || []).find((item) =>
        (item.modules || []).some((module) => module.id === selectedModule.id)
      );
      return {
        kind: 'module',
        key: `module:${selectedModule.id}`,
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

  function getBuilderRoot() {
    return el.pageBuilderSection?.querySelector('.page-builder') || null;
  }

  function syncChromeModeUi() {
    const isChromePreview = editorChromeMode === 'preview';
    const root = getBuilderRoot();
    if (root) {
      root.dataset.chromeMode = isChromePreview ? 'preview' : 'edit';
    }
    if (el.pbEnterPreview) {
      el.pbEnterPreview.setAttribute('aria-pressed', String(isChromePreview));
      el.pbEnterPreview.disabled = isChromePreview;
    }
    if (el.pbRestorePreviewChrome) {
      el.pbRestorePreviewChrome.hidden = !isChromePreview;
      el.pbRestorePreviewChrome.setAttribute('aria-hidden', String(!isChromePreview));
    }
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

  function isDraftHistoryScope(scope) {
    return ['module', 'header', 'theme', 'page-settings', 'section'].includes(scope);
  }

  function isResponsiveDraftHistoryScope(scope) {
    return scope === 'module' || scope === 'header' || scope === 'section';
  }

  function getVisibleDraftScope() {
    if (!currentPage) return '';
    if (activeEditorTab === 'theme') {
      if (selectedCanvasSurface === 'page-header') return 'header';
      if (selectedModuleId) return 'module';
      return 'theme';
    }
    if (selectedCanvasSurface === 'page-header') return 'header';
    if (selectedCanvasSurface === 'page-settings') return 'page-settings';
    if (selectedCanvasSurface === 'section') return 'section';
    if (selectedModuleId) return 'module';
    return '';
  }

  function getDraftCommandScope() {
    return dirtyScope || getVisibleDraftScope();
  }

  function getDraftHistoryKey(scope) {
    if (!currentPage?.id || !isDraftHistoryScope(scope)) return '';
    const responsiveContext = getDraftHistoryResponsiveContext(scope);
    if (scope === 'module') {
      const moduleId = activeModuleDraftId || selectedModuleId;
      return moduleId ? `${currentPage.id}:module:${moduleId}${responsiveContext}` : '';
    }
    if (scope === 'section') {
      return activeSectionId
        ? `${currentPage.id}:section:${activeSectionId}${responsiveContext}`
        : '';
    }
    return `${currentPage.id}:${scope}${responsiveContext}`;
  }

  function getDraftHistoryResponsiveContext(scope) {
    if (!isResponsiveDraftHistoryScope(scope)) return '';
    const editScope = responsiveEditScope === 'device' ? 'device' : 'global';
    if (editScope === 'device') {
      return `:${editScope}:${activeDeviceId || BUILDER_DEVICE_ORDER[0]}`;
    }
    return `:${editScope}`;
  }

  function resetVisibleResponsiveDraftHistory() {
    const scope = getVisibleDraftScope();
    if (!isResponsiveDraftHistoryScope(scope)) return;
    draftUndoStack?.reset(scope);
    updateEditorFooterUi();
  }

  function getDraftSnapshot(scope) {
    if (scope === 'module') return cloneValue(activeModuleDraft);
    if (scope === 'header') return cloneValue(activeHeaderDraft);
    if (scope === 'theme') return cloneValue(activeThemeDraft);
    if (scope === 'page-settings') return cloneValue(activePageSettingsDraft);
    if (scope === 'section') return cloneValue(activeSectionDraft);
    return null;
  }

  function setDraftSnapshot(scope, snapshot) {
    if (scope === 'module') {
      activeModuleDraftId = selectedModuleId || activeModuleDraftId;
      activeModuleDraft = cloneValue(snapshot);
      return true;
    }
    if (scope === 'header') {
      activeHeaderDraft = cloneValue(snapshot);
      return true;
    }
    if (scope === 'theme') {
      activeThemeDraft = cloneValue(snapshot);
      return true;
    }
    if (scope === 'page-settings') {
      activePageSettingsDraft = cloneValue(snapshot);
      return true;
    }
    if (scope === 'section') {
      activeSectionDraft = cloneValue(snapshot);
      return true;
    }
    return false;
  }

  function applyDraftHistorySnapshot(scope, snapshot, meta = {}) {
    if (!setDraftSnapshot(scope, snapshot)) return;
    dirtyScope = meta.dirty ? scope : null;
    if (scope === 'section') {
      setCanvasStatus(
        meta.dirty ? 'Section settings have unsaved changes.' : 'Section settings restored.',
        meta.dirty ? 'warning' : 'neutral'
      );
    } else {
      setEditorStatus(
        meta.dirty ? 'Draft has unsaved changes.' : 'Draft restored to saved state.',
        meta.dirty ? 'warning' : 'neutral'
      );
    }
    if (scope === 'module' && inlineEditState) {
      inlineEditState = {
        ...inlineEditState,
        draftValue: String(snapshot?.content || ''),
      };
      syncInlineEditDraftToPreview(meta.reason || 'draft-history');
    }
    renderCanvas();
    renderEditorPanel();
  }

  function canSaveCurrentDraft() {
    return isDraftHistoryScope(dirtyScope) || dirtyScope === 'structure';
  }

  function canDiscardCurrentDraft() {
    return isDraftHistoryScope(dirtyScope) || dirtyScope === 'structure';
  }

  async function saveCurrentDraft() {
    const scope = dirtyScope;
    if (!canSaveCurrentDraft()) return { ok: false, status: 'No dirty draft to save.' };
    if (scope === 'module' && inlineEditState) {
      clearInlineEditView('save', 'commit');
    }
    let saved = false;
    if (scope === 'module') saved = await draftManager.saveActiveModuleDraft();
    else if (scope === 'header') saved = await draftManager.saveActiveHeaderDraft();
    else if (scope === 'theme') saved = await draftManager.saveActiveThemeDraft();
    else if (scope === 'page-settings') saved = await draftManager.saveActivePageSettingsDraft();
    else if (scope === 'section') saved = await saveSectionSettings();
    else if (scope === 'structure') saved = await draftManager.saveStructureDraft();
    return saved ? { ok: true } : { ok: false, status: 'Failed to save draft.' };
  }

  function discardCurrentDraft() {
    const scope = dirtyScope;
    if (!canDiscardCurrentDraft()) return { ok: false, status: 'No dirty draft to discard.' };
    if (scope === 'module' && inlineEditState) {
      clearInlineEditView('discard', 'cancel');
    }
    if (scope === 'module') draftManager.discardActiveModuleDraft();
    else if (scope === 'header') draftManager.discardActiveHeaderDraft();
    else if (scope === 'theme') draftManager.discardActiveThemeDraft();
    else if (scope === 'page-settings') draftManager.discardActivePageSettingsDraft();
    else if (scope === 'section') discardSectionSettings();
    else if (scope === 'structure') draftManager.discardStructureDraft();
    return { ok: true };
  }

  function canUndoDraft() {
    const scope = getDraftCommandScope();
    return isDraftHistoryScope(scope) && draftUndoStack?.canUndo(scope) === true;
  }

  function canRedoDraft() {
    const scope = getDraftCommandScope();
    return isDraftHistoryScope(scope) && draftUndoStack?.canRedo(scope) === true;
  }

  function undoDraft() {
    const scope = getDraftCommandScope();
    if (!isDraftHistoryScope(scope)) return { ok: false, status: 'No draft selected.' };
    return draftUndoStack?.undo(scope) || { ok: false, status: 'No draft history available.' };
  }

  function redoDraft() {
    const scope = getDraftCommandScope();
    if (!isDraftHistoryScope(scope)) return { ok: false, status: 'No draft selected.' };
    return draftUndoStack?.redo(scope) || { ok: false, status: 'No draft history available.' };
  }

  function clearDirty(scope = null) {
    if (!scope || dirtyScope === scope) {
      dirtyScope = null;
    }
    if (isDraftHistoryScope(scope || getVisibleDraftScope())) {
      draftUndoStack?.reset(scope || getVisibleDraftScope());
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
    } else if (scope === 'structure') {
      setEditorStatus('Unsaved module moves. Save or discard before switching.', 'warning');
    }
    if (isDraftHistoryScope(scope)) {
      draftUndoStack?.record(scope);
    }
    updateEditorFooterUi();
    if (
      scope === 'module' &&
      inlineEditState?.moduleId === (activeModuleDraftId || selectedModuleId)
    ) {
      syncInlineEditDraftToPreview('side-panel');
      previewManager.refreshPreviewSnapshotState?.({ builderEditing: editorChromeMode === 'edit' });
      return;
    }
    refreshLiveCanvasForDraftChange();
  }

  function isInlineEditableTextPayload(payload = {}) {
    const target = payload.target || {};
    return (
      target.kind === 'module' &&
      target.moduleType === 'text' &&
      !!target.moduleId &&
      payload.field === 'content'
    );
  }

  function sanitizeInlineTextContent(value) {
    return sanitizeBuilderHtml(String(value ?? ''), 'text');
  }

  function getInlineEditTarget(target = null) {
    if (target?.kind === 'module' && target.moduleId) return cloneValue(target);
    if (inlineEditState?.target) return cloneValue(inlineEditState.target);
    if (!selectedModuleId || !currentPage?.id) return null;
    const location = getModuleLocation(selectedModuleId);
    if (!location?.module || location.module.moduleType !== 'text') return null;
    return {
      kind: 'module',
      key: `module:${selectedModuleId}`,
      pageId: currentPage.id,
      sectionId: location.section.id,
      columnIndex: Number(location.module.columnIndex) || 0,
      moduleId: selectedModuleId,
      moduleType: 'text',
    };
  }

  function getInlineDraftValue() {
    return sanitizeInlineTextContent(activeModuleDraft?.content || '');
  }

  function syncInlineEditDraftToPreview(reason = 'admin-sync') {
    if (!inlineEditState || inlineEditState.field !== 'content') return;
    const target = getInlineEditTarget(inlineEditState.target);
    if (!target) return;
    const draftValue = getInlineDraftValue();
    inlineEditState = {
      ...inlineEditState,
      target,
      draftValue,
      status: 'editing',
    };
    previewManager.syncInlineEditDraft?.(target, draftValue, reason);
  }

  function clearInlineEditView(reason = 'admin-cancel', mode = 'cancel', notify = true) {
    if (!inlineEditState) return false;
    const target = getInlineEditTarget(inlineEditState.target);
    if (notify && target) {
      if (mode === 'commit') {
        previewManager.commitInlineEdit?.(target, getInlineDraftValue(), reason);
      } else {
        previewManager.cancelInlineEdit?.(target, reason);
      }
    }
    inlineEditState = null;
    return true;
  }

  function isStaleInlineIframePayload(moduleId, nextContent) {
    if (!inlineEditState || inlineEditState.moduleId !== moduleId) return false;
    if (inlineEditState.lastIframeValue === undefined) return false;
    return (
      nextContent === inlineEditState.lastIframeValue &&
      String(inlineEditState.draftValue ?? '') !== nextContent
    );
  }

  function markInlineModuleDraftDirty() {
    dirtyScope = 'module';
    setEditorStatus('Unsaved module changes. Save or discard before switching.', 'warning');
    draftUndoStack?.record('module');
    updateEditorFooterUi();
    previewManager.refreshPreviewSnapshotState?.({ builderEditing: editorChromeMode === 'edit' });
  }

  function startInlineEdit(payload = {}) {
    if (!isInlineEditableTextPayload(payload)) {
      return { ok: false, status: 'Inline editing is only available for text content.' };
    }
    const moduleId = payload.target.moduleId;
    const module = getSelectedModuleRecord(moduleId);
    if (!module || module.moduleType !== 'text') {
      return { ok: false, status: 'Text module not found.' };
    }
    if (selectModule(moduleId, { renderCanvas: false }) === false) {
      return { ok: false, status: 'Save or discard your current changes before editing text.' };
    }
    if (!activeModuleDraft || activeModuleDraftId !== moduleId) {
      activeModuleDraftId = moduleId;
      activeModuleDraft = cloneValue(module.config || {}) || {};
    }
    inlineEditState = {
      moduleId,
      target: getInlineEditTarget(payload.target),
      field: 'content',
      initialValue: String(activeModuleDraft.content || ''),
      draftValue: sanitizeInlineTextContent(activeModuleDraft.content || ''),
      lastIframeValue:
        payload.value !== undefined ? sanitizeInlineTextContent(payload.value) : undefined,
      status: 'editing',
    };
    showSidePanelTab('settings');
    renderEditorPanel();
    updateEditorFooterUi();
    return { ok: true, value: String(activeModuleDraft.content || '') };
  }

  function changeInlineEdit(payload = {}) {
    if (!isInlineEditableTextPayload(payload)) {
      return { ok: false, status: 'Inline edit change is unsupported.' };
    }
    const moduleId = payload.target.moduleId;
    const module = getSelectedModuleRecord(moduleId);
    if (!module || module.moduleType !== 'text') {
      return { ok: false, status: 'Text module not found.' };
    }
    if (
      selectedModuleId !== moduleId &&
      selectModule(moduleId, { renderCanvas: false }) === false
    ) {
      return { ok: false, status: 'Save or discard your current changes before editing text.' };
    }
    if (!activeModuleDraft || activeModuleDraftId !== moduleId) {
      activeModuleDraftId = moduleId;
      activeModuleDraft = cloneValue(module.config || {}) || {};
    }
    const nextContent = sanitizeInlineTextContent(payload.value);
    const target = getInlineEditTarget(payload.target);
    if (String(activeModuleDraft.content || '') !== nextContent) {
      activeModuleDraft = {
        ...(activeModuleDraft || {}),
        content: nextContent,
      };
      markInlineModuleDraftDirty();
      renderEditorPanel();
    }
    inlineEditState = {
      ...(inlineEditState || {
        moduleId,
        target,
        field: 'content',
        initialValue: String(module.config?.content || ''),
      }),
      moduleId,
      target,
      field: 'content',
      draftValue: nextContent,
      lastIframeValue: nextContent,
      status: 'editing',
    };
    return { ok: true, value: nextContent };
  }

  function commitInlineEdit(payload = {}) {
    let result = { ok: true };
    if (payload.value !== undefined) {
      const moduleId = payload.target?.moduleId;
      const nextContent = sanitizeInlineTextContent(payload.value);
      if (moduleId && isStaleInlineIframePayload(moduleId, nextContent)) {
        clearInlineEditView('stale-iframe-commit', 'commit', false);
        refreshLiveCanvasForDraftChange();
        renderEditorPanel();
        return { ok: true, status: 'Ignored stale inline edit commit.' };
      }
      result = changeInlineEdit(payload);
      if (result?.ok === false) return result;
    }
    clearInlineEditView(payload.reason || 'iframe-commit', 'commit', false);
    refreshLiveCanvasForDraftChange();
    renderEditorPanel();
    return { ok: true };
  }

  function cancelInlineEdit(payload = {}) {
    if (payload.value !== undefined) {
      const moduleId = payload.target?.moduleId;
      const nextContent = sanitizeInlineTextContent(payload.value);
      if (moduleId && isStaleInlineIframePayload(moduleId, nextContent)) {
        clearInlineEditView('stale-iframe-cancel', 'cancel', false);
        refreshLiveCanvasForDraftChange();
        renderEditorPanel();
        return { ok: true, status: 'Ignored stale inline edit cancel.' };
      }
      const result = changeInlineEdit(payload);
      if (result?.ok === false) return result;
    }
    clearInlineEditView(payload.reason || 'iframe-cancel', 'cancel', false);
    refreshLiveCanvasForDraftChange();
    renderEditorPanel();
    return { ok: true };
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
    const isDirty =
      dirtyScope === footerScope || (dirtyScope === 'structure' && footerScope === 'module');
    const statusEl = footer.querySelector('[data-editor-status]');
    const saveBtn = footer.querySelector('[data-action="save-current"]');
    const discardBtn = footer.querySelector('[data-action="discard-current"]');
    const undoBtn = footer.querySelector('[data-action="undo-current"]');
    const redoBtn = footer.querySelector('[data-action="redo-current"]');

    const moduleSaveBlocked = footerScope === 'module' && builderRuntime?.compatible !== true;
    if (saveBtn) {
      saveBtn.disabled = !isDirty || moduleSaveBlocked;
      saveBtn.title = moduleSaveBlocked
        ? 'Restart or update the builder API before saving module changes.'
        : '';
    }
    if (discardBtn) discardBtn.disabled = !isDirty;
    if (undoBtn) undoBtn.disabled = !canUndoDraft();
    if (redoBtn) redoBtn.disabled = !canRedoDraft();

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
        structure: 'Module moves have unsaved changes.',
      };
      if (editorStatus.message && editorStatus.type === 'danger') {
        message = editorStatus.message;
        type = 'danger';
      } else if (isDirty) {
        message = dirtyMessages[dirtyScope] || dirtyMessages[footerScope] || dirtyMessages.module;
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
    draftManager.clearStructureDraft();
    dirtyScope = null;
    editorStatus = { type: 'neutral', message: '' };
    canvasStatus = { type: 'neutral', message: '' };
    activeInsertTarget = null;
    draggedModuleId = null;
    draggedSectionId = null;
    liveDragState = null;
    clearInlineEditView('state-reset', 'cancel');
    editorChromeMode = 'edit';
    preChromeCanvasMode = null;
    previewChromeRestoreState = null;
    draftUndoStack?.clear();
  }

  async function switchPageScope(nextScope) {
    const safeScope = nextScope === 'global' ? 'global' : 'series';
    if (safeScope === activePageScope) return;
    if (
      !ensureCleanWorkspace('Save or discard your current changes before switching page scopes.')
    ) {
      return;
    }
    activePageScope = safeScope;
    currentPage = null;
    resetBuilderState();
    await pageActions.loadPages();
    renderPageList();
    renderCanvas();
    renderEditorPanel();
    renderLayerTree();
  }

  async function updateReaderBinding(pageId, candidatePageOverride = null) {
    if (!ensureCleanWorkspace('Save or discard your current changes before changing bindings.')) {
      return;
    }
    const candidatePage =
      candidatePageOverride || (currentPage?.id === pageId ? currentPage : await fetchPage(pageId));
    const warnings = validateReaderBindingPage(candidatePage, {
      seriesId: getSeriesId(),
      deviceId: READER_BINDING_DEFAULT_DEVICE,
    });
    if (warnings.length) {
      pageBindings = {
        ...(pageBindings || {}),
        warnings,
      };
      setEditorStatus(warnings[0].message, 'danger');
      renderPageList();
      renderEditorPanel();
      return;
    }
    const nextBindings = await updatePageBindings(getSeriesId(), { reader: pageId });
    if (!nextBindings) {
      const lastError = getLastPageBuilderDataError?.();
      const warnings = Array.isArray(lastError?.warnings) ? lastError.warnings : [];
      if (warnings.length) {
        pageBindings = {
          ...(pageBindings || {}),
          warnings,
        };
      }
      setEditorStatus(lastError?.message || 'Failed to update reader page binding.', 'danger');
      renderPageList();
      renderEditorPanel();
      return;
    }
    pageBindings = nextBindings;
    setEditorStatus('Reader page binding updated.', 'success');
    renderPageList();
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
    linkPages = linkPages.map((item) => (item.id === page.id ? { ...item, ...page } : item));
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

  function getSelectableTargets() {
    if (!currentPage?.id) return [];
    const targets = [
      { kind: 'page', key: `page:${currentPage.id}`, pageId: currentPage.id },
      { kind: 'header', key: `header:${currentPage.id}`, pageId: currentPage.id },
    ];
    sortSections(currentPage.sections || []).forEach((section) => {
      targets.push({
        kind: 'section',
        key: `section:${section.id}`,
        pageId: currentPage.id,
        sectionId: section.id,
      });
      const columnIndices = Array.from(
        new Set((section.modules || []).map((module) => Number(module.columnIndex) || 0))
      ).sort((a, b) => a - b);
      columnIndices.forEach((columnIndex) => {
        sortModulesForColumn(section, columnIndex).forEach((module) => {
          targets.push({
            kind: 'module',
            key: `module:${module.id}`,
            pageId: currentPage.id,
            sectionId: section.id,
            moduleId: module.id,
          });
        });
      });
    });
    return targets;
  }

  function canSelectRelativeTarget(direction) {
    return getRelativeTarget(direction) !== null;
  }

  function getRelativeTarget(direction) {
    const currentTarget = getSelectedTarget();
    const targets = getSelectableTargets();
    if (!targets.length) return null;
    const currentKey = getTargetKey(currentTarget);
    const currentIndex = Math.max(
      0,
      targets.findIndex((target) => getTargetKey(target) === currentKey)
    );
    if (direction === 'parent') {
      if (currentTarget?.kind === 'module' && currentTarget.sectionId) {
        return (
          targets.find(
            (target) => target.kind === 'section' && target.sectionId === currentTarget.sectionId
          ) || null
        );
      }
      if (currentTarget?.kind === 'section' || currentTarget?.kind === 'header') {
        return targets.find((target) => target.kind === 'page') || null;
      }
      return null;
    }
    if (direction === 'next') {
      return targets[Math.min(targets.length - 1, currentIndex + 1)] || null;
    }
    if (direction === 'prev') {
      return targets[Math.max(0, currentIndex - 1)] || null;
    }
    return null;
  }

  function selectRelativeTarget(direction) {
    const target = getRelativeTarget(direction);
    if (!target) return { ok: false, status: 'No selectable target.' };
    const accepted = selectCanvasTarget(target);
    return { ok: accepted !== false, selectedTarget: target };
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
    if (builderRuntime?.compatible !== true) {
      setCanvasStatus(
        'Builder API restart required before responsive module changes can be saved.',
        'danger'
      );
      renderCanvas();
      renderEditorPanel();
      return false;
    }
    const module = getSelectedModuleRecord(moduleId);
    if (!module) return false;
    const invalidation = getReaderBindingInvalidationWarning(currentPage, {
      pageBindings,
      seriesId: getSeriesId(),
      deviceId: activeDeviceId,
      hideModuleId: moduleId,
    });
    if (
      invalidation &&
      !confirm(`${invalidation.message}\n\nHide this module on the current device?`)
    ) {
      return false;
    }
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
    if (!layout) {
      syncChromeModeUi();
      return;
    }

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
    syncChromeModeUi();
    previewManager.reflowPreviewScale?.();
  }

  function toggleSidebarMode() {
    if (getViewportEditorBand() === 'stacked') return;
    const nextMode = getEffectiveSidebarMode() === 'collapsed' ? 'expanded' : 'collapsed';
    localStorage.setItem(SIDEBAR_MODE_KEY, nextMode);
    applyEditorMode();
  }

  function setBuilderDevice(deviceId) {
    const shouldCleanupInlineEdit =
      BUILDER_DEVICE_ORDER.includes(deviceId) && deviceId !== activeDeviceId;
    if (shouldCleanupInlineEdit) {
      clearInlineEditView('device-switch', 'cancel');
    }
    const changed = previewManager.setViewport(deviceId);
    if (changed !== false) {
      resetVisibleResponsiveDraftHistory();
    }
    syncCanvasModeUi();
    return { ok: changed !== false, deviceId: activeDeviceId };
  }

  function cancelTransientState() {
    let changed = false;
    if (activeInsertTarget) {
      activeInsertTarget = null;
      changed = true;
    }
    if (liveDragState) {
      runCommand(BUILDER_STRUCTURAL_COMMANDS.DRAG_END);
      changed = true;
    }
    if (clearInlineEditView('transient-cancel', 'cancel')) {
      changed = true;
    }
    if (changed) {
      renderCanvas();
      setCanvasStatus('', 'neutral');
    }
    return { ok: changed };
  }

  function enterChromePreview() {
    if (editorChromeMode === 'preview') return { ok: true };
    const selectedTarget = getSelectedTarget();
    preChromeCanvasMode = canvasMode;
    previewChromeRestoreState = {
      canvasMode,
      activeSidePanelTab,
      selectedTarget: selectedTarget ? cloneValue(selectedTarget) : null,
      selectedTargetKey: getTargetKey(selectedTarget),
      scrollTop: el.pbCanvas?.scrollTop || 0,
      scrollLeft: el.pbCanvas?.scrollLeft || 0,
    };
    activeInsertTarget = null;
    if (liveDragState) {
      runStructuralCommand(BUILDER_STRUCTURAL_COMMANDS.DRAG_END);
    }
    clearInlineEditView('chrome-preview', 'cancel');
    editorChromeMode = 'preview';
    canvasMode = 'preview';
    renderCanvas();
    applyEditorMode();
    window.requestAnimationFrame(() => {
      el.pbRestorePreviewChrome?.focus();
    });
    return { ok: true };
  }

  function exitChromePreview() {
    if (editorChromeMode !== 'preview') return { ok: true };
    const restoreState = previewChromeRestoreState || {};
    editorChromeMode = 'edit';
    canvasMode = preChromeCanvasMode || restoreState.canvasMode || 'preview';
    preChromeCanvasMode = null;
    previewChromeRestoreState = null;
    renderCanvas();
    renderEditorPanel();
    applyEditorMode();
    if (restoreState.activeSidePanelTab) {
      showSidePanelTab(restoreState.activeSidePanelTab);
    }
    if (canvasMode === 'preview') {
      previewManager.restoreSelectedTarget?.(
        restoreState.selectedTarget || restoreState.selectedTargetKey || null
      );
      previewManager.requestTargetRefresh?.(restoreState.selectedTarget || null);
    }
    window.requestAnimationFrame(() => {
      if (el.pbCanvas) {
        el.pbCanvas.scrollTop = restoreState.scrollTop || 0;
        el.pbCanvas.scrollLeft = restoreState.scrollLeft || 0;
      }
      el.pbEnterPreview?.focus();
    });
    return { ok: true };
  }

  function getReaderUrl(page) {
    const params =
      page?.scope === 'global'
        ? new URLSearchParams({
            pageScope: 'global',
            page: String(page?.slug || '').trim() || 'reader',
          })
        : new URLSearchParams({
            series: page?.seriesId || getSeriesId(),
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
    // Layout is a top-level section field, not a setting; saveSectionSettings reads it
    // separately from the draft and sends it atomically alongside settings.
    delete settings.layout;
    ['moduleGap', 'columnGap', 'sectionGap', 'paddingTop', 'paddingBottom', 'minHeight'].forEach(
      (key) => {
        const value = settings?.[key];
        if (value !== '' && value !== null && value !== undefined) {
          settings[key] = value;
        } else {
          delete settings[key];
        }
      }
    );
    if (!settings.backgroundColor) {
      delete settings.backgroundColor;
    }
    settings.columns = pruneSectionColumns(settings.columns, draft?.layout);
    if (!settings.columns.length) {
      delete settings.columns;
    }
    settings.responsive = pruneEmptyResponsiveOverrides(settings.responsive);
    if (!Object.keys(settings.responsive).length) {
      delete settings.responsive;
    }
    return settings;
  }

  function getSectionLayoutFromDraft(draft = activeSectionDraft) {
    return ratiosToLayout(parseLayoutRatios(draft?.layout || '1'));
  }

  // After an atomic section update the backend may have rehomed modules orphaned by a
  // column-count reduction; mirror the returned column/sort indexes onto local records
  // so the canvas reflects the new placement without a reload.
  function syncSectionModulesFromUpdate(section, updated) {
    if (!section || !Array.isArray(updated?.modules)) return;
    const byId = new Map((section.modules || []).map((module) => [module.id, module]));
    updated.modules.forEach((updatedModule) => {
      const local = byId.get(updatedModule.id);
      if (local) {
        local.columnIndex = updatedModule.columnIndex;
        local.sortIndex = updatedModule.sortIndex;
      }
    });
  }

  // Drop column entries that fall outside the effective column count or carry no
  // styling beyond their index; the backend sanitizer makes the final decision.
  function pruneSectionColumns(columns, layout) {
    if (!Array.isArray(columns)) return [];
    const count = parseLayoutRatios(layout || '1').length;
    return columns
      .filter((column) => column && typeof column === 'object')
      .map((column) => ({ ...column, index: Number(column.index) }))
      .filter(
        (column) => Number.isInteger(column.index) && column.index >= 0 && column.index < count
      )
      .filter((column) => Object.keys(column).some((key) => key !== 'index'));
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
    selectedColumnIndex = null;
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
    if (
      ['moduleGap', 'columnGap', 'sectionGap', 'paddingTop', 'paddingBottom', 'minHeight'].includes(
        key
      )
    ) {
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

  function ensureSectionColumnEntry(index) {
    if (!Array.isArray(activeSectionDraft.columns)) activeSectionDraft.columns = [];
    let entry = activeSectionDraft.columns.find((col) => Number(col?.index) === index);
    if (!entry) {
      entry = { index };
      activeSectionDraft.columns.push(entry);
      activeSectionDraft.columns.sort((a, b) => Number(a.index) - Number(b.index));
    }
    return entry;
  }

  function cleanupSectionColumnEntry(entry) {
    if (!entry || !Array.isArray(activeSectionDraft?.columns)) return;
    if (entry.responsive) {
      entry.responsive = pruneEmptyResponsiveOverrides(entry.responsive);
      if (!Object.keys(entry.responsive).length) {
        delete entry.responsive;
      }
    }
    if (!Object.keys(entry).some((key) => key !== 'index')) {
      activeSectionDraft.columns = activeSectionDraft.columns.filter((item) => item !== entry);
    }
    if (!activeSectionDraft.columns.length) {
      delete activeSectionDraft.columns;
    }
  }

  function ensureSectionColumnEditTarget(index) {
    const entry = ensureSectionColumnEntry(index);
    if (responsiveEditScope !== 'device') return { entry, target: entry };
    entry.responsive =
      entry.responsive && typeof entry.responsive === 'object' ? entry.responsive : {};
    entry.responsive[activeDeviceId] =
      entry.responsive[activeDeviceId] && typeof entry.responsive[activeDeviceId] === 'object'
        ? entry.responsive[activeDeviceId]
        : {};
    return { entry, target: entry.responsive[activeDeviceId] };
  }

  function setActiveSectionColumnCount(rawCount) {
    if (!activeSectionDraft) return;
    const globalRatios = parseLayoutRatios(activeSectionDraft.layout || '1');
    if (responsiveEditScope === 'device') {
      const raw = String(rawCount ?? '').trim();
      if (!raw || raw === 'inherit') {
        setResponsiveOverrideValue(activeSectionDraft, activeDeviceId, 'layout', '');
      } else {
        const count = Math.max(1, Math.min(globalRatios.length, Math.round(Number(rawCount) || 1)));
        const branchLayout = activeSectionDraft.responsive?.[activeDeviceId]?.layout;
        const sourceRatios = branchLayout ? parseLayoutRatios(branchLayout) : globalRatios;
        const next = [];
        for (let index = 0; index < count; index += 1) {
          next.push(sourceRatios[index] ?? globalRatios[index] ?? 1);
        }
        setResponsiveOverrideValue(
          activeSectionDraft,
          activeDeviceId,
          'layout',
          ratiosToLayout(next)
        );
      }
      markDirty('section');
      renderCanvas();
      renderEditorPanel();
      return;
    }

    const count = Math.max(1, Math.min(MAX_COLUMNS, Math.round(Number(rawCount) || 1)));
    // Guard (client mirror of the backend authority): don't reduce the column count
    // while a to-be-removed column still has modules. The backend rejects this (409),
    // so surface guidance up front instead of mutating the draft into an unsavable state.
    const blockedColumns = [
      ...new Set(
        (getSectionRecord(activeSectionId)?.modules || [])
          .map((module) => Number(module.columnIndex) || 0)
          .filter((index) => index >= count)
      ),
    ].sort((a, b) => a - b);
    if (blockedColumns.length) {
      setCanvasStatus(
        `Move or delete the modules in column ${blockedColumns
          .map((index) => index + 1)
          .join(', ')} before reducing the column count.`,
        'warning'
      );
      renderEditorPanel();
      return;
    }
    const ratios = globalRatios;
    // Appended columns get an average share of the existing weights (not weight 1, which
    // would be a sliver under percent-scale weight strings like '20-60-20').
    const appendWeight = Math.max(
      1,
      Math.round(ratios.reduce((sum, r) => sum + r, 0) / ratios.length)
    );
    const next = [];
    for (let i = 0; i < count; i++) next.push(ratios[i] ?? appendWeight);
    activeSectionDraft.layout = ratiosToLayout(next);
    if (Array.isArray(activeSectionDraft.columns)) {
      activeSectionDraft.columns = activeSectionDraft.columns.filter(
        (col) => Number(col?.index) < count
      );
    }
    markDirty('section');
    renderCanvas();
    renderEditorPanel();
  }

  // `rawValue` is the column's requested width as a PERCENT of the row (the inspector
  // inputs work in percent steps). The other columns renormalize proportionally so the
  // weights always sum to 100 — finer control than stepping small integer ratios.
  function updateActiveSectionColumnRatio(rawIndex, rawValue) {
    if (!activeSectionDraft) return;
    const index = Number(rawIndex);
    const branchLayout =
      responsiveEditScope === 'device'
        ? activeSectionDraft.responsive?.[activeDeviceId]?.layout
        : null;
    const current = parseLayoutRatios(branchLayout || activeSectionDraft.layout || '1');
    if (!Number.isInteger(index) || index < 0 || index >= current.length) return;
    if (current.length === 1) return; // a single column is always the full row
    const requested = Math.round(Number(rawValue) || 0);
    const clamped = Math.max(5, Math.min(90, requested));
    const oldOtherTotal = current.reduce((sum, r, i) => (i === index ? sum : sum + r), 0);
    const otherBudget = 100 - clamped;
    const ratios = current.map((r, i) => {
      if (i === index) return clamped;
      const share = oldOtherTotal > 0 ? r / oldOtherTotal : 1 / (current.length - 1);
      return Math.max(1, Math.round(share * otherBudget));
    });
    // Fix rounding drift so the weights sum to exactly 100 (adjust the widest other column).
    const drift = 100 - ratios.reduce((sum, r) => sum + r, 0);
    if (drift !== 0) {
      let adjust = -1;
      ratios.forEach((r, i) => {
        if (i !== index && (adjust === -1 || r > ratios[adjust])) adjust = i;
      });
      if (adjust !== -1) ratios[adjust] = Math.max(1, ratios[adjust] + drift);
    }
    if (responsiveEditScope === 'device') {
      setResponsiveOverrideValue(
        activeSectionDraft,
        activeDeviceId,
        'layout',
        ratiosToLayout(ratios)
      );
    } else {
      activeSectionDraft.layout = ratiosToLayout(ratios);
    }
    markDirty('section');
    renderCanvas();
    renderEditorPanel();
  }

  function updateActiveSectionColumnField(rawIndex, key, rawValue, options = {}) {
    if (!activeSectionDraft || !key) return;
    const index = Number(rawIndex);
    const globalColumnCount = parseLayoutRatios(activeSectionDraft.layout || '1').length;
    if (!Number.isInteger(index) || index < 0 || index >= globalColumnCount) return;
    const { entry, target } = ensureSectionColumnEditTarget(index);
    switch (key) {
      case 'hidden': {
        if (responsiveEditScope === 'device') {
          const value = String(rawValue ?? '').trim();
          if (!value || value === 'inherit') delete target.hidden;
          else target.hidden = value === 'true';
        } else if (rawValue) {
          target.hidden = true;
        } else {
          delete target.hidden;
        }
        break;
      }
      case 'alignment': {
        const raw = String(rawValue || '').trim();
        const value = raw === 'inherit' ? '' : raw;
        if (value && (responsiveEditScope === 'device' || value !== 'stretch')) {
          target.alignment = value;
        } else {
          delete target.alignment;
        }
        break;
      }
      case 'minHeight': {
        const raw = String(rawValue ?? '').trim();
        if (raw) target.minHeight = Math.max(0, Math.round(Number(raw) || 0));
        else delete target.minHeight;
        break;
      }
      case 'appearance': {
        if (rawValue && typeof rawValue === 'object' && Object.keys(rawValue).length) {
          target.appearance = cloneValue(rawValue);
        } else {
          delete target.appearance;
        }
        break;
      }
      case 'paddingTop':
      case 'paddingRight':
      case 'paddingBottom':
      case 'paddingLeft': {
        const side = key.replace('padding', '').toLowerCase();
        const raw = String(rawValue ?? '').trim();
        const padding = { ...(target.padding || {}) };
        if (raw) padding[side] = Math.max(0, Math.round(Number(raw) || 0));
        else delete padding[side];
        if (Object.keys(padding).length) target.padding = padding;
        else delete target.padding;
        break;
      }
      case 'panelBackground': {
        // Non-responsive: panel background art lives on the global column entry, not a device branch.
        if (rawValue && typeof rawValue === 'object' && Object.keys(rawValue).length) {
          entry.panelBackground = cloneValue(rawValue);
        } else {
          delete entry.panelBackground;
        }
        break;
      }
      case 'panelGap': {
        // Non-responsive: write module spacing to the global column entry.
        const raw = String(rawValue ?? '').trim();
        if (raw) entry.panelGap = Math.max(0, Math.round(Number(raw) || 0));
        else delete entry.panelGap;
        break;
      }
      default:
        return;
    }
    cleanupSectionColumnEntry(entry);
    markDirty('section');
    renderCanvas();
    if (options.rerenderEditor !== false) {
      renderEditorPanel();
    }
  }

  function discardSectionSettings() {
    if (!activeSectionId) return;
    draftManager.initializeSectionDraft(activeSectionId);
    clearDirty('section');
    setCanvasStatus('Section changes discarded.', 'neutral');
    renderCanvas();
  }

  async function saveSectionSettings() {
    if (!activeSectionId || !activeSectionDraft) return false;

    const section = getSectionRecord(activeSectionId);
    if (!section) return false;

    const settings = buildSectionSettingsFromDraft(activeSectionDraft);
    const layout = getSectionLayoutFromDraft(activeSectionDraft);

    // Layout (column count/ratio) and settings (per-column styling, spacing) save in one
    // request; the backend rejects (409) a column-count reduction that would orphan
    // modules, which surfaces here as a failed save (the column-count control guards
    // against this up front).
    let updateError = '';
    const updated = await updateSection(
      activeSectionId,
      { layout, settings },
      {
        onError: (error) => {
          updateError = error?.message || '';
        },
      }
    );
    if (updated) {
      section.settings = updated.settings || settings;
      section.layout = updated.layout || layout;
      syncSectionModulesFromUpdate(section, updated);
      draftManager.initializeSectionDraft(activeSectionId);
      clearDirty('section');
      setCanvasStatus('Section settings saved.', 'success');
      renderCanvas();
      return true;
    }

    setCanvasStatus(updateError || 'Failed to save section settings.', 'danger');
    renderCanvas();
    return false;
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

  function selectModule(moduleId, options = {}) {
    if (selectedModuleId === moduleId) return true;
    if (!getSelectedModuleRecord(moduleId)) return false;
    if (
      dirtyScope === 'module' ||
      dirtyScope === 'theme' ||
      dirtyScope === 'header' ||
      dirtyScope === 'section' ||
      dirtyScope === 'structure'
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
    if (inlineEditState?.moduleId !== moduleId) {
      clearInlineEditView('target-switch', 'cancel');
    }
    selectedCanvasSurface = null;
    selectedColumnIndex = null;
    draftManager.clearActiveSectionState();
    activeEditorTab = 'modules';
    draftManager.initializeModuleDraft(moduleId);
    setEditorStatus('', 'neutral');
    if (options.renderCanvas !== false) {
      renderCanvas();
    }
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
    selectedColumnIndex = null;
    activeEditorTab = 'modules';
    draftManager.initializeSectionDraft(sectionId);
    setCanvasStatus('', 'neutral');
    renderCanvas();
    renderEditorPanel();
    showSidePanelTab('settings');
    return true;
  }

  function selectColumnFromCanvas(sectionId, columnIndex) {
    if (!sectionId || !getSectionRecord(sectionId)) return false;
    const index = Number(columnIndex);
    if (!Number.isInteger(index) || index < 0) return false;
    if (
      selectedCanvasSurface === 'column' &&
      activeSectionId === sectionId &&
      selectedColumnIndex === index
    ) {
      return true;
    }
    // Switching to a column in a different section behaves like a section switch (guarded);
    // moving between columns of the already-active section keeps the draft (no save prompt).
    const sameActiveSection = activeSectionId === sectionId && !!activeSectionDraft;
    if (!sameActiveSection) {
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
        !ensureCleanWorkspace('Save or discard your current changes before selecting a column.')
      ) {
        renderEditorPanel();
        return false;
      }
      draftManager.clearSelectedModuleState();
      activeEditorTab = 'modules';
      draftManager.initializeSectionDraft(sectionId);
    }
    const columnCount = parseLayoutRatios(activeSectionDraft?.layout || '1').length;
    if (index >= columnCount) return false;
    selectedCanvasSurface = 'column';
    selectedColumnIndex = index;
    setCanvasStatus('', 'neutral');
    renderCanvas();
    renderEditorPanel();
    showSidePanelTab('settings');
    return true;
  }

  // Escalate from a selected module to its owning column/panel (used by the module inspector's
  // "Edit parent column" affordance, since a click inside a populated column selects the module).
  function selectParentColumnFromModule(moduleId) {
    const location = getModuleLocation(moduleId);
    if (!location) return false;
    return selectColumnFromCanvas(location.section.id, Number(location.module.columnIndex) || 0);
  }

  // ── Header block placement from the live canvas ─────────────────────────
  // Toolbar arrows and on-canvas drops mutate the header draft (same save/discard
  // lifecycle as the header editor); nothing is written until the draft is saved.

  function canMoveHeaderBlocks() {
    if (!currentPage) return false;
    if (!dirtyScope || dirtyScope === 'header') return true;
    setEditorStatus('Save or discard your current changes before moving header blocks.', 'warning');
    return false;
  }

  function commitHeaderPlacementDraft(draft, nextHeader) {
    activeHeaderDraft = { ...cloneValue(draft), header: cloneValue(nextHeader) };
    markDirty('header');
    renderEditorPanel();
    previewManager.requestTargetRefresh?.();
    return { ok: true };
  }

  function stepHeaderBlockPlacement(blockId, direction) {
    if (!blockId || !canMoveHeaderBlocks()) return { ok: false };
    const draft = activeHeaderDraft || draftManager.normalizeHeaderDraft(currentPage);
    const placement = findBlockPlacement(draft.header, blockId);
    if (direction === 'left' || direction === 'right') {
      const regionIndex = HEADER_REGION_ORDER.indexOf(placement.region);
      const nextRegion = HEADER_REGION_ORDER[regionIndex + (direction === 'left' ? -1 : 1)];
      if (!nextRegion) {
        return { ok: false, status: `Already in the ${placement.region} region.` };
      }
      return commitHeaderPlacementDraft(
        draft,
        moveBlockAcrossRegions(draft.header, blockId, direction === 'left' ? -1 : 1)
      );
    }
    if (direction === 'up' || direction === 'down') {
      const rowIndex = HEADER_ROW_ORDER.indexOf(placement.rowId);
      const nextRowId = HEADER_ROW_ORDER[rowIndex + (direction === 'up' ? -1 : 1)];
      if (!nextRowId) {
        return { ok: false, status: `Already in the ${placement.rowId} row.` };
      }
      return commitHeaderPlacementDraft(
        draft,
        moveBlockAcrossRows(draft.header, blockId, direction === 'up' ? -1 : 1)
      );
    }
    return { ok: false, status: `Unknown move direction: ${direction}` };
  }

  function moveHeaderBlockToCell(blockId, rowId, region) {
    if (!blockId || !canMoveHeaderBlocks()) return { ok: false };
    if (!HEADER_ROW_ORDER.includes(rowId) || !HEADER_REGION_ORDER.includes(region)) {
      return { ok: false, status: 'That header cell does not exist.' };
    }
    const draft = activeHeaderDraft || draftManager.normalizeHeaderDraft(currentPage);
    return commitHeaderPlacementDraft(
      draft,
      moveBlockToPlacement(draft.header, blockId, rowId, region)
    );
  }

  function selectCanvasTarget(target) {
    if (!target || typeof target !== 'object') return false;
    if (target.kind === 'module') {
      const accepted = selectModule(target.moduleId);
      if (accepted) showSidePanelTab('settings');
      return accepted;
    }
    if (target.kind === 'header') {
      clearInlineEditView('target-switch', 'cancel');
      const accepted = selectPageHeaderFromCanvas();
      if (accepted) showSidePanelTab('settings');
      // Clicking a specific header block on the canvas highlights its Parts row in the
      // header editor so the inspector maps 1:1 to what was clicked (edit-in-place).
      if (accepted && target.blockId) {
        window.setTimeout(() => {
          const editorRoot = el.pbModuleEditor || document;
          editorRoot
            .querySelectorAll('.pb-header-toggle-row.is-canvas-selected')
            .forEach((row) => row.classList.remove('is-canvas-selected'));
          const row = editorRoot.querySelector(
            `.pb-header-toggle-row[data-block-id="${target.blockId}"]`
          );
          if (row) {
            row.classList.add('is-canvas-selected');
            row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }, 0);
      }
      return accepted;
    }
    if (target.kind === 'page') {
      clearInlineEditView('target-switch', 'cancel');
      const accepted = selectPageSettingsFromCanvas();
      if (accepted) showSidePanelTab('settings');
      return accepted;
    }
    if (target.kind === 'section') {
      clearInlineEditView('target-switch', 'cancel');
      return selectSectionFromCanvas(target.sectionId);
    }
    if (target.kind === 'column' && target.sectionId) {
      clearInlineEditView('target-switch', 'cancel');
      return selectColumnFromCanvas(target.sectionId, target.columnIndex);
    }
    return false;
  }

  async function deleteModuleFromCanvas(moduleId) {
    const invalidation = getReaderBindingInvalidationWarning(currentPage, {
      pageBindings,
      seriesId: getSeriesId(),
      deviceId: activeDeviceId,
      removeModuleId: moduleId,
    });
    const confirmMessage = invalidation
      ? `${invalidation.message}\n\nDelete this module? This cannot be undone.`
      : 'Delete this module? This cannot be undone.';
    if (!confirm(confirmMessage)) return false;
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
    const invalidation = getReaderBindingInvalidationWarning(currentPage, {
      pageBindings,
      seriesId: getSeriesId(),
      deviceId: activeDeviceId,
      removeSectionId: sectionId,
    });
    const confirmMessage = invalidation
      ? `${invalidation.message}\n\nDelete this section and all its modules?`
      : 'Delete this section and all its modules?';
    if (!confirm(confirmMessage)) return false;

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
    pageActions.syncPublicationActions();
    renderLayerTree();
    syncCanvasModeUi();

    if (canvasMode === 'preview') {
      previewManager.renderPreview({ builderEditing: editorChromeMode === 'edit' });
      renderLiveCanvasStatus();
      if (editorChromeMode === 'edit') {
        renderStructureDebugSurface(true);
      }
      return;
    }

    renderLiveCanvasStatus();
    renderStructureDebugSurface(false);
  }

  function renderLiveCanvasStatus() {
    const existing = el.pbCanvas?.querySelector('.pb-live-canvas-status');
    if (
      !el.pbCanvas ||
      canvasMode !== 'preview' ||
      editorChromeMode !== 'edit' ||
      !canvasStatus.message
    ) {
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
    syncChromeModeUi();
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
    if (activeEntrypoint === 'designer') {
      activePageScope = 'series';
    }
    canvasMode = 'preview';
    editorChromeMode = 'edit';
    preChromeCanvasMode = null;
    previewChromeRestoreState = null;

    hideAllSections();
    if (el.adminDashboard) {
      el.adminDashboard.classList.add('admin-page-builder-open');
    }
    if (el.pageBuilderSection) {
      el.pageBuilderSection.style.display = '';
      el.pageBuilderSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveNav(el.btnDesigner);

    builderRuntime = validateBuilderRuntimeContract(await fetchPageBuilderRuntime());
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
      el.pbToggleSidebar.addEventListener('click', () => {
        runCommand(BUILDER_COMMANDS.TOGGLE_MENUS);
      });
    }

    if (el.pbToggleEditor) {
      el.pbToggleEditor.addEventListener('click', () => {
        runCommand(BUILDER_COMMANDS.TOGGLE_MENUS);
      });
    }

    el.pbExitBuilder?.addEventListener('click', exitBuilder);
    el.pbEnterPreview?.addEventListener('click', () => {
      runCommand(BUILDER_COMMANDS.ENTER_PREVIEW);
    });
    el.pbRestorePreviewChrome?.addEventListener('click', () => {
      runCommand(BUILDER_COMMANDS.EXIT_PREVIEW);
    });
    keymapManager?.bind();

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
    const addPageTemplateSelect = /** @type {HTMLSelectElement|null} */ (
      document.getElementById('pbPageTemplateSelect')
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

    const syncAddPageTemplateOptions = () => {
      const readerOption = addPageTemplateSelect?.querySelector('option[value="reader"]');
      if (readerOption) {
        readerOption.disabled = activePageScope === 'global';
      }
      if (activePageScope === 'global' && addPageTemplateSelect?.value === 'reader') {
        addPageTemplateSelect.value = 'blank';
      }
    };

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
        syncAddPageTemplateOptions();
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
      const templateId = addPageTemplateSelect?.value || 'blank';
      if (!slug || !title) return;

      const submitBtn = /** @type {HTMLButtonElement|null} */ (
        addPageForm.querySelector('button[type="submit"]')
      );
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
      }

      const newPage = await pageActions.createPageForActiveScope(slug, title);
      try {
        if (newPage) {
          await applyPageTemplate(newPage, templateId);
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
      await pageActions.savePage();
    });

    el.pbPublish?.addEventListener('click', async () => {
      await pageActions.updatePublishState(currentPage?.isPublished !== true);
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
        if (runCommand(BUILDER_COMMANDS.SET_DEVICE, { deviceId: nextWidth })?.ok === false) {
          return;
        }

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

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
import { createSectionSettingsEditor } from './page-builder/section-settings-editor.js';
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
} from '../shared/page-builder/helpers.js';
import {
  HEADER_REGION_ORDER,
  HEADER_ROW_ORDER,
  createEffectivePageHeader,
  createPageHeaderMeta,
} from '../shared/page-builder/header-config.js';
import {
  findBlockPlacement,
  moveBlockAcrossRegions,
  moveBlockAcrossRows,
  moveBlockToPlacement,
} from './page-builder/header-placement.js';
import { createChromeModeController } from './page-builder/chrome-mode.js';
import { createInlineEditController } from './page-builder/inline-edit.js';
import { createBuilderKeymapManager } from './page-builder/keymaps.js';
import { normalizeHeaderNavItems } from '../shared/page-builder/link-utils.js';
import { createPageActions } from './page-builder/page-actions.js';
import { createSelectionController } from './page-builder/selection.js';
import { createPreviewManager } from './page-builder/preview-manager.js';
import { createSidebarPanel } from './page-builder/sidebar-panel.js';
import {
  BUILDER_STRUCTURAL_COMMANDS,
  createStructuralCommandAdapter,
} from './page-builder/structural-commands.js';
import { BUILDER_DEVICE_ORDER } from '../shared/page-builder/preview-contract.js';
import {
  READER_BINDING_DEFAULT_DEVICE,
  getReaderBindingInvalidationWarning,
  validateReaderBindingPage,
} from './page-builder/reader-binding-validation.js';
import {
  validateBuilderRuntimeContract,
  pruneEmptyResponsiveOverrides,
  setResponsiveOverrideValue,
} from '../shared/page-builder/responsive-overrides.js';
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
  // Single mutable builder state shared by the shell and every factory below;
  // factories receive `getState: () => state` and read fields at call time.
  const state = {
    pages: [],
    linkPages: [],
    currentPage: null,
    /** @type {'series'|'global'} */
    activePageScope: 'series',
    pageBindings: { bindings: {}, warnings: [] },
    selectedModuleId: null,
    selectedCanvasSurface: null,
    selectedColumnIndex: null,
    activeEditorTab: 'modules',
    activeSidePanelTab: 'pages',
    editorResizeBound: false,
    editorStatus: { type: 'neutral', message: '' },
    canvasStatus: { type: 'neutral', message: '' },
    activeInsertTarget: null,
    draggedModuleId: null,
    draggedSectionId: null,
    liveDragState: null,
    /** @type {'desktop'|'tablet'|'mobile'} */
    activeDeviceId: BUILDER_DEVICE_ORDER[0],
    /** @type {'global'|'device'} */
    responsiveEditScope: 'global',
    builderRuntime: validateBuilderRuntimeContract(null),
    /** @type {'builder'|'designer'} */
    activeEntrypoint: 'builder',
    /** @type {''|'header'} */
    activeDesignerSurface: '',
    // Draft state is owned by the draft manager; these read-only views keep the
    // existing `state.*` reads (shell and factories) stable. Writes go through
    // the draftManager API.
    get dirtyScope() {
      return draftManager.getDirtyScope();
    },
    get activeModuleDraftId() {
      return draftManager.getModuleDraftId();
    },
    get activeModuleDraft() {
      return draftManager.getDraft('module');
    },
    get activeThemeDraft() {
      return draftManager.getDraft('theme');
    },
    get activeHeaderDraft() {
      return draftManager.getDraft('header');
    },
    get activePageSettingsDraft() {
      return draftManager.getDraft('page-settings');
    },
    get activeSectionId() {
      return draftManager.getActiveSectionId();
    },
    get activeSectionDraft() {
      return draftManager.getDraft('section');
    },
    // Inline text editing state is owned by the inline-edit controller.
    get inlineEditState() {
      return inlineEdit.getInlineEditState();
    },
    // Canvas/chrome mode is owned by the chrome-mode controller.
    get canvasMode() {
      return chromeMode.getCanvasMode();
    },
    get editorChromeMode() {
      return chromeMode.getEditorChromeMode();
    },
    // Computed views a few factories consume by these names.
    get linkablePages() {
      return this.linkPages.length ? this.linkPages : this.pages;
    },
    get selectedTarget() {
      return selection.getSelectedTarget();
    },
    get builderOpen() {
      return el.pageBuilderSection?.style.display !== 'none';
    },
    // Legacy alias read by the preview manager; state.activeDeviceId is the source of truth.
    get previewWidth() {
      return this.activeDeviceId;
    },
  };
  let structuralCommands = null;
  let commandRegistry = null;
  let keymapManager = null;

  // Every command — structural ones included — routes through the registry; the
  // structural adapter is registered into it as a manager during wiring.
  function runCommand(commandId, payload = {}) {
    if (!commandRegistry) return { ok: false, status: 'Builder commands unavailable.' };
    return commandRegistry.runCommand(commandId, payload);
  }

  function canRunCommand(commandId, payload = {}) {
    return commandRegistry?.canRunCommand(commandId, payload) !== false;
  }

  const draftManager = createDraftManager({
    getState: () => state,
    actions: {
      getSelectedModuleRecord,
      getSectionRecord,
      syncPageSummary,
      buildNormalizedPageMeta,
      setEditorStatus,
      setCanvasStatus,
      setSelectedModuleId: (nextModuleId) => {
        state.selectedModuleId = nextModuleId ?? null;
      },
      updateEditorFooterUi: () => updateEditorFooterUi(),
      refreshLiveCanvas: () => refreshLiveCanvasForDraftChange(),
      refreshPreviewSnapshot: () =>
        previewManager.refreshPreviewSnapshotState?.({
          builderEditing: state.editorChromeMode === 'edit',
        }),
      syncInlineEditToPreview: (reason) => inlineEdit.syncDraftToPreview(reason),
      syncInlineDraftFromHistory: (snapshot, reason) =>
        inlineEdit.syncDraftFromHistory(snapshot, reason),
      clearInlineEditView: (reason, mode) => inlineEdit.clearInlineEditView(reason, mode),
      saveSectionSettings: () => sectionSettings.saveSectionSettings(),
      discardSectionSettings: () => sectionSettings.discardSectionSettings(),
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

  const sectionSettings = createSectionSettingsEditor({
    getState: () => state,
    actions: {
      getSectionRecord,
      markDirty,
      clearDirty,
      setCanvasStatus,
      initializeSectionDraft: (sectionId) => draftManager.initializeSectionDraft(sectionId),
      clearActiveSectionState: () => draftManager.clearActiveSectionState(),
      clearSelectedModuleState: () => draftManager.clearSelectedModuleState(),
      setSelectedCanvasSurface: (surface) => {
        state.selectedCanvasSurface = surface;
      },
      setSelectedColumnIndex: (index) => {
        state.selectedColumnIndex = index;
      },
      setActiveEditorTab: (nextTab) => {
        state.activeEditorTab = nextTab;
      },
      renderCanvas: () => renderCanvas(),
      renderEditorPanel: () => renderEditorPanel(),
    },
    deps: {
      updateSection,
    },
  });

  const renderEditorPanel = createEditorPanelRenderer({
    el,
    getState: () => state,
    actions: {
      ensureCleanWorkspace,
      initializeThemeDraft: draftManager.initializeThemeDraft,
      initializeHeaderDraft: draftManager.initializeHeaderDraft,
      initializePageSettingsDraft: draftManager.initializePageSettingsDraft,
      initializeModuleDraft: draftManager.initializeModuleDraft,
      setActiveEditorTab: (nextTab) => {
        state.activeEditorTab = nextTab;
      },
      setResponsiveEditScope: (nextScope) => {
        const safeScope = nextScope === 'device' ? 'device' : 'global';
        if (state.responsiveEditScope === safeScope) return;
        state.responsiveEditScope = safeScope;
        draftManager.resetVisibleResponsiveDraftHistory();
      },
      setActiveThemeDraft: (nextDraft) => {
        draftManager.setDraft('theme', nextDraft);
      },
      setActiveHeaderDraft: (nextDraft) => {
        draftManager.setDraft('header', nextDraft);
      },
      updateActivePageSettingsDraftField: (key, value) => {
        if (!state.activePageSettingsDraft) return;
        state.activePageSettingsDraft[key] = value;
        markDirty('page-settings');
        renderEditorPanel();
      },
      updateActiveSectionDraftField: sectionSettings.updateActiveSectionDraftField,
      setActiveSectionColumnCount: sectionSettings.setActiveSectionColumnCount,
      updateActiveSectionColumnRatio: sectionSettings.updateActiveSectionColumnRatio,
      updateActiveSectionColumnField: sectionSettings.updateActiveSectionColumnField,
      selectParentColumn: (moduleId) => selection.selectParentColumnFromModule(moduleId),
      setActiveModuleDraft: (nextDraft) => {
        draftManager.setDraft('module', nextDraft);
      },
      setActiveModuleDraftId: (nextDraftId) => {
        draftManager.setModuleDraftId(nextDraftId);
      },
      setSelectedModuleId: (nextModuleId) => {
        state.selectedModuleId = nextModuleId ?? null;
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
      saveSectionSettings: sectionSettings.saveSectionSettings,
      discardSectionSettings: sectionSettings.discardSectionSettings,
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
    getState: () => state,
    actions: {
      ensureCleanWorkspace,
      setActiveInsertTarget: (target) => {
        state.activeInsertTarget = target;
      },
      setCanvasStatus,
      renderCanvas: () => renderCanvas(),
      replaceCurrentPageAfterMutationFailure: (nextPage) => {
        state.currentPage = nextPage;
        draftManager.clearSelectedModuleState();
        draftManager.clearActiveSectionState();
        state.selectedCanvasSurface = null;
        draftManager.resetDirty();
        draftManager.clearStructureDraft();
        state.activeInsertTarget = null;
        state.liveDragState = null;
        inlineEdit.clearInlineEditView('mutation-reconciliation', 'cancel');
        draftManager.clearDraftHistory();
        draftManager.setDraft('theme', draftManager.normalizeThemeDraft(state.currentPage));
        draftManager.setDraft('header', draftManager.normalizeHeaderDraft(state.currentPage));
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
    getState: () => state,
    actions: {
      insertSectionAt: (insertIndex) =>
        runCommand(BUILDER_STRUCTURAL_COMMANDS.INSERT_SECTION, {
          sectionIndex: insertIndex,
        }),
      reorderSectionToIndex: (sectionId, insertIndex) =>
        runCommand(BUILDER_STRUCTURAL_COMMANDS.MOVE_SECTION, {
          sectionId,
          placement: { sectionIndex: insertIndex },
        }),
      setDraggedSectionId: (sectionId) => {
        state.draggedSectionId = sectionId;
      },
      changeSectionLayout: canvasMutations.changeSectionLayout,
      toggleSectionSettings: sectionSettings.toggleSectionSettings,
      updateActiveSectionDraftField: sectionSettings.updateActiveSectionDraftField,
      setActiveSectionColumnCount: sectionSettings.setActiveSectionColumnCount,
      updateActiveSectionColumnRatio: sectionSettings.updateActiveSectionColumnRatio,
      updateActiveSectionColumnField: sectionSettings.updateActiveSectionColumnField,
      discardSectionSettings: sectionSettings.discardSectionSettings,
      saveSectionSettings: sectionSettings.saveSectionSettings,
      setDraggedModuleId: (moduleId) => {
        state.draggedModuleId = moduleId;
      },
      moveModuleToTarget: (moduleId, sectionId, columnIndex, insertIndex) =>
        runCommand(BUILDER_STRUCTURAL_COMMANDS.MOVE, {
          moduleId,
          placement: { sectionId, columnIndex, insertIndex },
        }),
      insertModuleAt: (sectionId, columnIndex, insertIndex, moduleType) =>
        runCommand(BUILDER_STRUCTURAL_COMMANDS.INSERT, {
          moduleType,
          placement: { sectionId, columnIndex, insertIndex },
        }),
      toggleModulePicker,
      selectPageHeaderFromCanvas: () => selection.selectPageHeaderFromCanvas(),
      selectPageSettingsFromCanvas: () => selection.selectPageSettingsFromCanvas(),
      selectModule: (moduleId, options) => selection.selectModule(moduleId, options),
      selectColumn: (sectionId, columnIndex) =>
        selection.selectColumnFromCanvas(sectionId, columnIndex),
      updateActivePageSettingsDraftField: (key, value) => {
        if (!state.activePageSettingsDraft) return;
        state.activePageSettingsDraft[key] = value;
        markDirty('page-settings');
        renderEditorPanel();
      },
      saveActivePageSettingsDraft: draftManager.saveActivePageSettingsDraft,
      discardActivePageSettingsDraft: draftManager.discardActivePageSettingsDraft,
      deleteModuleFromCanvas: (moduleId) =>
        runCommand(BUILDER_STRUCTURAL_COMMANDS.DELETE_SELECTED, {
          target: { kind: 'module', moduleId },
        }),
      deleteSectionFromCanvas: (sectionId) =>
        runCommand(BUILDER_STRUCTURAL_COMMANDS.DELETE_SELECTED, {
          target: { kind: 'section', sectionId },
        }),
    },
  });

  const { renderPageList, renderLayerTree, renderModulePalette, bindSidebarTabs } =
    createSidebarPanel({
      el,
      getState: () => state,
      actions: {
        selectPage: (pageId) => pageActions.selectPage(pageId),
        switchPageScope: async (nextScope) => switchPageScope(nextScope),
        updateReaderBinding: async (pageId) => updateReaderBinding(pageId),
        deletePage: (pageId) => pageActions.deletePageFromSidebar(pageId),
        reorderSidebarPages: (pageIds) => pageActions.reorderSidebarPages(pageIds),
        setDraggedModuleId: (moduleId) => {
          state.draggedModuleId = moduleId;
        },
        runCommand,
        runStructuralCommand: runCommand,
        selectPageHeader: () => {
          selection.selectPageHeaderFromCanvas();
          showSidePanelTab('settings');
        },
        selectPageSettings: () => {
          selection.selectPageSettingsFromCanvas();
          showSidePanelTab('settings');
        },
        selectModule: (moduleId) => {
          selection.selectModule(moduleId);
          showSidePanelTab('settings');
        },
        selectSection: (sectionId) => {
          selection.selectSectionFromCanvas(sectionId);
          showSidePanelTab('settings');
        },
        selectColumn: (sectionId, columnIndex) => {
          selection.selectColumnFromCanvas(sectionId, columnIndex);
          showSidePanelTab('settings');
        },
        selectParentColumn: (moduleId) => selection.selectParentColumnFromModule(moduleId),
        selectInspectorTab: (nextTab) => selectInspectorTab(nextTab),
        setActiveSidePanelTab: (nextTab) => {
          state.activeSidePanelTab = nextTab || state.activeSidePanelTab;
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
    getState: () => state,
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
        state.pages = nextPages;
      },
      setLinkPages: (nextPages) => {
        state.linkPages = Array.isArray(nextPages) ? nextPages : [];
      },
      setPageBindings: (nextBindings) => {
        state.pageBindings =
          nextBindings && typeof nextBindings === 'object'
            ? nextBindings
            : { bindings: {}, warnings: [] };
      },
      setCurrentPage: (nextPage) => {
        state.currentPage = nextPage;
      },
      setActiveThemeDraft: (nextDraft) => {
        draftManager.setDraft('theme', nextDraft);
      },
      setActiveHeaderDraft: (nextDraft) => {
        draftManager.setDraft('header', nextDraft);
      },
      setSelectedCanvasSurface: (surface) => {
        state.selectedCanvasSurface = surface;
        if (surface !== 'column') state.selectedColumnIndex = null;
      },
      setActiveEditorTab: (nextTab) => {
        state.activeEditorTab = nextTab;
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
    getState: () => state,
    actions: {
      buildNormalizedPageMeta,
      buildSectionSettingsFromDraft: sectionSettings.buildSectionSettingsFromDraft,
      getSectionLayoutFromDraft: sectionSettings.getSectionLayoutFromDraft,
      setActiveDeviceId: (nextDeviceId) => {
        state.activeDeviceId = nextDeviceId;
      },
      setPreviewWidth: (nextWidth) => {
        state.activeDeviceId = nextWidth;
      },
      selectCanvasTarget: (target) => selection.selectCanvasTarget(target),
      renderEditorPanel: () => renderEditorPanel(),
      runCommand,
      runStructuralCommand: runCommand,
    },
    deps: {
      getSeriesId,
    },
  });

  const inlineEdit = createInlineEditController({
    getState: () => state,
    actions: {
      getSelectedModuleRecord,
      getModuleLocation: (moduleId) => selection.getModuleLocation(moduleId),
      selectModule: (moduleId, options) => selection.selectModule(moduleId, options),
      showSidePanelTab,
      renderEditorPanel: () => renderEditorPanel(),
      updateEditorFooterUi: () => updateEditorFooterUi(),
      refreshLiveCanvas: () => refreshLiveCanvasForDraftChange(),
      setModuleDraft: (moduleId, config) => draftManager.setModuleDraft(moduleId, config),
      updateModuleDraft: (nextDraft) => draftManager.setDraft('module', nextDraft),
      markModuleDraftDirtyFromIframe: () =>
        draftManager.markDirty('module', { fromInlineIframe: true }),
      syncPreviewDraft: (target, draftValue, reason) =>
        previewManager.syncInlineEditDraft?.(target, draftValue, reason),
      commitPreviewEdit: (target, draftValue, reason) =>
        previewManager.commitInlineEdit?.(target, draftValue, reason),
      cancelPreviewEdit: (target, reason) => previewManager.cancelInlineEdit?.(target, reason),
    },
  });

  const selection = createSelectionController({
    el,
    getState: () => state,
    actions: {
      getSelectedModuleRecord,
      getSectionRecord,
      ensureCleanWorkspace,
      activateHeaderSurface,
      setEditorStatus,
      setCanvasStatus,
      sortSections,
      sortModulesForColumn,
      showSidePanelTab,
      syncDesignerRoute,
      renderCanvas: () => renderCanvas(),
      renderEditorPanel: () => renderEditorPanel(),
      clearSelectedModuleState: () => draftManager.clearSelectedModuleState(),
      clearActiveSectionState: () => draftManager.clearActiveSectionState(),
      initializeModuleDraft: (moduleId) => draftManager.initializeModuleDraft(moduleId),
      initializeSectionDraft: (sectionId) => draftManager.initializeSectionDraft(sectionId),
      initializePageSettingsDraft: () => draftManager.initializePageSettingsDraft(),
      clearInlineEditView: (reason, mode) => inlineEdit.clearInlineEditView(reason, mode),
      setSelectedModuleId: (moduleId) => {
        state.selectedModuleId = moduleId;
      },
      setSelectedCanvasSurface: (surface) => {
        state.selectedCanvasSurface = surface;
      },
      setSelectedColumnIndex: (index) => {
        state.selectedColumnIndex = index;
      },
      setActiveEditorTab: (nextTab) => {
        state.activeEditorTab = nextTab;
      },
    },
  });

  const chromeMode = createChromeModeController({
    el,
    getState: () => state,
    actions: {
      syncSidebarRailLabel,
      showSidePanelTab,
      renderCanvas: () => renderCanvas(),
      renderEditorPanel: () => renderEditorPanel(),
      setCanvasStatus,
      getSelectedTarget: () => selection.getSelectedTarget(),
      getTargetKey: (target) => selection.getTargetKey(target),
      runCommand,
      clearActiveInsertTarget: () => {
        state.activeInsertTarget = null;
      },
      clearInlineEditView: (reason, mode) => inlineEdit.clearInlineEditView(reason, mode),
      resetVisibleResponsiveDraftHistory: () => draftManager.resetVisibleResponsiveDraftHistory(),
      setPreviewViewport: (deviceId) => previewManager.setViewport(deviceId),
      reflowPreviewScale: () => previewManager.reflowPreviewScale?.(),
      restorePreviewSelectedTarget: (target) => previewManager.restoreSelectedTarget?.(target),
      requestPreviewTargetRefresh: (target) => previewManager.requestTargetRefresh?.(target),
    },
  });

  structuralCommands = createStructuralCommandAdapter({
    getState: () => state,
    actions: {
      ensureCleanWorkspace,
      setLiveDragState: (nextState) => {
        state.liveDragState = nextState ? cloneValue(nextState) : null;
        previewManager.renderTargetOverlay?.();
      },
      clearLiveDragState: () => {
        state.liveDragState = null;
        previewManager.renderTargetOverlay?.();
      },
      setActiveInsertTarget: (target) => {
        state.activeInsertTarget = target ? cloneValue(target) : null;
      },
      createPendingInsertTarget: (target, position) =>
        selection.createPendingInsertTarget(target, position),
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
      selectModule: (moduleId, options) => selection.selectModule(moduleId, options),
      selectSection: (sectionId) => selection.selectSectionFromCanvas(sectionId),
      showSidePanelTab,
      requestFreshTargets: () => previewManager.requestTargetRefresh?.(),
      canMoveHeaderBlocks,
      stepHeaderBlockPlacement,
      moveHeaderBlockToCell,
    },
    helpers: {
      getModuleLabel,
      getSectionCount: () => sortSections(state.currentPage?.sections || []).length,
    },
  });

  commandRegistry = createBuilderCommandRegistry({
    getState: () => state,
    actions: {
      canDiscardCurrentDraft,
      canRedoDraft,
      canSaveCurrentDraft,
      canSelectRelativeTarget: (direction) => selection.canSelectRelativeTarget(direction),
      canUndoDraft,
      cancelTransientState: chromeMode.cancelTransientState,
      discardCurrentDraft,
      enterChromePreview: chromeMode.enterChromePreview,
      exitChromePreview: chromeMode.exitChromePreview,
      redoDraft,
      saveCurrentDraft,
      selectCanvasTarget: (target) => selection.selectCanvasTarget(target),
      selectRelativeTarget: (direction) => selection.selectRelativeTarget(direction),
      setDevice: chromeMode.setBuilderDevice,
      startInlineEdit: inlineEdit.startInlineEdit,
      changeInlineEdit: inlineEdit.changeInlineEdit,
      commitInlineEdit: inlineEdit.commitInlineEdit,
      cancelInlineEdit: inlineEdit.cancelInlineEdit,
      toggleMenus: chromeMode.toggleSidebarMode,
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
    getState: () => state,
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
      if (state.activePageScope === 'global') {
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
    if (template.seriesOnly && state.activePageScope === 'global') {
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

    const readerBinding = state.pageBindings?.bindings?.reader?.pageId;
    if (templateId === 'reader' && state.activePageScope === 'series' && !readerBinding) {
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
    return state.activeEntrypoint === 'designer';
  }

  function syncDesignerRoute(mode = 'replace') {
    if (!isDesignerMode() || typeof onDesignerRouteChange !== 'function') return;
    onDesignerRouteChange(
      {
        pageSlug: state.currentPage?.slug || '',
        surface: state.activeDesignerSurface || 'header',
      },
      mode
    );
  }

  function getSelectedModuleRecord(moduleId = state.selectedModuleId) {
    if (!state.currentPage || !moduleId) return null;
    for (const section of state.currentPage.sections || []) {
      const found = (section.modules || []).find((module) => module.id === moduleId);
      if (found) return found;
    }
    return null;
  }

  function getSectionRecord(sectionId) {
    return (state.currentPage?.sections || []).find((section) => section.id === sectionId) || null;
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

    state.activeSidePanelTab = tabName;
    sidebar
      .querySelectorAll('.pb-sidebar-tab')
      .forEach((button) => button.classList.toggle('active', button === targetTab));
    sidebar.querySelectorAll('.pb-sidebar-content').forEach((content) => {
      content.hidden = content.dataset.content !== contentTarget;
    });
    syncSidebarRailLabel();
  }

  function selectInspectorTab(nextTab) {
    if (nextTab === state.activeEditorTab) return true;
    if (
      !ensureCleanWorkspace('Save or discard your current changes before switching inspector tabs.')
    ) {
      renderEditorPanel();
      return false;
    }

    state.activeEditorTab = nextTab === 'theme' ? 'theme' : 'modules';
    if (state.activeEditorTab === 'theme') {
      draftManager.initializeThemeDraft();
    } else if (state.selectedCanvasSurface === 'page-header') {
      draftManager.initializeHeaderDraft();
    } else if (state.selectedCanvasSurface === 'page-settings') {
      draftManager.initializePageSettingsDraft();
    } else if (state.selectedModuleId) {
      draftManager.initializeModuleDraft(state.selectedModuleId);
    }
    setEditorStatus('', 'neutral');
    renderEditorPanel();
    return true;
  }

  function setEditorStatus(message = '', type = 'neutral') {
    state.editorStatus = { message, type };
    updateEditorFooterUi();
  }

  function setCanvasStatus(message = '', type = 'neutral') {
    state.canvasStatus = { message, type };
  }

  // Draft snapshots, dirty state, and undo history are owned by the draft manager;
  // these delegates keep the shell's wiring bags and UI callbacks stable.
  function canSaveCurrentDraft() {
    return draftManager.canSaveCurrentDraft();
  }

  function canDiscardCurrentDraft() {
    return draftManager.canDiscardCurrentDraft();
  }

  async function saveCurrentDraft() {
    return draftManager.saveCurrentDraft();
  }

  function discardCurrentDraft() {
    return draftManager.discardCurrentDraft();
  }

  function canUndoDraft() {
    return draftManager.canUndoDraft();
  }

  function canRedoDraft() {
    return draftManager.canRedoDraft();
  }

  function undoDraft() {
    return draftManager.undoDraft();
  }

  function redoDraft() {
    return draftManager.redoDraft();
  }

  function clearDirty(scope = null) {
    draftManager.clearDirty(scope);
  }

  function markDirty(scope) {
    draftManager.markDirty(scope);
  }

  function refreshLiveCanvasForDraftChange() {
    if (state.canvasMode !== 'preview' || !el.pbCanvas) return;
    renderCanvas();
  }

  function updateEditorFooterUi() {
    if (!el.pbModuleEditor) return;
    const footer = el.pbModuleEditor.querySelector('.pb-editor-footer');
    if (!footer) return;

    const footerScope = footer.dataset.scope;
    const isDirty =
      state.dirtyScope === footerScope ||
      (state.dirtyScope === 'structure' && footerScope === 'module');
    const statusEl = footer.querySelector('[data-editor-status]');
    const saveBtn = footer.querySelector('[data-action="save-current"]');
    const discardBtn = footer.querySelector('[data-action="discard-current"]');
    const undoBtn = footer.querySelector('[data-action="undo-current"]');
    const redoBtn = footer.querySelector('[data-action="redo-current"]');

    const moduleSaveBlocked = footerScope === 'module' && state.builderRuntime?.compatible !== true;
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
      if (state.editorStatus.message && state.editorStatus.type === 'danger') {
        message = state.editorStatus.message;
        type = 'danger';
      } else if (isDirty) {
        message =
          dirtyMessages[state.dirtyScope] || dirtyMessages[footerScope] || dirtyMessages.module;
        type = 'warning';
      } else if (state.editorStatus.message) {
        message = state.editorStatus.message;
        type = state.editorStatus.type || 'neutral';
      } else {
        message = cleanMessages[footerScope] || cleanMessages.module;
      }
      statusEl.textContent = message;
      statusEl.dataset.status = type;
    }
  }

  function ensureCleanWorkspace(message) {
    if (!state.dirtyScope) return true;
    if (state.dirtyScope === 'section') {
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
    for (const section of state.currentPage?.sections || []) {
      section.modules = (section.modules || []).filter((module) => module.id !== moduleId);
    }
  }

  function removeSectionFromCurrentPage(sectionId) {
    state.currentPage.sections = (state.currentPage.sections || []).filter(
      (section) => section.id !== sectionId
    );
  }

  function resetBuilderState() {
    draftManager.clearSelectedModuleState();
    state.selectedCanvasSurface = null;
    state.activeSidePanelTab = 'pages';
    draftManager.setDraft(
      'theme',
      state.currentPage ? draftManager.normalizeThemeDraft(state.currentPage) : null
    );
    draftManager.setDraft(
      'header',
      state.currentPage ? draftManager.normalizeHeaderDraft(state.currentPage) : null
    );
    draftManager.initializePageSettingsDraft();
    draftManager.clearActiveSectionState();
    draftManager.clearStructureDraft();
    draftManager.resetDirty();
    state.editorStatus = { type: 'neutral', message: '' };
    state.canvasStatus = { type: 'neutral', message: '' };
    state.activeInsertTarget = null;
    state.draggedModuleId = null;
    state.draggedSectionId = null;
    state.liveDragState = null;
    inlineEdit.clearInlineEditView('state-reset', 'cancel');
    chromeMode.resetChrome();
    draftManager.clearDraftHistory();
  }

  async function switchPageScope(nextScope) {
    const safeScope = nextScope === 'global' ? 'global' : 'series';
    if (safeScope === state.activePageScope) return;
    if (
      !ensureCleanWorkspace('Save or discard your current changes before switching page scopes.')
    ) {
      return;
    }
    state.activePageScope = safeScope;
    state.currentPage = null;
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
      candidatePageOverride ||
      (state.currentPage?.id === pageId ? state.currentPage : await fetchPage(pageId));
    const warnings = validateReaderBindingPage(candidatePage, {
      seriesId: getSeriesId(),
      deviceId: READER_BINDING_DEFAULT_DEVICE,
    });
    if (warnings.length) {
      state.pageBindings = {
        ...(state.pageBindings || {}),
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
        state.pageBindings = {
          ...(state.pageBindings || {}),
          warnings,
        };
      }
      setEditorStatus(lastError?.message || 'Failed to update reader page binding.', 'danger');
      renderPageList();
      renderEditorPanel();
      return;
    }
    state.pageBindings = nextBindings;
    setEditorStatus('Reader page binding updated.', 'success');
    renderPageList();
  }

  function getDefaultDesignerPage(pageSlug = '') {
    const requestedSlug = String(pageSlug || '')
      .trim()
      .toLowerCase();
    const requested = requestedSlug
      ? state.pages.find(
          (page) =>
            String(page?.slug || '')
              .trim()
              .toLowerCase() === requestedSlug
        )
      : null;
    if (requested) return requested;
    return (
      state.pages.find((page) => page?.slug === 'reader') ||
      state.pages.find((page) => page?.isHomepage) ||
      state.pages[0] ||
      null
    );
  }

  function activateHeaderSurface() {
    draftManager.clearSelectedModuleState();
    state.selectedCanvasSurface = 'page-header';
    state.activeEditorTab = 'modules';
    draftManager.initializeHeaderDraft();
    setEditorStatus('', 'neutral');
  }

  function syncPageSummary(page) {
    if (!page?.id) return;
    state.pages = state.pages.map((item) => (item.id === page.id ? { ...item, ...page } : item));
    state.linkPages = state.linkPages.map((item) =>
      item.id === page.id ? { ...item, ...page } : item
    );
    if (state.currentPage?.id === page.id) {
      state.currentPage = {
        ...state.currentPage,
        ...page,
        meta: cloneValue(page.meta ?? state.currentPage?.meta ?? {}),
        sections: Array.isArray(page.sections)
          ? cloneValue(page.sections)
          : cloneValue(state.currentPage?.sections || []),
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

  async function hideModuleOnCurrentDevice(moduleId) {
    if (state.builderRuntime?.compatible !== true) {
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
    const invalidation = getReaderBindingInvalidationWarning(state.currentPage, {
      pageBindings: state.pageBindings,
      seriesId: getSeriesId(),
      deviceId: state.activeDeviceId,
      hideModuleId: moduleId,
    });
    if (
      invalidation &&
      !confirm(`${invalidation.message}\n\nHide this module on the current device?`)
    ) {
      return false;
    }
    const nextConfig = cloneValue(module.config || {}) || {};
    setResponsiveOverrideValue(nextConfig, state.activeDeviceId, 'hidden', true);
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
    if (state.selectedModuleId === moduleId) {
      draftManager.initializeModuleDraft(moduleId);
    }
    setCanvasStatus('Module hidden on current device.', 'success');
    renderCanvas();
    renderEditorPanel();
    return true;
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

  function buildNormalizedPageHeader(
    page = state.currentPage,
    draftState = state.activeHeaderDraft
  ) {
    if (draftState?.header || draftState?.copy) {
      return createPageHeaderMeta(draftState?.header, draftState?.copy, normalizeHeaderNavItems, {
        page,
      });
    }
    return createEffectivePageHeader(page, null, normalizeHeaderNavItems);
  }

  function buildNormalizedPageMeta(page = state.currentPage, draftState = state.activeHeaderDraft) {
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

  function toggleModulePicker(target) {
    const isSameTarget =
      state.activeInsertTarget &&
      state.activeInsertTarget.sectionId === target.sectionId &&
      state.activeInsertTarget.columnIndex === target.columnIndex &&
      state.activeInsertTarget.insertIndex === target.insertIndex;
    state.activeInsertTarget = isSameTarget ? null : target;
    renderCanvas();
  }

  // ── Header block placement from the live canvas ─────────────────────────
  // Toolbar arrows and on-canvas drops mutate the header draft (same save/discard
  // lifecycle as the header editor); nothing is written until the draft is saved.

  function canMoveHeaderBlocks() {
    if (!state.currentPage) return false;
    if (!state.dirtyScope || state.dirtyScope === 'header') return true;
    setEditorStatus('Save or discard your current changes before moving header blocks.', 'warning');
    return false;
  }

  function commitHeaderPlacementDraft(draft, nextHeader) {
    draftManager.setDraft('header', { ...cloneValue(draft), header: cloneValue(nextHeader) });
    markDirty('header');
    renderEditorPanel();
    previewManager.requestTargetRefresh?.();
    return { ok: true };
  }

  function stepHeaderBlockPlacement(blockId, direction) {
    if (!blockId || !canMoveHeaderBlocks()) return { ok: false };
    const draft = state.activeHeaderDraft || draftManager.normalizeHeaderDraft(state.currentPage);
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
    const draft = state.activeHeaderDraft || draftManager.normalizeHeaderDraft(state.currentPage);
    return commitHeaderPlacementDraft(
      draft,
      moveBlockToPlacement(draft.header, blockId, rowId, region)
    );
  }

  async function deleteModuleFromCanvas(moduleId) {
    const invalidation = getReaderBindingInvalidationWarning(state.currentPage, {
      pageBindings: state.pageBindings,
      seriesId: getSeriesId(),
      deviceId: state.activeDeviceId,
      removeModuleId: moduleId,
    });
    const confirmMessage = invalidation
      ? `${invalidation.message}\n\nDelete this module? This cannot be undone.`
      : 'Delete this module? This cannot be undone.';
    if (!confirm(confirmMessage)) return false;
    if (state.selectedModuleId === moduleId && state.dirtyScope === 'module') {
      clearDirty('module');
    }

    if (await deleteModule(moduleId)) {
      removeModuleFromCurrentPage(moduleId);
      if (state.selectedModuleId === moduleId) {
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
    const invalidation = getReaderBindingInvalidationWarning(state.currentPage, {
      pageBindings: state.pageBindings,
      seriesId: getSeriesId(),
      deviceId: state.activeDeviceId,
      removeSectionId: sectionId,
    });
    const confirmMessage = invalidation
      ? `${invalidation.message}\n\nDelete this section and all its modules?`
      : 'Delete this section and all its modules?';
    if (!confirm(confirmMessage)) return false;

    if (await deleteSection(sectionId)) {
      removeSectionFromCurrentPage(sectionId);
      if (state.activeSectionId === sectionId) {
        draftManager.clearActiveSectionState();
      }
      if (state.selectedModuleId && !getSelectedModuleRecord(state.selectedModuleId)) {
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
    chromeMode.syncCanvasModeUi();

    if (state.canvasMode === 'preview') {
      previewManager.renderPreview({ builderEditing: state.editorChromeMode === 'edit' });
      renderLiveCanvasStatus();
      if (state.editorChromeMode === 'edit') {
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
      state.canvasMode !== 'preview' ||
      state.editorChromeMode !== 'edit' ||
      !state.canvasStatus.message
    ) {
      existing?.remove();
      return;
    }
    const notice = existing || document.createElement('div');
    notice.className = 'pb-canvas-notice pb-live-canvas-status';
    notice.dataset.status = state.canvasStatus.type || 'neutral';
    notice.textContent = state.canvasStatus.message;
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
      state,
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

  function exitBuilder() {
    if (!ensureCleanWorkspace('Save or discard your current changes before exiting the builder.')) {
      renderCanvas();
      renderEditorPanel();
      return;
    }
    state.activeEntrypoint = 'builder';
    state.activeDesignerSurface = '';
    if (typeof onExitBuilder === 'function') {
      onExitBuilder();
      return;
    }
    hideAllSections();
  }

  // ==================== Public Methods ====================

  async function showPageBuilderSection(options = {}) {
    const entrypoint = options.entrypoint === 'designer' ? 'designer' : state.activeEntrypoint;
    const historyMode = options.historyMode === 'push' ? 'push' : 'replace';
    const requestedPageSlug = String(options.pageSlug || '')
      .trim()
      .toLowerCase();
    const requestedSurface =
      entrypoint === 'designer'
        ? options.surface === 'header'
          ? 'header'
          : state.activeDesignerSurface || 'header'
        : '';

    state.activeEntrypoint = entrypoint;
    state.activeDesignerSurface = requestedSurface;
    if (state.activeEntrypoint === 'designer') {
      state.activePageScope = 'series';
    }
    chromeMode.resetChrome();
    chromeMode.setCanvasMode('preview');

    hideAllSections();
    if (el.adminDashboard) {
      el.adminDashboard.classList.add('admin-page-builder-open');
    }
    if (el.pageBuilderSection) {
      el.pageBuilderSection.style.display = '';
      el.pageBuilderSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveNav(el.btnDesigner);

    state.builderRuntime = validateBuilderRuntimeContract(await fetchPageBuilderRuntime());
    await pageActions.loadPages();
    renderModulePalette();

    if (state.activeEntrypoint === 'designer') {
      const targetPage = getDefaultDesignerPage(requestedPageSlug);
      if (targetPage) {
        await pageActions.activatePage(targetPage.id, {
          surface: state.activeDesignerSurface || 'header',
          historyMode,
        });
      } else {
        state.currentPage = null;
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
    chromeMode.applyEditorMode();
  }

  function initPageBuilder() {
    chromeMode.applyEditorMode();
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

    if (!state.editorResizeBound) {
      window.addEventListener('resize', chromeMode.applyEditorMode);
      state.editorResizeBound = true;
    }

    el.adminNavToggle?.addEventListener('click', () => {
      window.requestAnimationFrame(() => {
        chromeMode.applyEditorMode();
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
        readerOption.disabled = state.activePageScope === 'global';
      }
      if (state.activePageScope === 'global' && addPageTemplateSelect?.value === 'reader') {
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
            surface: isDesignerMode() ? state.activeDesignerSurface || 'header' : 'page-settings',
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
      await pageActions.updatePublishState(state.currentPage?.isPublished !== true);
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
        if (nextMode === state.canvasMode) return;

        chromeMode.setCanvasMode(nextMode);

        // Sync active classes on the toggle buttons
        el.pbViewToggles.querySelectorAll('.pb-view-toggle').forEach((node) => {
          const b = /** @type {HTMLElement} */ (node);
          b.classList.toggle('pb-view-toggle--active', b.dataset.view === state.canvasMode);
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
          b.classList.toggle('pb-width-toggle--active', b.dataset.width === state.activeDeviceId);
        });
      });
    }
  }

  function onSeriesChange() {
    const nextPageSlug = isDesignerMode() ? state.currentPage?.slug || '' : '';
    state.currentPage = null;
    resetBuilderState();
    previewManager.resetSession();
    if (el.pageBuilderSection?.style.display !== 'none') {
      showPageBuilderSection({
        entrypoint: state.activeEntrypoint,
        pageSlug: nextPageSlug,
        surface: state.activeDesignerSurface,
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

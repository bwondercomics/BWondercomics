import { THEME_COLORS } from './constants.js';
import { cloneValue } from '../../shared/page-builder/helpers.js';
import {
  createDefaultHeaderConfig,
  createEffectivePageHeader,
  getPageHeaderSource,
  normalizeHeaderConfig,
  normalizeHeaderCopy,
} from '../../shared/page-builder/header-config.js';
import { normalizeHeaderNavItems } from '../../shared/page-builder/link-utils.js';
import { BUILDER_DEVICE_ORDER } from '../../shared/page-builder/preview-contract.js';
import { moduleResponsiveContractMatches } from '../../shared/page-builder/responsive-overrides.js';
import { createDraftUndoStack } from './undo-stack.js';

// Panel background/spacing now live on the column and are edited in the Column/Panel inspector.
// The theme draft no longer models page.meta panel keys so theme save/reset never clobber the
// legacy panelBackgrounds/panelSpacing that still serve as a read-time fallback for un-migrated pages.
function getDefaultThemeDraft() {
  return {
    theme: Object.fromEntries(THEME_COLORS.map((color) => [color.key, color.default])),
  };
}

const DRAFT_HISTORY_SCOPES = ['module', 'header', 'theme', 'page-settings', 'section'];

function isDraftHistoryScope(scope) {
  return DRAFT_HISTORY_SCOPES.includes(scope);
}

function isResponsiveDraftHistoryScope(scope) {
  return scope === 'module' || scope === 'header' || scope === 'section';
}

export function createDraftManager({ getState, actions, deps }) {
  let structureSnapshot = null;

  // Draft ownership: the manager holds the draft objects, which module/section they
  // belong to, the dirty scope, and the undo history. The shell store exposes these
  // through read-only getters; every write goes through the manager API.
  const drafts = {
    module: null,
    theme: null,
    header: null,
    'page-settings': null,
    section: null,
  };
  let moduleDraftId = null;
  let activeSectionId = null;
  let dirtyScope = null;

  function getDraft(scope) {
    return drafts[scope] ?? null;
  }

  function setDraft(scope, value) {
    if (!(scope in drafts)) return;
    drafts[scope] = cloneValue(value);
  }

  function getModuleDraftId() {
    return moduleDraftId;
  }

  function setModuleDraftId(nextDraftId) {
    moduleDraftId = nextDraftId ?? null;
  }

  function setModuleDraft(moduleId, config) {
    moduleDraftId = moduleId ?? null;
    drafts.module = cloneValue(config || {}) || {};
  }

  function getActiveSectionId() {
    return activeSectionId;
  }

  function getDirtyScope() {
    return dirtyScope;
  }

  // Bare dirty reset with no UI side effects (page switch/reset paths); interactive
  // flows use clearDirty.
  function resetDirty() {
    dirtyScope = null;
  }

  // ── Draft history scopes and keys ─────────────────────────────────────────

  function getVisibleDraftScope() {
    const s = getState();
    if (!s.currentPage) return '';
    if (s.activeEditorTab === 'theme') {
      if (s.selectedCanvasSurface === 'page-header') return 'header';
      if (s.selectedModuleId) return 'module';
      return 'theme';
    }
    if (s.selectedCanvasSurface === 'page-header') return 'header';
    if (s.selectedCanvasSurface === 'page-settings') return 'page-settings';
    if (s.selectedCanvasSurface === 'section') return 'section';
    if (s.selectedModuleId) return 'module';
    return '';
  }

  function getDraftCommandScope() {
    return dirtyScope || getVisibleDraftScope();
  }

  function getDraftHistoryResponsiveContext(scope) {
    if (!isResponsiveDraftHistoryScope(scope)) return '';
    const s = getState();
    const editScope = s.responsiveEditScope === 'device' ? 'device' : 'global';
    if (editScope === 'device') {
      return `:${editScope}:${s.activeDeviceId || BUILDER_DEVICE_ORDER[0]}`;
    }
    return `:${editScope}`;
  }

  function getDraftHistoryKey(scope) {
    const s = getState();
    if (!s.currentPage?.id || !isDraftHistoryScope(scope)) return '';
    const responsiveContext = getDraftHistoryResponsiveContext(scope);
    if (scope === 'module') {
      const moduleId = moduleDraftId || s.selectedModuleId;
      return moduleId ? `${s.currentPage.id}:module:${moduleId}${responsiveContext}` : '';
    }
    if (scope === 'section') {
      return activeSectionId
        ? `${s.currentPage.id}:section:${activeSectionId}${responsiveContext}`
        : '';
    }
    return `${s.currentPage.id}:${scope}${responsiveContext}`;
  }

  // ── Snapshots and undo history ─────────────────────────────────────────────

  function getDraftSnapshot(scope) {
    if (!isDraftHistoryScope(scope)) return null;
    return cloneValue(drafts[scope]);
  }

  function setDraftSnapshot(scope, snapshot) {
    if (!isDraftHistoryScope(scope)) return false;
    if (scope === 'module') {
      moduleDraftId = getState().selectedModuleId || moduleDraftId;
    }
    drafts[scope] = cloneValue(snapshot);
    return true;
  }

  function applyDraftHistorySnapshot(scope, snapshot, meta = {}) {
    if (!setDraftSnapshot(scope, snapshot)) return;
    dirtyScope = meta.dirty ? scope : null;
    if (scope === 'section') {
      actions.setCanvasStatus?.(
        meta.dirty ? 'Section settings have unsaved changes.' : 'Section settings restored.',
        meta.dirty ? 'warning' : 'neutral'
      );
    } else {
      actions.setEditorStatus(
        meta.dirty ? 'Draft has unsaved changes.' : 'Draft restored to saved state.',
        meta.dirty ? 'warning' : 'neutral'
      );
    }
    if (scope === 'module') {
      actions.syncInlineDraftFromHistory?.(snapshot, meta.reason || 'draft-history');
    }
    actions.renderCanvas();
    actions.renderEditorPanel();
  }

  const draftUndoStack = createDraftUndoStack({
    getKey: getDraftHistoryKey,
    getSnapshot: getDraftSnapshot,
    applySnapshot: applyDraftHistorySnapshot,
    onChange: () => actions.updateEditorFooterUi?.(),
  });

  function resetDraftHistory(scope) {
    draftUndoStack.reset(scope);
    actions.updateEditorFooterUi?.();
  }

  function clearDraftHistory() {
    draftUndoStack.clear();
  }

  function resetVisibleResponsiveDraftHistory() {
    const scope = getVisibleDraftScope();
    if (!isResponsiveDraftHistoryScope(scope)) return;
    resetDraftHistory(scope);
  }

  // ── Dirty tracking ─────────────────────────────────────────────────────────

  function markDirty(scope, options = {}) {
    dirtyScope = scope;
    if (scope === 'module') {
      actions.setEditorStatus('Unsaved module changes. Save or discard before switching.', 'warning');
    } else if (scope === 'header') {
      actions.setEditorStatus('Unsaved header changes. Save or discard before switching.', 'warning');
    } else if (scope === 'theme') {
      actions.setEditorStatus('Unsaved theme changes. Save or discard before switching.', 'warning');
    } else if (scope === 'page-settings') {
      actions.setEditorStatus('Unsaved page settings. Save or discard before switching.', 'warning');
    } else if (scope === 'section') {
      actions.setCanvasStatus?.('Unsaved section settings. Save or discard before switching.', 'warning');
    } else if (scope === 'structure') {
      actions.setEditorStatus('Unsaved module moves. Save or discard before switching.', 'warning');
    }
    if (isDraftHistoryScope(scope)) {
      draftUndoStack.record(scope);
    }
    actions.updateEditorFooterUi?.();
    // Inline-iframe edits already reflect the change in the preview; echoing the draft
    // back would fight the caret, so only the snapshot state refreshes.
    if (options.fromInlineIframe) {
      actions.refreshPreviewSnapshot?.();
      return;
    }
    const s = getState();
    if (scope === 'module' && s.inlineEditState?.moduleId === (moduleDraftId || s.selectedModuleId)) {
      actions.syncInlineEditToPreview?.('side-panel');
      actions.refreshPreviewSnapshot?.();
      return;
    }
    actions.refreshLiveCanvas?.();
  }

  function clearDirty(scope = null) {
    if (!scope || dirtyScope === scope) {
      dirtyScope = null;
    }
    if (isDraftHistoryScope(scope || getVisibleDraftScope())) {
      draftUndoStack.reset(scope || getVisibleDraftScope());
    }
    actions.updateEditorFooterUi?.();
    actions.refreshLiveCanvas?.();
  }

  // ── Command-facing draft operations ────────────────────────────────────────

  function canSaveCurrentDraft() {
    return isDraftHistoryScope(dirtyScope) || dirtyScope === 'structure';
  }

  function canDiscardCurrentDraft() {
    return isDraftHistoryScope(dirtyScope) || dirtyScope === 'structure';
  }

  async function saveCurrentDraft() {
    const scope = dirtyScope;
    if (!canSaveCurrentDraft()) return { ok: false, status: 'No dirty draft to save.' };
    if (scope === 'module' && getState().inlineEditState) {
      actions.clearInlineEditView?.('save', 'commit');
    }
    let saved = false;
    if (scope === 'module') saved = await saveActiveModuleDraft();
    else if (scope === 'header') saved = await saveActiveHeaderDraft();
    else if (scope === 'theme') saved = await saveActiveThemeDraft();
    else if (scope === 'page-settings') saved = await saveActivePageSettingsDraft();
    else if (scope === 'section') saved = await actions.saveSectionSettings?.();
    else if (scope === 'structure') saved = await saveStructureDraft();
    return saved ? { ok: true } : { ok: false, status: 'Failed to save draft.' };
  }

  function discardCurrentDraft() {
    const scope = dirtyScope;
    if (!canDiscardCurrentDraft()) return { ok: false, status: 'No dirty draft to discard.' };
    if (scope === 'module' && getState().inlineEditState) {
      actions.clearInlineEditView?.('discard', 'cancel');
    }
    if (scope === 'module') discardActiveModuleDraft();
    else if (scope === 'header') discardActiveHeaderDraft();
    else if (scope === 'theme') discardActiveThemeDraft();
    else if (scope === 'page-settings') discardActivePageSettingsDraft();
    else if (scope === 'section') actions.discardSectionSettings?.();
    else if (scope === 'structure') discardStructureDraft();
    return { ok: true };
  }

  function canUndoDraft() {
    const scope = getDraftCommandScope();
    return isDraftHistoryScope(scope) && draftUndoStack.canUndo(scope) === true;
  }

  function canRedoDraft() {
    const scope = getDraftCommandScope();
    return isDraftHistoryScope(scope) && draftUndoStack.canRedo(scope) === true;
  }

  function undoDraft() {
    const scope = getDraftCommandScope();
    if (!isDraftHistoryScope(scope)) return { ok: false, status: 'No draft selected.' };
    return draftUndoStack.undo(scope) || { ok: false, status: 'No draft history available.' };
  }

  function redoDraft() {
    const scope = getDraftCommandScope();
    if (!isDraftHistoryScope(scope)) return { ok: false, status: 'No draft selected.' };
    return draftUndoStack.redo(scope) || { ok: false, status: 'No draft history available.' };
  }

  // ── Structure draft (staged module moves) ──────────────────────────────────

  function collectModulePlacements(page = getState().currentPage) {
    return (page?.sections || []).flatMap((section) =>
      (section.modules || []).map((module) => ({
        moduleId: module.id,
        sectionId: section.id,
        columnIndex: Number(module.columnIndex) || 0,
        sortIndex: Number(module.sortIndex) || 0,
      }))
    );
  }

  function normalizeModulePlacements(page = getState().currentPage) {
    (page?.sections || []).forEach((section) => {
      const columns = new Map();
      (section.modules || []).forEach((module) => {
        const columnIndex = Number(module.columnIndex) || 0;
        if (!columns.has(columnIndex)) columns.set(columnIndex, []);
        columns.get(columnIndex).push(module);
      });
      columns.forEach((modules) => {
        modules
          .sort((a, b) => (Number(a.sortIndex) || 0) - (Number(b.sortIndex) || 0))
          .forEach((module, index) => {
            module.sortIndex = index;
          });
      });
    });
  }

  function restoreModulePlacements(placements, page = getState().currentPage) {
    const sections = new Map((page?.sections || []).map((section) => [section.id, section]));
    const modules = new Map(
      (page?.sections || []).flatMap((section) =>
        (section.modules || []).map((module) => [module.id, module])
      )
    );
    placements.forEach((placement) => {
      const module = modules.get(placement.moduleId);
      const target = sections.get(placement.sectionId);
      if (!module || !target) return;
      (page.sections || []).forEach((section) => {
        section.modules = (section.modules || []).filter((item) => item !== module);
      });
      target.modules.push(module);
      module.columnIndex = placement.columnIndex;
      module.sortIndex = placement.sortIndex;
    });
  }

  function clearStructureDraft() {
    structureSnapshot = null;
  }

  function stageStructureMove(moduleId, direction) {
    const page = getState().currentPage;
    if (!['up', 'down', 'left', 'right'].includes(direction)) {
      return { ok: false, status: 'Unknown move direction.' };
    }
    const section = (page?.sections || []).find((candidate) =>
      (candidate.modules || []).some((module) => module.id === moduleId)
    );
    const module = (section?.modules || []).find((candidate) => candidate.id === moduleId);
    if (!section || !module) return { ok: false, status: 'Module not found on this page.' };
    if (module.moduleType === 'reader') {
      return { ok: false, status: 'The Comic Reader cannot be stepped between columns.' };
    }

    const columnIndex = Number(module.columnIndex) || 0;
    const siblings = (section.modules || [])
      .filter((item) => (Number(item.columnIndex) || 0) === columnIndex)
      .sort((a, b) => (Number(a.sortIndex) || 0) - (Number(b.sortIndex) || 0));
    const step = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
    const destination = siblings.indexOf(module) + step;
    if (step && (destination < 0 || destination >= siblings.length)) {
      return { ok: false, status: 'Already at the edge of this column.' };
    }

    const targetColumn = direction === 'left' ? columnIndex - 1 : columnIndex + 1;
    const columnCount = String(section.layout || '1')
      .split('-')
      .filter(Boolean).length;
    if (!step && (targetColumn < 0 || targetColumn >= columnCount)) {
      return { ok: false, status: 'No column in that direction.' };
    }

    structureSnapshot ||= collectModulePlacements(page);
    // Normalize only after snapshotting so tied legacy indexes cannot make a valid step a no-op,
    // while Discard still restores the exact persisted placement set.
    normalizeModulePlacements(page);
    if (step) {
      const normalized = (section.modules || [])
        .filter((item) => (Number(item.columnIndex) || 0) === columnIndex)
        .sort((a, b) => (Number(a.sortIndex) || 0) - (Number(b.sortIndex) || 0));
      const position = normalized.indexOf(module);
      [normalized[position].sortIndex, normalized[position + step].sortIndex] = [
        normalized[position + step].sortIndex,
        normalized[position].sortIndex,
      ];
    } else {
      module.columnIndex = targetColumn;
      module.sortIndex = (section.modules || []).filter(
        (item) => item !== module && (Number(item.columnIndex) || 0) === targetColumn
      ).length;
    }
    normalizeModulePlacements(page);
    markDirty('structure');
    actions.renderCanvas();
    actions.renderEditorPanel();
    actions.requestTargetRefresh?.();
    return { ok: true, status: 'Module move staged. Save to apply or discard to restore.' };
  }

  async function saveStructureDraft() {
    const page = getState().currentPage;
    if (!page || !structureSnapshot) return false;
    const savedPage = await deps.saveModulePlacements(page.id, collectModulePlacements(page));
    if (!savedPage) return false;
    actions.syncPageSummary(savedPage);
    clearStructureDraft();
    clearDirty('structure');
    actions.renderPageList();
    actions.renderCanvas();
    actions.renderEditorPanel();
    return true;
  }

  function discardStructureDraft() {
    if (!structureSnapshot) return;
    restoreModulePlacements(structureSnapshot);
    clearStructureDraft();
    clearDirty('structure');
    actions.renderCanvas();
    actions.renderEditorPanel();
    actions.requestTargetRefresh?.();
  }

  // ── Draft normalization and initialization ─────────────────────────────────

  function normalizeThemeDraft(page) {
    const defaults = getDefaultThemeDraft();
    return {
      theme: {
        ...defaults.theme,
        ...(page?.meta?.theme || {}),
      },
    };
  }

  function normalizeHeaderDraft(page = getState().currentPage) {
    const source = getPageHeaderSource(page);
    const effectiveHeader = createEffectivePageHeader(page, null, normalizeHeaderNavItems);
    return {
      source,
      header: normalizeHeaderConfig(effectiveHeader, normalizeHeaderNavItems),
      copy: normalizeHeaderCopy(effectiveHeader.copy, {
        title: page?.title || 'Page Title',
        subtitle: '',
        subtitles: [],
      }),
      responsive: cloneValue(page?.meta?.responsive || {}),
    };
  }

  function initializeModuleDraft(moduleId = getState().selectedModuleId) {
    const module = actions.getSelectedModuleRecord(moduleId);
    moduleDraftId = module?.id || null;
    drafts.module = module ? cloneValue(module.config || {}) : null;
    resetDraftHistory('module');
  }

  function initializeThemeDraft() {
    const { currentPage } = getState();
    setDraft('theme', currentPage ? normalizeThemeDraft(currentPage) : getDefaultThemeDraft());
    resetDraftHistory('theme');
  }

  function initializeHeaderDraft() {
    const { currentPage } = getState();
    setDraft(
      'header',
      currentPage
        ? normalizeHeaderDraft(currentPage)
        : {
            source: 'default',
            header: createDefaultHeaderConfig(),
            copy: normalizeHeaderCopy(null, { title: 'Page Title', subtitle: '', subtitles: [] }),
            responsive: {},
          }
    );
    resetDraftHistory('header');
  }

  function initializePageSettingsDraft() {
    const { currentPage } = getState();
    setDraft(
      'page-settings',
      currentPage
        ? {
            slug: currentPage.slug || '',
            title: currentPage.title || '',
            pageType: currentPage.pageType || '',
            isHomepage: currentPage.isHomepage || false,
          }
        : null
    );
    resetDraftHistory('page-settings');
  }

  function initializeSectionDraft(sectionId) {
    const section = actions.getSectionRecord(sectionId);
    if (!section) return;
    const settings = section.settings || {};
    activeSectionId = sectionId;
    setDraft('section', {
      ...cloneValue(settings),
      // Layout (column count + ratios) lives at the section top level but is edited
      // alongside settings so column count/ratio and per-column styling save atomically.
      layout: section.layout || '1',
      moduleGap: settings.moduleGap ?? '',
      columnGap: settings.columnGap ?? '',
      sectionGap: settings.sectionGap ?? '',
    });
    resetDraftHistory('section');
  }

  function clearSelectedModuleState() {
    actions.setSelectedModuleId(null);
    moduleDraftId = null;
    drafts.module = null;
    resetDraftHistory('module');
  }

  function clearActiveSectionState() {
    activeSectionId = null;
    drafts.section = null;
    clearDirty('section');
  }

  // ── Explicit save/discard per scope ────────────────────────────────────────

  async function saveActiveModuleDraft() {
    const activeModuleDraft = drafts.module;
    const { builderRuntime } = getState();
    const selectedModule = actions.getSelectedModuleRecord();
    if (!selectedModule || !activeModuleDraft) return false;
    if (builderRuntime?.compatible !== true) {
      actions.setEditorStatus(
        'Builder API is out of date. Restart the API before saving this module; your draft is preserved.',
        'danger'
      );
      actions.renderEditorPanel();
      return false;
    }
    const updated = await deps.updateModule(selectedModule.id, {
      config: cloneValue(activeModuleDraft),
    });
    if (!updated) {
      actions.setEditorStatus('Failed to save module.', 'danger');
      actions.renderEditorPanel();
      return false;
    }
    if (
      !moduleResponsiveContractMatches(
        selectedModule.moduleType,
        activeModuleDraft,
        updated.config || {}
      )
    ) {
      actions.setEditorStatus(
        'The API dropped responsive module settings. The draft remains unsaved; restart or update the API and try again.',
        'danger'
      );
      actions.renderEditorPanel();
      return false;
    }
    selectedModule.config = updated.config;
    moduleDraftId = selectedModule.id;
    drafts.module = cloneValue(updated.config);
    clearDirty('module');
    actions.setEditorStatus('Module saved.', 'success');
    actions.renderCanvas();
    actions.renderEditorPanel();
    return true;
  }

  function discardActiveModuleDraft() {
    const selectedModule = actions.getSelectedModuleRecord();
    if (!selectedModule) return;
    moduleDraftId = selectedModule.id;
    drafts.module = cloneValue(selectedModule.config || {});
    clearDirty('module');
    actions.setEditorStatus('Module changes discarded.', 'neutral');
    actions.renderEditorPanel();
  }

  async function saveActiveThemeDraft() {
    const { currentPage } = getState();
    const activeThemeDraft = drafts.theme;
    if (!currentPage || !activeThemeDraft) return false;
    const nextMeta = {
      ...(currentPage.meta || {}),
      theme: cloneValue(activeThemeDraft.theme),
    };
    const updated = await deps.updatePage(currentPage.id, { meta: nextMeta });
    if (!updated) {
      actions.setEditorStatus('Failed to save theme.', 'danger');
      actions.renderEditorPanel();
      return false;
    }
    actions.syncPageSummary(updated);
    setDraft('theme', normalizeThemeDraft(getState().currentPage));
    clearDirty('theme');
    actions.setEditorStatus('Theme saved.', 'success');
    actions.renderCanvas();
    actions.renderEditorPanel();
    return true;
  }

  function discardActiveThemeDraft() {
    setDraft('theme', normalizeThemeDraft(getState().currentPage));
    clearDirty('theme');
    actions.setEditorStatus('Theme changes discarded.', 'neutral');
    actions.renderEditorPanel();
  }

  function resetActiveThemeDraft() {
    setDraft('theme', getDefaultThemeDraft());
    markDirty('theme');
    actions.renderEditorPanel();
  }

  async function saveActiveHeaderDraft() {
    const { currentPage } = getState();
    const activeHeaderDraft = drafts.header;
    if (!currentPage || !activeHeaderDraft) return false;

    try {
      const nextMeta = actions.buildNormalizedPageMeta(currentPage, activeHeaderDraft);
      const updatedPage = await deps.updatePage(currentPage.id, { meta: nextMeta });

      if (!updatedPage) {
        actions.setEditorStatus('Failed to save the page header.', 'danger');
        actions.renderEditorPanel();
        return false;
      }

      actions.syncPageSummary(updatedPage);
      setDraft('header', normalizeHeaderDraft(updatedPage));
      clearDirty('header');
      actions.setEditorStatus('Page header saved.', 'success');
      actions.renderCanvas();
      actions.renderEditorPanel();
      return true;
    } catch (error) {
      console.error('saveActiveHeaderDraft error:', error);
      actions.setEditorStatus('Failed to save the page header.', 'danger');
      actions.renderEditorPanel();
      return false;
    }
  }

  function discardActiveHeaderDraft() {
    setDraft('header', normalizeHeaderDraft(getState().currentPage));
    clearDirty('header');
    actions.setEditorStatus('Page header changes discarded.', 'neutral');
    actions.renderCanvas();
    actions.renderEditorPanel();
  }

  async function saveActivePageSettingsDraft() {
    const { currentPage } = getState();
    const activePageSettingsDraft = drafts['page-settings'];
    if (!currentPage || !activePageSettingsDraft) return false;
    try {
      const updatedPage = await deps.updatePage(currentPage.id, {
        slug: activePageSettingsDraft.slug,
        title: activePageSettingsDraft.title,
        pageType: activePageSettingsDraft.pageType,
        isHomepage: activePageSettingsDraft.isHomepage,
      });

      if (!updatedPage) {
        actions.setEditorStatus('Failed to save page settings.', 'danger');
        actions.renderEditorPanel();
        return false;
      }

      actions.syncPageSummary(updatedPage);
      initializePageSettingsDraft();
      clearDirty('page-settings');
      actions.setEditorStatus('Page settings saved.', 'success');
      actions.renderPageList();
      actions.renderCanvas();
      actions.renderEditorPanel();
      actions.syncDesignerRoute('replace');
      return true;
    } catch (error) {
      console.error('saveActivePageSettingsDraft error:', error);
      actions.setEditorStatus('Failed to save page settings.', 'danger');
      actions.renderEditorPanel();
      return false;
    }
  }

  function discardActivePageSettingsDraft() {
    initializePageSettingsDraft();
    clearDirty('page-settings');
    actions.setEditorStatus('Page settings discarded.', 'neutral');
    actions.renderCanvas();
    actions.renderEditorPanel();
  }

  return {
    canDiscardCurrentDraft,
    canRedoDraft,
    canSaveCurrentDraft,
    canUndoDraft,
    clearActiveSectionState,
    clearDirty,
    clearDraftHistory,
    clearSelectedModuleState,
    clearStructureDraft,
    discardActiveHeaderDraft,
    discardActiveModuleDraft,
    discardActivePageSettingsDraft,
    discardActiveThemeDraft,
    discardCurrentDraft,
    discardStructureDraft,
    getActiveSectionId,
    getDirtyScope,
    getDraft,
    getModuleDraftId,
    getVisibleDraftScope,
    initializeHeaderDraft,
    initializeModuleDraft,
    initializePageSettingsDraft,
    initializeSectionDraft,
    initializeThemeDraft,
    markDirty,
    normalizeHeaderDraft,
    normalizeThemeDraft,
    redoDraft,
    resetActiveThemeDraft,
    resetDirty,
    resetDraftHistory,
    resetVisibleResponsiveDraftHistory,
    saveActiveHeaderDraft,
    saveActiveModuleDraft,
    saveActivePageSettingsDraft,
    saveActiveThemeDraft,
    saveCurrentDraft,
    saveStructureDraft,
    setDraft,
    setModuleDraft,
    setModuleDraftId,
    stageStructureMove,
    undoDraft,
  };
}

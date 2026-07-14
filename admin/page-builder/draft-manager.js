import { THEME_COLORS } from './constants.js';
import { cloneValue } from './helpers.js';
import {
  createDefaultHeaderConfig,
  createEffectivePageHeader,
  getPageHeaderSource,
  normalizeHeaderConfig,
  normalizeHeaderCopy,
} from './header-config.js';
import { normalizeHeaderNavItems } from './link-utils.js';
import { moduleResponsiveContractMatches } from './responsive-overrides.js';

// Panel background/spacing now live on the column and are edited in the Column/Panel inspector.
// The theme draft no longer models page.meta panel keys so theme save/reset never clobber the
// legacy panelBackgrounds/panelSpacing that still serve as a read-time fallback for un-migrated pages.
function getDefaultThemeDraft() {
  return {
    theme: Object.fromEntries(THEME_COLORS.map((color) => [color.key, color.default])),
  };
}

export function createDraftManager({ getState, actions, deps }) {
  let structureSnapshot = null;

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
    actions.markDirty('structure');
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
    actions.clearDirty('structure');
    actions.renderPageList();
    actions.renderCanvas();
    actions.renderEditorPanel();
    return true;
  }

  function discardStructureDraft() {
    if (!structureSnapshot) return;
    restoreModulePlacements(structureSnapshot);
    clearStructureDraft();
    actions.clearDirty('structure');
    actions.renderCanvas();
    actions.renderEditorPanel();
    actions.requestTargetRefresh?.();
  }

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
    actions.setActiveModuleDraftId(module?.id || null);
    actions.setActiveModuleDraft(module ? cloneValue(module.config || {}) : null);
    actions.resetDraftHistory?.('module');
  }

  function initializeThemeDraft() {
    const { currentPage } = getState();
    actions.setActiveThemeDraft(
      currentPage ? normalizeThemeDraft(currentPage) : getDefaultThemeDraft()
    );
    actions.resetDraftHistory?.('theme');
  }

  function initializeHeaderDraft() {
    const { currentPage } = getState();
    actions.setActiveHeaderDraft(
      currentPage
        ? normalizeHeaderDraft(currentPage)
        : {
            source: 'default',
            header: createDefaultHeaderConfig(),
            copy: normalizeHeaderCopy(null, { title: 'Page Title', subtitle: '', subtitles: [] }),
            responsive: {},
          }
    );
    actions.resetDraftHistory?.('header');
  }

  function initializePageSettingsDraft() {
    const { currentPage } = getState();
    actions.setActivePageSettingsDraft(
      currentPage
        ? {
            slug: currentPage.slug || '',
            title: currentPage.title || '',
            pageType: currentPage.pageType || '',
            isHomepage: currentPage.isHomepage || false,
          }
        : null
    );
    actions.resetDraftHistory?.('page-settings');
  }

  function initializeSectionDraft(sectionId) {
    const section = actions.getSectionRecord(sectionId);
    if (!section) return;
    const settings = section.settings || {};
    actions.setActiveSectionId(sectionId);
    actions.setActiveSectionDraft({
      ...cloneValue(settings),
      // Layout (column count + ratios) lives at the section top level but is edited
      // alongside settings so column count/ratio and per-column styling save atomically.
      layout: section.layout || '1',
      moduleGap: settings.moduleGap ?? '',
      columnGap: settings.columnGap ?? '',
      sectionGap: settings.sectionGap ?? '',
    });
    actions.resetDraftHistory?.('section');
  }

  function clearSelectedModuleState() {
    actions.setSelectedModuleId(null);
    actions.setActiveModuleDraftId(null);
    actions.setActiveModuleDraft(null);
    actions.resetDraftHistory?.('module');
  }

  function clearActiveSectionState() {
    actions.setActiveSectionId(null);
    actions.setActiveSectionDraft(null);
    actions.clearDirty('section');
  }

  async function saveActiveModuleDraft() {
    const { activeModuleDraft, builderRuntime } = getState();
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
    actions.setActiveModuleDraftId(selectedModule.id);
    actions.setActiveModuleDraft(cloneValue(updated.config));
    actions.clearDirty('module');
    actions.setEditorStatus('Module saved.', 'success');
    actions.renderCanvas();
    actions.renderEditorPanel();
    return true;
  }

  function discardActiveModuleDraft() {
    const selectedModule = actions.getSelectedModuleRecord();
    if (!selectedModule) return;
    actions.setActiveModuleDraftId(selectedModule.id);
    actions.setActiveModuleDraft(cloneValue(selectedModule.config || {}));
    actions.clearDirty('module');
    actions.setEditorStatus('Module changes discarded.', 'neutral');
    actions.renderEditorPanel();
  }

  async function saveActiveThemeDraft() {
    const { currentPage, activeThemeDraft } = getState();
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
    actions.setActiveThemeDraft(normalizeThemeDraft(getState().currentPage));
    actions.clearDirty('theme');
    actions.setEditorStatus('Theme saved.', 'success');
    actions.renderCanvas();
    actions.renderEditorPanel();
    return true;
  }

  function discardActiveThemeDraft() {
    actions.setActiveThemeDraft(normalizeThemeDraft(getState().currentPage));
    actions.clearDirty('theme');
    actions.setEditorStatus('Theme changes discarded.', 'neutral');
    actions.renderEditorPanel();
  }

  function resetActiveThemeDraft() {
    actions.setActiveThemeDraft(getDefaultThemeDraft());
    actions.markDirty('theme');
    actions.renderEditorPanel();
  }

  async function saveActiveHeaderDraft() {
    const { currentPage, activeHeaderDraft } = getState();
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
      actions.setActiveHeaderDraft(normalizeHeaderDraft(updatedPage));
      actions.clearDirty('header');
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
    actions.setActiveHeaderDraft(normalizeHeaderDraft(getState().currentPage));
    actions.clearDirty('header');
    actions.setEditorStatus('Page header changes discarded.', 'neutral');
    actions.renderCanvas();
    actions.renderEditorPanel();
  }

  async function saveActivePageSettingsDraft() {
    const { currentPage, activePageSettingsDraft } = getState();
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
      actions.clearDirty('page-settings');
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
    actions.clearDirty('page-settings');
    actions.setEditorStatus('Page settings discarded.', 'neutral');
    actions.renderCanvas();
    actions.renderEditorPanel();
  }

  return {
    clearActiveSectionState,
    clearSelectedModuleState,
    clearStructureDraft,
    discardActiveHeaderDraft,
    discardActiveModuleDraft,
    discardActivePageSettingsDraft,
    discardActiveThemeDraft,
    initializeHeaderDraft,
    initializeModuleDraft,
    initializePageSettingsDraft,
    initializeSectionDraft,
    initializeThemeDraft,
    normalizeHeaderDraft,
    normalizeThemeDraft,
    resetActiveThemeDraft,
    saveActiveHeaderDraft,
    saveActiveModuleDraft,
    saveActivePageSettingsDraft,
    saveActiveThemeDraft,
    saveStructureDraft,
    stageStructureMove,
    discardStructureDraft,
  };
}

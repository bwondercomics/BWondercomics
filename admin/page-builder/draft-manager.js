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

// Panel background/spacing now live on the column and are edited in the Column/Panel inspector.
// The theme draft no longer models page.meta panel keys so theme save/reset never clobber the
// legacy panelBackgrounds/panelSpacing that still serve as a read-time fallback for un-migrated pages.
function getDefaultThemeDraft() {
  return {
    theme: Object.fromEntries(THEME_COLORS.map((color) => [color.key, color.default])),
  };
}

export function createDraftManager({ getState, actions, deps }) {
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
    const { activeModuleDraft } = getState();
    const selectedModule = actions.getSelectedModuleRecord();
    if (!selectedModule || !activeModuleDraft) return false;
    const updated = await deps.updateModule(selectedModule.id, {
      config: cloneValue(activeModuleDraft),
    });
    if (!updated) {
      actions.setEditorStatus('Failed to save module.', 'danger');
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
  };
}

import { parseLayoutRatios } from '../../shared/page-builder/layout-utils.js';

// Canvas selection and targeting: which surface/module/section/column is selected,
// relative-target navigation, and target-key bookkeeping shared with the preview
// overlay and structural commands. Selection fields (selectedModuleId,
// selectedCanvasSurface, selectedColumnIndex, activeEditorTab) stay on the shell
// store because several wiring bags write them; this controller mutates them only
// through the setter actions.
export function createSelectionController({ el, getState, actions }) {
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
    const s = getState();
    const pageId = s.currentPage?.id || null;
    if (!pageId) return null;
    if (s.selectedCanvasSurface === 'page-header') {
      return { kind: 'header', key: `header:${pageId}`, pageId };
    }
    if (s.selectedCanvasSurface === 'page-settings') {
      return { kind: 'page', key: `page:${pageId}`, pageId };
    }
    if (s.selectedCanvasSurface === 'section' && s.activeSectionId) {
      return {
        kind: 'section',
        key: `section:${s.activeSectionId}`,
        pageId,
        sectionId: s.activeSectionId,
      };
    }
    const selectedModule = actions.getSelectedModuleRecord(s.selectedModuleId);
    if (selectedModule) {
      const section = (s.currentPage.sections || []).find((item) =>
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

  function getSelectableTargets() {
    const s = getState();
    if (!s.currentPage?.id) return [];
    const targets = [
      { kind: 'page', key: `page:${s.currentPage.id}`, pageId: s.currentPage.id },
      { kind: 'header', key: `header:${s.currentPage.id}`, pageId: s.currentPage.id },
    ];
    actions.sortSections(s.currentPage.sections || []).forEach((section) => {
      targets.push({
        kind: 'section',
        key: `section:${section.id}`,
        pageId: s.currentPage.id,
        sectionId: section.id,
      });
      const columnIndices = Array.from(
        new Set((section.modules || []).map((module) => Number(module.columnIndex) || 0))
      ).sort((a, b) => a - b);
      columnIndices.forEach((columnIndex) => {
        actions.sortModulesForColumn(section, columnIndex).forEach((module) => {
          targets.push({
            kind: 'module',
            key: `module:${module.id}`,
            pageId: s.currentPage.id,
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
    for (const section of getState().currentPage?.sections || []) {
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
    const modules = actions.sortModulesForColumn(location.section, columnIndex);
    const moduleIndex = modules.findIndex((module) => module.id === target.moduleId);
    if (moduleIndex < 0) return null;
    return {
      sectionId: location.section.id,
      columnIndex,
      insertIndex: moduleIndex + (position === 'before' ? 0 : 1),
      placement: position === 'before' ? 'before' : 'after',
    };
  }

  function selectPageHeaderFromCanvas() {
    if (getState().selectedCanvasSurface === 'page-header') return true;
    if (
      !actions.ensureCleanWorkspace(
        'Save or discard your current changes before switching to the page header.'
      )
    ) {
      actions.renderEditorPanel();
      return false;
    }

    actions.clearSelectedModuleState();
    actions.clearActiveSectionState();
    actions.activateHeaderSurface();
    actions.renderCanvas();
    actions.renderEditorPanel();
    actions.syncDesignerRoute('replace');
    return true;
  }

  function selectPageSettingsFromCanvas() {
    if (getState().selectedCanvasSurface === 'page-settings') return true;
    if (
      !actions.ensureCleanWorkspace(
        'Save or discard your current changes before editing page settings.'
      )
    ) {
      actions.renderEditorPanel();
      return false;
    }

    actions.clearSelectedModuleState();
    actions.clearActiveSectionState();
    actions.setSelectedCanvasSurface('page-settings');
    actions.setActiveEditorTab('modules');
    actions.initializePageSettingsDraft();
    actions.setEditorStatus('', 'neutral');
    actions.renderCanvas();
    actions.renderEditorPanel();
    return true;
  }

  function selectModule(moduleId, options = {}) {
    const s = getState();
    if (s.selectedModuleId === moduleId) return true;
    if (!actions.getSelectedModuleRecord(moduleId)) return false;
    if (
      s.dirtyScope === 'module' ||
      s.dirtyScope === 'theme' ||
      s.dirtyScope === 'header' ||
      s.dirtyScope === 'section' ||
      s.dirtyScope === 'structure'
    ) {
      const sameModule = s.dirtyScope === 'module' && s.selectedModuleId === moduleId;
      if (!sameModule) {
        actions.ensureCleanWorkspace(
          'Save or discard your current changes before selecting another module.'
        );
        return false;
      }
    }

    actions.setSelectedModuleId(moduleId);
    if (s.inlineEditState?.moduleId !== moduleId) {
      actions.clearInlineEditView('target-switch', 'cancel');
    }
    actions.setSelectedCanvasSurface(null);
    actions.setSelectedColumnIndex(null);
    actions.clearActiveSectionState();
    actions.setActiveEditorTab('modules');
    actions.initializeModuleDraft(moduleId);
    actions.setEditorStatus('', 'neutral');
    if (options.renderCanvas !== false) {
      actions.renderCanvas();
    }
    actions.renderEditorPanel();
    return true;
  }

  function selectSectionFromCanvas(sectionId) {
    const s = getState();
    if (!sectionId || !actions.getSectionRecord(sectionId)) return false;
    if (s.selectedCanvasSurface === 'section' && s.activeSectionId === sectionId) return true;
    if (s.dirtyScope === 'section' && s.activeSectionId !== sectionId) {
      actions.setCanvasStatus(
        'Save or discard the current section settings before switching sections.',
        'warning'
      );
      actions.renderCanvas();
      return false;
    }
    if (
      s.dirtyScope &&
      s.dirtyScope !== 'section' &&
      !actions.ensureCleanWorkspace(
        'Save or discard your current changes before selecting a section.'
      )
    ) {
      actions.renderEditorPanel();
      return false;
    }

    actions.clearSelectedModuleState();
    actions.setSelectedCanvasSurface('section');
    actions.setSelectedColumnIndex(null);
    actions.setActiveEditorTab('modules');
    actions.initializeSectionDraft(sectionId);
    actions.setCanvasStatus('', 'neutral');
    actions.renderCanvas();
    actions.renderEditorPanel();
    actions.showSidePanelTab('settings');
    return true;
  }

  function selectColumnFromCanvas(sectionId, columnIndex) {
    const s = getState();
    if (!sectionId || !actions.getSectionRecord(sectionId)) return false;
    const index = Number(columnIndex);
    if (!Number.isInteger(index) || index < 0) return false;
    if (
      s.selectedCanvasSurface === 'column' &&
      s.activeSectionId === sectionId &&
      s.selectedColumnIndex === index
    ) {
      return true;
    }
    // Switching to a column in a different section behaves like a section switch (guarded);
    // moving between columns of the already-active section keeps the draft (no save prompt).
    const sameActiveSection = s.activeSectionId === sectionId && !!s.activeSectionDraft;
    if (!sameActiveSection) {
      if (s.dirtyScope === 'section' && s.activeSectionId !== sectionId) {
        actions.setCanvasStatus(
          'Save or discard the current section settings before switching sections.',
          'warning'
        );
        actions.renderCanvas();
        return false;
      }
      if (
        s.dirtyScope &&
        s.dirtyScope !== 'section' &&
        !actions.ensureCleanWorkspace(
          'Save or discard your current changes before selecting a column.'
        )
      ) {
        actions.renderEditorPanel();
        return false;
      }
      actions.clearSelectedModuleState();
      actions.setActiveEditorTab('modules');
      actions.initializeSectionDraft(sectionId);
    }
    const columnCount = parseLayoutRatios(getState().activeSectionDraft?.layout || '1').length;
    if (index >= columnCount) return false;
    actions.setSelectedCanvasSurface('column');
    actions.setSelectedColumnIndex(index);
    actions.setCanvasStatus('', 'neutral');
    actions.renderCanvas();
    actions.renderEditorPanel();
    actions.showSidePanelTab('settings');
    return true;
  }

  // Escalate from a selected module to its owning column/panel (used by the module inspector's
  // "Edit parent column" affordance, since a click inside a populated column selects the module).
  function selectParentColumnFromModule(moduleId) {
    const location = getModuleLocation(moduleId);
    if (!location) return false;
    return selectColumnFromCanvas(location.section.id, Number(location.module.columnIndex) || 0);
  }

  function selectCanvasTarget(target) {
    if (!target || typeof target !== 'object') return false;
    if (target.kind === 'module') {
      const accepted = selectModule(target.moduleId);
      if (accepted) actions.showSidePanelTab('settings');
      return accepted;
    }
    if (target.kind === 'header') {
      actions.clearInlineEditView('target-switch', 'cancel');
      const accepted = selectPageHeaderFromCanvas();
      if (accepted) actions.showSidePanelTab('settings');
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
      actions.clearInlineEditView('target-switch', 'cancel');
      const accepted = selectPageSettingsFromCanvas();
      if (accepted) actions.showSidePanelTab('settings');
      return accepted;
    }
    if (target.kind === 'section') {
      actions.clearInlineEditView('target-switch', 'cancel');
      return selectSectionFromCanvas(target.sectionId);
    }
    if (target.kind === 'column' && target.sectionId) {
      actions.clearInlineEditView('target-switch', 'cancel');
      return selectColumnFromCanvas(target.sectionId, target.columnIndex);
    }
    return false;
  }

  return {
    canSelectRelativeTarget,
    createPendingInsertTarget,
    getModuleLocation,
    getSelectedTarget,
    getTargetKey,
    selectCanvasTarget,
    selectColumnFromCanvas,
    selectModule,
    selectPageHeaderFromCanvas,
    selectPageSettingsFromCanvas,
    selectParentColumnFromModule,
    selectRelativeTarget,
    selectSectionFromCanvas,
  };
}

import { findPageModuleLocation } from './module-eligibility.js';

function sortModulesForColumn(section, columnIndex) {
  return (section?.modules || [])
    .filter((module) => module.columnIndex === columnIndex)
    .slice()
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
}

export function createCanvasMutations({ getState, actions, deps, helpers }) {
  function normalizeDefaultModuleConfig(moduleType, config) {
    const currentPage = getState().currentPage;
    const nextConfig = JSON.parse(JSON.stringify(config || {}));
    if (moduleType === 'reader' || moduleType === 'entry-gallery') {
      if (currentPage?.scope === 'global') {
        nextConfig.source = {
          ...(nextConfig.source && typeof nextConfig.source === 'object' ? nextConfig.source : {}),
          mode: 'specific-series',
          seriesId: helpers.getSeriesId?.() || currentPage?.seriesId || '',
        };
      } else {
        nextConfig.source = {
          ...(nextConfig.source && typeof nextConfig.source === 'object' ? nextConfig.source : {}),
          mode: 'active-page-series',
        };
        delete nextConfig.source.seriesId;
      }
    }
    return nextConfig;
  }

  function getSectionRecord(sectionId) {
    return (
      (getState().currentPage?.sections || []).find((section) => section.id === sectionId) || null
    );
  }

  async function addModuleWithDefault(sectionId, moduleType, columnIndex = 0, sortIndex = null) {
    const config = normalizeDefaultModuleConfig(moduleType, helpers.getDefaultConfig(moduleType));
    return deps.addModule(sectionId, moduleType, columnIndex, config, sortIndex);
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
    const { currentPage } = getState();
    const rank = new Map(sectionIds.map((id, index) => [id, index]));
    currentPage.sections = (currentPage.sections || [])
      .slice()
      .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    currentPage.sections.forEach((section, index) => {
      section.sortIndex = index;
    });
  }

  function sortCanvasModulesForColumn(section, columnIndex) {
    return sortModulesForColumn(section, columnIndex).filter(
      (module) => module.moduleType !== 'header'
    );
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

  function failStructuralMutation(message) {
    actions.setCanvasStatus(message, 'danger');
    actions.renderCanvas();
    return null;
  }

  function retainCreatedModuleLocally(section, newModule) {
    section.modules = section.modules || [];
    if (!section.modules.some((module) => module.id === newModule.id)) {
      section.modules.push(newModule);
    }
    section.modules.sort((a, b) => {
      if ((a.columnIndex ?? 0) !== (b.columnIndex ?? 0)) {
        return (a.columnIndex ?? 0) - (b.columnIndex ?? 0);
      }
      return (a.sortIndex ?? 0) - (b.sortIndex ?? 0);
    });
  }

  async function insertModuleAt(sectionId, columnIndex, insertIndex, moduleType) {
    const { currentPage } = getState();
    if (!currentPage) return;
    const section = getSectionRecord(sectionId);
    if (!section) return;

    const newModule = await addModuleWithDefault(sectionId, moduleType, columnIndex);
    if (!newModule) return;

    const visibleOrderedIds = sortCanvasModulesForColumn(section, columnIndex)
      .map((module) => module.id)
      .filter((id) => id !== newModule.id);
    visibleOrderedIds.splice(insertIndex, 0, newModule.id);
    const orderedIds = buildColumnOrder(section, columnIndex, visibleOrderedIds);

    if (!(await deps.reorderModules(sectionId, columnIndex, orderedIds))) {
      return failStructuralMutation(`Failed to add ${helpers.getModuleLabel(moduleType)} module.`);
    }

    section.modules = section.modules || [];
    section.modules.push(newModule);
    applyModuleOrderLocally(sectionId, columnIndex, orderedIds);
    actions.setActiveInsertTarget(null);
    actions.setCanvasStatus(`${helpers.getModuleLabel(moduleType)} module added.`, 'success');
    actions.renderCanvas();
    return newModule;
  }

  async function duplicateModuleAfter(moduleId) {
    const { currentPage } = getState();
    if (!currentPage) return;
    const location = findPageModuleLocation(currentPage, moduleId);
    if (!location) return;
    const { section, module } = location;
    const columnIndex = module.columnIndex ?? 0;
    const moduleType = module.moduleType;

    // Clone the source config verbatim (no default normalization); the backend re-sanitizes it
    // and assigns a fresh module id.
    const clonedConfig = JSON.parse(JSON.stringify(module.config || {}));
    const newModule = await deps.addModule(section.id, moduleType, columnIndex, clonedConfig);
    if (!newModule) return;

    const visibleOrderedIds = sortCanvasModulesForColumn(section, columnIndex)
      .map((item) => item.id)
      .filter((id) => id !== newModule.id);
    const originalIndex = visibleOrderedIds.indexOf(moduleId);
    const insertIndex = originalIndex >= 0 ? originalIndex + 1 : visibleOrderedIds.length;
    visibleOrderedIds.splice(insertIndex, 0, newModule.id);
    const orderedIds = buildColumnOrder(section, columnIndex, visibleOrderedIds);

    if (!(await deps.reorderModules(section.id, columnIndex, orderedIds))) {
      const deleted = await deps.deleteModule(newModule.id);
      if (deleted) {
        return failStructuralMutation(
          `Failed to duplicate ${helpers.getModuleLabel(moduleType)} module.`
        );
      }

      const reconciledPage = await deps.fetchPage(currentPage.id);
      if (reconciledPage?.id === currentPage.id) {
        actions.replaceCurrentPageAfterMutationFailure(reconciledPage);
        return failStructuralMutation(
          `Failed to place the duplicate ${helpers.getModuleLabel(moduleType)} module. The page was refreshed to show the saved state.`
        );
      }

      retainCreatedModuleLocally(section, newModule);
      return failStructuralMutation(
        `The duplicate ${helpers.getModuleLabel(moduleType)} module was created, but ordering and recovery failed. Reload the page before continuing.`
      );
    }

    section.modules = section.modules || [];
    section.modules.push(newModule);
    applyModuleOrderLocally(section.id, columnIndex, orderedIds);
    actions.setCanvasStatus(`${helpers.getModuleLabel(moduleType)} module duplicated.`, 'success');
    actions.renderCanvas();
    return newModule;
  }

  async function moveModuleToTarget(moduleId, targetSectionId, targetColumnIndex, insertIndex) {
    const { currentPage } = getState();
    if (!currentPage) return;
    const location = findPageModuleLocation(currentPage, moduleId);
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
      if (!(await deps.reorderModules(targetSectionId, targetColumnIndex, targetOrderedIds))) {
        return failStructuralMutation('Failed to move module.');
      }
      applyModuleOrderLocally(targetSectionId, targetColumnIndex, targetOrderedIds);
      actions.renderCanvas();
      return sourceModule;
    }

    const movedModule = await deps.moveModule(
      moduleId,
      targetSectionId,
      targetColumnIndex,
      insertIndex
    );
    if (!movedModule) return;

    const nextModule = {
      ...location.module,
      ...movedModule,
      id: moduleId,
    };
    const sourceVisibleIds = sortCanvasModulesForColumn(sourceSection, sourceColumnIndex)
      .map((module) => module.id)
      .filter((id) => id !== moduleId);
    const sourceOrderedIds = buildColumnOrder(sourceSection, sourceColumnIndex, sourceVisibleIds);
    if (sourceOrderedIds.length > 0) {
      if (!(await deps.reorderModules(sourceSection.id, sourceColumnIndex, sourceOrderedIds))) {
        return failStructuralMutation('Failed to move module.');
      }
    }

    if (!(await deps.reorderModules(targetSectionId, targetColumnIndex, targetOrderedIds))) {
      return failStructuralMutation('Failed to move module.');
    }

    sourceSection.modules = (sourceSection.modules || []).filter(
      (module) => module.id !== moduleId
    );
    targetSection.modules = targetSection.modules || [];
    targetSection.modules.push(nextModule);
    if (sourceOrderedIds.length > 0) {
      applyModuleOrderLocally(sourceSection.id, sourceColumnIndex, sourceOrderedIds);
    }
    applyModuleOrderLocally(targetSectionId, targetColumnIndex, targetOrderedIds);
    actions.setCanvasStatus('Module moved.', 'success');
    actions.renderCanvas();
    return nextModule;
  }

  async function insertSectionAt(index) {
    const { currentPage } = getState();
    if (!currentPage) return;
    const newSection = await deps.addSection(currentPage.id);
    if (!newSection) return;

    const sectionIds = (currentPage.sections || [])
      .map((section) => section.id)
      .filter((id) => id !== newSection.id);
    sectionIds.splice(index, 0, newSection.id);
    if (!(await deps.reorderSections(currentPage.id, sectionIds))) {
      return failStructuralMutation('Failed to add section.');
    }

    currentPage.sections = currentPage.sections || [];
    currentPage.sections.push(newSection);
    applySectionOrderLocally(sectionIds);
    actions.setCanvasStatus('Section added.', 'success');
    actions.renderCanvas();
    return newSection;
  }

  async function reorderSectionToIndex(sectionId, insertIndex) {
    const { currentPage } = getState();
    if (!currentPage) return;
    const sectionIds = helpers
      .sortSections(currentPage.sections)
      .map((section) => section.id)
      .filter((id) => id !== sectionId);
    sectionIds.splice(insertIndex, 0, sectionId);
    if (!(await deps.reorderSections(currentPage.id, sectionIds))) {
      return failStructuralMutation('Failed to reorder section.');
    }
    applySectionOrderLocally(sectionIds);
    actions.setCanvasStatus('Section reordered.', 'success');
    actions.renderCanvas();
    return getSectionRecord(sectionId);
  }

  async function changeSectionLayout(sectionId, layout) {
    if (
      actions.ensureCleanWorkspace &&
      !actions.ensureCleanWorkspace(
        'Save or discard your current changes before changing section layout.'
      )
    ) {
      return;
    }
    // Guard (client mirror of the backend authority): a column-count reduction that
    // would orphan a removed column's modules is rejected (409); surface guidance up
    // front instead of issuing a request that cannot succeed.
    const target = getSectionRecord(sectionId);
    const nextColumnCount = String(layout || '1')
      .split('-')
      .filter(Boolean).length;
    const blockedColumns = [
      ...new Set(
        (target?.modules || [])
          .map((module) => Number(module.columnIndex) || 0)
          .filter((index) => index >= nextColumnCount)
      ),
    ].sort((a, b) => a - b);
    if (blockedColumns.length) {
      actions.setCanvasStatus(
        `Move or delete the modules in column ${blockedColumns
          .map((index) => index + 1)
          .join(', ')} before reducing the column count.`,
        'warning'
      );
      actions.renderCanvas();
      return;
    }

    let updateError = '';
    const updated = await deps.updateSection(
      sectionId,
      { layout },
      {
        onError: (error) => {
          updateError = error?.message || '';
        },
      }
    );
    if (updated) {
      const section = getSectionRecord(sectionId);
      if (section) {
        section.layout = updated.layout || layout;
        // Sync module placement the backend returns. It no longer rehomes on shrink
        // (now rejected above); retained for other layout-edit responses.
        if (Array.isArray(updated.modules) && Array.isArray(section.modules)) {
          const byId = new Map(section.modules.map((module) => [module.id, module]));
          updated.modules.forEach((updatedModule) => {
            const local = byId.get(updatedModule.id);
            if (local) {
              local.columnIndex = updatedModule.columnIndex;
              local.sortIndex = updatedModule.sortIndex;
            }
          });
        }
      }
      actions.renderCanvas();
    } else if (updateError) {
      actions.setCanvasStatus(updateError, 'danger');
      actions.renderCanvas();
    }
  }

  return {
    changeSectionLayout,
    insertModuleAt,
    duplicateModuleAfter,
    insertSectionAt,
    moveModuleToTarget,
    reorderSectionToIndex,
    sortCanvasModulesForColumn,
    getVisibleSectionModuleCount,
  };
}

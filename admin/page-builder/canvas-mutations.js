function sortModulesForColumn(section, columnIndex) {
  return (section?.modules || [])
    .filter((module) => module.columnIndex === columnIndex)
    .slice()
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
}

function findModuleLocation(currentPage, moduleId) {
  for (const section of currentPage?.sections || []) {
    const modules = section.modules || [];
    const module = modules.find((item) => item.id === moduleId);
    if (module) {
      return { section, module };
    }
  }
  return null;
}

export function createCanvasMutations({ getState, actions, deps, helpers }) {
  function getSectionRecord(sectionId) {
    return (
      (getState().currentPage?.sections || []).find((section) => section.id === sectionId) || null
    );
  }

  async function addModuleWithDefault(sectionId, moduleType, columnIndex = 0, sortIndex = null) {
    const config = helpers.getDefaultConfig(moduleType);
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

  async function insertModuleAt(sectionId, columnIndex, insertIndex, moduleType) {
    const { currentPage } = getState();
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

    await deps.reorderModules(sectionId, columnIndex, orderedIds);
    applyModuleOrderLocally(sectionId, columnIndex, orderedIds);
    actions.setActiveInsertTarget(null);
    actions.setCanvasStatus(`${helpers.getModuleLabel(moduleType)} module added.`, 'success');
    actions.renderCanvas();
  }

  async function moveModuleToTarget(moduleId, targetSectionId, targetColumnIndex, insertIndex) {
    const { currentPage } = getState();
    if (!currentPage) return;
    const location = findModuleLocation(currentPage, moduleId);
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
      await deps.reorderModules(targetSectionId, targetColumnIndex, targetOrderedIds);
      applyModuleOrderLocally(targetSectionId, targetColumnIndex, targetOrderedIds);
      actions.renderCanvas();
      return;
    }

    const movedModule = await deps.moveModule(
      moduleId,
      targetSectionId,
      targetColumnIndex,
      insertIndex
    );
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
      await deps.reorderModules(sourceSection.id, sourceColumnIndex, sourceOrderedIds);
      applyModuleOrderLocally(sourceSection.id, sourceColumnIndex, sourceOrderedIds);
    }

    await deps.reorderModules(targetSectionId, targetColumnIndex, targetOrderedIds);
    applyModuleOrderLocally(targetSectionId, targetColumnIndex, targetOrderedIds);
    actions.setCanvasStatus('Module moved.', 'success');
    actions.renderCanvas();
  }

  async function insertSectionAt(index) {
    const { currentPage } = getState();
    if (!currentPage) return;
    const newSection = await deps.addSection(currentPage.id);
    if (!newSection) return;

    currentPage.sections = currentPage.sections || [];
    currentPage.sections.push(newSection);
    const sectionIds = currentPage.sections
      .map((section) => section.id)
      .filter((id) => id !== newSection.id);
    sectionIds.splice(index, 0, newSection.id);
    await deps.reorderSections(currentPage.id, sectionIds);
    applySectionOrderLocally(sectionIds);
    actions.setCanvasStatus('Section added.', 'success');
    actions.renderCanvas();
  }

  async function reorderSectionToIndex(sectionId, insertIndex) {
    const { currentPage } = getState();
    if (!currentPage) return;
    const sectionIds = helpers
      .sortSections(currentPage.sections)
      .map((section) => section.id)
      .filter((id) => id !== sectionId);
    sectionIds.splice(insertIndex, 0, sectionId);
    await deps.reorderSections(currentPage.id, sectionIds);
    applySectionOrderLocally(sectionIds);
    actions.setCanvasStatus('Section reordered.', 'success');
    actions.renderCanvas();
  }

  async function changeSectionLayout(sectionId, layout) {
    const updated = await deps.updateSection(sectionId, { layout });
    if (updated) {
      const section = getSectionRecord(sectionId);
      if (section) section.layout = updated.layout || layout;
      actions.renderCanvas();
    }
  }

  return {
    changeSectionLayout,
    insertModuleAt,
    insertSectionAt,
    moveModuleToTarget,
    reorderSectionToIndex,
    sortCanvasModulesForColumn,
    getVisibleSectionModuleCount,
  };
}

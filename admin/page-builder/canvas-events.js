function parseNumber(value) {
  return parseInt(value, 10) || 0;
}

export function createCanvasEventBinder({ el, getState, actions }) {
  function bindInsertSectionActions() {
    el.pbCanvas.querySelectorAll('[data-action="insert-section"]').forEach((button) => {
      button.addEventListener('click', async () => {
        await actions.insertSectionAt(parseNumber(button.dataset.insertIndex));
      });
    });
  }

  function bindSectionReorderActions() {
    el.pbCanvas.querySelectorAll('.pb-section-insert').forEach((insertEl) => {
      insertEl.addEventListener('dragover', (event) => {
        if (!getState().draggedSectionId) return;
        event.preventDefault();
        insertEl.classList.add('drag-over');
      });

      insertEl.addEventListener('dragleave', () => {
        insertEl.classList.remove('drag-over');
      });

      insertEl.addEventListener('drop', async (event) => {
        const { draggedSectionId } = getState();
        if (!draggedSectionId) return;

        event.preventDefault();
        insertEl.classList.remove('drag-over');
        actions.setDraggedSectionId(null);
        await actions.reorderSectionToIndex(
          draggedSectionId,
          parseNumber(insertEl.dataset.insertIndex)
        );
      });
    });

    el.pbCanvas.querySelectorAll('[data-action="section-drag"]').forEach((handle) => {
      handle.addEventListener('dragstart', (event) => {
        actions.setDraggedSectionId(handle.dataset.sectionId);
        event.dataTransfer.effectAllowed = 'move';
      });

      handle.addEventListener('dragend', () => {
        actions.setDraggedSectionId(null);
      });
    });
  }

  function bindSectionSettingsActions() {
    el.pbCanvas.querySelectorAll('[data-action="change-layout"]').forEach((select) => {
      select.addEventListener('change', async () => {
        await actions.changeSectionLayout(select.dataset.sectionId, select.value);
      });
    });

    el.pbCanvas.querySelectorAll('[data-action="toggle-section-settings"]').forEach((button) => {
      button.addEventListener('click', () => {
        actions.toggleSectionSettings(button.dataset.sectionId);
      });
    });

    if (!getState().activeSectionId) return;

    el.pbCanvas.querySelectorAll('.pb-section-settings-input').forEach((input) => {
      input.addEventListener('change', () => {
        actions.updateActiveSectionDraftField(input.dataset.setting, input.value);
      });
    });

    el.pbCanvas
      .querySelector('[data-action="discard-section-settings"]')
      ?.addEventListener('click', () => {
        actions.discardSectionSettings();
      });

    el.pbCanvas
      .querySelector('[data-action="save-section-settings"]')
      ?.addEventListener('click', async () => {
        await actions.saveSectionSettings();
      });
  }

  function bindModuleInsertActions() {
    el.pbCanvas.querySelectorAll('.pb-module-insert').forEach((insertEl) => {
      insertEl.addEventListener('dragover', (event) => {
        const moduleType = event.dataTransfer?.getData('text/plain');
        if (!getState().draggedModuleId && !moduleType) return;
        event.preventDefault();
        insertEl.classList.add('drag-over');
      });

      insertEl.addEventListener('dragleave', () => {
        insertEl.classList.remove('drag-over');
      });

      insertEl.addEventListener('drop', async (event) => {
        const droppedModuleType = event.dataTransfer?.getData('text/plain');
        const { draggedModuleId } = getState();
        if (!draggedModuleId && !droppedModuleType) return;

        event.preventDefault();
        insertEl.classList.remove('drag-over');

        const sectionId = insertEl.dataset.sectionId;
        const columnIndex = parseNumber(insertEl.dataset.columnIndex);
        const insertIndex = parseNumber(insertEl.dataset.insertIndex);

        if (draggedModuleId) {
          actions.setDraggedModuleId(null);
          await actions.moveModuleToTarget(draggedModuleId, sectionId, columnIndex, insertIndex);
          return;
        }

        if (droppedModuleType) {
          await actions.insertModuleAt(sectionId, columnIndex, insertIndex, droppedModuleType);
        }
      });
    });

    el.pbCanvas.querySelectorAll('[data-action="toggle-module-picker"]').forEach((button) => {
      button.addEventListener('click', () => {
        actions.toggleModulePicker({
          sectionId: button.dataset.sectionId,
          columnIndex: parseNumber(button.dataset.columnIndex),
          insertIndex: parseNumber(button.dataset.insertIndex),
        });
      });
    });

    el.pbCanvas.querySelectorAll('[data-action="insert-module-type"]').forEach((button) => {
      button.addEventListener('click', async () => {
        await actions.insertModuleAt(
          button.dataset.sectionId,
          parseNumber(button.dataset.columnIndex),
          parseNumber(button.dataset.insertIndex),
          button.dataset.moduleType
        );
      });
    });
  }

  function bindHeaderSelectionAction() {
    el.pbCanvas
      .querySelector('[data-action="select-page-header"]')
      ?.addEventListener('click', () => {
        actions.selectPageHeaderFromCanvas();
      });
  }

  function bindPageSettingsSelectionAction() {
    (el.pbPageTitle || el.pbCanvas)
      .querySelector('[data-action="select-page-settings"]')
      ?.addEventListener('click', () => {
        actions.selectPageSettingsFromCanvas();
      });
  }

  function bindModuleActions() {
    el.pbCanvas.querySelectorAll('.pb-module').forEach((moduleEl) => {
      const moduleId = moduleEl.dataset.moduleId;

      moduleEl.addEventListener('dragstart', (event) => {
        actions.setDraggedModuleId(moduleId);
        event.dataTransfer.effectAllowed = 'move';
      });

      moduleEl.addEventListener('dragend', () => {
        actions.setDraggedModuleId(null);
      });

      moduleEl.addEventListener('click', () => {
        actions.selectModule(moduleId);
      });

      moduleEl
        .querySelector('[data-action="delete-module"]')
        ?.addEventListener('click', async (event) => {
          event.stopPropagation();
          await actions.deleteModuleFromCanvas(moduleId);
        });
    });
  }

  function bindSectionDeleteActions() {
    el.pbCanvas.querySelectorAll('[data-action="delete-section"]').forEach((button) => {
      button.addEventListener('click', async () => {
        await actions.deleteSectionFromCanvas(button.dataset.sectionId);
      });
    });
  }

  function bindCanvasEvents() {
    if (!el.pbCanvas) return;
    bindInsertSectionActions();
    bindSectionReorderActions();
    bindSectionSettingsActions();
    bindModuleInsertActions();
    bindHeaderSelectionAction();
    bindPageSettingsSelectionAction();
    bindModuleActions();
    bindSectionDeleteActions();
  }

  return bindCanvasEvents;
}

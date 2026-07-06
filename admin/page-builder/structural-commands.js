import { LIVE_DROP_PLACEMENTS, resolveLiveDropPlacement } from './live-drop-placement.js';
import { getPageModuleDuplicateEligibility } from './module-eligibility.js';

export const BUILDER_STRUCTURAL_COMMANDS = Object.freeze({
  DRAG_START: 'builder:drag-start',
  DRAG_OVER: 'builder:drag-over',
  DROP: 'builder:drop',
  DRAG_END: 'builder:drag-end',
  INSERT: 'builder:insert',
  MOVE: 'builder:move',
  INSERT_SECTION: 'builder:insert-section',
  MOVE_SECTION: 'builder:move-section',
  DELETE_SELECTED: 'builder:delete-selected',
  HIDE_ON_DEVICE: 'builder:hide-on-device',
  DUPLICATE_SELECTED: 'builder:duplicate-selected',
  MOVE_MODULE_STEP: 'builder:move-module-step',
  MOVE_HEADER_BLOCK: 'builder:move-header-block',
});

function result(ok, details = {}) {
  return { ok, ...details };
}

function getTargetKind(target) {
  return String(target?.kind || '');
}

function isNewSectionPlacement(placement) {
  return (
    placement?.placement === LIVE_DROP_PLACEMENTS.PAGE_END ||
    placement?.placement === LIVE_DROP_PLACEMENTS.SECTION_BEFORE ||
    placement?.placement === LIVE_DROP_PLACEMENTS.SECTION_AFTER
  );
}

export function createStructuralCommandAdapter({ getState, actions, helpers }) {
  function setDragState(nextState) {
    actions.setLiveDragState(nextState || null);
  }

  function updateDragPlacement(placement) {
    const current = getState().liveDragState;
    if (!current) return;
    setDragState({ ...current, currentPlacement: placement || null });
  }

  function ensureClean(message) {
    return actions.ensureCleanWorkspace(message);
  }

  function getSelectedTarget(target = null) {
    return target || getState().selectedTarget || null;
  }

  async function selectResultTarget(target) {
    if (!target) return;
    if (target.kind === 'module') {
      actions.selectModule(target.moduleId);
      actions.showSidePanelTab('settings');
      return;
    }
    if (target.kind === 'section') {
      actions.selectSection(target.sectionId);
      actions.showSidePanelTab('settings');
    }
  }

  async function insertModuleIntoExistingTarget(moduleType, placement) {
    const inserted = await actions.insertModuleAt(
      placement.sectionId,
      placement.columnIndex,
      placement.insertIndex,
      moduleType
    );
    if (!inserted) return result(false, { status: 'Module insert failed.' });
    await selectResultTarget({ kind: 'module', moduleId: inserted.id });
    return result(true, {
      selectedTarget: { kind: 'module', moduleId: inserted.id },
      status: `${helpers.getModuleLabel(moduleType)} module added.`,
    });
  }

  async function insertModuleIntoNewSection(moduleType, placement) {
    const section = await actions.insertSectionAt(placement.sectionIndex);
    if (!section?.id) return result(false, { status: 'Section insert failed.' });
    const inserted = await actions.insertModuleAt(section.id, 0, 0, moduleType);
    if (!inserted) return result(false, { status: 'Module insert failed.' });
    await selectResultTarget({ kind: 'module', moduleId: inserted.id });
    return result(true, {
      selectedTarget: { kind: 'module', moduleId: inserted.id },
      status: `${helpers.getModuleLabel(moduleType)} module added.`,
    });
  }

  async function moveModuleIntoExistingTarget(moduleId, placement) {
    const moved = await actions.moveModuleToTarget(
      moduleId,
      placement.sectionId,
      placement.columnIndex,
      placement.insertIndex
    );
    if (!moved) return result(false, { status: 'Module move failed.' });
    await selectResultTarget({ kind: 'module', moduleId });
    return result(true, {
      selectedTarget: { kind: 'module', moduleId },
      status: 'Module moved.',
    });
  }

  async function moveModuleIntoNewSection(moduleId, placement) {
    const section = await actions.insertSectionAt(placement.sectionIndex);
    if (!section?.id) return result(false, { status: 'Section insert failed.' });
    return moveModuleIntoExistingTarget(moduleId, {
      placement: LIVE_DROP_PLACEMENTS.EMPTY_COLUMN,
      sectionId: section.id,
      columnIndex: 0,
      insertIndex: 0,
    });
  }

  async function runInsert(payload = {}) {
    const moduleType = payload.moduleType || getState().liveDragState?.moduleType;
    const placement = payload.placement || getState().activeInsertTarget;
    if (!moduleType && payload.target) {
      if (!ensureClean('Save or discard your current changes before choosing an insert target.')) {
        return result(false);
      }
      const pendingTarget = actions.createPendingInsertTarget(payload.target, payload.position);
      if (!pendingTarget) {
        return result(false, { status: 'This target does not support insertion.' });
      }
      actions.setActiveInsertTarget(pendingTarget);
      actions.showSidePanelTab('blocks');
      actions.setCanvasStatus('Choose a block to insert at the selected target.', 'neutral');
      return result(true, { placement: pendingTarget });
    }
    if (!moduleType) return result(false, { status: 'No block selected.' });
    if (!placement) return result(false, { status: 'No insert target selected.' });
    if (!ensureClean('Save or discard your current changes before inserting a block.')) {
      return result(false);
    }

    const commandResult = isNewSectionPlacement(placement)
      ? await insertModuleIntoNewSection(moduleType, placement)
      : await insertModuleIntoExistingTarget(moduleType, placement);
    if (commandResult.ok) {
      actions.setActiveInsertTarget(null);
      actions.clearLiveDragState();
      actions.requestFreshTargets();
    }
    return commandResult;
  }

  async function runMove(payload = {}) {
    const moduleId = payload.moduleId || getState().liveDragState?.moduleId;
    const placement = payload.placement || getState().liveDragState?.currentPlacement;
    if (!moduleId || !placement) return result(false, { status: 'No move target selected.' });
    if (!ensureClean('Save or discard your current changes before moving a module.')) {
      return result(false);
    }
    const commandResult = isNewSectionPlacement(placement)
      ? await moveModuleIntoNewSection(moduleId, placement)
      : await moveModuleIntoExistingTarget(moduleId, placement);
    if (commandResult.ok) {
      actions.clearLiveDragState();
      actions.requestFreshTargets();
    }
    return commandResult;
  }

  async function runInsertSection(payload = {}) {
    if (!ensureClean('Save or discard your current changes before adding a section.')) {
      return result(false);
    }
    const sectionIndex = Number.isSafeInteger(payload.sectionIndex)
      ? payload.sectionIndex
      : helpers.getSectionCount();
    const section = await actions.insertSectionAt(sectionIndex);
    if (!section?.id) return result(false, { status: 'Section insert failed.' });
    await selectResultTarget({ kind: 'section', sectionId: section.id });
    actions.requestFreshTargets();
    return result(true, {
      selectedTarget: { kind: 'section', sectionId: section.id },
      status: 'Section added.',
    });
  }

  async function runMoveSection(payload = {}) {
    const sectionId = payload.sectionId || getState().liveDragState?.sectionId;
    const placement = payload.placement || getState().liveDragState?.currentPlacement;
    if (!sectionId || !Number.isSafeInteger(placement?.sectionIndex)) {
      return result(false, { status: 'No section move target selected.' });
    }
    if (!ensureClean('Save or discard your current changes before moving a section.')) {
      return result(false);
    }
    const moved = await actions.reorderSectionToIndex(sectionId, placement.sectionIndex);
    if (!moved) return result(false, { status: 'Section move failed.' });
    await selectResultTarget({ kind: 'section', sectionId });
    actions.clearLiveDragState();
    actions.requestFreshTargets();
    return result(true, {
      selectedTarget: { kind: 'section', sectionId },
      status: 'Section moved.',
    });
  }

  function runDragStart(payload = {}) {
    const source = payload.source;
    // Header block placement edits go through the header draft, so an already-dirty
    // header draft is fine here; page-builder guards against other dirty scopes.
    if (source === 'header-block') {
      if (!payload.blockId) return result(false, { status: 'Unsupported drag source.' });
      if (actions.canMoveHeaderBlocks?.() === false) return result(false);
      setDragState({
        dragId: `drag-${Date.now().toString(36)}`,
        source,
        effect: 'move-header-block',
        blockId: payload.blockId,
        originTarget: payload.originTarget || null,
        currentPlacement: null,
      });
      return result(true);
    }
    if (!ensureClean('Save or discard your current changes before dragging structure.')) {
      return result(false);
    }
    if (source === 'block' && payload.moduleType) {
      setDragState({
        dragId: `drag-${Date.now().toString(36)}`,
        source,
        effect: 'insert',
        moduleType: payload.moduleType,
        originTarget: null,
        currentPlacement: null,
      });
      return result(true);
    }
    if (source === 'module' && payload.moduleId) {
      setDragState({
        dragId: `drag-${Date.now().toString(36)}`,
        source,
        effect: 'move',
        moduleId: payload.moduleId,
        originTarget: payload.originTarget || null,
        currentPlacement: null,
      });
      return result(true);
    }
    if (source === 'section' && payload.sectionId) {
      setDragState({
        dragId: `drag-${Date.now().toString(36)}`,
        source,
        effect: 'move-section',
        sectionId: payload.sectionId,
        originTarget: payload.originTarget || null,
        currentPlacement: null,
      });
      return result(true);
    }
    return result(false, { status: 'Unsupported drag source.' });
  }

  function runDragOver(payload = {}) {
    const dragState = getState().liveDragState;
    if (!dragState) return result(false);
    const placement = resolveLiveDropPlacement({
      page: getState().currentPage,
      targets: payload.targets || [],
      point: payload.point || {},
      dragState,
    });
    updateDragPlacement(placement);
    return result(!!placement, { placement });
  }

  async function runDrop(payload = {}) {
    const dragState = getState().liveDragState;
    if (!dragState) return result(false);
    const placement = resolveLiveDropPlacement({
      page: getState().currentPage,
      targets: payload.targets || [],
      point: payload.point || {},
      dragState,
    });
    if (!placement) {
      actions.clearLiveDragState();
      return result(false, { status: 'No valid drop target.' });
    }
    let commandResult = null;
    if (dragState.effect === 'insert') {
      commandResult = await runInsert({ moduleType: dragState.moduleType, placement });
    } else if (dragState.effect === 'move') {
      commandResult = await runMove({ moduleId: dragState.moduleId, placement });
    } else if (dragState.effect === 'move-section') {
      commandResult = await runMoveSection({ sectionId: dragState.sectionId, placement });
    } else if (dragState.effect === 'move-header-block') {
      commandResult = runMoveHeaderBlockDrop({ blockId: dragState.blockId, placement });
    } else {
      commandResult = result(false);
    }
    if (!commandResult?.ok) {
      actions.clearLiveDragState();
    }
    return commandResult;
  }

  async function runDeleteSelected(payload = {}) {
    const target = getSelectedTarget(payload.target);
    if (!target) return result(false);
    if (!ensureClean('Save or discard your current changes before deleting structure.')) {
      return result(false);
    }
    if (getTargetKind(target) === 'module' && target.moduleId) {
      const deleted = await actions.deleteModuleFromCanvas(target.moduleId);
      if (deleted) actions.requestFreshTargets();
      return result(!!deleted);
    }
    if (getTargetKind(target) === 'section' && target.sectionId) {
      const deleted = await actions.deleteSectionFromCanvas(target.sectionId);
      if (deleted) actions.requestFreshTargets();
      return result(!!deleted);
    }
    return result(false, { status: 'This target cannot be deleted.' });
  }

  async function runDuplicateSelected(payload = {}) {
    const target = getSelectedTarget(payload.target);
    if (getTargetKind(target) !== 'module' || !target.moduleId) return result(false);
    const eligibility = getPageModuleDuplicateEligibility(getState().currentPage, target.moduleId);
    if (!eligibility.allowed) {
      const status =
        eligibility.reason === 'missing'
          ? 'The selected module could not be found.'
          : 'This module cannot be duplicated.';
      actions.setCanvasStatus(status, eligibility.reason === 'missing' ? 'danger' : 'warning');
      actions.renderCanvas();
      return result(false, { status });
    }
    if (!ensureClean('Save or discard your current changes before duplicating a module.')) {
      return result(false);
    }
    const created = await actions.duplicateModuleAfter(target.moduleId);
    if (!created?.id) return result(false, { status: 'Module duplicate failed.' });
    await selectResultTarget({ kind: 'module', moduleId: created.id });
    actions.requestFreshTargets();
    return result(true, {
      selectedTarget: { kind: 'module', moduleId: created.id },
      status: `${helpers.getModuleLabel(eligibility.location.module.moduleType)} module duplicated.`,
    });
  }

  async function runHideOnDevice(payload = {}) {
    const target = getSelectedTarget(payload.target);
    if (getTargetKind(target) !== 'module' || !target.moduleId) return result(false);
    if (!ensureClean('Save or discard your current changes before hiding this module.')) {
      return result(false);
    }
    const hidden = await actions.hideModuleOnCurrentDevice(target.moduleId);
    if (!hidden) return result(false, { status: 'Hide on current device failed.' });
    actions.requestFreshTargets();
    return result(true, { selectedTarget: target, status: 'Module hidden for current device.' });
  }

  function runCommand(id, payload = {}) {
    switch (id) {
      case BUILDER_STRUCTURAL_COMMANDS.DRAG_START:
        return runDragStart(payload);
      case BUILDER_STRUCTURAL_COMMANDS.DRAG_OVER:
        return runDragOver(payload);
      case BUILDER_STRUCTURAL_COMMANDS.DROP:
        return runDrop(payload);
      case BUILDER_STRUCTURAL_COMMANDS.DRAG_END:
        actions.clearLiveDragState();
        return result(true);
      case BUILDER_STRUCTURAL_COMMANDS.INSERT:
        return runInsert(payload);
      case BUILDER_STRUCTURAL_COMMANDS.MOVE:
        return runMove(payload);
      case BUILDER_STRUCTURAL_COMMANDS.INSERT_SECTION:
        return runInsertSection(payload);
      case BUILDER_STRUCTURAL_COMMANDS.MOVE_SECTION:
        return runMoveSection(payload);
      case BUILDER_STRUCTURAL_COMMANDS.DELETE_SELECTED:
        return runDeleteSelected(payload);
      case BUILDER_STRUCTURAL_COMMANDS.HIDE_ON_DEVICE:
        return runHideOnDevice(payload);
      case BUILDER_STRUCTURAL_COMMANDS.DUPLICATE_SELECTED:
        return runDuplicateSelected(payload);
      case BUILDER_STRUCTURAL_COMMANDS.MOVE_MODULE_STEP:
        return runMoveModuleStep(payload);
      case BUILDER_STRUCTURAL_COMMANDS.MOVE_HEADER_BLOCK:
        return runMoveHeaderBlock(payload);
      default:
        return result(false, { status: `Unknown command: ${id}` });
    }
  }

  // One-step toolbar move: up/down reorder within the column; left/right append the
  // module to the adjacent structural column (panels are columns, so this walks into
  // and out of reader panels too). The Comic Reader module is excluded — it owns the
  // viewport, not a panel slot.
  async function runMoveModuleStep(payload) {
    const target = payload?.target;
    const direction = String(payload?.direction || '');
    if (getTargetKind(target) !== 'module' || !target.moduleId) {
      return result(false, { status: 'Select a module to move.' });
    }
    const { currentPage } = getState();
    let section = null;
    let module = null;
    for (const candidate of currentPage?.sections || []) {
      module = (candidate.modules || []).find((item) => item.id === target.moduleId) || null;
      if (module) {
        section = candidate;
        break;
      }
    }
    if (!section || !module) {
      return result(false, { status: 'Module not found on this page.' });
    }
    if (String(module.moduleType) === 'reader') {
      return result(false, { status: 'The Comic Reader cannot be stepped between columns.' });
    }
    const columnIndex = Number(module.columnIndex) || 0;
    const siblings = (section.modules || [])
      .filter((item) => (Number(item.columnIndex) || 0) === columnIndex)
      .sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0));
    const position = siblings.findIndex((item) => item.id === module.id);
    const columnCount = String(section.layout || '1')
      .split('-')
      .filter(Boolean).length;

    if (direction === 'up' || direction === 'down') {
      const insertIndex = direction === 'up' ? position - 1 : position + 1;
      if (insertIndex < 0 || insertIndex > siblings.length - 1) {
        return result(false, { status: 'Already at the edge of this column.' });
      }
      const moved = await actions.moveModuleToTarget(
        module.id,
        section.id,
        columnIndex,
        insertIndex
      );
      return result(!!moved, moved ? {} : { status: 'Failed to move module.' });
    }
    if (direction === 'left' || direction === 'right') {
      const targetColumn = direction === 'left' ? columnIndex - 1 : columnIndex + 1;
      if (targetColumn < 0 || targetColumn >= columnCount) {
        return result(false, { status: 'No column in that direction.' });
      }
      const targetSiblings = (section.modules || []).filter(
        (item) => (Number(item.columnIndex) || 0) === targetColumn && item.id !== module.id
      );
      const moved = await actions.moveModuleToTarget(
        module.id,
        section.id,
        targetColumn,
        targetSiblings.length
      );
      return result(!!moved, moved ? {} : { status: 'Failed to move module.' });
    }
    return result(false, { status: `Unknown move direction: ${direction}` });
  }

  // One-step toolbar move for a selected header block: left/right walk the regions,
  // up/down walk the rows. Placement mutations run through the header draft
  // (page-builder.stepHeaderBlockPlacement), so edges come back as clean rejections.
  function runMoveHeaderBlock(payload) {
    const target = payload?.target;
    const direction = String(payload?.direction || '');
    const blockId = target?.blockId || payload?.blockId || '';
    if (getTargetKind(target) !== 'header' || !blockId) {
      return result(false, { status: 'Select a header block to move.' });
    }
    if (!['up', 'down', 'left', 'right'].includes(direction)) {
      return result(false, { status: `Unknown move direction: ${direction}` });
    }
    const moved = actions.stepHeaderBlockPlacement?.(blockId, direction);
    if (moved?.ok) actions.requestFreshTargets();
    return moved || result(false, { status: 'Header block moves are unavailable.' });
  }

  // Canvas drop for a dragged header block: only a header cell placement is valid;
  // anything else (dead space, non-header targets) is a clean no-op.
  function runMoveHeaderBlockDrop({ blockId, placement }) {
    if (!blockId || placement?.placement !== LIVE_DROP_PLACEMENTS.HEADER_CELL) {
      return result(false, { status: 'No valid drop target.' });
    }
    const moved = actions.moveHeaderBlockToCell?.(blockId, placement.rowId, placement.region);
    if (!moved?.ok) {
      return moved || result(false, { status: 'Header block moves are unavailable.' });
    }
    actions.clearLiveDragState();
    actions.requestFreshTargets();
    return result(true, { status: 'Header block moved.' });
  }

  return {
    runCommand,
  };
}

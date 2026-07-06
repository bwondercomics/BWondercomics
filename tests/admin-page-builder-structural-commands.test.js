import { describe, expect, it, vi } from 'vitest';

import {
  BUILDER_STRUCTURAL_COMMANDS,
  createStructuralCommandAdapter,
} from '../admin/page-builder/structural-commands.js';

function buildPage() {
  return {
    id: 'page-1',
    sections: [
      {
        id: 'section-1',
        layout: '1',
        sortIndex: 0,
        modules: [
          {
            id: 'module-1',
            moduleType: 'text',
            columnIndex: 0,
            sortIndex: 0,
            config: { content: '<p>Original</p>' },
          },
          {
            id: 'reader-1',
            moduleType: 'reader',
            columnIndex: 0,
            sortIndex: 1,
            config: { displayMode: 'paged' },
          },
        ],
      },
    ],
  };
}

describe('page-builder structural commands', () => {
  it('revalidates the final drop point instead of executing a stale drag-over placement', async () => {
    const page = buildPage();
    let liveDragState = null;
    const insertModuleAt = vi.fn();
    const moveModuleToTarget = vi.fn();
    const insertSectionAt = vi.fn();
    const reorderSectionToIndex = vi.fn();
    const adapter = createStructuralCommandAdapter({
      getState: () => ({
        currentPage: page,
        liveDragState,
        activeInsertTarget: null,
        selectedTarget: null,
      }),
      actions: {
        ensureCleanWorkspace: () => true,
        setLiveDragState: (nextState) => {
          liveDragState = nextState;
        },
        clearLiveDragState: () => {
          liveDragState = null;
        },
        setActiveInsertTarget: vi.fn(),
        setCanvasStatus: vi.fn(),
        renderCanvas: vi.fn(),
        insertModuleAt,
        moveModuleToTarget,
        insertSectionAt,
        reorderSectionToIndex,
        requestFreshTargets: vi.fn(),
        selectModule: vi.fn(),
        showSidePanelTab: vi.fn(),
      },
      helpers: {
        getModuleLabel: () => 'Text',
        getSectionCount: () => page.sections.length,
      },
    });
    const moduleTarget = {
      target: {
        kind: 'module',
        key: 'module:module-1',
        pageId: page.id,
        sectionId: 'section-1',
        columnIndex: 0,
        moduleId: 'module-1',
        moduleType: 'text',
      },
      rect: { top: 20, left: 20, right: 220, bottom: 120, width: 200, height: 100 },
      visible: true,
      order: 0,
      label: 'Text module',
    };

    expect(
      adapter.runCommand(BUILDER_STRUCTURAL_COMMANDS.DRAG_START, {
        source: 'block',
        moduleType: 'text',
      })
    ).toMatchObject({ ok: true });
    expect(
      adapter.runCommand(BUILDER_STRUCTURAL_COMMANDS.DRAG_OVER, {
        targets: [moduleTarget],
        point: { x: 80, y: 40 },
      })
    ).toMatchObject({ ok: true });
    expect(liveDragState?.currentPlacement).not.toBeNull();

    await expect(
      adapter.runCommand(BUILDER_STRUCTURAL_COMMANDS.DROP, {
        targets: [moduleTarget],
        point: { x: 900, y: 900 },
      })
    ).resolves.toEqual({
      ok: false,
      status: 'No valid drop target.',
    });

    expect(insertModuleAt).not.toHaveBeenCalled();
    expect(moveModuleToTarget).not.toHaveBeenCalled();
    expect(insertSectionAt).not.toHaveBeenCalled();
    expect(reorderSectionToIndex).not.toHaveBeenCalled();
    expect(liveDragState).toBeNull();
  });

  it('duplicates an eligible module and selects the copy', async () => {
    const page = buildPage();
    const duplicateModuleAfter = vi.fn(async () => ({ id: 'module-1-copy', moduleType: 'text' }));
    const selectModule = vi.fn();
    const requestFreshTargets = vi.fn();
    const adapter = createStructuralCommandAdapter({
      getState: () => ({
        currentPage: page,
        liveDragState: null,
        activeInsertTarget: null,
        selectedTarget: { kind: 'module', moduleId: 'module-1' },
      }),
      actions: {
        ensureCleanWorkspace: () => true,
        setLiveDragState: vi.fn(),
        clearLiveDragState: vi.fn(),
        setActiveInsertTarget: vi.fn(),
        setCanvasStatus: vi.fn(),
        renderCanvas: vi.fn(),
        duplicateModuleAfter,
        requestFreshTargets,
        selectModule,
        showSidePanelTab: vi.fn(),
      },
      helpers: { getModuleLabel: () => 'Text', getSectionCount: () => page.sections.length },
    });

    await expect(
      adapter.runCommand(BUILDER_STRUCTURAL_COMMANDS.DUPLICATE_SELECTED, {})
    ).resolves.toMatchObject({ ok: true, selectedTarget: { moduleId: 'module-1-copy' } });

    expect(duplicateModuleAfter).toHaveBeenCalledWith('module-1');
    expect(selectModule).toHaveBeenCalledWith('module-1-copy');
    expect(requestFreshTargets).toHaveBeenCalled();
  });

  it('rejects duplicate for a singleton Comic Reader using authoritative page state', async () => {
    const page = buildPage();
    const duplicateModuleAfter = vi.fn();
    const setCanvasStatus = vi.fn();
    const renderCanvas = vi.fn();
    const adapter = createStructuralCommandAdapter({
      getState: () => ({
        currentPage: page,
        liveDragState: null,
        activeInsertTarget: null,
        selectedTarget: { kind: 'module', moduleId: 'reader-1', moduleType: 'text' },
      }),
      actions: {
        ensureCleanWorkspace: () => true,
        setLiveDragState: vi.fn(),
        clearLiveDragState: vi.fn(),
        setActiveInsertTarget: vi.fn(),
        setCanvasStatus,
        renderCanvas,
        duplicateModuleAfter,
        requestFreshTargets: vi.fn(),
        selectModule: vi.fn(),
        showSidePanelTab: vi.fn(),
      },
      helpers: {
        getModuleLabel: () => 'Comic Reader',
        getSectionCount: () => page.sections.length,
      },
    });

    await expect(
      adapter.runCommand(BUILDER_STRUCTURAL_COMMANDS.DUPLICATE_SELECTED, {})
    ).resolves.toEqual({ ok: false, status: 'This module cannot be duplicated.' });

    expect(duplicateModuleAfter).not.toHaveBeenCalled();
    expect(setCanvasStatus).toHaveBeenCalledWith('This module cannot be duplicated.', 'warning');
    expect(renderCanvas).toHaveBeenCalled();
  });

  it('rejects duplicate when the selected module is missing from the page', async () => {
    const page = buildPage();
    const duplicateModuleAfter = vi.fn();
    const setCanvasStatus = vi.fn();
    const renderCanvas = vi.fn();
    const adapter = createStructuralCommandAdapter({
      getState: () => ({
        currentPage: page,
        liveDragState: null,
        activeInsertTarget: null,
        selectedTarget: { kind: 'module', moduleId: 'missing-module', moduleType: 'text' },
      }),
      actions: {
        ensureCleanWorkspace: () => true,
        setLiveDragState: vi.fn(),
        clearLiveDragState: vi.fn(),
        setActiveInsertTarget: vi.fn(),
        setCanvasStatus,
        renderCanvas,
        duplicateModuleAfter,
        requestFreshTargets: vi.fn(),
        selectModule: vi.fn(),
        showSidePanelTab: vi.fn(),
      },
      helpers: {
        getModuleLabel: () => 'Text',
        getSectionCount: () => page.sections.length,
      },
    });

    await expect(
      adapter.runCommand(BUILDER_STRUCTURAL_COMMANDS.DUPLICATE_SELECTED, {})
    ).resolves.toEqual({ ok: false, status: 'The selected module could not be found.' });

    expect(duplicateModuleAfter).not.toHaveBeenCalled();
    expect(setCanvasStatus).toHaveBeenCalledWith(
      'The selected module could not be found.',
      'danger'
    );
    expect(renderCanvas).toHaveBeenCalled();
  });

  function createHeaderMoveAdapter({ stepHeaderBlockPlacement, moveHeaderBlockToCell } = {}) {
    const page = buildPage();
    let liveDragState = null;
    const ensureCleanWorkspace = vi.fn(() => {
      throw new Error('header block moves must not require a clean workspace');
    });
    const requestFreshTargets = vi.fn();
    const adapter = createStructuralCommandAdapter({
      getState: () => ({
        currentPage: page,
        liveDragState,
        activeInsertTarget: null,
        selectedTarget: null,
      }),
      actions: {
        ensureCleanWorkspace,
        setLiveDragState: (nextState) => {
          liveDragState = nextState;
        },
        clearLiveDragState: () => {
          liveDragState = null;
        },
        setActiveInsertTarget: vi.fn(),
        setCanvasStatus: vi.fn(),
        renderCanvas: vi.fn(),
        requestFreshTargets,
        selectModule: vi.fn(),
        showSidePanelTab: vi.fn(),
        canMoveHeaderBlocks: () => true,
        stepHeaderBlockPlacement,
        moveHeaderBlockToCell,
      },
      helpers: {
        getModuleLabel: () => 'Text',
        getSectionCount: () => page.sections.length,
      },
    });
    return { adapter, requestFreshTargets, getDragState: () => liveDragState };
  }

  it('steps a selected header block through the header draft placement action', async () => {
    const stepHeaderBlockPlacement = vi.fn(() => ({ ok: true }));
    const { adapter, requestFreshTargets } = createHeaderMoveAdapter({ stepHeaderBlockPlacement });

    expect(
      adapter.runCommand(BUILDER_STRUCTURAL_COMMANDS.MOVE_HEADER_BLOCK, {
        target: { kind: 'header', key: 'header:page-1:brand', pageId: 'page-1', blockId: 'brand' },
        direction: 'right',
      })
    ).toEqual({ ok: true });
    expect(stepHeaderBlockPlacement).toHaveBeenCalledWith('brand', 'right');
    expect(requestFreshTargets).toHaveBeenCalled();

    // Edge rejections pass straight through as clean no-ops.
    stepHeaderBlockPlacement.mockReturnValueOnce({ ok: false, status: 'Already in the top row.' });
    expect(
      adapter.runCommand(BUILDER_STRUCTURAL_COMMANDS.MOVE_HEADER_BLOCK, {
        target: { kind: 'header', key: 'header:page-1:brand', pageId: 'page-1', blockId: 'brand' },
        direction: 'up',
      })
    ).toEqual({ ok: false, status: 'Already in the top row.' });
  });

  it('drags a header block onto a header cell and rejects drops anywhere else', async () => {
    const moveHeaderBlockToCell = vi.fn(() => ({ ok: true }));
    const { adapter, getDragState } = createHeaderMoveAdapter({ moveHeaderBlockToCell });
    const cellTarget = {
      target: {
        kind: 'header',
        key: 'header-cell:page-1:bottom:right',
        pageId: 'page-1',
        surface: 'page-header',
        rowId: 'bottom',
        region: 'right',
      },
      rect: { top: 80, left: 500, right: 800, bottom: 130, width: 300, height: 50 },
      visible: true,
      order: 1,
      label: 'Header cell',
    };

    expect(
      adapter.runCommand(BUILDER_STRUCTURAL_COMMANDS.DRAG_START, {
        source: 'header-block',
        blockId: 'entryControls',
      })
    ).toMatchObject({ ok: true });
    expect(getDragState()).toMatchObject({ effect: 'move-header-block', blockId: 'entryControls' });

    // Drop outside every cell: clean no-op, no mutation.
    await expect(
      adapter.runCommand(BUILDER_STRUCTURAL_COMMANDS.DROP, {
        targets: [cellTarget],
        point: { x: 10, y: 10 },
      })
    ).resolves.toEqual({ ok: false, status: 'No valid drop target.' });
    expect(moveHeaderBlockToCell).not.toHaveBeenCalled();

    // Restart the drag (a failed drop clears drag state) and drop inside the cell.
    adapter.runCommand(BUILDER_STRUCTURAL_COMMANDS.DRAG_START, {
      source: 'header-block',
      blockId: 'entryControls',
    });
    await expect(
      adapter.runCommand(BUILDER_STRUCTURAL_COMMANDS.DROP, {
        targets: [cellTarget],
        point: { x: 600, y: 100 },
      })
    ).resolves.toMatchObject({ ok: true });
    expect(moveHeaderBlockToCell).toHaveBeenCalledWith('entryControls', 'bottom', 'right');
    expect(getDragState()).toBeNull();
  });
});

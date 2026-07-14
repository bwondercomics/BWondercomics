import { describe, expect, it, vi } from 'vitest';

import { createCanvasMutations } from '../admin/page-builder/canvas-mutations.js';

function buildPage() {
  return {
    id: 'page-1',
    sections: [
      {
        id: 'section-1',
        layout: '1',
        modules: [
          {
            id: 'module-1',
            moduleType: 'text',
            columnIndex: 0,
            sortIndex: 0,
            config: { content: '<p>Original</p>', appearance: { color: '#fff' } },
          },
          {
            id: 'module-2',
            moduleType: 'image',
            columnIndex: 0,
            sortIndex: 1,
            config: { src: 'media/example.png' },
          },
        ],
      },
    ],
  };
}

function clonePage(page) {
  return JSON.parse(JSON.stringify(page));
}

function createHarness({
  page = buildPage(),
  addModule,
  reorderModules = vi.fn(async () => true),
  deleteModule = vi.fn(async () => true),
  fetchPage = vi.fn(async () => null),
  updateSection = vi.fn(async () => null),
  ensureCleanWorkspace = null,
} = {}) {
  const state = { page };
  const setCanvasStatus = vi.fn();
  const renderCanvas = vi.fn();
  const replaceCurrentPageAfterMutationFailure = vi.fn((nextPage) => {
    state.page = nextPage;
  });
  const resolvedAddModule =
    addModule ||
    vi.fn(async (_sectionId, moduleType, columnIndex, config) => ({
      id: 'module-copy',
      moduleType,
      columnIndex,
      sortIndex: 2,
      config,
    }));
  const mutations = createCanvasMutations({
    getState: () => ({ currentPage: state.page }),
    actions: {
      ...(ensureCleanWorkspace ? { ensureCleanWorkspace } : {}),
      setActiveInsertTarget: vi.fn(),
      setCanvasStatus,
      renderCanvas,
      replaceCurrentPageAfterMutationFailure,
    },
    deps: {
      addModule: resolvedAddModule,
      reorderModules,
      deleteModule,
      fetchPage,
      moveModule: vi.fn(),
      addSection: vi.fn(),
      reorderSections: vi.fn(),
      updateSection,
    },
    helpers: {
      getDefaultConfig: vi.fn(() => ({})),
      getModuleLabel: (moduleType) => (moduleType === 'text' ? 'Text' : moduleType),
      sortSections: (sections) => sections,
    },
  });

  return {
    state,
    mutations,
    addModule: resolvedAddModule,
    reorderModules,
    deleteModule,
    fetchPage,
    updateSection,
    setCanvasStatus,
    renderCanvas,
    replaceCurrentPageAfterMutationFailure,
  };
}

describe('page-builder canvas mutations', () => {
  it('duplicates a module directly after its source with an independent config', async () => {
    const harness = createHarness();
    const source = harness.state.page.sections[0].modules[0];

    const created = await harness.mutations.duplicateModuleAfter(source.id);

    expect(created?.id).toBe('module-copy');
    const clonedConfig = harness.addModule.mock.calls[0][3];
    expect(clonedConfig).toEqual(source.config);
    expect(clonedConfig).not.toBe(source.config);
    expect(clonedConfig.appearance).not.toBe(source.config.appearance);
    clonedConfig.appearance.color = '#000';
    expect(source.config.appearance.color).toBe('#fff');
    expect(harness.reorderModules).toHaveBeenCalledWith('section-1', 0, [
      'module-1',
      'module-copy',
      'module-2',
    ]);
    expect(harness.state.page.sections[0].modules.map((module) => module.id)).toEqual([
      'module-1',
      'module-copy',
      'module-2',
    ]);
    expect(harness.state.page.sections[0].modules.map((module) => module.sortIndex)).toEqual([
      0, 1, 2,
    ]);
  });

  it('persists the duplicate order for a subsequent page reload', async () => {
    const serverPage = buildPage();
    const addModule = vi.fn(async (sectionId, moduleType, columnIndex, config) => {
      const created = {
        id: 'module-copy',
        moduleType,
        columnIndex,
        sortIndex: 2,
        config: clonePage(config),
      };
      serverPage.sections.find((section) => section.id === sectionId).modules.push(created);
      return clonePage(created);
    });
    const reorderModules = vi.fn(async (sectionId, columnIndex, moduleIds) => {
      const section = serverPage.sections.find((item) => item.id === sectionId);
      const order = new Map(moduleIds.map((id, index) => [id, index]));
      section.modules.forEach((module) => {
        if (module.columnIndex === columnIndex && order.has(module.id)) {
          module.sortIndex = order.get(module.id);
        }
      });
      return true;
    });
    const harness = createHarness({
      page: buildPage(),
      addModule,
      reorderModules,
    });

    await harness.mutations.duplicateModuleAfter('module-1');

    const reloadedModules = clonePage(serverPage).sections[0].modules.sort(
      (a, b) => a.sortIndex - b.sortIndex
    );
    expect(reloadedModules.map((module) => module.id)).toEqual([
      'module-1',
      'module-copy',
      'module-2',
    ]);
    expect(reloadedModules.map((module) => module.sortIndex)).toEqual([0, 1, 2]);
  });

  it('deletes the created copy when duplicate ordering fails', async () => {
    const reorderModules = vi.fn(async () => false);
    const deleteModule = vi.fn(async () => true);
    const harness = createHarness({ reorderModules, deleteModule });

    await expect(harness.mutations.duplicateModuleAfter('module-1')).resolves.toBeNull();

    expect(deleteModule).toHaveBeenCalledWith('module-copy');
    expect(harness.fetchPage).not.toHaveBeenCalled();
    expect(harness.state.page.sections[0].modules.map((module) => module.id)).toEqual([
      'module-1',
      'module-2',
    ]);
    expect(harness.setCanvasStatus).toHaveBeenCalledWith(
      'Failed to duplicate Text module.',
      'danger'
    );
  });

  it('reconciles from the server when duplicate cleanup fails', async () => {
    const reconciledPage = buildPage();
    reconciledPage.sections[0].modules.push({
      id: 'module-copy',
      moduleType: 'text',
      columnIndex: 0,
      sortIndex: 2,
      config: { content: '<p>Original</p>' },
    });
    const harness = createHarness({
      reorderModules: vi.fn(async () => false),
      deleteModule: vi.fn(async () => false),
      fetchPage: vi.fn(async () => reconciledPage),
    });

    await expect(harness.mutations.duplicateModuleAfter('module-1')).resolves.toBeNull();

    expect(harness.fetchPage).toHaveBeenCalledWith('page-1');
    expect(harness.replaceCurrentPageAfterMutationFailure).toHaveBeenCalledWith(reconciledPage);
    expect(harness.state.page.sections[0].modules.map((module) => module.id)).toContain(
      'module-copy'
    );
    expect(harness.setCanvasStatus).toHaveBeenCalledWith(
      'Failed to place the duplicate Text module. The page was refreshed to show the saved state.',
      'danger'
    );
  });

  it('keeps the created copy visible when cleanup and reconciliation both fail', async () => {
    const harness = createHarness({
      reorderModules: vi.fn(async () => false),
      deleteModule: vi.fn(async () => false),
      fetchPage: vi.fn(async () => null),
    });

    await expect(harness.mutations.duplicateModuleAfter('module-1')).resolves.toBeNull();

    expect(harness.state.page.sections[0].modules.map((module) => module.id)).toEqual([
      'module-1',
      'module-2',
      'module-copy',
    ]);
    expect(harness.setCanvasStatus).toHaveBeenCalledWith(
      'The duplicate Text module was created, but ordering and recovery failed. Reload the page before continuing.',
      'danger'
    );
  });

  it('blocks direct section-layout persistence while a structure draft is dirty', async () => {
    const ensureCleanWorkspace = vi.fn(() => false);
    const updateSection = vi.fn(async () => ({ layout: '1-1' }));
    const harness = createHarness({ ensureCleanWorkspace, updateSection });

    await harness.mutations.changeSectionLayout('section-1', '1-1');

    expect(ensureCleanWorkspace).toHaveBeenCalledWith(
      'Save or discard your current changes before changing section layout.'
    );
    expect(updateSection).not.toHaveBeenCalled();
    expect(harness.state.page.sections[0].layout).toBe('1');
  });
});

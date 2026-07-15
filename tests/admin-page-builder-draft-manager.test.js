import { describe, expect, it, vi } from 'vitest';

import { createDraftManager } from '../admin/page-builder/draft-manager.js';

function createDraftManagerHarness({ updateModule, updatePage } = {}) {
  const selectedModule = {
    id: 'module-1',
    config: { content: '<p>Saved</p>' },
  };
  const state = {
    currentPage: {
      id: 'page-1',
      slug: 'reader',
      title: 'Reader',
      meta: {},
    },
    selectedModuleId: selectedModule.id,
    selectedCanvasSurface: null,
    activeEditorTab: 'modules',
    responsiveEditScope: 'global',
    activeDeviceId: 'desktop',
    inlineEditState: null,
    builderRuntime: { compatible: true },
  };
  const actions = {
    buildNormalizedPageMeta: vi.fn(() => ({ header: {} })),
    getSelectedModuleRecord: vi.fn(() => selectedModule),
    getSectionRecord: vi.fn(() => null),
    renderCanvas: vi.fn(),
    renderEditorPanel: vi.fn(),
    renderPageList: vi.fn(),
    setCanvasStatus: vi.fn(),
    setEditorStatus: vi.fn(),
    setSelectedModuleId: vi.fn((nextModuleId) => {
      state.selectedModuleId = nextModuleId ?? null;
    }),
    syncDesignerRoute: vi.fn(),
    syncPageSummary: vi.fn((updatedPage) => {
      state.currentPage = updatedPage;
    }),
    updateEditorFooterUi: vi.fn(),
    refreshLiveCanvas: vi.fn(),
  };
  const deps = {
    updateModule: updateModule || vi.fn(async () => null),
    updatePage: updatePage || vi.fn(async () => null),
  };
  const manager = createDraftManager({
    getState: () => state,
    actions,
    deps,
  });

  // Seed the manager-owned drafts the way the shell does before explicit saves.
  manager.setModuleDraft(selectedModule.id, { content: '<p>Draft</p>' });
  manager.setDraft('theme', { theme: {} });
  manager.setDraft('header', {
    source: 'page-meta-v3',
    header: {},
    copy: {},
    responsive: {},
  });
  manager.setDraft('page-settings', {
    slug: 'reader',
    title: 'Reader',
    pageType: 'reader',
    isHomepage: false,
  });

  return { actions, deps, manager, selectedModule, state };
}

describe('admin page-builder draft manager', () => {
  it('returns false when explicit draft saves fail', async () => {
    const { actions, manager } = createDraftManagerHarness();

    await expect(manager.saveActiveModuleDraft()).resolves.toBe(false);
    await expect(manager.saveActiveThemeDraft()).resolves.toBe(false);
    await expect(manager.saveActiveHeaderDraft()).resolves.toBe(false);
    await expect(manager.saveActivePageSettingsDraft()).resolves.toBe(false);

    expect(manager.getDirtyScope()).toBeNull();
    expect(actions.setEditorStatus).toHaveBeenCalledWith('Failed to save module.', 'danger');
    expect(actions.setEditorStatus).toHaveBeenCalledWith('Failed to save theme.', 'danger');
    expect(actions.setEditorStatus).toHaveBeenCalledWith(
      'Failed to save the page header.',
      'danger'
    );
    expect(actions.setEditorStatus).toHaveBeenCalledWith('Failed to save page settings.', 'danger');
  });

  it('returns true only after a module draft save updates canonical state', async () => {
    const updateModule = vi.fn(async () => ({
      id: 'module-1',
      config: { content: '<p>Saved draft</p>' },
    }));
    const { actions, manager, selectedModule } = createDraftManagerHarness({ updateModule });
    manager.markDirty('module');
    expect(manager.getDirtyScope()).toBe('module');

    await expect(manager.saveActiveModuleDraft()).resolves.toBe(true);

    expect(updateModule).toHaveBeenCalledWith('module-1', {
      config: { content: '<p>Draft</p>' },
    });
    expect(selectedModule.config).toEqual({ content: '<p>Saved draft</p>' });
    expect(manager.getDraft('module')).toEqual({ content: '<p>Saved draft</p>' });
    expect(manager.getDirtyScope()).toBeNull();
    expect(actions.setEditorStatus).toHaveBeenCalledWith('Module saved.', 'success');
  });

  it('owns dirty scope and draft history round trips', () => {
    const { manager, state } = createDraftManagerHarness();
    // Mirror the real theme flow: Theme tab active with no module selected, so the
    // visible draft scope resolves to 'theme' once undo clears the dirty flag.
    state.activeEditorTab = 'theme';
    state.selectedModuleId = null;

    manager.initializeThemeDraft();
    const baseline = manager.normalizeThemeDraft(state.currentPage);
    expect(manager.getDraft('theme')).toEqual(baseline);

    const modified = { theme: { ...baseline.theme, accent: '#123456' } };
    manager.setDraft('theme', modified);
    manager.markDirty('theme');
    expect(manager.getDirtyScope()).toBe('theme');
    expect(manager.canUndoDraft()).toBe(true);
    expect(manager.canRedoDraft()).toBe(false);

    expect(manager.undoDraft().ok).toBe(true);
    expect(manager.getDraft('theme')).toEqual(baseline);
    expect(manager.getDirtyScope()).toBeNull();
    expect(manager.canRedoDraft()).toBe(true);

    expect(manager.redoDraft().ok).toBe(true);
    expect(manager.getDraft('theme')).toEqual(modified);
    expect(manager.getDirtyScope()).toBe('theme');

    manager.clearDirty('theme');
    expect(manager.getDirtyScope()).toBeNull();
    expect(manager.canUndoDraft()).toBe(false);
  });
});

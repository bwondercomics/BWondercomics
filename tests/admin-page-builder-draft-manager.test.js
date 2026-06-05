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
    activeModuleDraft: { content: '<p>Draft</p>' },
    activeThemeDraft: {
      theme: {},
      panelBackgrounds: {},
      panelSpacing: {},
    },
    activeHeaderDraft: {
      source: 'page-meta-v3',
      header: {},
      copy: {},
      responsive: {},
    },
    activePageSettingsDraft: {
      slug: 'reader',
      title: 'Reader',
      pageType: 'reader',
      isHomepage: false,
    },
  };
  const actions = {
    buildNormalizedPageMeta: vi.fn(() => ({ header: {} })),
    clearDirty: vi.fn(),
    getSelectedModuleRecord: vi.fn(() => selectedModule),
    renderCanvas: vi.fn(),
    renderEditorPanel: vi.fn(),
    renderPageList: vi.fn(),
    setActiveHeaderDraft: vi.fn((nextDraft) => {
      state.activeHeaderDraft = nextDraft;
    }),
    setActiveModuleDraft: vi.fn((nextDraft) => {
      state.activeModuleDraft = nextDraft;
    }),
    setActiveModuleDraftId: vi.fn(),
    setActivePageSettingsDraft: vi.fn((nextDraft) => {
      state.activePageSettingsDraft = nextDraft;
    }),
    setActiveThemeDraft: vi.fn((nextDraft) => {
      state.activeThemeDraft = nextDraft;
    }),
    setEditorStatus: vi.fn(),
    syncDesignerRoute: vi.fn(),
    syncPageSummary: vi.fn((updatedPage) => {
      state.currentPage = updatedPage;
    }),
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

  return { actions, deps, manager, selectedModule, state };
}

describe('admin page-builder draft manager', () => {
  it('returns false when explicit draft saves fail', async () => {
    const { actions, manager } = createDraftManagerHarness();

    await expect(manager.saveActiveModuleDraft()).resolves.toBe(false);
    await expect(manager.saveActiveThemeDraft()).resolves.toBe(false);
    await expect(manager.saveActiveHeaderDraft()).resolves.toBe(false);
    await expect(manager.saveActivePageSettingsDraft()).resolves.toBe(false);

    expect(actions.clearDirty).not.toHaveBeenCalled();
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

    await expect(manager.saveActiveModuleDraft()).resolves.toBe(true);

    expect(updateModule).toHaveBeenCalledWith('module-1', {
      config: { content: '<p>Draft</p>' },
    });
    expect(selectedModule.config).toEqual({ content: '<p>Saved draft</p>' });
    expect(actions.clearDirty).toHaveBeenCalledWith('module');
    expect(actions.setEditorStatus).toHaveBeenCalledWith('Module saved.', 'success');
  });
});

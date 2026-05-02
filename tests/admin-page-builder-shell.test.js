import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildContractFixture, getContractFixture } from './helpers/contracts.js';
import { flushAdminUi, mountAdminDom, stubAdminGlobals } from './helpers/admin-fixture.js';

function setViewportWidth(width) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
}

function createDragLikeEvent(type, dataTransfer, init = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'dataTransfer', {
    value: dataTransfer,
    configurable: true,
  });
  if (typeof init.clientY === 'number') {
    Object.defineProperty(event, 'clientY', {
      value: init.clientY,
      configurable: true,
    });
  }
  return event;
}

async function setupPageBuilder({
  fetchPagesResults = [],
  fetchPageResult = null,
  createPageResult = null,
  deletePageResult = true,
  reorderPagesResult = true,
  addModuleResult = null,
  updateSectionResult = null,
  deleteSectionResult = false,
  deleteModuleResult = false,
  updatePageResult = null,
  useRealEditors = false,
  viewportWidth = 1600,
  onDesignerRouteChange = vi.fn(),
} = {}) {
  vi.resetModules();
  mountAdminDom();
  stubAdminGlobals(vi);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  window.localStorage.clear();
  setViewportWidth(viewportWidth);

  const fetchPages = vi.fn();
  fetchPagesResults.forEach((result) => fetchPages.mockResolvedValueOnce(result));
  if (!fetchPages.mock.calls.length && fetchPagesResults.length === 0) {
    fetchPages.mockResolvedValue([]);
  }
  const fetchPage = vi.fn(async () => fetchPageResult);
  const createPage = vi.fn(async () => createPageResult);
  const deletePage = vi.fn(async () => deletePageResult);
  const reorderPages = vi.fn(async () => reorderPagesResult);
  const updatePage = vi.fn(
    async (_pageId, data) =>
      updatePageResult || {
        ...(fetchPageResult || createPageResult || {}),
        ...data,
      }
  );
  const addSection = vi.fn(async () => ({
    id: 'new-section-id',
    layout: '1',
    modules: [],
    settings: {},
  }));
  const reorderSections = vi.fn(async () => true);
  const addModule = vi.fn(async (_sectionId, moduleType, columnIndex, config, _sortIndex) => ({
    id: 'new-module-id',
    moduleType,
    columnIndex,
    sortIndex: 99,
    config,
    ...(addModuleResult || {}),
  }));
  const updateModule = vi.fn(async (moduleId, data) => ({
    id: moduleId,
    config: data?.config || {},
  }));
  const moveModule = vi.fn(async (_moduleId, _sectionId, columnIndex, sortIndex) => ({
    id: 'moved-module-id',
    columnIndex,
    sortIndex,
    config: {},
  }));
  const reorderModules = vi.fn(async () => true);
  const updateSection = vi.fn(async () => updateSectionResult);
  const deleteSection = vi.fn(async () => deleteSectionResult);
  const deleteModule = vi.fn(async () => deleteModuleResult);

  vi.doMock('../admin/page-builder/data.js', () => ({
    fetchPages,
    fetchPage,
    createPage,
    deletePage,
    reorderPages,
    updatePage,
    fetchAssets: vi.fn(async () => []),
    uploadAsset: vi.fn(async () => ({})),
    addSection,
    updateSection,
    deleteSection,
    reorderSections,
    addModule,
    updateModule,
    moveModule,
    reorderModules,
    deleteModule,
  }));
  if (useRealEditors) {
    vi.doUnmock('../admin/page-builder/theme-editor.js');
    vi.doUnmock('../admin/page-builder/module-editor.js');
  } else {
    vi.doMock('../admin/page-builder/theme-editor.js', () => ({
      renderThemeEditorContent: vi.fn(() => '<div>Theme Editor</div>'),
      bindThemeEditorEvents: vi.fn(),
    }));
    vi.doMock('../admin/page-builder/module-editor.js', () => ({
      renderModuleEditorContent: vi.fn(() => '<div>Module Editor</div>'),
      bindModuleEditorEvents: vi.fn(),
    }));
  }
  vi.doMock('../admin/image-picker.js', () => ({
    openImagePicker: vi.fn(),
  }));
  vi.doMock('../admin/utils.js', () => ({
    readFileAsBase64: vi.fn(async () => 'ZmFrZQ=='),
  }));

  const { createPageBuilder } = await import('../admin/page-builder.js');
  const hideAllSections = vi.fn();
  const setActiveNav = vi.fn();
  const manager = createPageBuilder({
    sanitizeSeriesId: (value) =>
      String(value || '')
        .toLowerCase()
        .trim(),
    getActiveSeriesId: () => 'battle-bros',
    hideAllSections,
    setActiveNav,
    onDesignerRouteChange,
  });
  manager.initPageBuilder();

  return {
    manager,
    mocks: {
      addModule,
      addSection,
      createPage,
      deletePage,
      fetchPage,
      fetchPages,
      moveModule,
      reorderPages,
      reorderModules,
      reorderSections,
      updateSection,
      updateModule,
      updatePage,
      deleteSection,
      deleteModule,
      hideAllSections,
      setActiveNav,
      onDesignerRouteChange,
    },
  };
}

describe('admin page-builder shell', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('mounts the editor toggle beside the inspector rail and persists wide-screen mode changes', async () => {
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[]],
      viewportWidth: 1600,
    });

    await manager.showPageBuilderSection();

    const layout = document.querySelector('.page-builder-layout');
    const toggle = document.getElementById('pbToggleEditor');

    expect(toggle?.closest('.page-builder-editor')).not.toBeNull();
    expect(document.querySelector('.pb-canvas-header #pbToggleEditor')).toBeNull();
    expect(layout?.dataset.editorMode).toBe('docked');
    expect(layout?.style.getPropertyValue('--pb-editor-width')).toBe('520px');

    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(layout?.dataset.editorMode).toBe('collapsed');
    expect(layout?.style.getPropertyValue('--pb-editor-width')).toBe('320px');
    expect(window.localStorage.getItem('pb-editor-mode')).toBe('collapsed');

    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(layout?.dataset.editorMode).toBe('docked');
    expect(window.localStorage.getItem('pb-editor-mode')).toBe('docked');
  });

  it('routes nav-collapsed free space into the editor panel instead of the canvas', async () => {
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[]],
      viewportWidth: 1600,
    });

    await manager.showPageBuilderSection();

    const layout = document.querySelector('.page-builder-layout');
    const navToggle = document.getElementById('adminNavToggle');
    const dashboard = document.getElementById('adminDashboard');
    const editorToggle = document.getElementById('pbToggleEditor');

    expect(layout?.style.getPropertyValue('--pb-editor-width')).toBe('520px');

    dashboard?.classList.add('nav-collapsed');
    navToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    expect(layout?.style.getPropertyValue('--pb-editor-width')).toBe('620px');

    editorToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(layout?.style.getPropertyValue('--pb-editor-width')).toBe('420px');
  });

  it('lets the left rail collapse and sends that recovered width to the inspector', async () => {
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[]],
      viewportWidth: 1600,
    });

    await manager.showPageBuilderSection();

    const layout = document.querySelector('.page-builder-layout');
    const sidebarToggle = document.getElementById('pbToggleSidebar');
    const railLabel = document.getElementById('pbSidebarRailLabel');

    expect(layout?.dataset.sidebarMode).toBe('expanded');
    expect(layout?.style.getPropertyValue('--pb-sidebar-width')).toBe('200px');
    expect(layout?.style.getPropertyValue('--pb-editor-width')).toBe('520px');
    expect(railLabel?.textContent).toBe('Pages');

    sidebarToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(layout?.dataset.sidebarMode).toBe('collapsed');
    expect(layout?.style.getPropertyValue('--pb-sidebar-width')).toBe('72px');
    expect(layout?.style.getPropertyValue('--pb-editor-width')).toBe('648px');
    expect(window.localStorage.getItem('pb-sidebar-mode')).toBe('collapsed');
    expect(sidebarToggle?.getAttribute('aria-label')).toBe('Expand left panel');

    sidebarToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(layout?.dataset.sidebarMode).toBe('expanded');
    expect(layout?.style.getPropertyValue('--pb-sidebar-width')).toBe('200px');
    expect(layout?.style.getPropertyValue('--pb-editor-width')).toBe('520px');
    expect(window.localStorage.getItem('pb-sidebar-mode')).toBe('expanded');
  });

  it('switches the inspector to overlay mode on narrower desktop widths', async () => {
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[]],
      viewportWidth: 1280,
    });

    await manager.showPageBuilderSection();

    const layout = document.querySelector('.page-builder-layout');
    expect(layout?.dataset.editorMode).toBe('overlay');
    expect(layout?.dataset.viewportBand).toBe('medium');

    setViewportWidth(1600);
    window.dispatchEvent(new Event('resize'));

    expect(layout?.dataset.editorMode).toBe('docked');
    expect(layout?.dataset.viewportBand).toBe('wide');
  });

  it('blocks inspector tab switches until dirty theme edits are saved or discarded', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
      viewportWidth: 1600,
    });

    await manager.showPageBuilderSection();

    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector('.pb-editor-tab[data-tab="theme"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    const primaryInput = document.querySelector('.pb-theme-color-text[data-key="primary"]');
    primaryInput.value = '#112233';
    primaryInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAdminUi(1);

    document
      .querySelector('.pb-editor-tab[data-tab="modules"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    expect(document.querySelector('.pb-editor-tab.active[data-tab="theme"]')).not.toBeNull();
    expect(document.querySelector('.pb-editor-footer-status')?.textContent).toContain('unsaved');

    document
      .getElementById('pbDiscardTheme')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);
    document
      .querySelector('.pb-editor-tab[data-tab="modules"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    expect(document.querySelector('.pb-editor-tab.active[data-tab="modules"]')).not.toBeNull();
  });

  it('renders the empty state and adds a new page through the modal flow', async () => {
    const page = buildContractFixture('builderPage', {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee99',
      title: 'Reader Builder',
    });
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[], [page]],
      createPageResult: page,
    });

    await manager.showPageBuilderSection();
    expect(document.getElementById('pbPageList')?.textContent).toContain('No pages yet');

    document.getElementById('pbAddPage')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    document.getElementById('pbPageSlugInput').value = 'reader';
    document.getElementById('pbPageTitleInput').value = 'Reader Builder';
    const form = document.getElementById('pbAddPageForm');
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    form.appendChild(submitBtn);
    submitBtn.click();
    await flushAdminUi(3);

    expect(mocks.createPage).toHaveBeenCalledWith('battle-bros', 'reader', 'Reader Builder');
    expect(document.querySelector('.pb-page-item.active .pb-page-item-title')?.textContent).toBe(
      'Reader Builder'
    );
    expect(document.getElementById('pbPageTitle')?.textContent).toContain('Reader Builder');
  });

  it('opens page settings, edits fields, and saves the draft', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(document.querySelector('.pb-editor-kicker')?.textContent).toContain('Page Settings');
    expect(document.getElementById('pbSavePageSettings')).not.toBeNull();

    // Check initial values
    const slugInput = document.getElementById('pbEditPageSlug');
    const titleInput = document.getElementById('pbEditPageTitle');
    const pageTypeInput = document.getElementById('pbEditPageType');
    const isHomepageCheckbox = document.getElementById('pbEditIsHomepage');

    expect(slugInput.value).toBe(selectedPage.slug);
    expect(titleInput.value).toBe(selectedPage.title);
    expect(pageTypeInput.value).toBe(selectedPage.pageType);
    expect(isHomepageCheckbox.checked).toBe(selectedPage.isHomepage);

    // Edit fields
    slugInput.value = 'reader-new';
    slugInput.dispatchEvent(new Event('input', { bubbles: true }));

    titleInput.value = 'Reader New Title';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));

    pageTypeInput.value = 'landing';
    pageTypeInput.dispatchEvent(new Event('input', { bubbles: true }));

    isHomepageCheckbox.checked = true;
    isHomepageCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    await flushAdminUi(1);

    document
      .getElementById('pbSavePageSettings')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.updatePage).toHaveBeenCalledWith(
      selectedPage.id,
      expect.objectContaining({
        slug: 'reader-new',
        title: 'Reader New Title',
        pageType: 'landing',
        isHomepage: true,
      })
    );
  });

  it('supports drag and drop page reordering and rolls back on failure', async () => {
    const page1 = buildContractFixture('builderPage', {
      id: 'page-1',
      title: 'Page 1',
      sortIndex: 0,
    });
    const page2 = buildContractFixture('builderPage', {
      id: 'page-2',
      title: 'Page 2',
      sortIndex: 1,
    });
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[page1, page2]],
      reorderPagesResult: true,
    });

    mocks.reorderPages.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await manager.showPageBuilderSection();
    await flushAdminUi(3);

    const pageList = document.getElementById('pbPageList');
    let items = pageList.querySelectorAll('.pb-page-item');
    expect(items.length).toBe(2);
    expect(items[0].querySelector('.pb-page-item-title').textContent).toBe('Page 1');

    const dataTransfer = { effectAllowed: 'move' };
    items[0].getBoundingClientRect = () => ({ top: 0, height: 40 });
    items[1].dispatchEvent(createDragLikeEvent('dragstart', dataTransfer));
    items[0].dispatchEvent(createDragLikeEvent('dragover', dataTransfer, { clientY: 10 }));
    items[0].dispatchEvent(createDragLikeEvent('drop', dataTransfer));
    await flushAdminUi(3);

    items = document.getElementById('pbPageList').querySelectorAll('.pb-page-item');
    expect(items[0].querySelector('.pb-page-item-title').textContent).toBe('Page 2');
    expect(mocks.reorderPages).toHaveBeenNthCalledWith(1, 'battle-bros', ['page-2', 'page-1']);

    items[1].getBoundingClientRect = () => ({ top: 40, height: 40 });
    items[0].dispatchEvent(createDragLikeEvent('dragstart', dataTransfer));
    items[1].dispatchEvent(createDragLikeEvent('dragover', dataTransfer, { clientY: 70 }));
    items[1].dispatchEvent(createDragLikeEvent('drop', dataTransfer));
    await flushAdminUi(3);

    items = document.getElementById('pbPageList').querySelectorAll('.pb-page-item');
    expect(items[0].querySelector('.pb-page-item-title').textContent).toBe('Page 2');
    expect(items[1].querySelector('.pb-page-item-title').textContent).toBe('Page 1');
    expect(mocks.reorderPages).toHaveBeenNthCalledWith(2, 'battle-bros', ['page-1', 'page-2']);
  });

  it('supports page selection, page deletion, and default module config wiring', async () => {
    const firstPage = buildContractFixture('builderPageDraft', {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee31',
      title: 'About',
    });
    const selectedPage = getContractFixture('builderPage');
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[firstPage, selectedPage], [selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();

    const pageItems = document.querySelectorAll('.pb-page-item');
    pageItems[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.fetchPage).toHaveBeenCalledWith(selectedPage.id);
    expect(document.getElementById('pbCanvas')?.textContent).toContain('feed');

    pageItems[0]
      .querySelector('.pb-page-action.delete')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.deletePage).toHaveBeenCalledWith(firstPage.id);
    expect(document.querySelectorAll('.pb-page-item')).toHaveLength(1);

    document
      .querySelector('.pb-inline-insert-trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);
    document
      .querySelector('[data-action="insert-module-type"][data-module-type="feed"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.addModule).toHaveBeenCalledWith(
      selectedPage.sections[0].id,
      'feed',
      0,
      expect.objectContaining({
        limit: 5,
        showMediaButton: true,
        style: expect.objectContaining({
          headingBgColor: '#ffed00',
          itemBorderColor: '#00d9ff',
        }),
      }),
      null
    );
    expect(mocks.reorderModules).toHaveBeenCalledWith(
      selectedPage.sections[0].id,
      0,
      expect.any(Array)
    );
  });

  it('opens section settings and supports discard/save flows', async () => {
    const selectedPage = getContractFixture('builderPage');
    const editableSection = selectedPage.sections[1];
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      updateSectionResult: {
        id: editableSection.id,
        settings: {
          moduleGap: 28,
          columnGap: 24,
          sectionGap: 40,
        },
      },
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] [data-action="toggle-section-settings"]`
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    expect(
      document.querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-input[data-setting="moduleGap"]`
      )?.value
    ).toBe('20');
    expect(
      document.querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-input[data-setting="columnGap"]`
      )?.value
    ).toBe('24');

    const moduleGapInput = document.querySelector(
      `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-input[data-setting="moduleGap"]`
    );
    if (moduleGapInput) {
      moduleGapInput.value = '28';
      moduleGapInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await flushAdminUi(1);

    expect(
      document.querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-status`
      )?.textContent
    ).toContain('unsaved changes');

    document
      .querySelector('[data-action="discard-section-settings"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    expect(
      document.querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-input[data-setting="moduleGap"]`
      )?.value
    ).toBe('20');

    const savedModuleGapInput = document.querySelector(
      `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-input[data-setting="moduleGap"]`
    );
    const savedSectionGapInput = document.querySelector(
      `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-input[data-setting="sectionGap"]`
    );
    if (savedModuleGapInput) {
      savedModuleGapInput.value = '28';
      savedModuleGapInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (savedSectionGapInput) {
      savedSectionGapInput.value = '40';
      savedSectionGapInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await flushAdminUi(1);

    document
      .querySelector('[data-action="save-section-settings"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.updateSection).toHaveBeenCalledWith(editableSection.id, {
      settings: {
        moduleGap: 28,
        columnGap: 24,
        sectionGap: 40,
      },
    });
    expect(
      document.querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-input[data-setting="moduleGap"]`
      )?.value
    ).toBe('28');
    expect(
      document.querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-input[data-setting="sectionGap"]`
      )?.value
    ).toBe('40');
  });

  it('clears selected module state when a module is deleted from the canvas', async () => {
    const selectedPage = getContractFixture('builderPage');
    const feedModule = selectedPage.sections[1].modules.find(
      (module) => module.moduleType === 'feed'
    );
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      deleteModuleResult: true,
      useRealEditors: true,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector(`.pb-module[data-module-id="${feedModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Feed Module');

    document
      .querySelector(`.pb-module[data-module-id="${feedModule.id}"] [data-action="delete-module"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.deleteModule).toHaveBeenCalledWith(feedModule.id);
    expect(document.querySelector(`.pb-module[data-module-id="${feedModule.id}"]`)).toBeNull();
    expect(document.querySelector('.pb-module.selected')).toBeNull();
    expect(document.getElementById('pbEditorTitle')?.textContent).toContain(
      'Choose Something to Edit'
    );
    expect(document.getElementById('pbSaveModule')).toBeNull();
  });

  it('clears open section settings and stale selected module state when deleting a section', async () => {
    const selectedPage = getContractFixture('builderPage');
    const editableSection = selectedPage.sections[1];
    const textModule = editableSection.modules.find((module) => module.moduleType === 'text');
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      deleteSectionResult: true,
      useRealEditors: true,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector(`.pb-module[data-module-id="${textModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    document
      .querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] [data-action="toggle-section-settings"]`
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    expect(
      document.querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-card`
      )
    ).not.toBeNull();

    document
      .querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] [data-action="delete-section"]`
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.deleteSection).toHaveBeenCalledWith(editableSection.id);
    expect(
      document.querySelector(`.pb-section[data-section-id="${editableSection.id}"]`)
    ).toBeNull();
    expect(document.querySelector('.pb-module.selected')).toBeNull();
    expect(document.querySelector('.pb-section-settings-card')).toBeNull();
    expect(document.getElementById('pbEditorTitle')?.textContent).toContain(
      'Choose Something to Edit'
    );
  });

  it('renders page status details and supports explicit draft/publish actions', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();

    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(document.getElementById('pbPageTitle')?.textContent).not.toContain('Page ID:');
    expect(document.getElementById('pbPageTitle')?.textContent).toContain('reader');
    expect(document.getElementById('pbPageTitle')?.textContent).toContain('Published');
    expect(document.getElementById('pbPageTitle')?.textContent).toContain('Homepage');
    expect(document.getElementById('pbPageTitle')?.textContent).toContain(
      'Published page. Open Reader matches the public reader.'
    );

    const link = document.querySelector('.pb-open-reader-link');
    expect(link?.getAttribute('href')).toContain('../index.html?series=battle-bros&page=reader');
    expect(link?.getAttribute('href')).not.toContain('draft=1');
    expect(link?.textContent).toContain('Open Reader');

    document
      .getElementById('pbSaveDraft')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.updatePage).toHaveBeenCalledWith(
      selectedPage.id,
      expect.objectContaining({ isPublished: false })
    );
    expect(document.getElementById('pbPageTitle')?.textContent).toContain('Draft');
    expect(document.getElementById('pbPageTitle')?.textContent).toContain(
      'Draft page. Open Reader loads the draft preview until you publish changes.'
    );
    expect(document.querySelector('.pb-open-reader-link')?.getAttribute('href')).toContain(
      'draft=1'
    );
    expect(document.querySelector('.pb-open-reader-link')?.textContent).toContain(
      'Open Draft Preview'
    );

    document.getElementById('pbPublish')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.updatePage).toHaveBeenCalledWith(
      selectedPage.id,
      expect.objectContaining({ isPublished: true })
    );
    expect(document.getElementById('pbPageTitle')?.textContent).toContain('Published');
    expect(document.getElementById('pbPageTitle')?.textContent).toContain(
      'Published page. Open Reader matches the public reader.'
    );
    expect(document.querySelector('.pb-open-reader-link')?.getAttribute('href')).not.toContain(
      'draft=1'
    );
    expect(document.querySelector('.pb-open-reader-link')?.textContent).toContain('Open Reader');
  });

  it('blocks page-header selection while section settings have unsaved changes', async () => {
    const selectedPage = getContractFixture('builderPage');
    const editableSection = selectedPage.sections[1];
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] [data-action="toggle-section-settings"]`
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    const moduleGapInput = document.querySelector(
      `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-input[data-setting="moduleGap"]`
    );
    if (moduleGapInput) {
      moduleGapInput.value = '28';
      moduleGapInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await flushAdminUi(1);

    document
      .querySelector('[data-action="select-page-header"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    expect(document.getElementById('pbEditorTitle')?.textContent).not.toContain('Header Settings');
    expect(document.getElementById('pbSaveHeader')).toBeNull();
    expect(
      document.querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-card`
      )
    ).not.toBeNull();
    expect(document.querySelector('.pb-canvas-notice')?.textContent).toContain(
      'Save or discard your current changes before switching to the page header.'
    );
  });

  it('persists a normalized v3 page header on explicit draft saves for legacy pages', async () => {
    const legacyPage = getContractFixture('builderPage');
    delete legacyPage.meta.header;
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[legacyPage]],
      fetchPageResult: legacyPage,
    });

    await manager.showPageBuilderSection();

    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.updatePage).not.toHaveBeenCalled();

    document
      .getElementById('pbSaveDraft')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.updatePage).toHaveBeenCalledWith(
      legacyPage.id,
      expect.objectContaining({
        isPublished: false,
        meta: expect.objectContaining({
          header: expect.objectContaining({
            version: 3,
            copy: expect.objectContaining({
              title: 'Battle Bros',
              subtitle: 'Hero Time',
              subtitles: ['Hero Time', 'Lunch Break Justice'],
            }),
          }),
        }),
      })
    );
  });

  it('opens page-level header settings when the canvas header is clicked', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(
      Array.from(document.querySelectorAll('.pb-editor-tab')).some(
        (tab) => tab.textContent?.trim() === 'Header'
      )
    ).toBe(false);

    document
      .querySelector('[data-action="select-page-header"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Header Settings');
    expect(document.getElementById('pbSaveHeader')).not.toBeNull();
    expect(document.querySelector('.pb-header-region--board[data-region="left"]')).not.toBeNull();
    expect(document.querySelector('[data-copy-key="title"]')).not.toBeNull();
    expect(document.querySelector('.pb-header-block-input[data-block-id="brand"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('Hide on this page');

    const headerTitleInput = document.querySelector('.pb-header-copy-input[data-copy-key="title"]');
    if (headerTitleInput) {
      headerTitleInput.value = 'Battle Bros Home';
      headerTitleInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document
      .getElementById('pbSaveHeader')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.updatePage).toHaveBeenCalledWith(
      selectedPage.id,
      expect.objectContaining({
        meta: expect.objectContaining({
          header: expect.objectContaining({
            version: 3,
            copy: expect.objectContaining({
              title: 'Battle Bros Home',
            }),
          }),
        }),
      })
    );
    expect(document.querySelector('.pb-header-copy-input[data-copy-key="title"]')?.value).toBe(
      'Battle Bros Home'
    );
    expect(document.querySelector('.pb-page-header-part-primary')?.textContent).toContain(
      'Battle Bros Home'
    );
    expect(mocks.updateModule).not.toHaveBeenCalled();
    expect(mocks.addModule).not.toHaveBeenCalled();
  });

  it('opens the canonical designer surface with a requested page slug and syncs the route state', async () => {
    const readerPage = getContractFixture('builderPage');
    const aboutPage = buildContractFixture('builderPageDraft', {
      id: 'about-page-id',
      slug: 'about',
      title: 'About',
      isHomepage: false,
      isPublished: true,
    });
    const onDesignerRouteChange = vi.fn();
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[readerPage, aboutPage]],
      fetchPageResult: aboutPage,
      onDesignerRouteChange,
    });

    await manager.showPageBuilderSection({
      entrypoint: 'designer',
      pageSlug: 'about',
      surface: 'header',
      historyMode: 'push',
    });
    await flushAdminUi(3);

    expect(mocks.fetchPage).toHaveBeenCalledWith('about-page-id');
    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Header Settings');
    expect(document.querySelector('.pb-page-header-surface.selected')).not.toBeNull();
    expect(onDesignerRouteChange).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSlug: 'about',
        surface: 'header',
      }),
      'push'
    );
  });

  it('falls back to the reader page in designer mode when the requested slug is missing', async () => {
    const readerPage = getContractFixture('builderPage');
    const onDesignerRouteChange = vi.fn();
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[readerPage]],
      fetchPageResult: readerPage,
      onDesignerRouteChange,
    });

    await manager.showPageBuilderSection({
      entrypoint: 'designer',
      pageSlug: 'missing-page',
      surface: 'header',
      historyMode: 'replace',
    });
    await flushAdminUi(3);

    expect(mocks.fetchPage).toHaveBeenCalledWith(readerPage.id);
    expect(document.getElementById('pbPageTitle')?.textContent).toContain('reader');
    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Header Settings');
    expect(onDesignerRouteChange).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSlug: 'reader',
        surface: 'header',
      }),
      'replace'
    );
  });

  it('keeps the designer route in sync when selecting another page from the builder rail', async () => {
    const readerPage = getContractFixture('builderPage');
    const aboutPage = buildContractFixture('builderPageDraft', {
      id: 'about-page-id',
      slug: 'about',
      title: 'About',
      isHomepage: false,
      isPublished: true,
    });
    const onDesignerRouteChange = vi.fn();
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[readerPage, aboutPage]],
      fetchPageResult: aboutPage,
      onDesignerRouteChange,
    });

    await manager.showPageBuilderSection({
      entrypoint: 'designer',
      pageSlug: 'reader',
      surface: 'header',
      historyMode: 'replace',
    });
    await flushAdminUi(3);

    document
      .querySelector('.pb-page-item[data-page-id="about-page-id"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Header Settings');
    expect(onDesignerRouteChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pageSlug: 'about',
        surface: 'header',
      }),
      'replace'
    );
  });

  it('toggles between edit and preview canvas modes via the view toggle buttons', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    const canvas = document.getElementById('pbCanvas');
    const editBtn = document.getElementById('pbViewEdit');
    const previewBtn = document.getElementById('pbViewPreview');
    const widthToggles = document.getElementById('pbWidthToggles');
    const layout = document.querySelector('.page-builder-layout');

    // Starts in edit mode — structural canvas visible, width toggles hidden, no canvas-mode attr
    expect(canvas?.dataset.mode).toBe('edit');
    expect(widthToggles?.hidden).toBe(true);
    expect(layout?.dataset.canvasMode).toBeUndefined();
    expect(canvas?.querySelector('div[data-section-id]')).not.toBeNull();

    // Switch to preview mode
    previewBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(canvas?.dataset.mode).toBe('preview');
    expect(widthToggles?.hidden).toBe(false);
    // Layout gets data-canvas-mode so CSS can collapse sidebar + editor
    expect(layout?.dataset.canvasMode).toBe('preview');
    // Preview frame wraps shared-renderer output
    expect(canvas?.querySelector('.pb-preview-frame')).not.toBeNull();
    expect(canvas?.querySelector('.pb-page')).not.toBeNull();
    // Structural edit UI is gone
    expect(canvas?.querySelector('div[data-section-id]')).toBeNull();

    // Preview button should be active, edit button inactive
    expect(previewBtn?.classList.contains('pb-view-toggle--active')).toBe(true);
    expect(editBtn?.classList.contains('pb-view-toggle--active')).toBe(false);

    // Switch back to edit mode
    editBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(canvas?.dataset.mode).toBe('edit');
    expect(widthToggles?.hidden).toBe(true);
    // Layout attribute is cleared
    expect(layout?.dataset.canvasMode).toBeUndefined();
    expect(canvas?.querySelector('div[data-section-id]')).not.toBeNull();
    expect(editBtn?.classList.contains('pb-view-toggle--active')).toBe(true);
  });

  it('cycles through desktop/tablet/mobile preview widths without re-rendering', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    // Enter preview mode
    document
      .getElementById('pbViewPreview')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const canvas = document.getElementById('pbCanvas');
    const widthToggles = document.getElementById('pbWidthToggles');

    expect(canvas?.querySelector('.pb-preview-frame')?.dataset.width).toBe('desktop');

    // Switch to tablet
    widthToggles
      ?.querySelector('[data-width="tablet"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(canvas?.querySelector('.pb-preview-frame')?.dataset.width).toBe('tablet');
    expect(
      widthToggles
        ?.querySelector('[data-width="tablet"]')
        ?.classList.contains('pb-width-toggle--active')
    ).toBe(true);
    expect(
      widthToggles
        ?.querySelector('[data-width="desktop"]')
        ?.classList.contains('pb-width-toggle--active')
    ).toBe(false);

    // Switch to mobile
    widthToggles
      ?.querySelector('[data-width="mobile"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(canvas?.querySelector('.pb-preview-frame')?.dataset.width).toBe('mobile');

    // Back to desktop
    widthToggles
      ?.querySelector('[data-width="desktop"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(canvas?.querySelector('.pb-preview-frame')?.dataset.width).toBe('desktop');
  });

  it('shows an import banner in the header editor for a legacy page without meta.header', async () => {
    const legacyPage = getContractFixture('builderPage');
    delete legacyPage.meta.header;
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[legacyPage]],
      fetchPageResult: legacyPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector('[data-action="select-page-header"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    expect(document.querySelector('.pb-editor-source-notice')).not.toBeNull();
    expect(document.querySelector('.pb-editor-source-notice')?.textContent).toContain(
      'Imported from shared site configuration'
    );
  });

  it('shows no import banner for a page that already has a V3 meta.header', async () => {
    const selectedPage = getContractFixture('builderPage');
    // builderPage fixture has meta.header.version = 3
    expect(selectedPage.meta.header.version).toBe(3);
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector('[data-action="select-page-header"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    expect(document.querySelector('.pb-editor-source-notice')).toBeNull();
  });

  it('clears the import banner after saving a legacy page header', async () => {
    const legacyPage = getContractFixture('builderPage');
    delete legacyPage.meta.header;
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[legacyPage]],
      fetchPageResult: legacyPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector('[data-action="select-page-header"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    expect(document.querySelector('.pb-editor-source-notice')).not.toBeNull();

    // Make a small edit so the header draft is marked dirty (Save button becomes enabled)
    const titleInput = document.querySelector('.pb-header-copy-input[data-copy-key="title"]');
    if (titleInput) {
      titleInput.value = 'Updated Title';
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await flushAdminUi(1);

    // Save — updatePage returns the page with a V3 header written by buildNormalizedPageMeta
    document
      .getElementById('pbSaveHeader')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(5);

    expect(mocks.updatePage).toHaveBeenCalledWith(
      legacyPage.id,
      expect.objectContaining({
        meta: expect.objectContaining({
          header: expect.objectContaining({ version: 3 }),
        }),
      })
    );
    // After save, the draft is re-initialized from the updated page which now has meta.header v3
    expect(document.querySelector('.pb-editor-source-notice')).toBeNull();
  });

  it('shows the Imported chip on the canvas header surface for a legacy page', async () => {
    const legacyPage = getContractFixture('builderPage');
    delete legacyPage.meta.header;
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[legacyPage]],
      fetchPageResult: legacyPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    const surface = document.querySelector('.pb-page-header-surface');
    expect(surface?.querySelector('.pb-page-header-badge--import')).not.toBeNull();
    expect(surface?.querySelector('.pb-page-header-badge--import')?.textContent).toContain(
      'Imported'
    );
    // V3 page should not have the import chip
    expect(surface?.querySelector('.pb-page-header-badge--stale')).toBeNull();
  });
});

// ── Step 3 regressions ───────────────────────────────────────────────────────
describe('Phase 6 Step 3 — header editor UX upgrades', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('does not render a raw JSON textarea in the header editor', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector('[data-action="select-page-header"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    expect(document.getElementById('pbSaveHeader')).not.toBeNull();
    expect(document.getElementById('pbHeaderRawConfig')).toBeNull();
  });

  it('renders placement board cards with draggable="true"', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector('[data-action="select-page-header"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    const cards = document.querySelectorAll('.pb-header-layout-card[draggable="true"]');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('canvas preview shows block-specific chip content for patron, status, and entryControls', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    const surface = document.querySelector('.pb-page-header-surface');
    const chipText = Array.from(surface?.querySelectorAll('.pb-page-header-chip') || [])
      .map((el) => el.textContent?.trim())
      .join(' ');
    expect(chipText).toContain('Welcome, reader');
    expect(chipText).toContain('Status message');
    expect(chipText).toContain('Ch. 42');
  });

  it('canvas preview shows empty-region indicator when a header region has no blocks', async () => {
    const selectedPage = getContractFixture('builderPage');
    selectedPage.meta.header.regions = {
      left: ['brand', 'patron', 'status', 'entryControls', 'nav'],
      center: [],
      right: [],
    };
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    const emptyRegions = document.querySelectorAll('.pb-page-header-empty-region');
    expect(emptyRegions.length).toBeGreaterThanOrEqual(1);
    expect(emptyRegions[0]?.textContent?.trim()).toBe('Empty region');
  });

  it('placement board section description reflects drag-first workflow copy', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector('[data-action="select-page-header"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    const sectionCopies = Array.from(document.querySelectorAll('.pb-editor-section-copy')).map(
      (el) => el.textContent?.trim()
    );
    expect(sectionCopies.some((t) => t?.includes('Drag blocks between regions'))).toBe(true);
  });
});

// ── Step 4 regressions ───────────────────────────────────────────────────────
describe('Phase 6 Step 4 — header buttons on the shared button model', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('renders a Style select with primary/secondary options in the header nav editor', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector('[data-action="select-page-header"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    // At least one nav item should be present; each must expose a style select
    const styleSelects = document.querySelectorAll('.pb-header-nav-input[data-item-key="style"]');
    expect(styleSelects.length).toBeGreaterThan(0);

    // The select must offer both primary and secondary options
    const firstSelect = styleSelects[0];
    const optionValues = Array.from(firstSelect.querySelectorAll('option')).map((o) => o.value);
    expect(optionValues).toContain('primary');
    expect(optionValues).toContain('secondary');
  });

  it('persists the secondary style in the draft state when the select changes', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector('[data-action="select-page-header"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    const firstStyleSelect = document.querySelector('.pb-header-nav-input[data-item-key="style"]');
    expect(firstStyleSelect).not.toBeNull();

    firstStyleSelect.value = 'secondary';
    firstStyleSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(1);

    // Canvas should re-render; verify the chip carries the secondary class
    const secondaryChip = document.querySelector('.pb-page-header-chip--secondary');
    expect(secondaryChip).not.toBeNull();
  });

  it('defaults new header nav items to style="primary"', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector('[data-action="select-page-header"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    const beforeCount = document.querySelectorAll('.pb-header-nav-item').length;

    document
      .getElementById('pbHeaderAddNavItem')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    const afterCount = document.querySelectorAll('.pb-header-nav-item').length;
    expect(afterCount).toBe(beforeCount + 1);

    // The newly added item's style select must default to "primary"
    const allStyleSelects = document.querySelectorAll(
      '.pb-header-nav-input[data-item-key="style"]'
    );
    const lastSelect = allStyleSelects[allStyleSelects.length - 1];
    expect(lastSelect?.value).toBe('primary');
  });

  it('canvas nav chips carry pb-page-header-chip--primary for existing nav items', async () => {
    const selectedPage = getContractFixture('builderPage');
    // Ensure nav block is enabled and in a region
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    // Nav items from the fixture have no stored style — they should default to primary
    const surface = document.querySelector('.pb-page-header-surface');
    const chips = surface?.querySelectorAll('.pb-page-header-chip');
    const navChips = Array.from(chips || []).filter(
      (c) =>
        c.classList.contains('pb-page-header-chip--primary') ||
        c.classList.contains('pb-page-header-chip--secondary')
    );
    // At least all visible nav chips must carry a variant class
    expect(navChips.length).toBeGreaterThan(0);
    navChips.forEach((chip) => {
      expect(
        chip.classList.contains('pb-page-header-chip--primary') ||
          chip.classList.contains('pb-page-header-chip--secondary')
      ).toBe(true);
    });
  });

  it('persists the secondary style through a round-trip save', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector('[data-action="select-page-header"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    // Switch first nav item to secondary
    const firstStyleSelect = document.querySelector('.pb-header-nav-input[data-item-key="style"]');
    firstStyleSelect.value = 'secondary';
    firstStyleSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(1);

    // Save the header draft
    document
      .getElementById('pbSaveHeader')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(5);

    expect(mocks.updatePage).toHaveBeenCalledWith(
      selectedPage.id,
      expect.objectContaining({
        meta: expect.objectContaining({
          header: expect.objectContaining({
            nav: expect.objectContaining({
              items: expect.arrayContaining([expect.objectContaining({ style: 'secondary' })]),
            }),
          }),
        }),
      })
    );
  });
});

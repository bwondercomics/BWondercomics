import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BUILDER_PREVIEW_MESSAGE_TYPES,
  BUILDER_PREVIEW_SNAPSHOT_VERSION,
  PREVIEW_VIEWPORTS,
  buildPreviewInlineEditMessage,
  buildPreviewMetricsMessage,
  buildPreviewTargetMessage,
} from '../admin/page-builder/preview-contract.js';
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
  if (typeof init.clientX === 'number') {
    Object.defineProperty(event, 'clientX', {
      value: init.clientX,
      configurable: true,
    });
  }
  return event;
}

function createKeyboardLikeEvent(key, init = {}) {
  return new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
}

function createDataTransfer() {
  const data = new Map();
  return {
    effectAllowed: '',
    dropEffect: '',
    setData: vi.fn((key, value) => data.set(key, value)),
    getData: vi.fn((key) => data.get(key) || ''),
  };
}

function readCss(path) {
  return readFileSync(path, 'utf8');
}

function getCssRule(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'm'));
  return match?.[1] || '';
}

async function setupPageBuilder({
  fetchPagesResults = [],
  fetchGlobalPagesResults = [[]],
  fetchPageBindingsResult = { bindings: {}, warnings: [] },
  fetchPageResult = null,
  createPageResult = null,
  deletePageResult = true,
  reorderPagesResult = true,
  addModuleResult = null,
  updateSectionResult = null,
  deleteSectionResult = false,
  deleteModuleResult = false,
  reorderModulesResult = true,
  reorderSectionsResult = true,
  updatePageResult = null,
  updateModuleResult = undefined,
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
  fetchPages.mockResolvedValue(fetchPagesResults.at(-1) || []);
  fetchPagesResults.forEach((result) => fetchPages.mockResolvedValueOnce(result));
  const fetchSeriesPages = vi.fn();
  fetchSeriesPages.mockResolvedValue(fetchPagesResults.at(-1) || []);
  fetchPagesResults.forEach((result) => fetchSeriesPages.mockResolvedValueOnce(result));
  const fetchGlobalPages = vi.fn();
  fetchGlobalPages.mockResolvedValue(fetchGlobalPagesResults.at(-1) || []);
  fetchGlobalPagesResults.forEach((result) => fetchGlobalPages.mockResolvedValueOnce(result));
  const fetchPage = vi.fn(async () => fetchPageResult);
  const createPage = vi.fn(async () => createPageResult);
  const createScopedPage = vi.fn(async () => createPageResult);
  const deletePage = vi.fn(async () => deletePageResult);
  const reorderPages = vi.fn(async () => reorderPagesResult);
  const reorderScopedPages = vi.fn(async () => reorderPagesResult);
  const fetchPageBindings = vi.fn(async () => fetchPageBindingsResult);
  const updatePageBindings = vi.fn(async () => fetchPageBindingsResult);
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
  const reorderSections = vi.fn(async (...args) =>
    typeof reorderSectionsResult === 'function'
      ? reorderSectionsResult(...args)
      : reorderSectionsResult
  );
  const addModule = vi.fn(async (_sectionId, moduleType, columnIndex, config, _sortIndex) => ({
    id: 'new-module-id',
    moduleType,
    columnIndex,
    sortIndex: 99,
    config,
    ...(addModuleResult || {}),
  }));
  const updateModule = vi.fn(async (moduleId, data) => {
    if (typeof updateModuleResult === 'function') return updateModuleResult(moduleId, data);
    if (updateModuleResult !== undefined) return updateModuleResult;
    return {
      id: moduleId,
      config: data?.config || {},
    };
  });
  const moveModule = vi.fn(async (_moduleId, _sectionId, columnIndex, sortIndex) => ({
    id: 'moved-module-id',
    columnIndex,
    sortIndex,
    config: {},
  }));
  const reorderModules = vi.fn(async (...args) =>
    typeof reorderModulesResult === 'function'
      ? reorderModulesResult(...args)
      : reorderModulesResult
  );
  const updateSection = vi.fn(async () => updateSectionResult);
  const deleteSection = vi.fn(async () => deleteSectionResult);
  const deleteModule = vi.fn(async () => deleteModuleResult);

  vi.doMock('../admin/page-builder/data.js', () => ({
    fetchPages,
    fetchSeriesPages,
    fetchGlobalPages,
    fetchPage,
    createPage,
    createScopedPage,
    deletePage,
    reorderPages,
    reorderScopedPages,
    updatePage,
    fetchPageBindings,
    updatePageBindings,
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
      createScopedPage,
      deletePage,
      fetchPage,
      fetchPages,
      fetchSeriesPages,
      fetchGlobalPages,
      fetchPageBindings,
      moveModule,
      reorderPages,
      reorderScopedPages,
      reorderModules,
      reorderSections,
      updateSection,
      updateModule,
      updatePage,
      updatePageBindings,
      deleteSection,
      deleteModule,
      hideAllSections,
      setActiveNav,
      onDesignerRouteChange,
    },
  };
}

async function openBuilderPage(manager) {
  await manager.showPageBuilderSection();
  document
    .querySelector('.pb-page-item')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushAdminUi(3);
}

function enterPreviewMode() {
  document
    .getElementById('pbViewPreview')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function enterChromePreview() {
  document
    .getElementById('pbEnterPreview')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function restoreChromePreview() {
  document
    .getElementById('pbRestorePreviewChrome')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function enterEditMode() {
  document.getElementById('pbViewEdit')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function getPreviewFrame() {
  return document.getElementById('pbCanvas')?.querySelector('.pb-preview-frame');
}

function getPreviewIframe() {
  return document.getElementById('pbCanvas')?.querySelector('.pb-preview-iframe');
}

function getPreviewStatus() {
  return document.getElementById('pbCanvas')?.querySelector('.pb-preview-status');
}

function attachPreviewIframeWindow() {
  const iframe = getPreviewIframe();
  expect(iframe).not.toBeNull();
  const iframeWindow = { postMessage: vi.fn() };
  Object.defineProperty(iframe, 'contentWindow', {
    configurable: true,
    value: iframeWindow,
  });
  return iframeWindow;
}

function dispatchPreviewMessageFromIframe(message, iframeWindow) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: message,
      origin: window.location.origin,
      source: iframeWindow,
    })
  );
}

function sendPreviewTargets({ frame, iframeWindow, page, targets, sequence = 3 }) {
  dispatchPreviewMessageFromIframe(
    buildPreviewTargetMessage(
      BUILDER_PREVIEW_MESSAGE_TYPES.TARGETS,
      { sequence, targets },
      {
        previewSession: frame.dataset.previewSession,
        seriesId: 'battle-bros',
        pageId: page.id,
        pageSlug: page.slug,
      }
    ),
    iframeWindow
  );
}

function sendPreviewTargetSelect({ frame, iframeWindow, page, target, sequence = 3 }) {
  dispatchPreviewMessageFromIframe(
    buildPreviewTargetMessage(
      BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_SELECT,
      { sequence, target },
      {
        previewSession: frame.dataset.previewSession,
        seriesId: 'battle-bros',
        pageId: page.id,
        pageSlug: page.slug,
      }
    ),
    iframeWindow
  );
}

function requestCurrentPreviewSnapshot() {
  const iframe = getPreviewIframe();
  const frame = getPreviewFrame();
  expect(iframe).not.toBeNull();
  expect(frame).not.toBeNull();

  const iframeWindow = { postMessage: vi.fn() };
  Object.defineProperty(iframe, 'contentWindow', {
    configurable: true,
    value: iframeWindow,
  });

  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        type: BUILDER_PREVIEW_MESSAGE_TYPES.REQUEST_SNAPSHOT,
        previewSession: frame.dataset.previewSession,
        snapshotVersion: BUILDER_PREVIEW_SNAPSHOT_VERSION,
        seriesId: 'battle-bros',
        pageId: frame.dataset.pageId,
        pageSlug: frame.dataset.pageSlug,
      },
      origin: window.location.origin,
      source: iframeWindow,
    })
  );

  const calls = iframeWindow.postMessage.mock.calls;
  return calls[calls.length - 1]?.[0]?.snapshot || null;
}

describe('admin page-builder shell', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('mounts the side-panel toggles in the full-page builder shell', async () => {
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[]],
      viewportWidth: 1600,
    });

    await manager.showPageBuilderSection();

    const layout = document.querySelector('.page-builder-layout');
    const toolbarToggle = document.getElementById('pbToggleSidebar');
    const railToggle = document.getElementById('pbToggleEditor');

    expect(document.getElementById('adminDashboard')?.classList).toContain(
      'admin-page-builder-open'
    );
    expect(document.getElementById('pbBuilderToolbar')).not.toBeNull();
    expect(document.getElementById('pbBuilderSidePanel')).not.toBeNull();
    expect(document.getElementById('pbCanvasViewport')).not.toBeNull();
    expect(document.getElementById('pbCanvasOverlay')).not.toBeNull();
    expect(
      Array.from(document.querySelectorAll('.pb-sidebar-tab')).map((tab) => tab.textContent?.trim())
    ).toEqual(['Pages', 'Blocks', 'Layers', 'Settings', 'Styles']);
    expect(document.getElementById('pbAddPage')?.closest('#pbBuilderToolbar')).not.toBeNull();
    expect(document.getElementById('pbSaveDraft')?.closest('#pbBuilderToolbar')).not.toBeNull();
    expect(document.getElementById('pbPublish')?.closest('#pbBuilderToolbar')).not.toBeNull();
    expect(document.getElementById('pbWidthToggles')?.closest('#pbBuilderToolbar')).not.toBeNull();
    expect(railToggle?.closest('.page-builder-sidebar')).not.toBeNull();
    expect(toolbarToggle?.closest('.pb-builder-toolbar')).not.toBeNull();
    expect(document.querySelector('.pb-canvas-header #pbToggleEditor')).toBeNull();
    expect(layout?.dataset.editorMode).toBe('side-panel');
    expect(layout?.dataset.sidebarMode).toBe('expanded');
    expect(layout?.style.getPropertyValue('--pb-sidebar-width')).toBe('280px');

    toolbarToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(layout?.dataset.sidebarMode).toBe('collapsed');
    expect(layout?.style.getPropertyValue('--pb-sidebar-width')).toBe('72px');
    expect(window.localStorage.getItem('pb-sidebar-mode')).toBe('collapsed');

    railToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(layout?.dataset.sidebarMode).toBe('expanded');
    expect(window.localStorage.getItem('pb-sidebar-mode')).toBe('expanded');
  });

  it('does not fetch series page-config during normal V3 page-builder startup', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });
    const fetchMock = vi.fn(async (url) => {
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      await manager.showPageBuilderSection();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(document.querySelector('.pb-page-item')).not.toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('renders descriptor-backed blocks grouped by category', async () => {
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[]],
      viewportWidth: 1600,
    });

    await manager.showPageBuilderSection();

    document
      .querySelector('.pb-sidebar-tab[data-tab="blocks"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    const blockContent = document.querySelector('[data-content="blocks"]');
    expect(blockContent?.hidden).toBe(false);
    expect(
      Array.from(document.querySelectorAll('.pb-block-group-title')).map((node) =>
        node.textContent?.trim()
      )
    ).toEqual(['Content', 'Media', 'Engagement', 'Navigation', 'Layout', 'Special', 'Advanced']);
    expect(document.querySelector('.pb-module-type[data-module-type="header"]')).toBeNull();
    expect(document.querySelector('.pb-module-type[data-module-type="feed"]')).not.toBeNull();
    expect(document.querySelector('.pb-module-type[data-module-type="html"]')).not.toBeNull();
  });

  it('renders page layers with columns and keeps layer selection in sync', async () => {
    const selectedPage = getContractFixture('builderPage');
    const feedModule = selectedPage.sections[1].modules.find(
      (module) => module.moduleType === 'feed'
    );
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);

    document
      .querySelector('.pb-sidebar-tab[data-tab="layers"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    expect(document.querySelectorAll('.pb-layer-item--section')).toHaveLength(2);
    expect(
      document.querySelector(
        `.pb-layer-column[data-section-id="${selectedPage.sections[1].id}"][data-column-index="1"]`
      )
    ).not.toBeNull();

    document
      .querySelector(`.pb-layer-item--module[data-module-id="${feedModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Feed Module');
    expect(
      document.querySelector(`.pb-layer-item--module.active[data-module-id="${feedModule.id}"]`)
    ).not.toBeNull();

    document
      .querySelector('.pb-sidebar-tab[data-tab="layers"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);
    expect(
      document.querySelector(`.pb-layer-item--module.active[data-module-id="${feedModule.id}"]`)
    ).not.toBeNull();
  });

  it('shows constrained module style sectors without content controls or raw CSS', async () => {
    const selectedPage = getContractFixture('builderPage');
    const feedModule = selectedPage.sections[1].modules.find(
      (module) => module.moduleType === 'feed'
    );
    const textModule = selectedPage.sections[1].modules.find(
      (module) => module.moduleType === 'text'
    );
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);

    document
      .querySelector(`.pb-module[data-module-id="${textModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);
    document
      .querySelector('.pb-sidebar-tab[data-tab="styles"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    expect(document.querySelector('.pb-editor-empty')?.textContent).toContain('No style controls');
    expect(document.querySelector('[data-key="_raw"]')).toBeNull();

    document
      .querySelector(`.pb-module[data-module-id="${feedModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);
    document
      .querySelector('.pb-sidebar-tab[data-tab="styles"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Feed Styles');
    expect(document.querySelector('[data-style-key="headingBgColor"]')).not.toBeNull();
    expect(document.querySelector('[data-key="heading"]')).toBeNull();
    expect(document.querySelector('[data-key="_raw"]')).toBeNull();

    const headingColorInput = document.querySelector('[data-style-key="headingBgColor"]');
    headingColorInput.value = '#123456';
    headingColorInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAdminUi(1);

    document
      .getElementById('pbSaveModule')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    const savedConfig = mocks.updateModule.mock.calls.at(-1)?.[1]?.config;
    expect(savedConfig.heading).toBe(feedModule.config.heading);
    expect(savedConfig.style.headingBgColor).toBe('#123456');
  });

  it('keeps normal admin header and nav hidden while the full-page builder is active', async () => {
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[]],
      viewportWidth: 1600,
    });

    await manager.showPageBuilderSection();

    const dashboard = document.getElementById('adminDashboard');
    const adminHeaderRule = getCssRule(
      readCss('admin/css/page-builder/layout.css'),
      '.admin-shell.admin-page-builder-open .admin-header,\n.admin-shell.admin-page-builder-open .admin-nav'
    );

    expect(dashboard?.classList).toContain('admin-page-builder-open');
    expect(adminHeaderRule).toContain('display: none');
  });

  it('lets the unified side panel collapse from the toolbar and rail controls', async () => {
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[]],
      viewportWidth: 1600,
    });

    await manager.showPageBuilderSection();

    const layout = document.querySelector('.page-builder-layout');
    const sidebarToggle = document.getElementById('pbToggleSidebar');
    const railToggle = document.getElementById('pbToggleEditor');
    const railLabel = document.getElementById('pbSidebarRailLabel');

    expect(layout?.dataset.sidebarMode).toBe('expanded');
    expect(layout?.style.getPropertyValue('--pb-sidebar-width')).toBe('280px');
    expect(railLabel?.textContent).toBe('Pages');

    sidebarToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(layout?.dataset.sidebarMode).toBe('collapsed');
    expect(layout?.style.getPropertyValue('--pb-sidebar-width')).toBe('72px');
    expect(window.localStorage.getItem('pb-sidebar-mode')).toBe('collapsed');
    expect(sidebarToggle?.getAttribute('aria-label')).toBe('Expand side panel');
    expect(railToggle?.getAttribute('aria-label')).toBe('Expand side panel');

    railToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(layout?.dataset.sidebarMode).toBe('expanded');
    expect(layout?.style.getPropertyValue('--pb-sidebar-width')).toBe('280px');
    expect(window.localStorage.getItem('pb-sidebar-mode')).toBe('expanded');
  });

  it('keeps the side panel as a drawer on narrower desktop widths', async () => {
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[]],
      viewportWidth: 1280,
    });

    await manager.showPageBuilderSection();

    const layout = document.querySelector('.page-builder-layout');
    expect(layout?.dataset.editorMode).toBe('side-panel');
    expect(layout?.dataset.viewportBand).toBe('medium');

    setViewportWidth(1600);
    window.dispatchEvent(new Event('resize'));

    expect(layout?.dataset.editorMode).toBe('side-panel');
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

  it('keeps the inspector scroll position when same-panel option changes rerender controls', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
      viewportWidth: 1600,
    });

    await openBuilderPage(manager);
    document
      .querySelector('[data-action="select-page-header"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    const content = document.querySelector('.pb-editor-content');
    expect(content).not.toBeNull();
    content.scrollTop = 420;

    const destinationTypeSelect = document.querySelector(
      '.pb-header-nav-input[data-item-key="kind"]'
    );
    expect(destinationTypeSelect).not.toBeNull();
    destinationTypeSelect.value = 'url';
    destinationTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(1);

    const nextContent = document.querySelector('.pb-editor-content');
    expect(nextContent).not.toBe(content);
    expect(nextContent?.scrollTop).toBe(420);
    expect(document.querySelector('.pb-header-nav-input[data-item-key="url"]')).not.toBeNull();
  });

  it('keeps the unified side panel on one inspector scroll without clipping open categories', () => {
    const inspectorCss = readCss('admin/css/page-builder/inspector.css');
    const layoutCss = readCss('admin/css/page-builder/layout.css');
    const canvasCss = readCss('admin/css/page-builder/canvas.css');
    const editorContentRule = getCssRule(inspectorCss, '.pb-editor-content');
    const sectionRule = getCssRule(inspectorCss, '.pb-inspector-section');
    const sectionBodyRule = getCssRule(inspectorCss, '.pb-inspector-section-body');
    const targetOverlayRule = getCssRule(canvasCss, '.pb-preview-target-overlay');
    const targetToolbarRule = getCssRule(canvasCss, '.pb-preview-target-toolbar');

    expect(editorContentRule).toContain('overflow-y: auto');
    expect(editorContentRule).toContain('overscroll-behavior: contain');
    expect(editorContentRule).toContain('scroll-padding-bottom: 96px');
    expect(sectionRule).toContain('overflow: visible');
    expect(sectionBodyRule).toContain('overflow: visible');
    expect(layoutCss).toContain('.admin-shell.admin-page-builder-open .admin-header');
    expect(layoutCss).toContain("grid-template-areas: 'content'");
    expect(layoutCss).toContain('.page-builder-layout[data-sidebar-mode');
    expect(layoutCss).toContain('.pb-canvas-overlay');
    expect(layoutCss).toContain(".page-builder[data-chrome-mode='preview']");
    expect(layoutCss).toContain(".page-builder[data-chrome-mode='preview'] .pb-builder-toolbar");
    expect(layoutCss).toContain(".page-builder[data-chrome-mode='preview'] .page-builder-sidebar");
    expect(layoutCss).toContain('.pb-preview-restore');
    expect(targetOverlayRule).toContain('pointer-events: none');
    expect(targetToolbarRule).toContain('pointer-events: auto');
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
    expect(document.getElementById('pbPageList')?.textContent).toContain('No series pages yet');

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

    expect(mocks.createScopedPage).toHaveBeenCalledWith(
      'series',
      'battle-bros',
      'reader',
      'Reader Builder'
    );
    expect(document.querySelector('.pb-page-item.active .pb-page-item-title')?.textContent).toBe(
      'Reader Builder'
    );
    expect(document.getElementById('pbPageTitle')?.textContent).toContain('Reader Builder');
  });

  it('creates reader template pages and auto-binds only when the series binding is missing', async () => {
    const page = buildContractFixture('builderPage', {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee91',
      slug: 'reader-template',
      title: 'Reader Template',
      pageType: 'custom',
      sections: [],
    });
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[], [page]],
      createPageResult: page,
      fetchPageBindingsResult: { bindings: {}, warnings: [] },
    });

    await manager.showPageBuilderSection();
    document.getElementById('pbAddPage')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    document.getElementById('pbPageSlugInput').value = 'reader-template';
    document.getElementById('pbPageTitleInput').value = 'Reader Template';
    document.getElementById('pbPageTemplateSelect').value = 'reader';
    document
      .getElementById('pbAddPageForm')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushAdminUi(4);

    expect(mocks.createScopedPage).toHaveBeenCalledWith(
      'series',
      'battle-bros',
      'reader-template',
      'Reader Template'
    );
    expect(mocks.updatePage).toHaveBeenCalledWith(page.id, { pageType: 'reader' });
    expect(mocks.addSection).toHaveBeenCalledWith(page.id, 'row', '1');
    expect(mocks.addModule).toHaveBeenCalledWith(
      'new-section-id',
      'reader',
      0,
      expect.objectContaining({
        source: { mode: 'active-page-series' },
      })
    );
    expect(mocks.updatePageBindings).toHaveBeenCalledWith('battle-bros', { reader: page.id });
  });

  it('does not overwrite an existing reader binding when using the reader template', async () => {
    const page = buildContractFixture('builderPage', {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee93',
      slug: 'new-reader-template',
      title: 'New Reader Template',
      pageType: 'custom',
      sections: [],
    });
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[], [page]],
      createPageResult: page,
      fetchPageBindingsResult: {
        bindings: {
          reader: { pageId: 'existing-reader-page', slug: 'reader' },
        },
        warnings: [],
      },
    });

    await manager.showPageBuilderSection();
    document.getElementById('pbAddPage')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    document.getElementById('pbPageSlugInput').value = 'new-reader-template';
    document.getElementById('pbPageTitleInput').value = 'New Reader Template';
    document.getElementById('pbPageTemplateSelect').value = 'reader';
    document
      .getElementById('pbAddPageForm')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushAdminUi(4);

    expect(mocks.addModule).toHaveBeenCalledWith(
      'new-section-id',
      'reader',
      0,
      expect.objectContaining({
        source: { mode: 'active-page-series' },
      })
    );
    expect(mocks.updatePageBindings).not.toHaveBeenCalled();
  });

  it('creates global CMS template pages without reader bindings', async () => {
    const page = buildContractFixture('builderPageDraft', {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee92',
      scope: 'global',
      seriesId: null,
      slug: 'media',
      title: 'Media',
      pageType: 'custom',
      sections: [],
    });
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[]],
      fetchGlobalPagesResults: [[], [page]],
      createPageResult: page,
      fetchPageBindingsResult: {
        bindings: {
          reader: { pageId: 'existing-reader-page', slug: 'reader' },
        },
        warnings: [],
      },
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-scope-toggle[data-page-scope="global"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document.getElementById('pbAddPage')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    const templateSelect = document.getElementById('pbPageTemplateSelect');
    expect(templateSelect.querySelector('option[value="reader"]')?.disabled).toBe(true);
    templateSelect.value = 'media-gallery';
    document.getElementById('pbPageSlugInput').value = 'media';
    document.getElementById('pbPageTitleInput').value = 'Media';
    document
      .getElementById('pbAddPageForm')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushAdminUi(4);

    expect(mocks.createScopedPage).toHaveBeenCalledWith('global', 'battle-bros', 'media', 'Media');
    expect(mocks.updatePage).toHaveBeenCalledWith(page.id, { pageType: 'gallery' });
    expect(mocks.addModule).toHaveBeenCalledWith(
      'new-section-id',
      'media-gallery',
      0,
      expect.objectContaining({
        source: { mode: 'site', filters: {}, sort: 'path' },
        columns: 3,
        limit: 24,
      })
    );
    expect(mocks.updatePageBindings).not.toHaveBeenCalled();
  });

  it('creates entry gallery template pages with a renderable entry-gallery module', async () => {
    const page = buildContractFixture('builderPage', {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee94',
      slug: 'entries',
      title: 'Entries',
      pageType: 'custom',
      sections: [],
    });
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[], [page]],
      createPageResult: page,
      fetchPageBindingsResult: { bindings: {}, warnings: [] },
    });

    await manager.showPageBuilderSection();
    document.getElementById('pbAddPage')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    document.getElementById('pbPageSlugInput').value = 'entries';
    document.getElementById('pbPageTitleInput').value = 'Entries';
    document.getElementById('pbPageTemplateSelect').value = 'entry-gallery';
    document
      .getElementById('pbAddPageForm')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushAdminUi(4);

    expect(mocks.updatePage).toHaveBeenCalledWith(page.id, { pageType: 'gallery' });
    expect(mocks.addModule).toHaveBeenCalledWith(
      'new-section-id',
      'entry-gallery',
      0,
      expect.objectContaining({
        source: { mode: 'active-page-series', filters: {}, sort: 'sort-index' },
        columns: 3,
        showLabels: true,
      })
    );
    expect(mocks.updatePageBindings).not.toHaveBeenCalled();
  });

  it('switches page scopes and updates the series reader binding', async () => {
    const seriesPage = getContractFixture('builderPage');
    const globalPage = buildContractFixture('builderPageDraft', {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee98',
      scope: 'global',
      seriesId: null,
      slug: 'about',
      title: 'Global About',
      isPublished: true,
    });
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[seriesPage]],
      fetchGlobalPagesResults: [[globalPage]],
      fetchPageBindingsResult: {
        seriesId: 'battle-bros',
        bindings: {},
        warnings: [
          {
            role: 'reader',
            code: 'missing_reader_binding',
            message: 'This series is missing a reader page binding.',
          },
        ],
      },
    });

    await manager.showPageBuilderSection();

    expect(document.querySelector('.pb-page-scope-toggle.active')?.textContent).toContain(
      'Series Pages'
    );
    expect(document.getElementById('pbPageList')?.textContent).toContain('Reader');
    expect(document.getElementById('pbPageList')?.textContent).toContain(
      'missing a reader page binding'
    );

    document
      .querySelector('.pb-page-action.reader')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);
    expect(mocks.updatePageBindings).toHaveBeenCalledWith('battle-bros', {
      reader: seriesPage.id,
    });

    document
      .querySelector('.pb-page-scope-toggle[data-page-scope="global"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(document.querySelector('.pb-page-scope-toggle.active')?.textContent).toContain(
      'Global Pages'
    );
    expect(document.getElementById('pbPageList')?.textContent).toContain('Global About');
    expect(mocks.fetchGlobalPages).toHaveBeenCalled();

    document.getElementById('pbAddPage')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);
    document.getElementById('pbPageSlugInput').value = 'contact';
    document.getElementById('pbPageTitleInput').value = 'Contact';
    document
      .getElementById('pbAddPageForm')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushAdminUi(2);

    expect(mocks.createScopedPage).toHaveBeenCalledWith(
      'global',
      'battle-bros',
      'contact',
      'Contact'
    );
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
    expect(document.querySelectorAll('.pb-inspector-section')).toHaveLength(2);
    expect(document.querySelector('.pb-inspector-section[open]')).toBeNull();

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

    mocks.reorderScopedPages.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

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
    expect(mocks.reorderScopedPages).toHaveBeenNthCalledWith(1, 'series', 'battle-bros', [
      'page-2',
      'page-1',
    ]);

    items[1].getBoundingClientRect = () => ({ top: 40, height: 40 });
    items[0].dispatchEvent(createDragLikeEvent('dragstart', dataTransfer));
    items[1].dispatchEvent(createDragLikeEvent('dragover', dataTransfer, { clientY: 70 }));
    items[1].dispatchEvent(createDragLikeEvent('drop', dataTransfer));
    await flushAdminUi(3);

    items = document.getElementById('pbPageList').querySelectorAll('.pb-page-item');
    expect(items[0].querySelector('.pb-page-item-title').textContent).toBe('Page 2');
    expect(items[1].querySelector('.pb-page-item-title').textContent).toBe('Page 1');
    expect(mocks.reorderScopedPages).toHaveBeenNthCalledWith(2, 'series', 'battle-bros', [
      'page-1',
      'page-2',
    ]);
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
        panelEnabled: {
          left: true,
          right: true,
        },
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

  it('saves current-device header appearance without replacing global header styling', async () => {
    const selectedPage = getContractFixture('builderPage');
    selectedPage.meta.header.appearance = {
      top: {
        background: {
          color: '#112233',
        },
      },
    };
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector('[data-action="select-page-header"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);
    document
      .querySelector('[data-width="mobile"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    const scopeSelect = document.querySelector('[data-responsive-edit-scope]');
    scopeSelect.value = 'device';
    scopeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(1);

    expect(document.querySelector('.pb-header-copy-input')).toBeNull();
    expect(document.querySelector('.pb-header-nav-input')).toBeNull();
    expect(document.querySelector('.pb-header-layout-card')).toBeNull();
    const toggle = document.querySelector(
      '[data-appearance-toggle="true"][data-appearance-scope="shell-top"][data-appearance-key="background.color"]'
    );
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(1);

    const colorInput = document.querySelector(
      '[data-appearance-input="true"][data-appearance-input-kind="hex"][data-appearance-scope="shell-top"][data-appearance-key="background.color"]'
    );
    colorInput.value = '#445566';
    colorInput.dispatchEvent(new Event('input', { bubbles: true }));

    enterPreviewMode();
    const snapshot = requestCurrentPreviewSnapshot();
    expect(snapshot?.source).toBe('working');
    expect(snapshot?.page.meta.responsive.mobile.header.appearance.top.background.color).toBe(
      '#445566'
    );
    expect(snapshot?.page.meta.header.appearance.top.background.color).toBe('#112233');

    document
      .getElementById('pbSaveHeader')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    const savedMeta = mocks.updatePage.mock.calls.at(-1)?.[1]?.meta;
    expect(savedMeta.header.appearance.top.background.color).toBe('#112233');
    expect(savedMeta.responsive.mobile.header.appearance.top.background.color).toBe('#445566');

    const globalScope = document.querySelector('[data-responsive-edit-scope]');
    globalScope.value = 'global';
    globalScope.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(1);
    const globalColorInput = document.querySelector(
      '[data-appearance-input="true"][data-appearance-input-kind="hex"][data-appearance-scope="shell-top"][data-appearance-key="background.color"]'
    );
    expect(globalColorInput?.value).toBe('#112233');
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

  it('defaults to the live iframe canvas and keeps structure behind the debug toggle', async () => {
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

    // Starts in live mode. The same-origin iframe is primary, and structure stays hidden.
    expect(canvas?.dataset.mode).toBe('preview');
    expect(widthToggles?.hidden).toBe(false);
    expect(layout?.dataset.canvasMode).toBe('live');
    expect(canvas?.querySelector('.pb-preview-frame')).not.toBeNull();
    expect(canvas?.querySelector('.pb-preview-iframe')).not.toBeNull();
    expect(canvas?.querySelector('.pb-structure-debug-surface')?.hidden).toBe(true);
    expect(previewBtn?.classList.contains('pb-view-toggle--active')).toBe(true);
    expect(editBtn?.classList.contains('pb-view-toggle--active')).toBe(false);

    // Switch to the temporary structural fallback.
    editBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(canvas?.dataset.mode).toBe('edit');
    expect(widthToggles?.hidden).toBe(false);
    expect(layout?.dataset.canvasMode).toBe('structure');
    expect(canvas?.querySelector('div[data-section-id]')).not.toBeNull();
    expect(editBtn?.classList.contains('pb-view-toggle--active')).toBe(true);

    previewBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(canvas?.dataset.mode).toBe('preview');
    expect(layout?.dataset.canvasMode).toBe('live');
    expect(previewBtn?.classList.contains('pb-view-toggle--active')).toBe(true);
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
    expect(widthToggles?.querySelector('[data-width="mobile"]')?.textContent?.trim()).toBe('Phone');

    expect(canvas?.querySelector('.pb-preview-frame')?.dataset.width).toBe('desktop');
    expect(canvas?.querySelector('.pb-preview-frame')?.dataset.deviceId).toBe('desktop');
    const initialIframe = getPreviewIframe();
    const initialFrame = getPreviewFrame();
    const initialSrc = initialIframe?.getAttribute('src');
    expect(initialSrc).toContain('/index.html?');
    expect(initialSrc).toContain('builderPreview=1');
    expect(canvas?.dataset.mode).toBe('preview');
    expect(canvas?.querySelector('.pb-preview-container')).toBeNull();
    expect(initialFrame?.parentElement).toBe(canvas);
    expect(initialFrame?.style.width).toBe('1280px');
    expect(initialFrame?.style.height).toBe('900px');
    expect(initialIframe?.style.width).toBe('1280px');
    expect(initialIframe?.style.height).toBe('900px');

    // Switch to tablet
    widthToggles
      ?.querySelector('[data-width="tablet"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(canvas?.querySelector('.pb-preview-frame')?.dataset.width).toBe('tablet');
    expect(canvas?.querySelector('.pb-preview-frame')?.dataset.deviceId).toBe('tablet');
    expect(getPreviewIframe()).toBe(initialIframe);
    expect(getPreviewIframe()?.getAttribute('src')).toBe(initialSrc);
    expect(getPreviewIframe()?.getAttribute('width')).toBe('768');
    expect(getPreviewIframe()?.getAttribute('height')).toBe('1024');
    expect(getPreviewFrame()?.style.width).toBe('768px');
    expect(getPreviewFrame()?.style.height).toBe('1024px');
    expect(getPreviewIframe()?.style.width).toBe('768px');
    expect(getPreviewIframe()?.style.height).toBe('1024px');
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
    expect(canvas?.querySelector('.pb-preview-frame')?.dataset.deviceId).toBe('mobile');
    expect(getPreviewIframe()).toBe(initialIframe);
    expect(getPreviewIframe()?.getAttribute('width')).toBe('375');
    expect(getPreviewIframe()?.getAttribute('height')).toBe('812');
    expect(getPreviewFrame()?.style.width).toBe('375px');
    expect(getPreviewFrame()?.style.height).toBe('812px');
    expect(getPreviewIframe()?.style.width).toBe('375px');
    expect(getPreviewIframe()?.style.height).toBe('812px');
    const mobileSnapshot = requestCurrentPreviewSnapshot();
    expect(mobileSnapshot?.options.deviceId).toBe('mobile');
    expect(mobileSnapshot?.options.viewport).toMatchObject({ id: 'mobile', width: 375 });

    // Back to desktop
    widthToggles
      ?.querySelector('[data-width="desktop"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(canvas?.querySelector('.pb-preview-frame')?.dataset.width).toBe('desktop');
    expect(canvas?.querySelector('.pb-preview-frame')?.dataset.deviceId).toBe('desktop');
    expect(getPreviewFrame()?.style.width).toBe('1280px');
    expect(getPreviewFrame()?.style.height).toBe('900px');

    const invalidWidth = document.createElement('button');
    invalidWidth.dataset.width = 'wide';
    widthToggles?.appendChild(invalidWidth);
    invalidWidth.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(canvas?.querySelector('.pb-preview-frame')?.dataset.width).toBe('desktop');
  });

  it('saves current-device module overrides without replacing global config', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const globalAlignment = textModule.config.alignment;
    const globalContent = textModule.config.content;
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector(`.pb-module[data-module-id="${textModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    document
      .querySelector('[data-width="mobile"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    const scopeSelect = document.querySelector('[data-responsive-edit-scope]');
    scopeSelect.value = 'device';
    scopeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(1);

    const alignmentSelect = document.querySelector('[data-key="alignment"]');
    expect(document.querySelector('[data-key="content"]')).toBeNull();
    expect(document.querySelector('[data-key="_raw"]')).toBeNull();
    expect(alignmentSelect.value).toBe(globalAlignment);
    alignmentSelect.value = 'right';
    alignmentSelect.dispatchEvent(new Event('change', { bubbles: true }));

    document
      .getElementById('pbSaveModule')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    const savedConfig = mocks.updateModule.mock.calls.at(-1)?.[1]?.config;
    expect(savedConfig.alignment).toBe(globalAlignment);
    expect(savedConfig.content).toBe(globalContent);
    expect(savedConfig.responsive.mobile.alignment).toBe('right');
    expect(textModule.config.alignment).toBe(globalAlignment);
    expect(textModule.config.content).toBe(globalContent);
    expect(textModule.config.responsive.mobile.alignment).toBe('right');

    const globalScopeSelect = document.querySelector('[data-responsive-edit-scope]');
    globalScopeSelect.value = 'global';
    globalScopeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(1);
    expect(document.querySelector('[data-key="alignment"]')?.value).toBe(globalAlignment);

    const deviceScopeSelect = document.querySelector('[data-responsive-edit-scope]');
    deviceScopeSelect.value = 'device';
    deviceScopeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(1);
    expect(document.querySelector('[data-key="alignment"]')?.value).toBe('right');
  });

  it('keeps global-only module controls out of current-device scope', async () => {
    const selectedPage = getContractFixture('builderPage');
    const feedModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'feed');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector(`.pb-module[data-module-id="${feedModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    document
      .querySelector('[data-width="mobile"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    const scopeSelect = document.querySelector('[data-responsive-edit-scope]');
    scopeSelect.value = 'device';
    scopeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(1);

    expect(document.querySelector('[data-responsive-module-key="hidden"]')).not.toBeNull();
    expect(document.querySelector('[data-key="heading"]')).toBeNull();
    expect(document.querySelector('[data-key="feedHref"]')).toBeNull();
    expect(document.querySelector('[data-style-key]')).toBeNull();
    expect(document.querySelector('[data-key="_raw"]')).toBeNull();
  });

  it('limits current-device gallery and entry-gallery edits to columns', async () => {
    const selectedPage = getContractFixture('builderPage');
    const section = selectedPage.sections.find((item) => item.layout === '1-1');
    const galleryModule = {
      id: 'device-gallery-module',
      moduleType: 'gallery',
      columnIndex: 0,
      sortIndex: 50,
      config: {
        columns: 3,
        images: [{ src: 'media/gallery/a.png', alt: 'A' }],
      },
    };
    const entryGalleryModule = {
      id: 'device-entry-gallery-module',
      moduleType: 'entry-gallery',
      columnIndex: 0,
      sortIndex: 51,
      config: {
        columns: 4,
        showLabels: false,
      },
    };
    section.modules.push(galleryModule, entryGalleryModule);
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector('[data-width="mobile"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    document
      .querySelector(`.pb-module[data-module-id="${galleryModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);
    const galleryScope = document.querySelector('[data-responsive-edit-scope]');
    galleryScope.value = 'device';
    galleryScope.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(1);

    expect(document.querySelector('.pb-gallery-item')).toBeNull();
    expect(document.getElementById('pbGalleryAddImage')).toBeNull();
    const galleryColumns = document.querySelector('[data-key="columns"]');
    galleryColumns.value = '5';
    galleryColumns.dispatchEvent(new Event('input', { bubbles: true }));
    document
      .getElementById('pbSaveModule')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    const savedGalleryConfig = mocks.updateModule.mock.calls.at(-1)?.[1]?.config;
    expect(savedGalleryConfig.columns).toBe(3);
    expect(savedGalleryConfig.images).toEqual(galleryModule.config.images);
    expect(savedGalleryConfig.responsive.mobile.columns).toBe(5);

    document
      .querySelector(`.pb-module[data-module-id="${entryGalleryModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);
    expect(document.querySelector('[data-key="showLabels"]')).toBeNull();
    const entryColumns = document.querySelector('[data-key="columns"]');
    entryColumns.value = '2';
    entryColumns.dispatchEvent(new Event('input', { bubbles: true }));
    document
      .getElementById('pbSaveModule')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    const savedEntryConfig = mocks.updateModule.mock.calls.at(-1)?.[1]?.config;
    expect(savedEntryConfig.columns).toBe(4);
    expect(savedEntryConfig.showLabels).toBe(false);
    expect(savedEntryConfig.responsive.mobile.columns).toBe(2);
  });

  it('saves current-device button appearance without changing button content', async () => {
    const selectedPage = getContractFixture('builderPage');
    const buttonsModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'buttons');
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector('[data-width="mobile"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);
    document
      .querySelector(`.pb-module[data-module-id="${buttonsModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    const scopeSelect = document.querySelector('[data-responsive-edit-scope]');
    scopeSelect.value = 'device';
    scopeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(1);

    expect(document.querySelector('.pb-button-input')).toBeNull();
    expect(document.getElementById('pbButtonsAddButton')).toBeNull();
    expect(document.querySelector('.pb-promo-action[data-action="remove"]')).toBeNull();

    const toggle = document.querySelector(
      '[data-appearance-toggle="true"][data-appearance-scope="defaults"][data-appearance-key="background.color"]'
    );
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(1);

    const colorInput = document.querySelector(
      '[data-appearance-input="true"][data-appearance-input-kind="hex"][data-appearance-scope="defaults"][data-appearance-key="background.color"]'
    );
    colorInput.value = '#123456';
    colorInput.dispatchEvent(new Event('input', { bubbles: true }));
    document
      .getElementById('pbSaveModule')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    const savedConfig = mocks.updateModule.mock.calls.at(-1)?.[1]?.config;
    expect(savedConfig.buttons).toEqual(buttonsModule.config.buttons);
    expect(savedConfig.defaults?.appearance).toBeUndefined();
    expect(savedConfig.responsive.mobile.defaults.appearance.background.color).toBe('#123456');
  });

  it('shows saved preview contract status and frame metadata with no dirty scope', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    expect(getPreviewStatus()?.textContent).toBe('Previewing saved draft');
    expect(getPreviewStatus()?.dataset.previewSource).toBe('saved');
    expect(getPreviewFrame()?.dataset.previewSource).toBe('saved');
    expect(getPreviewFrame()?.dataset.pageId).toBe(selectedPage.id);
    expect(getPreviewFrame()?.dataset.pageSlug).toBe(selectedPage.slug);
    expect(getPreviewFrame()?.dataset.draftMode).toBe('published');
    expect(getPreviewFrame()?.dataset.snapshotVersion).toBe('1');
    expect(getPreviewFrame()?.dataset.builderEditing).toBe('true');
    expect(getPreviewFrame()?.dataset.viewportWidth).toBe('1280');
    expect(getPreviewFrame()?.dataset.viewportHeight).toBe('900');
    expect(getPreviewFrame()?.dataset.previewSession).toBeTruthy();
    expect(getPreviewIframe()?.getAttribute('src')).toContain('builderPreview=1');
    expect(getPreviewIframe()?.getAttribute('src')).toContain(
      `pageId=${encodeURIComponent(selectedPage.id)}`
    );
    expect(getPreviewIframe()?.getAttribute('src')).toContain(
      `previewSession=${encodeURIComponent(getPreviewFrame()?.dataset.previewSession || '')}`
    );
  });

  it('posts snapshots to the reader iframe and validates preview responses', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const iframe = getPreviewIframe();
    const frame = getPreviewFrame();
    const iframeWindow = { postMessage: vi.fn() };
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: iframeWindow,
    });
    const request = {
      type: BUILDER_PREVIEW_MESSAGE_TYPES.REQUEST_SNAPSHOT,
      previewSession: frame.dataset.previewSession,
      snapshotVersion: BUILDER_PREVIEW_SNAPSHOT_VERSION,
      seriesId: 'battle-bros',
      pageId: selectedPage.id,
      pageSlug: selectedPage.slug,
    };

    window.dispatchEvent(
      new MessageEvent('message', {
        data: request,
        origin: window.location.origin,
        source: iframeWindow,
      })
    );

    expect(iframeWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.SNAPSHOT,
        previewSession: frame.dataset.previewSession,
        snapshot: expect.objectContaining({
          pageId: selectedPage.id,
          pageSlug: selectedPage.slug,
          options: expect.objectContaining({
            builderEditing: true,
          }),
        }),
      }),
      window.location.origin
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: BUILDER_PREVIEW_MESSAGE_TYPES.ACK,
          previewSession: frame.dataset.previewSession,
          snapshotVersion: BUILDER_PREVIEW_SNAPSHOT_VERSION,
          seriesId: 'battle-bros',
          pageId: selectedPage.id,
          pageSlug: selectedPage.slug,
        },
        origin: window.location.origin,
        source: iframeWindow,
      })
    );

    expect(frame.dataset.previewReady).toBe('true');

    const metrics = {
      viewport: { ...PREVIEW_VIEWPORTS.mobile },
      innerWidth: 375,
      innerHeight: 812,
      pageSlug: selectedPage.slug,
      snapshotVersion: BUILDER_PREVIEW_SNAPSHOT_VERSION,
      twoPageMode: false,
      branchFlags: {
        aspectMax7By5: true,
        aspectMax5By7: true,
        maxWidth768: true,
        maxWidth480: true,
      },
      overflow: {
        hasOverflow: true,
        rootHasOverflow: false,
        offenders: [{ selector: '.pb-html', index: 0 }],
      },
    };
    window.dispatchEvent(
      new MessageEvent('message', {
        data: buildPreviewMetricsMessage(metrics, {
          previewSession: frame.dataset.previewSession,
          seriesId: 'battle-bros',
          pageId: selectedPage.id,
          pageSlug: selectedPage.slug,
        }),
        origin: window.location.origin,
        source: iframeWindow,
      })
    );

    expect(frame.dataset.metricsPreset).toBe('mobile');
    expect(frame.dataset.metricsInnerWidth).toBe('375');
    expect(frame.dataset.metricsInnerHeight).toBe('812');
    expect(frame.dataset.metricsHasOverflow).toBe('true');
    expect(frame.dataset.metricsOverflowOffenders).toContain('.pb-html');
  });

  it('collapses editor chrome over the live iframe and restores the selected target', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const textSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === textModule.id)
    );
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    enterPreviewMode();
    document
      .querySelector('#pbWidthToggles [data-width="mobile"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    const frame = getPreviewFrame();
    const iframe = getPreviewIframe();
    const iframeWindow = attachPreviewIframeWindow();
    const target = {
      kind: 'module',
      key: `module:${textModule.id}`,
      pageId: selectedPage.id,
      sectionId: textSection.id,
      columnIndex: textModule.columnIndex,
      moduleId: textModule.id,
      moduleType: textModule.moduleType,
    };
    const geometry = {
      target,
      rect: { top: 48, left: 32, right: 272, bottom: 148, width: 240, height: 100 },
      visible: true,
      order: 0,
      label: 'Text module',
    };
    sendPreviewTargets({ frame, iframeWindow, page: selectedPage, targets: [geometry] });
    sendPreviewTargetSelect({ frame, iframeWindow, page: selectedPage, target });
    await flushAdminUi(2);

    const initialSrc = iframe?.getAttribute('src');
    const initialSession = frame.dataset.previewSession;
    const initialFrame = getPreviewFrame();
    const initialIframe = getPreviewIframe();
    document.getElementById('pbCanvas').scrollTop = 33;

    expect(frame.querySelector('.pb-preview-target-toolbar')).not.toBeNull();
    expect(getPreviewStatus()).not.toBeNull();
    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Text Module');

    enterChromePreview();
    await flushAdminUi(2);

    const collapsedSnapshot = iframeWindow.postMessage.mock.calls
      .map((call) => call[0])
      .filter((message) => message?.type === BUILDER_PREVIEW_MESSAGE_TYPES.SNAPSHOT)
      .at(-1)?.snapshot;
    const root = document.querySelector('.page-builder');

    expect(root?.dataset.chromeMode).toBe('preview');
    expect(document.querySelector('.page-builder-layout')?.dataset.canvasMode).toBe('live');
    expect(document.getElementById('pbRestorePreviewChrome')?.hidden).toBe(false);
    expect(document.activeElement).toBe(document.getElementById('pbRestorePreviewChrome'));
    expect(document.getElementById('pbEnterPreview')?.disabled).toBe(true);
    expect(getPreviewFrame()).toBe(initialFrame);
    expect(getPreviewIframe()).toBe(initialIframe);
    expect(getPreviewIframe()?.getAttribute('src')).toBe(initialSrc);
    expect(getPreviewFrame()?.dataset.previewSession).toBe(initialSession);
    expect(getPreviewFrame()?.dataset.width).toBe('mobile');
    expect(getPreviewFrame()?.dataset.deviceId).toBe('mobile');
    expect(getPreviewFrame()?.dataset.viewportWidth).toBe('375');
    expect(getPreviewFrame()?.dataset.viewportHeight).toBe('812');
    expect(getPreviewFrame()?.dataset.builderEditing).toBe('false');
    expect(getPreviewFrame()?.dataset.targetCount).toBeUndefined();
    expect(getPreviewFrame()?.querySelector('.pb-preview-target-overlay')).toBeNull();
    expect(collapsedSnapshot?.options.builderEditing).toBe(false);
    expect(collapsedSnapshot?.source).toBe('saved');

    restoreChromePreview();
    await flushAdminUi(2);

    const restoredSnapshot = iframeWindow.postMessage.mock.calls
      .map((call) => call[0])
      .filter((message) => message?.type === BUILDER_PREVIEW_MESSAGE_TYPES.SNAPSHOT)
      .at(-1)?.snapshot;
    expect(root?.dataset.chromeMode).toBe('edit');
    expect(document.getElementById('pbRestorePreviewChrome')?.hidden).toBe(true);
    expect(document.getElementById('pbEnterPreview')?.disabled).toBe(false);
    expect(getPreviewFrame()).toBe(initialFrame);
    expect(getPreviewIframe()?.getAttribute('src')).toBe(initialSrc);
    expect(getPreviewFrame()?.dataset.previewSession).toBe(initialSession);
    expect(getPreviewFrame()?.dataset.builderEditing).toBe('true');
    expect(restoredSnapshot?.options.builderEditing).toBe(true);
    expect(getPreviewFrame()?.querySelector('.pb-preview-target-box--selected')).toBeNull();
    expect(getPreviewFrame()?.querySelector('.pb-preview-target-toolbar')).toBeNull();

    sendPreviewTargets({
      frame: getPreviewFrame(),
      iframeWindow,
      page: selectedPage,
      targets: [geometry],
      sequence: 3,
    });
    await flushAdminUi(2);

    expect(getPreviewFrame()?.dataset.selectedTargetKey).toBeUndefined();
    expect(getPreviewFrame()?.querySelector('.pb-preview-target-box--selected')).toBeNull();
    expect(getPreviewFrame()?.querySelector('.pb-preview-target-toolbar')).toBeNull();

    sendPreviewTargets({
      frame: getPreviewFrame(),
      iframeWindow,
      page: selectedPage,
      targets: [geometry],
      sequence: 4,
    });
    await flushAdminUi(2);

    expect(getPreviewFrame()?.dataset.selectedTargetKey).toBe(target.key);
    expect(getPreviewFrame()?.querySelector('.pb-preview-target-box--selected')).not.toBeNull();
    expect(getPreviewFrame()?.querySelector('.pb-preview-target-toolbar')).not.toBeNull();
    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Text Module');
    expect(document.querySelector('.pb-sidebar-tab.active')?.dataset.tab).toBe('settings');
    expect(document.getElementById('pbCanvas')?.scrollTop).toBe(33);
  });

  it('restores Structure Debug after chrome-collapsed preview exits', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await openBuilderPage(manager);
    enterEditMode();
    await flushAdminUi(1);

    expect(document.querySelector('.page-builder-layout')?.dataset.canvasMode).toBe('structure');
    expect(document.getElementById('pbCanvas')?.dataset.mode).toBe('edit');
    expect(getPreviewFrame()).toBeNull();

    enterChromePreview();
    await flushAdminUi(2);

    expect(document.querySelector('.page-builder')?.dataset.chromeMode).toBe('preview');
    expect(document.querySelector('.page-builder-layout')?.dataset.canvasMode).toBe('live');
    expect(document.getElementById('pbCanvas')?.dataset.mode).toBe('preview');
    expect(getPreviewFrame()).not.toBeNull();
    expect(getPreviewFrame()?.dataset.builderEditing).toBe('false');

    restoreChromePreview();
    await flushAdminUi(2);

    expect(document.querySelector('.page-builder')?.dataset.chromeMode).toBe('edit');
    expect(document.querySelector('.page-builder-layout')?.dataset.canvasMode).toBe('structure');
    expect(document.getElementById('pbCanvas')?.dataset.mode).toBe('edit');
    expect(getPreviewFrame()).toBeNull();
    expect(
      document.getElementById('pbCanvas')?.querySelector('div[data-section-id]')
    ).not.toBeNull();
  });

  it('keeps dirty drafts as working snapshots while chrome preview is collapsed', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const textSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === textModule.id)
    );
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    enterPreviewMode();
    const frame = getPreviewFrame();
    const iframeWindow = attachPreviewIframeWindow();
    const target = {
      kind: 'module',
      key: `module:${textModule.id}`,
      pageId: selectedPage.id,
      sectionId: textSection.id,
      columnIndex: textModule.columnIndex,
      moduleId: textModule.id,
      moduleType: textModule.moduleType,
    };
    sendPreviewTargetSelect({ frame, iframeWindow, page: selectedPage, target });
    await flushAdminUi(2);

    const contentInput = document.querySelector('[data-key="content"]');
    contentInput.value = '<p>Dirty chrome preview text</p>';
    contentInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAdminUi(2);
    expect(getPreviewFrame()?.dataset.previewSource).toBe('working');

    enterChromePreview();
    await flushAdminUi(2);

    const collapsedSnapshot = iframeWindow.postMessage.mock.calls
      .map((call) => call[0])
      .filter((message) => message?.type === BUILDER_PREVIEW_MESSAGE_TYPES.SNAPSHOT)
      .at(-1)?.snapshot;

    expect(getPreviewFrame()?.dataset.previewSource).toBe('working');
    expect(collapsedSnapshot?.source).toBe('working');
    expect(collapsedSnapshot?.options.builderEditing).toBe(false);
    const collapsedModule = collapsedSnapshot?.page.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.id === textModule.id);
    expect(collapsedModule?.config.content).toContain('Dirty chrome preview text');
    expect(document.querySelector('.pb-editor-footer-status')?.textContent).toContain('unsaved');
  });

  it('exits chrome preview with Escape while the restore button is focused', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    enterPreviewMode();
    enterChromePreview();
    await flushAdminUi(2);

    const root = document.querySelector('.page-builder');
    const restoreButton = document.getElementById('pbRestorePreviewChrome');
    expect(root?.dataset.chromeMode).toBe('preview');
    expect(document.activeElement).toBe(restoreButton);

    const escapeEvent = createKeyboardLikeEvent('Escape');
    restoreButton?.dispatchEvent(escapeEvent);
    await flushAdminUi(3);

    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(root?.dataset.chromeMode).toBe('edit');
    expect(restoreButton?.hidden).toBe(true);
    expect(getPreviewFrame()?.dataset.builderEditing).toBe('true');
  });

  it('renders live canvas target overlays and maps target selection to the inspector', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const textSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === textModule.id)
    );
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    const iframeWindow = attachPreviewIframeWindow();
    const expected = {
      previewSession: frame.dataset.previewSession,
      seriesId: 'battle-bros',
      pageId: selectedPage.id,
      pageSlug: selectedPage.slug,
    };
    const target = {
      kind: 'module',
      key: `module:${textModule.id}`,
      pageId: selectedPage.id,
      sectionId: textSection.id,
      columnIndex: textModule.columnIndex,
      moduleId: textModule.id,
      moduleType: textModule.moduleType,
    };
    const geometry = {
      target,
      rect: { top: 48, left: 32, right: 272, bottom: 148, width: 240, height: 100 },
      visible: true,
      order: 0,
      label: 'Text module',
    };

    dispatchPreviewMessageFromIframe(
      buildPreviewTargetMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.TARGETS,
        { sequence: 3, targets: [geometry] },
        expected
      ),
      iframeWindow
    );
    expect(frame.dataset.targetSequence).toBe('3');
    expect(frame.dataset.targetCount).toBe('1');

    dispatchPreviewMessageFromIframe(
      buildPreviewTargetMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_HOVER,
        { sequence: 3, target },
        expected
      ),
      iframeWindow
    );
    expect(frame.querySelector('.pb-preview-target-box--hover')).not.toBeNull();

    dispatchPreviewMessageFromIframe(
      buildPreviewTargetMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_SELECT,
        { sequence: 3, target },
        expected
      ),
      iframeWindow
    );
    await flushAdminUi(2);

    expect(frame.dataset.selectedTargetKey).toBe(`module:${textModule.id}`);
    expect(frame.querySelector('.pb-preview-target-box--selected')).not.toBeNull();
    expect(frame.querySelector('.pb-preview-target-toolbar')?.textContent).toContain('Text module');
    expect(frame.querySelector('[data-preview-target-action="edit-text"]')).not.toBeNull();
    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Text Module');

    frame
      .querySelector('[data-preview-target-action="edit-text"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);
    expect(iframeWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_START,
        target: expect.objectContaining({ moduleId: textModule.id }),
        field: 'content',
      }),
      window.location.origin
    );
  });

  it('syncs text inline edit messages into module drafts, undo, preview source, and save', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const textSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === textModule.id)
    );
    const originalContent = textModule.config.content;
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    const iframeWindow = attachPreviewIframeWindow();
    const expected = {
      previewSession: frame.dataset.previewSession,
      seriesId: 'battle-bros',
      pageId: selectedPage.id,
      pageSlug: selectedPage.slug,
    };
    const target = {
      kind: 'module',
      key: `module:${textModule.id}`,
      pageId: selectedPage.id,
      sectionId: textSection.id,
      columnIndex: textModule.columnIndex,
      moduleId: textModule.id,
      moduleType: textModule.moduleType,
    };
    const geometry = {
      target,
      rect: { top: 48, left: 32, right: 272, bottom: 148, width: 240, height: 100 },
      visible: true,
      order: 0,
      label: 'Text module',
    };
    sendPreviewTargets({ frame, iframeWindow, page: selectedPage, targets: [geometry] });
    sendPreviewTargetSelect({ frame, iframeWindow, page: selectedPage, target });
    await flushAdminUi(2);

    dispatchPreviewMessageFromIframe(
      buildPreviewInlineEditMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_START,
        { sequence: 3, target, field: 'content', value: originalContent },
        expected
      ),
      iframeWindow
    );
    dispatchPreviewMessageFromIframe(
      buildPreviewInlineEditMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE,
        { sequence: 3, target, field: 'content', value: '<p><strong>Inline</strong> copy</p>' },
        expected
      ),
      iframeWindow
    );
    await flushAdminUi(2);

    expect(mocks.updateModule).not.toHaveBeenCalled();
    expect(document.querySelector('[data-key="content"]')?.value).toBe(
      '<p><strong>Inline</strong> copy</p>'
    );
    expect(document.querySelector('.pb-editor-footer-status')?.textContent).toContain('unsaved');
    expect(document.querySelector('[data-action="undo-current"]')?.disabled).toBe(false);
    expect(getPreviewStatus()?.dataset.previewSource).toBe('working');
    expect(getPreviewFrame()?.dataset.previewSource).toBe('working');
    const workingSnapshot = requestCurrentPreviewSnapshot();
    const workingModule = workingSnapshot?.page.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.id === textModule.id);
    expect(workingSnapshot?.source).toBe('working');
    expect(workingModule?.config.content).toBe('<p><strong>Inline</strong> copy</p>');

    document
      .querySelector('[data-action="undo-current"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);
    expect(document.querySelector('[data-key="content"]')?.value).toBe(originalContent);

    document
      .querySelector('[data-action="redo-current"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);
    expect(document.querySelector('[data-key="content"]')?.value).toBe(
      '<p><strong>Inline</strong> copy</p>'
    );

    document
      .querySelector('[data-action="save-current"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.updateModule).toHaveBeenCalledWith(
      textModule.id,
      expect.objectContaining({
        config: expect.objectContaining({
          content: '<p><strong>Inline</strong> copy</p>',
        }),
      })
    );
    expect(document.querySelector('.pb-editor-footer-status')?.textContent).not.toContain(
      'unsaved'
    );
  });

  it('keeps side-panel text edits canonical when a stale iframe inline commit arrives', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const textSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === textModule.id)
    );
    const originalContent = textModule.config.content;
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    const iframeWindow = attachPreviewIframeWindow();
    const expected = {
      previewSession: frame.dataset.previewSession,
      seriesId: 'battle-bros',
      pageId: selectedPage.id,
      pageSlug: selectedPage.slug,
    };
    const target = {
      kind: 'module',
      key: `module:${textModule.id}`,
      pageId: selectedPage.id,
      sectionId: textSection.id,
      columnIndex: textModule.columnIndex,
      moduleId: textModule.id,
      moduleType: textModule.moduleType,
    };
    sendPreviewTargets({
      frame,
      iframeWindow,
      page: selectedPage,
      targets: [
        {
          target,
          rect: { top: 48, left: 32, right: 272, bottom: 148, width: 240, height: 100 },
          visible: true,
          order: 0,
          label: 'Text module',
        },
      ],
    });
    sendPreviewTargetSelect({ frame, iframeWindow, page: selectedPage, target });
    await flushAdminUi(2);

    dispatchPreviewMessageFromIframe(
      buildPreviewInlineEditMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_START,
        { sequence: 3, target, field: 'content', value: originalContent },
        expected
      ),
      iframeWindow
    );
    dispatchPreviewMessageFromIframe(
      buildPreviewInlineEditMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE,
        { sequence: 3, target, field: 'content', value: '<p>Iframe old</p>' },
        expected
      ),
      iframeWindow
    );
    await flushAdminUi(2);

    iframeWindow.postMessage.mockClear();
    const contentInput = document.querySelector('[data-key="content"]');
    contentInput.value = '<p>Side panel wins</p><script>ignored()</script>';
    contentInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAdminUi(2);

    expect(iframeWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE,
        target: expect.objectContaining({ moduleId: textModule.id }),
        value: '<p>Side panel wins</p>',
        reason: 'side-panel',
      }),
      window.location.origin
    );

    dispatchPreviewMessageFromIframe(
      buildPreviewInlineEditMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_COMMIT,
        { sequence: 3, target, field: 'content', value: '<p>Iframe old</p>' },
        expected
      ),
      iframeWindow
    );
    await flushAdminUi(2);

    expect(document.querySelector('[data-key="content"]')?.value).toBe(
      '<p>Side panel wins</p><script>ignored()</script>'
    );

    document
      .querySelector('[data-action="save-current"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(4);

    expect(mocks.updateModule).toHaveBeenCalledWith(
      textModule.id,
      expect.objectContaining({
        config: expect.objectContaining({
          content: '<p>Side panel wins</p><script>ignored()</script>',
        }),
      })
    );
  });

  it('sends iframe cleanup when saving or discarding active inline text edits', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const textSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === textModule.id)
    );
    const originalContent = textModule.config.content;
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    const iframeWindow = attachPreviewIframeWindow();
    const expected = {
      previewSession: frame.dataset.previewSession,
      seriesId: 'battle-bros',
      pageId: selectedPage.id,
      pageSlug: selectedPage.slug,
    };
    const target = {
      kind: 'module',
      key: `module:${textModule.id}`,
      pageId: selectedPage.id,
      sectionId: textSection.id,
      columnIndex: textModule.columnIndex,
      moduleId: textModule.id,
      moduleType: textModule.moduleType,
    };
    sendPreviewTargets({
      frame,
      iframeWindow,
      page: selectedPage,
      targets: [
        {
          target,
          rect: { top: 48, left: 32, right: 272, bottom: 148, width: 240, height: 100 },
          visible: true,
          order: 0,
          label: 'Text module',
        },
      ],
    });
    sendPreviewTargetSelect({ frame, iframeWindow, page: selectedPage, target });
    await flushAdminUi(2);

    dispatchPreviewMessageFromIframe(
      buildPreviewInlineEditMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_START,
        { sequence: 3, target, field: 'content', value: originalContent },
        expected
      ),
      iframeWindow
    );
    dispatchPreviewMessageFromIframe(
      buildPreviewInlineEditMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE,
        { sequence: 3, target, field: 'content', value: '<p>Save inline</p>' },
        expected
      ),
      iframeWindow
    );
    await flushAdminUi(2);
    expect(mocks.updateModule).not.toHaveBeenCalled();

    iframeWindow.postMessage.mockClear();
    document
      .querySelector('[data-action="save-current"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(4);

    expect(iframeWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_COMMIT,
        target: expect.objectContaining({ moduleId: textModule.id }),
        value: '<p>Save inline</p>',
        reason: 'save',
      }),
      window.location.origin
    );
    expect(mocks.updateModule).toHaveBeenCalledWith(
      textModule.id,
      expect.objectContaining({
        config: expect.objectContaining({ content: '<p>Save inline</p>' }),
      })
    );

    dispatchPreviewMessageFromIframe(
      buildPreviewInlineEditMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_START,
        { sequence: 4, target, field: 'content', value: '<p>Save inline</p>' },
        expected
      ),
      iframeWindow
    );
    dispatchPreviewMessageFromIframe(
      buildPreviewInlineEditMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE,
        { sequence: 4, target, field: 'content', value: '<p>Discard inline</p>' },
        expected
      ),
      iframeWindow
    );
    await flushAdminUi(2);

    iframeWindow.postMessage.mockClear();
    document
      .querySelector('[data-action="discard-current"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(iframeWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CANCEL,
        target: expect.objectContaining({ moduleId: textModule.id }),
        reason: 'discard',
      }),
      window.location.origin
    );
    expect(document.querySelector('[data-key="content"]')?.value).toBe('<p>Save inline</p>');
  });

  it('cleans the iframe inline edit view on device and chrome preview switches without dropping the dirty draft', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const textSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === textModule.id)
    );
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    const iframeWindow = attachPreviewIframeWindow();
    const expected = {
      previewSession: frame.dataset.previewSession,
      seriesId: 'battle-bros',
      pageId: selectedPage.id,
      pageSlug: selectedPage.slug,
    };
    const target = {
      kind: 'module',
      key: `module:${textModule.id}`,
      pageId: selectedPage.id,
      sectionId: textSection.id,
      columnIndex: textModule.columnIndex,
      moduleId: textModule.id,
      moduleType: textModule.moduleType,
    };
    sendPreviewTargets({
      frame,
      iframeWindow,
      page: selectedPage,
      targets: [
        {
          target,
          rect: { top: 48, left: 32, right: 272, bottom: 148, width: 240, height: 100 },
          visible: true,
          order: 0,
          label: 'Text module',
        },
      ],
    });
    sendPreviewTargetSelect({ frame, iframeWindow, page: selectedPage, target });
    await flushAdminUi(2);

    dispatchPreviewMessageFromIframe(
      buildPreviewInlineEditMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_START,
        { sequence: 3, target, field: 'content', value: textModule.config.content },
        expected
      ),
      iframeWindow
    );
    dispatchPreviewMessageFromIframe(
      buildPreviewInlineEditMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE,
        { sequence: 3, target, field: 'content', value: '<p>Dirty inline</p>' },
        expected
      ),
      iframeWindow
    );
    await flushAdminUi(2);

    iframeWindow.postMessage.mockClear();
    document
      .getElementById('pbWidthToggles')
      ?.querySelector('[data-width="tablet"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    expect(iframeWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CANCEL,
        target: expect.objectContaining({ moduleId: textModule.id }),
        reason: 'device-switch',
      }),
      window.location.origin
    );
    expect(document.querySelector('[data-key="content"]')?.value).toBe('<p>Dirty inline</p>');
    expect(document.querySelector('.pb-editor-footer-status')?.textContent).toContain('unsaved');

    dispatchPreviewMessageFromIframe(
      buildPreviewInlineEditMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_START,
        { sequence: 4, target, field: 'content', value: '<p>Dirty inline</p>' },
        expected
      ),
      iframeWindow
    );
    await flushAdminUi(1);

    iframeWindow.postMessage.mockClear();
    enterChromePreview();
    await flushAdminUi(2);

    expect(iframeWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CANCEL,
        target: expect.objectContaining({ moduleId: textModule.id }),
        reason: 'chrome-preview',
      }),
      window.location.origin
    );
    expect(getPreviewFrame()?.dataset.builderEditing).toBe('false');
    expect(
      requestCurrentPreviewSnapshot()
        ?.page.sections.flatMap((section) => section.modules || [])
        .find((module) => module.id === textModule.id)?.config.content
    ).toBe('<p>Dirty inline</p>');
  });

  it('clears stale live target overlays when a preview refresh never returns fresh targets', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const textSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === textModule.id)
    );
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    const iframeWindow = attachPreviewIframeWindow();
    const expected = {
      previewSession: frame.dataset.previewSession,
      seriesId: 'battle-bros',
      pageId: selectedPage.id,
      pageSlug: selectedPage.slug,
    };
    const textTarget = {
      kind: 'module',
      key: `module:${textModule.id}`,
      pageId: selectedPage.id,
      sectionId: textSection.id,
      columnIndex: textModule.columnIndex,
      moduleId: textModule.id,
      moduleType: textModule.moduleType,
    };
    const pageTarget = {
      kind: 'page',
      key: `page:${selectedPage.id}`,
      pageId: selectedPage.id,
    };
    const buildGeometry = (target, top = 48) => ({
      target,
      rect: { top, left: 32, right: 272, bottom: top + 100, width: 240, height: 100 },
      visible: true,
      order: 0,
      label: target.kind === 'page' ? 'Page' : 'Text module',
    });
    const sendTargets = (sequence, geometry) => {
      dispatchPreviewMessageFromIframe(
        buildPreviewTargetMessage(
          BUILDER_PREVIEW_MESSAGE_TYPES.TARGETS,
          { sequence, targets: [geometry] },
          expected
        ),
        iframeWindow
      );
    };
    const sendTargetState = (type, sequence, target) => {
      dispatchPreviewMessageFromIframe(
        buildPreviewTargetMessage(type, { sequence, target }, expected),
        iframeWindow
      );
    };

    vi.useFakeTimers();

    sendTargets(3, buildGeometry(textTarget));
    sendTargetState(BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_HOVER, 3, textTarget);
    sendTargetState(BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_SELECT, 3, textTarget);

    expect(frame.dataset.targetSequence).toBe('3');
    expect(frame.dataset.targetCount).toBe('1');
    expect(frame.dataset.hoveredTargetKey).toBe(textTarget.key);
    expect(frame.dataset.selectedTargetKey).toBe(textTarget.key);
    expect(frame.querySelector('.pb-preview-target-box--selected')).not.toBeNull();
    expect(frame.querySelector('.pb-preview-target-toolbar')).not.toBeNull();

    vi.advanceTimersByTime(1499);

    expect(frame.dataset.targetCount).toBe('1');
    expect(frame.dataset.selectedTargetKey).toBe(textTarget.key);
    expect(frame.querySelector('.pb-preview-target-box--selected')).not.toBeNull();

    vi.advanceTimersByTime(1);

    expect(frame.dataset.targetSequence).toBe('3');
    expect(frame.dataset.targetCount).toBeUndefined();
    expect(frame.dataset.hoveredTargetKey).toBeUndefined();
    expect(frame.dataset.selectedTargetKey).toBeUndefined();
    expect(frame.querySelector('.pb-preview-target-box--hover')).toBeNull();
    expect(frame.querySelector('.pb-preview-target-box--selected')).toBeNull();
    expect(frame.querySelector('.pb-preview-target-toolbar')).toBeNull();

    sendTargets(10, buildGeometry(pageTarget));
    sendTargetState(BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_SELECT, 10, pageTarget);
    expect(frame.dataset.selectedTargetKey).toBe(pageTarget.key);
    expect(frame.querySelector('.pb-preview-target-box--selected')).not.toBeNull();

    vi.advanceTimersByTime(1000);
    sendTargets(11, buildGeometry(pageTarget, 72));
    vi.advanceTimersByTime(1000);

    expect(frame.dataset.targetSequence).toBe('11');
    expect(frame.dataset.targetCount).toBe('1');
    expect(frame.dataset.selectedTargetKey).toBe(pageTarget.key);
    expect(frame.querySelector('.pb-preview-target-box--selected')).not.toBeNull();
    expect(frame.querySelector('.pb-preview-target-toolbar')).not.toBeNull();
  });

  it('creates a section and module when dragging a block onto an empty live canvas', async () => {
    const selectedPage = buildContractFixture('builderPage', {
      sections: [],
    });
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    frame.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 1280,
      bottom: 900,
      width: 1280,
      height: 900,
    });
    const overlay = frame.querySelector('.pb-preview-target-overlay');
    const block = document.querySelector('.pb-module-type[data-module-type="text"]');
    const dataTransfer = createDataTransfer();

    block.dispatchEvent(createDragLikeEvent('dragstart', dataTransfer));
    expect(overlay.classList.contains('is-live-dragging')).toBe(true);

    overlay.dispatchEvent(
      createDragLikeEvent('dragover', dataTransfer, { clientX: 120, clientY: 120 })
    );
    const dropGuide = frame.querySelector('.pb-preview-drop-guide--page-end');
    expect(dropGuide).not.toBeNull();
    expect(dropGuide?.getAttribute('style')).toContain('width:');

    overlay.dispatchEvent(
      createDragLikeEvent('drop', dataTransfer, { clientX: 120, clientY: 120 })
    );
    await flushAdminUi(6);

    expect(mocks.addSection).toHaveBeenCalledWith(selectedPage.id);
    expect(mocks.addModule).toHaveBeenCalledWith(
      'new-section-id',
      'text',
      0,
      expect.objectContaining({ content: expect.stringContaining('Enter your text') }),
      null
    );
    expect(mocks.reorderModules).toHaveBeenCalledWith('new-section-id', 0, ['new-module-id']);
    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Text Module');
  });

  it('does not continue a page-end block drop when new-section ordering fails', async () => {
    const selectedPage = buildContractFixture('builderPage', {
      sections: [],
    });
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      reorderSectionsResult: false,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    frame.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 1280,
      bottom: 900,
      width: 1280,
      height: 900,
    });
    const overlay = frame.querySelector('.pb-preview-target-overlay');
    const block = document.querySelector('.pb-module-type[data-module-type="text"]');
    const dataTransfer = createDataTransfer();

    block.dispatchEvent(createDragLikeEvent('dragstart', dataTransfer));
    overlay.dispatchEvent(
      createDragLikeEvent('dragover', dataTransfer, { clientX: 120, clientY: 120 })
    );
    overlay.dispatchEvent(
      createDragLikeEvent('drop', dataTransfer, { clientX: 120, clientY: 120 })
    );
    await flushAdminUi(6);

    expect(mocks.addSection).toHaveBeenCalledWith(selectedPage.id);
    expect(mocks.reorderSections).toHaveBeenCalledWith(selectedPage.id, ['new-section-id']);
    expect(mocks.addModule).not.toHaveBeenCalled();
    expect(document.getElementById('pbEditorTitle')?.textContent).not.toContain('Text Module');
    expect(
      frame.querySelector('.pb-preview-target-overlay')?.classList.contains('is-live-dragging')
    ).toBe(false);
    expect(document.querySelector('.pb-live-canvas-status')?.textContent).toContain(
      'Failed to add section.'
    );
  });

  it('uses toolbar Insert Before to create a pending target completed by a block click', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const textSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === textModule.id)
    );
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    const iframeWindow = attachPreviewIframeWindow();
    const target = {
      kind: 'module',
      key: `module:${textModule.id}`,
      pageId: selectedPage.id,
      sectionId: textSection.id,
      columnIndex: textModule.columnIndex,
      moduleId: textModule.id,
      moduleType: textModule.moduleType,
    };
    sendPreviewTargets({
      frame,
      iframeWindow,
      page: selectedPage,
      targets: [
        {
          target,
          rect: { top: 40, left: 30, right: 230, bottom: 140, width: 200, height: 100 },
          visible: true,
          order: 0,
          label: 'Text module',
        },
      ],
    });
    sendPreviewTargetSelect({ frame, iframeWindow, page: selectedPage, target });
    await flushAdminUi(2);

    frame
      .querySelector('[data-preview-target-action="insert-before"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    expect(document.querySelector('[data-content="blocks"]')?.hidden).toBe(false);

    document
      .querySelector('.pb-module-type[data-module-type="spacer"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(6);

    expect(mocks.addModule).toHaveBeenCalledWith(
      textSection.id,
      'spacer',
      0,
      expect.objectContaining({ height: 40 }),
      null
    );
    expect(mocks.reorderModules).toHaveBeenCalledWith(
      textSection.id,
      0,
      expect.arrayContaining(['new-module-id', textModule.id])
    );
  });

  it('does not report live insert success when module ordering fails', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const textSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === textModule.id)
    );
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      reorderModulesResult: false,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    const iframeWindow = attachPreviewIframeWindow();
    const target = {
      kind: 'module',
      key: `module:${textModule.id}`,
      pageId: selectedPage.id,
      sectionId: textSection.id,
      columnIndex: textModule.columnIndex,
      moduleId: textModule.id,
      moduleType: textModule.moduleType,
    };
    sendPreviewTargets({
      frame,
      iframeWindow,
      page: selectedPage,
      targets: [
        {
          target,
          rect: { top: 40, left: 30, right: 230, bottom: 140, width: 200, height: 100 },
          visible: true,
          order: 0,
          label: 'Text module',
        },
      ],
    });
    sendPreviewTargetSelect({ frame, iframeWindow, page: selectedPage, target });
    await flushAdminUi(2);

    frame
      .querySelector('[data-preview-target-action="insert-before"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);
    document
      .querySelector('.pb-module-type[data-module-type="divider"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(6);

    expect(mocks.addModule).toHaveBeenCalledWith(
      textSection.id,
      'divider',
      0,
      expect.objectContaining({ style: 'solid' }),
      null
    );
    expect(mocks.reorderModules).toHaveBeenCalled();
    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Text Module');
    expect(document.getElementById('pbEditorTitle')?.textContent).not.toContain('Divider Module');
    expect(document.querySelector('.pb-live-canvas-status')?.textContent).toContain(
      'Failed to add Divider module.'
    );
  });

  it('moves a module from Layers to a live canvas column target', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const textSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === textModule.id)
    );
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    frame.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 1280,
      bottom: 900,
      width: 1280,
      height: 900,
    });
    const iframeWindow = attachPreviewIframeWindow();
    const columnTarget = {
      kind: 'column',
      key: `column:${textSection.id}:1`,
      pageId: selectedPage.id,
      sectionId: textSection.id,
      columnIndex: 1,
    };
    sendPreviewTargets({
      frame,
      iframeWindow,
      page: selectedPage,
      targets: [
        {
          target: columnTarget,
          rect: { top: 20, left: 260, right: 520, bottom: 260, width: 260, height: 240 },
          visible: true,
          order: 0,
          label: 'Column 2',
        },
      ],
    });

    const overlay = frame.querySelector('.pb-preview-target-overlay');
    const layerRow = document.querySelector(
      `[data-layer-action="select-module"][data-module-id="${textModule.id}"]`
    );
    const dataTransfer = createDataTransfer();
    layerRow.dispatchEvent(createDragLikeEvent('dragstart', dataTransfer));
    overlay.dispatchEvent(
      createDragLikeEvent('dragover', dataTransfer, { clientX: 300, clientY: 30 })
    );
    overlay.dispatchEvent(createDragLikeEvent('drop', dataTransfer, { clientX: 300, clientY: 30 }));
    await flushAdminUi(6);

    expect(mocks.moveModule).toHaveBeenCalledWith(textModule.id, textSection.id, 1, 0);
    expect(mocks.reorderModules).toHaveBeenCalledWith(
      textSection.id,
      1,
      expect.arrayContaining([textModule.id])
    );
    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Text Module');
  });

  it('does not report live move success when module ordering fails', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const textSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === textModule.id)
    );
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      reorderModulesResult: false,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    frame.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 1280,
      bottom: 900,
      width: 1280,
      height: 900,
    });
    const iframeWindow = attachPreviewIframeWindow();
    const columnTarget = {
      kind: 'column',
      key: `column:${textSection.id}:1`,
      pageId: selectedPage.id,
      sectionId: textSection.id,
      columnIndex: 1,
    };
    sendPreviewTargets({
      frame,
      iframeWindow,
      page: selectedPage,
      targets: [
        {
          target: columnTarget,
          rect: { top: 20, left: 260, right: 520, bottom: 260, width: 260, height: 240 },
          visible: true,
          order: 0,
          label: 'Column 2',
        },
      ],
    });

    const overlay = frame.querySelector('.pb-preview-target-overlay');
    const layerRow = document.querySelector(
      `[data-layer-action="select-module"][data-module-id="${textModule.id}"]`
    );
    const dataTransfer = createDataTransfer();
    layerRow.dispatchEvent(createDragLikeEvent('dragstart', dataTransfer));
    overlay.dispatchEvent(
      createDragLikeEvent('dragover', dataTransfer, { clientX: 300, clientY: 30 })
    );
    overlay.dispatchEvent(createDragLikeEvent('drop', dataTransfer, { clientX: 300, clientY: 30 }));
    await flushAdminUi(6);

    expect(mocks.moveModule).toHaveBeenCalledWith(textModule.id, textSection.id, 1, 0);
    expect(mocks.reorderModules).toHaveBeenCalled();
    expect(document.getElementById('pbEditorTitle')?.textContent).not.toContain('Text Module');
    expect(
      frame.querySelector('.pb-preview-target-overlay')?.classList.contains('is-live-dragging')
    ).toBe(false);
    expect(document.querySelector('.pb-live-canvas-status')?.textContent).toContain(
      'Failed to move module.'
    );
  });

  it('moves a section from Layers using live section target geometry', async () => {
    const selectedPage = getContractFixture('builderPage');
    const [firstSection, secondSection] = selectedPage.sections;
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    frame.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 1280,
      bottom: 900,
      width: 1280,
      height: 900,
    });
    const iframeWindow = attachPreviewIframeWindow();
    const sectionTarget = {
      kind: 'section',
      key: `section:${firstSection.id}`,
      pageId: selectedPage.id,
      sectionId: firstSection.id,
    };
    sendPreviewTargets({
      frame,
      iframeWindow,
      page: selectedPage,
      targets: [
        {
          target: sectionTarget,
          rect: { top: 20, left: 30, right: 530, bottom: 220, width: 500, height: 200 },
          visible: true,
          order: 0,
          label: 'Section 1',
        },
      ],
    });

    const overlay = frame.querySelector('.pb-preview-target-overlay');
    const layerRow = document.querySelector(
      `[data-layer-action="select-section"][data-section-id="${secondSection.id}"]`
    );
    const dataTransfer = createDataTransfer();
    layerRow.dispatchEvent(createDragLikeEvent('dragstart', dataTransfer));
    overlay.dispatchEvent(
      createDragLikeEvent('dragover', dataTransfer, { clientX: 80, clientY: 30 })
    );
    overlay.dispatchEvent(createDragLikeEvent('drop', dataTransfer, { clientX: 80, clientY: 30 }));
    await flushAdminUi(6);

    expect(mocks.reorderSections).toHaveBeenCalledWith(selectedPage.id, [
      secondSection.id,
      firstSection.id,
    ]);
    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Section');
  });

  it('does not report live section move success when section ordering fails', async () => {
    const selectedPage = getContractFixture('builderPage');
    const [firstSection, secondSection] = selectedPage.sections;
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      reorderSectionsResult: false,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    frame.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 1280,
      bottom: 900,
      width: 1280,
      height: 900,
    });
    const iframeWindow = attachPreviewIframeWindow();
    const sectionTarget = {
      kind: 'section',
      key: `section:${firstSection.id}`,
      pageId: selectedPage.id,
      sectionId: firstSection.id,
    };
    sendPreviewTargets({
      frame,
      iframeWindow,
      page: selectedPage,
      targets: [
        {
          target: sectionTarget,
          rect: { top: 20, left: 30, right: 530, bottom: 220, width: 500, height: 200 },
          visible: true,
          order: 0,
          label: 'Section 1',
        },
      ],
    });

    const overlay = frame.querySelector('.pb-preview-target-overlay');
    const layerRow = document.querySelector(
      `[data-layer-action="select-section"][data-section-id="${secondSection.id}"]`
    );
    const dataTransfer = createDataTransfer();
    layerRow.dispatchEvent(createDragLikeEvent('dragstart', dataTransfer));
    overlay.dispatchEvent(
      createDragLikeEvent('dragover', dataTransfer, { clientX: 80, clientY: 30 })
    );
    overlay.dispatchEvent(createDragLikeEvent('drop', dataTransfer, { clientX: 80, clientY: 30 }));
    await flushAdminUi(6);

    expect(mocks.reorderSections).toHaveBeenCalledWith(selectedPage.id, [
      secondSection.id,
      firstSection.id,
    ]);
    expect(document.getElementById('pbEditorTitle')?.textContent).not.toContain('Section');
    expect(
      frame.querySelector('.pb-preview-target-overlay')?.classList.contains('is-live-dragging')
    ).toBe(false);
    expect(document.querySelector('.pb-live-canvas-status')?.textContent).toContain(
      'Failed to reorder section.'
    );
  });

  it('hides the selected module on the current device without mutating global config', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const textSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === textModule.id)
    );
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    const iframeWindow = attachPreviewIframeWindow();
    const target = {
      kind: 'module',
      key: `module:${textModule.id}`,
      pageId: selectedPage.id,
      sectionId: textSection.id,
      columnIndex: textModule.columnIndex,
      moduleId: textModule.id,
      moduleType: textModule.moduleType,
    };
    sendPreviewTargets({
      frame,
      iframeWindow,
      page: selectedPage,
      targets: [
        {
          target,
          rect: { top: 40, left: 30, right: 230, bottom: 140, width: 200, height: 100 },
          visible: true,
          order: 0,
          label: 'Text module',
        },
      ],
    });
    sendPreviewTargetSelect({ frame, iframeWindow, page: selectedPage, target });
    await flushAdminUi(2);

    frame
      .querySelector('[data-preview-target-action="hide-device"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(6);

    expect(mocks.updateModule).toHaveBeenCalledWith(
      textModule.id,
      expect.objectContaining({
        config: expect.objectContaining({
          responsive: { desktop: { hidden: true } },
        }),
      })
    );
    expect(textModule.config.hidden).toBeUndefined();
  });

  it('keeps Duplicate disabled and routes toolbar Delete through the existing confirmation flow', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const textSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === textModule.id)
    );
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      deleteModuleResult: true,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    const iframeWindow = attachPreviewIframeWindow();
    const target = {
      kind: 'module',
      key: `module:${textModule.id}`,
      pageId: selectedPage.id,
      sectionId: textSection.id,
      columnIndex: textModule.columnIndex,
      moduleId: textModule.id,
      moduleType: textModule.moduleType,
    };
    sendPreviewTargets({
      frame,
      iframeWindow,
      page: selectedPage,
      targets: [
        {
          target,
          rect: { top: 40, left: 30, right: 230, bottom: 140, width: 200, height: 100 },
          visible: true,
          order: 0,
          label: 'Text module',
        },
      ],
    });
    sendPreviewTargetSelect({ frame, iframeWindow, page: selectedPage, target });
    await flushAdminUi(2);

    const duplicateButton = frame.querySelector('[data-preview-target-action="duplicate"]');
    expect(duplicateButton?.disabled).toBe(true);
    duplicateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    expect(mocks.deleteModule).not.toHaveBeenCalled();
    expect(mocks.addModule).not.toHaveBeenCalled();
    expect(mocks.updateModule).not.toHaveBeenCalled();

    frame
      .querySelector('[data-preview-target-action="delete"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(6);

    expect(mocks.deleteModule).toHaveBeenCalledWith(textModule.id);
  });

  it('blocks live toolbar structural commands while a module draft is dirty', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const textSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === textModule.id)
    );
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    const iframeWindow = attachPreviewIframeWindow();
    const target = {
      kind: 'module',
      key: `module:${textModule.id}`,
      pageId: selectedPage.id,
      sectionId: textSection.id,
      columnIndex: textModule.columnIndex,
      moduleId: textModule.id,
      moduleType: textModule.moduleType,
    };
    sendPreviewTargets({
      frame,
      iframeWindow,
      page: selectedPage,
      targets: [
        {
          target,
          rect: { top: 40, left: 30, right: 230, bottom: 140, width: 200, height: 100 },
          visible: true,
          order: 0,
          label: 'Text module',
        },
      ],
    });
    sendPreviewTargetSelect({ frame, iframeWindow, page: selectedPage, target });
    await flushAdminUi(2);

    const contentInput = document.querySelector('[data-key="content"]');
    contentInput.value = '<p>Unsaved edit</p>';
    contentInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAdminUi(2);

    frame
      .querySelector('[data-preview-target-action="insert-before"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    expect(document.querySelector('[data-content="blocks"]')?.hidden).toBe(true);

    frame
      .querySelector('[data-preview-target-action="hide-device"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.updateModule).not.toHaveBeenCalled();
    expect(document.querySelector('.pb-editor-footer-status')?.textContent).toContain('unsaved');
  });

  it('ignores stale target geometry and blocks dirty target selection switches', async () => {
    const selectedPage = getContractFixture('builderPage');
    const modules = selectedPage.sections.flatMap((section) => section.modules || []);
    const textModule = modules.find((module) => module.moduleType === 'text');
    const imageModule = modules.find((module) => module.moduleType === 'image');
    const textSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === textModule.id)
    );
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector(`.pb-module[data-module-id="${textModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);
    const contentInput = document.querySelector('[data-key="content"]');
    contentInput.value = '<p>Dirty text</p>';
    contentInput.dispatchEvent(new Event('input', { bubbles: true }));
    enterPreviewMode();

    const frame = getPreviewFrame();
    const iframeWindow = attachPreviewIframeWindow();
    const expected = {
      previewSession: frame.dataset.previewSession,
      seriesId: 'battle-bros',
      pageId: selectedPage.id,
      pageSlug: selectedPage.slug,
    };
    const textTarget = {
      kind: 'module',
      key: `module:${textModule.id}`,
      pageId: selectedPage.id,
      sectionId: textSection.id,
      columnIndex: textModule.columnIndex,
      moduleId: textModule.id,
      moduleType: textModule.moduleType,
    };
    const imageTarget = {
      kind: 'module',
      key: `module:${imageModule.id}`,
      pageId: selectedPage.id,
      sectionId: textSection.id,
      columnIndex: imageModule.columnIndex,
      moduleId: imageModule.id,
      moduleType: imageModule.moduleType,
    };

    dispatchPreviewMessageFromIframe(
      buildPreviewTargetMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.TARGETS,
        {
          sequence: 5,
          targets: [
            {
              target: textTarget,
              rect: { top: 20, left: 20, right: 120, bottom: 80, width: 100, height: 60 },
              visible: true,
              order: 0,
              label: 'Text module',
            },
          ],
        },
        expected
      ),
      iframeWindow
    );
    dispatchPreviewMessageFromIframe(
      buildPreviewTargetMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.TARGETS,
        {
          sequence: 4,
          targets: [
            {
              target: imageTarget,
              rect: { top: 200, left: 20, right: 120, bottom: 280, width: 100, height: 80 },
              visible: true,
              order: 0,
              label: 'Image module',
            },
          ],
        },
        expected
      ),
      iframeWindow
    );
    expect(frame.dataset.targetSequence).toBe('5');
    expect(frame.dataset.targetCount).toBe('1');

    dispatchPreviewMessageFromIframe(
      buildPreviewTargetMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_SELECT,
        { sequence: 5, target: imageTarget },
        expected
      ),
      iframeWindow
    );
    await flushAdminUi(1);

    expect(frame.dataset.selectedTargetKey || '').toBe('');
    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Text Module');
    expect(document.querySelector('[data-editor-status]')?.textContent).toMatch(/unsaved changes/i);
  });

  it('previews dirty module drafts without mutating the saved page snapshot', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector(`.pb-module[data-module-id="${textModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi();

    const contentInput = document.querySelector('[data-key="content"]');
    contentInput.value = '<p>Draft preview text</p>';
    contentInput.dispatchEvent(new Event('input', { bubbles: true }));

    enterPreviewMode();

    expect(getPreviewStatus()?.textContent).toBe('Previewing unsaved working changes');
    expect(getPreviewFrame()?.dataset.previewSource).toBe('working');
    expect(getPreviewIframe()).not.toBeNull();

    enterEditMode();

    expect(
      document
        .querySelector(`.pb-module[data-module-id="${textModule.id}"] .pb-module-preview`)
        ?.textContent?.trim()
    ).toBe('Heroes are back.');
  });

  it('shows working preview status for dirty theme drafts', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector('.pb-editor-tab[data-tab="theme"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const primaryInput = document.querySelector('.pb-theme-color-text[data-key="primary"]');
    primaryInput.value = '#112233';
    primaryInput.dispatchEvent(new Event('input', { bubbles: true }));
    enterPreviewMode();

    expect(getPreviewStatus()?.textContent).toBe('Previewing unsaved working changes');
    expect(getPreviewFrame()?.dataset.previewSource).toBe('working');
  });

  it('posts reset and discarded theme draft snapshots to the reader preview', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector('.pb-editor-tab[data-tab="theme"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    const primaryInput = document.querySelector('.pb-theme-color-text[data-key="primary"]');
    primaryInput.value = '#112233';
    primaryInput.dispatchEvent(new Event('input', { bubbles: true }));
    enterPreviewMode();

    const dirtySnapshot = requestCurrentPreviewSnapshot();
    expect(getPreviewFrame()?.dataset.previewSource).toBe('working');
    expect(dirtySnapshot?.source).toBe('working');
    expect(dirtySnapshot?.page.meta.theme.primary).toBe('#112233');

    enterEditMode();
    document
      .getElementById('pbResetTheme')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);
    enterPreviewMode();

    const resetSnapshot = requestCurrentPreviewSnapshot();
    expect(getPreviewFrame()?.dataset.previewSource).toBe('working');
    expect(resetSnapshot?.source).toBe('working');
    expect(resetSnapshot?.page.meta.theme).toEqual({
      primary: '#00d9ff',
      secondary: '#ff00ea',
      accent: '#ffed00',
      bgDark: '#0a0a12',
      bgPanel: '#1a1a2e',
      text: '#ffffff',
      danger: '#ff3838',
    });
    expect(resetSnapshot?.page.meta.panelBackgrounds).toEqual({});
    expect(resetSnapshot?.page.meta.panelSpacing).toEqual({});

    enterEditMode();
    document
      .getElementById('pbDiscardTheme')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);
    enterPreviewMode();

    const discardedSnapshot = requestCurrentPreviewSnapshot();
    expect(getPreviewFrame()?.dataset.previewSource).toBe('saved');
    expect(discardedSnapshot?.source).toBe('saved');
    expect(discardedSnapshot?.page.meta.theme).toEqual(selectedPage.meta.theme);
    expect(discardedSnapshot?.page.meta.panelBackgrounds).toEqual(
      selectedPage.meta.panelBackgrounds
    );
    expect(discardedSnapshot?.page.meta.panelSpacing).toEqual(selectedPage.meta.panelSpacing);
  });

  it('shows working preview status for dirty header drafts', async () => {
    const selectedPage = getContractFixture('builderPage');
    const originalHeader = JSON.parse(JSON.stringify(selectedPage.meta.header));
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector('[data-action="select-page-header"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const titleInput = document.querySelector('[data-copy-key="title"]');
    titleInput.value = 'Draft Header Title';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    enterPreviewMode();

    expect(getPreviewStatus()?.textContent).toBe('Previewing unsaved working changes');
    expect(getPreviewFrame()?.dataset.previewSource).toBe('working');

    const snapshot = requestCurrentPreviewSnapshot();
    expect(snapshot?.source).toBe('working');
    expect(snapshot?.page.meta.header.copy.title).toBe('Draft Header Title');
    expect(selectedPage.meta.header).toEqual(originalHeader);
  });

  it('shows working preview status and slug metadata for dirty page settings drafts', async () => {
    const selectedPage = getContractFixture('builderPage');
    const originalSlug = selectedPage.slug;
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector('[data-action="select-page-settings"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const slugInput = document.getElementById('pbEditPageSlug');
    slugInput.value = 'draft-reader';
    slugInput.dispatchEvent(new Event('input', { bubbles: true }));
    enterPreviewMode();

    expect(getPreviewStatus()?.textContent).toBe('Previewing unsaved working changes');
    expect(getPreviewFrame()?.dataset.previewSource).toBe('working');
    expect(getPreviewFrame()?.dataset.pageSlug).toBe('draft-reader');

    const snapshot = requestCurrentPreviewSnapshot();
    expect(snapshot?.source).toBe('working');
    expect(snapshot?.page.slug).toBe('draft-reader');
    expect(selectedPage.slug).toBe(originalSlug);
  });

  it('previews dirty section settings drafts', async () => {
    const selectedPage = getContractFixture('builderPage');
    const targetSection = selectedPage.sections.find((section) => section.layout === '1-1');
    const originalSettings = JSON.parse(JSON.stringify(targetSection.settings));
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector(
        `[data-action="toggle-section-settings"][data-section-id="${targetSection.id}"]`
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const columnGapInput = document.querySelector(
      `.pb-section[data-section-id="${targetSection.id}"] [data-setting="columnGap"]`
    );
    columnGapInput.value = '77';
    columnGapInput.dispatchEvent(new Event('change', { bubbles: true }));
    enterPreviewMode();

    expect(getPreviewStatus()?.textContent).toBe('Previewing unsaved working changes');
    expect(getPreviewFrame()?.dataset.previewSource).toBe('working');
    expect(getPreviewIframe()).not.toBeNull();

    const snapshot = requestCurrentPreviewSnapshot();
    const previewSection = snapshot?.page.sections.find(
      (section) => section.id === targetSection.id
    );
    expect(snapshot?.source).toBe('working');
    expect(previewSection?.settings.columnGap).toBe(77);
    expect(targetSection.settings).toEqual(originalSettings);
  });

  it('shows a migration banner in the header editor for a legacy page without meta.header', async () => {
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
      'Header migration needed'
    );
    expect(document.querySelector('.pb-editor-source-notice')?.textContent).toContain(
      'page.meta.header.version = 3'
    );
  });

  it('shows no migration banner for a page that already has a V3 meta.header', async () => {
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

  it('clears the migration banner after saving a legacy page header', async () => {
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
    // After save, the draft is re-initialized from the updated page which now has meta.header v3.
    expect(document.querySelector('.pb-editor-source-notice')).toBeNull();
  });

  it('shows the migration chip on the canvas header surface for a legacy page', async () => {
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
      'Migration needed'
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

  it('canvas preview omits empty header cells instead of reserving space', async () => {
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

    expect(document.querySelector('.pb-page-header-empty-region')).toBeNull();
    expect(document.querySelectorAll('.pb-page-header-region')).toHaveLength(1);
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
    expect(sectionCopies.some((t) => t?.includes('Drag blocks between cells'))).toBe(true);
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

describe('Phase 10 — command, keymap, and draft undo foundation', () => {
  it('shows draft undo and redo controls for module drafts without saving until Save', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const originalContent = textModule.config.content;
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector(`.pb-module[data-module-id="${textModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    let contentInput = document.querySelector('[data-key="content"]');
    const undoButton = document.querySelector('[data-action="undo-current"]');
    const redoButton = document.querySelector('[data-action="redo-current"]');
    expect(undoButton?.disabled).toBe(true);
    expect(redoButton?.disabled).toBe(true);

    contentInput.value = '<p>First undo draft</p>';
    contentInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAdminUi(2);

    expect(document.querySelector('[data-action="undo-current"]')?.disabled).toBe(false);
    expect(document.querySelector('[data-action="redo-current"]')?.disabled).toBe(true);
    expect(mocks.updateModule).not.toHaveBeenCalled();

    document
      .querySelector('[data-action="undo-current"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    contentInput = document.querySelector('[data-key="content"]');
    expect(contentInput.value).toBe(originalContent);
    expect(document.querySelector('[data-action="undo-current"]')?.disabled).toBe(true);
    expect(document.querySelector('[data-action="redo-current"]')?.disabled).toBe(false);

    document
      .querySelector('[data-action="redo-current"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    contentInput = document.querySelector('[data-key="content"]');
    expect(contentInput.value).toBe('<p>First undo draft</p>');
    expect(mocks.updateModule).not.toHaveBeenCalled();
  });

  it('keeps current-device module undo isolated from global and other device scopes', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const globalAlignment = textModule.config.alignment;
    const globalContent = textModule.config.content;
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector(`.pb-module[data-module-id="${textModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    document
      .querySelector('[data-width="mobile"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    let scopeSelect = document.querySelector('[data-responsive-edit-scope]');
    scopeSelect.value = 'device';
    scopeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(1);

    let alignmentSelect = document.querySelector('[data-key="alignment"]');
    expect(document.querySelector('[data-key="content"]')).toBeNull();
    expect(alignmentSelect.value).toBe(globalAlignment);
    alignmentSelect.value = 'right';
    alignmentSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(1);

    expect(document.querySelector('[data-action="undo-current"]')?.disabled).toBe(false);
    document
      .querySelector('[data-action="undo-current"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);
    expect(document.querySelector('[data-key="alignment"]')?.value).toBe(globalAlignment);

    alignmentSelect = document.querySelector('[data-key="alignment"]');
    alignmentSelect.value = 'right';
    alignmentSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(1);
    expect(document.querySelector('[data-action="undo-current"]')?.disabled).toBe(false);

    scopeSelect = document.querySelector('[data-responsive-edit-scope]');
    scopeSelect.value = 'global';
    scopeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(1);

    expect(document.querySelector('[data-action="undo-current"]')?.disabled).toBe(true);
    expect(document.querySelector('[data-key="alignment"]')?.value).toBe(globalAlignment);
    expect(document.querySelector('[data-key="content"]')?.value).toBe(globalContent);

    scopeSelect = document.querySelector('[data-responsive-edit-scope]');
    scopeSelect.value = 'device';
    scopeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(1);

    expect(document.querySelector('[data-key="alignment"]')?.value).toBe('right');
    expect(document.querySelector('[data-action="undo-current"]')?.disabled).toBe(true);

    document
      .querySelector('[data-width="tablet"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    expect(document.querySelector('[data-key="alignment"]')?.value).toBe(globalAlignment);
    expect(document.querySelector('[data-action="undo-current"]')?.disabled).toBe(true);
    expect(textModule.config.alignment).toBe(globalAlignment);
    expect(textModule.config.content).toBe(globalContent);
    expect(mocks.updateModule).not.toHaveBeenCalled();
  });

  it('runs save and undo keymaps through builder commands while preserving text-input typing', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const originalContent = textModule.config.content;
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector(`.pb-module[data-module-id="${textModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    let contentInput = document.querySelector('[data-key="content"]');
    contentInput.value = '<p>Keymap draft</p>';
    contentInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAdminUi(2);

    const suppressedUndo = createKeyboardLikeEvent('z', { ctrlKey: true });
    contentInput.dispatchEvent(suppressedUndo);
    await flushAdminUi(1);
    expect(suppressedUndo.defaultPrevented).toBe(false);
    expect(document.querySelector('[data-key="content"]')?.value).toBe('<p>Keymap draft</p>');

    contentInput.blur();
    const undoEvent = createKeyboardLikeEvent('z', { ctrlKey: true });
    document.dispatchEvent(undoEvent);
    await flushAdminUi(2);

    expect(undoEvent.defaultPrevented).toBe(true);
    contentInput = document.querySelector('[data-key="content"]');
    expect(contentInput.value).toBe(originalContent);

    const redoEvent = createKeyboardLikeEvent('z', { ctrlKey: true, shiftKey: true });
    document.dispatchEvent(redoEvent);
    await flushAdminUi(2);
    expect(redoEvent.defaultPrevented).toBe(true);
    expect(document.querySelector('[data-key="content"]')?.value).toBe('<p>Keymap draft</p>');

    const saveEvent = createKeyboardLikeEvent('s', { ctrlKey: true });
    document.dispatchEvent(saveEvent);
    await flushAdminUi(4);

    expect(saveEvent.defaultPrevented).toBe(true);
    expect(mocks.updateModule).toHaveBeenCalledWith(
      textModule.id,
      expect.objectContaining({
        config: expect.objectContaining({ content: '<p>Keymap draft</p>' }),
      })
    );
  });

  it('keeps module drafts dirty when the keyboard save command fails', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const originalContent = textModule.config.content;
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      updateModuleResult: null,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector(`.pb-module[data-module-id="${textModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    const contentInput = document.querySelector('[data-key="content"]');
    contentInput.value = '<p>Failed save draft</p>';
    contentInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAdminUi(2);
    contentInput.blur();

    const saveEvent = createKeyboardLikeEvent('s', { ctrlKey: true });
    document.dispatchEvent(saveEvent);
    await flushAdminUi(4);

    expect(saveEvent.defaultPrevented).toBe(true);
    expect(mocks.updateModule).toHaveBeenCalledWith(
      textModule.id,
      expect.objectContaining({
        config: expect.objectContaining({ content: '<p>Failed save draft</p>' }),
      })
    );
    expect(textModule.config.content).toBe(originalContent);
    expect(document.querySelector('.pb-editor-footer-status')?.textContent).toContain('unsaved');
    expect(document.querySelector('[data-action="save-current"]')?.disabled).toBe(false);
  });

  it('routes Delete key through the selected-target delete command and confirmation guard', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      deleteModuleResult: true,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector(`.pb-module[data-module-id="${textModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    confirm.mockReturnValueOnce(false);
    const cancelledDelete = createKeyboardLikeEvent('Delete');
    document.dispatchEvent(cancelledDelete);
    await flushAdminUi(2);

    expect(cancelledDelete.defaultPrevented).toBe(true);
    expect(mocks.deleteModule).not.toHaveBeenCalled();

    const acceptedDelete = createKeyboardLikeEvent('Delete');
    document.dispatchEvent(acceptedDelete);
    await flushAdminUi(4);

    expect(acceptedDelete.defaultPrevented).toBe(true);
    expect(mocks.deleteModule).toHaveBeenCalledWith(textModule.id);
  });
});

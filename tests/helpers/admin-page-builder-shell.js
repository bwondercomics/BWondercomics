import { readFileSync } from 'node:fs';

import { expect, vi } from 'vitest';

import {
  BUILDER_PREVIEW_MESSAGE_TYPES,
  BUILDER_PREVIEW_SNAPSHOT_VERSION,
  PREVIEW_VIEWPORTS,
  buildPreviewInlineEditMessage,
  buildPreviewMetricsMessage,
  buildPreviewTargetMessage,
} from '../../shared/page-builder/preview-contract.js';
import { buildContractFixture, getContractFixture } from './contracts.js';
import { flushAdminUi, mountAdminDom, stubAdminGlobals } from './admin-fixture.js';

export function setViewportWidth(width) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
}

export function createDragLikeEvent(type, dataTransfer, init = {}) {
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

export function withReaderModule(page, overrides = {}) {
  return buildContractFixture('builderPage', {
    ...page,
    sections: [
      ...(page.sections || []),
      {
        id: `${page.id}-reader-section`,
        sectionType: 'row',
        layout: '1',
        sortIndex: (page.sections || []).length,
        settings: {},
        modules: [
          {
            id: `${page.id}-reader-module`,
            moduleType: 'reader',
            columnIndex: 0,
            sortIndex: 0,
            config: { source: { mode: 'active-page-series' } },
            ...overrides,
          },
        ],
      },
    ],
  });
}

export function createKeyboardLikeEvent(key, init = {}) {
  return new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
}

export function createDataTransfer() {
  const data = new Map();
  return {
    effectAllowed: '',
    dropEffect: '',
    setData: vi.fn((key, value) => data.set(key, value)),
    getData: vi.fn((key) => data.get(key) || ''),
  };
}

export function readCss(path) {
  return readFileSync(path, 'utf8');
}

export function getCssRule(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'm'));
  return match?.[1] || '';
}

export async function setupPageBuilder({
  fetchPagesResults = [],
  fetchGlobalPagesResults = [[]],
  fetchPageBindingsResult = { bindings: {}, warnings: [] },
  fetchPageResult = null,
  fetchPageSnapshotsResult = [],
  fetchDeletedPageSnapshotsResult = [],
  fetchPageSnapshotResult = null,
  restorePageSnapshotResult = null,
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
  saveModulePlacementsResult = null,
  updatePageBindingsResult = undefined,
  pageBuilderDataError = null,
  pageBuilderRuntimeResult = {
    contractVersion: 1,
    processStartedAt: '2026-07-14T10:00:00+00:00',
    capabilities: [
      'responsive-module-round-trip',
      'responsive-feed-layout',
      'responsive-reader-controls',
      'responsive-public-media-css',
    ],
  },
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
  const fetchPage = vi.fn(async (...args) =>
    typeof fetchPageResult === 'function' ? fetchPageResult(...args) : fetchPageResult
  );
  const fetchPageSnapshots = vi.fn(async (...args) =>
    typeof fetchPageSnapshotsResult === 'function'
      ? fetchPageSnapshotsResult(...args)
      : fetchPageSnapshotsResult
  );
  const fetchDeletedPageSnapshots = vi.fn(async (...args) =>
    typeof fetchDeletedPageSnapshotsResult === 'function'
      ? fetchDeletedPageSnapshotsResult(...args)
      : fetchDeletedPageSnapshotsResult
  );
  const fetchPageSnapshot = vi.fn(async (...args) =>
    typeof fetchPageSnapshotResult === 'function'
      ? fetchPageSnapshotResult(...args)
      : fetchPageSnapshotResult
  );
  const restorePageSnapshot = vi.fn(async (...args) =>
    typeof restorePageSnapshotResult === 'function'
      ? restorePageSnapshotResult(...args)
      : restorePageSnapshotResult
  );
  const fetchPageBuilderRuntime = vi.fn(async () => pageBuilderRuntimeResult);
  const createPage = vi.fn(async () => createPageResult);
  const createScopedPage = vi.fn(async () => createPageResult);
  const deletePage = vi.fn(async () => deletePageResult);
  const reorderPages = vi.fn(async () => reorderPagesResult);
  const reorderScopedPages = vi.fn(async () => reorderPagesResult);
  const fetchPageBindings = vi.fn(async (...args) =>
    typeof fetchPageBindingsResult === 'function'
      ? fetchPageBindingsResult(...args)
      : fetchPageBindingsResult
  );
  const updatePageBindings = vi.fn(async () =>
    updatePageBindingsResult === undefined ? fetchPageBindingsResult : updatePageBindingsResult
  );
  const getLastPageBuilderDataError = vi.fn(() => pageBuilderDataError);
  const updatePage = vi.fn(
    async (_pageId, data) =>
      updatePageResult || {
        ...(fetchPageResult || createPageResult || {}),
        ...data,
      }
  );
  const saveModulePlacements = vi.fn(async () => saveModulePlacementsResult || fetchPageResult);
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

  vi.doMock('../../admin/page-builder/data.js', () => ({
    fetchPages,
    fetchSeriesPages,
    fetchGlobalPages,
    fetchPage,
    fetchPageBuilderRuntime,
    fetchPageSnapshots,
    fetchDeletedPageSnapshots,
    fetchPageSnapshot,
    restorePageSnapshot,
    createPage,
    createScopedPage,
    deletePage,
    reorderPages,
    reorderScopedPages,
    updatePage,
    saveModulePlacements,
    getLastPageBuilderDataError,
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
    vi.doUnmock('../../admin/page-builder/theme-editor.js');
    vi.doUnmock('../../admin/page-builder/module-editor.js');
  } else {
    vi.doMock('../../admin/page-builder/theme-editor.js', () => ({
      renderThemeEditorContent: vi.fn(() => '<div>Theme Editor</div>'),
      bindThemeEditorEvents: vi.fn(),
    }));
    vi.doMock('../../admin/page-builder/module-editor.js', () => ({
      renderModuleEditorContent: vi.fn(() => '<div>Module Editor</div>'),
      bindModuleEditorEvents: vi.fn(),
    }));
  }
  vi.doMock('../../admin/image-picker.js', () => ({
    openImagePicker: vi.fn(),
  }));
  vi.doMock('../../admin/utils.js', () => ({
    readFileAsBase64: vi.fn(async () => 'ZmFrZQ=='),
  }));

  const { createPageBuilder } = await import('../../admin/page-builder.js');
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
      fetchPageBuilderRuntime,
      fetchPageSnapshots,
      fetchDeletedPageSnapshots,
      fetchPageSnapshot,
      restorePageSnapshot,
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
      saveModulePlacements,
      getLastPageBuilderDataError,
      updatePageBindings,
      deleteSection,
      deleteModule,
      hideAllSections,
      setActiveNav,
      onDesignerRouteChange,
    },
  };
}

export async function openBuilderPage(manager) {
  await manager.showPageBuilderSection();
  document
    .querySelector('.pb-page-item')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushAdminUi(3);
}

// Per-column styling now lives in the click-to-edit Column/Panel inspector. Selecting a column in
// the canvas chrome switches the inspector to that column's controls.
export async function selectCanvasColumn(sectionId, columnIndex) {
  document
    .querySelector(`.pb-column[data-section-id="${sectionId}"][data-column-index="${columnIndex}"]`)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushAdminUi(2);
}

export function getInspectorSectionContaining(selector) {
  const target = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!target) return null;
  return (
    Array.from(document.querySelectorAll('.pb-inspector-section')).find((section) =>
      section.contains(target)
    ) || null
  );
}

export function enterPreviewMode() {
  document
    .getElementById('pbViewPreview')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

export function enterChromePreview() {
  document
    .getElementById('pbEnterPreview')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

export function restoreChromePreview() {
  document
    .getElementById('pbRestorePreviewChrome')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

export function enterEditMode() {
  document.getElementById('pbViewEdit')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

export function getPreviewFrame() {
  return document.getElementById('pbCanvas')?.querySelector('.pb-preview-frame');
}

export function getPreviewScaleShell() {
  return document.getElementById('pbCanvas')?.querySelector('.pb-preview-scale-shell');
}

export function getPreviewIframe() {
  return document.getElementById('pbCanvas')?.querySelector('.pb-preview-iframe');
}

export function getPreviewStatus() {
  return document.getElementById('pbCanvas')?.querySelector('.pb-preview-status');
}

export function attachPreviewIframeWindow() {
  const iframe = getPreviewIframe();
  expect(iframe).not.toBeNull();
  const iframeWindow = { postMessage: vi.fn() };
  Object.defineProperty(iframe, 'contentWindow', {
    configurable: true,
    value: iframeWindow,
  });
  return iframeWindow;
}

export function dispatchPreviewMessageFromIframe(message, iframeWindow) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: message,
      origin: window.location.origin,
      source: iframeWindow,
    })
  );
}

export function sendPreviewTargets({ frame, iframeWindow, page, targets, sequence = 3 }) {
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

export function sendPreviewTargetSelect({ frame, iframeWindow, page, target, sequence = 3 }) {
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

export function requestCurrentPreviewSnapshot() {
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

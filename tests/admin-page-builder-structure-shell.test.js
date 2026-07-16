import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BUILDER_PREVIEW_MESSAGE_TYPES,
  BUILDER_PREVIEW_SNAPSHOT_VERSION,
  PREVIEW_VIEWPORTS,
  buildPreviewInlineEditMessage,
  buildPreviewMetricsMessage,
  buildPreviewTargetMessage,
} from '../shared/page-builder/preview-contract.js';
import { buildContractFixture, getContractFixture } from './helpers/contracts.js';
import { flushAdminUi } from './helpers/admin-fixture.js';
import {
  createDataTransfer,
  createDragLikeEvent,
  createKeyboardLikeEvent,
  enterChromePreview,
  enterEditMode,
  enterPreviewMode,
  getCssRule,
  getInspectorSectionContaining,
  getPreviewFrame,
  getPreviewIframe,
  getPreviewScaleShell,
  getPreviewStatus,
  openBuilderPage,
  readCss,
  requestCurrentPreviewSnapshot,
  restoreChromePreview,
  selectCanvasColumn,
  sendPreviewTargetSelect,
  sendPreviewTargets,
  setViewportWidth,
  setupPageBuilder,
  withReaderModule,
  attachPreviewIframeWindow,
  dispatchPreviewMessageFromIframe,
} from './helpers/admin-page-builder-shell.js';

describe('page-builder structural canvas commands', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
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
      right: 1920,
      bottom: 1080,
      width: 1920,
      height: 1080,
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

  it('inserts a module into an existing empty column when dragging a block onto it', async () => {
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
      right: 1920,
      bottom: 1080,
      width: 1920,
      height: 1080,
    });
    const iframeWindow = attachPreviewIframeWindow();
    const columnTarget = {
      kind: 'column',
      key: `column:${textSection.id}:1`,
      pageId: selectedPage.id,
      sectionId: textSection.id,
      columnIndex: 1,
    };
    // The empty column reports the bounded editor min-height (40px) rather than collapsing to zero,
    // so the pointer lands inside it and it becomes a drop candidate.
    sendPreviewTargets({
      frame,
      iframeWindow,
      page: selectedPage,
      targets: [
        {
          target: columnTarget,
          rect: { top: 20, left: 260, right: 520, bottom: 60, width: 260, height: 40 },
          visible: true,
          order: 0,
          label: 'Column 2',
        },
      ],
    });

    const overlay = frame.querySelector('.pb-preview-target-overlay');
    const block = document.querySelector('.pb-module-type[data-module-type="text"]');
    const dataTransfer = createDataTransfer();
    block.dispatchEvent(createDragLikeEvent('dragstart', dataTransfer));
    overlay.dispatchEvent(
      createDragLikeEvent('dragover', dataTransfer, { clientX: 300, clientY: 40 })
    );
    overlay.dispatchEvent(createDragLikeEvent('drop', dataTransfer, { clientX: 300, clientY: 40 }));
    await flushAdminUi(6);

    expect(mocks.addSection).not.toHaveBeenCalled();
    expect(mocks.addModule).toHaveBeenCalledWith(
      textSection.id,
      'text',
      1,
      expect.objectContaining({ content: expect.stringContaining('Enter your text') }),
      null
    );
    expect(mocks.reorderModules).toHaveBeenCalledWith(
      textSection.id,
      1,
      expect.arrayContaining(['new-module-id'])
    );
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
      right: 1920,
      bottom: 1080,
      width: 1920,
      height: 1080,
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

  it('creates a trailing section only through the explicit page-end target on a populated page', async () => {
    const selectedPage = getContractFixture('builderPage');
    const originalSectionIds = selectedPage.sections.map((section) => section.id);
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    frame.dataset.previewScale = '1';
    getPreviewScaleShell().dataset.previewScale = '1';
    frame.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 1920,
      bottom: 1080,
      width: 1920,
      height: 1080,
    });
    const iframeWindow = attachPreviewIframeWindow();
    const pageEndTarget = {
      kind: 'page',
      key: `page-end:${selectedPage.id}`,
      pageId: selectedPage.id,
      surface: 'page-end',
    };
    sendPreviewTargets({
      frame,
      iframeWindow,
      page: selectedPage,
      targets: [
        {
          target: pageEndTarget,
          rect: { top: 900, left: 40, right: 1880, bottom: 940, width: 1840, height: 40 },
          visible: true,
          order: 0,
          label: 'Page end',
        },
      ],
    });

    const overlay = frame.querySelector('.pb-preview-target-overlay');
    const block = document.querySelector('.pb-module-type[data-module-type="text"]');
    const dataTransfer = createDataTransfer();
    block.dispatchEvent(createDragLikeEvent('dragstart', dataTransfer));
    overlay.dispatchEvent(
      createDragLikeEvent('dragover', dataTransfer, { clientX: 120, clientY: 920 })
    );

    const dropGuide = frame.querySelector('.pb-preview-drop-guide--page-end-target');
    expect(dropGuide).not.toBeNull();
    expect(dropGuide?.getAttribute('style')).toContain('height: 40px');

    overlay.dispatchEvent(
      createDragLikeEvent('drop', dataTransfer, { clientX: 120, clientY: 920 })
    );
    await flushAdminUi(6);

    expect(mocks.addSection).toHaveBeenCalledWith(selectedPage.id);
    expect(mocks.reorderSections).toHaveBeenCalledWith(selectedPage.id, [
      ...originalSectionIds,
      'new-section-id',
    ]);
    expect(mocks.addModule).toHaveBeenCalledWith(
      'new-section-id',
      'text',
      0,
      expect.objectContaining({ content: expect.stringContaining('Enter your text') }),
      null
    );
  });

  it('does not execute a cached valid placement when the final drop is in dead space', async () => {
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
    frame.dataset.previewScale = '1';
    getPreviewScaleShell().dataset.previewScale = '1';
    frame.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 1920,
      bottom: 1080,
      width: 1920,
      height: 1080,
    });
    const iframeWindow = attachPreviewIframeWindow();
    const moduleTarget = {
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
          target: moduleTarget,
          rect: { top: 20, left: 20, right: 320, bottom: 120, width: 300, height: 100 },
          visible: true,
          order: 0,
          label: 'Text module',
        },
      ],
    });

    const overlay = frame.querySelector('.pb-preview-target-overlay');
    const block = document.querySelector('.pb-module-type[data-module-type="image"]');
    const dataTransfer = createDataTransfer();
    block.dispatchEvent(createDragLikeEvent('dragstart', dataTransfer));
    overlay.dispatchEvent(
      createDragLikeEvent('dragover', dataTransfer, { clientX: 80, clientY: 40 })
    );
    expect(frame.querySelector('.pb-preview-drop-guide')).not.toBeNull();

    overlay.dispatchEvent(
      createDragLikeEvent('drop', dataTransfer, { clientX: 1200, clientY: 900 })
    );
    await flushAdminUi(4);

    expect(mocks.addSection).not.toHaveBeenCalled();
    expect(mocks.addModule).not.toHaveBeenCalled();
    expect(mocks.moveModule).not.toHaveBeenCalled();
    expect(mocks.reorderSections).not.toHaveBeenCalled();
    expect(mocks.reorderModules).not.toHaveBeenCalled();
    expect(
      frame.querySelector('.pb-preview-target-overlay')?.classList.contains('is-live-dragging')
    ).toBe(false);
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

  it('moves a module from Layers to a scaled live canvas column target', async () => {
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
    frame.dataset.previewScale = '0.5';
    getPreviewScaleShell().dataset.previewScale = '0.5';
    frame.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 960,
      bottom: 540,
      width: 960,
      height: 540,
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
      createDragLikeEvent('dragover', dataTransfer, { clientX: 150, clientY: 15 })
    );
    overlay.dispatchEvent(createDragLikeEvent('drop', dataTransfer, { clientX: 150, clientY: 15 }));
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
      right: 1920,
      bottom: 1080,
      width: 1920,
      height: 1080,
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
      right: 1920,
      bottom: 1080,
      width: 1920,
      height: 1080,
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
      right: 1920,
      bottom: 1080,
      width: 1920,
      height: 1080,
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

  it('warns before hiding the bound reader module on the current device', async () => {
    const selectedPage = withReaderModule(getContractFixture('builderPage'));
    const readerModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'reader');
    const readerSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === readerModule.id)
    );
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      fetchPageBindingsResult: {
        bindings: { reader: { pageId: selectedPage.id, page: selectedPage } },
        warnings: [],
      },
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    const iframeWindow = attachPreviewIframeWindow();
    const target = {
      kind: 'module',
      key: `module:${readerModule.id}`,
      pageId: selectedPage.id,
      sectionId: readerSection.id,
      columnIndex: readerModule.columnIndex,
      moduleId: readerModule.id,
      moduleType: readerModule.moduleType,
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
          label: 'Reader module',
        },
      ],
    });
    sendPreviewTargetSelect({ frame, iframeWindow, page: selectedPage, target });
    await flushAdminUi(2);

    frame
      .querySelector('[data-preview-target-action="hide-device"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(6);

    expect(globalThis.confirm).toHaveBeenCalledWith(
      expect.stringContaining('Publishing and reader binding saves will be blocked')
    );
    expect(mocks.updateModule).toHaveBeenCalledWith(
      readerModule.id,
      expect.objectContaining({
        config: expect.objectContaining({
          responsive: { desktop: { hidden: true } },
        }),
      })
    );
  });

  it('uses advisory copy when hiding the bound reader module on a non-default device', async () => {
    const selectedPage = withReaderModule(getContractFixture('builderPage'));
    const readerModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'reader');
    const readerSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === readerModule.id)
    );
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      fetchPageBindingsResult: {
        bindings: { reader: { pageId: selectedPage.id, page: selectedPage } },
        warnings: [],
      },
    });

    await openBuilderPage(manager);
    enterPreviewMode();
    document
      .getElementById('pbWidthToggles')
      ?.querySelector('[data-width="tablet"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    const frame = getPreviewFrame();
    const iframeWindow = attachPreviewIframeWindow();
    const target = {
      kind: 'module',
      key: `module:${readerModule.id}`,
      pageId: selectedPage.id,
      sectionId: readerSection.id,
      columnIndex: readerModule.columnIndex,
      moduleId: readerModule.id,
      moduleType: readerModule.moduleType,
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
          label: 'Reader module',
        },
      ],
    });
    sendPreviewTargetSelect({ frame, iframeWindow, page: selectedPage, target });
    await flushAdminUi(2);

    frame
      .querySelector('[data-preview-target-action="hide-device"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(6);

    const confirmMessage = globalThis.confirm.mock.calls.at(-1)?.[0] || '';
    expect(confirmMessage).toContain('will be hidden on Tablet');
    expect(confirmMessage).not.toContain('Publishing and reader binding saves will be blocked');
    expect(mocks.updateModule).toHaveBeenCalledWith(
      readerModule.id,
      expect.objectContaining({
        config: expect.objectContaining({
          responsive: { tablet: { hidden: true } },
        }),
      })
    );
  });

  it('routes toolbar Delete through the existing confirmation flow', async () => {
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

    expect(mocks.deleteModule).not.toHaveBeenCalled();

    frame
      .querySelector('[data-preview-target-action="delete"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(6);

    expect(mocks.deleteModule).toHaveBeenCalledWith(textModule.id);
  });

  it('enables Duplicate for a normal module and clones it after the original', async () => {
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
    expect(duplicateButton).not.toBeNull();
    expect(duplicateButton?.disabled).toBe(false);

    duplicateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(4);

    expect(mocks.addModule).toHaveBeenCalledWith(
      textSection.id,
      'text',
      textModule.columnIndex,
      textModule.config
    );
    expect(mocks.reorderModules).toHaveBeenCalled();
    const clonedConfig = mocks.addModule.mock.calls.at(-1)[3];
    expect(clonedConfig).toEqual(textModule.config);
    expect(clonedConfig).not.toBe(textModule.config);
  });

  it('rolls back a created duplicate when ordering fails', async () => {
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
      .querySelector('[data-preview-target-action="duplicate"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(6);

    expect(mocks.deleteModule).toHaveBeenCalledWith('new-module-id');
    expect(document.querySelector('.pb-live-canvas-status')?.textContent).toContain(
      'Failed to duplicate Text module.'
    );
    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Text Module');
  });

  it('reconciles the visible page when duplicate rollback also fails', async () => {
    const selectedPage = getContractFixture('builderPage');
    const textModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'text');
    const textSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === textModule.id)
    );
    const reconciledPage = JSON.parse(JSON.stringify(selectedPage));
    const reconciledSection = reconciledPage.sections.find(
      (section) => section.id === textSection.id
    );
    reconciledSection.modules.push({
      id: 'new-module-id',
      moduleType: 'text',
      columnIndex: textModule.columnIndex,
      sortIndex: 99,
      config: JSON.parse(JSON.stringify(textModule.config)),
    });
    let fetchCount = 0;
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: () => (fetchCount++ === 0 ? selectedPage : reconciledPage),
      reorderModulesResult: false,
      deleteModuleResult: false,
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
      .querySelector('[data-preview-target-action="duplicate"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(8);

    expect(mocks.fetchPage).toHaveBeenCalledTimes(2);
    expect(
      document.querySelector('[data-layer-action="select-module"][data-module-id="new-module-id"]')
    ).not.toBeNull();
    expect(document.querySelector('[data-layer-action="select-module"].active')).toBeNull();
    expect(document.querySelector('.pb-live-canvas-status')?.textContent).toContain(
      'The page was refreshed to show the saved state.'
    );
  });

  it('does not offer Duplicate for the Comic Reader module', async () => {
    const selectedPage = withReaderModule(getContractFixture('builderPage'));
    const readerModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'reader');
    const readerSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === readerModule.id)
    );
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    const iframeWindow = attachPreviewIframeWindow();
    const target = {
      kind: 'module',
      key: `module:${readerModule.id}`,
      pageId: selectedPage.id,
      sectionId: readerSection.id,
      columnIndex: readerModule.columnIndex,
      moduleId: readerModule.id,
      moduleType: 'text',
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
          label: 'Comic Reader module',
        },
      ],
    });
    sendPreviewTargetSelect({ frame, iframeWindow, page: selectedPage, target });
    await flushAdminUi(2);

    expect(frame.querySelector('[data-preview-target-action="duplicate"]')).toBeNull();
    expect(frame.querySelector('[data-preview-target-action="settings"]')).not.toBeNull();
  });

  it('keeps section duplicate unavailable', async () => {
    const selectedPage = getContractFixture('builderPage');
    const section = selectedPage.sections[0];
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    const iframeWindow = attachPreviewIframeWindow();
    const target = {
      kind: 'section',
      key: `section:${section.id}`,
      pageId: selectedPage.id,
      sectionId: section.id,
    };
    sendPreviewTargets({
      frame,
      iframeWindow,
      page: selectedPage,
      targets: [
        {
          target,
          rect: { top: 20, left: 20, right: 420, bottom: 220, width: 400, height: 200 },
          visible: true,
          order: 0,
          label: 'Section',
        },
      ],
    });
    sendPreviewTargetSelect({ frame, iframeWindow, page: selectedPage, target });
    await flushAdminUi(2);

    expect(frame.querySelector('[data-preview-target-action="duplicate"]')).toBeNull();
  });

  it('warns before deleting the bound reader module', async () => {
    const selectedPage = withReaderModule(getContractFixture('builderPage'));
    const readerModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'reader');
    const readerSection = selectedPage.sections.find((section) =>
      (section.modules || []).some((module) => module.id === readerModule.id)
    );
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      fetchPageBindingsResult: {
        bindings: { reader: { pageId: selectedPage.id, page: selectedPage } },
        warnings: [],
      },
      deleteModuleResult: true,
    });

    await openBuilderPage(manager);
    enterPreviewMode();

    const frame = getPreviewFrame();
    const iframeWindow = attachPreviewIframeWindow();
    const target = {
      kind: 'module',
      key: `module:${readerModule.id}`,
      pageId: selectedPage.id,
      sectionId: readerSection.id,
      columnIndex: readerModule.columnIndex,
      moduleId: readerModule.id,
      moduleType: readerModule.moduleType,
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
          label: 'Reader module',
        },
      ],
    });
    sendPreviewTargetSelect({ frame, iframeWindow, page: selectedPage, target });
    await flushAdminUi(2);

    frame
      .querySelector('[data-preview-target-action="delete"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(6);

    expect(globalThis.confirm).toHaveBeenCalledWith(
      expect.stringContaining('Publishing and reader binding saves will be blocked')
    );
    expect(mocks.deleteModule).toHaveBeenCalledWith(readerModule.id);
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
});

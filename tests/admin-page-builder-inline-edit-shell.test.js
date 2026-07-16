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

describe('page-builder inline text editing', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
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
});

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

describe('builder commands, keymaps, and draft undo', () => {
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
    expect(document.querySelector('.pb-editor-footer-status')?.textContent).toContain(
      'Failed to save module.'
    );
    expect(document.querySelector('.pb-editor-footer-status')?.dataset.status).toBe('danger');
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

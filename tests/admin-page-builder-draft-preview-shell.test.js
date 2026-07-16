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

describe('page-builder working draft previews and header migration', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
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
    // The theme reset no longer touches panel meta; the legacy fallback is preserved untouched.
    expect(resetSnapshot?.page.meta.panelBackgrounds).toEqual(selectedPage.meta.panelBackgrounds);
    expect(resetSnapshot?.page.meta.panelSpacing).toEqual(selectedPage.meta.panelSpacing);

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

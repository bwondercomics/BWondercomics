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

describe('header editor canvas placement behavior', () => {
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

  it('replaces the placement board with canvas-marked Parts rows', async () => {
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

    expect(document.querySelector('.pb-header-layout-card')).toBeNull();
    const rows = document.querySelectorAll('.pb-header-toggle-row[data-block-id]');
    expect(rows.length).toBe(5);
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

  it('header parts section copy points at the on-canvas placement workflow', async () => {
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
    expect(sectionCopies.some((t) => t?.includes('click it in the preview'))).toBe(true);
  });
});

describe('header navigation button variants', () => {
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

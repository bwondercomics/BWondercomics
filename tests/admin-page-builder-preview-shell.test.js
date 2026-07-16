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

describe('page-builder responsive preview and chrome', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('persists a normalized v3 page header without changing publication state', async () => {
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
        isPublished: true,
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
    // Placement board retired: block placement is edited on the live canvas instead.
    expect(document.querySelector('.pb-header-region--board')).toBeNull();
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
    expect(initialFrame?.parentElement).toBe(getPreviewScaleShell());
    expect(initialFrame?.style.width).toBe('1920px');
    expect(initialFrame?.style.height).toBe('1080px');
    expect(initialIframe?.style.width).toBe('1920px');
    expect(initialIframe?.style.height).toBe('1080px');
    expect(initialFrame?.dataset.previewScale).toBe('1');
    expect(getPreviewScaleShell()?.dataset.previewScale).toBe('1');
    expect(getPreviewScaleShell()?.style.width).toBe('1920px');
    expect(getPreviewScaleShell()?.style.height).toBe('1080px');

    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 960 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 540 });
    canvas.style.padding = '0';
    window.dispatchEvent(new Event('resize'));
    expect(initialFrame?.dataset.previewScale).toBe('0.5');
    expect(initialFrame?.style.transform).toBe('scale(0.5)');
    expect(getPreviewScaleShell()?.style.width).toBe('960px');
    expect(getPreviewScaleShell()?.style.height).toBe('540px');

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
    expect(mobileSnapshot?.options.viewport).toMatchObject({
      id: 'mobile',
      width: 375,
    });

    // Back to desktop
    widthToggles
      ?.querySelector('[data-width="desktop"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(canvas?.querySelector('.pb-preview-frame')?.dataset.width).toBe('desktop');
    expect(canvas?.querySelector('.pb-preview-frame')?.dataset.deviceId).toBe('desktop');
    expect(getPreviewFrame()?.style.width).toBe('1920px');
    expect(getPreviewFrame()?.style.height).toBe('1080px');

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

  it('round-trips Spacer, Feed, and Reader overrides across Tablet and Phone saves', async () => {
    const selectedPage = getContractFixture('builderPage');
    const section = selectedPage.sections.find((item) => item.layout === '1-1');
    const spacerModule = section.modules.find((module) => module.moduleType === 'spacer');
    const feedModule = section.modules.find((module) => module.moduleType === 'feed');
    const readerModule = {
      ...getContractFixture('builderModules').reader,
      id: 'responsive-reader-module',
      columnIndex: 0,
      sortIndex: 80,
      config: {
        ...getContractFixture('builderModules').reader.config,
        controls: {
          ...getContractFixture('builderModules').reader.config.controls,
          style: { defaults: { padding: 10 } },
        },
      },
    };
    section.modules.push(readerModule);
    const globalSpacerHeight = spacerModule.config.height;
    const globalFeedLayout = { widthMode: 'percent', width: 100, align: 'start' };
    feedModule.config.layout = globalFeedLayout;

    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });
    await openBuilderPage(manager);
    document
      .querySelector('.pb-sidebar-tab[data-tab="layers"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    const selectModule = async (moduleId) => {
      document
        .querySelector(`.pb-layer-item--module[data-module-id="${moduleId}"]`)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushAdminUi(1);
    };
    const ensureDeviceScope = async () => {
      const scope = document.querySelector('[data-responsive-edit-scope]');
      if (scope.value !== 'device') {
        scope.value = 'device';
        scope.dispatchEvent(new Event('change', { bubbles: true }));
        await flushAdminUi(1);
      }
    };
    const saveModule = async () => {
      document
        .getElementById('pbSaveModule')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushAdminUi(2);
    };

    for (const scenario of [
      {
        device: 'tablet',
        spacerHeight: 180,
        feedWidth: 70,
        feedAlign: 'center',
        readerPadding: 22,
      },
      {
        device: 'mobile',
        spacerHeight: 96,
        feedWidth: 90,
        feedAlign: 'end',
        readerPadding: 30,
      },
    ]) {
      document
        .querySelector(`[data-width="${scenario.device}"]`)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushAdminUi(1);

      await selectModule(spacerModule.id);
      await ensureDeviceScope();
      const spacerHeight = document.querySelector('[data-key="height"]');
      spacerHeight.value = String(scenario.spacerHeight);
      spacerHeight.dispatchEvent(new Event('input', { bubbles: true }));
      await saveModule();

      await selectModule(feedModule.id);
      await ensureDeviceScope();
      const widthMode = document.querySelector('[data-layout-key="widthMode"]');
      const width = document.querySelector('[data-layout-key="width"]');
      const align = document.querySelector('[data-layout-key="align"]');
      widthMode.value = 'percent';
      widthMode.dispatchEvent(new Event('change', { bubbles: true }));
      width.value = String(scenario.feedWidth);
      width.dispatchEvent(new Event('input', { bubbles: true }));
      align.value = scenario.feedAlign;
      align.dispatchEvent(new Event('change', { bubbles: true }));
      await saveModule();

      await selectModule(readerModule.id);
      await ensureDeviceScope();
      const readerPadding = document.querySelector(
        '[data-reader-key="controls.style.defaults.padding"]'
      );
      readerPadding.value = String(scenario.readerPadding);
      readerPadding.dispatchEvent(new Event('input', { bubbles: true }));
      await saveModule();
    }

    expect(spacerModule.config.height).toBe(globalSpacerHeight);
    expect(spacerModule.config.responsive).toEqual({
      tablet: { height: 180 },
      mobile: { height: 96 },
    });
    expect(feedModule.config.layout).toEqual(globalFeedLayout);
    expect(feedModule.config.responsive).toEqual({
      tablet: { layout: { widthMode: 'percent', width: 70, align: 'center' } },
      mobile: { layout: { widthMode: 'percent', width: 90, align: 'end' } },
    });
    expect(readerModule.config.controls.style.defaults.padding).toBe(10);
    expect(readerModule.config.responsive).toEqual({
      tablet: { controls: { style: { defaults: { padding: 22 } } } },
      mobile: { controls: { style: { defaults: { padding: 30 } } } },
    });
    expect(mocks.updateModule).toHaveBeenCalledTimes(6);

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);
    document
      .querySelector('.pb-sidebar-tab[data-tab="layers"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);
    document
      .querySelector('[data-width="mobile"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await selectModule(readerModule.id);
    await ensureDeviceScope();
    expect(
      document.querySelector('[data-reader-key="controls.style.defaults.padding"]')?.value
    ).toBe('30');
  });

  it('keeps a responsive draft dirty when the API drops its device branch', async () => {
    const selectedPage = getContractFixture('builderPage');
    const spacerModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'spacer');
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
      updateModuleResult: (moduleId, data) => ({
        id: moduleId,
        config: { ...data.config, responsive: undefined },
      }),
    });

    await openBuilderPage(manager);
    document
      .querySelector(`.pb-module[data-module-id="${spacerModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);
    document
      .querySelector('[data-width="mobile"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const scope = document.querySelector('[data-responsive-edit-scope]');
    scope.value = 'device';
    scope.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(1);
    const height = document.querySelector('[data-key="height"]');
    height.value = '96';
    height.dispatchEvent(new Event('input', { bubbles: true }));

    document
      .getElementById('pbSaveModule')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    expect(mocks.updateModule).toHaveBeenCalledOnce();
    expect(spacerModule.config.responsive).toBeUndefined();
    expect(document.querySelector('.pb-editor-footer-status')?.textContent).toContain(
      'dropped responsive module settings'
    );
    expect(document.getElementById('pbSaveModule')?.disabled).toBe(false);
    expect(document.querySelector('[data-key="height"]')?.value).toBe('96');
  });

  it('blocks module saves when the loaded API contract is incompatible', async () => {
    const selectedPage = getContractFixture('builderPage');
    const spacerModule = selectedPage.sections
      .flatMap((section) => section.modules || [])
      .find((module) => module.moduleType === 'spacer');
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
      pageBuilderRuntimeResult: null,
    });

    await openBuilderPage(manager);
    document
      .querySelector(`.pb-module[data-module-id="${spacerModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);
    const height = document.querySelector('[data-key="height"]');
    height.value = '120';
    height.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.querySelector('[data-builder-runtime-warning]')?.textContent).toContain(
      'Builder API restart required'
    );
    expect(document.getElementById('pbSaveModule')?.disabled).toBe(true);
    expect(mocks.updateModule).not.toHaveBeenCalled();
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
    expect(getPreviewFrame()?.dataset.viewportWidth).toBe('1920');
    expect(getPreviewFrame()?.dataset.viewportHeight).toBe('1080');
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

  it('keeps popup arrow moves draft-only until Save and restores them on Discard', async () => {
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

    const selectTextTarget = async () => {
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
      const expected = {
        previewSession: frame.dataset.previewSession,
        seriesId: 'battle-bros',
        pageId: selectedPage.id,
        pageSlug: selectedPage.slug,
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
      dispatchPreviewMessageFromIframe(
        buildPreviewTargetMessage(
          BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_SELECT,
          { sequence: 3, target },
          expected
        ),
        iframeWindow
      );
      await flushAdminUi(2);
      return getPreviewFrame();
    };

    let frame = await selectTextTarget();
    frame
      .querySelector('[data-preview-target-action="move-down"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.saveModulePlacements).not.toHaveBeenCalled();
    expect(document.querySelector('[data-editor-status]')?.textContent).toContain(
      'Module moves have unsaved changes.'
    );
    document
      .querySelector('[data-action="discard-current"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);
    expect(mocks.saveModulePlacements).not.toHaveBeenCalled();

    frame = await selectTextTarget();
    frame
      .querySelector('[data-preview-target-action="move-down"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);
    document
      .querySelector('[data-action="save-current"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.saveModulePlacements).toHaveBeenCalledWith(
      selectedPage.id,
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: textModule.id,
          sectionId: textSection.id,
          sortIndex: 1,
        }),
      ])
    );
  });
});

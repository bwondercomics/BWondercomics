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

  it('resets open style option groups when switching selected modules', async () => {
    const selectedPage = getContractFixture('builderPage');
    const feedModule = selectedPage.sections[1].modules.find(
      (module) => module.moduleType === 'feed'
    );
    const buttonsModule = selectedPage.sections[1].modules.find(
      (module) => module.moduleType === 'buttons'
    );
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);

    document
      .querySelector(`.pb-module[data-module-id="${feedModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);
    document
      .querySelector('.pb-sidebar-tab[data-tab="styles"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    const feedStyleSection = getInspectorSectionContaining('[data-style-key="headingBgColor"]');
    expect(feedStyleSection).not.toBeNull();
    feedStyleSection.open = true;

    document
      .querySelector(`.pb-module[data-module-id="${buttonsModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);
    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Buttons Module');

    document
      .querySelector('.pb-sidebar-tab[data-tab="styles"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Buttons Styles');
    expect(document.querySelector('.pb-inspector-section[open]')).toBeNull();
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
    const sidebarContent = document.querySelector('.pb-sidebar-content[data-content="inspector"]');
    expect(content).not.toBeNull();
    expect(sidebarContent).not.toBeNull();

    const destinationTypeSelect = document.querySelector(
      '.pb-header-nav-input[data-item-key="kind"]'
    );
    expect(destinationTypeSelect).not.toBeNull();
    const navSection = getInspectorSectionContaining(destinationTypeSelect);
    expect(navSection).not.toBeNull();
    navSection.open = true;
    content.scrollTop = 420;
    sidebarContent.scrollTop = 315;

    destinationTypeSelect.value = 'url';
    destinationTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);

    const nextContent = document.querySelector('.pb-editor-content');
    const nextNavSection = getInspectorSectionContaining(
      '.pb-header-nav-input[data-item-key="url"]'
    );
    expect(nextContent).not.toBe(content);
    expect(nextNavSection?.open).toBe(true);
    expect(nextContent?.scrollTop).toBe(420);
    expect(document.querySelector('.pb-sidebar-content[data-content="inspector"]')?.scrollTop).toBe(
      315
    );
    expect(document.querySelector('.pb-header-nav-input[data-item-key="url"]')).not.toBeNull();
  });

  it('keeps the unified side panel on one inspector scroll without clipping open categories', () => {
    const inspectorCss = readCss('admin/css/page-builder/inspector.css');
    const layoutCss = readCss('admin/css/page-builder/layout.css');
    const canvasCss = readCss('admin/css/page-builder/canvas.css');
    const editorContentRule = getCssRule(inspectorCss, '.pb-editor-content');
    const sectionRule = getCssRule(inspectorCss, '.pb-inspector-section');
    const sectionBodyRule = getCssRule(inspectorCss, '.pb-inspector-section-body');
    const scaleShellRule = getCssRule(canvasCss, '.pb-preview-scale-shell');
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
    expect(layoutCss).toContain(
      ".page-builder-layout[data-canvas-mode='structure'] .pb-preview-scale-shell"
    );
    expect(layoutCss).toContain('.pb-preview-restore');
    expect(scaleShellRule).toContain('position: relative');
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
    const seriesPage = withReaderModule(getContractFixture('builderPage'));
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
      fetchPageResult: seriesPage,
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

  it('does not bind a series page without a reader module', async () => {
    const seriesPage = getContractFixture('builderPage');
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[seriesPage]],
      fetchPageResult: seriesPage,
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
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector('.pb-page-action.reader')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    expect(mocks.updatePageBindings).not.toHaveBeenCalled();
    expect(document.getElementById('pbPageList')?.textContent).toContain(
      'must contain one Comic Reader module'
    );
  });

  it('shows backend reader-binding validation failures in the editor and page list', async () => {
    const seriesPage = withReaderModule(getContractFixture('builderPage'));
    const backendWarning = {
      role: 'reader',
      code: 'reader_module_wrong_source',
      message: "The bound reader page's Comic Reader module must use the active page series.",
    };
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[seriesPage]],
      fetchPageResult: seriesPage,
      fetchPageBindingsResult: {
        seriesId: 'battle-bros',
        bindings: {},
        warnings: [],
      },
      updatePageBindingsResult: null,
      pageBuilderDataError: {
        message: backendWarning.message,
        code: backendWarning.code,
        warnings: [backendWarning],
      },
    });

    await manager.showPageBuilderSection();

    document
      .querySelector('.pb-page-action.reader')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    expect(mocks.updatePageBindings).toHaveBeenCalledWith('battle-bros', {
      reader: seriesPage.id,
    });
    expect(mocks.getLastPageBuilderDataError).toHaveBeenCalled();
    expect(document.getElementById('pbPageList')?.textContent).toContain(
      'must use the active page series'
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
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bindModuleEditorEvents,
  renderModuleEditorContent,
} from '../admin/page-builder/module-editor.js';
import { renderThemeEditorContent } from '../admin/page-builder/theme-editor.js';
import {
  initPreviewEmailForms,
  renderPreviewModule,
  renderPreviewPage,
} from '../admin/page-builder/preview-renderers.js';
import { buildContractFixture, getContractFixture } from './helpers/contracts.js';

describe('admin page-builder editor and preview renderers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders current feed and email-signup editor controls', () => {
    const modules = getContractFixture('builderModules');
    const currentPage = {
      sections: [
        {
          id: 'section-1',
          modules: [modules.feed, modules['email-signup']],
        },
      ],
    };

    const feedHtml = renderModuleEditorContent({
      currentPage,
      selectedModuleId: modules.feed.id,
    });
    const emailHtml = renderModuleEditorContent({
      currentPage,
      selectedModuleId: modules['email-signup'].id,
    });

    const feedWrapper = document.createElement('div');
    feedWrapper.innerHTML = feedHtml;
    const emailWrapper = document.createElement('div');
    emailWrapper.innerHTML = emailHtml;

    expect(feedHtml).toContain('Feed Copy');
    expect(feedHtml).toContain('Advanced');
    expect(emailHtml).toContain('Visual Styling');
    expect(feedWrapper.querySelector('[data-key="heading"]')?.getAttribute('value')).toBe(
      'BWC FEED'
    );
    expect(
      feedWrapper.querySelector('[data-style-key="headingBgColor"]')?.getAttribute('value')
    ).toBe('#ffed00');
    expect(feedWrapper.querySelectorAll('.pb-inspector-section').length).toBeGreaterThanOrEqual(4);
    expect(feedWrapper.querySelector('.pb-inspector-section[open]')).toBeNull();
    expect(emailWrapper.querySelector('[data-key="heading"]')?.getAttribute('value')).toBe(
      'Join the List'
    );
    expect(
      emailWrapper.querySelector('[data-style-key="buttonColor"]')?.getAttribute('value')
    ).toBe('#00d9ff');
  });

  it('renders grouped theme sections for presets, palette, and panel controls', () => {
    const themeHtml = renderThemeEditorContent({
      meta: {
        theme: { primary: '#112233' },
        panelBackgrounds: { left: { path: 'assets/uploads/left.png', opacity: 0.4 } },
        panelSpacing: { left: 20 },
      },
    });
    const wrapper = document.createElement('div');
    wrapper.innerHTML = themeHtml;

    expect(themeHtml).toContain('Presets');
    expect(themeHtml).toContain('Color System');
    expect(themeHtml).toContain('Panel Backgrounds');
    expect(wrapper.textContent).toContain('Panel Spacing & Empty States');
    expect(wrapper.querySelectorAll('.pb-inspector-section')).toHaveLength(4);
    expect(wrapper.querySelector('.pb-inspector-section[open]')).toBeNull();
    expect(
      wrapper.querySelector('.pb-theme-color-text[data-key="primary"]')?.getAttribute('value')
    ).toBe('#112233');
    expect(
      wrapper.querySelector('.pb-panel-bg-path[data-panel="left"]')?.getAttribute('value')
    ).toBe('assets/uploads/left.png');
    expect(wrapper.querySelector('.pb-panel-gap[data-panel="left"]')?.getAttribute('value')).toBe(
      '20'
    );
  });

  it('binds module editor draft flows for generic builder modules', async () => {
    const feedModule = getContractFixture('builderModules').feed;
    const currentPage = {
      sections: [
        {
          id: 'section-1',
          modules: [feedModule],
        },
      ],
    };
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderModuleEditorContent({
      currentPage,
      selectedModuleId: feedModule.id,
      draftConfig: feedModule.config,
    });
    document.body.innerHTML = '';
    document.body.appendChild(wrapper);
    const setDraftConfig = vi.fn();
    const markDirty = vi.fn();
    const renderEditorPanel = vi.fn();

    bindModuleEditorEvents({
      el: { pbModuleEditor: wrapper },
      currentPage,
      selectedModuleId: feedModule.id,
      draftConfig: feedModule.config,
      setDraftConfig,
      markDirty,
      renderEditorPanel,
      openImagePicker: vi.fn(),
      fetchAssets: vi.fn(async () => []),
      uploadAssetFile: vi.fn(async () => ({})),
    });

    const headingInput = wrapper.querySelector('[data-key="heading"]');
    const limitInput = wrapper.querySelector('[data-key="limit"]');
    const mediaToggle = wrapper.querySelector('[data-key="showMediaButton"]');
    const buttonColor = wrapper.querySelector('[data-style-key="buttonBgColor"]');

    headingInput.value = 'Updated Feed';
    headingInput.dispatchEvent(new Event('input', { bubbles: true }));
    limitInput.value = '8';
    limitInput.dispatchEvent(new Event('change', { bubbles: true }));
    mediaToggle.checked = false;
    mediaToggle.dispatchEvent(new Event('change', { bubbles: true }));
    buttonColor.value = '#112233';
    buttonColor.dispatchEvent(new Event('input', { bubbles: true }));

    expect(setDraftConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        heading: 'Updated Feed',
        limit: 8,
        showMediaButton: false,
        style: expect.objectContaining({
          buttonBgColor: '#112233',
        }),
      })
    );
    expect(markDirty).toHaveBeenCalledWith('module');
    expect(renderEditorPanel).not.toHaveBeenCalled();
  });

  it('renders and binds CMS source controls by page scope', () => {
    const modules = getContractFixture('builderModules');
    const currentPage = {
      scope: 'global',
      seriesId: null,
      sections: [
        {
          id: 'section-1',
          modules: [
            {
              ...modules.reader,
              config: { showPanels: true, showComments: true },
            },
            modules.feed,
            modules['media-gallery'],
          ],
        },
      ],
    };
    const pages = [
      buildContractFixture('builderPage', {
        id: 'series-page-1',
        seriesId: 'battle-bros',
        scope: 'series',
      }),
      buildContractFixture('builderPage', {
        id: 'series-page-2',
        seriesId: 'other-series',
        scope: 'series',
      }),
    ];

    const readerWrapper = document.createElement('div');
    readerWrapper.innerHTML = renderModuleEditorContent({
      currentPage,
      selectedModuleId: modules.reader.id,
      draftConfig: { showPanels: true, showComments: true },
      pages,
    });
    const sourceMode = readerWrapper.querySelector('[data-source-key="mode"]');
    const sourceSeries = readerWrapper.querySelector('[data-source-key="seriesId"]');
    expect(sourceMode?.value).toBe('specific-series');
    expect([...sourceMode.querySelectorAll('option')].map((option) => option.value)).toEqual([
      'specific-series',
    ]);
    expect([...sourceSeries.querySelectorAll('option')].map((option) => option.value)).toEqual([
      'battle-bros',
      'other-series',
    ]);

    const setDraftConfig = vi.fn();
    const markDirty = vi.fn();
    bindModuleEditorEvents({
      el: { pbModuleEditor: readerWrapper },
      currentPage,
      selectedModuleId: modules.reader.id,
      draftConfig: { showPanels: true, showComments: true },
      setDraftConfig,
      markDirty,
      renderEditorPanel: vi.fn(),
      pages,
      openImagePicker: vi.fn(),
      fetchAssets: vi.fn(async () => []),
      uploadAssetFile: vi.fn(async () => ({})),
    });
    sourceSeries.value = 'other-series';
    sourceSeries.dispatchEvent(new Event('change', { bubbles: true }));
    expect(setDraftConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        source: {
          mode: 'specific-series',
          seriesId: 'other-series',
        },
      })
    );
    expect(markDirty).toHaveBeenCalledWith('module');

    const seriesPage = {
      scope: 'series',
      seriesId: 'battle-bros',
      sections: [
        {
          id: 'section-1',
          modules: [
            {
              ...modules.reader,
              config: {
                showPanels: true,
                showComments: true,
                source: { mode: 'specific-series', seriesId: 'other-series' },
              },
            },
          ],
        },
      ],
    };
    const seriesReaderWrapper = document.createElement('div');
    seriesReaderWrapper.innerHTML = renderModuleEditorContent({
      currentPage: seriesPage,
      selectedModuleId: modules.reader.id,
      draftConfig: seriesPage.sections[0].modules[0].config,
      pages,
    });
    const seriesSourceMode = seriesReaderWrapper.querySelector('[data-source-key="mode"]');
    expect(seriesSourceMode?.value).toBe('active-page-series');
    expect([...seriesSourceMode.querySelectorAll('option')].map((option) => option.value)).toEqual([
      'active-page-series',
    ]);
    expect(seriesReaderWrapper.querySelector('[data-source-key="seriesId"]')).toBeNull();

    const setSeriesDraftConfig = vi.fn();
    bindModuleEditorEvents({
      el: { pbModuleEditor: seriesReaderWrapper },
      currentPage: seriesPage,
      selectedModuleId: modules.reader.id,
      draftConfig: seriesPage.sections[0].modules[0].config,
      setDraftConfig: setSeriesDraftConfig,
      markDirty: vi.fn(),
      renderEditorPanel: vi.fn(),
      pages,
      openImagePicker: vi.fn(),
      fetchAssets: vi.fn(async () => []),
      uploadAssetFile: vi.fn(async () => ({})),
    });
    const showPanels = seriesReaderWrapper.querySelector('[data-key="showPanels"]');
    showPanels.checked = false;
    showPanels.dispatchEvent(new Event('change', { bubbles: true }));
    expect(setSeriesDraftConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        showPanels: false,
        source: { mode: 'active-page-series' },
      })
    );

    const feedWrapper = document.createElement('div');
    feedWrapper.innerHTML = renderModuleEditorContent({
      currentPage,
      selectedModuleId: modules.feed.id,
      pages,
    });
    const mediaWrapper = document.createElement('div');
    mediaWrapper.innerHTML = renderModuleEditorContent({
      currentPage,
      selectedModuleId: modules['media-gallery'].id,
      pages,
    });
    expect(feedWrapper.querySelector('[data-source-key="mode"]')?.value).toBe('site');
    expect(mediaWrapper.querySelector('[data-source-key="mode"]')?.value).toBe('site');
    expect(mediaWrapper.querySelector('[data-source-key="seriesId"]')).toBeNull();
    expect(mediaWrapper.textContent).toContain('Media Gallery Settings');
  });

  it('renders structured buttons controls and normalizes builder-page link targets', async () => {
    const buttonsModule = getContractFixture('builderModules').buttons;
    const pages = [getContractFixture('builderPage'), getContractFixture('builderPageDraft')];
    const currentPage = {
      sections: [
        {
          id: 'section-1',
          modules: [buttonsModule],
        },
      ],
    };
    const draftConfig = {
      buttons: [
        {
          text: 'About',
          style: 'primary',
          link: {
            kind: 'builder-page',
            pageSlug: 'about',
          },
        },
      ],
    };
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderModuleEditorContent({
      currentPage,
      selectedModuleId: buttonsModule.id,
      draftConfig,
      pages,
    });
    document.body.innerHTML = '';
    document.body.appendChild(wrapper);

    const setDraftConfig = vi.fn();
    const markDirty = vi.fn();
    const renderEditorPanel = vi.fn();

    bindModuleEditorEvents({
      el: { pbModuleEditor: wrapper },
      currentPage,
      selectedModuleId: buttonsModule.id,
      draftConfig,
      setDraftConfig,
      markDirty,
      renderEditorPanel,
      pages,
      openImagePicker: vi.fn(),
      fetchAssets: vi.fn(async () => []),
      uploadAssetFile: vi.fn(async () => ({})),
    });

    expect(wrapper.textContent).toContain('Buttons');
    expect(wrapper.querySelector('[data-item-key="kind"]')?.getAttribute('value')).toBeNull();

    const pageSelect = wrapper.querySelector('[data-item-key="pageSlug"]');
    pageSelect.value = 'reader';
    pageSelect.dispatchEvent(new Event('change', { bubbles: true }));

    expect(setDraftConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        buttons: [
          expect.objectContaining({
            link: expect.objectContaining({
              kind: 'builder-page',
              pageSlug: 'reader',
            }),
          }),
        ],
      })
    );
    expect(markDirty).toHaveBeenCalledWith('module');
  });

  it('renders high-value preview modules and preview-only email forms', () => {
    const modules = getContractFixture('builderModules');
    const previewPage = getContractFixture('builderPage');

    const feed = renderPreviewModule(modules.feed);
    const promo = renderPreviewModule(modules.promo);
    const reader = renderPreviewModule(modules.reader);
    const page = renderPreviewPage(previewPage);

    expect(feed).toContain('pb-feed-module');
    expect(promo).toContain('pb-promo-slide');
    expect(reader).toContain('Reader Component');
    expect(page).toContain('--pb-column-gap: 24px;');

    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderPreviewModule(modules['email-signup']);
    const buttonPreview = document.createElement('div');
    buttonPreview.innerHTML = renderPreviewModule({
      ...modules.buttons,
      config: {
        buttons: [
          {
            text: 'About',
            style: 'primary',
            link: {
              kind: 'builder-page',
              pageSlug: 'about',
            },
          },
        ],
      },
    });
    initPreviewEmailForms(wrapper);
    wrapper
      .querySelector('[data-email-signup]')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(wrapper.querySelector('.pb-email-status')?.textContent).toContain('Preview mode');
    expect(buttonPreview.querySelector('.pb-btn')?.getAttribute('href')).toContain(
      'index.html?series=battle-bros&page=about'
    );
  });

  it('sanitizes dangerous preview html and urls', () => {
    const text = document.createElement('div');
    text.innerHTML = renderPreviewModule({
      moduleType: 'text',
      config: {
        content:
          '<p onclick="evil()">Preview <strong>copy</strong><script>alert(1)</script><a href="javascript:alert(2)">bad</a></p>',
      },
    });
    const html = document.createElement('div');
    html.innerHTML = renderPreviewModule({
      moduleType: 'html',
      config: {
        code: '<div onclick="evil()"><script>alert(1)</script><section class="safe" data-note="ok">Safe</section></div>',
      },
    });
    const social = document.createElement('div');
    social.innerHTML = renderPreviewModule({
      moduleType: 'social',
      config: {
        buttons: [{ text: 'Unsafe', url: 'javascript:alert(3)' }],
      },
    });

    expect(text.innerHTML).not.toContain('<script');
    expect(text.innerHTML).not.toContain('onclick');
    expect(text.innerHTML).not.toContain('javascript:');
    expect(text.querySelector('.pb-text strong')?.textContent).toBe('copy');
    expect(html.innerHTML).not.toContain('<script');
    expect(html.innerHTML).not.toContain('onclick');
    expect(html.querySelector('.safe')?.getAttribute('data-note')).toBe('ok');
    expect(social.querySelector('.pb-social-btn')?.getAttribute('href')).toBe('#');
  });

  it('renders structured editor controls for gallery, video, divider, and entry-gallery', () => {
    const modules = getContractFixture('builderModules');
    const currentPage = {
      sections: [
        {
          id: 'section-1',
          modules: [modules.gallery, modules.video, modules.divider, modules['entry-gallery']],
        },
      ],
    };

    const galleryHtml = renderModuleEditorContent({
      currentPage,
      selectedModuleId: modules.gallery.id,
    });
    const videoHtml = renderModuleEditorContent({
      currentPage,
      selectedModuleId: modules.video.id,
    });
    const dividerHtml = renderModuleEditorContent({
      currentPage,
      selectedModuleId: modules.divider.id,
    });
    const entryGalleryHtml = renderModuleEditorContent({
      currentPage,
      selectedModuleId: modules['entry-gallery'].id,
    });

    // Structured controls render correctly
    expect(galleryHtml).toContain('Gallery Layout');
    expect(galleryHtml).toContain('Images');
    expect(videoHtml).toContain('Video Link');
    expect(dividerHtml).toContain('Divider Styling');
    expect(entryGalleryHtml).toContain('Entry Gallery Settings');

    // Fully-structured modules no longer expose the generic raw JSON Advanced card
    expect(galleryHtml).not.toContain('Raw Config (JSON)');
    expect(videoHtml).not.toContain('Raw Config (JSON)');
    expect(dividerHtml).not.toContain('Raw Config (JSON)');
    expect(entryGalleryHtml).not.toContain('Raw Config (JSON)');
  });

  it('html uses its dedicated code editor; feed alone retains the generic raw Advanced card', () => {
    const modules = getContractFixture('builderModules');
    const currentPage = {
      sections: [
        {
          id: 'section-1',
          modules: [modules.html, modules.feed, modules.promo, modules.social, modules.buttons],
        },
      ],
    };

    const htmlHtml = renderModuleEditorContent({
      currentPage,
      selectedModuleId: modules.html.id,
    });
    const feedHtml = renderModuleEditorContent({
      currentPage,
      selectedModuleId: modules.feed.id,
    });
    const promoHtml = renderModuleEditorContent({
      currentPage,
      selectedModuleId: modules.promo.id,
    });
    const socialHtml = renderModuleEditorContent({
      currentPage,
      selectedModuleId: modules.social.id,
    });
    const buttonsHtml = renderModuleEditorContent({
      currentPage,
      selectedModuleId: modules.buttons.id,
    });

    // html exposes its explicit code textarea, not the generic raw accordion
    expect(htmlHtml).toContain('Custom HTML');
    expect(htmlHtml).toContain('data-key="code"');
    expect(htmlHtml).not.toContain('Raw Config (JSON)');

    // feed still has an Advanced raw card because its editor coverage is partial
    expect(feedHtml).toContain('Raw Config (JSON)');
    expect(feedHtml).toContain('Advanced');

    // Dedicated binders must not advertise a generic raw fallback they do not save
    expect(promoHtml).not.toContain('Raw Config (JSON)');
    expect(socialHtml).not.toContain('Raw Config (JSON)');
    expect(buttonsHtml).not.toContain('Raw Config (JSON)');
  });
  it('binds gallery editor draft flows and supports list modifications', async () => {
    const galleryModule = getContractFixture('builderModules').gallery;
    const currentPage = {
      sections: [
        {
          id: 'section-1',
          modules: [galleryModule],
        },
      ],
    };
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderModuleEditorContent({
      currentPage,
      selectedModuleId: galleryModule.id,
      draftConfig: galleryModule.config,
    });
    document.body.innerHTML = '';
    document.body.appendChild(wrapper);
    const setDraftConfig = vi.fn();
    const markDirty = vi.fn();
    const renderEditorPanel = vi.fn();

    const { bindGalleryEditorEvents } = await import('../admin/page-builder/gallery-editor.js');
    bindGalleryEditorEvents({
      el: { pbModuleEditor: wrapper },
      draftConfig: galleryModule.config,
      setDraftConfig,
      markDirty,
      renderEditorPanel,
      openImagePicker: vi.fn(),
    });

    const columnsInput = wrapper.querySelector('.pb-gallery-main-input[data-key="columns"]');
    columnsInput.value = '4';
    columnsInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(setDraftConfig).toHaveBeenLastCalledWith(expect.objectContaining({ columns: 4 }));

    const firstItemSrc = wrapper.querySelector(
      '.pb-gallery-item[data-item-index="0"] .pb-gallery-input[data-item-key="src"]'
    );
    firstItemSrc.value = 'updated/path.png';
    firstItemSrc.dispatchEvent(new Event('input', { bubbles: true }));
    expect(setDraftConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        images: expect.arrayContaining([expect.objectContaining({ src: 'updated/path.png' })]),
      })
    );

    document
      .getElementById('pbGalleryAddImage')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(setDraftConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        images: expect.arrayContaining([
          expect.anything(),
          expect.anything(),
          expect.objectContaining({ src: '', alt: '' }),
        ]),
      })
    );
    expect(renderEditorPanel).toHaveBeenCalled();

    const moveDownBtn = wrapper.querySelector(
      '.pb-gallery-item[data-item-index="0"] [data-action="move-down"]'
    );
    moveDownBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(setDraftConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        images: [
          galleryModule.config.images[1],
          expect.objectContaining({ src: 'updated/path.png', alt: 'Shot one' }),
          expect.objectContaining({ src: '', alt: '' }),
        ],
      })
    );

    const removeBtn = wrapper.querySelector(
      '.pb-gallery-item[data-item-index="0"] [data-action="remove"]'
    );
    removeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(setDraftConfig).toHaveBeenCalled();
  });

  it('updates the gallery draft when the picker applies an asset', async () => {
    const galleryModule = getContractFixture('builderModules').gallery;
    const currentPage = {
      sections: [
        {
          id: 'section-1',
          modules: [galleryModule],
        },
      ],
    };
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderModuleEditorContent({
      currentPage,
      selectedModuleId: galleryModule.id,
      draftConfig: galleryModule.config,
    });
    document.body.innerHTML = '';
    document.body.appendChild(wrapper);

    const setDraftConfig = vi.fn();
    const markDirty = vi.fn();
    const renderEditorPanel = vi.fn();
    const openImagePicker = vi.fn();
    const fetchAssets = vi.fn(async () => []);
    const uploadAssetFile = vi.fn(async () => ({}));

    const { bindGalleryEditorEvents } = await import('../admin/page-builder/gallery-editor.js');
    bindGalleryEditorEvents({
      el: { pbModuleEditor: wrapper },
      draftConfig: galleryModule.config,
      setDraftConfig,
      markDirty,
      renderEditorPanel,
      openImagePicker,
      fetchAssets,
      uploadAssetFile,
    });

    wrapper
      .querySelector('.pb-gallery-item[data-item-index="0"] [data-action="pick-image"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(openImagePicker).toHaveBeenCalledWith(
      expect.objectContaining({
        getItems: fetchAssets,
        allowUpload: true,
        uploadHandler: uploadAssetFile,
        showEditor: false,
        initialSelection: { path: galleryModule.config.images[0].src },
        onApply: expect.any(Function),
      })
    );

    const pickerOptions = openImagePicker.mock.calls[0][0];
    pickerOptions.onApply({ item: { path: 'assets/uploads/replacement.png' } });

    expect(setDraftConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        images: expect.arrayContaining([
          expect.objectContaining({ src: 'assets/uploads/replacement.png' }),
        ]),
      })
    );
    expect(markDirty).toHaveBeenCalledWith('module');
    expect(renderEditorPanel).toHaveBeenCalled();
  });
});

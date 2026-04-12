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
import { getContractFixture } from './helpers/contracts.js';

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
    expect(themeHtml).toContain('Panel Spacing & Empty States');
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
});

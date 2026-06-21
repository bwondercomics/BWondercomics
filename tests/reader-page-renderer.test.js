import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderPage, renderModule } from '../reader/page-renderer.js';
import { getContractFixture } from './helpers/contracts.js';

function parseModuleHtml(html) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  return wrapper;
}

describe('reader page renderer', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the supported builder module contracts', () => {
    const modules = getContractFixture('builderModules');
    const expectations = {
      header: (wrapper) => {
        expect(wrapper.querySelector('.pb-header-title')?.textContent).toBe('Battle Bros');
      },
      text: (wrapper) => {
        expect(wrapper.querySelector('.pb-text')?.innerHTML).toContain('<strong>Heroes</strong>');
      },
      image: (wrapper) => {
        expect(wrapper.querySelector('.pb-image img')?.getAttribute('src')).toBe(
          '/media/promo/hero-pose.png'
        );
      },
      gallery: (wrapper) => {
        expect(wrapper.querySelectorAll('.pb-gallery-item')).toHaveLength(2);
      },
      video: (wrapper) => {
        expect(wrapper.querySelector('iframe')?.getAttribute('src')).toBe(
          'https://www.youtube.com/embed/demo123'
        );
      },
      social: (wrapper) => {
        expect(wrapper.querySelector('.pb-social-text')?.textContent).toBe('Bluesky');
      },
      'email-signup': (wrapper) => {
        expect(wrapper.querySelector('[data-email-signup]')).not.toBeNull();
      },
      promo: (wrapper) => {
        expect(wrapper.querySelectorAll('.pb-promo-slide')).toHaveLength(2);
      },
      buttons: (wrapper) => {
        expect(wrapper.querySelectorAll('.pb-btn')).toHaveLength(2);
      },
      divider: (wrapper) => {
        expect(wrapper.querySelector('.pb-divider')?.className).toContain('pb-divider--dashed');
      },
      spacer: (wrapper) => {
        expect(wrapper.querySelector('.pb-spacer')?.getAttribute('style')).toContain('64px');
      },
      reader: (wrapper) => {
        expect(wrapper.querySelector('.pb-reader-mount')?.dataset.showComments).toBe('false');
      },
      'entry-gallery': (wrapper) => {
        expect(wrapper.querySelector('.pb-entry-gallery-mount')?.dataset.columns).toBe('4');
      },
      feed: (wrapper) => {
        expect(wrapper.querySelector('.pb-feed-module')?.dataset.feedLimit).toBe('3');
      },
      'media-gallery': (wrapper) => {
        expect(wrapper.querySelector('.pb-media-gallery-mount')?.dataset.limit).toBe('12');
      },
      html: (wrapper) => {
        expect(wrapper.querySelector('.custom-widget')?.textContent).toBe('Builder HTML');
      },
    };

    Object.entries(expectations).forEach(([key, assertModule]) => {
      const wrapper = parseModuleHtml(renderModule(modules[key]));
      expect(wrapper.querySelector(`.pb-module--${key}`)).not.toBeNull();
      assertModule(wrapper);
    });
  });

  it('renders placeholder states for empty and invalid module configs', () => {
    const image = parseModuleHtml(renderModule({ moduleType: 'image', config: {} }));
    const gallery = parseModuleHtml(renderModule({ moduleType: 'gallery', config: {} }));
    const video = parseModuleHtml(renderModule({ moduleType: 'video', config: {} }));
    const social = parseModuleHtml(renderModule({ moduleType: 'social', config: {} }));
    const buttons = parseModuleHtml(renderModule({ moduleType: 'buttons', config: {} }));
    const promo = parseModuleHtml(renderModule({ moduleType: 'promo', config: {} }));
    const unknown = parseModuleHtml(renderModule({ moduleType: 'mystery', config: {} }));

    expect(image.textContent).toContain('No image set');
    expect(gallery.textContent).toContain('No images in gallery');
    expect(video.textContent).toContain('No video URL set');
    expect(social.textContent).toContain('No social buttons configured');
    expect(buttons.textContent).toContain('No buttons configured');
    expect(promo.textContent).toContain('No promos configured');
    expect(unknown.textContent).toContain('[Unknown module: mystery]');
  });

  it('renders customized buttons with merged inline appearance styles', () => {
    const wrapper = parseModuleHtml(
      renderModule({
        moduleType: 'buttons',
        config: {
          defaults: {
            appearance: {
              background: {
                color: '#112233',
              },
              border: {
                radius: 14,
              },
            },
          },
          buttons: [
            {
              text: 'Read',
              style: 'secondary',
              link: { kind: 'builder-page', pageSlug: 'reader' },
              appearance: {
                text: {
                  color: '#ffffff',
                },
                border: {
                  width: 0,
                },
              },
            },
          ],
        },
      })
    );

    expect(wrapper.querySelector('.pb-btn')?.getAttribute('style')).toBe(
      'background: #112233; color: #ffffff; border: none; border-radius: 14px'
    );
  });

  it('keeps legacy buttons class-only when no appearance is configured', () => {
    const wrapper = parseModuleHtml(
      renderModule({
        moduleType: 'buttons',
        config: {
          buttons: [
            {
              text: 'Read',
              style: 'secondary',
              link: { kind: 'builder-page', pageSlug: 'reader' },
            },
          ],
        },
      })
    );

    expect(wrapper.querySelector('.pb-btn')?.hasAttribute('style')).toBe(false);
  });

  it('keeps public output global while builder preview applies device overrides', () => {
    const page = {
      id: 'reader-responsive',
      sections: [
        {
          id: 'section-responsive',
          layout: '1-1',
          settings: {
            responsive: {
              mobile: {
                layout: '1',
              },
            },
          },
          modules: [
            {
              id: 'text-responsive',
              moduleType: 'text',
              columnIndex: 0,
              config: {
                content: '<p>Responsive copy</p>',
                alignment: 'left',
                responsive: {
                  mobile: {
                    alignment: 'center',
                  },
                },
              },
            },
            {
              id: 'hidden-responsive',
              moduleType: 'spacer',
              columnIndex: 0,
              config: {
                height: 60,
                responsive: {
                  mobile: {
                    hidden: true,
                  },
                },
              },
            },
          ],
        },
      ],
    };

    const publicWrapper = parseModuleHtml(renderPage(page));
    expect(publicWrapper.querySelector('.pb-section')?.dataset.layout).toBe('1-1');
    expect(publicWrapper.querySelector('.pb-text')?.getAttribute('style')).toContain(
      'text-align: left'
    );
    expect(publicWrapper.querySelector('.pb-module--spacer')).not.toBeNull();

    const builderWrapper = parseModuleHtml(
      renderPage(page, { builderEditing: true, deviceId: 'mobile' })
    );
    expect(builderWrapper.querySelector('.pb-section')?.dataset.layout).toBe('1');
    expect(builderWrapper.querySelector('.pb-text')?.getAttribute('style')).toContain(
      'text-align: center'
    );
    expect(builderWrapper.querySelector('.pb-module--hidden-device')?.dataset.builderModuleId).toBe(
      'hidden-responsive'
    );
  });

  it('sanitizes dangerous builder html and urls during rendering', () => {
    const text = parseModuleHtml(
      renderModule({
        moduleType: 'text',
        config: {
          content:
            '<p onclick="evil()">Hello <strong>world</strong><script>alert(1)</script><a href="javascript:alert(2)">bad</a></p>',
        },
      })
    );
    const html = parseModuleHtml(
      renderModule({
        moduleType: 'html',
        config: {
          code: '<section onclick="evil()"><script>alert(1)</script><div class="widget" data-note="ok">Safe</div><img src="javascript:alert(2)"></section>',
        },
      })
    );
    const social = parseModuleHtml(
      renderModule({
        moduleType: 'social',
        config: {
          buttons: [{ text: 'Unsafe', url: 'javascript:alert(3)' }],
        },
      })
    );
    const feed = parseModuleHtml(
      renderModule({
        moduleType: 'feed',
        config: {
          feedHref: 'javascript:alert(4)',
          mediaHref: '//evil.example/media',
        },
      })
    );

    expect(text.innerHTML).not.toContain('<script');
    expect(text.innerHTML).not.toContain('onclick');
    expect(text.innerHTML).not.toContain('javascript:');
    expect(text.querySelector('.pb-text strong')?.textContent).toBe('world');
    expect(html.innerHTML).not.toContain('<script');
    expect(html.innerHTML).not.toContain('onclick');
    expect(html.innerHTML).not.toContain('javascript:');
    expect(html.querySelector('.widget')?.getAttribute('data-note')).toBe('ok');
    expect(social.querySelector('.pb-social-btn')?.getAttribute('href')).toBe('#');
    expect(feed.querySelector('.pb-feed-link')?.getAttribute('href')).toBe('feed.html');
    expect(feed.querySelector('.pb-feed-media')?.getAttribute('href')).toBe('media.html');
  });

  it('renders CMS source metadata for special modules', () => {
    const reader = parseModuleHtml(
      renderModule({
        moduleType: 'reader',
        config: {
          source: { mode: 'specific-series', seriesId: 'battle-bros' },
          displayMode: 'vertical-scroll',
          controls: { placement: 'overlay', size: 'large' },
          stage: { fit: 'width', pageGap: 24, frameBorder: false, maxWidth: 1280 },
          panels: { left: { enabled: false }, right: { enabled: true } },
          showComments: false,
        },
      })
    );
    const entryGallery = parseModuleHtml(
      renderModule({
        moduleType: 'entry-gallery',
        config: { source: { mode: 'all-series', filters: { access: 'public' } } },
      })
    );
    const mediaGallery = parseModuleHtml(
      renderModule({
        moduleType: 'media-gallery',
        config: { source: { mode: 'site', filters: { access: 'all' } } },
      })
    );

    expect(reader.querySelector('.pb-reader-mount')?.dataset.sourceMode).toBe('specific-series');
    expect(reader.querySelector('.pb-reader-mount')?.dataset.sourceSeriesId).toBe('battle-bros');
    expect(reader.querySelector('.pb-reader-mount')?.dataset.displayMode).toBe('vertical-scroll');
    expect(reader.querySelector('.pb-reader-mount')?.dataset.controlsPlacement).toBe('overlay');
    expect(reader.querySelector('.pb-reader-mount')?.dataset.controlsSize).toBe('large');
    expect(reader.querySelector('.pb-reader-mount')?.dataset.stageFit).toBe('width');
    expect(reader.querySelector('.pb-reader-mount')?.dataset.stagePageGap).toBe('24');
    expect(reader.querySelector('.pb-reader-mount')?.dataset.stageFrameBorder).toBe('false');
    expect(reader.querySelector('.pb-reader-mount')?.dataset.stageMaxWidth).toBe('1280');
    expect(reader.querySelector('.pb-reader-mount')?.dataset.leftPanelEnabled).toBe('false');
    expect(reader.querySelector('.pb-reader-mount')?.dataset.rightPanelEnabled).toBe('true');
    expect(reader.querySelector('.pb-reader-mount')?.dataset.showComments).toBe('false');
    expect(entryGallery.querySelector('.pb-entry-gallery-mount')?.dataset.sourceMode).toBe(
      'all-series'
    );
    expect(mediaGallery.querySelector('.pb-media-gallery-mount')?.dataset.sourceMode).toBe('site');
  });

  it('renders page sections with current layout and spacing styles', () => {
    const page = getContractFixture('builderPage');
    const wrapper = parseModuleHtml(renderPage(page));
    const sections = wrapper.querySelectorAll('.pb-section');

    expect(wrapper.querySelector('.pb-page')?.dataset.pageId).toBe(page.id);
    expect(sections).toHaveLength(2);
    expect(sections[1].getAttribute('style')).toContain('--pb-module-gap: 20px;');
    expect(sections[1].querySelectorAll('.pb-column')).toHaveLength(2);
    expect(sections[1].querySelector('.pb-module--feed')).not.toBeNull();
  });

  it('emits builder editing target markers only when requested', () => {
    const page = getContractFixture('builderPage');
    const publicWrapper = parseModuleHtml(renderPage(page));
    const editingWrapper = parseModuleHtml(renderPage(page, { builderEditing: true }));
    const firstSection = page.sections[0];
    const firstModule = firstSection.modules[0];

    expect(publicWrapper.querySelector('[data-builder-page-id]')).toBeNull();
    expect(publicWrapper.querySelector('[data-builder-module-id]')).toBeNull();
    expect(publicWrapper.querySelector('[data-builder-surface="page-end"]')).toBeNull();
    expect(editingWrapper.querySelector('.pb-page')?.dataset.builderPageId).toBe(page.id);
    expect(editingWrapper.querySelector('.pb-section')?.dataset.builderSectionId).toBe(
      firstSection.id
    );
    expect(editingWrapper.querySelector('.pb-column')?.dataset.builderColumnIndex).toBe('0');
    expect(editingWrapper.querySelector('.pb-module')?.dataset.builderModuleId).toBe(
      firstModule.id
    );
    expect(editingWrapper.querySelector('.pb-module')?.dataset.builderModuleType).toBe(
      firstModule.moduleType
    );
    expect(
      editingWrapper.querySelector(
        '.pb-page > .pb-page-end-target-anchor [data-builder-surface="page-end"]'
      )
    ).not.toBeNull();
  });
});

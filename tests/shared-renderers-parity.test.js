/**
 * Shared renderer parity tests.
 *
 * Verifies that the shared createRenderers factory produces
 * structurally equivalent HTML when called with both reader-style
 * and preview-style options, ensuring the two code paths remain
 * consistent after the Phase 2 refactor.
 */

import { describe, expect, it } from 'vitest';
import { createRenderers } from '../admin/page-builder/shared-renderers.js';
import { getContractFixture } from './helpers/contracts.js';

function makeReaderRenderers() {
  return createRenderers({
    resolveImageUrl: (path) => (path.startsWith('/') ? path : `/${path}`),
    getSeriesId: () => 'battle-bros',
    showMountPlaceholders: false,
  });
}

function makePreviewRenderers() {
  return createRenderers({
    resolveImageUrl: (path) => (path ? `assets/${path}` : ''),
    getSeriesId: () => 'battle-bros',
    showMountPlaceholders: true,
  });
}

describe('shared renderer parity', () => {
  it('produces the same CSS class structure for all shared module types', () => {
    const modules = getContractFixture('builderModules');
    const reader = makeReaderRenderers();
    const preview = makePreviewRenderers();

    const moduleTypes = [
      'feed',
      'promo',
      'text',
      'image',
      'video',
      'social',
      'buttons',
      'spacer',
      'divider',
      'html',
      'header',
      'gallery',
      'email-signup',
    ];

    moduleTypes.forEach((type) => {
      const mod = modules[type];
      if (!mod) return; // skip if fixture doesn't have this type

      const readerHtml = reader.renderModule(mod);
      const previewHtml = preview.renderModule(mod);

      const readerEl = document.createElement('div');
      readerEl.innerHTML = readerHtml;
      const previewEl = document.createElement('div');
      previewEl.innerHTML = previewHtml;

      // Both must produce a pb-module wrapper with the right type class
      expect(readerEl.querySelector(`.pb-module--${type}`)).not.toBeNull();
      expect(previewEl.querySelector(`.pb-module--${type}`)).not.toBeNull();
    });
  });

  it('renders the same full page structure for reader and preview options', () => {
    const page = getContractFixture('builderPage');
    const reader = makeReaderRenderers();
    const preview = makePreviewRenderers();

    const readerHtml = reader.renderPage(page);
    const previewHtml = preview.renderPage(page);

    const readerEl = document.createElement('div');
    readerEl.innerHTML = readerHtml;
    const previewEl = document.createElement('div');
    previewEl.innerHTML = previewHtml;

    // Both must produce a .pb-page root
    expect(readerEl.querySelector('.pb-page')).not.toBeNull();
    expect(previewEl.querySelector('.pb-page')).not.toBeNull();

    // Same number of sections
    const readerSections = readerEl.querySelectorAll('.pb-section');
    const previewSections = previewEl.querySelectorAll('.pb-section');
    expect(readerSections.length).toBe(previewSections.length);
    expect(readerSections.length).toBeGreaterThan(0);
  });

  it('omits builder target markers by default', () => {
    const page = getContractFixture('builderPage');
    const html = makeReaderRenderers().renderPage(page);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;

    expect(wrapper.querySelector('[data-builder-page-id]')).toBeNull();
    expect(wrapper.querySelector('[data-builder-section-id]')).toBeNull();
    expect(wrapper.querySelector('[data-builder-column-index]')).toBeNull();
    expect(wrapper.querySelector('[data-builder-module-id]')).toBeNull();
    expect(wrapper.querySelector('[data-builder-module-type]')).toBeNull();
  });

  it('emits stable builder target markers only when builder editing is enabled', () => {
    const page = getContractFixture('builderPage');
    const html = makeReaderRenderers().renderPage(page, { builderEditing: true });
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;

    const firstSection = page.sections[0];
    const firstModule = firstSection.modules[0];

    expect(wrapper.querySelector('.pb-page')?.dataset.builderPageId).toBe(page.id);
    expect(wrapper.querySelector('.pb-section')?.dataset.builderSectionId).toBe(firstSection.id);
    expect(wrapper.querySelector('.pb-section')?.dataset.builderSectionIndex).toBe('0');
    expect(wrapper.querySelector('.pb-section')?.dataset.builderLayout).toBe(firstSection.layout);
    expect(wrapper.querySelector('.pb-column')?.dataset.builderColumnIndex).toBe('0');
    expect(wrapper.querySelector('.pb-module')?.dataset.builderModuleId).toBe(firstModule.id);
    expect(wrapper.querySelector('.pb-module')?.dataset.builderModuleType).toBe(
      firstModule.moduleType
    );
  });

  it('emits module markers for unknown modules in builder editing mode', () => {
    const html = makeReaderRenderers().renderModule(
      {
        id: 'module-unknown',
        moduleType: 'mystery-box',
        config: {},
      },
      { builderEditing: true }
    );
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    const module = wrapper.querySelector('.pb-module--unknown');

    expect(module?.dataset.moduleId).toBe('module-unknown');
    expect(module?.dataset.builderModuleId).toBe('module-unknown');
    expect(module?.dataset.builderModuleType).toBe('mystery-box');
  });

  it('reader omits mount placeholders, preview shows them', () => {
    const readerMod = { moduleType: 'reader', config: { showPanels: true, showComments: true } };
    const galleryMod = { moduleType: 'entry-gallery', config: { columns: 3 } };

    const reader = makeReaderRenderers();
    const preview = makePreviewRenderers();

    const readerReaderHtml = reader.renderModule(readerMod);
    const previewReaderHtml = preview.renderModule(readerMod);

    expect(readerReaderHtml).toContain('<!-- Reader will be mounted here -->');
    expect(readerReaderHtml).not.toContain('pb-mount-placeholder');

    expect(previewReaderHtml).toContain('pb-mount-placeholder');
    expect(previewReaderHtml).toContain('Reader Component (renders on live page)');

    const readerGalleryHtml = reader.renderModule(galleryMod);
    const previewGalleryHtml = preview.renderModule(galleryMod);

    expect(readerGalleryHtml).toContain('<!-- Entry gallery will be mounted here -->');
    expect(previewGalleryHtml).toContain('Entry Gallery (renders on live page)');
  });

  it('resolves image URLs using the provided resolver in both modes', () => {
    const mod = {
      moduleType: 'image',
      config: { src: 'uploads/hero.png', alt: 'Hero' },
    };

    const readerEl = document.createElement('div');
    readerEl.innerHTML = makeReaderRenderers().renderModule(mod);

    const previewEl = document.createElement('div');
    previewEl.innerHTML = makePreviewRenderers().renderModule(mod);

    const readerImg = readerEl.querySelector('img');
    const previewImg = previewEl.querySelector('img');

    expect(readerImg?.getAttribute('src')).toContain('/uploads/hero.png');
    expect(previewImg?.getAttribute('src')).toContain('assets/uploads/hero.png');
  });

  it('uses the provided seriesId for button link resolution in both modes', () => {
    const mod = {
      moduleType: 'buttons',
      config: {
        buttons: [
          { text: 'About', style: 'primary', link: { kind: 'builder-page', pageSlug: 'about' } },
        ],
      },
    };

    const readerEl = document.createElement('div');
    readerEl.innerHTML = makeReaderRenderers().renderModule(mod);
    const previewEl = document.createElement('div');
    previewEl.innerHTML = makePreviewRenderers().renderModule(mod);

    expect(readerEl.querySelector('.pb-btn')?.getAttribute('href')).toContain('series=battle-bros');
    expect(readerEl.querySelector('.pb-btn')?.getAttribute('href')).toContain('page=about');
    expect(previewEl.querySelector('.pb-btn')?.getAttribute('href')).toContain(
      'series=battle-bros'
    );
    expect(previewEl.querySelector('.pb-btn')?.getAttribute('href')).toContain('page=about');
  });

  it('applies button defaults and per-button appearance overrides with reader/preview parity', () => {
    const mod = {
      moduleType: 'buttons',
      config: {
        defaults: {
          appearance: {
            background: {
              color: '#112233',
            },
            text: {
              color: '#eeeeee',
            },
            border: {
              radius: 12,
            },
          },
        },
        buttons: [
          {
            text: 'Default',
            style: 'secondary',
            link: { kind: 'builder-page', pageSlug: 'about' },
          },
          {
            text: 'Override',
            style: 'secondary',
            link: { kind: 'builder-page', pageSlug: 'about' },
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
    };

    const readerEl = document.createElement('div');
    readerEl.innerHTML = makeReaderRenderers().renderModule(mod);
    const previewEl = document.createElement('div');
    previewEl.innerHTML = makePreviewRenderers().renderModule(mod);

    const readerButtons = readerEl.querySelectorAll('.pb-btn');
    const previewButtons = previewEl.querySelectorAll('.pb-btn');

    expect(readerButtons[0]?.getAttribute('style')).toBe(
      'background: #112233; color: #eeeeee; border-radius: 12px'
    );
    expect(previewButtons[0]?.getAttribute('style')).toBe(
      'background: #112233; color: #eeeeee; border-radius: 12px'
    );
    expect(readerButtons[1]?.getAttribute('style')).toBe(
      'background: #112233; color: #ffffff; border: none; border-radius: 12px'
    );
    expect(previewButtons[1]?.getAttribute('style')).toBe(
      'background: #112233; color: #ffffff; border: none; border-radius: 12px'
    );
  });

  it('keeps legacy class-only button output when no appearance is configured', () => {
    const mod = {
      moduleType: 'buttons',
      config: {
        buttons: [
          {
            text: 'Plain',
            style: 'primary',
            link: { kind: 'builder-page', pageSlug: 'about' },
          },
        ],
      },
    };

    const readerEl = document.createElement('div');
    readerEl.innerHTML = makeReaderRenderers().renderModule(mod);
    const previewEl = document.createElement('div');
    previewEl.innerHTML = makePreviewRenderers().renderModule(mod);

    expect(readerEl.querySelector('.pb-btn')?.hasAttribute('style')).toBe(false);
    expect(previewEl.querySelector('.pb-btn')?.hasAttribute('style')).toBe(false);
    expect(readerEl.querySelector('.pb-btn')?.className).toBe('pb-btn pb-btn--primary');
    expect(previewEl.querySelector('.pb-btn')?.className).toBe('pb-btn pb-btn--primary');
  });
});

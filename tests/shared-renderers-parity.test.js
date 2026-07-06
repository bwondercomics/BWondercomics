/**
 * Shared renderer parity tests.
 *
 * Verifies that the shared createRenderers factory produces
 * structurally equivalent HTML when called with both reader-style
 * and preview-style options, ensuring the two code paths remain
 * consistent after the Phase 2 refactor.
 */

import { describe, expect, it } from 'vitest';
import {
  buildColumnInlineStyle,
  createRenderers,
  EDITOR_EMPTY_COLUMN_MIN_HEIGHT,
} from '../admin/page-builder/shared-renderers.js';
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

describe('buildColumnInlineStyle export contract', () => {
  // The reader panel path imports these top-level exports directly; makeReaderRenderers uses the
  // factory and would not catch a missing/renamed export, so assert them explicitly.
  it('exports the module-level column-style helper and editor floor constant', () => {
    expect(typeof buildColumnInlineStyle).toBe('function');
    expect(EDITOR_EMPTY_COLUMN_MIN_HEIGHT).toBe(40);
  });

  it('omits the alignment token entirely when includeAlignment is false', () => {
    const colSettings = { alignment: 'center', minHeight: 120 };
    expect(buildColumnInlineStyle(colSettings)).toContain('justify-self: center');
    const panelStyle = buildColumnInlineStyle(colSettings, { includeAlignment: false });
    expect(panelStyle).not.toContain('justify-self');
    expect(panelStyle).not.toContain('align-self');
    expect(panelStyle).toContain('min-height: 120px');
  });

  it('emits section min-height inline and in device @media (Phase 1)', () => {
    const reader = makeReaderRenderers();
    const section = {
      id: 'minheight-sec',
      layout: '1-1',
      sortIndex: 0,
      settings: { minHeight: 900, responsive: { mobile: { minHeight: 400 } } },
      modules: [],
    };
    const html = reader.renderSection(section, 0);
    expect(html).toContain('min-height: 900px');
    expect(html).toMatch(/@media \(max-width: 480px\)[^}]*min-height: 400px !important/);
    // Without the key, no min-height token is emitted at all.
    const plain = reader.renderSection({ ...section, id: 'plain-sec', settings: {} }, 0);
    expect(plain).not.toContain('min-height');
  });

  it('renders a framed background layer for a column with panelBackground (Phase 1)', () => {
    const reader = makeReaderRenderers();
    const section = {
      id: 'colbg-sec',
      layout: '1-1',
      sortIndex: 0,
      settings: {
        columns: [
          {
            index: 0,
            panelBackground: { path: 'media/tex.png', fit: 'contain', focus: 'top', opacity: 0.5 },
          },
        ],
      },
      modules: [
        { id: 'm1', moduleType: 'text', columnIndex: 0, sortIndex: 0, config: { text: 'a' } },
      ],
    };
    const html = reader.renderSection(section, 0);
    expect(html).toContain('pb-column--has-bg');
    expect(html).toContain('pb-column-bg');
    expect(html).toContain("background-image: url('/media/tex.png')");
    expect(html).toContain('background-size: contain');
    expect(html).toContain('background-position: top');
    expect(html).toContain('opacity: 0.5');
    // Columns without art render exactly as before (no layer, no marker class).
    const bare = reader.renderSection({ ...section, id: 'bare-sec', settings: {} }, 0);
    expect(bare).not.toContain('pb-column-bg');
    expect(bare).not.toContain('pb-column--has-bg');
  });

  it('emits shared module layout on the wrapper and nothing without it (Phase 2)', () => {
    const reader = makeReaderRenderers();
    const section = {
      id: 'modlayout-sec',
      layout: '1',
      sortIndex: 0,
      settings: {},
      modules: [
        {
          id: 'm1',
          moduleType: 'text',
          columnIndex: 0,
          sortIndex: 0,
          config: {
            text: 'a',
            layout: { widthMode: 'percent', width: 60, height: 240, align: 'center' },
          },
        },
        { id: 'm2', moduleType: 'text', columnIndex: 0, sortIndex: 1, config: { text: 'b' } },
      ],
    };
    const html = reader.renderSection(section, 0);
    const sized =
      html.match(/<div class="pb-module pb-module--text"[^>]*data-module-id="m1"[^>]*>/)?.[0] || '';
    expect(sized).toContain('width: 60%');
    expect(sized).toContain('height: 240px');
    expect(sized).toContain('margin-left: auto');
    expect(sized).toContain('margin-right: auto');
    const plain =
      html.match(/<div class="pb-module pb-module--text"[^>]*data-module-id="m2"[^>]*>/)?.[0] || '';
    expect(plain).not.toContain('style=');
  });

  it('emits align-self instead of justify-self when alignmentProperty is align-self (panel path)', () => {
    const start = buildColumnInlineStyle(
      { alignment: 'start' },
      { alignmentProperty: 'align-self' }
    );
    expect(start).toContain('align-self: flex-start');
    expect(start).not.toContain('justify-self');
    const end = buildColumnInlineStyle({ alignment: 'end' }, { alignmentProperty: 'align-self' });
    expect(end).toContain('align-self: flex-end');
    // stretch is the default and emits no token under either property.
    expect(
      buildColumnInlineStyle({ alignment: 'stretch' }, { alignmentProperty: 'align-self' })
    ).not.toContain('align-self');
  });
});

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
    expect(wrapper.querySelector('[data-builder-edit-field]')).toBeNull();
    expect(wrapper.querySelector('[data-builder-surface="page-end"]')).toBeNull();
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
    expect(wrapper.querySelector('.pb-page-end-target')?.dataset.builderSurface).toBe('page-end');
  });

  it('emits text inline edit markers only in builder editing mode', () => {
    const textModule = {
      id: 'module-text-inline',
      moduleType: 'text',
      config: { content: '<p>Edit me</p>' },
    };
    const renderer = makeReaderRenderers();

    const publicWrapper = document.createElement('div');
    publicWrapper.innerHTML = renderer.renderModule(textModule);
    expect(publicWrapper.querySelector('.pb-text')?.hasAttribute('data-builder-edit-field')).toBe(
      false
    );

    const builderWrapper = document.createElement('div');
    builderWrapper.innerHTML = renderer.renderModule(textModule, { builderEditing: true });
    expect(builderWrapper.querySelector('.pb-text')?.dataset.builderEditField).toBe('content');
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

  it('applies responsive overrides only in builder device context', () => {
    const page = {
      id: 'page-responsive',
      sections: [
        {
          id: 'section-responsive',
          layout: '1-1',
          settings: {
            moduleGap: 20,
            responsive: {
              mobile: {
                layout: '1',
                moduleGap: 6,
              },
            },
          },
          modules: [
            {
              id: 'module-text',
              moduleType: 'text',
              columnIndex: 0,
              sortIndex: 0,
              config: {
                content: '<p>Copy</p>',
                alignment: 'left',
                responsive: {
                  mobile: {
                    alignment: 'right',
                  },
                },
              },
            },
            {
              id: 'module-spacer',
              moduleType: 'spacer',
              columnIndex: 1,
              sortIndex: 1,
              config: {
                height: 80,
                responsive: {
                  mobile: {
                    hidden: true,
                    height: 20,
                  },
                },
              },
            },
          ],
        },
      ],
    };
    const renderer = makeReaderRenderers();

    const publicWrapper = document.createElement('div');
    publicWrapper.innerHTML = renderer.renderPage(page);
    expect(publicWrapper.querySelector('.pb-section')?.dataset.layout).toBe('1-1');
    expect(publicWrapper.querySelector('.pb-section')?.getAttribute('style')).toContain(
      '--pb-module-gap: 20px'
    );
    expect(publicWrapper.querySelector('.pb-text')?.getAttribute('style')).toContain(
      'text-align: left'
    );
    expect(publicWrapper.querySelector('.pb-module--spacer')).not.toBeNull();
    expect(publicWrapper.querySelector('.pb-module--hidden-device')).toBeNull();

    const builderWrapper = document.createElement('div');
    builderWrapper.innerHTML = renderer.renderPage(page, {
      builderEditing: true,
      deviceId: 'mobile',
    });
    expect(builderWrapper.querySelector('.pb-section')?.dataset.layout).toBe('1');
    expect(builderWrapper.querySelector('.pb-section')?.getAttribute('style')).toContain(
      '--pb-module-gap: 6px'
    );
    expect(builderWrapper.querySelector('.pb-text')?.getAttribute('style')).toContain(
      'text-align: right'
    );
    expect(builderWrapper.querySelector('.pb-module--hidden-device')?.dataset.builderModuleId).toBe(
      'module-spacer'
    );
    expect(builderWrapper.querySelectorAll('.pb-column')).toHaveLength(2);
    expect(
      builderWrapper.querySelector('[data-builder-module-id="module-spacer"]')?.parentElement
        ?.dataset.builderColumnIndex
    ).toBe('1');
  });

  it('keeps responsive column nodes and module ownership identical across render paths', () => {
    const section = {
      id: 'section-columns',
      layout: '2-1-1-1',
      settings: {
        columns: [
          {
            index: 2,
            responsive: {
              mobile: {
                hidden: true,
              },
            },
          },
        ],
        responsive: {
          mobile: {
            layout: '1-2',
          },
        },
      },
      modules: Array.from({ length: 4 }, (_, index) => ({
        id: `module-${index}`,
        moduleType: 'text',
        columnIndex: index,
        sortIndex: 0,
        config: { content: `<p>Column ${index + 1}</p>` },
      })),
    };
    const renderer = makeReaderRenderers();

    const publicWrapper = document.createElement('div');
    publicWrapper.innerHTML = renderer.renderSection(section);
    const builderWrapper = document.createElement('div');
    builderWrapper.innerHTML = renderer.renderSection(section, {
      builderEditing: true,
      deviceId: 'mobile',
    });

    expect(publicWrapper.querySelectorAll('.pb-column')).toHaveLength(4);
    expect(builderWrapper.querySelectorAll('.pb-column')).toHaveLength(4);
    for (let index = 0; index < 4; index += 1) {
      expect(
        publicWrapper.querySelector(`[data-module-id="module-${index}"]`)?.closest('.pb-column')
      ).not.toBeNull();
      expect(
        builderWrapper.querySelector(`[data-builder-module-id="module-${index}"]`)?.parentElement
          ?.dataset.builderColumnIndex
      ).toBe(String(index));
    }

    const builderColumns = builderWrapper.querySelectorAll('.pb-column');
    expect(builderColumns[2]?.classList.contains('pb-column--hidden')).toBe(true);
    expect(builderWrapper.querySelector('.pb-section-columns')?.getAttribute('style')).toContain(
      'grid-template-columns: 1fr 2fr'
    );

    const publicStyle = publicWrapper.querySelector('style')?.textContent || '';
    expect(publicStyle).toContain('grid-template-columns: 1fr 2fr !important');
    expect(publicStyle).toContain('.pb-column:nth-child(3) { display: none !important');
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
          {
            text: 'Space About',
            style: 'primary',
            link: {
              kind: 'builder-page',
              pageScope: 'series',
              seriesId: 'space-saga',
              pageSlug: 'about',
            },
          },
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
    expect(readerEl.querySelectorAll('.pb-btn')[1]?.getAttribute('href')).toContain(
      'series=space-saga'
    );
    expect(previewEl.querySelectorAll('.pb-btn')[1]?.getAttribute('href')).toContain(
      'series=space-saga'
    );
  });

  it('renders global builder page links without a series query', () => {
    const mod = {
      moduleType: 'buttons',
      config: {
        buttons: [
          {
            text: 'Global About',
            style: 'primary',
            link: { kind: 'builder-page', pageScope: 'global', pageSlug: 'about' },
          },
        ],
      },
    };

    const readerEl = document.createElement('div');
    readerEl.innerHTML = makeReaderRenderers().renderModule(mod);

    const href = readerEl.querySelector('.pb-btn')?.getAttribute('href') || '';
    expect(href).toContain('pageScope=global');
    expect(href).toContain('page=about');
    expect(href).not.toContain('series=');
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

  it('renders 1-6 column layouts with grid-template-columns from ratios', () => {
    const page = {
      id: 'page-grid',
      sections: [
        {
          id: 'section-grid',
          layout: '2-1-1-1',
          settings: {},
          modules: [],
        },
      ],
    };
    const reader = makeReaderRenderers();
    const preview = makePreviewRenderers();

    const readerEl = document.createElement('div');
    readerEl.innerHTML = reader.renderPage(page);
    const previewEl = document.createElement('div');
    previewEl.innerHTML = preview.renderPage(page);

    const readerColumns = readerEl.querySelector('.pb-section-columns');
    expect(readerColumns?.getAttribute('style')).toContain(
      'grid-template-columns: 2fr 1fr 1fr 1fr'
    );
    expect(readerColumns?.querySelectorAll('.pb-column').length).toBe(4);
    // Reader and preview emit identical grid templates.
    expect(previewEl.querySelector('.pb-section-columns')?.getAttribute('style')).toBe(
      readerColumns?.getAttribute('style')
    );
  });

  it('emits per-column appearance, padding, alignment, and min-height styles', () => {
    const page = {
      id: 'page-col-style',
      sections: [
        {
          id: 'section-col-style',
          layout: '1-1',
          settings: {
            columns: [
              {
                index: 0,
                appearance: {
                  background: { color: '#f5f5f5' },
                  border: { width: 1, color: '#ddd' },
                },
                padding: { top: 12, left: 8 },
                alignment: 'center',
                minHeight: 200,
              },
              { index: 1, hidden: true },
            ],
          },
          modules: [],
        },
      ],
    };

    const publicWrapper = document.createElement('div');
    publicWrapper.innerHTML = makeReaderRenderers().renderPage(page);
    const columns = publicWrapper.querySelectorAll('.pb-column');
    const firstStyle = columns[0]?.getAttribute('style') || '';
    expect(firstStyle).toContain('background: #f5f5f5');
    expect(firstStyle).toContain('border: 1px solid #ddd');
    expect(firstStyle).toContain('padding-top: 12px');
    expect(firstStyle).toContain('padding-left: 8px');
    expect(firstStyle).toContain('justify-self: center');
    expect(firstStyle).toContain('min-height: 200px');
    // Hidden column collapses on the public path.
    expect(columns[1]?.classList.contains('pb-column--hidden')).toBe(true);

    // Builder preview keeps the same hidden state and structural node.
    const builderWrapper = document.createElement('div');
    builderWrapper.innerHTML = makeReaderRenderers().renderPage(page, { builderEditing: true });
    const builderColumns = builderWrapper.querySelectorAll('.pb-column');
    expect(builderColumns[1]?.classList.contains('pb-column--hidden')).toBe(true);
  });

  it('floors empty columns to the editor affordance height in builder editing, never in public', () => {
    const page = {
      id: 'page-empty-floor',
      sections: [
        {
          id: 'section-empty-floor',
          layout: '1-1',
          settings: {
            columns: [
              { index: 0, minHeight: 0 },
              { index: 1, minHeight: 100 },
            ],
          },
          modules: [],
        },
      ],
    };

    // Builder editing: an empty column with authored min-height 0 is floored so it stays a visible
    // drop target; a larger authored min-height is preserved (the floor never lowers it).
    const builderWrapper = document.createElement('div');
    builderWrapper.innerHTML = makeReaderRenderers().renderPage(page, { builderEditing: true });
    const builderColumns = builderWrapper.querySelectorAll('.pb-column');
    expect(builderColumns[0]?.getAttribute('style') || '').toContain('min-height: 40px');
    expect(builderColumns[1]?.getAttribute('style') || '').toContain('min-height: 100px');

    // Public path is unchanged: authored 0 stays 0, so the editor affordance never leaks into
    // published output.
    const publicWrapper = document.createElement('div');
    publicWrapper.innerHTML = makeReaderRenderers().renderPage(page);
    const publicColumns = publicWrapper.querySelectorAll('.pb-column');
    expect(publicColumns[0]?.getAttribute('style') || '').toContain('min-height: 0px');
  });

  it('floors only empty columns in builder editing, leaving populated columns untouched', () => {
    const page = {
      id: 'page-nonempty-floor',
      sections: [
        {
          id: 'section-nonempty-floor',
          layout: '1-1',
          settings: {
            columns: [
              { index: 0, minHeight: 0 },
              { index: 1, minHeight: 0 },
            ],
          },
          modules: [
            {
              id: 'm0',
              moduleType: 'text',
              columnIndex: 0,
              sortIndex: 0,
              config: { content: '<p>A</p>' },
            },
          ],
        },
      ],
    };

    const builderWrapper = document.createElement('div');
    builderWrapper.innerHTML = makeReaderRenderers().renderPage(page, { builderEditing: true });
    const builderColumns = builderWrapper.querySelectorAll('.pb-column');
    // Column 0 has a module, so its authored min-height 0 is respected; the empty column 1 is
    // floored to the affordance height.
    expect(builderColumns[0]?.getAttribute('style') || '').toContain('min-height: 0px');
    expect(builderColumns[1]?.getAttribute('style') || '').toContain('min-height: 40px');
  });

  it('floors an empty column whose responsive min-height resolves to 0 in builder device context', () => {
    const page = {
      id: 'page-resp-floor',
      sections: [
        {
          id: 'section-resp-floor',
          layout: '1-1',
          settings: {
            columns: [{ index: 0, minHeight: 200, responsive: { mobile: { minHeight: 0 } } }],
          },
          modules: [],
        },
      ],
    };
    const renderer = makeReaderRenderers();

    // Desktop builder context keeps the authored 200 (already above the affordance).
    const desktopWrapper = document.createElement('div');
    desktopWrapper.innerHTML = renderer.renderPage(page, { builderEditing: true });
    expect(desktopWrapper.querySelectorAll('.pb-column')[0]?.getAttribute('style') || '').toContain(
      'min-height: 200px'
    );

    // Mobile builder context resolves the responsive override to 0, which the editor floor lifts
    // back to the affordance height instead of collapsing the drop target.
    const mobileWrapper = document.createElement('div');
    mobileWrapper.innerHTML = renderer.renderPage(page, {
      builderEditing: true,
      deviceId: 'mobile',
    });
    expect(mobileWrapper.querySelectorAll('.pb-column')[0]?.getAttribute('style') || '').toContain(
      'min-height: 40px'
    );
  });

  it('clamps out-of-range module columns into the last visible column', () => {
    const page = {
      id: 'page-clamp',
      sections: [
        {
          id: 'section-clamp',
          layout: '1-1',
          settings: {},
          modules: [
            {
              id: 'm-a',
              moduleType: 'text',
              columnIndex: 0,
              sortIndex: 0,
              config: { content: '<p>A</p>' },
            },
            // columnIndex 4 no longer exists in a 2-column layout.
            {
              id: 'm-b',
              moduleType: 'text',
              columnIndex: 4,
              sortIndex: 1,
              config: { content: '<p>B</p>' },
            },
          ],
        },
      ],
    };

    const wrapper = document.createElement('div');
    wrapper.innerHTML = makeReaderRenderers().renderPage(page);
    const columns = wrapper.querySelectorAll('.pb-column');
    expect(columns.length).toBe(2);
    // No modules dropped; the out-of-range module lands in the last column.
    expect(wrapper.querySelectorAll('.pb-module--text').length).toBe(2);
    expect(columns[1]?.querySelectorAll('.pb-module--text').length).toBe(1);
  });

  it('applies per-column responsive styling only in builder device context', () => {
    const page = {
      id: 'page-col-responsive',
      sections: [
        {
          id: 'section-col-responsive',
          layout: '1-1',
          settings: {
            columns: [{ index: 0, responsive: { mobile: { hidden: true } } }],
          },
          modules: [],
        },
      ],
    };
    const renderer = makeReaderRenderers();

    const publicWrapper = document.createElement('div');
    publicWrapper.innerHTML = renderer.renderPage(page);
    expect(
      publicWrapper.querySelectorAll('.pb-column')[0]?.classList.contains('pb-column--hidden')
    ).toBe(false);

    const builderWrapper = document.createElement('div');
    builderWrapper.innerHTML = renderer.renderPage(page, {
      builderEditing: true,
      deviceId: 'mobile',
    });
    expect(
      builderWrapper.querySelectorAll('.pb-column')[0]?.classList.contains('pb-column--hidden')
    ).toBe(true);
  });

  it('emits scoped @media CSS so device overrides apply on the public runtime', () => {
    const page = {
      id: 'page-public-responsive',
      sections: [
        {
          id: 'sec-pub-resp',
          layout: '1-1-1',
          settings: {
            responsive: { mobile: { layout: '1' } },
            columns: [
              { index: 0, responsive: { tablet: { hidden: true } } },
              {
                index: 1,
                responsive: { mobile: { appearance: { background: { color: '#222' } } } },
              },
            ],
          },
          modules: [],
        },
      ],
    };

    const wrapper = document.createElement('div');
    wrapper.innerHTML = makeReaderRenderers().renderPage(page);
    const section = wrapper.querySelector('.pb-section');
    expect(section?.getAttribute('data-pb-section')).toBe('sec-pub-resp');
    const css = wrapper.querySelector('style')?.textContent || '';
    // Per-device layout change becomes a grid-template-columns override at phone width.
    expect(css).toContain('@media (max-width: 480px)');
    expect(css).toContain('grid-template-columns: 1fr !important');
    // Per-column tablet hide and mobile background land in the right banded queries.
    expect(css).toContain('@media (min-width: 481px) and (max-width: 768px)');
    expect(css).toContain('.pb-column:nth-child(1) { display: none !important');
    expect(css).toContain('.pb-column:nth-child(2)');
    expect(css).toContain('background: #222 !important');
  });

  it('does not emit a responsive style block for sections without overrides', () => {
    const page = {
      id: 'page-no-resp',
      sections: [{ id: 'sec-no-resp', layout: '1-1', settings: {}, modules: [] }],
    };
    const wrapper = document.createElement('div');
    wrapper.innerHTML = makeReaderRenderers().renderPage(page);
    expect(wrapper.querySelector('style')).toBeNull();
    expect(wrapper.querySelector('.pb-section')?.hasAttribute('data-pb-section')).toBe(false);
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

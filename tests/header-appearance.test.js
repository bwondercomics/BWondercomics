import { afterEach, describe, expect, it, vi } from 'vitest';

import { appearanceToInlineStyle } from '../admin/page-builder/appearance-utils.js';
import { renderCanvasSnapshot } from '../admin/page-builder/canvas-renderer.js';
import {
  bindHeaderEditorEvents,
  renderHeaderEditorContent,
} from '../admin/page-builder/header-editor.js';
import {
  createPageHeaderMeta,
  normalizeHeaderConfig,
  resolveHeaderNavItemAppearance,
  resolveHeaderShellScrolledAppearance,
  resolveHeaderShellTopAppearance,
} from '../admin/page-builder/header-config.js';
import { applySharedHeaderLayout } from '../reader/header-layout.js';

function mountHeaderEditor({
  draftState = {
    header: {
      nav: {
        items: [
          {
            id: 'about',
            label: 'About',
            style: 'primary',
            enabled: true,
            link: {
              kind: 'builder-page',
              pageSlug: 'about',
            },
          },
        ],
      },
    },
    copy: {
      title: 'Header Title',
      subtitle: 'Header Subtitle',
      subtitles: [],
    },
  },
  pages = [
    { scope: 'series', seriesId: 'battle-bros', slug: 'about', title: 'About' },
    { scope: 'series', seriesId: 'battle-bros', slug: 'reader', title: 'Reader' },
    { scope: 'global', seriesId: null, slug: 'about', title: 'Global About' },
  ],
} = {}) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderHeaderEditorContent({ draftState, pages });
  document.body.innerHTML = '';
  document.body.appendChild(wrapper);

  const setDraftState = vi.fn();
  const markDirty = vi.fn();
  const renderEditorPanel = vi.fn();
  const renderCanvas = vi.fn();

  bindHeaderEditorEvents({
    el: { pbModuleEditor: wrapper },
    draftState,
    setDraftState,
    markDirty,
    renderEditorPanel,
    renderCanvas,
  });

  return {
    pages,
    wrapper,
    setDraftState,
    markDirty,
    renderEditorPanel,
    renderCanvas,
  };
}

function getAppearanceControl(wrapper, { scope, key, kind, index = null }) {
  return wrapper.querySelector(
    [
      kind === 'toggle' ? '[data-appearance-toggle="true"]' : '[data-appearance-input="true"]',
      `[data-appearance-scope="${scope}"]`,
      `[data-appearance-key="${key}"]`,
      Number.isInteger(index) ? `[data-item-index="${index}"]` : '',
    ].join('')
  );
}

function createHeaderDom() {
  document.body.innerHTML = `
    <header class="topbar" id="topbar">
      <div class="brand"><div class="title"><h1>Battle Bros</h1></div></div>
      <div class="nav-links">
        <a id="adminNavLink" class="nav-link admin-link" href="/admin">Admin</a>
      </div>
      <div id="statusPanel" class="status-panel">Status</div>
      <div class="entry-controls">Entries</div>
      <div id="patronWelcome" class="patron-welcome">Welcome</div>
    </header>
  `;
}

function setScrollOffset(value) {
  Object.defineProperty(window, 'scrollY', {
    value,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'pageYOffset', {
    value,
    writable: true,
    configurable: true,
  });
  document.documentElement.scrollTop = value;
  document.body.scrollTop = value;
}

function createCanvasState(overrides = {}) {
  return {
    currentPage: {
      id: 'page-1',
      slug: 'reader',
      title: 'Reader',
      pageType: 'custom',
      sections: [],
      meta: {
        header: {
          version: 3,
          copy: {
            title: 'Reader',
            subtitle: '',
            subtitles: [],
          },
          nav: {
            items: [],
          },
        },
      },
    },
    currentSeriesPageConfig: null,
    activeHeaderDraft: null,
    selectedCanvasSurface: null,
    dirtyScope: null,
    canvasStatus: {},
    activeInsertTarget: null,
    ...overrides,
  };
}

function createCanvasHelpers() {
  return {
    getModulePreview: () => '',
    getPageDisplayTitle: (page) => page?.title || 'Untitled',
    getReaderLinkLabel: () => 'Open Reader',
    getReaderPreviewNote: () => 'Preview',
    getReaderPreviewStatus: () => 'neutral',
    getReaderUrl: () => 'index.html',
    renderPageStatusBadges: () => '',
    sortSections: (sections) => sections,
  };
}

describe('header appearance', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    setScrollOffset(0);
    vi.restoreAllMocks();
  });

  it('normalizes legacy header regions into the top layout row', () => {
    const header = normalizeHeaderConfig({
      regions: {
        left: ['brand'],
        center: ['nav'],
        right: ['status', 'entryControls', 'patron'],
      },
    });

    expect(header.layoutRows).toEqual({
      top: {
        left: ['brand'],
        center: ['nav'],
        right: ['status', 'entryControls', 'patron'],
      },
      middle: {
        left: [],
        center: [],
        right: [],
      },
      bottom: {
        left: [],
        center: [],
        right: [],
      },
    });
    expect(header.regions).toEqual({
      left: ['brand'],
      center: ['nav'],
      right: ['status', 'entryControls', 'patron'],
    });
  });

  it('removes duplicate and invalid row placements while keeping flattened regions in sync', () => {
    const header = normalizeHeaderConfig({
      layoutRows: {
        top: {
          left: ['brand', 'not-a-block', 'nav'],
          center: ['brand'],
          right: [],
        },
        middle: {
          left: [],
          center: [],
          right: ['status', 'nav'],
        },
        bottom: {
          left: ['entryControls'],
          center: [],
          right: [],
        },
      },
    });
    const meta = createPageHeaderMeta(header);

    expect(header.layoutRows).toEqual({
      top: {
        left: ['brand', 'nav'],
        center: ['patron'],
        right: [],
      },
      middle: {
        left: [],
        center: [],
        right: ['status'],
      },
      bottom: {
        left: ['entryControls'],
        center: [],
        right: [],
      },
    });
    expect(header.regions).toEqual({
      left: ['brand', 'nav', 'entryControls'],
      center: ['patron'],
      right: ['status'],
    });
    expect(meta.layoutRows).toEqual(header.layoutRows);
    expect(meta.regions).toEqual(header.regions);
  });

  it('resolves shell top and scrolled appearance with sparse scrolled overlays', () => {
    const header = normalizeHeaderConfig({
      appearance: {
        top: {
          background: {
            color: '#112233',
          },
          border: {
            radius: 8,
          },
        },
        scrolled: {
          text: {
            color: '#ffffff',
          },
        },
      },
    });

    expect(resolveHeaderShellTopAppearance(header)).toEqual(
      expect.objectContaining({
        background: expect.objectContaining({
          color: '#112233',
        }),
        border: expect.objectContaining({
          radius: 8,
        }),
      })
    );
    expect(resolveHeaderShellScrolledAppearance(header)).toEqual(
      expect.objectContaining({
        background: expect.objectContaining({
          color: '#112233',
        }),
        text: expect.objectContaining({
          color: '#ffffff',
        }),
        border: expect.objectContaining({
          radius: 8,
        }),
      })
    );
  });

  it('resolves nav defaults before per-item overrides and emits no inline style when nothing resolves', () => {
    const header = normalizeHeaderConfig({
      appearance: {
        navItemDefaults: {
          text: {
            color: '#ffffff',
          },
          border: {
            radius: 16,
          },
        },
      },
      nav: {
        items: [
          {
            label: 'About',
            link: {
              kind: 'builder-page',
              pageSlug: 'about',
            },
            appearance: {
              background: {
                color: '#112233',
              },
            },
          },
        ],
      },
    });

    expect(resolveHeaderNavItemAppearance(header, header.nav.items[0])).toEqual(
      expect.objectContaining({
        background: expect.objectContaining({
          color: '#112233',
        }),
        text: expect.objectContaining({
          color: '#ffffff',
        }),
        border: expect.objectContaining({
          radius: 16,
        }),
      })
    );
    expect(
      appearanceToInlineStyle(resolveHeaderShellTopAppearance(normalizeHeaderConfig({})))
    ).toBe('');
  });

  it('writes top and scrolled shell controls into header.appearance', () => {
    const { wrapper, setDraftState, markDirty, renderEditorPanel } = mountHeaderEditor();

    const topColorInput = getAppearanceControl(wrapper, {
      scope: 'shell-top',
      key: 'background.color',
      kind: 'input',
    });
    const topColorToggle = getAppearanceControl(wrapper, {
      scope: 'shell-top',
      key: 'background.color',
      kind: 'toggle',
    });
    topColorInput.value = '#112233';
    expect(topColorInput.getAttribute('aria-label')).toBe('Normal Header Background Color');
    topColorToggle.checked = true;
    topColorToggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(setDraftState.mock.lastCall[0].header.appearance.top.background.color).toBe('#112233');
    expect(markDirty).toHaveBeenCalledWith('header');
    expect(renderEditorPanel).toHaveBeenCalledTimes(1);

    const scrolledRadiusInput = getAppearanceControl(wrapper, {
      scope: 'shell-scrolled',
      key: 'border.radius',
      kind: 'input',
    });
    const scrolledRadiusToggle = getAppearanceControl(wrapper, {
      scope: 'shell-scrolled',
      key: 'border.radius',
      kind: 'toggle',
    });
    scrolledRadiusInput.value = '18';
    scrolledRadiusToggle.checked = true;
    scrolledRadiusToggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(setDraftState.mock.lastCall[0].header.appearance.scrolled.border.radius).toBe(18);
  });

  it('renders header categories collapsed and syncs appearance picker and hex fields', () => {
    const { wrapper, setDraftState, markDirty } = mountHeaderEditor();

    const sections = wrapper.querySelectorAll('.pb-inspector-section');
    expect(sections.length).toBeGreaterThanOrEqual(5);
    expect(wrapper.querySelector('.pb-inspector-section[open]')).toBeNull();

    const textSection = sections[0];
    const partsSection = sections[1];
    textSection.open = true;
    partsSection.open = true;
    expect(textSection.open).toBe(true);
    expect(partsSection.open).toBe(true);
    expect(markDirty).not.toHaveBeenCalled();
  });

  it('syncs shared appearance picker and hex inputs without saving invalid hex values', () => {
    const { wrapper, setDraftState } = mountHeaderEditor({
      draftState: {
        header: {
          appearance: {
            top: {
              background: {
                color: '#00d9ff',
              },
            },
          },
        },
        copy: {
          title: 'Header Title',
          subtitle: '',
          subtitles: [],
        },
      },
    });
    const colorPicker = wrapper.querySelector(
      '[data-appearance-input="true"][data-appearance-input-kind="picker"][data-appearance-scope="shell-top"][data-appearance-key="background.color"]'
    );
    const colorHex = wrapper.querySelector(
      '[data-appearance-input="true"][data-appearance-input-kind="hex"][data-appearance-scope="shell-top"][data-appearance-key="background.color"]'
    );

    colorPicker.value = '#445566';
    colorPicker.dispatchEvent(new Event('input', { bubbles: true }));
    expect(colorHex.value).toBe('#445566');
    expect(setDraftState.mock.lastCall[0].header.appearance.top.background.color).toBe('#445566');

    const callCount = setDraftState.mock.calls.length;
    colorHex.value = 'not-hex';
    colorHex.dispatchEvent(new Event('input', { bubbles: true }));
    expect(colorHex.getAttribute('aria-invalid')).toBe('true');
    expect(setDraftState.mock.calls.length).toBe(callCount);

    colorHex.value = '#778899';
    colorHex.dispatchEvent(new Event('input', { bubbles: true }));
    expect(colorPicker.value).toBe('#778899');
    expect(setDraftState.mock.lastCall[0].header.appearance.top.background.color).toBe('#778899');
  });

  it('writes nav defaults and per-item overrides and prunes unchecked leaves', () => {
    const { wrapper, setDraftState, renderEditorPanel } = mountHeaderEditor({
      draftState: {
        header: {
          appearance: {
            navItemDefaults: {
              border: {
                color: '#445566',
              },
            },
          },
          nav: {
            items: [
              {
                id: 'about',
                label: 'About',
                style: 'primary',
                enabled: true,
                link: {
                  kind: 'builder-page',
                  pageSlug: 'about',
                },
                appearance: {
                  background: {
                    color: '#112233',
                  },
                  border: {
                    color: '#778899',
                  },
                },
              },
            ],
          },
        },
        copy: {
          title: 'Header Title',
          subtitle: '',
          subtitles: [],
        },
      },
    });

    const defaultsTextInput = getAppearanceControl(wrapper, {
      scope: 'nav-defaults',
      key: 'text.color',
      kind: 'input',
    });
    const defaultsTextToggle = getAppearanceControl(wrapper, {
      scope: 'nav-defaults',
      key: 'text.color',
      kind: 'toggle',
    });
    defaultsTextInput.value = '#ffee00';
    defaultsTextToggle.checked = true;
    defaultsTextToggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(setDraftState.mock.lastCall[0].header.appearance.navItemDefaults.text.color).toBe(
      '#ffee00'
    );

    const itemBorderToggle = getAppearanceControl(wrapper, {
      scope: 'nav-item',
      index: 0,
      key: 'border.color',
      kind: 'toggle',
    });
    itemBorderToggle.checked = false;
    itemBorderToggle.dispatchEvent(new Event('change', { bubbles: true }));

    const rerendered = document.createElement('div');
    rerendered.innerHTML = renderHeaderEditorContent({
      draftState: setDraftState.mock.lastCall[0],
      pages: [{ slug: 'about', title: 'About' }],
    });
    expect(
      getAppearanceControl(rerendered, {
        scope: 'nav-item',
        index: 0,
        key: 'background.color',
        kind: 'toggle',
      })?.checked
    ).toBe(true);
    expect(
      getAppearanceControl(rerendered, {
        scope: 'nav-item',
        index: 0,
        key: 'border.color',
        kind: 'toggle',
      })?.checked
    ).toBe(false);
    expect(renderEditorPanel).toHaveBeenCalledTimes(2);
  });

  it('keeps link editing, item moves, and placement controls working', () => {
    const { wrapper, setDraftState, renderEditorPanel } = mountHeaderEditor({
      draftState: {
        header: {
          nav: {
            items: [
              {
                id: 'about',
                label: 'About',
                style: 'primary',
                enabled: true,
                link: {
                  kind: 'builder-page',
                  pageSlug: 'about',
                },
              },
              {
                id: 'reader',
                label: 'Reader',
                style: 'secondary',
                enabled: true,
                link: {
                  kind: 'builder-page',
                  pageSlug: 'reader',
                },
              },
            ],
          },
        },
        copy: {
          title: 'Header Title',
          subtitle: '',
          subtitles: [],
        },
      },
      pages: [
        { scope: 'series', seriesId: 'battle-bros', slug: 'about', title: 'About' },
        { scope: 'series', seriesId: 'battle-bros', slug: 'reader', title: 'Reader' },
      ],
    });

    const pageSelect = wrapper.querySelector('.pb-header-nav-input[data-item-key="pageSlug"]');
    pageSelect.value = 'reader';
    pageSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(setDraftState.mock.lastCall[0].header.nav.items[0].link.pageSlug).toBe('reader');
    expect(setDraftState.mock.lastCall[0].header.nav.items[0].link.seriesId).toBe('battle-bros');

    wrapper
      .querySelector('.pb-header-nav-item[data-item-index="0"] [data-action="move-down"]')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(setDraftState.mock.lastCall[0].header.nav.items[0].id).toBe('reader');

    wrapper
      .querySelector('.pb-header-layout-button[data-action="move-right"][data-block-id="brand"]')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(setDraftState.mock.lastCall[0].header.layoutRows.top.center).toContain('brand');
    expect(setDraftState.mock.lastCall[0].header.regions.center).toContain('brand');
    expect(renderEditorPanel).toHaveBeenCalledTimes(2);
  });

  it('names and describes placement card groups without changing move control semantics', () => {
    const { wrapper } = mountHeaderEditor({
      draftState: {
        header: {
          blocks: {
            brand: { enabled: true },
            status: { enabled: false },
          },
        },
      },
    });

    const cards = Array.from(wrapper.querySelectorAll('.pb-header-layout-card'));
    expect(cards).toHaveLength(5);

    cards.forEach((card) => {
      expect(card.getAttribute('role')).toBe('group');

      const labelId = card.getAttribute('aria-labelledby');
      const descriptionId = card.getAttribute('aria-describedby');
      expect(labelId).toBeTruthy();
      expect(descriptionId).toBeTruthy();
      expect(wrapper.querySelector(`#${labelId}`)).not.toBeNull();
      expect(wrapper.querySelector(`#${descriptionId}`)).not.toBeNull();
    });

    const brandCard = wrapper.querySelector('.pb-header-layout-card[data-block-id="brand"]');
    const statusCard = wrapper.querySelector('.pb-header-layout-card[data-block-id="status"]');
    expect(brandCard?.getAttribute('aria-labelledby')).toBe('pb-header-placement-brand-label');
    expect(brandCard?.getAttribute('aria-describedby')).toBe('pb-header-placement-brand-state');
    expect(wrapper.querySelector('#pb-header-placement-brand-label')?.textContent).toBe(
      'Logo / Title / Subtitle'
    );
    expect(wrapper.querySelector('#pb-header-placement-brand-state')?.textContent).toBe('Visible');
    expect(wrapper.querySelector('#pb-header-placement-status-state')?.textContent).toBe(
      'Hidden on this page'
    );
    expect(
      statusCard?.querySelector('.pb-header-layout-card-state')?.getAttribute('aria-hidden')
    ).toBe('true');

    const expectedBrandButtons = [
      ['move-left', 'Move Logo / Title / Subtitle left', true],
      ['move-right', 'Move Logo / Title / Subtitle right', false],
      ['move-up', 'Move Logo / Title / Subtitle up', true],
      ['move-down', 'Move Logo / Title / Subtitle down', false],
    ];
    expectedBrandButtons.forEach(([action, accessibleName, disabled]) => {
      const button = brandCard?.querySelector(`[data-action="${action}"]`);
      expect(button?.getAttribute('aria-label')).toBe(accessibleName);
      expect(button?.disabled).toBe(disabled);
    });

    const navCard = wrapper.querySelector('.pb-header-layout-card[data-block-id="nav"]');
    expect(navCard?.querySelector('[data-action="move-right"]')?.disabled).toBe(true);
  });

  it('saves and clears seriesId for header builder-page link targets', () => {
    const { wrapper, setDraftState, renderEditorPanel } = mountHeaderEditor();

    const pageSelect = wrapper.querySelector('.pb-header-nav-input[data-item-key="pageSlug"]');
    pageSelect.value = 'reader';
    pageSelect.dispatchEvent(new Event('change', { bubbles: true }));

    expect(setDraftState.mock.lastCall[0].header.nav.items[0].link).toEqual(
      expect.objectContaining({
        kind: 'builder-page',
        pageScope: 'series',
        pageSlug: 'reader',
        seriesId: 'battle-bros',
      })
    );

    const scopeSelect = wrapper.querySelector('.pb-header-nav-input[data-item-key="pageScope"]');
    scopeSelect.value = 'global';
    scopeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    expect(setDraftState.mock.lastCall[0].header.nav.items[0].link).toEqual(
      expect.objectContaining({
        kind: 'builder-page',
        pageScope: 'global',
        pageSlug: '',
        seriesId: '',
      })
    );
    expect(renderEditorPanel).toHaveBeenCalled();
  });

  it('moves a header block down into an empty row without requiring another block above it', () => {
    const { wrapper, setDraftState } = mountHeaderEditor({
      draftState: {
        header: {
          layoutRows: {
            top: {
              left: ['brand'],
              center: ['patron', 'status'],
              right: ['entryControls', 'nav'],
            },
            middle: {
              left: [],
              center: [],
              right: [],
            },
            bottom: {
              left: [],
              center: [],
              right: [],
            },
          },
          nav: { items: [] },
        },
        copy: {
          title: 'Header Title',
          subtitle: '',
          subtitles: [],
        },
      },
    });

    wrapper
      .querySelector('.pb-header-layout-button[data-action="move-down"][data-block-id="brand"]')
      ?.dispatchEvent(new Event('click', { bubbles: true }));

    const header = setDraftState.mock.lastCall[0].header;
    expect(header.layoutRows.top.left).not.toContain('brand');
    expect(header.layoutRows.middle.left).toContain('brand');
    expect(header.regions.left).toContain('brand');
  });

  it('moves header blocks left and right without changing their row', () => {
    const { wrapper, setDraftState } = mountHeaderEditor({
      draftState: {
        header: {
          layoutRows: {
            top: {
              left: ['patron', 'status'],
              center: [],
              right: ['entryControls', 'nav'],
            },
            middle: {
              left: ['brand'],
              center: [],
              right: [],
            },
            bottom: {
              left: [],
              center: [],
              right: [],
            },
          },
          nav: { items: [] },
        },
        copy: {
          title: 'Header Title',
          subtitle: '',
          subtitles: [],
        },
      },
    });

    wrapper
      .querySelector('.pb-header-layout-button[data-action="move-right"][data-block-id="brand"]')
      ?.dispatchEvent(new Event('click', { bubbles: true }));

    const header = setDraftState.mock.lastCall[0].header;
    expect(header.layoutRows.middle.left).not.toContain('brand');
    expect(header.layoutRows.middle.center).toContain('brand');
    expect(header.layoutRows.top.center).not.toContain('brand');
  });

  it('applies merged author nav link appearance, keeps admin link untouched, and toggles topbar shell state on scroll', () => {
    createHeaderDom();
    setScrollOffset(0);

    const header = normalizeHeaderConfig({
      appearance: {
        top: {
          background: {
            color: '#101820',
          },
        },
        scrolled: {
          border: {
            radius: 14,
          },
        },
        navItemDefaults: {
          text: {
            color: '#ffffff',
          },
          border: {
            radius: 16,
          },
        },
      },
      nav: {
        items: [
          {
            id: 'about',
            label: 'About',
            enabled: true,
            style: 'secondary',
            link: {
              kind: 'builder-page',
              pageSlug: 'about',
            },
            appearance: {
              background: {
                color: '#112233',
              },
            },
          },
        ],
      },
    });

    applySharedHeaderLayout(null, {
      seriesId: 'battle-bros',
      headerState: {
        header,
        copy: {
          title: 'Reader',
          subtitle: '',
          subtitles: [],
        },
      },
    });

    const topbar = document.getElementById('topbar');
    const authorLink = document.querySelector('.nav-links .nav-link:not(#adminNavLink)');
    const adminLink = document.getElementById('adminNavLink');

    expect(authorLink?.getAttribute('style')).toContain('background: #112233');
    expect(authorLink?.getAttribute('style')).toContain('color: #ffffff');
    expect(authorLink?.getAttribute('style')).toContain('border-radius: 16px');
    expect(adminLink?.hasAttribute('style')).toBe(false);
    expect(topbar?.dataset.headerAppearanceState).toBe('top');
    expect(topbar?.classList.contains('topbar--scrolled')).toBe(false);

    setScrollOffset(80);
    window.dispatchEvent(new Event('scroll'));

    expect(topbar?.dataset.headerAppearanceState).toBe('scrolled');
    expect(topbar?.classList.contains('topbar--scrolled')).toBe(true);
    expect(topbar?.getAttribute('style')).toContain('border-radius: 14px');
    expect(topbar?.style.getPropertyValue('border-radius')).toBe('14px');
  });

  it('renders only non-empty enabled header rows and cells in the live header', () => {
    createHeaderDom();

    const header = normalizeHeaderConfig({
      layoutRows: {
        top: {
          left: ['brand'],
          center: [],
          right: [],
        },
        middle: {
          left: [],
          center: ['status'],
          right: [],
        },
        bottom: {
          left: ['patron'],
          center: ['entryControls'],
          right: ['nav'],
        },
      },
      blocks: {
        brand: { enabled: true },
        patron: { enabled: false },
        status: { enabled: true },
        entryControls: { enabled: false },
        nav: { enabled: false },
      },
      nav: {
        items: [
          {
            id: 'about',
            label: 'About',
            enabled: true,
            link: {
              kind: 'builder-page',
              pageSlug: 'about',
            },
          },
        ],
      },
    });

    applySharedHeaderLayout(null, {
      headerState: {
        header,
        copy: {
          title: 'Reader',
          subtitle: '',
          subtitles: [],
        },
      },
    });

    expect(header.layoutRows.bottom.right).toContain('nav');
    expect(document.querySelectorAll('.topbar-layout-row')).toHaveLength(2);
    expect(
      document.querySelector(
        '.topbar-layout-row[data-row="top"] .topbar-region[data-region="left"] > .brand'
      )
    ).not.toBeNull();
    expect(
      document.querySelector(
        '.topbar-layout-row[data-row="middle"] .topbar-region[data-region="center"] > #statusPanel'
      )
    ).not.toBeNull();
    expect(document.querySelector('.topbar-layout-row[data-row="bottom"]')).toBeNull();
    expect(
      document.querySelector(
        '.topbar-layout-row[data-row="top"] .topbar-region[data-region="center"]'
      )
    ).toBeNull();
    expect(document.querySelector('.topbar-layout-row .nav-links')).toBeNull();
    expect(document.querySelector('.topbar-stash .nav-links')?.style.display).toBe('none');
  });

  it('clears shell appearance data, classes, and controlled inline styles when a later page has no appearance', () => {
    createHeaderDom();

    applySharedHeaderLayout(null, {
      headerState: {
        header: normalizeHeaderConfig({
          appearance: {
            top: {
              background: {
                color: '#112233',
              },
            },
          },
        }),
        copy: {
          title: 'Reader',
          subtitle: '',
          subtitles: [],
        },
      },
    });

    const topbar = document.getElementById('topbar');
    expect(topbar?.dataset.headerAppearanceState).toBe('top');
    expect(topbar?.style.getPropertyValue('background')).not.toBe('');

    applySharedHeaderLayout(null, {
      headerState: {
        header: normalizeHeaderConfig({}),
        copy: {
          title: 'Reader',
          subtitle: '',
          subtitles: [],
        },
      },
    });

    expect(topbar?.hasAttribute('data-header-appearance-state')).toBe(false);
    expect(topbar?.classList.contains('topbar--scrolled')).toBe(false);
    expect(topbar?.style.getPropertyValue('background')).toBe('');
    expect(topbar?.style.getPropertyValue('border-radius')).toBe('');
  });

  it('previews top-state shell appearance and merged nav chip appearance in the canvas', () => {
    const state = createCanvasState({
      currentPage: {
        id: 'page-1',
        slug: 'reader',
        title: 'Reader',
        pageType: 'custom',
        sections: [],
        meta: {
          header: {
            version: 3,
            copy: {
              title: 'Reader',
              subtitle: '',
              subtitles: [],
            },
            appearance: {
              top: {
                background: {
                  color: '#112233',
                },
                border: {
                  radius: 18,
                },
              },
              navItemDefaults: {
                text: {
                  color: '#ffffff',
                },
              },
            },
            nav: {
              items: [
                {
                  id: 'about',
                  label: 'About',
                  enabled: true,
                  style: 'primary',
                  link: {
                    kind: 'builder-page',
                    pageSlug: 'about',
                  },
                  appearance: {
                    background: {
                      color: '#445566',
                    },
                  },
                },
              ],
            },
          },
        },
      },
    });

    const snapshot = renderCanvasSnapshot({
      state,
      helpers: createCanvasHelpers(),
    });
    const wrapper = document.createElement('div');
    wrapper.innerHTML = snapshot.canvasHtml;

    expect(wrapper.querySelector('.pb-page-header-surface')?.getAttribute('style')).toContain(
      'background: #112233'
    );
    expect(wrapper.querySelector('.pb-page-header-surface')?.getAttribute('style')).toContain(
      'border-radius: 18px'
    );
    const aboutChip = Array.from(wrapper.querySelectorAll('.pb-page-header-chip')).find(
      (chip) => chip.textContent?.trim() === 'About'
    );

    expect(aboutChip?.getAttribute('style')).toContain('background: #445566');
    expect(aboutChip?.getAttribute('style')).toContain('color: #ffffff');
  });
});

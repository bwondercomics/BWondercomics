import { afterEach, describe, expect, it, vi } from 'vitest';

import { appearanceToInlineStyle } from '../admin/page-builder/appearance-utils.js';
import { renderCanvasSnapshot } from '../admin/page-builder/canvas-renderer.js';
import {
  bindHeaderEditorEvents,
  renderHeaderEditorContent,
} from '../admin/page-builder/header-editor.js';
import {
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
    { slug: 'about', title: 'About' },
    { slug: 'reader', title: 'Reader' },
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
    expect(topColorInput.getAttribute('aria-label')).toBe('Top Background Color');
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
        { slug: 'about', title: 'About' },
        { slug: 'reader', title: 'Reader' },
      ],
    });

    const pageSelect = wrapper.querySelector('.pb-header-nav-input[data-item-key="pageSlug"]');
    pageSelect.value = 'reader';
    pageSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(setDraftState.mock.lastCall[0].header.nav.items[0].link.pageSlug).toBe('reader');

    wrapper
      .querySelector('.pb-header-nav-item[data-item-index="0"] [data-action="move-down"]')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(setDraftState.mock.lastCall[0].header.nav.items[0].id).toBe('reader');

    wrapper
      .querySelector('.pb-header-layout-button[data-action="move-right"][data-block-id="brand"]')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(setDraftState.mock.lastCall[0].header.regions.center).toContain('brand');
    expect(renderEditorPanel).toHaveBeenCalledTimes(2);
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

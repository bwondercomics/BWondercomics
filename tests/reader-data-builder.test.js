import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyBuilderPageToDOM,
  loadBuilderPage,
  extractSubtitlesFromBuilderPage,
  loadHomepageBuilderPage,
  loadPageConfigWithFallback,
  resolveBuilderPageReaderSeriesId,
} from '../reader/data.js';
import { resolvePageHeaderState } from '../admin/page-builder/header-config.js';
import { buildContractFixture, getContractFixture } from './helpers/contracts.js';
import { flushReaderUi, mountReaderDom, stubReaderGlobals } from './helpers/reader-fixture.js';

function jsonResponse(body, options = {}) {
  const { ok = true, status = 200, statusText = 'OK' } = options;
  return {
    ok,
    status,
    statusText,
    json: async () => body,
  };
}

function buildPanelSnapshot({ meta = {}, sectionSettings = {} } = {}) {
  const page = getContractFixture('builderPage');
  page.sections = [
    {
      id: 'panel-row',
      sectionType: 'row',
      layout: '1-1',
      sortIndex: 0,
      settings: { ...sectionSettings },
      modules: [
        {
          id: 'left-panel-text',
          moduleType: 'text',
          columnIndex: 0,
          sortIndex: 0,
          config: {
            content: '<p>Left panel</p>',
          },
        },
        {
          id: 'right-panel-text',
          moduleType: 'text',
          columnIndex: 1,
          sortIndex: 0,
          config: {
            content: '<p>Right panel</p>',
          },
        },
      ],
    },
  ];
  page.meta = {
    header: page.meta.header,
    ...meta,
  };
  return page;
}

describe('reader builder presentation loading', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mountReaderDom();
    stubReaderGlobals(vi);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('prefers a published builder page and extracts header subtitles', async () => {
    const builderPage = getContractFixture('builderPage');
    const setSubtitles = vi.fn();
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/pages/home/battle-bros') {
        return jsonResponse({ page: builderPage });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadPageConfigWithFallback(setSubtitles, 'battle-bros');

    expect(result).toEqual({ source: 'builder', page: builderPage });
    expect(setSubtitles).toHaveBeenCalledWith(['Hero Time', 'Lunch Break Justice']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/pages/home/battle-bros']);
    expect(extractSubtitlesFromBuilderPage(builderPage, null)).toEqual([
      'Hero Time',
      'Lunch Break Justice',
    ]);
    expect(console.log).not.toHaveBeenCalled();
  });

  it('resolves reader module source by page scope without allowing all-series readers', () => {
    const page = buildContractFixture('builderPage', {
      seriesId: 'battle-bros',
      sections: [
        {
          id: 'reader-section',
          layout: '1',
          modules: [
            {
              id: 'reader-module',
              moduleType: 'reader',
              columnIndex: 0,
              sortIndex: 0,
              config: { source: { mode: 'specific-series', seriesId: 'other-series' } },
            },
          ],
        },
      ],
    });

    expect(resolveBuilderPageReaderSeriesId(page, 'battle-bros')).toBe('battle-bros');
    page.sections[0].modules[0].config.source = { mode: 'all-series', seriesId: 'bad-series' };
    expect(resolveBuilderPageReaderSeriesId(page, 'battle-bros')).toBe('battle-bros');
    page.sections[0].modules[0].config.source = { mode: 'active-page-series' };
    expect(resolveBuilderPageReaderSeriesId(page, 'fallback-series')).toBe('battle-bros');
    page.scope = 'global';
    page.seriesId = null;
    page.sections[0].modules[0].config.source = {
      mode: 'specific-series',
      seriesId: 'other-series',
    };
    expect(resolveBuilderPageReaderSeriesId(page, 'battle-bros')).toBe('other-series');
  });

  it('loads a published custom builder page by slug without falling back to legacy config', async () => {
    const aboutPage = buildContractFixture('builderPage', {
      slug: 'about',
      title: 'About Battle Bros',
      isPublished: true,
    });
    const setSubtitles = vi.fn();
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/pages/battle-bros/about') {
        return jsonResponse({ page: aboutPage });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadPageConfigWithFallback(setSubtitles, 'battle-bros', {
      pageSlug: 'about',
    });

    expect(result).toEqual({ source: 'builder', page: aboutPage });
    expect(setSubtitles).toHaveBeenCalledWith(['Hero Time', 'Lunch Break Justice']);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/pages/battle-bros/about']);
  });

  it('loads global builder pages through the global public route', async () => {
    const globalPage = buildContractFixture('builderPageDraft', {
      scope: 'global',
      seriesId: null,
      slug: 'about',
      title: 'Global About',
      isPublished: true,
    });
    const setSubtitles = vi.fn();
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/pages/global/by-slug/about') {
        return jsonResponse({ page: globalPage });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadPageConfigWithFallback(setSubtitles, 'battle-bros', {
      pageSlug: 'about',
      pageScope: 'global',
    });

    expect(result).toEqual({ source: 'builder', page: globalPage });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/pages/global/by-slug/about']);
  });

  it('loads unpublished draft pages through the admin slug endpoint', async () => {
    const draftPage = buildContractFixture('builderPage', {
      slug: 'about',
      title: 'About Draft',
      isPublished: false,
    });
    const setSubtitles = vi.fn();
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/admin/pages/series/battle-bros/by-slug/about') {
        return jsonResponse({ page: draftPage });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadPageConfigWithFallback(setSubtitles, 'battle-bros', {
      pageSlug: 'about',
      draft: true,
    });

    expect(result).toEqual({ source: 'builder', page: draftPage });
    expect(setSubtitles).toHaveBeenCalledWith(['Hero Time', 'Lunch Break Justice']);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/admin/pages/series/battle-bros/by-slug/about',
    ]);
  });

  it('keeps startup source results constrained to builder or none without page-config fetches', async () => {
    const builderPage = getContractFixture('builderPage');
    const scenarios = [
      {
        endpoint: '/api/pages/home/battle-bros',
        response: jsonResponse({ page: builderPage }),
        expected: { source: 'builder', page: builderPage },
        expectedKeys: ['page', 'source'],
      },
      {
        endpoint: '/api/pages/home/battle-bros',
        response: jsonResponse({}, { ok: false, status: 404, statusText: 'Not Found' }),
        expected: { source: 'none' },
        expectedKeys: ['source'],
      },
    ];

    for (const scenario of scenarios) {
      const setSubtitles = vi.fn();
      const fetchMock = vi.fn(async (url) => {
        if (url === scenario.endpoint) {
          return scenario.response;
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await loadPageConfigWithFallback(setSubtitles, 'battle-bros');

      expect(['builder', 'none']).toContain(result.source);
      expect(result).toEqual(scenario.expected);
      expect(Object.keys(result).sort()).toEqual(scenario.expectedKeys);
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('page-config.json'))).toBe(
        false
      );
    }
  });

  it('loads the effective homepage page for public series roots', async () => {
    const builderPage = buildContractFixture('builderPage', {
      slug: 'landing',
      title: 'Landing',
      isHomepage: true,
    });
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/pages/home/battle-bros') {
        return jsonResponse({ page: builderPage });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadHomepageBuilderPage('battle-bros');

    expect(result).toEqual(builderPage);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('loads the effective homepage page for admin draft preview roots', async () => {
    const draftHomepage = buildContractFixture('builderPageDraft', {
      slug: 'landing',
      title: 'Landing',
      isHomepage: true,
    });
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/admin/pages/home/battle-bros') {
        return jsonResponse({ page: draftHomepage });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadHomepageBuilderPage('battle-bros', { draft: true });

    expect(result).toEqual(draftHomepage);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns none when no builder page exists without loading legacy page-config', async () => {
    const setSubtitles = vi.fn();
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/pages/home/battle-bros') {
        return jsonResponse({}, { ok: false, status: 404, statusText: 'Not Found' });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadPageConfigWithFallback(setSubtitles, 'battle-bros');

    expect(result).toEqual({ source: 'none' });
    expect(setSubtitles).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/pages/home/battle-bros']);
  });

  it('does not use legacy fallback for non-reader page slugs', async () => {
    const setSubtitles = vi.fn();
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/pages/battle-bros/about') {
        return jsonResponse({}, { ok: false, status: 404, statusText: 'Not Found' });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadPageConfigWithFallback(setSubtitles, 'battle-bros', {
      pageSlug: 'about',
    });

    expect(result).toEqual({ source: 'none' });
    expect(setSubtitles).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/pages/battle-bros/about']);
  });

  it('ignores stale pb-no-fallback state when the builder page is missing', async () => {
    localStorage.setItem('pb-no-fallback', '1');
    const setSubtitles = vi.fn();
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/pages/home/battle-bros') {
        return jsonResponse({}, { ok: false, status: 404, statusText: 'Not Found' });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadPageConfigWithFallback(setSubtitles, 'battle-bros');

    expect(result).toEqual({ source: 'none' });
    expect(setSubtitles).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/pages/home/battle-bros']);
  });

  it('returns null when a draft page request is denied', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/admin/pages/series/battle-bros/by-slug/about') {
        return jsonResponse({}, { ok: false, status: 403, statusText: 'Forbidden' });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadBuilderPage('about', 'battle-bros', { draft: true });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('applies the builder page contract to the live reader DOM', async () => {
    const builderPage = getContractFixture('builderPage');
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/posts/latest') {
        return jsonResponse({ post: getContractFixture('latestPost') });
      }
      if (url === '/api/posts') {
        return jsonResponse({ posts: getContractFixture('feedPosts') });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    applyBuilderPageToDOM(builderPage, { seriesId: 'battle-bros' });
    await flushReaderUi(4);

    expect(document.querySelector('.topbar .title h1')?.textContent).toBe('Battle Bros');
    expect(document.getElementById('subtitle')?.textContent).toBe('Hero Time');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#ffcc00');
    expect(document.documentElement.style.getPropertyValue('--bg-panel')).toBe('#151a33');

    const leftPanel = document.getElementById('leftPanel');
    const rightPanel = document.getElementById('rightPanel');
    const leftBuilder = leftPanel?.querySelector('.panel-builder--left');
    const rightBuilder = rightPanel?.querySelector('.panel-builder--right');

    expect(leftPanel?.style.getPropertyValue('--panel-bg-image')).toContain(
      '/assets/media/panels/left-grid.png'
    );
    expect(rightPanel?.style.getPropertyValue('--panel-bg-image')).toContain(
      '/assets/media/panels/right-burst.png'
    );
    expect(leftBuilder?.style.getPropertyValue('--pb-panel-gap')).toBe('18px');
    expect(rightBuilder?.style.getPropertyValue('--pb-panel-gap')).toBe('26px');
    expect(leftBuilder?.querySelector('.pb-module--promo')).not.toBeNull();
    expect(rightBuilder?.querySelector('.pb-module--feed')).not.toBeNull();
    expect(rightBuilder?.querySelector('.latest-name')?.textContent).toBe('Issue 10 Released');
  });

  it('renders entry-gallery modules through the reader shell panel stack', async () => {
    const entryGallery = getContractFixture('builderModules')['entry-gallery'];
    const builderPage = buildContractFixture('builderPage', {
      sections: [
        {
          id: 'entry-gallery-section',
          sectionType: 'row',
          layout: '1',
          sortIndex: 0,
          settings: {},
          modules: [
            {
              ...entryGallery,
              config: {
                ...entryGallery.config,
                source: { mode: 'active-page-series' },
                showLabels: true,
              },
            },
          ],
        },
      ],
    });
    const fetchMock = vi.fn(async (url) => {
      if (url === 'data.json') {
        return jsonResponse({
          entries: { Issue: ['media/issue.jpg'] },
          entryMeta: { Issue: { displayNumber: 1, showInGallery: true } },
          unitLabelSingular: 'Issue',
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    applyBuilderPageToDOM(builderPage, { seriesId: 'battle-bros' });
    await flushReaderUi(4);

    const leftBuilder = document.querySelector('#leftPanel .panel-builder--left');
    expect(leftBuilder?.querySelector('.pb-module--entry-gallery')).not.toBeNull();
    expect(leftBuilder?.querySelector('.pb-entry-gallery-item')?.textContent).toContain(
      'Issue 1 - Issue'
    );
  });

  it('mounts the reader shell contract used by preview and runtime page application', () => {
    expect(document.querySelector('header.topbar#topbar')).not.toBeNull();
    expect(document.querySelector('.viewerWrap')).not.toBeNull();
    expect(document.getElementById('leftPanel')).not.toBeNull();
    expect(document.getElementById('mainContent')).not.toBeNull();
    expect(document.getElementById('viewport')).not.toBeNull();
    expect(document.getElementById('controls')).not.toBeNull();
    expect(document.getElementById('rightPanel')).not.toBeNull();
  });

  it('emits and cleans builder editing markers in the reader shell', () => {
    const builderPage = buildPanelSnapshot();

    applyBuilderPageToDOM(builderPage, {
      seriesId: 'battle-bros',
      previewMode: true,
      builderEditing: true,
    });

    const header = document.querySelector('header.topbar#topbar');
    const leftSection = document.querySelector('#leftPanel .pb-builder-panel-section');
    const leftColumn = document.querySelector('#leftPanel .pb-builder-panel-column');
    const leftModule = document.querySelector('#leftPanel .pb-module');

    expect(document.body.dataset.builderPageId).toBe(builderPage.id);
    expect(document.querySelector('.viewerWrap')?.dataset.builderPageId).toBe(builderPage.id);
    expect(header?.dataset.builderPageId).toBe(builderPage.id);
    expect(header?.dataset.builderSurface).toBe('page-header');
    expect(leftSection?.dataset.builderSectionId).toBe('panel-row');
    expect(leftSection?.dataset.builderSectionIndex).toBe('0');
    expect(leftSection?.dataset.builderLayout).toBe('1-1');
    expect(leftColumn?.dataset.builderColumnIndex).toBe('0');
    expect(leftModule?.dataset.builderModuleId).toBe('left-panel-text');
    expect(leftModule?.dataset.builderModuleType).toBe('text');

    applyBuilderPageToDOM(builderPage, {
      seriesId: 'battle-bros',
      previewMode: true,
    });

    expect(document.body.hasAttribute('data-builder-page-id')).toBe(false);
    expect(document.querySelector('.viewerWrap')?.hasAttribute('data-builder-page-id')).toBe(false);
    expect(header?.hasAttribute('data-builder-page-id')).toBe(false);
    expect(header?.hasAttribute('data-builder-surface')).toBe(false);
    expect(document.querySelector('[data-builder-section-id]')).toBeNull();
    expect(document.querySelector('[data-builder-column-index]')).toBeNull();
    expect(document.querySelector('[data-builder-module-id]')).toBeNull();
  });

  it('keeps right-panel modules selectable when a builder device layout collapses columns', () => {
    const builderPage = buildPanelSnapshot({
      sectionSettings: {
        responsive: {
          mobile: {
            layout: '1',
          },
        },
      },
    });

    applyBuilderPageToDOM(builderPage, {
      seriesId: 'battle-bros',
      previewMode: true,
      builderEditing: true,
      deviceId: 'mobile',
    });

    const rightPanel = document.getElementById('rightPanel');
    const rightColumn = rightPanel?.querySelector(
      '.pb-builder-panel-column[data-builder-column-index="1"]'
    );
    const rightModule = rightPanel?.querySelector(
      '.pb-module[data-builder-module-id="right-panel-text"]'
    );

    expect(rightPanel?.classList.contains('side-panel--empty')).toBe(false);
    expect(rightColumn).not.toBeNull();
    expect(rightModule).not.toBeNull();
    expect(rightModule?.dataset.builderModuleType).toBe('text');
  });

  it('keeps non-builder panel routing governed by global structure', () => {
    const builderPage = buildPanelSnapshot();
    builderPage.sections[0].layout = '1';

    applyBuilderPageToDOM(builderPage, {
      seriesId: 'battle-bros',
      deviceId: 'mobile',
    });

    expect(
      document
        .getElementById('rightPanel')
        ?.querySelector('.pb-module[data-builder-module-id="right-panel-text"]')
    ).toBeNull();
    expect(document.getElementById('rightPanel')?.classList.contains('side-panel--empty')).toBe(
      true
    );
  });

  it('clears stale page theme variables before applying the next snapshot', () => {
    const themedPage = getContractFixture('builderPage');
    const defaultThemePage = getContractFixture('builderPage');
    delete defaultThemePage.meta.theme;

    applyBuilderPageToDOM(themedPage, { seriesId: 'battle-bros' });

    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#ffcc00');
    expect(document.documentElement.style.getPropertyValue('--bg-panel')).toBe('#151a33');

    applyBuilderPageToDOM(defaultThemePage, { seriesId: 'battle-bros' });

    [
      '--primary',
      '--secondary',
      '--accent',
      '--bg-dark',
      '--bg-panel',
      '--text',
      '--danger',
    ].forEach((cssVar) => {
      expect(document.documentElement.style.getPropertyValue(cssVar)).toBe('');
    });
  });

  it('resets panel background, spacing, and visibility state between snapshots', () => {
    const firstPage = buildPanelSnapshot({
      sectionSettings: {
        panelEnabled: {
          left: true,
          right: false,
        },
      },
      meta: {
        theme: {},
        panelSpacing: {
          left: 18,
          right: 26,
        },
        panelBackgrounds: {
          left: {
            path: 'media/panels/left-grid.png',
            fit: 'contain',
            focus: 'top',
            opacity: 0.42,
          },
          right: {
            path: 'media/panels/right-burst.png',
            fit: 'cover',
            focus: 'center',
            opacity: 0.6,
          },
        },
      },
    });

    const secondPage = buildPanelSnapshot({
      meta: {
        theme: {},
        panelBackgrounds: {
          left: {
            path: 'media/panels/left-second.png',
          },
        },
      },
    });

    applyBuilderPageToDOM(firstPage, { seriesId: 'battle-bros' });

    const leftPanel = document.getElementById('leftPanel');
    const rightPanel = document.getElementById('rightPanel');
    const leftBuilder = leftPanel?.querySelector('.panel-builder--left');
    const rightBuilder = rightPanel?.querySelector('.panel-builder--right');

    expect(leftPanel?.style.getPropertyValue('--panel-bg-opacity')).toBe('0.42');
    expect(rightPanel?.style.getPropertyValue('--panel-bg-opacity')).toBe('0.6');
    expect(leftBuilder?.style.getPropertyValue('--pb-panel-gap')).toBe('18px');
    expect(rightBuilder?.style.getPropertyValue('--pb-panel-gap')).toBe('26px');
    expect(rightPanel?.style.display).toBe('none');

    applyBuilderPageToDOM(secondPage, { seriesId: 'battle-bros' });

    expect(leftPanel?.style.getPropertyValue('--panel-bg-image')).toContain(
      '/assets/media/panels/left-second.png'
    );
    expect(leftPanel?.style.getPropertyValue('--panel-bg-size')).toBe('cover');
    expect(leftPanel?.style.getPropertyValue('--panel-bg-position')).toBe('center');
    expect(leftPanel?.style.getPropertyValue('--panel-bg-opacity')).toBe('');
    expect(rightPanel?.style.getPropertyValue('--panel-bg-image')).toBe('');
    expect(rightPanel?.style.getPropertyValue('--panel-bg-opacity')).toBe('');
    expect(leftBuilder?.style.getPropertyValue('--pb-panel-gap')).toBe('');
    expect(rightBuilder?.style.getPropertyValue('--pb-panel-gap')).toBe('');
    expect(rightPanel?.style.display).toBe('');
  });

  it('uses first-class page header copy before legacy header-module fallback', () => {
    const builderPage = getContractFixture('builderPage');
    builderPage.meta.header.copy.title = 'Meta Header';
    builderPage.meta.header.copy.subtitle = 'Meta Subtitle';
    builderPage.meta.header.copy.subtitles = ['Meta One', 'Meta Two'];
    builderPage.sections[0].modules[0].config.title = 'Legacy Header';
    builderPage.sections[0].modules[0].config.subtitle = 'Legacy Subtitle';
    builderPage.sections[0].modules[0].config.subtitles = ['Legacy One'];

    applyBuilderPageToDOM(builderPage, { seriesId: 'battle-bros' });

    expect(document.querySelector('.topbar .title h1')?.textContent).toBe('Meta Header');
    expect(document.getElementById('subtitle')?.textContent).toBe('Meta Subtitle');
    expect(extractSubtitlesFromBuilderPage(builderPage, null)).toEqual(['Meta One', 'Meta Two']);
  });

  it('uses legacy header copy fallback when a page only has v2 layout config', () => {
    const builderPage = getContractFixture('builderPage');
    const pageConfig = getContractFixture('pageConfig');
    builderPage.meta.header = {
      version: 2,
      regions: {
        left: ['brand'],
        center: ['nav'],
        right: ['entryControls', 'status', 'patron'],
      },
      blocks: {
        brand: { enabled: true },
        patron: { enabled: true },
        status: { enabled: true },
        entryControls: { enabled: true },
        nav: { enabled: true },
      },
      nav: {
        items: [
          {
            id: 'legacy-nav',
            label: 'Legacy Nav',
            enabled: true,
            link: { kind: 'url', url: 'comics.html', openInNewTab: false },
          },
        ],
      },
    };
    builderPage.sections[0].modules[0].config.title = 'Legacy Header';
    builderPage.sections[0].modules[0].config.subtitle = 'Legacy Subtitle';
    builderPage.sections[0].modules[0].config.subtitles = ['Legacy One', 'Legacy Two'];

    applyBuilderPageToDOM(builderPage, { pageConfig, seriesId: 'battle-bros' });

    expect(document.querySelector('.topbar .title h1')?.textContent).toBe('Legacy Header');
    expect(document.getElementById('subtitle')?.textContent).toBe('Legacy Subtitle');
    expect(extractSubtitlesFromBuilderPage(builderPage, pageConfig)).toEqual([
      'Legacy One',
      'Legacy Two',
    ]);
  });

  it('applies page-level header config without legacy page-config fallback', () => {
    const builderPage = getContractFixture('builderPage');

    applyBuilderPageToDOM(builderPage, { seriesId: 'battle-bros' });

    expect(document.querySelector('.topbar-layout')).not.toBeNull();
    expect(document.querySelector('.topbar-region[data-region="left"] .brand')).not.toBeNull();
    expect(
      document.querySelector('.topbar-region[data-region="center"] .nav-links')
    ).not.toBeNull();
    expect(
      document.querySelector('.topbar-region[data-region="right"] #statusPanel')
    ).not.toBeNull();
    expect(document.querySelector('.nav-links .nav-link')?.textContent).toBe('About');
    expect(document.querySelector('.nav-links .nav-link')?.getAttribute('href')).toContain(
      'index.html?series=battle-bros&page=about'
    );
  });

  it('uses the same resolved header state for reader copy and layout application', () => {
    const builderPage = getContractFixture('builderPage');
    builderPage.meta.header.copy.title = 'Parity Header';
    builderPage.meta.header.copy.subtitle = 'Parity Subtitle';
    builderPage.meta.header.regions = {
      left: ['brand'],
      center: ['nav'],
      right: ['status', 'entryControls', 'patron'],
    };
    builderPage.meta.header.appearance = {
      top: {
        background: {
          color: '#123456',
        },
      },
      navItemDefaults: {
        text: {
          color: '#ffffff',
        },
      },
    };
    builderPage.meta.header.nav.items = [
      {
        id: 'nav-secondary',
        label: 'About',
        enabled: true,
        style: 'secondary',
        link: {
          kind: 'builder-page',
          pageSlug: 'about',
        },
      },
    ];

    const headerState = resolvePageHeaderState({
      page: builderPage,
      pageConfig: null,
    });

    applyBuilderPageToDOM(builderPage, { seriesId: 'battle-bros' });

    expect(document.querySelector('.topbar .title h1')?.textContent).toBe(headerState.copy.title);
    expect(document.getElementById('subtitle')?.textContent).toBe(headerState.copy.subtitle);
    expect(
      document.querySelector('.topbar-region[data-region="center"] > .nav-links')
    ).not.toBeNull();
    expect(
      document.querySelector('.topbar-region[data-region="right"] > #statusPanel')
    ).not.toBeNull();
    expect(
      document.querySelector('.nav-links .nav-link')?.classList.contains('nav-link--secondary')
    ).toBe(true);
    expect(headerState.meta.appearance).toEqual({
      top: {
        background: {
          type: null,
          color: '#123456',
          secondaryColor: null,
          angle: null,
          opacity: null,
        },
        text: {
          color: null,
        },
        border: {
          width: null,
          style: null,
          color: null,
          opacity: null,
          radius: null,
        },
      },
      scrolled: null,
      navItemDefaults: {
        background: {
          type: null,
          color: null,
          secondaryColor: null,
          angle: null,
          opacity: null,
        },
        text: {
          color: '#ffffff',
        },
        border: {
          width: null,
          style: null,
          color: null,
          opacity: null,
          radius: null,
        },
      },
    });
    expect(headerState.header.appearance).toEqual(headerState.meta.appearance);
  });

  it('applies header responsive appearance only in builder device context', () => {
    const builderPage = getContractFixture('builderPage');
    builderPage.meta.header.appearance = {
      top: {
        background: {
          color: '#112233',
        },
      },
    };
    builderPage.meta.responsive = {
      mobile: {
        header: {
          appearance: {
            top: {
              background: {
                color: '#445566',
              },
            },
          },
        },
      },
    };

    applyBuilderPageToDOM(builderPage, {
      seriesId: 'battle-bros',
      deviceId: 'mobile',
    });
    expect(document.getElementById('topbar')?.getAttribute('style')).toContain(
      'background: #112233'
    );

    applyBuilderPageToDOM(builderPage, {
      seriesId: 'battle-bros',
      builderEditing: true,
      deviceId: 'mobile',
    });
    expect(document.getElementById('topbar')?.getAttribute('style')).toContain(
      'background: #445566'
    );

    applyBuilderPageToDOM(builderPage, {
      seriesId: 'battle-bros',
      builderEditing: true,
      deviceId: 'tablet',
    });
    expect(document.getElementById('topbar')?.getAttribute('style')).toContain(
      'background: #112233'
    );
  });

  it('keeps live reader parity with backfilled V3 header metadata', () => {
    const builderPage = getContractFixture('builderPage');
    delete builderPage.meta.headerOverrides;
    builderPage.meta.header = {
      version: 3,
      copy: {
        title: 'Legacy Imported Header',
        subtitle: 'Legacy Imported Subtitle',
        subtitles: ['Legacy Imported Subtitle', 'Backfilled Extra'],
      },
      regions: {
        left: ['brand'],
        center: ['patron'],
        right: ['status', 'entryControls', 'nav'],
      },
      blocks: {
        brand: { enabled: true },
        patron: { enabled: true },
        status: { enabled: false },
        entryControls: { enabled: true },
        nav: { enabled: true },
      },
      appearance: {
        top: {
          background: {
            color: '#112233',
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
            id: 'backfilled-nav',
            label: 'Archive',
            enabled: true,
            style: 'secondary',
            appearance: {
              background: {
                color: '#445566',
              },
            },
            link: {
              kind: 'url',
              url: 'comics.html',
              openInNewTab: false,
            },
          },
        ],
      },
    };

    const headerState = resolvePageHeaderState({
      page: builderPage,
      pageConfig: null,
    });

    applyBuilderPageToDOM(builderPage, { seriesId: 'battle-bros' });

    const topbar = document.getElementById('topbar');
    const archiveLink = document.querySelector('.nav-links .nav-link:not(#adminNavLink)');

    expect(headerState.source).toBe('page-meta-v3');
    expect(headerState.copy).toEqual(builderPage.meta.header.copy);
    expect(headerState.header.regions).toEqual(builderPage.meta.header.regions);
    expect(headerState.header.blocks.status.enabled).toBe(false);
    expect(document.querySelector('.topbar .title h1')?.textContent).toBe(headerState.copy.title);
    expect(document.getElementById('subtitle')?.textContent).toBe(headerState.copy.subtitle);
    expect(
      document.querySelector('.topbar-region[data-region="center"] > #patronWelcome')
    ).not.toBeNull();
    expect(document.querySelector('.topbar-region[data-region="right"] > #statusPanel')).toBeNull();
    expect(
      document.querySelector('.topbar-region[data-region="right"] > .entry-controls')
    ).not.toBeNull();
    expect(
      document.querySelector('.topbar-region[data-region="right"] > .nav-links')
    ).not.toBeNull();
    expect(topbar?.getAttribute('style')).toContain('background: #112233');
    expect(archiveLink?.textContent).toBe('Archive');
    expect(archiveLink?.classList.contains('nav-link--secondary')).toBe(true);
    expect(archiveLink?.getAttribute('href')).toContain('comics.html');
    expect(archiveLink?.getAttribute('style')).toContain('background: #445566');
    expect(archiveLink?.getAttribute('style')).toContain('color: #ffffff');
  });

  it('falls back to legacy shared header config plus page overrides when page.meta.header is missing', () => {
    const builderPage = buildContractFixture('builderPageDraft', {
      meta: {
        headerOverrides: {
          hiddenBlockIds: ['status'],
        },
      },
    });
    const pageConfig = getContractFixture('pageConfig');

    applyBuilderPageToDOM(builderPage, { pageConfig, seriesId: 'battle-bros' });

    expect(document.querySelector('.topbar-layout')).not.toBeNull();
    expect(document.querySelector('.topbar-region[data-region="left"] .brand')).not.toBeNull();
    expect(document.querySelector('.topbar-region[data-region="right"] .nav-links')).not.toBeNull();
    expect(document.querySelector('.nav-links .nav-link')?.textContent).toBe('Comics');
    expect(document.getElementById('statusPanel')?.style.display).toBe('none');
  });

  it('uses the current empty-panel behavior and hideEmptyText contract', () => {
    const basePage = getContractFixture('builderPage');
    const emptyPage = buildContractFixture('builderPage', {
      sections: [basePage.sections[0]],
      meta: {
        panelBackgrounds: {
          right: {
            hideEmptyText: true,
          },
        },
      },
    });

    applyBuilderPageToDOM(emptyPage);

    const leftBuilder = document.getElementById('leftPanel')?.querySelector('.panel-builder--left');
    const leftPanel = document.getElementById('leftPanel');
    const rightBuilder = document
      .getElementById('rightPanel')
      ?.querySelector('.panel-builder--right');
    const rightPanel = document.getElementById('rightPanel');

    expect(leftBuilder?.textContent).toContain('No panel modules.');
    expect(rightBuilder?.textContent?.trim() || '').toBe('');
    expect(leftPanel?.classList.contains('side-panel--empty')).toBe(true);
    expect(rightPanel?.classList.contains('side-panel--empty')).toBe(true);
    expect(leftBuilder?.classList.contains('panel-builder--empty')).toBe(true);
    expect(rightBuilder?.classList.contains('panel-builder--empty')).toBe(true);
  });
});

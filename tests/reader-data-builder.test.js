import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyBuilderPageToDOM,
  loadBuilderPage,
  loadEntryData,
  extractSubtitlesFromBuilderPage,
  loadHomepageBuilderPage,
  loadPageConfigWithFallback,
  resolveBuilderPageReaderSeriesId,
  PANEL_MODULE_TYPES,
} from '../reader/data.js';
import { resolvePageHeaderState } from '../admin/page-builder/header-config.js';
import { getInsertableModuleDescriptors } from '../admin/page-builder/module-descriptors.js';
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
  const readerModule = getContractFixture('builderModules').reader;
  page.sections = [
    {
      id: 'panel-row',
      sectionType: 'row',
      layout: '1-1',
      sortIndex: 0,
      settings: { ...sectionSettings },
      modules: [
        {
          ...readerModule,
          id: 'reader-shell-module',
          columnIndex: 0,
          sortIndex: -1,
          config: {
            ...readerModule.config,
            source: { mode: 'active-page-series' },
          },
        },
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

function buildReaderShellPage(overrides = {}) {
  const page = buildContractFixture('builderPage', overrides);
  const readerModule = getContractFixture('builderModules').reader;
  page.sections = [
    {
      id: 'reader-shell-section',
      sectionType: 'row',
      layout: '1',
      sortIndex: -1,
      settings: {},
      modules: [
        {
          ...readerModule,
          id: 'reader-shell-module',
          columnIndex: 0,
          sortIndex: 0,
          config: {
            ...readerModule.config,
            source: { mode: 'active-page-series' },
          },
        },
      ],
    },
    ...(Array.isArray(page.sections) ? page.sections : []),
  ];
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

  it('preserves a scheduled empty entry from the public payload for bound-reader startup', async () => {
    const fetchMock = vi.fn(async (url, options) => {
      expect(url).toBe('data.json');
      expect(options).toEqual({ cache: 'no-store' });
      return jsonResponse({
        entries: {
          Published: ['comics/published/01.png'],
          Scheduled: [],
        },
        entryMeta: {
          Published: { status: 'published', showInDropdown: true },
          Scheduled: {
            status: 'scheduled',
            publishAt: '2099-01-01T00:00:00.000Z',
            showInDropdown: true,
          },
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadEntryData('battle-bros');

    expect(result.entries.Scheduled).toEqual([]);
    expect(result.entryOrder).toContain('Scheduled');
    expect(result.entryMeta.Scheduled).toMatchObject({
      status: 'scheduled',
      publishAt: '2099-01-01T00:00:00.000Z',
    });
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

  it('renders series pages without reader modules as normal builder content', async () => {
    const builderPage = buildContractFixture('builderPage', {
      slug: 'about',
      title: 'About',
      pageType: 'custom',
    });
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/posts') {
        return jsonResponse({ posts: getContractFixture('feedPosts') });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const shellState = applyBuilderPageToDOM(builderPage, { seriesId: 'battle-bros' });
    await flushReaderUi(4);

    const builderContent = document.getElementById('builderPageContent');
    expect(shellState).toEqual({ active: false, reason: 'no-reader-module' });
    expect(document.body.dataset.readerShell).toBe('inactive');
    expect(builderContent?.hidden).toBe(false);
    expect(builderContent?.querySelector('.pb-page')).not.toBeNull();
    expect(builderContent?.querySelector('.pb-module--text')).not.toBeNull();
    expect(document.querySelector('.viewerWrap')?.hidden).toBe(true);
    expect(document.getElementById('controls')?.hidden).toBe(true);
    expect(document.getElementById('leftPanel')?.hidden).toBe(true);
    expect(document.getElementById('rightPanel')?.hidden).toBe(true);
    expect(document.getElementById('comicCommentsSection')?.hidden).toBe(true);
    expect(document.querySelector('.entry-controls')?.hidden).toBe(true);
    expect(document.querySelector('.entry-controls')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.getElementById('entry')?.hidden).toBe(true);
    expect(document.getElementById('statusPanel')?.hidden).toBe(true);
    expect(document.querySelector('.brand')?.hidden).toBe(false);
    expect(document.querySelector('.nav-links')?.hidden).toBe(false);
    expect(document.getElementById('patronWelcome')?.hidden).toBe(false);
    expect(document.querySelector('#leftPanel .panel-builder--left')).toBeNull();
    expect(document.querySelector('#rightPanel .panel-builder--right')).toBeNull();
  });

  it('renders global pages without reader modules with builder editing markers', () => {
    const globalPage = buildContractFixture('builderPageDraft', {
      id: 'global-about-page',
      scope: 'global',
      seriesId: null,
      slug: 'about',
      pageType: 'custom',
    });

    const shellState = applyBuilderPageToDOM(globalPage, {
      previewMode: true,
      builderEditing: true,
      deviceId: 'mobile',
    });

    const builderContent = document.getElementById('builderPageContent');
    expect(shellState).toEqual({ active: false, reason: 'no-reader-module' });
    expect(builderContent?.hidden).toBe(false);
    expect(builderContent?.querySelector('.pb-page')?.dataset.builderPageId).toBe(
      'global-about-page'
    );
    expect(builderContent?.querySelector('[data-builder-section-id]')).not.toBeNull();
    expect(builderContent?.querySelector('[data-builder-column-index]')).not.toBeNull();
    expect(builderContent?.querySelector('[data-builder-module-id]')).not.toBeNull();
    expect(document.querySelector('.viewerWrap')?.dataset.builderPageId).toBeUndefined();
  });

  it('treats reader modules hidden on the active builder device as inactive', () => {
    const readerModule = getContractFixture('builderModules').reader;
    const page = buildContractFixture('builderPage', {
      sections: [
        {
          id: 'hidden-reader-section',
          sectionType: 'row',
          layout: '1',
          sortIndex: 0,
          settings: {},
          modules: [
            {
              ...readerModule,
              config: {
                ...readerModule.config,
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
    });

    const shellState = applyBuilderPageToDOM(page, {
      previewMode: true,
      builderEditing: true,
      deviceId: 'mobile',
    });

    expect(shellState).toEqual({ active: false, reason: 'no-reader-module' });
    expect(document.body.dataset.readerShell).toBe('inactive');
    expect(document.getElementById('builderPageContent')?.hidden).toBe(false);
    expect(document.querySelector('.viewerWrap')?.hidden).toBe(true);
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
    const builderPage = buildReaderShellPage();
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
    expect(document.querySelector('.entry-controls')?.hidden).toBe(false);
    expect(document.getElementById('entry')?.hidden).toBe(false);
    expect(document.getElementById('statusPanel')?.hidden).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#ffcc00');
    expect(document.documentElement.style.getPropertyValue('--bg-panel')).toBe('#151a33');

    const leftPanel = document.getElementById('leftPanel');
    const rightPanel = document.getElementById('rightPanel');

    expect(leftPanel?.style.getPropertyValue('--panel-bg-image')).toContain(
      '/assets/media/panels/left-grid.png'
    );
    expect(rightPanel?.style.getPropertyValue('--panel-bg-image')).toContain(
      '/assets/media/panels/right-burst.png'
    );

    // Sections after the reader module render as below-reader page content (panels
    // are reader-owned and fed only from the reader's own section). The contract
    // fixture's promo/feed sections sit after the reader, so they land below it.
    const below = document.getElementById('builderBelowReader');
    expect(below?.hidden).toBe(false);
    expect(below?.querySelector('.pb-module--promo')).not.toBeNull();
    expect(below?.querySelector('.pb-module--feed')).not.toBeNull();
    expect(below?.querySelector('.latest-name')?.textContent).toBe('Issue 10 Released');
  });

  it('renders sections above and below the reader module into reader content surfaces', () => {
    const page = getContractFixture('builderPage');
    const readerModule = getContractFixture('builderModules').reader;
    page.sections = [
      {
        id: 'above-sec',
        sectionType: 'row',
        layout: '1',
        sortIndex: 0,
        settings: {},
        modules: [
          {
            id: 'above-text',
            moduleType: 'text',
            columnIndex: 0,
            sortIndex: 0,
            config: { content: '<p>Above reader</p>' },
          },
        ],
      },
      {
        id: 'reader-sec',
        sectionType: 'row',
        layout: '1',
        sortIndex: 1,
        settings: {},
        modules: [
          {
            ...readerModule,
            id: 'reader-shell-module',
            columnIndex: 0,
            sortIndex: -1,
            config: { ...readerModule.config, source: { mode: 'active-page-series' } },
          },
          {
            id: 'panel-text',
            moduleType: 'text',
            columnIndex: 0,
            sortIndex: 0,
            config: { content: '<p>Reader panel</p>' },
          },
        ],
      },
      {
        id: 'below-sec',
        sectionType: 'row',
        layout: '1',
        sortIndex: 2,
        settings: {},
        modules: [
          {
            id: 'below-text',
            moduleType: 'text',
            columnIndex: 0,
            sortIndex: 0,
            config: { content: '<p>Below reader</p>' },
          },
        ],
      },
    ];

    const shellState = applyBuilderPageToDOM(page, { seriesId: 'battle-bros' });
    expect(shellState.active).toBe(true);

    const above = document.getElementById('builderAboveReader');
    const below = document.getElementById('builderBelowReader');
    expect(above?.hidden).toBe(false);
    expect(above?.textContent).toContain('Above reader');
    expect(below?.hidden).toBe(false);
    expect(below?.textContent).toContain('Below reader');

    // Under/over-reader content stays out of the reader panels; only the reader
    // section's own column feeds the panels.
    const leftPanel = document.getElementById('leftPanel');
    expect(leftPanel?.textContent).toContain('Reader panel');
    expect(leftPanel?.textContent || '').not.toContain('Above reader');
    expect(leftPanel?.textContent || '').not.toContain('Below reader');
  });

  it('clears reader content surfaces when switching to a no-reader page', () => {
    const page = getContractFixture('builderPage');
    const readerModule = getContractFixture('builderModules').reader;
    page.sections = [
      {
        id: 'reader-sec',
        sectionType: 'row',
        layout: '1',
        sortIndex: 0,
        settings: {},
        modules: [
          {
            ...readerModule,
            id: 'reader-shell-module',
            columnIndex: 0,
            sortIndex: -1,
            config: { ...readerModule.config, source: { mode: 'active-page-series' } },
          },
        ],
      },
      {
        id: 'below-sec',
        sectionType: 'row',
        layout: '1',
        sortIndex: 1,
        settings: {},
        modules: [
          {
            id: 'below-text',
            moduleType: 'text',
            columnIndex: 0,
            sortIndex: 0,
            config: { content: '<p>Below reader</p>' },
          },
        ],
      },
    ];
    applyBuilderPageToDOM(page, { seriesId: 'battle-bros' });
    expect(document.getElementById('builderBelowReader')?.hidden).toBe(false);

    const noReaderPage = buildContractFixture('builderPageDraft', {
      slug: 'about',
      title: 'About',
      pageType: 'custom',
    });
    applyBuilderPageToDOM(noReaderPage, { seriesId: 'battle-bros' });
    const below = document.getElementById('builderBelowReader');
    expect(below?.hidden).toBe(true);
    expect(below?.textContent).toBe('');
  });

  it('restores reader-owned header chrome when an active reader page follows a no-reader page', () => {
    const noReaderPage = buildContractFixture('builderPageDraft', {
      slug: 'about',
      title: 'About',
      pageType: 'custom',
    });
    applyBuilderPageToDOM(noReaderPage, { seriesId: 'battle-bros' });

    expect(document.querySelector('.entry-controls')?.hidden).toBe(true);
    expect(document.getElementById('entry')?.hidden).toBe(true);
    expect(document.getElementById('statusPanel')?.hidden).toBe(true);

    applyBuilderPageToDOM(buildReaderShellPage({ sections: [] }), { seriesId: 'battle-bros' });

    expect(document.body.dataset.readerShell).toBe('active');
    expect(document.querySelector('.entry-controls')?.hidden).toBe(false);
    expect(document.getElementById('entry')?.hidden).toBe(false);
    expect(document.getElementById('statusPanel')?.hidden).toBe(false);
  });

  it('renders entry-gallery modules through the reader shell panel stack', async () => {
    const entryGallery = getContractFixture('builderModules')['entry-gallery'];
    const readerModule = getContractFixture('builderModules').reader;
    const builderPage = buildContractFixture('builderPage', {
      sections: [
        {
          id: 'reader-shell-section',
          sectionType: 'row',
          layout: '1',
          sortIndex: -1,
          settings: {},
          modules: [
            {
              ...readerModule,
              id: 'reader-shell-module',
              columnIndex: 0,
              sortIndex: 0,
              config: {
                ...readerModule.config,
                source: { mode: 'active-page-series' },
              },
            },
          ],
        },
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

    // The entry-gallery section sits after the reader module, so it renders as
    // below-reader page content rather than reader-panel content.
    const below = document.getElementById('builderBelowReader');
    expect(below?.querySelector('.pb-module--entry-gallery')).not.toBeNull();
    expect(below?.querySelector('.pb-entry-gallery-item')?.textContent).toContain(
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

  it('applies reader module customization to the active static shell', () => {
    const builderPage = buildReaderShellPage();
    builderPage.sections[0].modules[0].config = {
      ...builderPage.sections[0].modules[0].config,
      displayMode: 'vertical-scroll',
      controls: {
        placement: 'overlay',
        size: 'large',
        style: {
          defaults: { appearance: { text: { color: '#ffeeaa' } } },
          primary: { appearance: { background: { color: '#123456' } } },
        },
      },
      stage: {
        fit: 'width',
        pageGap: 24,
        frameBorder: false,
        maxWidth: 1280,
      },
      panels: {
        left: { enabled: false },
        right: { enabled: true },
      },
      showComments: false,
    };

    applyBuilderPageToDOM(builderPage, { seriesId: 'battle-bros' });

    expect(document.body.dataset.readerShell).toBe('active');
    expect(document.body.dataset.readerDisplayMode).toBe('vertical-scroll');
    expect(document.body.dataset.readerRequestedDisplayMode).toBe('vertical-scroll');
    expect(document.getElementById('mainContent')?.dataset.readerControlsPlacement).toBe('overlay');
    expect(document.getElementById('controls')?.dataset.readerControlsSize).toBe('large');
    expect(
      document.getElementById('controls')?.style.getPropertyValue('--reader-control-color')
    ).toBe('#ffeeaa');
    expect(
      document.getElementById('controls')?.style.getPropertyValue('--reader-primary-control-bg')
    ).toBe('#123456');
    expect(document.getElementById('stageWrap')?.dataset.readerStageFit).toBe('width');
    expect(document.getElementById('stageWrap')?.dataset.readerStageFrameBorder).toBe('false');
    expect(document.getElementById('stageWrap')?.dataset.readerStageMaxWidth).toBe('1280');
    expect(
      document.getElementById('stage')?.style.getPropertyValue('--reader-stage-page-gap')
    ).toBe('24px');
    expect(document.getElementById('leftPanel')?.hidden).toBe(true);
    expect(document.getElementById('rightPanel')?.hidden).toBe(false);
    expect(document.getElementById('comicCommentsSection')?.hidden).toBe(true);
    expect(document.getElementById('commentToggleBtn')?.hidden).toBe(true);
  });

  it('keeps migrated legacy side-panel modules visible when showPanels is false', () => {
    const builderPage = buildPanelSnapshot();
    const readerModule = builderPage.sections[0].modules.find(
      (module) => module.moduleType === 'reader'
    );
    readerModule.config = {
      source: { mode: 'active-page-series' },
      showPanels: false,
      showComments: true,
    };

    applyBuilderPageToDOM(builderPage, { seriesId: 'battle-bros' });

    expect(document.body.dataset.readerShell).toBe('active');
    expect(document.getElementById('leftPanel')?.hidden).toBe(false);
    expect(document.getElementById('rightPanel')?.hidden).toBe(false);
    expect(document.querySelector('#leftPanel .pb-module--text')?.textContent).toContain(
      'Left panel'
    );
    expect(document.querySelector('#rightPanel .pb-module--text')?.textContent).toContain(
      'Right panel'
    );
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
    const pageEndTarget = document.getElementById('builderReaderPageEndTarget');

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
    expect(pageEndTarget?.dataset.builderSurface).toBe('page-end');
    expect(pageEndTarget?.parentElement?.previousElementSibling?.id).toBe('builderBelowReader');

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
    expect(document.querySelector('[data-builder-surface="page-end"]')).toBeNull();
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

  it('renders droppable empty-column markers for empty reader panels in edit mode', () => {
    const builderPage = buildPanelSnapshot();
    builderPage.sections[0].modules = builderPage.sections[0].modules.filter(
      (mod) => mod.moduleType === 'reader'
    );

    applyBuilderPageToDOM(builderPage, {
      seriesId: 'battle-bros',
      previewMode: true,
      builderEditing: true,
    });

    const leftColumn = document.querySelector(
      '#leftPanel .pb-builder-panel-column[data-builder-column-index="0"]'
    );
    const rightColumn = document.querySelector(
      '#rightPanel .pb-builder-panel-column[data-builder-column-index="1"]'
    );
    // Both panels emit an empty, reader-section-attributed column so the bridge's existing column
    // collection resolves them as drop targets without a new section.
    expect(leftColumn).not.toBeNull();
    expect(leftColumn?.children.length).toBe(0);
    expect(leftColumn?.closest('.pb-builder-panel-section')?.dataset.builderSectionId).toBe(
      'panel-row'
    );
    expect(rightColumn).not.toBeNull();
    expect(rightColumn?.children.length).toBe(0);
  });

  it('does not emit a droppable right-panel column for a single-column reader section', () => {
    const builderPage = buildPanelSnapshot();
    builderPage.sections[0].layout = '1';
    builderPage.sections[0].modules = builderPage.sections[0].modules.filter(
      (mod) => mod.moduleType === 'reader'
    );

    applyBuilderPageToDOM(builderPage, {
      seriesId: 'battle-bros',
      previewMode: true,
      builderEditing: true,
    });

    // Left stays droppable; the right panel has no column target until the section has 2+ columns,
    // so a right-panel drop is rejected at the source with no implicit layout change.
    expect(
      document.querySelector('#leftPanel .pb-builder-panel-column[data-builder-column-index="0"]')
    ).not.toBeNull();
    expect(document.querySelector('#rightPanel .pb-builder-panel-column')).toBeNull();
  });

  it('keeps an empty right panel droppable on mobile reflow when global structure is 2+ columns', () => {
    const builderPage = buildPanelSnapshot({
      sectionSettings: { responsive: { mobile: { layout: '1' } } },
    });
    builderPage.sections[0].modules = builderPage.sections[0].modules.filter(
      (mod) => mod.moduleType === 'reader'
    );

    applyBuilderPageToDOM(builderPage, {
      seriesId: 'battle-bros',
      previewMode: true,
      builderEditing: true,
      deviceId: 'mobile',
    });

    // Gating uses the stable structural layout (1-1), not the collapsed mobile layout (1).
    expect(
      document.querySelector('#rightPanel .pb-builder-panel-column[data-builder-column-index="1"]')
    ).not.toBeNull();
  });

  it('excludes middle-column modules from the right panel identically in edit and public mode', () => {
    const buildThreeColumnPage = () => {
      const page = buildPanelSnapshot();
      const readerModule = page.sections[0].modules.find((mod) => mod.moduleType === 'reader');
      page.sections[0].layout = '1-1-1';
      page.sections[0].modules = [
        readerModule,
        {
          id: 'middle-text',
          moduleType: 'text',
          columnIndex: 1,
          sortIndex: 0,
          config: { content: '<p>Middle</p>' },
        },
        {
          id: 'far-right-text',
          moduleType: 'text',
          columnIndex: 2,
          sortIndex: 0,
          config: { content: '<p>Far right</p>' },
        },
      ];
      return page;
    };

    // Edit mode: only the last column belongs to the right panel (the old fork wrongly pulled in
    // any column > 0).
    applyBuilderPageToDOM(buildThreeColumnPage(), {
      seriesId: 'battle-bros',
      previewMode: true,
      builderEditing: true,
    });
    expect(
      document.querySelector('#rightPanel [data-builder-module-id="far-right-text"]')
    ).not.toBeNull();
    expect(document.querySelector('#rightPanel [data-builder-module-id="middle-text"]')).toBeNull();

    // Public mode resolves ownership the same way.
    applyBuilderPageToDOM(buildThreeColumnPage(), { seriesId: 'battle-bros', previewMode: true });
    expect(document.getElementById('rightPanel')?.textContent).toContain('Far right');
    expect(document.getElementById('rightPanel')?.textContent || '').not.toContain('Middle');
  });

  it('clears droppable right-panel markers when the layout collapses or the render goes public', () => {
    const builderPage = buildPanelSnapshot();
    builderPage.sections[0].modules = builderPage.sections[0].modules.filter(
      (mod) => mod.moduleType === 'reader'
    );

    applyBuilderPageToDOM(builderPage, {
      seriesId: 'battle-bros',
      previewMode: true,
      builderEditing: true,
    });
    expect(
      document.querySelector('#rightPanel .pb-builder-panel-column[data-builder-column-index="1"]')
    ).not.toBeNull();

    // Collapse the structural layout to one column: the stale right column marker is replaced.
    builderPage.sections[0].layout = '1';
    applyBuilderPageToDOM(builderPage, {
      seriesId: 'battle-bros',
      previewMode: true,
      builderEditing: true,
    });
    expect(document.querySelector('#rightPanel [data-builder-column-index]')).toBeNull();

    // Re-widen and go public: no editor-only markers survive in either panel.
    builderPage.sections[0].layout = '1-1';
    applyBuilderPageToDOM(builderPage, { seriesId: 'battle-bros', previewMode: true });
    expect(document.querySelector('#rightPanel [data-builder-section-id]')).toBeNull();
    expect(document.querySelector('#rightPanel [data-builder-column-index]')).toBeNull();
    expect(document.querySelector('#leftPanel [data-builder-column-index]')).toBeNull();
  });

  it('renders a divider dropped into a reader panel in both edit and public mode', () => {
    const buildDividerPanelPage = () => {
      const page = buildPanelSnapshot();
      const readerModule = page.sections[0].modules.find((mod) => mod.moduleType === 'reader');
      page.sections[0].modules = [
        readerModule,
        {
          id: 'left-panel-divider',
          moduleType: 'divider',
          columnIndex: 0,
          sortIndex: 0,
          config: {},
        },
      ];
      return page;
    };

    // Edit mode: the divider is surfaced into the panel (it no longer falls outside the partition).
    applyBuilderPageToDOM(buildDividerPanelPage(), {
      seriesId: 'battle-bros',
      previewMode: true,
      builderEditing: true,
    });
    expect(
      document.querySelector('#leftPanel [data-builder-module-id="left-panel-divider"]')
    ).not.toBeNull();

    // Public mode renders the same divider, so a dropped divider survives reload instead of
    // vanishing.
    applyBuilderPageToDOM(buildDividerPanelPage(), { seriesId: 'battle-bros', previewMode: true });
    expect(document.querySelector('#leftPanel .pb-divider')).not.toBeNull();
  });

  it('keeps PANEL_MODULE_TYPES in sync with insertable section-column modules', () => {
    // Anything droppable into a section column (the live-drop gate) but absent from the panel
    // render set would persist on a panel drop and then vanish on render. Reader is intentionally
    // excluded — it is the singleton reader shell module, not panel content.
    const documentedExclusions = new Set(['reader']);
    const missing = getInsertableModuleDescriptors()
      .filter((descriptor) => descriptor.allowedParents.includes('section-column'))
      .map((descriptor) => descriptor.type)
      .filter((type) => !PANEL_MODULE_TYPES.has(type) && !documentedExclusions.has(type));

    expect(missing).toEqual([]);
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
    const emptyPage = buildReaderShellPage({
      sections: [],
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

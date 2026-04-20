import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyBuilderPageToDOM,
  loadBuilderPage,
  extractSubtitlesFromBuilderPage,
  loadHomepageBuilderPage,
  loadPageConfigWithFallback,
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
    const pageConfig = getContractFixture('pageConfig');
    const setSubtitles = vi.fn();
    const fetchMock = vi.fn(async (url) => {
      if (url === 'page-config.json') {
        return jsonResponse(pageConfig);
      }
      if (url === '/api/pages/home/battle-bros') {
        return jsonResponse({ page: builderPage });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadPageConfigWithFallback(setSubtitles, 'battle-bros');

    expect(result).toEqual({ source: 'builder', page: builderPage, config: pageConfig });
    expect(setSubtitles).toHaveBeenCalledWith(['Hero Time', 'Lunch Break Justice']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(extractSubtitlesFromBuilderPage(builderPage, pageConfig)).toEqual([
      'Hero Time',
      'Lunch Break Justice',
    ]);
    expect(console.log).not.toHaveBeenCalled();
  });

  it('loads a published custom builder page by slug without falling back to legacy config', async () => {
    const aboutPage = buildContractFixture('builderPageDraft', {
      isPublished: true,
    });
    const pageConfig = getContractFixture('pageConfig');
    const setSubtitles = vi.fn();
    const fetchMock = vi.fn(async (url) => {
      if (url === 'page-config.json') {
        return jsonResponse(pageConfig);
      }
      if (url === '/api/pages/battle-bros/about') {
        return jsonResponse({ page: aboutPage });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadPageConfigWithFallback(setSubtitles, 'battle-bros', {
      pageSlug: 'about',
    });

    expect(result).toEqual({ source: 'builder', page: aboutPage, config: pageConfig });
    expect(setSubtitles).toHaveBeenCalledWith(['Hero Time', 'Lunch Break Justice']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('loads unpublished draft pages through the admin slug endpoint', async () => {
    const draftPage = getContractFixture('builderPageDraft');
    const pageConfig = getContractFixture('pageConfig');
    const setSubtitles = vi.fn();
    const fetchMock = vi.fn(async (url) => {
      if (url === 'page-config.json') {
        return jsonResponse(pageConfig);
      }
      if (url === '/api/admin/pages/by-slug/battle-bros/about') {
        return jsonResponse({ page: draftPage });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadPageConfigWithFallback(setSubtitles, 'battle-bros', {
      pageSlug: 'about',
      draft: true,
    });

    expect(result).toEqual({ source: 'builder', page: draftPage, config: pageConfig });
    expect(setSubtitles).toHaveBeenCalledWith(['Hero Time', 'Lunch Break Justice']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it('falls back to the legacy page-config contract when no builder page exists', async () => {
    const setSubtitles = vi.fn();
    const pageConfig = getContractFixture('pageConfig');
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/pages/home/battle-bros') {
        return jsonResponse({}, { ok: false, status: 404, statusText: 'Not Found' });
      }
      if (url === 'page-config.json') {
        return jsonResponse(pageConfig);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadPageConfigWithFallback(setSubtitles, 'battle-bros');

    expect(result).toEqual({ source: 'legacy', config: pageConfig });
    expect(setSubtitles).toHaveBeenCalledWith(['Hero Time', 'Lunch Break Justice']);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'page-config.json',
      '/api/pages/home/battle-bros',
    ]);
  });

  it('does not use legacy fallback for non-reader page slugs', async () => {
    const setSubtitles = vi.fn();
    const pageConfig = getContractFixture('pageConfig');
    const fetchMock = vi.fn(async (url) => {
      if (url === 'page-config.json') {
        return jsonResponse(pageConfig);
      }
      if (url === '/api/pages/battle-bros/about') {
        return jsonResponse({}, { ok: false, status: 404, statusText: 'Not Found' });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadPageConfigWithFallback(setSubtitles, 'battle-bros', {
      pageSlug: 'about',
    });

    expect(result).toEqual({ source: 'none', config: pageConfig });
    expect(setSubtitles).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('honors pb-no-fallback when the builder page is missing', async () => {
    localStorage.setItem('pb-no-fallback', '1');
    const setSubtitles = vi.fn();
    const pageConfig = getContractFixture('pageConfig');
    const fetchMock = vi.fn(async (url) => {
      if (url === 'page-config.json') {
        return jsonResponse(pageConfig);
      }
      if (url === '/api/pages/home/battle-bros') {
        return jsonResponse({}, { ok: false, status: 404, statusText: 'Not Found' });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadPageConfigWithFallback(setSubtitles, 'battle-bros');

    expect(result).toEqual({ source: 'none', config: pageConfig });
    expect(setSubtitles).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when a draft page request is denied', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/admin/pages/by-slug/battle-bros/about') {
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
    const pageConfig = getContractFixture('pageConfig');
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

    applyBuilderPageToDOM(builderPage, { pageConfig, seriesId: 'battle-bros' });
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

  it('uses first-class page header copy before legacy header-module fallback', () => {
    const builderPage = getContractFixture('builderPage');
    const pageConfig = getContractFixture('pageConfig');
    builderPage.meta.header.copy.title = 'Meta Header';
    builderPage.meta.header.copy.subtitle = 'Meta Subtitle';
    builderPage.meta.header.copy.subtitles = ['Meta One', 'Meta Two'];
    builderPage.sections[0].modules[0].config.title = 'Legacy Header';
    builderPage.sections[0].modules[0].config.subtitle = 'Legacy Subtitle';
    builderPage.sections[0].modules[0].config.subtitles = ['Legacy One'];

    applyBuilderPageToDOM(builderPage, { pageConfig, seriesId: 'battle-bros' });

    expect(document.querySelector('.topbar .title h1')?.textContent).toBe('Meta Header');
    expect(document.getElementById('subtitle')?.textContent).toBe('Meta Subtitle');
    expect(extractSubtitlesFromBuilderPage(builderPage, pageConfig)).toEqual([
      'Meta One',
      'Meta Two',
    ]);
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

  it('applies page-level header config before legacy page-config fallback', () => {
    const builderPage = getContractFixture('builderPage');
    const pageConfig = getContractFixture('pageConfig');

    applyBuilderPageToDOM(builderPage, { pageConfig, seriesId: 'battle-bros' });

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
    const pageConfig = getContractFixture('pageConfig');
    builderPage.meta.header.copy.title = 'Parity Header';
    builderPage.meta.header.copy.subtitle = 'Parity Subtitle';
    builderPage.meta.header.regions = {
      left: ['brand'],
      center: ['nav'],
      right: ['status', 'entryControls', 'patron'],
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
      pageConfig,
    });

    applyBuilderPageToDOM(builderPage, { pageConfig, seriesId: 'battle-bros' });

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
    const rightBuilder = document
      .getElementById('rightPanel')
      ?.querySelector('.panel-builder--right');

    expect(leftBuilder?.textContent).toContain('No panel modules.');
    expect(rightBuilder?.textContent?.trim() || '').toBe('');
  });
});

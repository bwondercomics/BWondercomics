import { describe, expect, it, vi } from 'vitest';

import { loadFallbackRetirementGate } from '../admin/page-builder/fallback-retirement-gate.js';
import { buildContractFixture } from './helpers/contracts.js';

function createCleanPage(overrides = {}) {
  return buildContractFixture('builderPage', {
    sections: [
      {
        id: 'sec-clean',
        sectionType: 'row',
        layout: '1',
        sortIndex: 0,
        settings: {},
        modules: [
          {
            id: 'mod-text-clean',
            moduleType: 'text',
            columnIndex: 0,
            sortIndex: 0,
            config: { content: '<p>Clean</p>' },
          },
        ],
      },
    ],
    ...overrides,
  });
}

function createSummary(page) {
  return {
    id: page.id,
    seriesId: page.seriesId,
    slug: page.slug,
    title: page.title,
    pageType: page.pageType,
    isPublished: page.isPublished,
    isHomepage: page.isHomepage,
    meta: page.meta,
  };
}

function createPageDeps(pages) {
  const summaries = pages.map(createSummary);
  const pageMap = new Map(pages.map((page) => [page.id, page]));
  return {
    listPages: vi.fn(async () => summaries),
    getPage: vi.fn(async (pageId) => pageMap.get(pageId) || null),
  };
}

describe('loadFallbackRetirementGate', () => {
  it('fetches every listed page as full detail before auditing', async () => {
    const readerPage = createCleanPage();
    const aboutPage = createCleanPage({
      id: 'about-page-id',
      slug: 'about',
      title: 'About',
      isPublished: true,
      isHomepage: false,
    });
    const deps = createPageDeps([readerPage, aboutPage]);

    const result = await loadFallbackRetirementGate('battle-bros', deps);

    expect(deps.listPages).toHaveBeenCalledWith('battle-bros');
    expect(deps.getPage).toHaveBeenCalledTimes(2);
    expect(deps.getPage).toHaveBeenCalledWith(readerPage.id);
    expect(deps.getPage).toHaveBeenCalledWith(aboutPage.id);
    expect(result.pageCount).toBe(2);
    expect(result.scannedPageIds).toEqual([readerPage.id, aboutPage.id]);
    expect(result.completePageDetails).toBe(true);
    expect(result.audit.pageReports).toHaveLength(2);
  });

  it('blocks readiness when a non-active page still depends on a legacy header module', async () => {
    const readerPage = createCleanPage();
    const legacyPage = createCleanPage({
      id: 'legacy-about-id',
      slug: 'about',
      title: 'About',
      isPublished: true,
      isHomepage: false,
      meta: {},
      sections: [
        {
          id: 'sec-legacy',
          sectionType: 'row',
          layout: '1',
          sortIndex: 0,
          settings: {},
          modules: [
            {
              id: 'mod-legacy-header',
              moduleType: 'header',
              columnIndex: 0,
              sortIndex: 0,
              config: { title: 'Legacy Header', subtitle: 'Old style' },
            },
          ],
        },
      ],
    });
    delete legacyPage.meta.header;
    const deps = createPageDeps([readerPage, legacyPage]);

    const result = await loadFallbackRetirementGate('battle-bros', deps);

    expect(result.completePageDetails).toBe(true);
    expect(result.retirementReady).toBe(false);
    expect(result.audit.bucketSummary.legacyHeaderModule?.pageIds).toContain(legacyPage.id);
  });

  it('fails closed when the page list cannot be loaded', async () => {
    const deps = {
      listPages: vi.fn(async () => {
        throw new Error('List unavailable');
      }),
      getPage: vi.fn(),
    };

    const result = await loadFallbackRetirementGate('battle-bros', deps);

    expect(result.listError).toEqual({
      reason: 'listFetchFailed',
      message: 'List unavailable',
    });
    expect(result.completePageDetails).toBe(false);
    expect(result.retirementReady).toBe(false);
    expect(deps.getPage).not.toHaveBeenCalled();
  });

  it('fails closed when any page detail fetch fails', async () => {
    const readerPage = createCleanPage();
    const aboutPage = createCleanPage({
      id: 'about-page-id',
      slug: 'about',
      title: 'About',
      isPublished: true,
      isHomepage: false,
    });
    const summaries = [readerPage, aboutPage].map(createSummary);
    const deps = {
      listPages: vi.fn(async () => summaries),
      getPage: vi.fn(async (pageId) => {
        if (pageId === aboutPage.id) throw new Error('Detail unavailable');
        return readerPage;
      }),
    };

    const result = await loadFallbackRetirementGate('battle-bros', deps);

    expect(result.completePageDetails).toBe(false);
    expect(result.retirementReady).toBe(false);
    expect(result.detailErrors).toEqual([
      {
        pageId: aboutPage.id,
        slug: aboutPage.slug,
        reason: 'detailFetchFailed',
        message: 'Detail unavailable',
      },
    ]);
  });

  it('fails closed when a page detail does not include sections', async () => {
    const readerPage = createCleanPage();
    const summary = createSummary(readerPage);
    const deps = {
      listPages: vi.fn(async () => [summary]),
      getPage: vi.fn(async () => ({ ...summary })),
    };

    const result = await loadFallbackRetirementGate('battle-bros', deps);

    expect(result.completePageDetails).toBe(false);
    expect(result.retirementReady).toBe(false);
    expect(result.detailErrors).toEqual([
      {
        pageId: readerPage.id,
        slug: readerPage.slug,
        reason: 'missingSections',
        message: 'Page detail did not include sections.',
      },
    ]);
  });

  it('reports ready when all full details are clean', async () => {
    const readerPage = createCleanPage();
    const deps = createPageDeps([readerPage]);

    const result = await loadFallbackRetirementGate('battle-bros', deps);

    expect(result.listError).toBeNull();
    expect(result.detailErrors).toEqual([]);
    expect(result.completePageDetails).toBe(true);
    expect(result.audit.clean).toBe(true);
    expect(result.retirementReady).toBe(true);
  });

  it('treats an empty successful page list as complete but not ready', async () => {
    const deps = {
      listPages: vi.fn(async () => []),
      getPage: vi.fn(),
    };

    const result = await loadFallbackRetirementGate('battle-bros', deps);

    expect(result.listError).toBeNull();
    expect(result.detailErrors).toEqual([]);
    expect(result.completePageDetails).toBe(true);
    expect(result.audit.bucketSummary.missingPublishedReaderPage?.count).toBe(1);
    expect(result.retirementReady).toBe(false);
    expect(deps.getPage).not.toHaveBeenCalled();
  });
});

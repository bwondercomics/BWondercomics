import { describe, expect, it } from 'vitest';

import { auditPageFallbacks, auditPagesFallbacks } from '../admin/page-builder/header-config.js';
import { buildContractFixture, getContractFixture } from './helpers/contracts.js';

/**
 * Phase 5 – Fallback audit coverage.
 *
 * These tests are the source of truth for "when is the audit clean".
 * A bucket must reach count=0 across all builder pages before its
 * corresponding reader-side fallback branch may be removed.
 */
describe('auditPageFallbacks – per-page fallback inventory', () => {
  it('reports clean for a fully-migrated page with meta.header.version = 3 and no legacy header module', () => {
    // Build a page that carries v3 meta.header and has no moduleType:'header' in sections.
    const page = buildContractFixture('builderPage', {
      sections: [
        {
          id: 'sec-clean',
          sectionType: 'row',
          layout: '1',
          sortIndex: 0,
          settings: {},
          modules: [
            {
              id: 'mod-text-1',
              moduleType: 'text',
              columnIndex: 0,
              sortIndex: 0,
              config: { content: '<p>Clean page</p>' },
            },
          ],
        },
      ],
    });
    const result = auditPageFallbacks(page);

    expect(result.pageId).toBe(page.id);
    expect(result.slug).toBe('reader');
    expect(result.issues).toHaveLength(0);
  });

  it('flags missingHeader when page.meta.header is absent', () => {
    const page = buildContractFixture('builderPageDraft', {
      // builderPageDraft has headerOverrides but no meta.header
    });
    // ensure header is absent
    delete page.meta.header;

    const result = auditPageFallbacks(page);

    const issue = result.issues.find((i) => i.bucket === 'missingHeader');
    expect(issue).toBeDefined();
    expect(issue.gate).toMatch(/backfill/i);
  });

  it('flags staleHeaderVersion when meta.header.version < 3', () => {
    const page = buildContractFixture('builderPage', {
      meta: {
        header: {
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
          nav: { items: [] },
        },
      },
    });

    const result = auditPageFallbacks(page);

    const issue = result.issues.find((i) => i.bucket === 'staleHeaderVersion');
    expect(issue).toBeDefined();
    expect(issue.gate).toMatch(/normalises to v3/i);
    // Should NOT also flag missingHeader since header object is present
    expect(result.issues.find((i) => i.bucket === 'missingHeader')).toBeUndefined();
  });

  it('flags headerOverrides when page.meta.headerOverrides is present', () => {
    const page = getContractFixture('builderPageDraft'); // has headerOverrides, no meta.header
    const result = auditPageFallbacks(page);

    const issue = result.issues.find((i) => i.bucket === 'headerOverrides');
    expect(issue).toBeDefined();
    expect(issue.gate).toMatch(/zero builder pages with headerOverrides/i);
  });

  it('flags legacyHeaderModule when a header-type module exists in sections', () => {
    const page = buildContractFixture('builderPage', {
      meta: {
        // no meta.header → triggers missingHeader
      },
      sections: [
        {
          id: 'sec-1',
          sectionType: 'row',
          layout: '1',
          sortIndex: 0,
          settings: {},
          modules: [
            {
              id: 'mod-header-1',
              moduleType: 'header',
              columnIndex: 0,
              sortIndex: 0,
              config: { title: 'Legacy Header', subtitle: 'Old style' },
            },
          ],
        },
      ],
    });
    delete page.meta.header;

    const result = auditPageFallbacks(page);

    const issue = result.issues.find((i) => i.bucket === 'legacyHeaderModule');
    expect(issue).toBeDefined();
    expect(issue.gate).toMatch(/backfill canonical v3/i);
    // Only one legacyHeaderModule issue even if multiple header modules exist
    expect(result.issues.filter((i) => i.bucket === 'legacyHeaderModule')).toHaveLength(1);
  });

  it('does not flag legacyHeaderModule when canonical v3 meta.header already exists', () => {
    const page = buildContractFixture('builderPage', {
      sections: [
        {
          id: 'sec-with-header',
          sectionType: 'row',
          layout: '1',
          sortIndex: 0,
          settings: {},
          modules: [
            {
              id: 'mod-header-legacy',
              moduleType: 'header',
              columnIndex: 0,
              sortIndex: 0,
              config: { title: 'Stored legacy header', subtitle: 'Unused now' },
            },
          ],
        },
      ],
    });

    const result = auditPageFallbacks(page);

    expect(result.issues.find((i) => i.bucket === 'legacyHeaderModule')).toBeUndefined();
  });

  it('does not flag legacyHeaderModule when no header module exists in sections', () => {
    // Build a page where no section contains a moduleType:'header' module.
    const page = buildContractFixture('builderPage', {
      sections: [
        {
          id: 'sec-no-header',
          sectionType: 'row',
          layout: '1',
          sortIndex: 0,
          settings: {},
          modules: [
            {
              id: 'mod-feed-1',
              moduleType: 'feed',
              columnIndex: 0,
              sortIndex: 0,
              config: { limit: 3 },
            },
          ],
        },
      ],
    });
    const result = auditPageFallbacks(page);

    expect(result.issues.find((i) => i.bucket === 'legacyHeaderModule')).toBeUndefined();
  });

  it('handles null / undefined page gracefully', () => {
    expect(auditPageFallbacks(null).issues.find((i) => i.bucket === 'missingHeader')).toBeDefined();
    expect(
      auditPageFallbacks(undefined).issues.find((i) => i.bucket === 'missingHeader')
    ).toBeDefined();
  });
});

describe('auditPagesFallbacks – series-level aggregation', () => {
  it('returns clean=true only when the series has a published reader page and zero page-level issues', () => {
    // Build a truly-clean page: v3 meta.header, no moduleType:'header' in sections.
    const page = buildContractFixture('builderPage', {
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
    });
    const result = auditPagesFallbacks([page]);

    expect(result.clean).toBe(true);
    expect(result.pageReports).toHaveLength(1);
    expect(Object.keys(result.bucketSummary)).toHaveLength(0);
    expect(result.removalReadiness.hasPublishedReaderPage).toBe(true);
    expect(result.removalReadiness.canRemoveLegacyReaderFallback).toBe(true);
  });

  it('treats inert legacy header modules as cleanup-only once v3 meta.header exists', () => {
    const page = buildContractFixture('builderPage', {
      sections: [
        {
          id: 'sec-cleanup-only',
          sectionType: 'row',
          layout: '1',
          sortIndex: 0,
          settings: {},
          modules: [
            {
              id: 'mod-header-cleanup',
              moduleType: 'header',
              columnIndex: 0,
              sortIndex: 0,
              config: { title: 'Legacy Header', subtitle: 'Old style' },
            },
          ],
        },
      ],
    });

    const result = auditPagesFallbacks([page]);

    expect(result.clean).toBe(true);
    expect(result.pageReports[0].issues).toHaveLength(0);
    expect(result.removalReadiness.canRemoveLegacyReaderFallback).toBe(true);
  });

  it('aggregates bucket counts across multiple pages', () => {
    const migratedPage = getContractFixture('builderPage');
    const legacyPage = getContractFixture('builderPageDraft'); // has headerOverrides, missing meta.header
    const stalePage = buildContractFixture('builderPage', {
      id: 'stale-page',
      slug: 'stale',
      meta: {
        header: {
          version: 2,
          regions: { left: ['brand'], center: ['nav'], right: [] },
          blocks: {
            brand: { enabled: true },
            nav: { enabled: true },
            patron: { enabled: true },
            status: { enabled: true },
            entryControls: { enabled: true },
          },
          nav: { items: [] },
        },
      },
    });

    const result = auditPagesFallbacks([migratedPage, legacyPage, stalePage]);

    expect(result.clean).toBe(false);
    expect(result.pageReports).toHaveLength(3);

    // missingHeader from legacyPage (builderPageDraft has no meta.header)
    expect(result.bucketSummary.missingHeader?.count).toBeGreaterThanOrEqual(1);
    expect(result.bucketSummary.missingHeader?.pageIds).toContain(legacyPage.id);

    // headerOverrides from legacyPage
    expect(result.bucketSummary.headerOverrides?.count).toBeGreaterThanOrEqual(1);

    // staleHeaderVersion from stalePage
    expect(result.bucketSummary.staleHeaderVersion?.count).toBeGreaterThanOrEqual(1);
    expect(result.bucketSummary.staleHeaderVersion?.pageIds).toContain('stale-page');

    // Each bucket carries a gate description
    expect(result.bucketSummary.missingHeader?.gate).toBeTruthy();
    expect(result.bucketSummary.staleHeaderVersion?.gate).toBeTruthy();
    expect(result.removalReadiness.hasPublishedReaderPage).toBe(true);
    expect(result.removalReadiness.canRemoveLegacyReaderFallback).toBe(false);
  });

  it('reports missingPublishedReaderPage for an empty page list', () => {
    const result = auditPagesFallbacks([]);
    expect(result.clean).toBe(false);
    expect(result.pageReports).toHaveLength(0);
    expect(result.bucketSummary.missingPublishedReaderPage).toEqual({
      count: 1,
      gate: "Remove source:'legacy' only after the series has a published builder page with slug 'reader'.",
      pageIds: [],
    });
    expect(result.removalReadiness.hasPublishedReaderPage).toBe(false);
    expect(result.removalReadiness.canRemoveLegacyReaderFallback).toBe(false);
  });

  it('reports missingPublishedReaderPage when only non-reader pages exist', () => {
    const aboutPage = buildContractFixture('builderPageDraft', {
      slug: 'about',
      pageType: 'custom',
      isPublished: true,
      meta: {
        header: {
          version: 3,
          copy: { title: 'About', subtitle: '', subtitles: [] },
          regions: {
            left: ['brand'],
            center: ['patron', 'status'],
            right: ['entryControls', 'nav'],
          },
          blocks: {
            brand: { enabled: true },
            patron: { enabled: true },
            status: { enabled: true },
            entryControls: { enabled: true },
            nav: { enabled: true },
          },
          nav: { items: [] },
        },
      },
      sections: [
        {
          id: 'sec-about',
          sectionType: 'row',
          layout: '1',
          sortIndex: 0,
          settings: {},
          modules: [
            {
              id: 'mod-about',
              moduleType: 'text',
              columnIndex: 0,
              sortIndex: 0,
              config: { content: '<p>About</p>' },
            },
          ],
        },
      ],
    });

    const result = auditPagesFallbacks([aboutPage]);

    expect(result.clean).toBe(false);
    expect(result.bucketSummary.missingPublishedReaderPage?.count).toBe(1);
    expect(result.bucketSummary.missingPublishedReaderPage?.pageIds).toEqual([]);
    expect(result.removalReadiness.hasPublishedReaderPage).toBe(false);
  });

  it('reports missingPublishedReaderPage when the reader page is still unpublished', () => {
    const draftReaderPage = buildContractFixture('builderPage', {
      isPublished: false,
      sections: [
        {
          id: 'sec-reader-draft',
          sectionType: 'row',
          layout: '1',
          sortIndex: 0,
          settings: {},
          modules: [
            {
              id: 'mod-reader-draft',
              moduleType: 'text',
              columnIndex: 0,
              sortIndex: 0,
              config: { content: '<p>Draft reader</p>' },
            },
          ],
        },
      ],
    });

    const result = auditPagesFallbacks([draftReaderPage]);

    expect(result.clean).toBe(false);
    expect(result.bucketSummary.missingPublishedReaderPage?.count).toBe(1);
    expect(result.removalReadiness.hasPublishedReaderPage).toBe(false);
  });
});

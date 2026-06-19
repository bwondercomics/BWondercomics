import { describe, expect, it } from 'vitest';

import {
  READER_BINDING_ADVISORY_CODES,
  READER_BINDING_WARNING_CODES,
  collectReaderModules,
  getReaderBindingInvalidationWarning,
  isBoundReaderPage,
  validateReaderBindingPage,
} from '../admin/page-builder/reader-binding-validation.js';

function createReaderModule(id = 'reader-module', config = {}) {
  return {
    id,
    moduleType: 'reader',
    columnIndex: 0,
    sortIndex: 0,
    config: {
      source: { mode: 'active-page-series' },
      ...config,
    },
  };
}

function createPage({ modules = [], pageId = 'reader-page' } = {}) {
  return {
    id: pageId,
    scope: 'series',
    seriesId: 'battle-bros',
    slug: 'reader',
    pageType: 'reader',
    sections: [
      {
        id: 'section-1',
        sectionType: 'row',
        layout: '1',
        sortIndex: 0,
        settings: {},
        modules,
      },
    ],
  };
}

const boundReader = Object.freeze({
  bindings: {
    reader: { pageId: 'reader-page' },
  },
  warnings: [],
});

describe('reader binding validation', () => {
  it('collects reader modules and detects bound reader pages', () => {
    const page = createPage({
      modules: [createReaderModule(), { id: 'text', moduleType: 'text' }],
    });

    expect(collectReaderModules(page).map(({ module }) => module.id)).toEqual(['reader-module']);
    expect(isBoundReaderPage(page, boundReader)).toBe(true);
    expect(isBoundReaderPage({ ...page, id: 'other-page' }, boundReader)).toBe(false);
  });

  it('returns stable warning codes for invalid bound reader pages', () => {
    expect(validateReaderBindingPage(createPage()).map((warning) => warning.code)).toEqual([
      READER_BINDING_WARNING_CODES.MISSING,
    ]);
    expect(
      validateReaderBindingPage(
        createPage({ modules: [createReaderModule('reader-1'), createReaderModule('reader-2')] })
      ).map((warning) => warning.code)
    ).toEqual([READER_BINDING_WARNING_CODES.DUPLICATE]);
    expect(
      validateReaderBindingPage(
        createPage({
          modules: [
            createReaderModule('reader-hidden', {
              responsive: { desktop: { hidden: true } },
            }),
          ],
        })
      ).map((warning) => warning.code)
    ).toEqual([READER_BINDING_WARNING_CODES.HIDDEN_DEFAULT_DEVICE]);
    expect(
      validateReaderBindingPage(
        createPage({
          modules: [
            createReaderModule('reader-hidden-tablet', {
              responsive: { tablet: { hidden: true } },
            }),
          ],
        }),
        { deviceId: 'tablet' }
      )
    ).toEqual([]);
    expect(
      validateReaderBindingPage(
        createPage({
          modules: [
            createReaderModule('reader-wrong-source', {
              source: { mode: 'specific-series', seriesId: 'other-series' },
            }),
          ],
        })
      ).map((warning) => warning.code)
    ).toEqual([READER_BINDING_WARNING_CODES.WRONG_SOURCE]);
  });

  it('simulates delete, section delete, and hide invalidation only for bound reader pages', () => {
    const page = createPage({ modules: [createReaderModule()] });

    expect(
      getReaderBindingInvalidationWarning(page, {
        pageBindings: boundReader,
        seriesId: 'battle-bros',
        removeModuleId: 'reader-module',
      })?.warnings.map((warning) => warning.code)
    ).toEqual([READER_BINDING_WARNING_CODES.MISSING]);
    expect(
      getReaderBindingInvalidationWarning(page, {
        pageBindings: boundReader,
        seriesId: 'battle-bros',
        removeSectionId: 'section-1',
      })?.warnings.map((warning) => warning.code)
    ).toEqual([READER_BINDING_WARNING_CODES.MISSING]);
    expect(
      getReaderBindingInvalidationWarning(page, {
        pageBindings: boundReader,
        seriesId: 'battle-bros',
        deviceId: 'desktop',
        hideModuleId: 'reader-module',
      })?.warnings.map((warning) => warning.code)
    ).toEqual([READER_BINDING_WARNING_CODES.HIDDEN_DEFAULT_DEVICE]);
    const tabletWarning = getReaderBindingInvalidationWarning(page, {
      pageBindings: boundReader,
      seriesId: 'battle-bros',
      deviceId: 'tablet',
      hideModuleId: 'reader-module',
    });
    expect(tabletWarning?.advisory).toBe(true);
    expect(tabletWarning?.warnings.map((warning) => warning.code)).toEqual([
      READER_BINDING_ADVISORY_CODES.HIDDEN_CURRENT_DEVICE,
    ]);
    expect(tabletWarning?.message).not.toContain('Publishing and reader binding saves');
    expect(
      getReaderBindingInvalidationWarning(page, {
        pageBindings: { bindings: {}, warnings: [] },
        seriesId: 'battle-bros',
        removeModuleId: 'reader-module',
      })
    ).toBeNull();
  });

  it('does not warn when deleting one duplicate reader would restore a valid bound page', () => {
    const page = createPage({
      modules: [createReaderModule('reader-1'), createReaderModule('reader-2')],
    });

    expect(
      getReaderBindingInvalidationWarning(page, {
        pageBindings: boundReader,
        seriesId: 'battle-bros',
        removeModuleId: 'reader-2',
      })
    ).toBeNull();
  });
});

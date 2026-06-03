import { describe, expect, it } from 'vitest';

import {
  LIVE_DROP_PLACEMENTS,
  resolveLiveDropPlacement,
} from '../admin/page-builder/live-drop-placement.js';

function buildPage(overrides = {}) {
  return {
    id: 'page-1',
    sections: [
      {
        id: 'section-1',
        layout: '1-1',
        sortIndex: 0,
        modules: [
          {
            id: 'module-a',
            moduleType: 'text',
            columnIndex: 0,
            sortIndex: 0,
            config: {},
          },
          {
            id: 'module-b',
            moduleType: 'image',
            columnIndex: 0,
            sortIndex: 1,
            config: {},
          },
        ],
      },
      {
        id: 'section-2',
        layout: '1',
        sortIndex: 1,
        modules: [],
      },
    ],
    ...overrides,
  };
}

function geometry(target, rect = {}) {
  return {
    target,
    rect: {
      top: 20,
      left: 10,
      right: 210,
      bottom: 120,
      width: 200,
      height: 100,
      ...rect,
    },
    visible: true,
    order: 0,
    label: target.kind,
  };
}

describe('resolveLiveDropPlacement', () => {
  it('ranks module edge placement with insert index relative to the target module', () => {
    const page = buildPage();
    const target = {
      kind: 'module',
      key: 'module:module-b',
      pageId: page.id,
      sectionId: 'section-1',
      columnIndex: 0,
      moduleId: 'module-b',
      moduleType: 'image',
    };

    const placement = resolveLiveDropPlacement({
      page,
      targets: [geometry(target)],
      point: { x: 80, y: 24 },
      dragState: { source: 'block', moduleType: 'text' },
    });

    expect(placement).toEqual(
      expect.objectContaining({
        placement: LIVE_DROP_PLACEMENTS.BEFORE,
        sectionId: 'section-1',
        columnIndex: 0,
        insertIndex: 1,
      })
    );
  });

  it('uses existing module drag state when calculating move indexes', () => {
    const page = buildPage();
    const target = {
      kind: 'module',
      key: 'module:module-b',
      pageId: page.id,
      sectionId: 'section-1',
      columnIndex: 0,
      moduleId: 'module-b',
      moduleType: 'image',
    };

    const placement = resolveLiveDropPlacement({
      page,
      targets: [geometry(target)],
      point: { x: 80, y: 24 },
      dragState: { source: 'module', moduleId: 'module-a' },
    });

    expect(placement.insertIndex).toBe(0);
  });

  it('accepts empty-column insertion only when the global section layout has that column', () => {
    const page = buildPage();
    const target = {
      kind: 'column',
      key: 'column:section-1:1',
      pageId: page.id,
      sectionId: 'section-1',
      columnIndex: 1,
    };

    expect(
      resolveLiveDropPlacement({
        page,
        targets: [geometry(target)],
        point: { x: 40, y: 80 },
        dragState: { source: 'block', moduleType: 'image' },
      })
    ).toEqual(
      expect.objectContaining({
        placement: LIVE_DROP_PLACEMENTS.EMPTY_COLUMN,
        sectionId: 'section-1',
        columnIndex: 1,
        insertIndex: 0,
      })
    );

    const invalidTarget = { ...target, sectionId: 'section-2', columnIndex: 1 };
    expect(
      resolveLiveDropPlacement({
        page,
        targets: [geometry(invalidTarget)],
        point: { x: 40, y: 80 },
        dragState: { source: 'block', moduleType: 'image' },
      })
    ).toBeNull();
  });

  it('falls back to page-end placement for empty pages', () => {
    const placement = resolveLiveDropPlacement({
      page: buildPage({ sections: [] }),
      targets: [],
      point: { x: 40, y: 80 },
      dragState: { source: 'block', moduleType: 'spacer' },
    });

    expect(placement).toEqual(
      expect.objectContaining({
        placement: LIVE_DROP_PLACEMENTS.PAGE_END,
        sectionIndex: 0,
      })
    );
  });

  it('creates new-section placements from section edges', () => {
    const page = buildPage();
    const target = {
      kind: 'section',
      key: 'section:section-2',
      pageId: page.id,
      sectionId: 'section-2',
    };

    const placement = resolveLiveDropPlacement({
      page,
      targets: [geometry(target)],
      point: { x: 80, y: 24 },
      dragState: { source: 'block', moduleType: 'feed' },
    });

    expect(placement).toEqual(
      expect.objectContaining({
        placement: LIVE_DROP_PLACEMENTS.SECTION_BEFORE,
        sectionIndex: 1,
      })
    );
  });

  it('resolves section reorder placement relative to the list without the source section', () => {
    const page = buildPage();
    const target = {
      kind: 'section',
      key: 'section:section-1',
      pageId: page.id,
      sectionId: 'section-1',
    };

    const placement = resolveLiveDropPlacement({
      page,
      targets: [geometry(target)],
      point: { x: 80, y: 24 },
      dragState: { source: 'section', sectionId: 'section-2' },
    });

    expect(placement).toEqual(
      expect.objectContaining({
        placement: LIVE_DROP_PLACEMENTS.SECTION_BEFORE,
        sectionIndex: 0,
      })
    );
  });

  it('rejects non-insertable block descriptors', () => {
    const page = buildPage();
    const placement = resolveLiveDropPlacement({
      page,
      targets: [],
      point: { x: 40, y: 80 },
      dragState: { source: 'block', moduleType: 'header' },
    });

    expect(placement).toBeNull();
  });
});

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

  it('treats an empty column as droppable only once it has real geometry (the editor min-height affordance)', () => {
    const page = buildPage();
    const target = {
      kind: 'column',
      key: 'column:section-2:0',
      pageId: page.id,
      sectionId: 'section-2',
      columnIndex: 0,
    };

    // A collapsed (zero-height) empty column does not contain the pointer, so it is not a drop
    // candidate; on a populated page that resolves to null rather than a silent page-end fallback.
    expect(
      resolveLiveDropPlacement({
        page,
        targets: [geometry(target, { top: 200, bottom: 200, height: 0 })],
        point: { x: 80, y: 220 },
        dragState: { source: 'block', moduleType: 'image' },
      })
    ).toBeNull();

    // With the editor min-height affordance the same empty column has a small but real rect and
    // resolves to an empty-column insertion.
    expect(
      resolveLiveDropPlacement({
        page,
        targets: [geometry(target, { top: 200, bottom: 240, height: 40 })],
        point: { x: 80, y: 220 },
        dragState: { source: 'block', moduleType: 'image' },
      })
    ).toEqual(
      expect.objectContaining({
        placement: LIVE_DROP_PLACEMENTS.EMPTY_COLUMN,
        sectionId: 'section-2',
        columnIndex: 0,
        insertIndex: 0,
      })
    );
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

  it('returns null for a bare-page drop on a populated page instead of appending at page end', () => {
    const page = buildPage();
    const pageTarget = { kind: 'page', key: 'page:page-1', pageId: page.id };

    const placement = resolveLiveDropPlacement({
      page,
      targets: [geometry(pageTarget)],
      point: { x: 80, y: 80 },
      dragState: { source: 'block', moduleType: 'image' },
    });

    expect(placement).toBeNull();
  });

  it('returns null when the pointer is over no target on a populated page (no nearest snap)', () => {
    const page = buildPage();
    const farTarget = {
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
      // The module rect is 20-120 / 10-210; the point is well outside it.
      targets: [geometry(farTarget)],
      point: { x: 900, y: 900 },
      dragState: { source: 'block', moduleType: 'text' },
    });

    expect(placement).toBeNull();
  });

  it('resolves an explicit page-end surface on a populated page', () => {
    const page = buildPage();
    const genericPage = geometry(
      { kind: 'page', key: 'page:page-1', pageId: page.id },
      { top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600 }
    );
    const pageEnd = geometry(
      {
        kind: 'page',
        key: 'page-end:page-1',
        pageId: page.id,
        surface: 'page-end',
      },
      { top: 500, left: 20, right: 780, bottom: 540, width: 760, height: 40 }
    );

    const placement = resolveLiveDropPlacement({
      page,
      targets: [genericPage, pageEnd],
      point: { x: 80, y: 520 },
      dragState: { source: 'block', moduleType: 'feed' },
    });

    expect(placement).toEqual(
      expect.objectContaining({
        target: expect.objectContaining({ key: 'page-end:page-1', surface: 'page-end' }),
        placement: LIVE_DROP_PLACEMENTS.PAGE_END,
        sectionIndex: 2,
      })
    );
  });

  it('moves a module into a new trailing section through the explicit page-end surface', () => {
    const page = buildPage();
    const target = {
      kind: 'page',
      key: 'page-end:page-1',
      pageId: page.id,
      surface: 'page-end',
    };

    const placement = resolveLiveDropPlacement({
      page,
      targets: [geometry(target)],
      point: { x: 80, y: 80 },
      dragState: { source: 'module', moduleId: 'module-a' },
    });

    expect(placement).toEqual(
      expect.objectContaining({
        placement: LIVE_DROP_PLACEMENTS.PAGE_END,
        sectionIndex: 2,
      })
    );
  });

  it('moves a section to the final index through the explicit page-end surface', () => {
    const page = buildPage();
    const target = {
      kind: 'page',
      key: 'page-end:page-1',
      pageId: page.id,
      surface: 'page-end',
    };

    const placement = resolveLiveDropPlacement({
      page,
      targets: [geometry(target)],
      point: { x: 80, y: 80 },
      dragState: { source: 'section', sectionId: 'section-1' },
    });

    expect(placement).toEqual(
      expect.objectContaining({
        placement: LIVE_DROP_PLACEMENTS.PAGE_END,
        sectionIndex: 1,
      })
    );
  });

  it('still moves a section to the end when dropping on the lower half of the last section', () => {
    const page = buildPage();
    const target = {
      kind: 'section',
      key: 'section:section-2',
      pageId: page.id,
      sectionId: 'section-2',
    };

    const placement = resolveLiveDropPlacement({
      page,
      // rect midpoint is y=70; y=110 lands in the lower half => after.
      targets: [geometry(target)],
      point: { x: 80, y: 110 },
      dragState: { source: 'section', sectionId: 'section-1' },
    });

    expect(placement).toEqual(
      expect.objectContaining({
        placement: LIVE_DROP_PLACEMENTS.SECTION_AFTER,
        sectionIndex: 1,
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

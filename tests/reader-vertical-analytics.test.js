/**
 * Vertical mode must not over-report pages. On a wide (desktop) viewport paged
 * mode reports a two-page pair, but vertical mode reports only the single
 * center-visible page reported by the scroll observer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../reader/series.js', () => ({
  getActiveSeriesId: () => 'battle-bros',
}));
vi.mock('../reader/live-tracking.js', () => ({
  setLiveReaderContext: vi.fn(),
}));

let state;
let trackVisiblePages;
let setActiveEntry;

beforeEach(async () => {
  vi.resetModules();
  state = (await import('../reader/state.js')).state;
  ({ trackVisiblePages, setActiveEntry } = await import('../reader/analytics.js'));

  document.body.innerHTML = '';
  window.umami = vi.fn();
  // Wide desktop viewport: paged mode would qualify for a two-page spread.
  global.innerWidth = 1400;
  global.innerHeight = 900;
  state.currentEntry = 'entry-1';
  state.pages = ['p1.png', 'p2.png', 'p3.png'];
  state.pageIndex = 0;
  setActiveEntry();
});

afterEach(() => {
  delete window.umami;
  delete document.body.dataset.readerDisplayMode;
});

describe('vertical analytics page counting', () => {
  it('reports a two-page pair in paged mode on a wide viewport', () => {
    document.body.dataset.readerDisplayMode = 'paged';
    trackVisiblePages();
    const pages = window.umami.mock.calls
      .filter(([name]) => name === 'reader_page_view')
      .map(([, data]) => data.page)
      .sort();
    expect(pages).toEqual([1, 2]);
  });

  it('reports only the single center page in vertical mode on a wide viewport', () => {
    document.body.dataset.readerDisplayMode = 'vertical-scroll';
    trackVisiblePages();
    const pages = window.umami.mock.calls
      .filter(([name]) => name === 'reader_page_view')
      .map(([, data]) => data.page);
    expect(pages).toEqual([1]);
  });
});

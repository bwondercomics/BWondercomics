/**
 * Reader-runtime side of the entry publication contract (Phase 6).
 *
 * The backend hides draft entries from the public payload and advertises
 * scheduled entries with `status: 'scheduled'` + withheld pages (see
 * backend/tests/test_series_contracts.py). These tests assert the reader's half
 * of that contract: a scheduled entry stays selectable and renders COMING SOON,
 * while a published entry renders its pages.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const markEntryComplete = vi.fn();
const trackVisiblePages = vi.fn();
vi.mock('../reader/analytics.js', () => ({
  markEntryComplete,
  trackVisiblePages,
  setActiveEntry: vi.fn(),
  resetEntryCompletion: vi.fn(),
  trackEntryExit: vi.fn(),
}));

// Transform is paged-only geometry; stub it so the paged render branch is cheap.
vi.mock('../reader/transform.js', () => ({
  clearOnPageFrame: vi.fn(),
  fitOnPageFrame: vi.fn(),
}));

let state;
let render;
let initElements;
let el;
let sanitizeEntries;

function setPagedDom() {
  document.body.innerHTML = `
    <select id="entry"><option value="entry-1">Entry 1</option></select>
    <section class="viewport" id="viewport">
      <div class="stageWrap" id="stageWrap">
        <div class="stage" id="stage">
          <div class="page" id="leftPage"><img id="leftImg" /></div>
          <div class="page" id="rightPage"><img id="rightImg" /></div>
        </div>
      </div>
    </section>
    <div class="controls" id="controls">
      <button id="prevBtn"></button>
      <button id="nextBtn"></button>
      <span id="pageIndicator"></span>
      <div id="progressFill"></div>
    </div>
  `;
  initElements();
}

beforeEach(async () => {
  vi.clearAllMocks();
  if (typeof global.requestAnimationFrame !== 'function') {
    global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
    global.cancelAnimationFrame = (id) => clearTimeout(id);
  }

  const stateMod = await import('../reader/state.js');
  state = stateMod.state;
  ({ render } = await import('../reader/render.js'));
  const domMod = await import('../reader/dom.js');
  initElements = domMod.initElements;
  el = domMod.el;
  ({ sanitizeEntries } = await import('../reader/entries.js'));

  setPagedDom();
  // Paged mode keeps render() on the paged branch (not the vertical strip).
  document.body.dataset.readerDisplayMode = 'paged';
  document.body.dataset.readerShell = 'active';
  state.currentEntry = 'entry-1';
  state.pageIndex = 0;
  state.imageCache?.clear?.();
});

afterEach(() => {
  document.body.innerHTML = '';
  delete document.body.dataset.readerDisplayMode;
  delete document.body.dataset.readerShell;
});

describe('reader entry publication contract', () => {
  it('renders COMING SOON with the release date for a scheduled entry', () => {
    state.pages = [];
    state.entryMeta = { status: 'scheduled', publishAt: '2026-12-25T00:00:00.000Z' };

    render();

    const empty = document.getElementById('entryEmptyState');
    expect(empty).not.toBeNull();
    expect(empty.style.display).toBe('flex');
    expect(empty.textContent).toContain('COMING SOON');
    expect(empty.textContent).toContain('Scheduled for');
    // Paged stage is hidden behind the empty state.
    expect(el.stageWrap.style.display).toBe('none');
    // The page indicator also reflects the scheduled state.
    expect(el.indicator.textContent).toBe('COMING SOON');
  });

  it('falls back to a generic message when a scheduled entry has no publishAt', () => {
    state.pages = [];
    state.entryMeta = { status: 'scheduled' };

    render();

    const empty = document.getElementById('entryEmptyState');
    expect(empty.textContent).toContain('COMING SOON');
    expect(empty.textContent).toContain('future release');
  });

  it('shows NO PAGES (not COMING SOON) for a non-scheduled empty entry', () => {
    state.pages = [];
    state.entryMeta = { status: 'published' };

    render();

    expect(document.getElementById('entryEmptyState').textContent).toContain('NO PAGES');
    expect(el.indicator.textContent).toBe('NO PAGES');
  });

  it('renders pages for a published entry and hides the empty state', () => {
    // Start from the scheduled empty state so we also prove the transition back.
    state.pages = [];
    state.entryMeta = { status: 'scheduled', publishAt: '2026-12-25T00:00:00.000Z' };
    render();

    state.pages = ['p1.png', 'p2.png'];
    state.entryMeta = { status: 'published' };
    render();

    expect(document.getElementById('entryEmptyState').style.display).toBe('none');
    expect(el.stageWrap.style.display).not.toBe('none');
    expect(el.leftImg.dataset.pageUrl).toBe('p1.png');
  });

  it('keeps a scheduled (page-withheld) entry selectable while dropping hidden empty entries', () => {
    // Mirrors the public payload: scheduled entries arrive with empty page lists
    // but should remain in the dropdown so the reader can show COMING SOON.
    const { chapters, order } = sanitizeEntries(
      {
        Published: ['p1.png'],
        Scheduled: [],
        'Hidden Empty': [],
      },
      {
        Published: { showInDropdown: true },
        Scheduled: {
          status: 'scheduled',
          publishAt: '2026-12-25T00:00:00.000Z',
          showInDropdown: true,
        },
        'Hidden Empty': { showInDropdown: false, showInGallery: false },
      }
    );

    expect(order).toContain('Scheduled');
    expect(chapters.Scheduled).toEqual([]);
    expect(chapters.Published).toEqual(['p1.png']);
    expect(order).not.toContain('Hidden Empty');
  });
});

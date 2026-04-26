import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../reader/render.js', () => ({
  render: vi.fn(),
  isTwoPageMode: vi.fn(() => false),
}));

vi.mock('../reader/analytics.js', () => ({
  markEntryComplete: vi.fn(),
  resetEntryCompletion: vi.fn(),
}));

import { CONFIG } from '../reader/config.js';
import { prevPage, nextPage, restartEntry } from '../reader/controls.js';
import { el } from '../reader/dom.js';
import { state } from '../reader/state.js';
import { render, isTwoPageMode } from '../reader/render.js';
import { markEntryComplete, resetEntryCompletion } from '../reader/analytics.js';

describe('reader controls', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    document.body.innerHTML = '<div id="entryEndOverlay"></div>';
    el.stageWrap = document.createElement('div');
    Object.defineProperty(el.stageWrap, 'offsetWidth', { value: 0, configurable: true });
    el.flash = document.createElement('div');
    state.currentEntry = 'Issue 10';
    state.pages = ['1.png', '2.png', '3.png', '4.png'];
    state.pageIndex = 0;
    state.isTransitioning = false;
    render.mockClear();
    isTwoPageMode.mockReturnValue(false);
    markEntryComplete.mockClear();
    resetEntryCompletion.mockClear();
    global.requestAnimationFrame = (cb) => cb();
  });

  it('advances and saves progress on next page', () => {
    nextPage();
    vi.advanceTimersByTime(CONFIG.ANIMATION_DURATION * 2 + 1);

    expect(state.pageIndex).toBe(1);
    expect(render).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('battleBros_progress'))).toMatchObject({
      chapter: 'Issue 10',
      page: 1,
    });
  });

  it('moves backward by two pages in spread mode', () => {
    state.pageIndex = 3;
    isTwoPageMode.mockReturnValue(true);

    prevPage();
    vi.advanceTimersByTime(CONFIG.ANIMATION_DURATION * 2 + 1);

    expect(state.pageIndex).toBe(1);
  });

  it('shows the end-of-entry overlay instead of overrunning the last page', () => {
    state.pageIndex = 2;
    isTwoPageMode.mockReturnValue(true);

    nextPage();

    expect(document.getElementById('entryEndOverlay').classList.contains('active')).toBe(true);
    expect(markEntryComplete).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });

  it('restarts the current entry, clears completion state, and hides the overlay', () => {
    state.pageIndex = 3;
    document.getElementById('entryEndOverlay').classList.add('active');

    restartEntry();

    expect(state.pageIndex).toBe(0);
    expect(document.getElementById('entryEndOverlay').classList.contains('active')).toBe(false);
    expect(resetEntryCompletion).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('battleBros_progress'))).toMatchObject({
      chapter: 'Issue 10',
      page: 0,
    });
  });
});

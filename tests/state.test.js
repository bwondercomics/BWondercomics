/**
 * Tests for reader state management and progress persistence.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE } from '../reader/constants.js';
import { loadProgress, saveProgress, state } from '../reader/state.js';

beforeEach(() => {
  localStorage.clear();
  state.currentEntry = '';
  state.pages = [];
  state.pageIndex = 0;
  state.scale = 1;
  state.pan = { x: 0, y: 0 };
});

describe('state object', () => {
  it('has the current reader shape', () => {
    expect(state).toHaveProperty('currentEntry');
    expect(state).toHaveProperty('pages');
    expect(state).toHaveProperty('pageIndex');
    expect(state).toHaveProperty('scale');
    expect(state).toHaveProperty('pan');
    expect(state).toHaveProperty('imageCache');
    expect(state).toHaveProperty('pageMetrics');
    expect(state).toHaveProperty('lastOnPageFrame');
  });

  it('initializes with current default values', () => {
    expect(state.currentEntry).toBe('');
    expect(state.pages).toEqual([]);
    expect(state.pageIndex).toBe(0);
    expect(state.scale).toBe(1);
    expect(state.pan).toEqual({ x: 0, y: 0 });
    expect(state.imageCache).toBeInstanceOf(Map);
  });
});

describe('saveProgress', () => {
  it('saves reader progress using currentEntry', () => {
    saveProgress({
      currentEntry: 'Issue 7',
      pageIndex: 5,
    });

    const saved = localStorage.getItem(STORAGE.PROGRESS_KEY);
    expect(saved).toBeTruthy();

    const parsed = JSON.parse(saved);
    expect(parsed.chapter).toBe('Issue 7');
    expect(parsed.page).toBe(5);
    expect(parsed.timestamp).toBeDefined();
  });

  it('uses the shared state object by default', () => {
    state.currentEntry = 'Issue 2';
    state.pageIndex = 3;

    saveProgress();

    const parsed = JSON.parse(localStorage.getItem(STORAGE.PROGRESS_KEY));
    expect(parsed.chapter).toBe('Issue 2');
    expect(parsed.page).toBe(3);
  });

  it('includes a timestamp', () => {
    const before = Date.now();
    saveProgress({ currentEntry: 'Issue 1', pageIndex: 0 });
    const after = Date.now();

    const saved = JSON.parse(localStorage.getItem(STORAGE.PROGRESS_KEY));
    expect(saved.timestamp).toBeGreaterThanOrEqual(before);
    expect(saved.timestamp).toBeLessThanOrEqual(after);
  });

  it('handles localStorage errors gracefully', () => {
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error('Storage full');
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => {
      saveProgress({ currentEntry: 'Issue 9', pageIndex: 0 });
    }).not.toThrow();

    localStorage.setItem = originalSetItem;
    warnSpy.mockRestore();
  });
});

describe('loadProgress', () => {
  it('loads saved progress', () => {
    const testData = {
      chapter: 'Issue 3',
      page: 7,
      timestamp: Date.now(),
    };

    localStorage.setItem(STORAGE.PROGRESS_KEY, JSON.stringify(testData));

    const loaded = loadProgress();
    expect(loaded.chapter).toBe('Issue 3');
    expect(loaded.page).toBe(7);
    expect(loaded.timestamp).toBe(testData.timestamp);
  });

  it('returns null if no progress is saved', () => {
    expect(loadProgress()).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    localStorage.setItem(STORAGE.PROGRESS_KEY, 'invalid json {');
    expect(loadProgress()).toBeNull();
  });

  it('handles localStorage errors gracefully', () => {
    const originalGetItem = localStorage.getItem;
    localStorage.getItem = () => {
      throw new Error('Storage error');
    };

    expect(loadProgress()).toBeNull();

    localStorage.getItem = originalGetItem;
  });
});

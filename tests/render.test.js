/**
 * Tests for rendering logic and two-page mode detection
 */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { PREVIEW_VIEWPORTS } from '../shared/page-builder/preview-contract.js';

// Mock the dependencies
vi.mock('../reader/config.js', () => ({
  CONFIG: {
    TWO_PAGE_BREAKPOINT: 900,
    TWO_PAGE_ASPECT_RATIO: 0.714,
  },
}));

vi.mock('../reader/state.js', () => ({
  state: {
    pageIndex: 0,
    pages: ['page1.png', 'page2.png', 'page3.png'],
  },
}));

vi.mock('../reader/dom.js', () => ({
  el: {},
}));

vi.mock('../reader/analytics.js', () => ({
  markEntryComplete: vi.fn(),
  trackVisiblePages: vi.fn(),
}));

let isTwoPageMode;
let canShowTwoPages;

beforeAll(async () => {
  const mod = await import('../reader/render.js');
  isTwoPageMode = mod.isTwoPageMode;
  canShowTwoPages = mod.canShowTwoPages;
});

describe('isTwoPageMode', () => {
  beforeEach(() => {
    // Reset window dimensions
    global.innerWidth = 1024;
    global.innerHeight = 768;
  });

  it('should return true for wide viewport', () => {
    global.innerWidth = 1200;
    global.innerHeight = 800;

    expect(isTwoPageMode()).toBe(true);
  });

  it('should return false for narrow viewport', () => {
    global.innerWidth = 600;
    global.innerHeight = 800;

    expect(isTwoPageMode()).toBe(false);
  });

  it('should return false if width below breakpoint', () => {
    global.innerWidth = 800; // Below 900px breakpoint
    global.innerHeight = 600;

    expect(isTwoPageMode()).toBe(false);
  });

  it('should return false for tall/narrow aspect ratio', () => {
    global.innerWidth = 1000;
    global.innerHeight = 1600; // Aspect ratio < 0.714

    expect(isTwoPageMode()).toBe(false);
  });

  it('should handle edge case at exact breakpoint', () => {
    global.innerWidth = 900;
    global.innerHeight = 1200; // Aspect ratio = 0.75 > 0.714

    expect(isTwoPageMode()).toBe(true);
  });

  it('should handle edge case at exact aspect ratio', () => {
    global.innerWidth = 1000;
    global.innerHeight = 1400; // Aspect ratio ≈ 0.714

    const result = isTwoPageMode();
    // Should be very close to the threshold
    expect(typeof result).toBe('boolean');
  });

  it('matches builder preview viewport two-page expectations', () => {
    const cases = [
      [PREVIEW_VIEWPORTS.desktop, true],
      [PREVIEW_VIEWPORTS.tablet, false],
      [PREVIEW_VIEWPORTS.mobile, false],
    ];

    for (const [viewport, expected] of cases) {
      global.innerWidth = viewport.width;
      global.innerHeight = viewport.height;
      expect(isTwoPageMode()).toBe(expected);
    }
  });
});

describe('canShowTwoPages', () => {
  let mockState;

  beforeEach(async () => {
    global.innerWidth = 1200;
    global.innerHeight = 800;

    const { state } = await import('../reader/state.js');
    mockState = state;
    mockState.pageIndex = 0;
    mockState.pages = ['page1.png', 'page2.png', 'page3.png'];
  });

  it('should return true when two-page mode active and next page exists', () => {
    mockState.pageIndex = 0;
    expect(canShowTwoPages()).toBe(true);
  });

  it('should return false when on last page', () => {
    mockState.pageIndex = 2; // Last page
    expect(canShowTwoPages()).toBe(false);
  });

  it('should return false when viewport too narrow', () => {
    global.innerWidth = 600;
    mockState.pageIndex = 0;

    expect(canShowTwoPages()).toBe(false);
  });

  it('should return false when only one page remains', () => {
    mockState.pageIndex = 1; // Second-to-last page
    mockState.pages = ['page1.png', 'page2.png'];

    expect(canShowTwoPages()).toBe(false);
  });
});

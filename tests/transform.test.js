import { describe, expect, it } from 'vitest';

import { calculateOnPageFrameSize } from '../reader/transform.js';

describe('calculateOnPageFrameSize', () => {
  it('sizes portrait pages narrower than landscape pages in the same viewport', () => {
    const portrait = calculateOnPageFrameSize({
      pages: [{ width: 600, height: 900 }],
      availableWidth: 900,
      availableHeight: 600,
      pageHorizontalChrome: 6,
      pageVerticalChrome: 6
    });
    const landscape = calculateOnPageFrameSize({
      pages: [{ width: 1600, height: 900 }],
      availableWidth: 900,
      availableHeight: 600,
      pageHorizontalChrome: 6,
      pageVerticalChrome: 6
    });

    expect(portrait).not.toBeNull();
    expect(landscape).not.toBeNull();
    expect(landscape.width).toBeGreaterThan(portrait.width);
    expect(landscape.height).toBeLessThan(portrait.height);
  });

  it('accounts for spread gap and page chrome when sizing two-page spreads', () => {
    const single = calculateOnPageFrameSize({
      pages: [{ width: 600, height: 900 }],
      availableWidth: 1200,
      availableHeight: 600,
      pageHorizontalChrome: 6,
      pageVerticalChrome: 6
    });
    const spread = calculateOnPageFrameSize({
      pages: [
        { width: 600, height: 900 },
        { width: 600, height: 900 }
      ],
      availableWidth: 1200,
      availableHeight: 600,
      gap: 8,
      pageHorizontalChrome: 6,
      pageVerticalChrome: 6
    });

    expect(single).not.toBeNull();
    expect(spread).not.toBeNull();
    expect(spread.width).toBeGreaterThan(single.width);
    expect(spread.height).toBe(single.height);
  });

  it('falls back to the previous frame when a visible page metric is missing', () => {
    const fallback = { width: 420, height: 610 };
    const frame = calculateOnPageFrameSize({
      pages: [
        { width: 600, height: 900 },
        null
      ],
      availableWidth: 1000,
      availableHeight: 700,
      gap: 8,
      pageHorizontalChrome: 6,
      pageVerticalChrome: 6,
      fallbackFrame: fallback
    });

    expect(frame).toEqual(fallback);
  });
});

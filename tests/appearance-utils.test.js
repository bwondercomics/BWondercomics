import { describe, expect, it } from 'vitest';

import {
  appearanceToInlineStyle,
  isAppearanceEmpty,
  mergeAppearance,
  normalizeAppearance,
} from '../shared/page-builder/appearance-utils.js';

describe('appearance utilities', () => {
  it('normalizeAppearance returns null for nullish and empty input', () => {
    expect(normalizeAppearance()).toBeNull();
    expect(normalizeAppearance(null)).toBeNull();
    expect(normalizeAppearance({})).toBeNull();
  });

  it('normalizeAppearance clamps out-of-range values', () => {
    expect(
      normalizeAppearance({
        background: {
          color: '#112233',
          angle: 999,
          opacity: 4,
        },
        border: {
          width: -5,
          opacity: 2,
          radius: 300,
        },
      })
    ).toEqual({
      background: {
        type: null,
        color: '#112233',
        secondaryColor: null,
        angle: 360,
        opacity: 1,
      },
      text: {
        color: null,
        size: null,
        weight: null,
        transform: null,
      },
      border: {
        width: 0,
        style: null,
        color: null,
        opacity: 1,
        radius: 200,
      },
    });
  });

  it('normalizeAppearance rejects invalid colors and keywords', () => {
    expect(
      normalizeAppearance({
        background: {
          type: 'plasma',
          color: 'javascript:alert(1)',
        },
        text: {
          color: '#ffffff',
        },
        border: {
          style: 'double',
        },
      })
    ).toEqual({
      background: {
        type: null,
        color: null,
        secondaryColor: null,
        angle: null,
        opacity: null,
      },
      text: {
        color: '#ffffff',
        size: null,
        weight: null,
        transform: null,
      },
      border: {
        width: null,
        style: null,
        color: null,
        opacity: null,
        radius: null,
      },
    });
  });

  it('normalizeAppearance preserves valid partial input', () => {
    expect(
      normalizeAppearance({
        text: {
          color: '#ffed00',
        },
      })
    ).toEqual({
      background: {
        type: null,
        color: null,
        secondaryColor: null,
        angle: null,
        opacity: null,
      },
      text: {
        color: '#ffed00',
        size: null,
        weight: null,
        transform: null,
      },
      border: {
        width: null,
        style: null,
        color: null,
        opacity: null,
        radius: null,
      },
    });
  });

  it('mergeAppearance returns base when override is null', () => {
    const base = normalizeAppearance({
      text: { color: '#ffffff' },
      border: { width: 2, color: '#00d9ff' },
    });

    expect(mergeAppearance(base, null)).toEqual(base);
  });

  it('mergeAppearance returns override when base is null', () => {
    const override = normalizeAppearance({
      background: { color: '#ff0000' },
    });

    expect(mergeAppearance(null, override)).toEqual(override);
  });

  it('mergeAppearance deep-merges nested appearance fields', () => {
    const base = normalizeAppearance({
      text: { color: '#111111' },
      border: { width: 2, color: '#00d9ff' },
    });
    const override = normalizeAppearance({
      text: { color: '#ffffff' },
    });

    expect(mergeAppearance(base, override)).toEqual({
      background: {
        type: null,
        color: null,
        secondaryColor: null,
        angle: null,
        opacity: null,
      },
      text: {
        color: '#ffffff',
        size: null,
        weight: null,
        transform: null,
      },
      border: {
        width: 2,
        style: null,
        color: '#00d9ff',
        opacity: null,
        radius: null,
      },
    });
  });

  it('appearanceToInlineStyle returns an empty string for null appearance', () => {
    expect(appearanceToInlineStyle(null)).toBe('');
  });

  it('appearanceToInlineStyle emits solid background, text color, border, and radius in stable order', () => {
    const appearance = normalizeAppearance({
      background: { color: '#ff0000' },
      text: { color: '#ffffff' },
      border: { width: 2, style: 'solid', color: '#00d9ff', radius: 8 },
    });

    expect(appearanceToInlineStyle(appearance)).toBe(
      'background: #ff0000; color: #ffffff; border: 2px solid #00d9ff; border-radius: 8px'
    );
  });

  it('normalizes and emits the typography text group (Phase 3): size, weight, transform', () => {
    const appearance = normalizeAppearance({
      text: { size: 18, weight: 700, transform: 'uppercase' },
    });
    expect(appearance.text).toEqual({
      color: null,
      size: 18,
      weight: '700',
      transform: 'uppercase',
    });
    expect(appearanceToInlineStyle(appearance)).toBe(
      'font-size: 18px; font-weight: 700; text-transform: uppercase'
    );

    // Junk values drop; a typography-only appearance still counts as stored values.
    expect(
      normalizeAppearance({ text: { size: 9999, weight: 'heavy', transform: 'wavy' } })?.text
    ).toEqual({ color: null, size: 72, weight: null, transform: null });
    expect(normalizeAppearance({ text: { weight: 'heavy', transform: 'wavy' } })).toBeNull();
  });

  it('appearanceToInlineStyle emits gradient CSS and converts hex colors to rgba when opacity is present', () => {
    const appearance = normalizeAppearance({
      background: {
        type: 'gradient',
        color: '#ff0000',
        secondaryColor: '#0000ff',
        angle: 45,
        opacity: 0.5,
      },
    });

    expect(appearanceToInlineStyle(appearance)).toBe(
      'background: linear-gradient(45deg, rgba(255, 0, 0, 0.5), rgba(0, 0, 255, 0.5))'
    );
  });

  it('appearanceToInlineStyle leaves non-hex colors unchanged when opacity is present', () => {
    const appearance = normalizeAppearance({
      background: {
        color: 'rgba(10, 20, 30, 0.4)',
        opacity: 0.1,
      },
    });

    expect(appearanceToInlineStyle(appearance)).toBe('background: rgba(10, 20, 30, 0.4)');
  });

  it('appearanceToInlineStyle emits border radius even without background or visible border', () => {
    const appearance = normalizeAppearance({
      border: {
        radius: 12,
      },
    });

    expect(appearanceToInlineStyle(appearance)).toBe('border-radius: 12px');
  });

  it('appearanceToInlineStyle emits border none for explicit zero-width borders', () => {
    const appearance = normalizeAppearance({
      border: {
        width: 0,
      },
    });

    expect(appearanceToInlineStyle(appearance)).toBe('border: none');
    expect(isAppearanceEmpty(appearance)).toBe(false);
  });

  it('mergeAppearance preserves explicit zero-width border overrides over a base border', () => {
    const base = normalizeAppearance({
      border: {
        width: 2,
        color: '#00d9ff',
        radius: 8,
      },
    });
    const override = normalizeAppearance({
      border: {
        width: 0,
      },
    });

    const merged = mergeAppearance(base, override);

    expect(merged).not.toBeNull();
    expect(merged?.border.width).toBe(0);
    expect(isAppearanceEmpty(merged)).toBe(false);
    expect(appearanceToInlineStyle(merged)).toBe('border: none; border-radius: 8px');
  });

  it('isAppearanceEmpty returns true for null and all-default objects', () => {
    expect(isAppearanceEmpty(null)).toBe(true);
    expect(
      isAppearanceEmpty({
        background: {
          type: 'solid',
          opacity: 1,
        },
        border: {
          style: 'solid',
          opacity: 1,
        },
      })
    ).toBe(true);
  });
});

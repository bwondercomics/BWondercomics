/**
 * Tests for reader/series.js helpers
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeSeriesId,
  getSeriesDataPath,
  getSeriesPageConfigPath
} from '../reader/series.js';

describe('sanitizeSeriesId', () => {
  it('should normalize to lowercase and hyphenate', () => {
    expect(sanitizeSeriesId(' Battle Bros!! ')).toBe('battle-bros');
  });

  it('should trim leading/trailing dashes', () => {
    expect(sanitizeSeriesId('---Weird---Name---')).toBe('weird---name');
  });

  it('should cap length at 64 characters', () => {
    const input = 'a'.repeat(80);
    expect(sanitizeSeriesId(input).length).toBe(64);
  });
});

describe('series paths', () => {
  it('should use default data.json for the main series', () => {
    expect(getSeriesDataPath('battle-bros')).toBe('data.json');
  });

  it('should use series/<id>/data.json for other series', () => {
    expect(getSeriesDataPath('side-story')).toBe('series/side-story/data.json');
  });

  it('should use default page-config.json for the main series', () => {
    expect(getSeriesPageConfigPath('battle-bros')).toBe('page-config.json');
  });

  it('should use series/<id>/page-config.json for other series', () => {
    expect(getSeriesPageConfigPath('side-story')).toBe('series/side-story/page-config.json');
  });
});

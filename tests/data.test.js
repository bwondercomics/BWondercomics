/**
 * Tests for reader/data.js async loaders
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadChapterData, loadPageConfig } from '../reader/data.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadChapterData', () => {
  it('should normalize chapters and order by displayNumber', async () => {
    const payload = {
      chapters: {
        'Issue 2': ['b.png'],
        'Issue 1': ['a.png']
      },
      chapterMeta: {
        'Issue 1': { displayNumber: 1 },
        'Issue 2': { displayNumber: 2 }
      },
      statusMessage: 'Ready',
      premiumOnly: false,
      unitLabelSingular: 'Issue',
      unitLabelPlural: 'Issues'
    };

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => payload
    })));

    const data = await loadChapterData('battle-bros');
    expect(data.chapterOrder).toEqual(['Issue 1', 'Issue 2']);
    expect(data.chapters['Issue 1']).toEqual(['a.png']);
    expect(data.unitLabelSingular).toBe('Issue');
    expect(data.unitLabelPlural).toBe('Issues');
  });

  it('should throw on invalid chapter payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({})
    })));

    await expect(loadChapterData('battle-bros')).rejects.toThrow(
      'Invalid chapter data structure'
    );
  });
});

describe('loadPageConfig', () => {
  it('should call setSubtitlesFn when subtitles exist', async () => {
    const setSubtitles = vi.fn();
    const payload = {
      content: {
        header: {
          subtitles: ['one', 'two']
        }
      }
    };

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => payload
    })));

    const result = await loadPageConfig(setSubtitles, 'battle-bros');
    expect(result).toBe(true);
    expect(setSubtitles).toHaveBeenCalledWith(['one', 'two']);
  });

  it('should return false when config fails to load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    const result = await loadPageConfig(() => {}, 'battle-bros');
    expect(result).toBe(false);
  });
});

/**
 * Tests for reader/data.js async loaders
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadEntryData, loadPageConfig } from '../reader/data.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadEntryData', () => {
  it('normalizes entries, rewrites protected paths, and preserves entry labels', async () => {
    const payload = {
      entries: {
        'Issue 10': ['protected/comics/battle-bros/10/page-1.png', '/media/local.png'],
        'Issue 2': ['b.png'],
        'Store Release': [],
      },
      entryMeta: {
        'Issue 10': {
          displayNumber: '10',
          coverImage: 'protected/media/covers/issue-10.png',
        },
        'Issue 2': { displayNumber: 2 },
        'Store Release': { releaseType: 'store' },
      },
      statusMessage: 'Ready',
      premiumOnly: true,
      entryLabels: [{ id: 'issues', singular: 'Issue', plural: 'Issues' }],
    };

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => payload,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await loadEntryData('battle-bros');

    expect(fetchMock).toHaveBeenCalledWith('data.json', { cache: 'no-store' });
    expect(data.entryOrder).toEqual(['Issue 2', 'Issue 10', 'Store Release']);
    expect(data.entries['Issue 10']).toEqual([
      '/api/protected/comics/battle-bros/10/page-1.png',
      '/media/local.png',
    ]);
    expect(data.entries['Store Release']).toEqual([]);
    expect(data.entryMeta['Issue 10'].coverImage).toBe('/api/protected/media/covers/issue-10.png');
    expect(data.premiumOnly).toBe(true);
    expect(data.unitLabelSingular).toBe('Entry');
    expect(data.unitLabelPlural).toBe('Entries');
    expect(data.entryLabels).toEqual([{ id: 'issues', singular: 'Issue', plural: 'Issues' }]);
  });

  it('throws on invalid entry payload', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({}),
      }))
    );

    await expect(loadEntryData('battle-bros')).rejects.toThrow('Invalid entry data structure');
    errorSpy.mockRestore();
  });
});

describe('loadPageConfig', () => {
  it('should call setSubtitlesFn when subtitles exist', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const setSubtitles = vi.fn();
    const payload = {
      content: {
        header: {
          subtitles: ['one', 'two'],
        },
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => payload,
      }))
    );

    const result = await loadPageConfig(setSubtitles, 'battle-bros');
    expect(result).toBe(true);
    expect(setSubtitles).toHaveBeenCalledWith(['one', 'two']);
    warnSpy.mockRestore();
  });

  it('should return false when config fails to load', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false }))
    );
    const result = await loadPageConfig(() => {}, 'battle-bros');
    expect(result).toBe(false);
    warnSpy.mockRestore();
  });
});

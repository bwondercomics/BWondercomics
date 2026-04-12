/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../admin/core.js', () => ({
  saveToServer: vi.fn(async () => {}),
}));

import { getContractFixture } from './helpers/contracts.js';
import {
  getCachedPageConfig,
  loadDefaultPageConfig,
  loadSeriesPageConfig,
  saveDefaultPageConfig,
  saveSeriesPageConfig,
} from '../admin/page-config.js';
import { saveToServer } from '../admin/core.js';
import { state } from '../admin/state.js';

describe('admin page-config contract handling', () => {
  beforeEach(() => {
    state.pageConfig = null;
    vi.clearAllMocks();
  });

  it('loads and caches the public page-config contract', async () => {
    const pageConfig = getContractFixture('pageConfig');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => pageConfig,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await loadDefaultPageConfig();
    const second = await loadDefaultPageConfig();

    expect(first).toEqual(pageConfig);
    expect(second).toEqual(pageConfig);
    expect(getCachedPageConfig()).toEqual(pageConfig);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('saves updated page config back through the admin contract', async () => {
    const nextConfig = {
      ...getContractFixture('pageConfig'),
      site: {
        ogImagePath: 'media/site/new-og.png',
      },
    };

    const saved = await saveDefaultPageConfig(nextConfig);

    expect(saveToServer).toHaveBeenCalledWith('admin/page-config.json', nextConfig);
    expect(saved).toEqual(nextConfig);
    expect(state.pageConfig).toEqual(nextConfig);
  });

  it('loads and saves series-scoped page-config contracts through admin series endpoints', async () => {
    const pageConfig = getContractFixture('pageConfig');
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/admin/series/side-story/page-config.json') {
        return {
          ok: true,
          json: async () => pageConfig,
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const loaded = await loadSeriesPageConfig('side-story');
    const saved = await saveSeriesPageConfig('side-story', pageConfig);

    expect(loaded).toEqual(pageConfig);
    expect(saved).toEqual(pageConfig);
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/series/side-story/page-config.json', {
      cache: 'no-store',
    });
    expect(saveToServer).toHaveBeenCalledWith('admin/series/side-story/page-config.json', pageConfig);
  });
});

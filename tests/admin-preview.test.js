/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getContractFixture } from './helpers/contracts.js';
import { mountAdminDom, stubAdminGlobals } from './helpers/admin-fixture.js';

describe('admin preview contract flows', () => {
  beforeEach(() => {
    vi.resetModules();
    mountAdminDom();
    stubAdminGlobals(vi);
    localStorage.clear();
  });

  it('loads preview payloads from the current data contract and renders entry pages', async () => {
    const seriesData = getContractFixture('seriesData');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => seriesData,
      }))
    );

    const [{ createPreviewManager }, { state }] = await Promise.all([
      import('../admin/preview.js'),
      import('../admin/state.js'),
    ]);

    state.entries = seriesData.entries;
    const manager = createPreviewManager({
      getChaptersDataFileUrl: () => '/api/admin/series/battle-bros/data',
    });

    const payload = await manager.loadPreviewPayload();
    manager.updatePreviewChapters('Issue 10');

    expect(payload).toEqual(seriesData);
    expect(document.getElementById('previewData').textContent).toContain(
      '"statusMessage": "Ready"'
    );
    expect(document.getElementById('previewChapterSelect').value).toBe('Issue 10');
    expect(document.getElementById('previewPageLabel').textContent).toBe('Page 1 / 2');
    expect(document.getElementById('previewImg').getAttribute('src')).toBe(
      '../protected/comics/battle-bros/issue-10/01.png'
    );
  });
});

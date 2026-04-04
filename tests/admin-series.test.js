/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getContractFixture } from './helpers/contracts.js';
import { mountAdminDom, stubAdminGlobals } from './helpers/admin-fixture.js';

describe('admin series contract handling', () => {
  beforeEach(() => {
    vi.resetModules();
    mountAdminDom();
    stubAdminGlobals(vi);
    localStorage.clear();
  });

  it('loads the public series index contract and applies the active series labels', async () => {
    const seriesIndex = getContractFixture('seriesIndex');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => seriesIndex,
      }))
    );

    const [{ createSeriesManager }, { ACTIVE_SERIES_KEY, state }] = await Promise.all([
      import('../admin/series.js'),
      import('../admin/state.js'),
    ]);

    localStorage.setItem(ACTIVE_SERIES_KEY, 'stealth-mode');
    const manager = createSeriesManager();

    await manager.loadSeriesIndex();
    manager.renderSeriesSelect();
    manager.applyUnitLabels();

    expect(state.activeSeriesId).toBe('stealth-mode');
    expect(manager.getChaptersDataFileUrl()).toBe('/api/admin/series/stealth-mode/data');
    expect(document.getElementById('seriesSelect').value).toBe('stealth-mode');
    expect(document.getElementById('btnChapters').textContent).toBe('Drops');
    expect(document.getElementById('btnAddEntry').textContent).toBe('+ Add New Drop');
    expect(document.getElementById('btnOpenSeries').href).toContain('series=stealth-mode');
  });
});

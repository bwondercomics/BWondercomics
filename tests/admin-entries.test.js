/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountAdminDom, jsonResponse, stubAdminGlobals } from './helpers/admin-fixture.js';

describe('admin entries api', () => {
  beforeEach(() => {
    vi.resetModules();
    mountAdminDom();
    stubAdminGlobals(vi);
    localStorage.clear();
  });

  it('creates an entry and renders it in the entry list', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/create-entry') {
        return jsonResponse({});
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const [{ createEntriesApi }, { state }, { el }] = await Promise.all([
      import('../admin/entries.js'),
      import('../admin/state.js'),
      import('../admin/dom.js'),
    ]);

    state.entries = {};
    state.entryFolders = {};
    state.entryMeta = {};
    state.entryLabels = [
      {
        id: 'issues',
        singular: 'Issue',
        plural: 'Issues',
        slug: 'issues',
        sortIndex: 0,
        isDefault: true,
      },
    ];
    state.activeEntryLabelId = 'issues';
    state.currentPages = [];
    state.statusMessage = '';
    state.premiumOnly = false;
    state.loadedEntries = [];
    state.loadedEntryIds = [];

    const saveToServer = vi.fn(async () => true);
    const api = createEntriesApi({
      state,
      el,
      saveToServer,
      showSuccess: vi.fn(),
      showError: vi.fn(),
      getUnitLabels: () => ({ singular: 'Issue', plural: 'Issues' }),
      getDataFileUrl: () => 'data.json',
      getSaveFilename: () => 'admin/data.json',
      getChaptersRoot: () => 'chapters',
      getStorageKey: () => 'battlebros_admin_data',
      STORAGE_KEY: 'battlebros_admin_data',
    });

    api.addNewEntry();
    document.getElementById('entryName').value = 'Issue Alpha';
    document.getElementById('entryDisplayNumber').value = '7';
    document.getElementById('entryLabelSelect').value = 'issues';

    await api.saveEntryEdit();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/create-entry',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(saveToServer).toHaveBeenCalledWith(
      'admin/data.json',
      expect.objectContaining({
        entries: { 'Issue Alpha': [] },
        entryMeta: expect.objectContaining({
          'Issue Alpha': expect.objectContaining({
            displayNumber: 7,
            entryLabelId: 'issues',
            entryLabelSingular: 'Issue',
          }),
        }),
      })
    );
    expect(state.entries['Issue Alpha']).toEqual([]);
    expect(document.getElementById('entryList').textContent).toContain('Issue 7 - Issue Alpha');
  });

  it('requires a future date for scheduled entries and always labels them Coming Soon', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/create-entry') return jsonResponse({});
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const [{ createEntriesApi }, { state }, { el }] = await Promise.all([
      import('../admin/entries.js'),
      import('../admin/state.js'),
      import('../admin/dom.js'),
    ]);
    state.entries = {};
    state.entryFolders = {};
    state.entryMeta = {};
    state.entryLabels = [
      {
        id: 'issues',
        singular: 'Issue',
        plural: 'Issues',
        slug: 'issues',
        sortIndex: 0,
        isDefault: true,
      },
    ];
    state.activeEntryLabelId = 'issues';
    state.currentPages = [];
    state.statusMessage = '';
    state.premiumOnly = false;
    state.loadedEntries = [];
    state.loadedEntryIds = [];

    const saveToServer = vi.fn(async () => true);
    const api = createEntriesApi({
      state,
      el,
      saveToServer,
      showSuccess: vi.fn(),
      showError: vi.fn(),
      getUnitLabels: () => ({ singular: 'Issue', plural: 'Issues' }),
      getDataFileUrl: () => 'data.json',
      getSaveFilename: () => 'admin/data.json',
      getChaptersRoot: () => 'chapters',
      getStorageKey: () => 'battlebros_admin_data',
      STORAGE_KEY: 'battlebros_admin_data',
    });

    expect(document.getElementById('entryComingSoon')).toBeNull();
    api.addNewEntry();
    document.getElementById('entryName').value = 'Scheduled Issue';
    document.getElementById('entryStatus').value = 'scheduled';
    document.getElementById('entryStatus').dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('entryPublishAt').value = '2020-01-01T00:00';

    await api.saveEntryEdit();

    expect(alert).toHaveBeenCalledWith('Scheduled entries require a future publish date and time.');
    expect(saveToServer).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    document.getElementById('entryPublishAt').value = '2099-01-01T00:00';
    await api.saveEntryEdit();

    expect(state.entryMeta['Scheduled Issue']).toMatchObject({
      status: 'scheduled',
      publishAt: expect.stringContaining('2099-01-01T'),
    });
    expect(state.entryMeta['Scheduled Issue']).not.toHaveProperty('comingSoon');
    expect(document.getElementById('entryList').textContent).toContain('Coming soon');
    expect(saveToServer).toHaveBeenCalledTimes(1);
  });

  it('keeps entry-level premium working inside a public series', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/move-path') {
        const body = JSON.parse(options.body);
        expect(body).toEqual({
          from: 'comics/02/entries/chapters/01',
          to: 'protected/comics/02/entries/chapters/01',
        });
        return jsonResponse({});
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const [{ createEntriesApi }, { state }, { el }] = await Promise.all([
      import('../admin/entries.js'),
      import('../admin/state.js'),
      import('../admin/dom.js'),
    ]);

    state.entries = {
      'Chapter 1': ['comics/02/entries/chapters/01/01.png', 'comics/02/entries/chapters/01/02.png'],
    };
    state.entryFolders = {
      'Chapter 1': 'comics/02/entries/chapters/01',
    };
    state.entryMeta = {
      'Chapter 1': {
        entryId: 'entry-1',
        premium: false,
        entryLabelId: 'chapters',
        displayNumber: 1,
      },
    };
    state.entryLabels = [
      {
        id: 'chapters',
        singular: 'Chapter',
        plural: 'Chapters',
        slug: 'chapters',
        sortIndex: 0,
        isDefault: true,
      },
    ];
    state.activeEntryLabelId = 'chapters';
    state.currentPages = [];
    state.statusMessage = '';
    state.premiumOnly = false;
    state.loadedEntries = ['Chapter 1'];
    state.loadedEntryIds = ['entry-1'];

    const saveToServer = vi.fn(async () => true);
    const api = createEntriesApi({
      state,
      el,
      saveToServer,
      showSuccess: vi.fn(),
      showError: vi.fn(),
      getUnitLabels: () => ({ singular: 'Chapter', plural: 'Chapters' }),
      getDataFileUrl: () => '/api/admin/series/02/data',
      getSaveFilename: () => 'admin/series/02/data.json',
      getChaptersRoot: () => 'comics/02/entries',
      getStorageKey: () => 'pyre_admin_data',
      STORAGE_KEY: 'pyre_admin_data',
    });

    await api.editEntry('Chapter 1');
    document.getElementById('entryPremium').checked = true;

    await api.saveEntryEdit();

    expect(state.premiumOnly).toBe(false);
    expect(state.entryFolders['Chapter 1']).toBe('protected/comics/02/entries/chapters/01');
    expect(state.entries['Chapter 1']).toEqual([
      'protected/comics/02/entries/chapters/01/01.png',
      'protected/comics/02/entries/chapters/01/02.png',
    ]);
    expect(saveToServer).toHaveBeenCalledWith(
      'admin/series/02/data.json',
      expect.objectContaining({
        premiumOnly: false,
        entryMeta: expect.objectContaining({
          'Chapter 1': expect.objectContaining({ premium: true }),
        }),
      })
    );
  });

  it('syncs all entries when a public series becomes premium', async () => {
    const moves = [];
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/move-path') {
        moves.push(JSON.parse(options.body));
        return jsonResponse({});
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const [{ createEntriesApi }, { state }, { el }] = await Promise.all([
      import('../admin/entries.js'),
      import('../admin/state.js'),
      import('../admin/dom.js'),
    ]);

    state.entries = {
      'Chapter 1': ['comics/02/entries/chapters/01/01.png'],
      'Chapter 2': ['comics/02/entries/chapters/02/01.png'],
    };
    state.entryFolders = {
      'Chapter 1': 'comics/02/entries/chapters/01',
      'Chapter 2': 'comics/02/entries/chapters/02',
    };
    state.entryMeta = {
      'Chapter 1': { entryId: 'entry-1', premium: false, entryLabelId: 'chapters' },
      'Chapter 2': { entryId: 'entry-2', premium: true, entryLabelId: 'chapters' },
    };
    state.entryLabels = [
      {
        id: 'chapters',
        singular: 'Chapter',
        plural: 'Chapters',
        slug: 'chapters',
        sortIndex: 0,
        isDefault: true,
      },
    ];
    state.activeEntryLabelId = 'chapters';
    state.premiumOnly = false;

    const api = createEntriesApi({
      state,
      el,
      saveToServer: vi.fn(async () => true),
      showSuccess: vi.fn(),
      showError: vi.fn(),
      getUnitLabels: () => ({ singular: 'Chapter', plural: 'Chapters' }),
      getDataFileUrl: () => '/api/admin/series/02/data',
      getSaveFilename: () => 'admin/series/02/data.json',
      getChaptersRoot: () => 'comics/02/entries',
      getStorageKey: () => 'pyre_admin_data',
      STORAGE_KEY: 'pyre_admin_data',
    });

    await api.syncEntryAccessPaths(true);

    expect(moves).toEqual([
      {
        from: 'comics/02/entries/chapters/01',
        to: 'protected/comics/02/entries/chapters/01',
      },
      {
        from: 'comics/02/entries/chapters/02',
        to: 'protected/comics/02/entries/chapters/02',
      },
    ]);
    expect(state.premiumOnly).toBe(true);
    expect(state.entries['Chapter 1'][0]).toBe('protected/comics/02/entries/chapters/01/01.png');
    expect(state.entryMeta['Chapter 2'].premium).toBe(true);
  });
});

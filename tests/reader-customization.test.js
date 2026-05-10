import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flushReaderUi, mountReaderDom, stubReaderGlobals } from './helpers/reader-fixture.js';

describe('reader customization bootstrap coordination', () => {
  beforeEach(() => {
    vi.resetModules();
    mountReaderDom();
    stubReaderGlobals(vi);
  });

  afterEach(() => {
    delete window.__BW_READER_BOOT__;
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  async function importCustomizationWithBootSource(source) {
    window.__BW_READER_BOOT__ = {
      pageConfigReady: Promise.resolve({ source }),
    };
    window.BattleBros = {
      setSubtitles: vi.fn(),
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await import('../reader/customization.js');
    await flushReaderUi(2);

    return fetchMock;
  }

  it('skips customization when the builder page is the active source', async () => {
    const fetchMock = await importCustomizationWithBootSource('builder');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.BattleBros.setSubtitles).not.toHaveBeenCalled();
  });

  it('does not re-enter legacy customization when no builder page is active', async () => {
    const fetchMock = await importCustomizationWithBootSource('none');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.BattleBros.setSubtitles).not.toHaveBeenCalled();
  });

  it('treats stale legacy boot results as defensive no-op compatibility input', async () => {
    const fetchMock = await importCustomizationWithBootSource('legacy');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.BattleBros.setSubtitles).not.toHaveBeenCalled();
  });
});

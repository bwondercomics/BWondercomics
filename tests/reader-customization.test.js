import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getContractFixture } from './helpers/contracts.js';
import { flushReaderUi, mountReaderDom, stubReaderGlobals } from './helpers/reader-fixture.js';

function jsonResponse(body, options = {}) {
  const { ok = true, status = 200, statusText = 'OK' } = options;
  return {
    ok,
    status,
    statusText,
    json: async () => body,
  };
}

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

  it('skips legacy customization when the builder page is the active source', async () => {
    window.__BW_READER_BOOT__ = {
      pageConfigReady: Promise.resolve({ source: 'builder' }),
    };
    window.BattleBros = {
      setSubtitles: vi.fn(),
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.doMock('../reader/logger.js', () => ({
      logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));

    await import('../reader/customization.js');
    await flushReaderUi(2);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.BattleBros.setSubtitles).not.toHaveBeenCalled();
  });

  it('keeps the legacy customization path for legacy page-config pages', async () => {
    const pageConfig = getContractFixture('pageConfig');
    window.__BW_READER_BOOT__ = {
      pageConfigReady: Promise.resolve({ source: 'legacy' }),
    };
    window.BattleBros = {
      setSubtitles: vi.fn(),
    };
    const fetchMock = vi.fn(async (url) => {
      if (url === 'page-config.json') {
        return jsonResponse(pageConfig);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.doMock('../reader/logger.js', () => ({
      logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));

    await import('../reader/customization.js');
    await flushReaderUi(2);

    expect(fetchMock).toHaveBeenCalledWith('page-config.json', { cache: 'no-store' });
    expect(window.BattleBros.setSubtitles).toHaveBeenCalledWith(
      pageConfig.content.header.subtitles
    );
  });
});

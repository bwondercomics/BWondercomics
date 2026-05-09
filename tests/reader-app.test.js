import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STORAGE } from '../reader/constants.js';
import { getContractFixture } from './helpers/contracts.js';
import { flushReaderUi, mountReaderDom, stubReaderGlobals } from './helpers/reader-fixture.js';

function buildReaderEntryData() {
  const fixture = getContractFixture('seriesData');
  const entries = Object.fromEntries(
    Object.entries(fixture.entries).map(([name, pages]) => [
      name,
      pages.map((page) =>
        page.startsWith('protected/') ? `/api/protected/${page.replace(/^protected\//, '')}` : page
      ),
    ])
  );
  const entryMeta = JSON.parse(JSON.stringify(fixture.entryMeta));
  Object.values(entryMeta).forEach((meta) => {
    if (meta.coverImage?.startsWith('protected/')) {
      meta.coverImage = `/api/protected/${meta.coverImage.replace(/^protected\//, '')}`;
    }
  });
  return {
    entries,
    entryOrder: ['Issue 2', 'Issue 10', 'Store Release', 'Patron Early Access'],
    statusMessage: fixture.statusMessage,
    entryMeta,
    premiumOnly: fixture.premiumOnly,
    unitLabelSingular: fixture.unitLabelSingular,
    unitLabelPlural: fixture.unitLabelPlural,
    entryLabels: fixture.entryLabels,
  };
}

async function bootReaderApp({ sessionKey = 'guest', savedProgress = null } = {}) {
  vi.resetModules();
  mountReaderDom();
  stubReaderGlobals(vi);
  document.documentElement.classList.add('reader-bootstrap-loading');
  window.__bwReaderBootRelease = window.setTimeout(() => {}, 5000);
  localStorage.clear();
  if (savedProgress) {
    localStorage.setItem(STORAGE.PROGRESS_KEY, JSON.stringify(savedProgress));
  }

  const loadEntryData = vi.fn(async () => buildReaderEntryData());
  const loadPageConfigWithFallback = vi.fn(async () => ({
    source: 'builder',
    page: getContractFixture('builderPage'),
  }));
  const loadLatestPost = vi.fn(async () => getContractFixture('latestPost'));
  const applyBuilderPageToDOM = vi.fn();
  const renderStatusPanel = vi.fn();
  const render = vi.fn();
  const renderLatestUpdate = vi.fn();
  const renderGallery = vi.fn();
  const attachGalleryButton = vi.fn();
  const initPointerHandlers = vi.fn();
  const initReaderAnalytics = vi.fn();
  const setActiveEntry = vi.fn();
  const initRightPanelFeed = vi.fn();
  const initEmailSignupForm = vi.fn();
  const zoomIn = vi.fn();
  const zoomOut = vi.fn();
  const fitToScreen = vi.fn();
  const resetView = vi.fn();
  const prevPage = vi.fn();
  const nextPage = vi.fn();
  const restartEntry = vi.fn();
  const hideEndOfEntry = vi.fn();
  const toggleShortcutsOverlay = vi.fn();
  const closeShortcutsOverlay = vi.fn();
  const loggerLog = vi.fn();

  vi.doMock('../reader/data.js', () => ({
    loadEntryData,
    loadPageConfigWithFallback,
    loadLatestPost,
    applyBuilderPageToDOM,
  }));
  vi.doMock('../reader/render.js', () => ({
    renderStatusPanel,
    render,
  }));
  vi.doMock('../reader/latest.js', () => ({ renderLatestUpdate }));
  vi.doMock('../reader/gallery.js', () => ({ renderGallery, attachGalleryButton }));
  vi.doMock('../reader/pointer.js', () => ({ initPointerHandlers }));
  vi.doMock('../reader/analytics.js', () => ({ initReaderAnalytics, setActiveEntry }));
  vi.doMock('../reader/feed-panel.js', () => ({ initRightPanelFeed, initFeedModules: vi.fn() }));
  vi.doMock('../reader/email.js', () => ({ initEmailSignupForm }));
  vi.doMock('../reader/transform.js', () => ({ fitToScreen, zoomIn, zoomOut, resetView }));
  vi.doMock('../reader/controls.js', () => ({
    prevPage,
    nextPage,
    restartEntry,
    hideEndOfEntry,
  }));
  vi.doMock('../reader/overlays.js', async () => {
    const actual = await vi.importActual('../reader/overlays.js');
    return {
      ...actual,
      toggleShortcutsOverlay,
      closeShortcutsOverlay,
    };
  });
  vi.doMock('../reader/logger.js', () => ({
    logger: {
      log: loggerLog,
      warn: vi.fn(),
      error: vi.fn(),
    },
  }));

  const fetchMock = vi.fn(async (url) => {
    if (url === '/api/session') {
      return {
        ok: true,
        json: async () => getContractFixture('session')[sessionKey],
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  const events = [];
  window.addEventListener('entryChanged', (event) => {
    events.push(event);
  });

  await import('../reader/app.js');
  if (vi.isFakeTimers()) {
    await vi.runAllTimersAsync();
  } else {
    await flushReaderUi(4);
  }
  const { state } = await import('../reader/state.js');

  return {
    events,
    fetchMock,
    mocks: {
      applyBuilderPageToDOM,
      attachGalleryButton,
      closeShortcutsOverlay,
      fitToScreen,
      hideEndOfEntry,
      initEmailSignupForm,
      initPointerHandlers,
      initReaderAnalytics,
      initRightPanelFeed,
      loadEntryData,
      loadLatestPost,
      loadPageConfigWithFallback,
      loggerLog,
      nextPage,
      prevPage,
      render,
      renderGallery,
      renderLatestUpdate,
      renderStatusPanel,
      resetView,
      restartEntry,
      setActiveEntry,
      toggleShortcutsOverlay,
      zoomIn,
      zoomOut,
    },
    state,
  };
}

describe('reader app bootstrap', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('boots the reader against the live markup contract and restores saved progress', async () => {
    const savedProgress = { chapter: 'Issue 10', page: 1, timestamp: Date.now() };
    const { state, events, mocks } = await bootReaderApp({ savedProgress });

    expect(mocks.loadEntryData).toHaveBeenCalledWith('battle-bros');
    expect(mocks.loadPageConfigWithFallback).toHaveBeenCalledWith(
      expect.any(Function),
      'battle-bros',
      {
        draft: false,
        pageSlug: '',
      }
    );
    expect(mocks.applyBuilderPageToDOM).toHaveBeenCalledWith(getContractFixture('builderPage'), {
      seriesId: 'battle-bros',
    });
    expect(mocks.renderStatusPanel.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.applyBuilderPageToDOM.mock.invocationCallOrder[0]
    );
    expect(mocks.renderLatestUpdate).toHaveBeenCalledWith(getContractFixture('latestPost'));
    expect(mocks.renderGallery).toHaveBeenCalledWith(
      ['Issue 2', 'Issue 10', 'Store Release'],
      expect.objectContaining({
        'Issue 2': expect.any(Array),
        'Issue 10': expect.any(Array),
        'Store Release': [],
      }),
      expect.objectContaining({
        lockedEntries: ['Patron Early Access'],
        unitLabelSingular: 'Issue',
      })
    );
    expect(state.currentEntry).toBe('Issue 10');
    expect(state.pageIndex).toBe(1);
    expect(document.getElementById('entry').value).toBe('Issue 10');
    expect(document.querySelectorAll('#entrySelectMenu .entry-option--locked')).toHaveLength(1);
    expect(document.documentElement.classList.contains('reader-bootstrap-loading')).toBe(false);
    expect(document.body.dataset.readerPageSource).toBe('builder');
    expect(events.length).toBeGreaterThan(0);
  });

  it('opens store entries externally and restores the active entry selection', async () => {
    await bootReaderApp({
      savedProgress: { chapter: 'Issue 2', page: 0, timestamp: Date.now() },
    });

    const select = document.getElementById('entry');
    select.value = 'Store Release';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(window.open).toHaveBeenCalledWith(
      'https://store.example.com/battle-bros-volume-1',
      '_blank',
      'noopener,noreferrer'
    );
    expect(select.value).toBe('Issue 2');
  });

  it('wires keyboard shortcuts and debounced resize rendering', async () => {
    vi.useFakeTimers();
    const { mocks } = await bootReaderApp();
    const initialRenderCalls = mocks.render.mock.calls.length;
    const dispatchKey = (key) => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    };

    dispatchKey('ArrowLeft');
    dispatchKey('ArrowRight');
    dispatchKey('+');
    dispatchKey('-');
    dispatchKey('0');
    dispatchKey('?');
    dispatchKey('Escape');

    expect(mocks.prevPage).toHaveBeenCalledTimes(1);
    expect(mocks.nextPage).toHaveBeenCalledTimes(1);
    expect(mocks.zoomIn).toHaveBeenCalledTimes(1);
    expect(mocks.zoomOut).toHaveBeenCalledTimes(1);
    expect(mocks.resetView).toHaveBeenCalledTimes(1);
    expect(mocks.toggleShortcutsOverlay).toHaveBeenCalledTimes(1);
    expect(mocks.closeShortcutsOverlay).toHaveBeenCalledTimes(1);
    expect(mocks.hideEndOfEntry).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(149);
    expect(mocks.render).toHaveBeenCalledTimes(initialRenderCalls);
    vi.advanceTimersByTime(1);
    expect(mocks.render).toHaveBeenCalledTimes(initialRenderCalls + 1);
  });
});

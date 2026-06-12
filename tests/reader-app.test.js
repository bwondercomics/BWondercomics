import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STORAGE } from '../reader/constants.js';
import { buildContractFixture, getContractFixture } from './helpers/contracts.js';
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

function buildReaderShellPage(overrides = {}) {
  const page = buildContractFixture('builderPage', overrides);
  const readerModule = getContractFixture('builderModules').reader;
  page.sections = [
    {
      id: 'reader-shell-section',
      sectionType: 'row',
      layout: '1',
      sortIndex: -1,
      settings: {},
      modules: [
        {
          ...readerModule,
          id: 'reader-shell-module',
          columnIndex: 0,
          sortIndex: 0,
          config: {
            ...readerModule.config,
            source: { mode: 'active-page-series' },
          },
        },
      ],
    },
    ...(Array.isArray(page.sections) ? page.sections : []),
  ];
  return page;
}

async function bootReaderApp({
  sessionKey = 'guest',
  savedProgress = null,
  builderPreview = false,
  resolvedReaderSeriesId = '',
  builderPage = buildReaderShellPage(),
} = {}) {
  vi.resetModules();
  mountReaderDom();
  stubReaderGlobals(vi);
  document.documentElement.classList.add('reader-bootstrap-loading');
  window.__bwReaderBootRelease = window.setTimeout(() => {}, 5000);
  window.happyDOM.setURL(
    builderPreview
      ? 'http://localhost:3000/index.html?series=battle-bros&page=reader&pageId=fixture-builder-page&builderPreview=1&previewSession=session-1'
      : 'http://localhost:3000/index.html'
  );
  localStorage.clear();
  if (savedProgress) {
    localStorage.setItem(STORAGE.PROGRESS_KEY, JSON.stringify(savedProgress));
  }

  const loadEntryData = vi.fn(async () => buildReaderEntryData());
  const loadPageConfigWithFallback = vi.fn(async () => ({
    source: 'builder',
    page: builderPage,
  }));
  const loadLatestPost = vi.fn(async () => getContractFixture('latestPost'));
  const applyBuilderPageToDOM = vi.fn();
  const resolveBuilderPageReaderSeriesId = vi.fn(
    (_page, fallbackSeriesId) => resolvedReaderSeriesId || fallbackSeriesId
  );
  const previewSnapshot = {
    seriesId: 'battle-bros',
    pageId: 'fixture-builder-page',
    pageSlug: 'reader',
    draftMode: 'published',
    snapshotVersion: 1,
    source: 'saved',
    page: builderPage,
    options: {
      builderEditing: true,
      viewport: { id: 'desktop', label: 'Desktop', width: 1920, height: 1080 },
    },
  };
  const requestPreviewSnapshot = vi.fn(async () => ({
    source: 'builder',
    page: previewSnapshot.page,
    previewMode: true,
    builderEditing: true,
    snapshot: previewSnapshot,
  }));
  const setPreviewMetricsContext = vi.fn();
  const emitPreviewMetrics = vi.fn();
  const startPreviewTargetBridge = vi.fn();
  const stopPreviewTargetBridge = vi.fn();
  const subscribePreviewSnapshots = vi.fn();
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
    resolveBuilderPageReaderSeriesId,
  }));
  vi.doMock('../reader/preview-bridge.js', () => ({
    requestPreviewSnapshot,
    setPreviewMetricsContext,
    emitPreviewMetrics,
    startPreviewTargetBridge,
    stopPreviewTargetBridge,
    subscribePreviewSnapshots,
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
    builderPage,
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
      resolveBuilderPageReaderSeriesId,
      loggerLog,
      nextPage,
      prevPage,
      requestPreviewSnapshot,
      setPreviewMetricsContext,
      emitPreviewMetrics,
      startPreviewTargetBridge,
      stopPreviewTargetBridge,
      subscribePreviewSnapshots,
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
    window.happyDOM.setURL('http://localhost:3000/index.html');
  });

  it('boots the reader against the live markup contract and restores saved progress', async () => {
    const savedProgress = { chapter: 'Issue 10', page: 1, timestamp: Date.now() };
    const { builderPage, state, events, mocks } = await bootReaderApp({ savedProgress });

    expect(mocks.loadEntryData).toHaveBeenCalledWith('battle-bros');
    expect(mocks.loadPageConfigWithFallback).toHaveBeenCalledWith(
      expect.any(Function),
      'battle-bros',
      {
        draft: false,
        pageScope: 'series',
        pageSlug: '',
      }
    );
    expect(mocks.applyBuilderPageToDOM).toHaveBeenCalledWith(builderPage, {
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

  it('boots no-reader builder pages without starting reader-only runtime work', async () => {
    const builderPage = buildContractFixture('builderPage', {
      slug: 'about',
      title: 'About',
      pageType: 'custom',
    });
    const { events, mocks } = await bootReaderApp({ builderPage });

    expect(mocks.loadPageConfigWithFallback).toHaveBeenCalledWith(
      expect.any(Function),
      'battle-bros',
      {
        draft: false,
        pageScope: 'series',
        pageSlug: '',
      }
    );
    expect(mocks.applyBuilderPageToDOM).toHaveBeenCalledWith(builderPage, {
      seriesId: 'battle-bros',
    });
    expect(mocks.loadEntryData).not.toHaveBeenCalled();
    expect(mocks.resolveBuilderPageReaderSeriesId).not.toHaveBeenCalled();
    expect(mocks.initReaderAnalytics).not.toHaveBeenCalled();
    expect(mocks.initPointerHandlers).not.toHaveBeenCalled();
    expect(mocks.initRightPanelFeed).not.toHaveBeenCalled();
    expect(mocks.initEmailSignupForm).not.toHaveBeenCalled();
    expect(mocks.attachGalleryButton).not.toHaveBeenCalled();
    expect(mocks.renderGallery).not.toHaveBeenCalled();
    expect(mocks.renderLatestUpdate).not.toHaveBeenCalled();
    expect(mocks.renderStatusPanel).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
    expect(document.body.dataset.readerPageSource).toBe('builder');
    expect(events).toHaveLength(0);

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(mocks.nextPage).not.toHaveBeenCalled();
  });

  it('boots builder preview from the parent snapshot instead of the page API', async () => {
    const { builderPage, mocks } = await bootReaderApp({ builderPreview: true });

    expect(mocks.loadEntryData).toHaveBeenCalledWith('battle-bros');
    expect(mocks.loadPageConfigWithFallback).not.toHaveBeenCalled();
    expect(mocks.requestPreviewSnapshot).toHaveBeenCalledWith({
      seriesId: 'battle-bros',
      pageSlug: 'reader',
    });
    expect(mocks.initReaderAnalytics).not.toHaveBeenCalled();
    expect(mocks.initEmailSignupForm).toHaveBeenCalledWith({ previewMode: true });
    expect(mocks.applyBuilderPageToDOM).toHaveBeenCalledWith(builderPage, {
      seriesId: 'battle-bros',
      previewMode: true,
      builderEditing: true,
    });
    expect(mocks.startPreviewTargetBridge).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: 'fixture-builder-page',
        options: expect.objectContaining({ builderEditing: true }),
      }),
      {
        seriesId: 'battle-bros',
        pageId: 'fixture-builder-page',
        pageSlug: 'reader',
      }
    );
    expect(document.body.dataset.readerPageSource).toBe('builder');
  });

  it('refreshes reader entry data before applying preview snapshot updates', async () => {
    const { mocks } = await bootReaderApp({ builderPreview: true });
    const snapshotHandler = mocks.subscribePreviewSnapshots.mock.calls[0]?.[0];
    const nextPage = buildReaderShellPage({ id: 'next-builder-page' });
    mocks.resolveBuilderPageReaderSeriesId.mockImplementation((page, fallbackSeriesId) =>
      page?.id === 'next-builder-page' ? 'other-series' : fallbackSeriesId
    );

    snapshotHandler({
      source: 'builder',
      page: nextPage,
      previewMode: true,
      builderEditing: true,
      snapshot: {
        seriesId: 'battle-bros',
        pageId: 'fixture-builder-page',
        pageSlug: 'reader',
        page: nextPage,
        options: { builderEditing: true, deviceId: 'mobile' },
      },
      deviceId: 'mobile',
    });
    await flushReaderUi(4);

    expect(mocks.loadEntryData).toHaveBeenCalledWith('other-series');
    expect(mocks.renderGallery).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.any(Object),
      expect.objectContaining({ seriesId: 'other-series' })
    );
    expect(mocks.applyBuilderPageToDOM).toHaveBeenLastCalledWith(nextPage, {
      seriesId: 'other-series',
      previewMode: true,
      builderEditing: true,
      deviceId: 'mobile',
    });
    expect(mocks.startPreviewTargetBridge).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pageId: 'fixture-builder-page',
        options: expect.objectContaining({ builderEditing: true }),
      }),
      {
        seriesId: 'other-series',
        pageId: 'fixture-builder-page',
        pageSlug: 'reader',
      }
    );
  });

  it('recalculates shell state for no-reader preview snapshot updates', async () => {
    const { mocks } = await bootReaderApp({ builderPreview: true });
    const snapshotHandler = mocks.subscribePreviewSnapshots.mock.calls[0]?.[0];
    const noReaderPage = buildContractFixture('builderPage', {
      id: 'no-reader-page',
      slug: 'about',
      pageType: 'custom',
    });
    mocks.loadEntryData.mockClear();

    snapshotHandler({
      source: 'builder',
      page: noReaderPage,
      previewMode: true,
      builderEditing: true,
      snapshot: {
        seriesId: 'battle-bros',
        pageId: 'fixture-builder-page',
        pageSlug: 'about',
        page: noReaderPage,
        options: { builderEditing: true, deviceId: 'mobile' },
      },
      deviceId: 'mobile',
    });
    await flushReaderUi(4);

    expect(mocks.loadEntryData).not.toHaveBeenCalled();
    expect(mocks.applyBuilderPageToDOM).toHaveBeenLastCalledWith(noReaderPage, {
      seriesId: 'battle-bros',
      previewMode: true,
      builderEditing: true,
      deviceId: 'mobile',
    });
    expect(mocks.emitPreviewMetrics).toHaveBeenLastCalledWith('snapshot-updated');
    expect(mocks.startPreviewTargetBridge).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pageSlug: 'about',
        options: expect.objectContaining({ builderEditing: true }),
      }),
      {
        seriesId: 'battle-bros',
        pageId: 'fixture-builder-page',
        pageSlug: 'about',
      }
    );
  });

  it('keeps existing reader handlers inert after an active preview updates to no-reader', async () => {
    vi.useFakeTimers();
    const { mocks } = await bootReaderApp({ builderPreview: true });
    const snapshotHandler = mocks.subscribePreviewSnapshots.mock.calls[0]?.[0];
    const noReaderPage = buildContractFixture('builderPage', {
      id: 'no-reader-page',
      slug: 'about',
      pageType: 'custom',
    });

    snapshotHandler({
      source: 'builder',
      page: noReaderPage,
      previewMode: true,
      builderEditing: true,
      snapshot: {
        seriesId: 'battle-bros',
        pageId: 'fixture-builder-page',
        pageSlug: 'about',
        page: noReaderPage,
        options: { builderEditing: true, deviceId: 'mobile' },
      },
      deviceId: 'mobile',
    });
    await vi.runAllTimersAsync();

    const counts = {
      prevPage: mocks.prevPage.mock.calls.length,
      nextPage: mocks.nextPage.mock.calls.length,
      zoomIn: mocks.zoomIn.mock.calls.length,
      zoomOut: mocks.zoomOut.mock.calls.length,
      fitToScreen: mocks.fitToScreen.mock.calls.length,
      resetView: mocks.resetView.mock.calls.length,
      toggleShortcutsOverlay: mocks.toggleShortcutsOverlay.mock.calls.length,
      closeShortcutsOverlay: mocks.closeShortcutsOverlay.mock.calls.length,
      hideEndOfEntry: mocks.hideEndOfEntry.mock.calls.length,
      render: mocks.render.mock.calls.length,
    };
    expect(document.body.dataset.readerShell).toBe('inactive');

    const dispatchKey = (key) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      return event;
    };
    const arrowEvent = dispatchKey('ArrowRight');
    dispatchKey('ArrowLeft');
    dispatchKey('+');
    dispatchKey('-');
    dispatchKey('0');
    dispatchKey('?');
    dispatchKey('Escape');
    document.getElementById('prevBtn')?.click();
    document.getElementById('nextBtn')?.click();
    document.getElementById('zoomIn')?.click();
    document.getElementById('zoomOut')?.click();
    document.getElementById('fitBtn')?.click();
    document.getElementById('helpBtn')?.click();
    document.getElementById('edgeLeftBtn')?.click();
    document.getElementById('edgeRightBtn')?.click();
    const select = document.getElementById('entry');
    select.value = 'Issue 10';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(200);

    expect(arrowEvent.defaultPrevented).toBe(false);
    expect(mocks.prevPage).toHaveBeenCalledTimes(counts.prevPage);
    expect(mocks.nextPage).toHaveBeenCalledTimes(counts.nextPage);
    expect(mocks.zoomIn).toHaveBeenCalledTimes(counts.zoomIn);
    expect(mocks.zoomOut).toHaveBeenCalledTimes(counts.zoomOut);
    expect(mocks.fitToScreen).toHaveBeenCalledTimes(counts.fitToScreen);
    expect(mocks.resetView).toHaveBeenCalledTimes(counts.resetView);
    expect(mocks.toggleShortcutsOverlay).toHaveBeenCalledTimes(counts.toggleShortcutsOverlay);
    expect(mocks.closeShortcutsOverlay).toHaveBeenCalledTimes(counts.closeShortcutsOverlay);
    expect(mocks.hideEndOfEntry).toHaveBeenCalledTimes(counts.hideEndOfEntry);
    expect(mocks.render).toHaveBeenCalledTimes(counts.render);
  });

  it('reactivates preview reader handlers once when a no-reader snapshot returns to reader', async () => {
    vi.useFakeTimers();
    const { mocks } = await bootReaderApp({ builderPreview: true });
    const snapshotHandler = mocks.subscribePreviewSnapshots.mock.calls[0]?.[0];
    const noReaderPage = buildContractFixture('builderPage', {
      id: 'no-reader-page',
      slug: 'about',
      pageType: 'custom',
    });
    const activePage = buildReaderShellPage({ id: 'reactivated-reader-page' });

    snapshotHandler({
      source: 'builder',
      page: noReaderPage,
      previewMode: true,
      builderEditing: true,
      snapshot: {
        seriesId: 'battle-bros',
        pageId: 'fixture-builder-page',
        pageSlug: 'about',
        page: noReaderPage,
        options: { builderEditing: true, deviceId: 'mobile' },
      },
      deviceId: 'mobile',
    });
    await vi.runAllTimersAsync();
    expect(document.body.dataset.readerShell).toBe('inactive');

    mocks.nextPage.mockClear();
    mocks.render.mockClear();
    snapshotHandler({
      source: 'builder',
      page: activePage,
      previewMode: true,
      builderEditing: true,
      snapshot: {
        seriesId: 'battle-bros',
        pageId: 'fixture-builder-page',
        pageSlug: 'reader',
        page: activePage,
        options: { builderEditing: true, deviceId: 'mobile' },
      },
      deviceId: 'mobile',
    });
    await vi.runAllTimersAsync();
    expect(document.body.dataset.readerShell).toBe('active');

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(mocks.nextPage).toHaveBeenCalledTimes(1);

    document.getElementById('nextBtn')?.click();
    expect(mocks.nextPage).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(150);
    expect(mocks.render).toHaveBeenCalledTimes(1);
  });

  it('loads the reader module specific-series source before initializing visible reader state', async () => {
    const { builderPage, mocks } = await bootReaderApp({ resolvedReaderSeriesId: 'other-series' });

    expect(mocks.resolveBuilderPageReaderSeriesId).toHaveBeenCalledWith(builderPage, 'battle-bros');
    expect(mocks.loadEntryData).toHaveBeenCalledTimes(1);
    expect(mocks.loadEntryData).toHaveBeenCalledWith('other-series');
    expect(mocks.applyBuilderPageToDOM).toHaveBeenCalledWith(builderPage, {
      seriesId: 'other-series',
    });
    expect(mocks.renderGallery).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.any(Object),
      expect.objectContaining({
        seriesId: 'other-series',
      })
    );
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

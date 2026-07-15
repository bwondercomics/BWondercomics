import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BUILDER_PREVIEW_MESSAGE_TYPES,
  BUILDER_PREVIEW_SNAPSHOT_VERSION,
  PREVIEW_VIEWPORTS,
} from '../shared/page-builder/preview-contract.js';

function setPreviewUrl() {
  window.happyDOM.setURL(
    'http://localhost:3000/index.html?series=battle-bros&page=reader&pageId=page-1&builderPreview=1&previewSession=session-1'
  );
}

function buildSnapshot(viewport = PREVIEW_VIEWPORTS.mobile) {
  return {
    seriesId: 'battle-bros',
    pageId: 'page-1',
    pageSlug: 'reader',
    draftMode: 'published',
    snapshotVersion: BUILDER_PREVIEW_SNAPSHOT_VERSION,
    source: 'saved',
    page: { id: 'page-1', sections: [] },
    options: {
      viewport: { ...viewport },
    },
  };
}

function evaluateQuery(query, width, height) {
  if (query === '(max-aspect-ratio: 7/5)') return width / height <= 7 / 5;
  if (query === '(max-aspect-ratio: 5/7)') return width / height <= 5 / 7;
  if (query === '(max-width: 768px)') return width <= 768;
  if (query === '(max-width: 480px)') return width <= 480;
  return false;
}

function setViewport(width, height) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({
      matches: evaluateQuery(query, width, height),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

function setRect(selector, rect) {
  const node = document.querySelector(selector);
  expect(node).not.toBeNull();
  node.getBoundingClientRect = vi.fn(() => ({
    x: rect.left,
    y: rect.top || 0,
    left: rect.left,
    top: rect.top || 0,
    right: rect.right,
    bottom: rect.bottom || 20,
    width: rect.width ?? rect.right - rect.left,
    height: rect.height || 20,
    toJSON: () => ({}),
  }));
}

describe('reader preview metrics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
    document.body.innerHTML = '';
    window.happyDOM.setURL('http://localhost:3000/index.html');
  });

  it('collects branch flags and element-level overflow offenders', async () => {
    setViewport(PREVIEW_VIEWPORTS.mobile.width, PREVIEW_VIEWPORTS.mobile.height);
    document.body.innerHTML = `
      <header class="topbar"><div class="header-actions"></div></header>
      <main>
        <div class="viewerWrap"></div>
        <div class="controls"></div>
        <div class="pb-page">
          <section class="pb-section"></section>
          <div class="pb-buttons"></div>
          <div class="pb-html"></div>
        </div>
      </main>
    `;
    [
      'header.topbar',
      '.header-actions',
      '.viewerWrap',
      '.controls',
      '.pb-page',
      '.pb-section',
      '.pb-buttons',
    ].forEach((selector) => setRect(selector, { left: 0, right: 300, width: 300 }));
    setRect('.pb-html', { left: 0, right: 430, width: 430 });

    const { collectPreviewMetrics } = await import('../reader/preview-bridge.js');
    const metrics = collectPreviewMetrics(buildSnapshot());

    expect(metrics).toMatchObject({
      viewport: PREVIEW_VIEWPORTS.mobile,
      innerWidth: 375,
      innerHeight: 812,
      pageSlug: 'reader',
      snapshotVersion: BUILDER_PREVIEW_SNAPSHOT_VERSION,
      twoPageMode: false,
      branchFlags: {
        aspectMax7By5: true,
        aspectMax5By7: true,
        maxWidth768: true,
        maxWidth480: true,
      },
      overflow: {
        hasOverflow: true,
        rootHasOverflow: false,
      },
    });
    expect(metrics.overflow.offenders).toEqual([
      expect.objectContaining({
        selector: '.pb-html',
        side: 'right',
        viewportWidth: 375,
      }),
    ]);
  });

  it('posts metrics with preview identity', async () => {
    setPreviewUrl();
    setViewport(PREVIEW_VIEWPORTS.tablet.width, PREVIEW_VIEWPORTS.tablet.height);
    document.body.innerHTML = '<div class="pb-page"></div>';
    setRect('.pb-page', { left: 0, right: 700, width: 700 });
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const { emitPreviewMetrics, setPreviewMetricsContext } =
      await import('../reader/preview-bridge.js');

    setPreviewMetricsContext(buildSnapshot(PREVIEW_VIEWPORTS.tablet), {
      previewSession: 'session-1',
      seriesId: 'battle-bros',
      pageId: 'page-1',
      pageSlug: 'reader',
    });
    const metrics = emitPreviewMetrics('test');

    expect(metrics).toMatchObject({
      viewport: PREVIEW_VIEWPORTS.tablet,
      innerWidth: 768,
      innerHeight: 1024,
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.METRICS,
        previewSession: 'session-1',
        seriesId: 'battle-bros',
        pageId: 'page-1',
        pageSlug: 'reader',
        metrics: expect.objectContaining({
          reason: 'test',
          branchFlags: expect.objectContaining({
            aspectMax7By5: true,
            aspectMax5By7: false,
            maxWidth768: true,
            maxWidth480: false,
          }),
        }),
      }),
      window.location.origin
    );
  });
});

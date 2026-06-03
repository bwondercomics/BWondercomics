import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BUILDER_PREVIEW_MESSAGE_TYPES,
  BUILDER_PREVIEW_SNAPSHOT_VERSION,
  buildPreviewSnapshotMessage,
} from '../admin/page-builder/preview-contract.js';

function setPreviewUrl() {
  window.happyDOM.setURL(
    'http://localhost:3000/index.html?series=battle-bros&page=reader&pageId=page-1&builderPreview=1&previewSession=session-1'
  );
}

function buildSnapshot(overrides = {}) {
  return {
    seriesId: 'battle-bros',
    pageId: 'page-1',
    pageSlug: 'reader',
    draftMode: 'published',
    snapshotVersion: BUILDER_PREVIEW_SNAPSHOT_VERSION,
    source: 'saved',
    page: { id: 'page-1', sections: [] },
    options: {},
    ...overrides,
  };
}

function dispatchPreviewMessage(message, origin = window.location.origin) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: message,
      origin,
      source: window.parent,
    })
  );
}

describe('reader preview bridge', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    window.happyDOM.setURL('http://localhost:3000/index.html');
  });

  it('requests a snapshot, accepts a valid response, and acks the parent', async () => {
    setPreviewUrl();
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const { requestPreviewSnapshot } = await import('../reader/preview-bridge.js');

    const resultPromise = requestPreviewSnapshot({ timeoutMs: 1000 });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.REQUEST_SNAPSHOT,
        previewSession: 'session-1',
        seriesId: 'battle-bros',
        pageId: 'page-1',
        pageSlug: 'reader',
      }),
      window.location.origin
    );

    const snapshot = buildSnapshot({ options: { builderEditing: true } });
    dispatchPreviewMessage(buildPreviewSnapshotMessage(snapshot, 'session-1'));

    await expect(resultPromise).resolves.toEqual({
      source: 'builder',
      page: snapshot.page,
      previewMode: true,
      builderEditing: true,
      snapshot,
    });
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.ACK,
        previewSession: 'session-1',
      }),
      window.location.origin
    );
  });

  it('ignores wrong-origin messages and rejects invalid same-origin snapshots', async () => {
    setPreviewUrl();
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const { requestPreviewSnapshot } = await import('../reader/preview-bridge.js');

    const resultPromise = requestPreviewSnapshot({ timeoutMs: 1000 });
    const rejection = expect(resultPromise).rejects.toThrow(/pageSlug mismatch/i);
    dispatchPreviewMessage(
      buildPreviewSnapshotMessage(buildSnapshot({ pageSlug: 'about' }), 'session-1'),
      'https://evil.example'
    );
    dispatchPreviewMessage(
      buildPreviewSnapshotMessage(buildSnapshot({ pageSlug: 'about' }), 'session-1')
    );

    await rejection;
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.ERROR,
        error: expect.stringMatching(/pageSlug mismatch/i),
      }),
      window.location.origin
    );
  });

  it('times out instead of falling back to API page loading', async () => {
    vi.useFakeTimers();
    setPreviewUrl();
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const { requestPreviewSnapshot } = await import('../reader/preview-bridge.js');

    const resultPromise = requestPreviewSnapshot({ timeoutMs: 10 });
    const rejection = expect(resultPromise).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(10);

    await rejection;
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.ERROR,
        error: expect.stringMatching(/Timed out/i),
      }),
      window.location.origin
    );
  });

  it('subscribes to follow-up preview snapshots and acknowledges them', async () => {
    setPreviewUrl();
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const onSnapshot = vi.fn();
    const { subscribePreviewSnapshots } = await import('../reader/preview-bridge.js');

    const unsubscribe = subscribePreviewSnapshots(onSnapshot, {
      seriesId: 'battle-bros',
      pageId: 'page-1',
      pageSlug: 'reader',
    });
    const snapshot = buildSnapshot({
      page: { id: 'page-1', sections: [{ id: 'section-1', modules: [] }] },
    });
    dispatchPreviewMessage(buildPreviewSnapshotMessage(snapshot, 'session-1'));

    expect(onSnapshot).toHaveBeenCalledWith({
      source: 'builder',
      page: snapshot.page,
      previewMode: true,
      builderEditing: false,
      snapshot,
    });
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.ACK,
        previewSession: 'session-1',
      }),
      window.location.origin
    );

    unsubscribe();
    dispatchPreviewMessage(buildPreviewSnapshotMessage(snapshot, 'session-1'));
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it('collects marked builder targets with viewport-relative geometry', async () => {
    setPreviewUrl();
    document.body.innerHTML = `
      <div class="viewerWrap" data-builder-page-id="page-1">
        <header class="topbar" data-builder-page-id="page-1" data-builder-surface="page-header"></header>
        <section data-builder-section-id="section-1" data-builder-section-index="0">
          <div data-builder-column-index="0">
            <article data-builder-module-id="module-1" data-builder-module-type="text"></article>
          </div>
        </section>
      </div>
    `;
    const rects = new Map([
      ['.viewerWrap', { top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600 }],
      ['header', { top: 4, left: 0, right: 800, bottom: 44, width: 800, height: 40 }],
      ['section', { top: 80, left: 20, right: 780, bottom: 280, width: 760, height: 200 }],
      [
        '[data-builder-column-index]',
        { top: 90, left: 30, right: 400, bottom: 260, width: 370, height: 170 },
      ],
      ['article', { top: 100, left: 40, right: 240, bottom: 180, width: 200, height: 80 }],
    ]);
    rects.forEach((rect, selector) => {
      document.querySelector(selector).getBoundingClientRect = () => rect;
    });

    const { collectPreviewTargets } = await import('../reader/preview-bridge.js');
    const targets = collectPreviewTargets(buildSnapshot({ options: { builderEditing: true } }));

    expect(targets.map((item) => item.target.kind)).toEqual([
      'page',
      'header',
      'section',
      'column',
      'module',
    ]);
    expect(targets.at(-1)).toMatchObject({
      target: {
        key: 'module:module-1',
        moduleId: 'module-1',
        moduleType: 'text',
        sectionId: 'section-1',
        columnIndex: 0,
      },
      rect: { top: 100, left: 40, width: 200, height: 80 },
      visible: true,
      label: 'text module',
    });
  });

  it('emits hover/select target messages and blocks iframe interactions while editing', async () => {
    setPreviewUrl();
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      callback();
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    document.body.innerHTML = `
      <a href="https://example.com" data-builder-page-id="page-1">
        <span data-builder-section-id="section-1">
          <span data-builder-column-index="0">
            <button data-builder-module-id="module-1" data-builder-module-type="buttons">Store</button>
          </span>
        </span>
      </a>
      <form><button type="submit">Submit</button></form>
    `;
    document
      .querySelectorAll(
        '[data-builder-page-id], [data-builder-section-id], [data-builder-column-index], [data-builder-module-id]'
      )
      .forEach((element, index) => {
        element.getBoundingClientRect = () => ({
          top: index * 10,
          left: index * 10,
          right: index * 10 + 100,
          bottom: index * 10 + 40,
          width: 100,
          height: 40,
        });
      });
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const { startPreviewTargetBridge } = await import('../reader/preview-bridge.js');

    const cleanup = startPreviewTargetBridge(buildSnapshot({ options: { builderEditing: true } }));
    const target = document.querySelector('[data-builder-module-id]');
    target.dispatchEvent(new Event('pointermove', { bubbles: true, cancelable: true }));
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    target.dispatchEvent(click);
    const submit = new Event('submit', { bubbles: true, cancelable: true });
    document.querySelector('form').dispatchEvent(submit);
    const blockedKeys = ['ArrowRight', '+', '?', 'Enter', ' '].map((key) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.TARGETS,
        targets: expect.arrayContaining([
          expect.objectContaining({ target: expect.objectContaining({ moduleId: 'module-1' }) }),
        ]),
      }),
      window.location.origin
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_HOVER,
        target: expect.objectContaining({ moduleId: 'module-1' }),
      }),
      window.location.origin
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_SELECT,
        target: expect.objectContaining({ moduleId: 'module-1' }),
      }),
      window.location.origin
    );
    expect(click.defaultPrevented).toBe(true);
    expect(submit.defaultPrevented).toBe(true);
    blockedKeys.forEach((event) => expect(event.defaultPrevented).toBe(true));
    cleanup();

    const afterCleanup = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(afterCleanup);
    expect(afterCleanup.defaultPrevented).toBe(false);
  });

  it('does not start the target bridge when builder editing is disabled', async () => {
    setPreviewUrl();
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const { collectPreviewTargets, startPreviewTargetBridge } =
      await import('../reader/preview-bridge.js');
    const snapshot = buildSnapshot({ options: { builderEditing: false } });

    expect(collectPreviewTargets(snapshot)).toEqual([]);
    expect(startPreviewTargetBridge(snapshot)).toBeNull();
    expect(postMessage).not.toHaveBeenCalled();

    const keydown = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(keydown);
    expect(keydown.defaultPrevented).toBe(false);
  });

  it('stops an active target bridge when a follow-up snapshot disables builder editing', async () => {
    setPreviewUrl();
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      callback();
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    document.body.innerHTML = `
      <button data-builder-page-id="page-1" data-builder-module-id="module-1" data-builder-module-type="buttons">Store</button>
    `;
    const target = document.querySelector('[data-builder-module-id]');
    target.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 100,
      bottom: 40,
      width: 100,
      height: 40,
    });
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const { startPreviewTargetBridge } = await import('../reader/preview-bridge.js');

    expect(startPreviewTargetBridge(buildSnapshot({ options: { builderEditing: true } }))).not.toBe(
      null
    );
    const callsAfterStart = postMessage.mock.calls.length;
    expect(startPreviewTargetBridge(buildSnapshot({ options: { builderEditing: false } }))).toBe(
      null
    );

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    target.dispatchEvent(click);
    const keydown = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(keydown);

    expect(click.defaultPrevented).toBe(false);
    expect(keydown.defaultPrevented).toBe(false);
    expect(postMessage).toHaveBeenCalledTimes(callsAfterStart);
  });
});

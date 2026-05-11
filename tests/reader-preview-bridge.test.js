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

    const snapshot = buildSnapshot();
    dispatchPreviewMessage(buildPreviewSnapshotMessage(snapshot, 'session-1'));

    await expect(resultPromise).resolves.toEqual({
      source: 'builder',
      page: snapshot.page,
      previewMode: true,
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
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BUILDER_PREVIEW_MESSAGE_TYPES,
  BUILDER_PREVIEW_SNAPSHOT_VERSION,
  buildPreviewInlineEditMessage,
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
        <div class="pb-page-end-target" data-builder-surface="page-end"></div>
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
      [
        '[data-builder-surface="page-end"]',
        { top: 300, left: 20, right: 780, bottom: 340, width: 760, height: 40 },
      ],
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
      'page',
    ]);
    expect(targets.at(-2)).toMatchObject({
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
    expect(targets.at(-1)).toMatchObject({
      target: {
        kind: 'page',
        key: 'page-end:page-1',
        pageId: 'page-1',
        surface: 'page-end',
      },
      rect: { top: 300, left: 20, width: 760, height: 40 },
      visible: true,
      label: 'Page end',
    });
  });

  it('collects an empty reader-panel column as a column drop target', async () => {
    setPreviewUrl();
    // The renderer emits this markup for an empty droppable panel: a section-id wrapper around an
    // empty column marker, living inside #leftPanel (outside the main section flow). It must still
    // be collected and measured through the existing [data-builder-column-index] path.
    document.body.innerHTML = `
      <div class="viewerWrap" data-builder-page-id="page-1">
        <aside id="leftPanel">
          <div class="panel-builder panel-builder--left" data-builder-surface="left-panel">
            <div class="pb-builder-panel-section" data-builder-section-id="reader-section" data-builder-section-index="0" data-builder-layout="1-1">
              <div class="pb-builder-panel-column" data-builder-column-index="0"></div>
            </div>
          </div>
        </aside>
      </div>
    `;
    const rects = new Map([
      ['.viewerWrap', { top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600 }],
      [
        '.pb-builder-panel-section',
        { top: 80, left: 0, right: 240, bottom: 200, width: 240, height: 120 },
      ],
      [
        '.pb-builder-panel-column',
        { top: 90, left: 10, right: 230, bottom: 130, width: 220, height: 40 },
      ],
    ]);
    rects.forEach((rect, selector) => {
      document.querySelector(selector).getBoundingClientRect = () => rect;
    });

    const { collectPreviewTargets } = await import('../reader/preview-bridge.js');
    const targets = collectPreviewTargets(buildSnapshot({ options: { builderEditing: true } }));

    const columnTarget = targets.find((item) => item.target.key === 'column:reader-section:0');
    // Fails if the empty panel column is not collected/measured (the dual-selector-list pitfall).
    expect(columnTarget).toBeDefined();
    expect(columnTarget).toMatchObject({
      target: { kind: 'column', sectionId: 'reader-section', columnIndex: 0 },
      rect: { top: 90, left: 10, width: 220, height: 40 },
      visible: true,
      label: 'Column 1',
    });
  });

  it('collects header blocks and 3×3 header cells as edit-mode targets', async () => {
    setPreviewUrl();
    // Edit-mode header markup: header-layout.js renders every row/region cell (marked
    // data-builder-header-cell) and marks each placed block with data-builder-header-block.
    document.body.innerHTML = `
      <div class="viewerWrap" data-builder-page-id="page-1">
        <header class="topbar" data-builder-page-id="page-1" data-builder-surface="page-header">
          <div class="topbar-layout">
            <div class="topbar-layout-row" data-row="top">
              <div class="topbar-region" data-region="left" data-builder-header-cell="true" data-builder-header-row="top">
                <div class="brand" data-builder-header-block="brand"></div>
              </div>
              <div class="topbar-region" data-region="center" data-builder-header-cell="true" data-builder-header-row="top"></div>
              <div class="topbar-region" data-region="right" data-builder-header-cell="true" data-builder-header-row="top"></div>
            </div>
          </div>
        </header>
      </div>
    `;
    const rects = new Map([
      ['.viewerWrap', { top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600 }],
      ['header', { top: 0, left: 0, right: 800, bottom: 60, width: 800, height: 60 }],
      ['[data-region="left"]', { top: 4, left: 0, right: 260, bottom: 56, width: 260, height: 52 }],
      [
        '[data-region="center"]',
        { top: 4, left: 270, right: 530, bottom: 56, width: 260, height: 52 },
      ],
      [
        '[data-region="right"]',
        { top: 4, left: 540, right: 800, bottom: 56, width: 260, height: 52 },
      ],
      ['.brand', { top: 8, left: 8, right: 200, bottom: 52, width: 192, height: 44 }],
    ]);
    rects.forEach((rect, selector) => {
      document.querySelector(selector).getBoundingClientRect = () => rect;
    });

    const { collectPreviewTargets } = await import('../reader/preview-bridge.js');
    const targets = collectPreviewTargets(buildSnapshot({ options: { builderEditing: true } }));

    const blockTarget = targets.find((item) => item.target.key === 'header:page-1:brand');
    expect(blockTarget).toMatchObject({
      target: { kind: 'header', surface: 'page-header', blockId: 'brand' },
      label: 'Header block',
    });

    const cellKeys = targets
      .filter((item) => item.target.rowId)
      .map((item) => item.target.key)
      .sort();
    expect(cellKeys).toEqual([
      'header-cell:page-1:top:center',
      'header-cell:page-1:top:left',
      'header-cell:page-1:top:right',
    ]);
    const centerCell = targets.find((item) => item.target.key === 'header-cell:page-1:top:center');
    expect(centerCell).toMatchObject({
      target: { kind: 'header', rowId: 'top', region: 'center', surface: 'page-header' },
      rect: { top: 4, left: 270, width: 260, height: 52 },
      visible: true,
      label: 'Header cell',
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

  it('starts text inline editing from double-click and emits draft messages', async () => {
    setPreviewUrl();
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      callback();
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    document.body.innerHTML = `
      <div class="viewerWrap" data-builder-page-id="page-1">
        <section data-builder-section-id="section-1">
          <div data-builder-column-index="0">
            <article data-builder-module-id="module-1" data-builder-module-type="text">
              <div class="pb-text" data-builder-edit-field="content"><p>Original</p></div>
            </article>
          </div>
        </section>
      </div>
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
    const editable = document.querySelector('.pb-text');
    const dblclick = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
    editable.dispatchEvent(dblclick);

    expect(dblclick.defaultPrevented).toBe(true);
    expect(editable.getAttribute('contenteditable')).toBe('true');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_START,
        target: expect.objectContaining({ moduleId: 'module-1', moduleType: 'text' }),
        field: 'content',
        value: '<p>Original</p>',
      }),
      window.location.origin
    );

    editable.innerHTML = '<p><strong>Inline</strong> draft</p>';
    editable.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE,
        target: expect.objectContaining({ moduleId: 'module-1' }),
        field: 'content',
        value: '<p><strong>Inline</strong> draft</p>',
      }),
      window.location.origin
    );

    const arrow = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    editable.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(false);

    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    editable.dispatchEvent(escape);

    expect(escape.defaultPrevented).toBe(true);
    expect(editable.hasAttribute('contenteditable')).toBe(false);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CANCEL,
        target: expect.objectContaining({ moduleId: 'module-1' }),
        field: 'content',
      }),
      window.location.origin
    );
    cleanup();
  });

  it('can start text inline editing from a validated parent toolbar message', async () => {
    setPreviewUrl();
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      callback();
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    document.body.innerHTML = `
      <article data-builder-page-id="page-1" data-builder-module-id="module-1" data-builder-module-type="text">
        <div class="pb-text" data-builder-edit-field="content"><p>Original</p></div>
      </article>
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

    const cleanup = startPreviewTargetBridge(buildSnapshot({ options: { builderEditing: true } }));
    dispatchPreviewMessage(
      buildPreviewInlineEditMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_START,
        {
          sequence: 1,
          target: {
            kind: 'module',
            key: 'module:module-1',
            pageId: 'page-1',
            moduleId: 'module-1',
            moduleType: 'text',
          },
          field: 'content',
          reason: 'toolbar',
        },
        {
          previewSession: 'session-1',
          seriesId: 'battle-bros',
          pageId: 'page-1',
          pageSlug: 'reader',
        }
      )
    );

    expect(document.querySelector('.pb-text').getAttribute('contenteditable')).toBe('true');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_START,
        reason: 'toolbar',
      }),
      window.location.origin
    );
    cleanup();
  });

  it('applies parent inline edit changes without echoing a change back to admin', async () => {
    setPreviewUrl();
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      callback();
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    document.body.innerHTML = `
      <article data-builder-page-id="page-1" data-builder-module-id="module-1" data-builder-module-type="text">
        <div class="pb-text" data-builder-edit-field="content"><p>Original</p></div>
      </article>
    `;
    const targetEl = document.querySelector('[data-builder-module-id]');
    targetEl.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      right: 100,
      bottom: 40,
      width: 100,
      height: 40,
    });
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const { startPreviewTargetBridge } = await import('../reader/preview-bridge.js');
    const cleanup = startPreviewTargetBridge(buildSnapshot({ options: { builderEditing: true } }));
    const target = {
      kind: 'module',
      key: 'module:module-1',
      pageId: 'page-1',
      moduleId: 'module-1',
      moduleType: 'text',
    };

    document
      .querySelector('.pb-text')
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    postMessage.mockClear();

    dispatchPreviewMessage(
      buildPreviewInlineEditMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE,
        {
          sequence: 1,
          target,
          field: 'content',
          value: '<p onclick="evil()">Panel</p><script>bad()</script><img src=x>',
          reason: 'side-panel',
        },
        {
          previewSession: 'session-1',
          seriesId: 'battle-bros',
          pageId: 'page-1',
          pageSlug: 'reader',
        }
      )
    );

    expect(document.querySelector('.pb-text').innerHTML).toBe('<p>Panel</p>');
    expect(
      postMessage.mock.calls.some(
        ([message]) => message.type === BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE
      )
    ).toBe(false);
    cleanup();
  });

  it('sanitizes unsafe typed inline HTML before posting changes', async () => {
    setPreviewUrl();
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      callback();
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    document.body.innerHTML = `
      <article data-builder-page-id="page-1" data-builder-module-id="module-1" data-builder-module-type="text">
        <div class="pb-text" data-builder-edit-field="content"><p>Original</p></div>
      </article>
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
    const cleanup = startPreviewTargetBridge(buildSnapshot({ options: { builderEditing: true } }));
    const editable = document.querySelector('.pb-text');

    editable.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    postMessage.mockClear();
    editable.innerHTML =
      '<p onclick="evil()"><a href="javascript:alert(1)">Bad</a><strong>Ok</strong><img src=x><iframe></iframe></p>';
    editable.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertHTML' }));

    expect(editable.innerHTML).toBe('<p><a>Bad</a><strong>Ok</strong></p>');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE,
        value: '<p><a>Bad</a><strong>Ok</strong></p>',
      }),
      window.location.origin
    );

    cleanup();
  });

  it('sanitizes pasted inline HTML before posting changes', async () => {
    setPreviewUrl();
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      callback();
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    document.body.innerHTML = `
      <article data-builder-page-id="page-1" data-builder-module-id="module-1" data-builder-module-type="text">
        <div class="pb-text" data-builder-edit-field="content"><p>Original</p></div>
      </article>
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
    const cleanup = startPreviewTargetBridge(buildSnapshot({ options: { builderEditing: true } }));
    const editable = document.querySelector('.pb-text');

    editable.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    postMessage.mockClear();
    editable.innerHTML = '';
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', {
      value: {
        getData: vi.fn((type) =>
          type === 'text/html'
            ? '<div><script>bad()</script><em onmouseover="evil()">Pasted</em><form></form></div>'
            : ''
        ),
      },
    });
    editable.dispatchEvent(paste);

    expect(paste.defaultPrevented).toBe(true);
    expect(editable.innerHTML).toBe('<em>Pasted</em>');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE,
        value: '<em>Pasted</em>',
        reason: 'paste',
      }),
      window.location.origin
    );
    cleanup();
  });

  it('sanitizes inline link toolbar URLs and blocks active editable anchor clicks', async () => {
    setPreviewUrl();
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      callback();
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    document.body.innerHTML = `
      <article data-builder-page-id="page-1" data-builder-module-id="module-1" data-builder-module-type="text">
        <div class="pb-text" data-builder-edit-field="content"><p><a href="https://example.com">Original</a></p></div>
      </article>
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
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });
    const prompt = vi.spyOn(window, 'prompt');
    const { startPreviewTargetBridge } = await import('../reader/preview-bridge.js');
    const cleanup = startPreviewTargetBridge(buildSnapshot({ options: { builderEditing: true } }));
    const editable = document.querySelector('.pb-text');

    editable.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    const linkButton = document.querySelector('.builder-inline-edit-toolbar button[title="Link"]');
    const clickToolbarButton = () => {
      linkButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      linkButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    };

    prompt.mockReturnValueOnce('javascript:alert(1)');
    clickToolbarButton();
    expect(execCommand).not.toHaveBeenCalledWith('createLink', false, expect.anything());

    const safeUrls = [
      'https://example.com',
      'mailto:test@example.com',
      '/reader',
      'relative',
      '#top',
    ];
    safeUrls.forEach((url) => {
      execCommand.mockClear();
      prompt.mockReturnValueOnce(url);
      clickToolbarButton();
      expect(execCommand).toHaveBeenCalledWith('createLink', false, url);
    });

    postMessage.mockClear();
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    editable.querySelector('a').dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(
      postMessage.mock.calls.some(
        ([message]) => message.type === BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_SELECT
      )
    ).toBe(false);
    cleanup();
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

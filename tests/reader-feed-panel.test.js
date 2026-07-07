import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { latestPreviewHtml, renderLatestUpdate } from '../reader/latest.js';
import { initFeedModules, initRightPanelFeed, loadFeedInto } from '../reader/feed-panel.js';
import { renderModule } from '../reader/page-renderer.js';
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

describe('reader feed and latest panels', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mountReaderDom();
    stubReaderGlobals(vi);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('sorts posts, sanitizes content, toggles entries, and falls back on missing images', async () => {
    const posts = getContractFixture('feedPosts');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url === '/api/posts') {
          return jsonResponse({ posts: [posts[1], posts[2], posts[0]] });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      })
    );
    const body = document.createElement('div');

    const ok = await loadFeedInto(body, 2, { itemTitleColor: '#fff' });

    expect(ok).toBe(true);
    const items = body.querySelectorAll('.feed-item');
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('.feed-item-title')?.textContent).toBe('Newest Briefing');
    expect(items[1].querySelector('.feed-item-body')?.innerHTML).not.toContain('<script');
    expect(items[1].querySelector('.feed-item-body')?.innerHTML).not.toContain('<custom-embed');

    items[0]
      .querySelector('.feed-item-toggle')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(items[0].classList.contains('is-open')).toBe(true);

    const thumb = items[0].querySelector('img');
    expect(thumb).not.toBeNull();
    thumb?.onerror?.(new Event('error'));
    expect(thumb?.src).toContain('/assets/image-missing.png');
    expect(thumb?.classList.contains('is-missing')).toBe(true);
  });

  it('renders empty and failure feed states', async () => {
    const emptyBody = document.createElement('div');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ posts: [] }))
    );
    await loadFeedInto(emptyBody);
    expect(emptyBody.textContent).toContain('No updates yet');

    const errorBody = document.createElement('div');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({}, { ok: false, status: 500, statusText: 'Boom' }))
    );
    const ok = await loadFeedInto(errorBody);
    expect(ok).toBe(false);
    expect(errorBody.textContent).toContain('Could not load updates.');
  });

  it('wires module feed previews and open-close behavior', async () => {
    const module = getContractFixture('builderModules').feed;
    const latestPost = getContractFixture('latestPost');
    const posts = getContractFixture('feedPosts');
    const container = document.createElement('div');
    container.innerHTML = parseFeedModule(module);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url === '/api/posts/latest') {
          return jsonResponse({ post: latestPost });
        }
        if (url === '/api/posts') {
          return jsonResponse({ posts });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      })
    );

    initFeedModules(container);
    await flushReaderUi(4);

    expect(container.querySelector('.latest-name')?.textContent).toBe('Issue 10 Released');

    container
      .querySelector('.pb-feed-toggle')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushReaderUi(2);
    expect(container.querySelector('.pb-feed-module')?.classList.contains('feed-mode')).toBe(true);
    expect(container.querySelectorAll('.feed-item')).toHaveLength(3);

    container
      .querySelector('.pb-feed-exit')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(container.querySelector('.pb-feed-module')?.classList.contains('feed-mode')).toBe(false);
  });

  it('disables the module dropdown feed when the contract says so', async () => {
    const module = getContractFixture('builderModules').feed;
    module.config.showDropdown = false;
    const container = document.createElement('div');
    container.innerHTML = parseFeedModule(module);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ post: getContractFixture('latestPost') }))
    );

    initFeedModules(container);
    await flushReaderUi(2);

    expect(container.querySelector('.pb-feed-toggle')?.hasAttribute('disabled')).toBe(true);
    expect(container.querySelector('.pb-feed-bar')).toBeNull();
    expect(container.querySelector('.pb-feed-panel')).toBeNull();
  });

  it('wires the legacy right-panel feed mode against the live reader DOM', async () => {
    const posts = getContractFixture('feedPosts');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url === '/api/posts') {
          return jsonResponse({ posts });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      })
    );

    initRightPanelFeed();
    document
      .getElementById('latestHeadingBtn')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushReaderUi(3);

    expect(document.getElementById('rightPanel')?.classList.contains('feed-mode')).toBe(true);
    expect(document.querySelectorAll('#rightPanelFeedBody .feed-item')).toHaveLength(3);

    document
      .getElementById('feedExitBtn')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('rightPanel')?.classList.contains('feed-mode')).toBe(false);

    // Phase 6: a builder-placed links-grid module button (class-delegated, anywhere in
    // the DOM) exits feed mode exactly like the fixed shell 9-dot button.
    document
      .getElementById('latestHeadingBtn')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushReaderUi(1);
    expect(document.getElementById('rightPanel')?.classList.contains('feed-mode')).toBe(true);
    const moduleLinksBtn = document.createElement('button');
    moduleLinksBtn.className = 'pb-links-grid-btn';
    document.body.appendChild(moduleLinksBtn);
    moduleLinksBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('rightPanel')?.classList.contains('feed-mode')).toBe(false);
  });

  it('renders latest previews with truncation, fallback images, and optional media links', () => {
    const latestBody = document.createElement('div');
    latestBody.id = 'latestBody';
    document.body.appendChild(latestBody);

    const preview = latestPreviewHtml(
      '<p>Hello <strong>world</strong> from <custom-embed>bad</custom-embed> the feed.</p>',
      12
    );
    expect(preview).toContain('Hello');
    expect(preview).not.toContain('<script');

    renderLatestUpdate(getContractFixture('latestPost'), {
      container: latestBody,
      showMedia: false,
      feedHref: 'feed.html#latest',
      feedStyle: {
        buttonBgColor: '#00d9ff',
        buttonTextColor: '#101010',
      },
    });

    const thumb = latestBody.querySelector('img');
    expect(latestBody.querySelector('.latest-link--left')?.getAttribute('href')).toBe(
      'feed.html#latest'
    );
    expect(latestBody.querySelector('.latest-link--right')).toBeNull();
    thumb?.onerror?.(new Event('error'));
    expect(thumb?.src).toContain('/assets/image-missing.png');
  });
});

function parseFeedModule(mod) {
  return `
    <div class="side-panel">
      <div class="panel-builder">
        ${renderModule(mod)}
      </div>
    </div>
  `;
}

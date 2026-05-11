import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flushReaderUi, mountReaderDom, stubReaderGlobals } from './helpers/reader-fixture.js';

const fitOnPageFrame = vi.fn();

async function bootCommentsModule({ previewMode = false } = {}) {
  vi.resetModules();
  fitOnPageFrame.mockReset();
  document.body.innerHTML = '';
  mountReaderDom();
  stubReaderGlobals(vi);
  window.happyDOM.setURL(
    previewMode
      ? 'http://localhost:3000/index.html?series=battle-bros&page=reader&pageId=page-1&builderPreview=1&previewSession=session-1'
      : 'http://localhost:3000/index.html'
  );

  const fetchMock = vi.fn(async (url, options = {}) => {
    if (url === '/api/session') {
      return {
        ok: true,
        json: async () => ({ user: null }),
      };
    }
    if (url === '/api/login') {
      return {
        ok: true,
        json: async () => ({
          user: {
            email: 'reader@example.com',
            displayName: 'Reader',
            role: 'reader',
          },
        }),
      };
    }
    if (url === '/api/logout') {
      return {
        ok: true,
        json: async () => ({}),
      };
    }
    if (typeof url === 'string' && url.startsWith('/api/comments?targetId=')) {
      return {
        ok: true,
        json: async () => ({ comments: [] }),
      };
    }
    throw new Error(`Unexpected fetch: ${url} ${options.method || 'GET'}`);
  });

  vi.doMock('../reader/transform.js', () => ({
    fitOnPageFrame,
  }));
  vi.stubGlobal('fetch', fetchMock);

  await import('../reader/comic-comments.js');
  await flushReaderUi(4);

  return { fetchMock };
}

describe('reader comments layout fitting', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.happyDOM.setURL('http://localhost:3000/index.html');
    document.body.innerHTML = '';
  });

  it('re-fits the reader after comment auth changes and when collapsing the panel', async () => {
    await bootCommentsModule();

    const panel = document.getElementById('comicCommentsSection');
    const authForm = panel.querySelector('.auth-form');
    const emailInput = panel.querySelector('input[type="email"]');
    const passwordInput = panel.querySelector('input[type="password"]');
    const signoutBtn = panel.querySelector('.signout-btn');

    fitOnPageFrame.mockClear();

    window.toggleReaderComments();
    await flushReaderUi(3);
    const afterOpen = fitOnPageFrame.mock.calls.length;

    expect(panel.classList.contains('collapsed')).toBe(false);
    expect(afterOpen).toBeGreaterThan(0);

    emailInput.value = 'reader@example.com';
    passwordInput.value = 'password123';
    authForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushReaderUi(5);
    const afterLogin = fitOnPageFrame.mock.calls.length;

    expect(signoutBtn.style.display).toBe('inline-flex');
    expect(afterLogin).toBeGreaterThan(afterOpen);

    signoutBtn.click();
    await flushReaderUi(5);
    const afterLogout = fitOnPageFrame.mock.calls.length;

    expect(signoutBtn.style.display).toBe('none');
    expect(afterLogout).toBeGreaterThan(afterLogin);

    window.toggleReaderComments();
    await flushReaderUi(3);

    expect(panel.classList.contains('collapsed')).toBe(true);
    expect(fitOnPageFrame.mock.calls.length).toBeGreaterThan(afterLogout);
  });

  it('does not run auth or comment POST actions in preview mode', async () => {
    const { fetchMock } = await bootCommentsModule({ previewMode: true });
    const panel = document.getElementById('comicCommentsSection');
    const authForm = panel.querySelector('.auth-form');
    const emailInput = panel.querySelector('input[type="email"]');
    const passwordInput = panel.querySelector('input[type="password"]');
    const textarea = panel.querySelector('.comment-textarea');
    const commentForm = panel.querySelector('.comment-form');

    emailInput.value = 'reader@example.com';
    passwordInput.value = 'password123';
    authForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    textarea.value = 'Preview comment';
    commentForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushReaderUi(4);

    expect(fetchMock).not.toHaveBeenCalledWith('/api/login', expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith('/api/comments', expect.anything());
    expect(panel.textContent).toContain('read-only in preview mode');
  });
});

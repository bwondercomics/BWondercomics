import { afterEach, describe, expect, it, vi } from 'vitest';

import { flushReaderUi, mountReaderDom, stubReaderGlobals } from './helpers/reader-fixture.js';

function setPreviewUrl() {
  window.happyDOM.setURL(
    'http://localhost:3000/index.html?series=battle-bros&page=reader&pageId=page-1&builderPreview=1&previewSession=session-1'
  );
}

describe('reader builder preview side-effect guards', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.happyDOM.setURL('http://localhost:3000/index.html');
    document.body.innerHTML = '';
  });

  it('does not start live tracking in builder preview mode', async () => {
    setPreviewUrl();
    const fetchMock = vi.fn();
    const sendBeacon = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });

    await import('../reader/live-tracking.js');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('does not inject chat SSO links or fetch session in builder preview mode', async () => {
    setPreviewUrl();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    document.body.innerHTML = '<nav class="nav-links"><a id="adminNavLink"></a></nav>';

    await import('../reader/chat-sso.js');
    await flushReaderUi(2);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.getElementById('chatSsoLink')).toBeNull();
  });

  it('does not fetch safe-mode config in builder preview mode', async () => {
    window.happyDOM.setURL(
      'https://bwondercomics.com/index.html?series=battle-bros&page=reader&builderPreview=1'
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await import('../reader/safe-mode.js');
    await flushReaderUi(2);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stubs builder email module submissions in preview mode', async () => {
    setPreviewUrl();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { initEmailForms } = await import('../reader/page-renderer.js');
    document.body.innerHTML = `
      <div>
        <form data-email-signup>
          <input type="email" value="reader@example.com" />
        </form>
        <div class="pb-email-status"></div>
      </div>
    `;

    initEmailForms(document.body, { previewMode: true });
    document
      .querySelector('[data-email-signup]')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelector('.pb-email-status')?.textContent).toContain('Preview mode');
  });

  it('keeps user settings inert in preview mode', async () => {
    setPreviewUrl();
    mountReaderDom();
    stubReaderGlobals(vi);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await import('../reader/user-settings.js');
    document
      .getElementById('userSettingsBtn')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushReaderUi(2);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not request fullscreen in preview mode', async () => {
    setPreviewUrl();
    const requestFullscreen = vi.fn();
    document.documentElement.requestFullscreen = requestFullscreen;
    const { toggleFullscreen } = await import('../reader/fullscreen.js');

    toggleFullscreen();

    expect(requestFullscreen).not.toHaveBeenCalled();
  });

  it('keeps comment write operations read-only in builder preview mode', async () => {
    setPreviewUrl();
    mountReaderDom();
    stubReaderGlobals(vi);
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/session') {
        return {
          ok: true,
          json: async () => ({
            user: { id: 'preview-user', email: 'reader@example.com', role: 'reader' },
          }),
        };
      }
      if (String(url).startsWith('/api/comments') && !options.method) {
        return {
          ok: true,
          json: async () => ({ comments: [] }),
        };
      }
      return {
        ok: true,
        json: async () => ({}),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await import('../reader/comic-comments.js');
    await flushReaderUi(4);

    const authForm = document.querySelector('.auth-form');
    authForm.querySelector('input[name="email"]').value = 'reader@example.com';
    authForm.querySelector('input[name="password"]').value = 'password123';
    authForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushReaderUi(2);

    const commentForm = document.querySelector('.comment-form');
    const textarea = commentForm.querySelector('textarea[name="comment"]');
    textarea.disabled = false;
    textarea.value = 'Preview comment';
    commentForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushReaderUi(2);

    const calls = fetchMock.mock.calls.map(([url, options = {}]) => ({
      url: String(url),
      method: options.method || 'GET',
    }));
    expect(calls).toEqual([
      { url: '/api/session', method: 'GET' },
      { url: '/api/comments?targetId=battle-bros%3Aentry-1', method: 'GET' },
    ]);
    expect(document.querySelector('.auth-error')?.textContent).toContain('read-only');
    expect(document.querySelector('.comment-error')?.textContent).toContain('read-only');
  });
});

(() => {
  'use strict';

  const CHAT_LINK_ID = 'chatSsoLink';
  // Enter through chat root so we don't re-bootstrap auth state on every click.
  // Caddy still redirects to /api/chat/sso/start automatically when needed.
  const CHAT_ENTRY_URL = 'https://chat.bwondercomics.com/';

  function isBuilderPreview() {
    const raw = new URLSearchParams(window.location.search || '').get('builderPreview');
    return ['1', 'true', 'yes'].includes(
      String(raw || '')
        .trim()
        .toLowerCase()
    );
  }

  if (isBuilderPreview()) return;

  function readSafeNextPath() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('next');
    if (!raw) return '';
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      decoded = raw;
    }
    try {
      const target = new URL(decoded, window.location.origin);
      if (target.origin !== window.location.origin) return '';
      if (!target.pathname.startsWith('/')) return '';
      const resolved = `${target.pathname}${target.search}${target.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (resolved === current) return '';
      return resolved;
    } catch {
      return '';
    }
  }

  function pickContainer() {
    return (
      document.querySelector('.nav-links') ||
      document.querySelector('.header-nav') ||
      document.querySelector('header .nav')
    );
  }

  function inferLinkClass(container) {
    if (!container) return '';
    if (container.classList.contains('nav-links')) return 'nav-link';
    if (container.classList.contains('header-nav')) return 'nav-btn';
    const sample = container.querySelector('a');
    return sample?.className || '';
  }

  async function loadSessionUser() {
    try {
      const res = await fetch('/api/session', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!res.ok) return null;
      const payload = await res.json();
      return payload?.user || null;
    } catch {
      return null;
    }
  }

  function injectChatLink(container) {
    if (!container || document.getElementById(CHAT_LINK_ID)) return;

    const link = document.createElement('a');
    link.id = CHAT_LINK_ID;
    link.href = CHAT_ENTRY_URL;
    link.textContent = 'Go to Chat';

    const className = inferLinkClass(container);
    if (className) {
      link.className = className;
    }

    const adminLink = container.querySelector('#adminNavLink');
    if (adminLink) {
      container.insertBefore(link, adminLink);
      return;
    }
    container.appendChild(link);
  }

  async function initChatLink() {
    const container = pickContainer();
    const safeNextPath = readSafeNextPath();
    const user = await loadSessionUser();
    if (user && safeNextPath) {
      window.location.assign(safeNextPath);
      return;
    }
    if (!container || !user) return;
    injectChatLink(container);
  }

  window.addEventListener('bbSessionChanged', (event) => {
    const user = event?.detail?.user || null;
    if (!user) return;
    const safeNextPath = readSafeNextPath();
    if (safeNextPath) {
      window.location.assign(safeNextPath);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatLink);
  } else {
    initChatLink();
  }
})();

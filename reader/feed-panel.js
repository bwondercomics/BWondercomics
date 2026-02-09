import { latestPreviewHtml, renderLatestUpdate } from './latest.js';

const FALLBACK_IMAGE = '/assets/image-missing.png';

async function fetchFeedPosts() {
  const response = await fetch('/api/posts', { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to load posts');
  const data = await response.json().catch(() => ({}));
  const posts = Array.isArray(data.posts) ? data.posts : [];
  return posts.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function sanitizeContent(html = '') {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const allowed = new Set([
    'b',
    'strong',
    'i',
    'em',
    'u',
    'a',
    'p',
    'br',
    'ul',
    'ol',
    'li',
    'span',
    'img',
    'h1',
    'h2',
    'h3',
    'blockquote',
  ]);
  const cleanUrl = (url = '') => {
    const trimmed = url.trim();
    if (!trimmed) return '';
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('javascript:')) return '';
    return trimmed;
  };
  const walk = (node) => {
    [...node.children].forEach((child) => {
      const tag = child.tagName.toLowerCase();
      if (!allowed.has(tag)) {
        child.replaceWith(...child.childNodes);
      } else {
        [...child.attributes].forEach((attr) => {
          const name = attr.name.toLowerCase();
          const allowedAttrs = tag === 'a'
            ? ['href', 'title', 'target', 'rel']
            : tag === 'img'
              ? ['src', 'alt', 'title']
              : [];
          if (!allowedAttrs.includes(name)) child.removeAttribute(attr.name);
        });
        if (tag === 'a') {
          const href = cleanUrl(child.getAttribute('href') || '');
          if (!href) child.removeAttribute('href');
          else {
            child.setAttribute('href', href);
            child.setAttribute('target', '_blank');
            child.setAttribute('rel', 'noopener noreferrer');
          }
        }
        if (tag === 'img') {
          const src = cleanUrl(child.getAttribute('src') || '');
          if (!src) {
            child.remove();
            return;
          }
          child.setAttribute('src', src);
          child.setAttribute('alt', child.getAttribute('alt') || '');
        }
        walk(child);
      }
    });
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

function safeId(value, fallback) {
  const raw = String(value || '').toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function renderFeedItem(post, index, feedStyle = {}) {
  const item = document.createElement('div');
  item.className = 'feed-item';
  if (feedStyle.itemBorderColor) item.style.borderColor = feedStyle.itemBorderColor;
  const titleText = String(post.title || '').trim();
  const previewHtml = latestPreviewHtml(post.content || '');

  const media = document.createElement('div');
  media.className = 'feed-item-media';

  const imageSrc = (post.thumbPath || post.image || '').trim();
  const thumb = document.createElement(imageSrc ? 'img' : 'div');
  thumb.className = imageSrc ? 'feed-item-thumb' : 'feed-item-thumb placeholder';
  if (imageSrc) {
    thumb.src = imageSrc;
    thumb.alt = titleText || 'Feed update image';
    thumb.loading = 'lazy';
    const focus = post.imageFocus || 'center';
    const fit = post.imageFit || 'cover';
    thumb.style.objectPosition = focus;
    thumb.style.objectFit = fit;
    thumb.onerror = () => {
      if (thumb.src.endsWith(FALLBACK_IMAGE)) return;
      thumb.src = FALLBACK_IMAGE;
      thumb.classList.add('is-missing');
    };
  } else {
    thumb.textContent = titleText || 'Update';
  }

  const bodyId = `feedItemBody-${safeId(post.id || post.title, String(index))}`;
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'feed-item-toggle';
  toggleBtn.type = 'button';
  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.setAttribute('aria-controls', bodyId);
  toggleBtn.setAttribute('aria-label', 'Toggle full post text');
  toggleBtn.innerHTML = `
    <svg class="feed-item-toggle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <polyline points="7 5 17 12 7 19" fill="none" stroke="currentColor" stroke-width="2.8"
        stroke-linecap="round" stroke-linejoin="round"></polyline>
    </svg>
  `;

  const meta = document.createElement('div');
  meta.className = 'feed-item-meta';

  const feedHref = post.id ? `feed.html#${post.id}` : 'feed.html';
  const title = document.createElement('a');
  title.className = 'feed-item-title';
  title.href = feedHref;
  title.textContent = titleText || 'Update';
  if (!titleText) title.classList.add('is-placeholder');
  if (feedStyle.itemTitleColor) title.style.color = feedStyle.itemTitleColor;

  const date = document.createElement('div');
  date.className = 'feed-item-date';
  if (feedStyle.itemDateColor) date.style.color = feedStyle.itemDateColor;
  const parsedDate = post.date ? new Date(post.date) : null;
  date.textContent = parsedDate && !Number.isNaN(parsedDate)
    ? parsedDate.toLocaleDateString(undefined, { dateStyle: 'medium' })
    : 'Date not set';

  const preview = document.createElement('div');
  preview.className = 'feed-item-preview';
  preview.innerHTML = previewHtml;

  const body = document.createElement('div');
  body.className = 'feed-item-body';
  body.id = bodyId;
  const cleaned = sanitizeContent(post.content || '');
  body.innerHTML = cleaned || '<p>No additional text.</p>';

  meta.appendChild(title);
  meta.appendChild(date);
  meta.appendChild(preview);

  media.appendChild(thumb);
  media.appendChild(toggleBtn);

  item.appendChild(media);
  item.appendChild(meta);
  item.appendChild(body);

  toggleBtn.addEventListener('click', () => {
    const isOpen = item.classList.toggle('is-open');
    toggleBtn.setAttribute('aria-expanded', String(isOpen));
  });

  return item;
}

export async function loadFeedInto(body, limit = null, feedStyle = {}) {
  body.innerHTML = '<div class="latest-loading">Loading...</div>';
  try {
    const posts = await fetchFeedPosts();
    const limitedPosts = Number.isFinite(limit) && limit > 0 ? posts.slice(0, limit) : posts;
    body.innerHTML = '';
    if (!limitedPosts.length) {
      body.innerHTML = '<div class="latest-empty">No updates yet. Check back soon!</div>';
      return true;
    }

    const fragment = document.createDocumentFragment();
    limitedPosts.forEach((post, index) => fragment.appendChild(renderFeedItem(post, index, feedStyle)));
    body.appendChild(fragment);
    return true;
  } catch (err) {
    console.error('Feed panel error:', err);
    body.innerHTML = '<div class="latest-empty" style="color: var(--danger);">Could not load updates.</div>';
    return false;
  }
}

async function loadLatestInto(body, options = {}) {
  if (!body) return false;
  body.innerHTML = '<div class="latest-loading">Loading...</div>';
  try {
    const response = await fetch('/api/posts/latest', { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to load latest post');
    const data = await response.json().catch(() => ({}));
    const post = data && typeof data === 'object' ? data.post : null;
    if (!post) {
      body.innerHTML = '<div class="latest-empty">No updates yet.</div>';
      return true;
    }
    renderLatestUpdate(post, { container: body, ...options });
    return true;
  } catch (err) {
    console.error('Latest update widget error:', err);
    body.innerHTML = '<div class="latest-empty" style="color: var(--danger);">Could not load updates.</div>';
    return false;
  }
}

export function initRightPanelFeed() {
  const rightPanel = document.getElementById('rightPanel');
  const headingBtn = document.getElementById('latestHeadingBtn');
  const feedPanel = document.getElementById('rightPanelFeed');
  const feedBody = document.getElementById('rightPanelFeedBody');
  const exitBtn = document.getElementById('feedExitBtn');
  const linksBtn = document.getElementById('linksGridBtn');

  if (!rightPanel || !headingBtn || !feedPanel || !feedBody) return;

  let loadedOnce = false;

  const setMode = async (active) => {
    rightPanel.classList.toggle('feed-mode', active);
    feedPanel.setAttribute('aria-hidden', String(!active));
    headingBtn.setAttribute('aria-expanded', String(active));
    if (active && !loadedOnce) {
      const ok = await loadFeedInto(feedBody);
      loadedOnce = ok;
    }
  };

  const toggle = () => {
    const active = rightPanel.classList.contains('feed-mode');
    setMode(!active);
  };

  headingBtn.addEventListener('click', toggle);
  headingBtn.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  });

  if (exitBtn) exitBtn.addEventListener('click', () => setMode(false));
  if (linksBtn) linksBtn.addEventListener('click', () => setMode(false));
}

export function initFeedModules(container) {
  if (!container) return;
  container.querySelectorAll('.pb-feed-module').forEach((moduleEl) => {
    const feedPanel = moduleEl.querySelector('.pb-feed-panel');
    const feedBody = moduleEl.querySelector('.pb-feed-body');
    const latestBody = moduleEl.querySelector('.pb-feed-latest-body');
    const toggleBtn = moduleEl.querySelector('.pb-feed-toggle');
    const exitBtn = moduleEl.querySelector('.pb-feed-exit');
    const bar = moduleEl.querySelector('.pb-feed-bar');
    const feedLink = moduleEl.querySelector('.pb-feed-link');
    const mediaLink = moduleEl.querySelector('.pb-feed-media');

    const limitRaw = moduleEl.dataset.feedLimit;
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : null;
    const showDropdown = moduleEl.dataset.showDropdown !== 'false';
    const showMedia = moduleEl.dataset.showMedia !== 'false';
    const feedHref = moduleEl.dataset.feedHref || 'feed.html';
    const feedLabel = moduleEl.dataset.feedLabel || 'Open feed';
    const mediaHref = moduleEl.dataset.mediaHref || 'media.html';
    const mediaLabel = moduleEl.dataset.mediaLabel || 'Media';

    let feedStyle = {};
    try { feedStyle = JSON.parse(moduleEl.dataset.feedStyle || '{}'); } catch { /* ignore */ }

    if (feedLink) {
      feedLink.href = feedHref;
      feedLink.textContent = feedLabel;
      if (feedStyle.buttonBgColor) {
        feedLink.style.background = feedStyle.buttonBgColor;
        feedLink.style.borderColor = feedStyle.buttonBgColor;
      }
      if (feedStyle.buttonTextColor) feedLink.style.color = feedStyle.buttonTextColor;
    }
    if (mediaLink) {
      if (!showMedia || !mediaHref) {
        mediaLink.remove();
      } else {
        mediaLink.href = mediaHref;
        mediaLink.textContent = mediaLabel;
        if (feedStyle.buttonBgColor) {
          mediaLink.style.background = feedStyle.buttonBgColor;
          mediaLink.style.borderColor = feedStyle.buttonBgColor;
        }
        if (feedStyle.buttonTextColor) mediaLink.style.color = feedStyle.buttonTextColor;
      }
    }

    loadLatestInto(latestBody, {
      feedHref,
      feedLabel,
      mediaHref,
      mediaLabel,
      showMedia,
      feedStyle,
    });

    if (!showDropdown) {
      if (toggleBtn) toggleBtn.disabled = true;
      if (bar) bar.remove();
      if (feedPanel) feedPanel.remove();
      return;
    }

    let loadedOnce = false;
    const setMode = async (active) => {
      moduleEl.classList.toggle('feed-mode', active);
      const panel = moduleEl.closest('.side-panel');
      if (panel) panel.classList.toggle('feed-mode', active);
      const panelBuilder = moduleEl.closest('.panel-builder');
      if (panelBuilder) panelBuilder.classList.toggle('feed-mode', active);
      if (feedPanel) feedPanel.setAttribute('aria-hidden', String(!active));
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', String(active));
      if (active && feedBody && !loadedOnce) {
        const ok = await loadFeedInto(feedBody, Number.isFinite(limit) ? limit : null, feedStyle);
        loadedOnce = ok;
      }
    };

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const active = moduleEl.classList.contains('feed-mode');
        setMode(!active);
      });
    }
    if (exitBtn) exitBtn.addEventListener('click', () => setMode(false));
  });
}

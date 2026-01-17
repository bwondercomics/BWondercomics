import { latestPreviewText } from './latest.js';

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

function renderFeedItem(post, index) {
  const item = document.createElement('div');
  item.className = 'feed-item';
  const titleText = String(post.title || '').trim();
  const previewText = latestPreviewText(post.content || '');

  const media = document.createElement('div');
  media.className = 'feed-item-media';

  const imageSrc = (post.thumbPath || post.image || '').trim();
  const thumb = document.createElement(imageSrc ? 'img' : 'div');
  thumb.className = imageSrc ? 'feed-item-thumb' : 'feed-item-thumb placeholder';
  if (imageSrc) {
    thumb.src = imageSrc;
    thumb.alt = titleText || 'Feed update image';
    thumb.loading = 'lazy';
    if (post.imageFocus) {
      thumb.style.objectPosition = post.imageFocus;
      thumb.style.objectFit = 'cover';
    }
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

  const date = document.createElement('div');
  date.className = 'feed-item-date';
  const parsedDate = post.date ? new Date(post.date) : null;
  date.textContent = parsedDate && !Number.isNaN(parsedDate)
    ? parsedDate.toLocaleDateString(undefined, { dateStyle: 'medium' })
    : 'Date not set';

  const preview = document.createElement('div');
  preview.className = 'feed-item-preview';
  preview.textContent = previewText;

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

async function loadFeed(body) {
  body.innerHTML = '<div class="latest-loading">Loading...</div>';
  try {
    const posts = await fetchFeedPosts();
    body.innerHTML = '';
    if (!posts.length) {
      body.innerHTML = '<div class="latest-empty">No updates yet. Check back soon!</div>';
      return true;
    }

    const fragment = document.createDocumentFragment();
    posts.forEach((post, index) => fragment.appendChild(renderFeedItem(post, index)));
    body.appendChild(fragment);
    return true;
  } catch (err) {
    console.error('Feed panel error:', err);
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
      const ok = await loadFeed(feedBody);
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

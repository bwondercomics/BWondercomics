// Latest update widget helpers for the reader sidebar.
export function latestPreviewHtml(html = '', maxLen = 120) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const allowed = new Set(['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'span']);

  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const tag = child.tagName.toLowerCase();
      if (!allowed.has(tag)) {
        const fragment = document.createDocumentFragment();
        while (child.firstChild) fragment.appendChild(child.firstChild);
        child.replaceWith(fragment);
        return;
      }
      [...child.attributes].forEach((attr) => child.removeAttribute(attr.name));
      walk(child);
    });
  };

  walk(doc.body);

  const text = doc.body.textContent.replace(/\s+/g, ' ').trim();
  if (!text) return 'No summary yet.';
  if (!Number.isFinite(maxLen) || maxLen <= 0) {
    return doc.body.innerHTML.trim() || text;
  }

  let remaining = maxLen;
  const truncatedRoot = document.createElement('div');

  const appendNode = (node, parent) => {
    if (remaining <= 0) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const raw = node.textContent || '';
      if (!raw.trim()) {
        parent.appendChild(document.createTextNode(raw));
        return;
      }
      const normalized = raw.replace(/\s+/g, ' ');
      if (normalized.length <= remaining) {
        parent.appendChild(document.createTextNode(normalized));
        remaining -= normalized.length;
      } else {
        parent.appendChild(document.createTextNode(normalized.slice(0, remaining)));
        remaining = 0;
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toLowerCase();
    if (!allowed.has(tag)) {
      [...node.childNodes].forEach((child) => appendNode(child, parent));
      return;
    }

    const clone = document.createElement(tag);
    parent.appendChild(clone);
    [...node.childNodes].forEach((child) => appendNode(child, clone));
  };

  [...doc.body.childNodes].forEach((child) => appendNode(child, truncatedRoot));

  const truncatedText = truncatedRoot.textContent.replace(/\s+/g, ' ').trim();
  if (!truncatedText) return 'No summary yet.';

  if (text.length > maxLen) {
    truncatedRoot.appendChild(document.createTextNode('...'));
  }

  return truncatedRoot.innerHTML.trim() || truncatedText;
}

const FALLBACK_IMAGE = '/assets/image-missing.png';

export function renderLatestUpdate(post, options = {}) {
  const body = options.container || document.getElementById('latestBody');
  if (!body) return;

  body.innerHTML = '';

  const titleText = (post.title || '').trim();
  const imageSrc = (post.thumbPath || post.image || '').trim();
  const thumb = document.createElement(imageSrc ? 'img' : 'div');
  thumb.className = imageSrc ? 'latest-thumb' : 'latest-thumb placeholder';
  if (imageSrc) {
    thumb.src = imageSrc;
    thumb.alt = titleText || 'Latest update image';
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

  const meta = document.createElement('div');
  meta.className = 'latest-meta';

  const label = document.createElement('div');
  label.className = 'latest-label';
  label.textContent = 'Newest drop';

  const feedStyle = options.feedStyle || {};

  const name = document.createElement('div');
  name.className = 'latest-name';
  name.textContent = titleText || 'Update';
  if (!titleText) name.classList.add('is-placeholder');
  if (feedStyle.itemTitleColor) name.style.color = feedStyle.itemTitleColor;

  const date = document.createElement('div');
  date.className = 'latest-date';
  if (feedStyle.itemDateColor) date.style.color = feedStyle.itemDateColor;
  const parsedDate = post.date ? new Date(post.date) : null;
  date.textContent =
    parsedDate && !Number.isNaN(parsedDate)
      ? parsedDate.toLocaleDateString(undefined, { dateStyle: 'medium' })
      : 'Date not set';

  const preview = document.createElement('div');
  preview.className = 'latest-preview';
  preview.innerHTML = latestPreviewHtml(post.content || '');

  const actions = document.createElement('div');
  actions.className = 'latest-actions';

  const feedHref = options.feedHref || (post.id ? `feed.html#${post.id}` : 'feed.html');
  const feedLabel = options.feedLabel || 'Open feed';
  const feedLink = document.createElement('a');
  feedLink.className = 'latest-link latest-link--left';
  feedLink.href = feedHref;
  feedLink.textContent = feedLabel;
  feedLink.setAttribute('aria-label', 'Open feed for latest update');
  if (feedStyle.buttonBgColor) {
    feedLink.style.background = feedStyle.buttonBgColor;
    feedLink.style.borderColor = feedStyle.buttonBgColor;
  }
  if (feedStyle.buttonTextColor) feedLink.style.color = feedStyle.buttonTextColor;

  if (!options.container) {
    const topFeedLink = document.getElementById('rightPanelOpenFeed');
    if (topFeedLink) {
      topFeedLink.href = feedHref;
    }
  }

  actions.appendChild(feedLink);

  const showMedia = options.showMedia !== false;
  if (showMedia) {
    const mediaLink = document.createElement('a');
    mediaLink.className = 'latest-link latest-link--right';
    mediaLink.href = options.mediaHref || 'media.html';
    mediaLink.textContent = options.mediaLabel || 'Media';
    mediaLink.setAttribute('aria-label', 'Open media library');
    if (feedStyle.buttonBgColor) {
      mediaLink.style.background = feedStyle.buttonBgColor;
      mediaLink.style.borderColor = feedStyle.buttonBgColor;
    }
    if (feedStyle.buttonTextColor) mediaLink.style.color = feedStyle.buttonTextColor;
    actions.appendChild(mediaLink);
  }

  meta.appendChild(label);
  meta.appendChild(name);
  meta.appendChild(date);
  meta.appendChild(preview);
  meta.appendChild(actions);

  body.appendChild(thumb);
  body.appendChild(meta);
}

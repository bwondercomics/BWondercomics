// Latest update widget helpers for the reader sidebar.
export function latestPreviewText(text = '') {
  // Strip HTML and truncate to a short summary.
  const condensed = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (!condensed) return 'No summary yet.';
  return condensed.length > 120 ? `${condensed.slice(0, 120)}...` : condensed;
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

  const name = document.createElement('div');
  name.className = 'latest-name';
  name.textContent = titleText || 'Update';
  if (!titleText) name.classList.add('is-placeholder');

  const date = document.createElement('div');
  date.className = 'latest-date';
  const parsedDate = post.date ? new Date(post.date) : null;
  date.textContent = parsedDate && !Number.isNaN(parsedDate) ?
    parsedDate.toLocaleDateString(undefined, { dateStyle: 'medium' }) :
    'Date not set';

  const preview = document.createElement('div');
  preview.className = 'latest-preview';
  preview.textContent = latestPreviewText(post.content || '');

  const actions = document.createElement('div');
  actions.className = 'latest-actions';

  const feedHref = options.feedHref || (post.id ? `feed.html#${post.id}` : 'feed.html');
  const feedLabel = options.feedLabel || 'Open feed';
  const feedLink = document.createElement('a');
  feedLink.className = 'latest-link latest-link--left';
  feedLink.href = feedHref;
  feedLink.textContent = feedLabel;
  feedLink.setAttribute('aria-label', 'Open feed for latest update');

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

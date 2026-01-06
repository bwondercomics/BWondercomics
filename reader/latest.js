// Latest update widget helpers for the reader sidebar.
export function latestPreviewText(text = '') {
  // Strip HTML and truncate to a short summary.
  const condensed = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (!condensed) return 'No summary yet.';
  return condensed.length > 120 ? `${condensed.slice(0, 120)}...` : condensed;
}

export function renderLatestUpdate(post) {
  const body = document.getElementById('latestBody');
  if (!body) return;

  body.innerHTML = '';

  const titleText = (post.title || '').trim();
  const thumb = document.createElement(post.image ? 'img' : 'div');
  thumb.className = post.image ? 'latest-thumb' : 'latest-thumb placeholder';
  if (post.image) {
    thumb.src = post.image;
    thumb.alt = titleText || 'Latest update image';
    thumb.loading = 'lazy';
    if (post.imageFocus) {
      thumb.style.objectPosition = post.imageFocus;
      thumb.style.objectFit = 'cover';
    }
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

  const feedHref = post.id ? `feed.html#${post.id}` : 'feed.html';
  const feedLink = document.createElement('a');
  feedLink.className = 'latest-link latest-link--left';
  feedLink.href = feedHref;
  feedLink.textContent = 'Open feed';
  feedLink.setAttribute('aria-label', 'Open feed for latest update');

  const topFeedLink = document.getElementById('rightPanelOpenFeed');
  if (topFeedLink) {
    topFeedLink.href = feedHref;
  }

  const mediaLink = document.createElement('a');
  mediaLink.className = 'latest-link latest-link--right';
  mediaLink.href = 'media.html';
  mediaLink.textContent = 'Media';
  mediaLink.setAttribute('aria-label', 'Open media library');

  actions.appendChild(feedLink);
  actions.appendChild(mediaLink);

  meta.appendChild(label);
  meta.appendChild(name);
  meta.appendChild(date);
  meta.appendChild(preview);
  meta.appendChild(actions);

  body.appendChild(thumb);
  body.appendChild(meta);
}

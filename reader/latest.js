export function latestPreviewText(text = '') {
  const condensed = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (!condensed) return 'No summary yet.';
  return condensed.length > 120 ? `${condensed.slice(0, 120)}...` : condensed;
}

export function renderLatestUpdate(post) {
  const body = document.getElementById('latestBody');
  if (!body) return;

  body.innerHTML = '';

  const thumb = document.createElement(post.image ? 'img' : 'div');
  thumb.className = post.image ? 'latest-thumb' : 'latest-thumb placeholder';
  if (post.image) {
    thumb.src = post.image;
    thumb.alt = post.title || 'Latest update image';
    thumb.loading = 'lazy';
    if (post.imageFocus) {
      thumb.style.objectPosition = post.imageFocus;
      thumb.style.objectFit = 'cover';
    }
  } else {
    thumb.textContent = 'No image';
  }

  const meta = document.createElement('div');
  meta.className = 'latest-meta';

  const label = document.createElement('div');
  label.className = 'latest-label';
  label.textContent = 'Newest drop';

  const name = document.createElement('div');
  name.className = 'latest-name';
  name.textContent = post.title || 'Untitled update';

  const date = document.createElement('div');
  date.className = 'latest-date';
  const parsedDate = post.date ? new Date(post.date) : null;
  date.textContent = parsedDate && !Number.isNaN(parsedDate) ?
    parsedDate.toLocaleDateString(undefined, { dateStyle: 'medium' }) :
    'Date not set';

  const preview = document.createElement('div');
  preview.className = 'latest-preview';
  preview.textContent = latestPreviewText(post.content || '');

  const link = document.createElement('a');
  link.className = 'latest-link';
  link.href = `feed.html#${post.id || ''}`;
  link.textContent = 'Open feed';
  link.setAttribute('aria-label', 'Open feed for latest update');

  meta.appendChild(label);
  meta.appendChild(name);
  meta.appendChild(date);
  meta.appendChild(preview);
  meta.appendChild(link);

  body.appendChild(thumb);
  body.appendChild(meta);
}

const FALLBACK_IMAGE = '/assets/image-missing.png';

function resolveMediaUrl(path = '') {
  const raw = String(path || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw;
  if (raw.startsWith('protected/')) {
    return `/api/protected/${raw.replace(/^protected\//, '')}`;
  }
  return raw.startsWith('assets/') || raw.startsWith('media/') ? `/${raw}` : raw;
}

function mediaLabel(item = {}) {
  const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
  if (tags.length) return tags.join(', ');
  const path = String(item.path || '').trim();
  const file = path.split('/').pop() || 'Media item';
  return file.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
}

function isVisibleMediaItem(item = {}, options = {}) {
  const access = String(
    item.access || (item.public === false ? 'private' : 'public')
  ).toLowerCase();
  if (access === 'private') return false;
  if (access === 'premium' && options.includePremium === false) return false;
  const filters = options.filters && typeof options.filters === 'object' ? options.filters : {};
  const filterAccess = String(filters.access || '').toLowerCase();
  if (filterAccess === 'public' && access !== 'public') return false;
  if (filterAccess === 'premium' && access !== 'premium') return false;
  const filterTags = Array.isArray(filters.tags) ? filters.tags.map(String).filter(Boolean) : [];
  if (filterTags.length) {
    const itemTags = new Set((Array.isArray(item.tags) ? item.tags : []).map(String));
    if (!filterTags.every((tag) => itemTags.has(tag))) return false;
  }
  return true;
}

function sortMediaItems(items, sort = 'path') {
  const sorted = items.slice();
  if (sort === 'newest') {
    sorted.reverse();
    return sorted;
  }
  sorted.sort((a, b) => String(a.path || '').localeCompare(String(b.path || '')));
  return sorted;
}

function parseSourceConfig(moduleEl) {
  try {
    const source = JSON.parse(moduleEl.dataset.sourceConfig || '{}');
    return source && typeof source === 'object' ? source : {};
  } catch {
    return {};
  }
}

function renderMediaItems(moduleEl, items) {
  const columns = Math.max(1, Math.min(6, Number.parseInt(moduleEl.dataset.columns, 10) || 3));
  const showCaptions = moduleEl.dataset.showCaptions !== 'false';
  moduleEl.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'pb-gallery pb-media-gallery-grid';
  grid.style.setProperty('--gallery-columns', String(columns));

  items.forEach((item) => {
    const src = resolveMediaUrl(item.thumbPath || item.previewPath || item.path);
    if (!src) return;
    const wrapper = document.createElement('figure');
    wrapper.className = 'pb-gallery-item pb-media-gallery-item';
    const img = document.createElement('img');
    img.src = src;
    img.alt = mediaLabel(item);
    img.loading = 'lazy';
    img.onerror = () => {
      if (img.src.endsWith(FALLBACK_IMAGE)) return;
      img.src = FALLBACK_IMAGE;
      img.classList.add('is-missing');
    };
    wrapper.appendChild(img);
    if (showCaptions) {
      const caption = document.createElement('figcaption');
      caption.textContent = mediaLabel(item);
      wrapper.appendChild(caption);
    }
    if (String(item.access || '').toLowerCase() === 'premium') {
      wrapper.dataset.access = 'premium';
    }
    grid.appendChild(wrapper);
  });

  if (!grid.children.length) {
    moduleEl.innerHTML =
      '<div class="pb-gallery pb-gallery--empty">No media items available.</div>';
    return;
  }
  moduleEl.appendChild(grid);
}

export async function initMediaGalleryModules(container) {
  if (!container) return;
  const mounts = Array.from(container.querySelectorAll('.pb-media-gallery-mount'));
  if (!mounts.length) return;

  let mediaItems = null;
  async function loadMediaItems() {
    if (mediaItems) return mediaItems;
    const response = await fetch('/media.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to load media index');
    const data = await response.json().catch(() => []);
    mediaItems = Array.isArray(data) ? data : [];
    return mediaItems;
  }

  await Promise.all(
    mounts.map(async (moduleEl) => {
      moduleEl.innerHTML = '<div class="latest-loading">Loading...</div>';
      try {
        const source = parseSourceConfig(moduleEl);
        const limit = Math.max(1, Math.min(100, Number.parseInt(moduleEl.dataset.limit, 10) || 24));
        const options = {
          filters: source.filters || {},
          includePremium: moduleEl.dataset.includePremium !== 'false',
        };
        const visible = sortMediaItems(
          (await loadMediaItems()).filter((item) => isVisibleMediaItem(item, options)),
          source.sort || 'path'
        ).slice(0, limit);
        renderMediaItems(moduleEl, visible);
      } catch (err) {
        console.error('Media gallery module error:', err);
        moduleEl.innerHTML =
          '<div class="pb-gallery pb-gallery--empty">Could not load media gallery.</div>';
      }
    })
  );
}

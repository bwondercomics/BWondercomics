import { el } from './dom.js';
import { MEDIA_FILE } from './config.js';
import { state } from './state.js';
import { saveToServer } from './core.js';
import { getPageConfigSite, loadDefaultPageConfig, saveDefaultPageConfig } from './page-config.js';
import { escapeHtml, parseTags, generateMediaId, readFileAsBase64 } from './utils.js';

function createMediaManager({ hideAllSections, setActiveNav, onUseMedia } = {}) {
  const onUse = typeof onUseMedia === 'function' ? onUseMedia : () => undefined;
  let selectedMediaId = null;
  let currentMediaOrder = [];
  let currentMediaIndex = -1;
  let previewKeyHandlerBound = false;
  let uploadStatusActive = false;
  let previewWasHidden = false;

  const ACCESS_OPTIONS = ['public', 'premium', 'private'];
  const PREMIUM_VISIBILITY_OPTIONS = ['blur', 'hidden'];
  const POST_ASSET_ROOT = 'media/post-assets';
  const DEFAULT_OG_IMAGE_PATH = 'assets/banner1.png';
  const DEFAULT_FAVICON_PATH = 'assets/boywondericon.png';

  function normalizeAccess(raw, fallbackPublic = true) {
    const value = String(raw || '')
      .trim()
      .toLowerCase();
    if (ACCESS_OPTIONS.includes(value)) return value;
    return fallbackPublic ? 'public' : 'private';
  }

  function normalizePremiumVisibility(raw) {
    const value = String(raw || '')
      .trim()
      .toLowerCase();
    return PREMIUM_VISIBILITY_OPTIONS.includes(value) ? value : 'blur';
  }

  function getAccessLabel(item) {
    if (!item) return 'Unknown';
    if (item.access === 'premium') {
      const mode = item.premiumVisibility === 'hidden' ? 'hidden' : 'blurred';
      return `Premium (${mode})`;
    }
    if (item.access === 'private') return 'Private';
    return 'Public';
  }

  function stripProtectedPrefix(path = '') {
    return String(path || '').replace(/^protected\//, '');
  }

  function ensureProtectedPath(path = '') {
    const clean = stripProtectedPrefix(path).replace(/^\/+/, '');
    return `protected/${clean}`;
  }

  function getPathExtension(path = '') {
    const match = String(path || '').match(/(\.[a-zA-Z0-9]+)$/);
    return match ? match[1].toLowerCase() : '';
  }

  function getPostAssetPath(item, sourcePath = '') {
    const ext = getPathExtension(sourcePath || item?.path);
    const suffix = ext || '.png';
    return `${POST_ASSET_ROOT}/${item.id}${suffix}`;
  }

  function getPostAssetPrefix(item) {
    return `${POST_ASSET_ROOT}/${item.id}.`;
  }

  function resolveMediaSrc(path = '') {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith('/')) return path;
    if (path.startsWith('protected/')) {
      const rel = stripProtectedPrefix(path);
      return `/api/protected/${rel}`;
    }
    return `/${path}`;
  }

  function resolvePreviewSrc(item) {
    const previewPath = String(item?.previewPath || item?.preview_path || '').trim();
    if (previewPath) return resolveMediaSrc(previewPath);
    return '';
  }

  function getBrandingSite() {
    return getPageConfigSite(state.pageConfig);
  }

  function getConfiguredBrandingPath(key) {
    const site = getBrandingSite();
    const raw = site[key];
    return typeof raw === 'string' ? raw.trim() : '';
  }

  function setBrandingStatus(message, isError = false) {
    if (!el.mediaBrandingStatus) return;
    el.mediaBrandingStatus.textContent = message || '';
    el.mediaBrandingStatus.style.display = message ? 'block' : 'none';
    el.mediaBrandingStatus.style.background = isError ? 'var(--danger)' : 'var(--success)';
    el.mediaBrandingStatus.style.color = isError ? 'var(--text)' : 'var(--bg-dark)';
  }

  async function ensurePageConfigLoaded(force = false) {
    return loadDefaultPageConfig({ force, fallback: { site: {} } });
  }

  async function persistPageConfig(nextConfig) {
    const saved = await saveDefaultPageConfig(nextConfig);
    renderBrandingPanel();
    return saved;
  }

  function renderBrandingPanel() {
    const ogPath = getConfiguredBrandingPath('ogImagePath');
    const faviconPath = getConfiguredBrandingPath('faviconPath');
    const effectiveOgPath = ogPath || DEFAULT_OG_IMAGE_PATH;
    const effectiveFaviconPath = faviconPath || DEFAULT_FAVICON_PATH;

    if (el.mediaBrandingOgPreview) {
      el.mediaBrandingOgPreview.src = resolveMediaSrc(effectiveOgPath);
    }
    if (el.mediaBrandingOgPath) {
      el.mediaBrandingOgPath.textContent = ogPath ? ogPath : `Default: ${DEFAULT_OG_IMAGE_PATH}`;
    }
    if (el.mediaBrandingFaviconPreview) {
      el.mediaBrandingFaviconPreview.src = resolveMediaSrc(effectiveFaviconPath);
    }
    if (el.mediaBrandingFaviconPath) {
      el.mediaBrandingFaviconPath.textContent = faviconPath
        ? faviconPath
        : `Default: ${DEFAULT_FAVICON_PATH}`;
    }
  }

  async function updateBrandingSelection(key, path, successMessage) {
    await ensurePageConfigLoaded();
    const nextConfig =
      state.pageConfig && typeof state.pageConfig === 'object'
        ? JSON.parse(JSON.stringify(state.pageConfig))
        : {};
    const site = {
      ...getPageConfigSite(nextConfig),
    };
    if (path) {
      site[key] = path;
    } else {
      delete site[key];
    }
    nextConfig.site = site;
    await persistPageConfig(nextConfig);
    setBrandingStatus(successMessage, false);
  }

  async function clearBrandingPaths(paths = [], options = {}) {
    const targets = paths.map((path) => String(path || '').trim()).filter(Boolean);
    if (!targets.length) return false;
    await ensurePageConfigLoaded();
    const currentOg = getConfiguredBrandingPath('ogImagePath');
    const currentFavicon = getConfiguredBrandingPath('faviconPath');
    const shouldClearOg = currentOg && targets.includes(currentOg);
    const shouldClearFavicon = currentFavicon && targets.includes(currentFavicon);
    if (!shouldClearOg && !shouldClearFavicon) return false;

    const nextConfig =
      state.pageConfig && typeof state.pageConfig === 'object'
        ? JSON.parse(JSON.stringify(state.pageConfig))
        : {};
    const site = {
      ...getPageConfigSite(nextConfig),
    };
    if (shouldClearOg) delete site.ogImagePath;
    if (shouldClearFavicon) delete site.faviconPath;
    nextConfig.site = site;
    await persistPageConfig(nextConfig);
    if (options.message) {
      setBrandingStatus(options.message, false);
    }
    return true;
  }

  async function assignPreviewBranding(key, successMessage) {
    const selectedItem = state.mediaItems.find((item) => item.id === selectedMediaId);
    if (!selectedItem) return;
    if (normalizeAccess(selectedItem.access, selectedItem.public !== false) !== 'public') {
      setBrandingStatus('Only public media can be used for site branding.', true);
      return;
    }
    try {
      await updateBrandingSelection(key, selectedItem.path, successMessage);
    } catch (error) {
      setBrandingStatus(error.message || 'Site branding update failed.', true);
    }
  }

  function getPostsUsingMedia(item) {
    const prefix = getPostAssetPrefix(item);
    return (state.posts || []).filter((post) => {
      const image = post?.image || '';
      return image === item.path || (prefix && image.startsWith(prefix));
    });
  }

  async function updatePostImage(post, imagePath) {
    if (!post || !post.id) return;
    const payload = {
      title: post.title || 'Update',
      content: post.content || '',
      image: imagePath,
      imageTags: Array.isArray(post.imageTags) ? post.imageTags : parseTags(post.imageTags || ''),
      imageFocus: post.imageFocus || 'center',
      share: post.share !== false,
      shareBluesky: post.shareBluesky === true,
      status: post.status || 'published',
      date: post.date || null,
    };
    const response = await fetch(`/api/admin/posts/${encodeURIComponent(post.id)}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || 'Failed to update post image');
    }
    const saved = result.post || null;
    if (saved) {
      const idx = state.posts.findIndex((p) => p.id === saved.id);
      if (idx !== -1) {
        state.posts[idx] = {
          ...saved,
          status: saved.status || 'published',
          imageFocus: saved.imageFocus || 'center',
          share: saved.share !== false,
          shareBluesky: saved.shareBluesky === true,
          imageTags: Array.isArray(saved.imageTags)
            ? saved.imageTags
            : parseTags(saved.imageTags || ''),
        };
      }
    }
  }

  async function ensurePostAsset(item, sourcePath, postsUsing) {
    if (!item || !sourcePath || !postsUsing?.length) return;
    const destPath = getPostAssetPath(item, sourcePath);
    const resp = await fetch('/api/copy-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: sourcePath, to: destPath }),
    });
    if (!resp.ok) {
      const result = await resp.json().catch(() => ({}));
      throw new Error(result.error || 'Unable to copy post asset');
    }
    for (const post of postsUsing) {
      if (post.image === destPath) continue;
      await updatePostImage(post, destPath);
    }
  }

  function getUsageMap() {
    const usage = new Map();
    (state.posts || []).forEach((post) => {
      if (!post?.image) return;
      usage.set(post.image, (usage.get(post.image) || 0) + 1);
      const match = post.image.match(/^media\/post-assets\/([^./]+)\./);
      if (match) {
        const item = state.mediaItems.find((m) => m.id === match[1]);
        if (item?.path) {
          usage.set(item.path, (usage.get(item.path) || 0) + 1);
        }
      }
    });
    return usage;
  }

  function getSortMode() {
    return (el.mediaSort?.value || 'library').trim();
  }

  function applySort(items, usageMap) {
    const mode = getSortMode();
    if (mode === 'library') return items;
    const sorted = [...items];
    if (mode === 'name') {
      sorted.sort((a, b) => (a.path || '').localeCompare(b.path || ''));
    } else if (mode === 'tags') {
      sorted.sort((a, b) => (b.tags?.length || 0) - (a.tags?.length || 0));
    } else if (mode === 'usage') {
      sorted.sort((a, b) => (usageMap.get(b.path) || 0) - (usageMap.get(a.path) || 0));
    }
    return sorted;
  }

  async function loadMedia(options = {}) {
    const { syncDisk = true, selectPath = null, selectId = null } = options;
    try {
      const response = await fetch('/media.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load media library');
      const data = await response.json();
      state.mediaItems = Array.isArray(data)
        ? data
            .filter((m) => m && m.path && !String(m.path).startsWith('media/previews/'))
            .map((m) => {
              const fallbackPublic = m.public !== false;
              const access = normalizeAccess(m.access ?? m.visibility, fallbackPublic);
              const premiumVisibility = normalizePremiumVisibility(
                m.premiumVisibility ?? m.premium_visibility
              );
              return {
                id: m.id || generateMediaId(m.path),
                path: m.path || '',
                tags: Array.isArray(m.tags) ? m.tags : parseTags(m.tags || ''),
                access,
                premiumVisibility,
                public: access === 'public',
                thumbPath: m.thumbPath || m.thumb_path || '',
                previewPath: m.previewPath || m.preview_path || '',
              };
            })
        : [];
    } catch (error) {
      console.warn('Error loading media library, starting empty:', error);
      state.mediaItems = [];
    }
    if (syncDisk) {
      await syncMediaFromDisk(false);
    }
    if (selectId) {
      const match = state.mediaItems.find((m) => m.id === selectId);
      if (match) selectedMediaId = match.id;
    } else if (selectPath) {
      const match = state.mediaItems.find((m) => m.path === selectPath);
      if (match) selectedMediaId = match.id;
    }
    renderMedia();
  }

  async function saveMedia(showMessage = false) {
    try {
      await saveToServer(MEDIA_FILE, state.mediaItems);
      if (showMessage) setMediaStatus('Media library saved.');
    } catch (error) {
      console.error('Failed to save media:', error);
      setMediaStatus('Failed to save media library', true);
    }
  }

  function setMediaStatus(message, isError = false) {
    if (!el.mediaStatus) return;
    el.mediaStatus.textContent = message;
    el.mediaStatus.style.display = 'block';
    el.mediaStatus.style.background = isError ? 'var(--danger)' : 'var(--success)';
    el.mediaStatus.style.color = isError ? 'var(--text)' : 'var(--bg-dark)';
    setTimeout(() => {
      el.mediaStatus.style.display = 'none';
    }, 2500);
  }

  function setUploadStatus(message, options = {}) {
    if (!el.mediaUploadStatus || !el.mediaUploadStatusText) return;
    const { progress = null, indeterminate = false, isError = false, show = true } = options;

    if (!show || !message) {
      el.mediaUploadStatus.style.display = 'none';
      el.mediaUploadStatus.classList.remove('is-error');
      if (el.mediaUploadStatusFill) {
        el.mediaUploadStatusFill.classList.remove('is-indeterminate');
        el.mediaUploadStatusFill.style.width = '0%';
      }
      uploadStatusActive = false;
      if (previewWasHidden && !selectedMediaId && el.mediaPreview) {
        el.mediaPreview.style.display = 'none';
        el.mediaPreview.setAttribute('aria-hidden', 'true');
        previewWasHidden = false;
      }
      return;
    }

    uploadStatusActive = true;
    if (el.mediaPreview && el.mediaPreview.style.display === 'none') {
      previewWasHidden = true;
      el.mediaPreview.style.display = 'grid';
      el.mediaPreview.setAttribute('aria-hidden', 'false');
    }

    el.mediaUploadStatusText.textContent = message;
    el.mediaUploadStatus.style.display = 'grid';
    el.mediaUploadStatus.classList.toggle('is-error', isError);
    if (el.mediaUploadStatusFill) {
      if (indeterminate || typeof progress !== 'number') {
        el.mediaUploadStatusFill.classList.add('is-indeterminate');
        el.mediaUploadStatusFill.style.width = '100%';
      } else {
        const pct = Math.max(0, Math.min(100, progress));
        el.mediaUploadStatusFill.classList.remove('is-indeterminate');
        el.mediaUploadStatusFill.style.width = `${pct}%`;
      }
    }
  }

  function clearUploadStatus(delayMs = 0) {
    if (delayMs) {
      setTimeout(() => setUploadStatus('', { show: false }), delayMs);
    } else {
      setUploadStatus('', { show: false });
    }
  }

  async function moveMediaPath(item, nextAccess) {
    const currentPath = item?.path || '';
    if (!currentPath) return currentPath;
    const wantsProtected = nextAccess !== 'public';
    const desiredPath = wantsProtected
      ? ensureProtectedPath(currentPath)
      : stripProtectedPrefix(currentPath);
    if (desiredPath === currentPath) return currentPath;

    const resp = await fetch('/api/rename-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: currentPath, to: desiredPath }),
    });
    if (!resp.ok) {
      const result = await resp.json().catch(() => ({}));
      throw new Error(result.error || 'Unable to move media file');
    }
    return desiredPath;
  }

  function showMediaSection() {
    if (hideAllSections) hideAllSections();
    if (el.mediaSection) {
      el.mediaSection.style.display = 'block';
      el.mediaSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (el.adminContent) {
      el.adminContent.classList.add('media-content-wide');
    }
    bindAddMediaControls();
    bindBrandingActions();
    renderBrandingPanel();
    void ensurePageConfigLoaded().then(() => {
      renderBrandingPanel();
    });
    renderMedia();
    if (setActiveNav) setActiveNav(el.btnMedia);
  }

  function renderMedia() {
    if (!el.mediaList || !el.mediaGallery) return;
    const term = (el.mediaSearch?.value || '').trim().toLowerCase();
    el.mediaList.innerHTML = '';
    el.mediaGallery.innerHTML = '';

    const usageMap = getUsageMap();
    const filtered = state.mediaItems.filter((item) => {
      if (String(item.path || '').startsWith('media/previews/')) return false;
      if (!term) return true;
      return (
        item.path.toLowerCase().includes(term) ||
        (item.tags || []).some((t) => t.toLowerCase().includes(term))
      );
    });
    const sorted = applySort(filtered, usageMap);
    currentMediaOrder = sorted.map((item) => item.id);
    currentMediaIndex = selectedMediaId ? currentMediaOrder.indexOf(selectedMediaId) : -1;

    if (el.mediaListCount || el.mediaGalleryCount) {
      const total = state.mediaItems.length;
      const countText = term ? `${sorted.length}/${total}` : String(sorted.length);
      if (el.mediaListCount) el.mediaListCount.textContent = countText;
      if (el.mediaGalleryCount) el.mediaGalleryCount.textContent = countText;
    }

    if (!sorted.length) {
      currentMediaOrder = [];
      currentMediaIndex = -1;
      const emptyList = document.createElement('div');
      emptyList.className = 'entry-item media-item';
      emptyList.textContent = 'No media found. Add an item above.';
      el.mediaList.appendChild(emptyList);

      const emptyGallery = document.createElement('div');
      emptyGallery.className = 'entry-item';
      emptyGallery.textContent = 'No media to preview.';
      el.mediaGallery.appendChild(emptyGallery);
      renderMediaPreview(null, 0);
      renderBrandingPanel();
      return;
    }

    sorted.forEach((item) => {
      item.access = normalizeAccess(item.access, item.public !== false);
      item.premiumVisibility = normalizePremiumVisibility(item.premiumVisibility);
      item.public = item.access === 'public';
      const usageCount = usageMap.get(item.path) || 0;
      const tagsText = (item.tags || []).join(', ');
      const visibilityText = getAccessLabel(item);
      const div = document.createElement('div');
      div.className = 'entry-item media-item';
      if (item.id === selectedMediaId) {
        div.classList.add('media-item--selected');
      }
      div.innerHTML = `
        <div class="entry-info">
          <div class="entry-name">${escapeHtml(item.path)}</div>
          <div class="entry-meta" style="opacity:0.8;">${escapeHtml(tagsText || 'No tags')}</div>
          <div class="entry-meta" style="opacity:0.7;">${escapeHtml(
            usageCount ? `Used in ${usageCount} post(s)` : 'Unused'
          )}</div>
          <div class="entry-meta" style="opacity:0.7;">${escapeHtml(visibilityText)}</div>
        </div>
        <div class="entry-actions">
          <button class="btn-small btn-edit" data-use="${escapeHtml(item.id)}">Use</button>
          <button class="btn-small btn-secondary" data-copy="${escapeHtml(item.id)}">Copy</button>
          <button class="btn-small btn-secondary" data-tags="${escapeHtml(
            item.id
          )}">Edit tags</button>
          <button class="btn-small btn-delete" data-remove="${escapeHtml(item.id)}">Delete</button>
        </div>
      `;
      el.mediaList.appendChild(div);

      div.addEventListener('click', (event) => {
        if (event.target.closest('button')) return;
        selectedMediaId = item.id;
        renderMedia();
      });

      const card = document.createElement('div');
      card.className = 'media-card';
      if (item.id === selectedMediaId) {
        card.classList.add('media-item--selected');
      }
      const resolvedSrc = resolveMediaSrc(item.thumbPath || item.thumb_path || item.path);
      card.innerHTML = `
        <img src="${escapeHtml(resolvedSrc)}" alt="${escapeHtml(item.path)}" loading="lazy" />
        <div class="media-card-body">
          <div class="media-card-title">${escapeHtml(item.path)}</div>
          <div class="media-card-tags">${escapeHtml(tagsText || 'No tags')}</div>
          <div class="media-card-tags">${escapeHtml(
            usageCount ? `Used in ${usageCount} post(s)` : 'Unused'
          )}</div>
          <div class="media-card-tags">${escapeHtml(visibilityText)}</div>
          <div class="media-card-actions">
            <button class="btn-small btn-edit" data-use="${escapeHtml(item.id)}">Use</button>
            <button class="btn-small btn-secondary" data-copy="${escapeHtml(item.id)}">Copy</button>
            <button class="btn-small btn-delete" data-remove="${escapeHtml(
              item.id
            )}">Delete</button>
          </div>
        </div>
      `;
      el.mediaGallery.appendChild(card);
      card.addEventListener('click', (event) => {
        if (event.target.closest('button')) return;
        selectedMediaId = item.id;
        renderMedia();
      });
    });

    const selectedItem = selectedMediaId
      ? state.mediaItems.find((item) => item.id === selectedMediaId)
      : null;
    renderMediaPreview(selectedItem, selectedItem ? usageMap.get(selectedItem.path) || 0 : 0);
    renderBrandingPanel();

    const attachActions = (container) => {
      container.querySelectorAll('[data-use]').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          const id = btn.getAttribute('data-use');
          const item = state.mediaItems.find((m) => m.id === id);
          if (item) {
            selectedMediaId = item.id;
            onUse(item);
            renderMedia();
          }
        });
      });

      container.querySelectorAll('[data-copy]').forEach((btn) => {
        btn.addEventListener('click', async (event) => {
          event.stopPropagation();
          const id = btn.getAttribute('data-copy');
          const item = state.mediaItems.find((m) => m.id === id);
          if (!item) return;
          try {
            await navigator.clipboard.writeText(item.path);
            setMediaStatus('Path copied to clipboard.');
          } catch {
            window.prompt('Copy media path:', item.path);
          }
        });
      });

      container.querySelectorAll('[data-tags]').forEach((btn) => {
        btn.addEventListener('click', async (event) => {
          event.stopPropagation();
          const id = btn.getAttribute('data-tags');
          const item = state.mediaItems.find((m) => m.id === id);
          if (!item) return;
          const current = (item.tags || []).join(', ');
          const next = window.prompt('Edit tags (comma separated):', current);
          if (next === null) return;
          item.tags = parseTags(next);
          await saveMedia(true);
          renderMedia();
        });
      });

      container.querySelectorAll('[data-remove]').forEach((btn) => {
        btn.addEventListener('click', async (event) => {
          event.stopPropagation();
          const id = btn.getAttribute('data-remove');
          await deleteMediaItem(id);
        });
      });
    };

    attachActions(el.mediaList);
    attachActions(el.mediaGallery);
  }

  function renderMediaPreview(item, usageCount) {
    if (!el.mediaPreview || !el.mediaPreviewImg || !el.mediaPreviewInfo) return;
    if (!item) {
      if (uploadStatusActive) {
        el.mediaPreview.style.display = 'grid';
        el.mediaPreview.setAttribute('aria-hidden', 'false');
        el.mediaPreviewImg.style.display = 'none';
      } else {
        el.mediaPreview.style.display = 'none';
        el.mediaPreview.setAttribute('aria-hidden', 'true');
      }
      return;
    }

    const tagsText = (item.tags || []).join(', ') || 'No tags';
    el.mediaPreview.style.display = 'grid';
    el.mediaPreview.setAttribute('aria-hidden', 'false');
    el.mediaPreviewImg.style.display = 'block';
    el.mediaPreviewImg.src = resolveMediaSrc(item.path);
    el.mediaPreviewImg.alt = item.path;
    if (el.mediaPreviewBlurImg && el.mediaPreviewBlurMissing) {
      const previewSrc = resolvePreviewSrc(item);
      el.mediaPreviewBlurMissing.style.display = 'none';
      el.mediaPreviewBlurImg.style.display = 'block';
      if (!previewSrc) {
        el.mediaPreviewBlurImg.removeAttribute('src');
        el.mediaPreviewBlurImg.style.display = 'none';
        el.mediaPreviewBlurMissing.style.display = 'flex';
        el.mediaPreviewBlurMissing.textContent = 'Preview missing';
      } else {
        el.mediaPreviewBlurImg.onerror = () => {
          el.mediaPreviewBlurImg.style.display = 'none';
          el.mediaPreviewBlurMissing.style.display = 'flex';
          el.mediaPreviewBlurMissing.textContent = 'Preview missing';
        };
        el.mediaPreviewBlurImg.onload = () => {
          el.mediaPreviewBlurMissing.style.display = 'none';
          el.mediaPreviewBlurImg.style.display = 'block';
        };
        el.mediaPreviewBlurImg.src = previewSrc;
        el.mediaPreviewBlurImg.alt = `${item.path} preview`;
      }
    }
    if (el.mediaPreviewPath) el.mediaPreviewPath.textContent = item.path;
    if (el.mediaPreviewTags) el.mediaPreviewTags.textContent = `Tags: ${tagsText}`;
    if (el.mediaPreviewUsage) {
      const usageText = usageCount ? `Used in ${usageCount} post(s)` : 'Unused in posts';
      el.mediaPreviewUsage.textContent = usageText;
    }
    if (el.mediaPreviewUse) el.mediaPreviewUse.dataset.mediaId = item.id;
    if (el.mediaPreviewSetOg) {
      el.mediaPreviewSetOg.dataset.mediaId = item.id;
    }
    if (el.mediaPreviewSetFavicon) {
      el.mediaPreviewSetFavicon.dataset.mediaId = item.id;
    }
    if (el.mediaPreviewCopy) el.mediaPreviewCopy.dataset.mediaId = item.id;
    if (el.mediaPreviewTagsBtn) el.mediaPreviewTagsBtn.dataset.mediaId = item.id;
    if (el.mediaPreviewDelete) el.mediaPreviewDelete.dataset.mediaId = item.id;
    if (el.mediaPreviewAccess) {
      el.mediaPreviewAccess.dataset.mediaId = item.id;
      el.mediaPreviewAccess.value = item.access || 'public';
    }
    if (el.mediaPreviewPremiumVisibility) {
      el.mediaPreviewPremiumVisibility.dataset.mediaId = item.id;
      el.mediaPreviewPremiumVisibility.value = item.premiumVisibility || 'blur';
    }
    if (el.mediaPreviewPremiumRow) {
      el.mediaPreviewPremiumRow.style.display = item.access === 'premium' ? 'block' : 'none';
    }
    if (el.mediaPreviewPrev) {
      el.mediaPreviewPrev.disabled = currentMediaIndex <= 0;
      el.mediaPreviewPrev.dataset.mediaId = item.id;
    }
    if (el.mediaPreviewNext) {
      el.mediaPreviewNext.disabled =
        currentMediaIndex === -1 || currentMediaIndex >= currentMediaOrder.length - 1;
      el.mediaPreviewNext.dataset.mediaId = item.id;
    }
    bindPreviewActions();
  }

  function updateAddMediaVisibilityUI() {
    if (!el.mediaAccess || !el.mediaPremiumVisibilityRow) return;
    const accessValue = normalizeAccess(el.mediaAccess.value, true);
    el.mediaAccess.value = accessValue;
    el.mediaPremiumVisibilityRow.style.display = accessValue === 'premium' ? 'block' : 'none';
  }

  function bindAddMediaControls() {
    if (el.mediaAccess && !el.mediaAccess.dataset.bound) {
      el.mediaAccess.dataset.bound = 'true';
      el.mediaAccess.addEventListener('change', () => {
        updateAddMediaVisibilityUI();
      });
    }
    updateAddMediaVisibilityUI();
  }

  function bindBrandingActions() {
    if (el.mediaBrandingOgReset && !el.mediaBrandingOgReset.dataset.bound) {
      el.mediaBrandingOgReset.dataset.bound = 'true';
      el.mediaBrandingOgReset.addEventListener('click', async () => {
        try {
          await updateBrandingSelection('ogImagePath', '', 'Open Graph image reset to default.');
        } catch (error) {
          setBrandingStatus(error.message || 'Open Graph image reset failed.', true);
        }
      });
    }

    if (el.mediaBrandingFaviconReset && !el.mediaBrandingFaviconReset.dataset.bound) {
      el.mediaBrandingFaviconReset.dataset.bound = 'true';
      el.mediaBrandingFaviconReset.addEventListener('click', async () => {
        try {
          await updateBrandingSelection('faviconPath', '', 'Favicon reset to default.');
        } catch (error) {
          setBrandingStatus(error.message || 'Favicon reset failed.', true);
        }
      });
    }
  }

  function selectMediaByIndex(nextIndex) {
    if (nextIndex < 0 || nextIndex >= currentMediaOrder.length) return;
    const nextId = currentMediaOrder[nextIndex];
    if (!nextId) return;
    selectedMediaId = nextId;
    renderMedia();
  }

  function handlePreviewKeydown(event) {
    if (!el.mediaPreview || el.mediaPreview.style.display === 'none') return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      selectMediaByIndex(currentMediaIndex - 1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      selectMediaByIndex(currentMediaIndex + 1);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      selectedMediaId = null;
      renderMedia();
    }
  }

  function bindPreviewActions() {
    if (el.mediaPreviewUse && !el.mediaPreviewUse.dataset.bound) {
      el.mediaPreviewUse.dataset.bound = 'true';
      el.mediaPreviewUse.addEventListener('click', () => {
        const id = el.mediaPreviewUse.dataset.mediaId;
        const item = state.mediaItems.find((m) => m.id === id);
        if (!item) return;
        selectedMediaId = item.id;
        onUse(item);
        renderMedia();
      });
    }

    if (el.mediaPreviewSetOg && !el.mediaPreviewSetOg.dataset.bound) {
      el.mediaPreviewSetOg.dataset.bound = 'true';
      el.mediaPreviewSetOg.addEventListener('click', async () => {
        const id = el.mediaPreviewSetOg.dataset.mediaId;
        if (id) selectedMediaId = id;
        await assignPreviewBranding('ogImagePath', 'Open Graph image updated.');
      });
    }

    if (el.mediaPreviewSetFavicon && !el.mediaPreviewSetFavicon.dataset.bound) {
      el.mediaPreviewSetFavicon.dataset.bound = 'true';
      el.mediaPreviewSetFavicon.addEventListener('click', async () => {
        const id = el.mediaPreviewSetFavicon.dataset.mediaId;
        if (id) selectedMediaId = id;
        await assignPreviewBranding('faviconPath', 'Favicon updated.');
      });
    }

    if (el.mediaPreviewCopy && !el.mediaPreviewCopy.dataset.bound) {
      el.mediaPreviewCopy.dataset.bound = 'true';
      el.mediaPreviewCopy.addEventListener('click', async () => {
        const id = el.mediaPreviewCopy.dataset.mediaId;
        const item = state.mediaItems.find((m) => m.id === id);
        if (!item) return;
        try {
          await navigator.clipboard.writeText(item.path);
          setMediaStatus('Path copied to clipboard.');
        } catch {
          window.prompt('Copy media path:', item.path);
        }
      });
    }

    if (el.mediaPreviewTagsBtn && !el.mediaPreviewTagsBtn.dataset.bound) {
      el.mediaPreviewTagsBtn.dataset.bound = 'true';
      el.mediaPreviewTagsBtn.addEventListener('click', async () => {
        const id = el.mediaPreviewTagsBtn.dataset.mediaId;
        const item = state.mediaItems.find((m) => m.id === id);
        if (!item) return;
        const current = (item.tags || []).join(', ');
        const next = window.prompt('Edit tags (comma separated):', current);
        if (next === null) return;
        item.tags = parseTags(next);
        await saveMedia(true);
        renderMedia();
      });
    }

    if (el.mediaPreviewAccess && !el.mediaPreviewAccess.dataset.bound) {
      el.mediaPreviewAccess.dataset.bound = 'true';
      el.mediaPreviewAccess.addEventListener('change', async () => {
        const id = el.mediaPreviewAccess.dataset.mediaId;
        const item = state.mediaItems.find((m) => m.id === id);
        if (!item) return;
        const previousPath = item.path;
        const nextAccess = normalizeAccess(el.mediaPreviewAccess.value, true);
        const postsUsing = getPostsUsingMedia(item);
        try {
          const nextPath = await moveMediaPath(item, nextAccess);
          item.path = nextPath;
          if (postsUsing.length) {
            await ensurePostAsset(item, nextPath, postsUsing);
          }
        } catch (error) {
          console.warn('Failed to update media access:', error);
          setMediaStatus(`Media update failed: ${error.message}`, true);
          el.mediaPreviewAccess.value = item.access || 'public';
          return;
        }
        item.access = nextAccess;
        item.public = nextAccess === 'public';
        if (nextAccess !== 'premium') {
          item.premiumVisibility = 'blur';
        }
        if (nextAccess !== 'public') {
          try {
            await clearBrandingPaths([previousPath, item.path], {
              message: 'Site branding reset to default because the media is no longer public.',
            });
          } catch (error) {
            setBrandingStatus(error.message || 'Site branding reset failed.', true);
          }
        }
        await saveMedia(true);
        renderMedia();
      });
    }

    if (el.mediaPreviewPremiumVisibility && !el.mediaPreviewPremiumVisibility.dataset.bound) {
      el.mediaPreviewPremiumVisibility.dataset.bound = 'true';
      el.mediaPreviewPremiumVisibility.addEventListener('change', async () => {
        const id = el.mediaPreviewPremiumVisibility.dataset.mediaId;
        const item = state.mediaItems.find((m) => m.id === id);
        if (!item) return;
        const nextVisibility = normalizePremiumVisibility(el.mediaPreviewPremiumVisibility.value);
        item.premiumVisibility = nextVisibility;
        await saveMedia(true);
        renderMedia();
      });
    }

    if (el.mediaPreviewDelete && !el.mediaPreviewDelete.dataset.bound) {
      el.mediaPreviewDelete.dataset.bound = 'true';
      el.mediaPreviewDelete.addEventListener('click', async () => {
        const id = el.mediaPreviewDelete.dataset.mediaId;
        if (!id) return;
        await deleteMediaItem(id);
      });
    }

    if (el.mediaPreviewClose && !el.mediaPreviewClose.dataset.bound) {
      el.mediaPreviewClose.dataset.bound = 'true';
      el.mediaPreviewClose.addEventListener('click', () => {
        selectedMediaId = null;
        renderMedia();
      });
    }

    if (el.mediaPreviewPrev && !el.mediaPreviewPrev.dataset.bound) {
      el.mediaPreviewPrev.dataset.bound = 'true';
      el.mediaPreviewPrev.addEventListener('click', () => {
        selectMediaByIndex(currentMediaIndex - 1);
      });
    }

    if (el.mediaPreviewNext && !el.mediaPreviewNext.dataset.bound) {
      el.mediaPreviewNext.dataset.bound = 'true';
      el.mediaPreviewNext.addEventListener('click', () => {
        selectMediaByIndex(currentMediaIndex + 1);
      });
    }

    if (!previewKeyHandlerBound) {
      previewKeyHandlerBound = true;
      document.addEventListener('keydown', handlePreviewKeydown);
    }
  }

  async function syncMediaFromDisk(showMessage = true) {
    try {
      const response = await fetch('/api/list-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to list media folder');
      }

      const diskPaths = result.paths || [];
      const existingMap = new Map(state.mediaItems.map((m) => [m.path, m]));
      let added = 0;
      let updated = 0;

      // Map image paths to tags from posts (if any)
      const postTagMap = new Map(
        (state.posts || [])
          .filter((p) => p.image)
          .map((p) => [
            p.image,
            Array.isArray(p.imageTags) ? p.imageTags : parseTags(p.imageTags || ''),
          ])
      );

      diskPaths.forEach((p) => {
        if (String(p).startsWith('media/previews/')) return;
        const inferredTags = inferTagsForPath(p);
        const postTags = normalizeTags(postTagMap.get(p));
        const existing = existingMap.get(p);
        if (existing) {
          const currentTags = normalizeTags(existing.tags);
          const merged = mergeTags(currentTags, inferredTags, postTags);
          if (!tagsEqual(currentTags, merged)) {
            existing.tags = merged;
            updated += 1;
          }
        } else {
          state.mediaItems.push({
            id: generateMediaId(p),
            path: p,
            tags: mergeTags([], inferredTags, postTags),
            access: 'public',
            premiumVisibility: 'blur',
            public: true,
          });
          added += 1;
        }
      });

      if (added > 0 || updated > 0) {
        await saveMedia();
        renderMedia();
      }

      if (showMessage) {
        setMediaStatus(
          added || updated
            ? `Synced ${added} new item(s)${updated ? `, updated ${updated} tag set(s)` : ''}.`
            : 'Media folder is already synced.'
        );
      }
    } catch (error) {
      console.error('Media sync failed:', error);
      if (showMessage) setMediaStatus('Failed to sync media folder.', true);
    }
  }

  async function upsertMediaEntry(path, tags = []) {
    if (!path) return;
    if (String(path).startsWith(`${POST_ASSET_ROOT}/`)) return;
    if (String(path).startsWith('media/previews/')) return;
    const normalizedTags = normalizeTags(tags);
    const existing = state.mediaItems.find((m) => m.path === path);
    if (existing) {
      const merged = mergeTags(normalizeTags(existing.tags), normalizedTags);
      existing.tags = merged;
    } else {
      const newItem = {
        id: generateMediaId(path),
        path,
        tags: normalizedTags,
        access: 'public',
        premiumVisibility: 'blur',
        public: true,
      };
      state.mediaItems.push(newItem);
      selectedMediaId = newItem.id;
    }
    renderMedia();
    await saveMedia();
  }

  async function addMediaItem() {
    const path = (el.mediaPath?.value || '').trim();
    const tags = parseTags(el.mediaTags?.value || '');
    const access = normalizeAccess(el.mediaAccess?.value, true);
    const premiumVisibility = normalizePremiumVisibility(el.mediaPremiumVisibility?.value);
    const saved = await upsertMediaItem(path, tags, access, premiumVisibility);
    if (!saved) return;
    el.mediaPath.value = '';
    if (el.mediaTags) el.mediaTags.value = '';
  }

  async function upsertMediaItem(path, tags, access, premiumVisibility, options = {}) {
    const { silent = false, onError } = options;
    if (!path) {
      if (!silent) setMediaStatus('Path is required.', true);
      if (onError) onError('Path is required.');
      return null;
    }

    const existing = state.mediaItems.find((m) => m.path === path);
    if (existing) {
      const previousPath = existing.path;
      const postsUsing = getPostsUsingMedia(existing);
      try {
        const nextPath = await moveMediaPath(existing, access);
        existing.path = nextPath;
        path = nextPath;
        if (postsUsing.length) {
          await ensurePostAsset(existing, nextPath, postsUsing);
        }
      } catch (error) {
        console.warn('Failed to move media file:', error);
        if (!silent) setMediaStatus(`Media move failed: ${error.message}`, true);
        if (onError) onError(error.message || 'Media move failed.');
        return null;
      }
      existing.tags = tags;
      existing.access = access;
      existing.premiumVisibility = premiumVisibility;
      existing.public = access === 'public';
      if (access !== 'public') {
        try {
          await clearBrandingPaths([previousPath, path], {
            message: 'Site branding reset to default because the media is no longer public.',
          });
        } catch (error) {
          console.warn('Failed to clear site branding:', error);
        }
      }
      if (!silent) setMediaStatus('Updated existing media tags.');
    } else {
      try {
        const tempItem = { path };
        const nextPath = await moveMediaPath(tempItem, access);
        path = nextPath;
      } catch (error) {
        console.warn('Failed to move media file:', error);
        if (!silent) setMediaStatus(`Media move failed: ${error.message}`, true);
        if (onError) onError(error.message || 'Media move failed.');
        return null;
      }
      const newItem = {
        id: generateMediaId(path),
        path,
        tags,
        access,
        premiumVisibility,
        public: access === 'public',
      };
      state.mediaItems.push(newItem);
      selectedMediaId = newItem.id;
      if (!silent) setMediaStatus('Added media item.');
    }

    renderMedia();
    await saveMedia();
    const updated = state.mediaItems.find((m) => m.path === path);
    return updated || { id: generateMediaId(path), path };
  }

  function uploadMediaPayload(file, base64, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new window.XMLHttpRequest();
      xhr.open('POST', '/api/upload-media');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.upload.onprogress = (event) => {
        if (typeof onProgress !== 'function') return;
        if (event.lengthComputable && event.total > 0) {
          onProgress((event.loaded / event.total) * 100);
        } else {
          onProgress(null);
        }
      };
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.onload = () => {
        let payload = {};
        try {
          payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        } catch {
          payload = {};
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload);
        } else {
          reject(new Error(payload.error || 'Upload failed'));
        }
      };
      xhr.send(JSON.stringify({ file: { name: file.name, data: base64 } }));
    });
  }

  async function uploadMediaFiles() {
    const files = Array.from(el.mediaUploadInput?.files || []);
    if (!files.length) {
      setUploadStatus('No files selected.', { isError: true });
      return;
    }

    const tags = parseTags(el.mediaTags?.value || '');
    const access = normalizeAccess(el.mediaAccess?.value, true);
    const premiumVisibility = normalizePremiumVisibility(el.mediaPremiumVisibility?.value);
    let uploaded = 0;
    let failed = 0;
    const total = files.length;
    const uploadedItems = [];
    let lastUploadedId = null;

    for (let idx = 0; idx < files.length; idx += 1) {
      const file = files[idx];
      try {
        setUploadStatus(`Preparing ${idx + 1}/${total}: ${file.name}`, { indeterminate: true });
        const base64 = await readFileAsBase64(file);
        setUploadStatus(`Uploading ${idx + 1}/${total}: ${file.name}`, { indeterminate: true });
        const result = await uploadMediaPayload(file, base64, (progress) => {
          if (typeof progress === 'number') {
            setUploadStatus(`Uploading ${idx + 1}/${total} (${Math.round(progress)}%)`, {
              progress,
              indeterminate: false,
            });
          } else {
            setUploadStatus(`Uploading ${idx + 1}/${total}`, { indeterminate: true });
          }
        });
        const path = String(result.path || '').trim();
        if (!path) throw new Error('Upload returned no path');
        setUploadStatus(`Saving to library + previews (${idx + 1}/${total})`, {
          indeterminate: true,
        });
        const saved = await upsertMediaItem(path, tags, access, premiumVisibility, {
          silent: true,
          onError: (message) => {
            setUploadStatus(`Save failed (${file.name}): ${message}`, { isError: true });
          },
        });
        if (saved) {
          uploaded += 1;
          lastUploadedId = saved.id || generateMediaId(saved.path || path);
          uploadedItems.push(saved);
          await loadMedia({ syncDisk: false, selectId: lastUploadedId });
        }
      } catch (error) {
        failed += 1;
        console.warn('Media upload failed:', error);
        setUploadStatus(`Upload failed (${file.name}): ${error.message || 'error'}`, {
          isError: true,
        });
      }
    }

    if (el.mediaUploadInput) el.mediaUploadInput.value = '';
    if (uploaded > 0) {
      const statusText =
        failed === 0
          ? `Upload complete: ${uploaded}/${total}`
          : `Upload complete: ${uploaded} ok, ${failed} failed`;
      setUploadStatus(statusText, { progress: 100, isError: failed > 0 });
      if (uploadedItems.length) {
        try {
          const finalItem = uploadedItems[uploadedItems.length - 1];
          const finalId = finalItem.id || generateMediaId(finalItem.path || '');
          await loadMedia({ syncDisk: false, selectId: finalId });
        } catch (error) {
          console.warn('Failed to refresh media after uploads:', error);
        }
      }
      if (failed === 0) clearUploadStatus(3000);
    } else {
      setUploadStatus('Upload failed.', { isError: true });
    }
  }

  function inferTagsForPath(path = '') {
    const lower = path.toLowerCase();
    const tags = [];
    if (lower.includes('patreon')) tags.push('patreon');
    if (lower.includes('volume')) tags.push('volume', 'store');
    if (lower.includes('cover')) tags.push('cover');
    return tags;
  }

  function normalizeTags(tags) {
    if (!tags) return [];
    if (!Array.isArray(tags)) return parseTags(tags || '');
    return tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  }

  function mergeTags(...tagGroups) {
    const out = [];
    tagGroups.flat().forEach((tag) => {
      const t = String(tag).trim().toLowerCase();
      if (t && !out.includes(t)) out.push(t);
    });
    return out;
  }

  function tagsEqual(a = [], b = []) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  async function deleteMediaItem(id) {
    const item = state.mediaItems.find((m) => m.id === id);
    if (!item) return;
    const confirmed = window.confirm(`Delete media item "${item.path}" from the library?`);
    if (!confirmed) return;

    // Warn about posts using this image
    const postAssetPrefix = getPostAssetPrefix(item);
    const usedBy = (state.posts || [])
      .filter((p) => {
        const image = p.image || '';
        return image === item.path || (postAssetPrefix && image.startsWith(postAssetPrefix));
      })
      .map((p) => p.title || p.id)
      .slice(0, 5);
    if (usedBy.length) {
      const proceed = window.confirm(
        `This image is used by posts: ${usedBy.join(', ')}. Continue?`
      );
      if (!proceed) return;
    }

    try {
      const response = await fetch('/api/delete-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: item.path }),
      });
      if (!response.ok && response.status !== 404) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Failed to delete image file');
      }
    } catch (error) {
      setMediaStatus(`Delete failed: ${error.message}`, true);
      return;
    }

    state.mediaItems = state.mediaItems.filter((m) => m.id !== id);
    if (selectedMediaId === id) selectedMediaId = null;
    try {
      await clearBrandingPaths([item.path], {
        message: 'Site branding reset to default because the media was deleted.',
      });
    } catch (error) {
      console.warn('Failed to clear site branding:', error);
    }
    await saveMedia(true);
    renderMedia();
  }

  return {
    addMediaItem,
    deleteMediaItem,
    loadMedia,
    renderMedia,
    saveMedia,
    setMediaStatus,
    showMediaSection,
    syncMediaFromDisk,
    upsertMediaEntry,
    uploadMediaFiles,
  };
}

export { createMediaManager };

import { sanitizeEntries, sortEntryNamesWithMeta } from './entries.js';
import { getActiveSeriesId, getSeriesDataPath, sanitizeSeriesId } from './series.js';

function resolveProtectedPath(raw = '') {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  if (value.startsWith('protected/')) {
    return `/api/protected/${value.replace(/^protected\//, '')}`;
  }
  return value;
}

function parseSourceConfig(moduleEl) {
  try {
    const source = JSON.parse(moduleEl.dataset.sourceConfig || '{}');
    return source && typeof source === 'object' ? source : {};
  } catch {
    return {};
  }
}

async function fetchSeriesIndex() {
  const response = await fetch('/series.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to load series index');
  const data = await response.json().catch(() => ({}));
  return Array.isArray(data.series) ? data.series : [];
}

async function loadEntryDataForSeries(seriesId) {
  const response = await fetch(getSeriesDataPath(seriesId), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load entries for ${seriesId}`);
  const data = await response.json();
  const rawEntries = data.entries && typeof data.entries === 'object' ? data.entries : {};
  const entryMeta = data.entryMeta && typeof data.entryMeta === 'object' ? data.entryMeta : {};
  const mappedEntries = Object.fromEntries(
    Object.entries(rawEntries).map(([name, pages]) => [
      name,
      Array.isArray(pages) ? pages.map(resolveProtectedPath) : [],
    ])
  );
  Object.values(entryMeta).forEach((meta) => {
    if (meta?.coverImage) meta.coverImage = resolveProtectedPath(meta.coverImage);
  });
  const normalized = sanitizeEntries(mappedEntries, entryMeta);
  return {
    seriesId,
    entries: normalized.chapters,
    entryMeta,
    entryOrder: sortEntryNamesWithMeta(Object.keys(normalized.chapters), entryMeta),
    unitLabelSingular: String(data.unitLabelSingular || '').trim() || 'Entry',
  };
}

async function resolveSeriesPayloads(source) {
  if (source.mode === 'all-series') {
    const series = await fetchSeriesIndex();
    const ids = series.map((item) => sanitizeSeriesId(item?.id || '')).filter(Boolean);
    return Promise.all(ids.map((id) => loadEntryDataForSeries(id)));
  }
  const seriesId =
    source.mode === 'specific-series'
      ? sanitizeSeriesId(source.seriesId || '')
      : getActiveSeriesId();
  return [await loadEntryDataForSeries(seriesId || getActiveSeriesId())];
}

function entryMatchesFilters(name, meta = {}, filters = {}) {
  if (meta.showInGallery === false) return false;
  if (filters.labelId && meta.entryLabelId !== filters.labelId) return false;
  if (filters.status && String(meta.status || 'published') !== filters.status) return false;
  if (filters.access === 'public' && meta.premium) return false;
  if (filters.access === 'premium' && !meta.premium) return false;
  if (filters.showInGallery === true && meta.showInGallery === false) return false;
  return true;
}

function formatEntryTitle(name, meta = {}, payload = {}) {
  const rawNumber = meta.displayNumber;
  const number = Number.isFinite(rawNumber) ? rawNumber : Number.parseInt(rawNumber, 10);
  if (!Number.isFinite(number)) return name;
  return `${meta.entryLabelSingular || payload.unitLabelSingular || 'Entry'} ${number} - ${name}`;
}

function collectEntryCards(payloads, source) {
  const filters = source.filters && typeof source.filters === 'object' ? source.filters : {};
  const cards = [];
  payloads.forEach((payload) => {
    payload.entryOrder.forEach((name) => {
      const meta = payload.entryMeta[name] || {};
      if (!entryMatchesFilters(name, meta, filters)) return;
      const pages = payload.entries[name] || [];
      const cover = resolveProtectedPath(meta.coverImage || pages[0] || '');
      if (!cover) return;
      cards.push({
        title: formatEntryTitle(name, meta, payload),
        cover,
        premium: !!meta.premium,
        seriesId: payload.seriesId,
      });
    });
  });
  if (source.sort === 'title') {
    cards.sort((a, b) => a.title.localeCompare(b.title));
  } else if (source.sort === 'newest') {
    cards.reverse();
  }
  const limit = Number.isFinite(Number(source.limit)) ? Math.max(1, Number(source.limit)) : 0;
  return limit ? cards.slice(0, limit) : cards;
}

function renderCards(moduleEl, cards) {
  const columns = Math.max(1, Math.min(6, Number.parseInt(moduleEl.dataset.columns, 10) || 3));
  const showLabels = moduleEl.dataset.showLabels !== 'false';
  moduleEl.innerHTML = '';
  if (!cards.length) {
    moduleEl.innerHTML = '<div class="pb-gallery pb-gallery--empty">No entries available.</div>';
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'pb-gallery pb-entry-gallery-grid';
  grid.style.setProperty('--gallery-columns', String(columns));
  cards.forEach((card) => {
    const figure = document.createElement('figure');
    figure.className = 'pb-gallery-item pb-entry-gallery-item';
    figure.dataset.seriesId = card.seriesId;
    const img = document.createElement('img');
    img.src = card.cover;
    img.alt = card.title;
    img.loading = 'lazy';
    figure.appendChild(img);
    if (card.premium) figure.dataset.access = 'premium';
    if (showLabels) {
      const caption = document.createElement('figcaption');
      caption.textContent = card.title;
      figure.appendChild(caption);
    }
    grid.appendChild(figure);
  });
  moduleEl.appendChild(grid);
}

export async function initEntryGalleryModules(container) {
  if (!container) return;
  const mounts = Array.from(container.querySelectorAll('.pb-entry-gallery-mount'));
  if (!mounts.length) return;
  await Promise.all(
    mounts.map(async (moduleEl) => {
      moduleEl.innerHTML = '<div class="latest-loading">Loading...</div>';
      try {
        const source = parseSourceConfig(moduleEl);
        const payloads = await resolveSeriesPayloads(source);
        renderCards(moduleEl, collectEntryCards(payloads, source));
      } catch (err) {
        console.error('Entry gallery module error:', err);
        moduleEl.innerHTML =
          '<div class="pb-gallery pb-gallery--empty">Could not load entries.</div>';
      }
    })
  );
}

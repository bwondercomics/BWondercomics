// Shared utilities for the admin panel

export function escapeHtml(text = '') {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function parseTags(text = '') {
  return text
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);
}

export function sortPagesByFilename(pages = []) {
  return [...pages].sort((a, b) => {
    const nameA = a.split('/').pop() || a;
    const nameB = b.split('/').pop() || b;
    const numA = parseInt(nameA.match(/\d+/)?.[0] || '0', 10);
    const numB = parseInt(nameB.match(/\d+/)?.[0] || '0', 10);
    if (numA !== numB) return numA - numB;
    return nameA.localeCompare(nameB);
  });
}

export function sanitizeFolderFromName(name = '', chaptersRoot = 'chapters') {
  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) slug = `chapter-${Date.now()}`;
  const root = String(chaptersRoot || 'chapters').replace(/\/+$/g, '');
  return `${root}/${slug}`;
}

export function inferFolderFromPages(name, chapters = {}, currentPages = [], chaptersRoot = 'chapters') {
  const pages = chapters[name] || currentPages || [];
  const prefix = `${String(chaptersRoot || 'chapters').replace(/\/+$/g, '')}/`;
  const counts = {};
  pages.forEach(p => {
    if (typeof p !== 'string') return;
    if (!p.startsWith(prefix)) return;
    const dir = p.slice(0, p.lastIndexOf('/'));
    if (!dir) return;
    counts[dir] = (counts[dir] || 0) + 1;
  });
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

export function ensureChapterFolder(name = '', chapterFolders = {}, chapters = {}, currentPages = [], chaptersRoot = 'chapters') {
  if (chapterFolders[name]) return chapterFolders[name];

  const inferred = inferFolderFromPages(name, chapters, currentPages, chaptersRoot);
  if (inferred) {
    chapterFolders[name] = inferred;
    return inferred;
  }

  const existing = new Set(Object.values(chapterFolders || {}));
  const legacyNumber = name.match(/\d+/)?.[0];
  const root = String(chaptersRoot || 'chapters').replace(/\/+$/g, '');
  let base = legacyNumber ? `${root}/${legacyNumber.padStart(2, '0')}` : sanitizeFolderFromName(name, root);
  let candidate = base;
  let counter = 1;
  while (existing.has(candidate)) {
    candidate = `${base}-${counter++}`;
  }
  chapterFolders[name] = candidate;
  return candidate;
}

export function getChapterFolder(chapterName = '', chapterFolders = {}, chapters = {}, currentPages = [], chaptersRoot = 'chapters') {
  if (chapterFolders[chapterName]) return chapterFolders[chapterName];
  return ensureChapterFolder(chapterName || 'Chapter', chapterFolders, chapters, currentPages, chaptersRoot);
}

export function normalizePages(pages = []) {
  return (Array.isArray(pages) ? pages : [])
    .filter(p => typeof p === 'string')
    .map(p => p.trim())
    .filter(Boolean);
}

export function pagesEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Generate a simple hash from a string (FNV-1a algorithm)
 */
function simpleHash(str) {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash *= 16777619; // FNV prime
  }
  return (hash >>> 0).toString(16); // Convert to unsigned 32-bit hex
}

/**
 * Generate a stable media ID based on the file path.
 * Same path always produces the same ID.
 */
export function generateMediaId(path = '') {
  if (!path) {
    // Fallback to random ID if no path provided
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `media-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  // Generate a stable hash from the path
  const hash = simpleHash(path);
  // Sanitize the filename for use in ID
  const filename = path.split('/').pop().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return `media-${filename}-${hash}`;
}


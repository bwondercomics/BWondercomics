// Shared utilities for the admin panel

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} HTML-escaped text
 */
export function escapeHtml(text = '') {
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(text).replace(/[&<>"']/g, char => escapeMap[char]);
}

/**
 * Parses a comma-separated tag string into an array of lowercase tags
 * @param {string} text - Comma-separated tag string
 * @returns {string[]} Array of trimmed, lowercase tags
 */
export function parseTags(text = '') {
  return text
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Sorts page paths by numeric filename (e.g., page1, page2, ..., page10)
 * Ensures correct numeric ordering instead of alphabetic (page1, page10, page2)
 * @param {string[]} pages - Array of page paths
 * @returns {string[]} Sorted array of page paths
 */
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

/**
 * Converts a chapter name to a sanitized folder path
 * @param {string} name - Entry name to sanitize
 * @param {string} chaptersRoot - Root directory for chapters
 * @returns {string} Sanitized folder path
 */
export function sanitizeFolderFromName(name = '', chaptersRoot = 'chapters') {
  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) slug = `chapter-${Date.now()}`;
  const root = String(chaptersRoot || 'chapters').replace(/\/+$/g, '');
  return `${root}/${slug}`;
}

/**
 * Infers the folder path from page paths by finding the most common directory
 * @param {string} name - Entry name
 * @param {Object} chapters - Entries data object
 * @param {string[]} currentPages - Current page paths
 * @param {string} chaptersRoot - Root directory for chapters
 * @returns {string|null} Inferred folder path or null if not found
 */
export function inferFolderFromPages(name, chapters = {}, currentPages = [], chaptersRoot = 'chapters') {
  const pages = chapters[name] || currentPages || [];
  const root = chaptersRoot === null ? '' : String(chaptersRoot || 'chapters').replace(/\/+$/g, '');
  const prefix = root ? `${root}/` : '';
  const counts = {};
  pages.forEach(p => {
    if (typeof p !== 'string') return;
    const normalized = p.trim().replace(/^\/+/, '');
    if (!normalized || normalized.startsWith('http')) return;
    if (prefix && !normalized.startsWith(prefix)) return;
    const dir = normalized.slice(0, normalized.lastIndexOf('/'));
    if (!dir) return;
    counts[dir] = (counts[dir] || 0) + 1;
  });
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

/**
 * Ensures a chapter has a folder path, creating one if needed
 * Uses inference, numeric naming, or generates a unique path
 * @param {string} name - Entry name
 * @param {Object} chapterFolders - Mapping of chapter names to folder paths
 * @param {Object} chapters - Entries data object
 * @param {string[]} currentPages - Current page paths
 * @param {string} chaptersRoot - Root directory for chapters
 * @returns {string} Folder path for the chapter
 */
export function ensureChapterFolder(name = '', chapterFolders = {}, chapters = {}, currentPages = [], chaptersRoot = 'chapters') {
  if (chapterFolders[name]) return chapterFolders[name];

  const inferred = inferFolderFromPages(name, chapters, currentPages, chaptersRoot);
  if (inferred) {
    chapterFolders[name] = inferred;
    return inferred;
  }

  const inferredAny = inferFolderFromPages(name, chapters, currentPages, null);
  if (inferredAny) {
    chapterFolders[name] = inferredAny;
    return inferredAny;
  }

  const existing = new Set(Object.values(chapterFolders || {}));
  const numberMatch = name.match(/\d+/)?.[0];
  const root = String(chaptersRoot || 'chapters').replace(/\/+$/g, '');
  let base = numberMatch ? `${root}/${numberMatch.padStart(2, '0')}` : sanitizeFolderFromName(name, root);
  let candidate = base;
  let counter = 1;
  while (existing.has(candidate)) {
    candidate = `${base}-${counter++}`;
  }
  chapterFolders[name] = candidate;
  return candidate;
}

/**
 * Gets the folder path for a chapter, ensuring one exists
 * @param {string} chapterName - Name of the chapter
 * @param {Object} chapterFolders - Mapping of chapter names to folder paths
 * @param {Object} chapters - Entries data object
 * @param {string[]} currentPages - Current page paths
 * @param {string} chaptersRoot - Root directory for chapters
 * @returns {string} Folder path for the chapter
 */
export function getChapterFolder(chapterName = '', chapterFolders = {}, chapters = {}, currentPages = [], chaptersRoot = 'chapters') {
  if (chapterFolders[chapterName]) return chapterFolders[chapterName];
  return ensureChapterFolder(chapterName || 'Entry', chapterFolders, chapters, currentPages, chaptersRoot);
}

/**
 * Normalizes page paths by filtering out invalid entries and trimming whitespace
 * @param {string[]} pages - Array of page paths (may be invalid)
 * @returns {string[]} Normalized array of page paths
 */
export function normalizePages(pages = []) {
  return (Array.isArray(pages) ? pages : [])
    .filter(p => typeof p === 'string')
    .map(p => p.trim())
    .filter(Boolean);
}

/**
 * Checks if two page arrays are equal (same length and same items in order)
 * @param {string[]} a - First page array
 * @param {string[]} b - Second page array
 * @returns {boolean} True if arrays are equal
 */
export function pagesEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Generate a simple hash from a string (FNV-1a algorithm)
 * @param {string} str - String to hash
 * @returns {string} Hexadecimal hash string
 * @private
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
 * Generate a stable media ID based on the file path
 * Same path always produces the same ID (hash-based)
 * @param {string} path - File path to generate ID from
 * @returns {string} Stable media ID (e.g., "media-filename-abc123")
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

/**
 * Reads a File as a base64 payload (without the data URL prefix).
 * @param {File} file - File to read
 * @returns {Promise<string>} Base64-encoded content
 */
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unexpected file reader result'));
        return;
      }
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

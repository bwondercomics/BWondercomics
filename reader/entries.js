/**
 * Entry utility functions for the Battle Bros comic reader
 * Handles entry name parsing, sorting, and data normalization
 */

import { ENTRY_NUMBER_PATTERN } from './config.js';

/**
 * Extracts the numeric entry number from an entry name string
 * @param {string} [name=''] - Entry name (e.g., "Entry 5" or "entry 10")
 * @returns {number|null} The extracted entry number, or null if no number found
 * @example
 * extractEntryNumber("Entry 5") // returns 5
 * extractEntryNumber("Bonus") // returns null
 */
export function extractEntryNumber(name = '') {
  const match = name.match(ENTRY_NUMBER_PATTERN);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Sorts entry names numerically by their entry number
 * Non-numbered entries are sorted to the end alphabetically
 * @param {string[]} [names=[]] - Array of entry names to sort
 * @returns {string[]} Sorted array of entry names
 * @example
 * sortEntryNames(["Entry 10", "Entry 2", "Bonus"])
 * // returns ["Entry 2", "Entry 10", "Bonus"]
 */
export function sortEntryNames(names = []) {
  return [...names].sort((a, b) => {
    const aNum = extractEntryNumber(a);
    const bNum = extractEntryNumber(b);
    if (aNum != null && bNum != null && aNum !== bNum) {
      return aNum - bNum;
    }
    if (aNum != null && bNum == null) return -1;
    if (aNum == null && bNum != null) return 1;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });
}

export function sortEntryNamesWithMeta(names = [], meta = {}) {
  const withNumbers = [];
  const withoutNumbers = [];

  names.forEach((name) => {
    const rawNumber = meta?.[name]?.displayNumber;
    const parsed = Number.isFinite(rawNumber) ? rawNumber : parseInt(rawNumber, 10);
    const displayNumber = Number.isFinite(parsed) ? parsed : null;
    if (displayNumber != null) {
      withNumbers.push({ name, displayNumber });
    } else {
      withoutNumbers.push(name);
    }
  });

  withNumbers.sort((a, b) => {
    if (a.displayNumber !== b.displayNumber) return a.displayNumber - b.displayNumber;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return [...withNumbers.map((item) => item.name), ...sortEntryNames(withoutNumbers)];
}

/**
 * Normalizes and validates entry data from the series data endpoint
 * Filters out empty entries, removes duplicates, and creates a sorted entry order
 * @param {Object.<string, string[]>} [rawEntries={}] - Raw entries object with entry names as keys and page arrays as values
 * @returns {{chapters: Object.<string, string[]>, order: string[]}} Normalized entries object and sorted order array
 * @example
 * sanitizeEntries({ "Entry 1": ["page1.png"], "Empty": [] })
 * // returns { chapters: { "Entry 1": ["page1.png"] }, order: ["Entry 1"] }
 */
export function sanitizeEntries(rawEntries = {}, entryMeta = {}) {
  const clean = {};
  const seen = new Set();

  Object.entries(rawEntries).forEach(([name, pages]) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      console.warn(`Duplicate entry name ignored: ${trimmed}`);
      return;
    }

    const normalizedPages = Array.isArray(pages) ? pages.filter(Boolean) : [];
    const meta = entryMeta?.[trimmed];
    const keepEmpty = !!(
      normalizedPages.length === 0 &&
      meta &&
      typeof meta === 'object' &&
      (meta.showInGallery || meta.showInDropdown || meta.releaseType === 'store')
    );
    if (!normalizedPages.length && !keepEmpty) return;
    clean[trimmed] = normalizedPages;
    seen.add(key);
  });

  return {
    chapters: clean,
    order: sortEntryNames(Object.keys(clean))
  };
}

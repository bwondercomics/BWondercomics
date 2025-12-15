/**
 * Chapter utility functions for the Battle Bros comic reader
 * Handles chapter name parsing, sorting, and data normalization
 */

import { CHAPTER_NUMBER_PATTERN } from './config.js';

/**
 * Extracts the numeric chapter number from a chapter name string
 * @param {string} [name=''] - Chapter name (e.g., "Chapter 5" or "chapter 10")
 * @returns {number|null} The extracted chapter number, or null if no number found
 * @example
 * extractChapterNumber("Chapter 5") // returns 5
 * extractChapterNumber("Bonus") // returns null
 */
export function extractChapterNumber(name = '') {
  const match = name.match(CHAPTER_NUMBER_PATTERN);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Sorts chapter names numerically by their chapter number
 * Non-numbered chapters are sorted to the end alphabetically
 * @param {string[]} [names=[]] - Array of chapter names to sort
 * @returns {string[]} Sorted array of chapter names
 * @example
 * sortChapterNames(["Chapter 10", "Chapter 2", "Bonus"])
 * // returns ["Chapter 2", "Chapter 10", "Bonus"]
 */
export function sortChapterNames(names = []) {
  return [...names].sort((a, b) => {
    const aNum = extractChapterNumber(a);
    const bNum = extractChapterNumber(b);
    if (aNum != null && bNum != null && aNum !== bNum) {
      return aNum - bNum;
    }
    if (aNum != null && bNum == null) return -1;
    if (aNum == null && bNum != null) return 1;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });
}

/**
 * Normalizes and validates chapter data from admin/data.json
 * Filters out empty chapters, removes duplicates, and creates a sorted chapter order
 * @param {Object.<string, string[]>} [rawChapters={}] - Raw chapters object with chapter names as keys and page arrays as values
 * @returns {{chapters: Object.<string, string[]>, order: string[]}} Normalized chapters object and sorted order array
 * @example
 * sanitizeChapters({ "Chapter 1": ["page1.png"], "Empty": [] })
 * // returns { chapters: { "Chapter 1": ["page1.png"] }, order: ["Chapter 1"] }
 */
export function sanitizeChapters(rawChapters = {}) {
  const clean = {};
  const seen = new Set();

  Object.entries(rawChapters).forEach(([name, pages]) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      console.warn(`Duplicate chapter name ignored: ${trimmed}`);
      return;
    }

    const normalizedPages = Array.isArray(pages) ? pages.filter(Boolean) : [];
    clean[trimmed] = normalizedPages;
    seen.add(key);
  });

  return {
    chapters: clean,
    order: sortChapterNames(Object.keys(clean))
  };
}

/**
 * Unit tests for admin/utils.js
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  parseTags,
  sortPagesByFilename,
  normalizePages,
  pagesEqual,
  generateMediaId,
  sanitizeFolderFromName,
} from '../admin/utils.js';

describe('escapeHtml', () => {
  it('should escape ampersands', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  it('should escape less-than signs', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('should escape greater-than signs', () => {
    expect(escapeHtml('x > y')).toBe('x &gt; y');
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('should escape multiple special characters', () => {
    expect(escapeHtml('<a href="page">Link & "text"</a>')).toBe(
      '&lt;a href=&quot;page&quot;&gt;Link &amp; &quot;text&quot;&lt;/a&gt;'
    );
  });

  it('should handle empty strings', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should handle strings with no special characters', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  it('should convert non-strings to strings', () => {
    expect(escapeHtml(null)).toBe('null');
    expect(escapeHtml(undefined)).toBe(''); // undefined default param = ''
    expect(escapeHtml(123)).toBe('123');
  });
});

describe('parseTags', () => {
  it('should parse comma-separated tags', () => {
    expect(parseTags('tag1,tag2,tag3')).toEqual(['tag1', 'tag2', 'tag3']);
  });

  it('should trim whitespace', () => {
    expect(parseTags(' tag1 , tag2 , tag3 ')).toEqual(['tag1', 'tag2', 'tag3']);
  });

  it('should convert to lowercase', () => {
    expect(parseTags('Tag1,TAG2,TaG3')).toEqual(['tag1', 'tag2', 'tag3']);
  });

  it('should filter out empty tags', () => {
    expect(parseTags('tag1,,tag2,  ,tag3')).toEqual(['tag1', 'tag2', 'tag3']);
  });

  it('should handle empty string', () => {
    expect(parseTags('')).toEqual([]);
  });

  it('should handle single tag', () => {
    expect(parseTags('single')).toEqual(['single']);
  });
});

describe('sortPagesByFilename', () => {
  it('should sort pages by numeric order', () => {
    const pages = ['page10.jpg', 'page2.jpg', 'page1.jpg'];
    expect(sortPagesByFilename(pages)).toEqual(['page1.jpg', 'page2.jpg', 'page10.jpg']);
  });

  it('should handle full paths', () => {
    const pages = ['chapters/01/page10.jpg', 'chapters/01/page2.jpg', 'chapters/01/page1.jpg'];
    expect(sortPagesByFilename(pages)).toEqual([
      'chapters/01/page1.jpg',
      'chapters/01/page2.jpg',
      'chapters/01/page10.jpg',
    ]);
  });

  it('should sort alphabetically when numbers are equal', () => {
    const pages = ['page1b.jpg', 'page1a.jpg', 'page1c.jpg'];
    expect(sortPagesByFilename(pages)).toEqual(['page1a.jpg', 'page1b.jpg', 'page1c.jpg']);
  });

  it('should handle pages without numbers', () => {
    const pages = ['cover.jpg', 'back.jpg', 'front.jpg'];
    expect(sortPagesByFilename(pages)).toEqual(['back.jpg', 'cover.jpg', 'front.jpg']);
  });

  it('should not mutate original array', () => {
    const pages = ['page2.jpg', 'page1.jpg'];
    const original = [...pages];
    sortPagesByFilename(pages);
    expect(pages).toEqual(original);
  });

  it('should handle empty array', () => {
    expect(sortPagesByFilename([])).toEqual([]);
  });
});

describe('normalizePages', () => {
  it('should filter out non-string values', () => {
    const pages = ['page1.jpg', null, 'page2.jpg', undefined, 123];
    expect(normalizePages(pages)).toEqual(['page1.jpg', 'page2.jpg']);
  });

  it('should trim whitespace', () => {
    const pages = [' page1.jpg ', '  page2.jpg  '];
    expect(normalizePages(pages)).toEqual(['page1.jpg', 'page2.jpg']);
  });

  it('should filter out empty strings', () => {
    const pages = ['page1.jpg', '', '   ', 'page2.jpg'];
    expect(normalizePages(pages)).toEqual(['page1.jpg', 'page2.jpg']);
  });

  it('should handle non-array input', () => {
    expect(normalizePages(null)).toEqual([]);
    expect(normalizePages(undefined)).toEqual([]);
    expect(normalizePages('not an array')).toEqual([]);
  });

  it('should handle empty array', () => {
    expect(normalizePages([])).toEqual([]);
  });
});

describe('pagesEqual', () => {
  it('should return true for equal arrays', () => {
    const a = ['page1.jpg', 'page2.jpg', 'page3.jpg'];
    const b = ['page1.jpg', 'page2.jpg', 'page3.jpg'];
    expect(pagesEqual(a, b)).toBe(true);
  });

  it('should return false for different lengths', () => {
    const a = ['page1.jpg', 'page2.jpg'];
    const b = ['page1.jpg', 'page2.jpg', 'page3.jpg'];
    expect(pagesEqual(a, b)).toBe(false);
  });

  it('should return false for different order', () => {
    const a = ['page1.jpg', 'page2.jpg'];
    const b = ['page2.jpg', 'page1.jpg'];
    expect(pagesEqual(a, b)).toBe(false);
  });

  it('should return false for different values', () => {
    const a = ['page1.jpg', 'page2.jpg'];
    const b = ['page1.jpg', 'page3.jpg'];
    expect(pagesEqual(a, b)).toBe(false);
  });

  it('should handle empty arrays', () => {
    expect(pagesEqual([], [])).toBe(true);
  });

  it('should handle default parameters', () => {
    expect(pagesEqual()).toBe(true);
  });
});

describe('generateMediaId', () => {
  it('should generate stable IDs for same path', () => {
    const path = 'images/cover.jpg';
    const id1 = generateMediaId(path);
    const id2 = generateMediaId(path);
    expect(id1).toBe(id2);
  });

  it('should generate different IDs for different paths', () => {
    const id1 = generateMediaId('images/cover1.jpg');
    const id2 = generateMediaId('images/cover2.jpg');
    expect(id1).not.toBe(id2);
  });

  it('should include filename in ID', () => {
    const id = generateMediaId('images/my-cover.jpg');
    expect(id).toContain('my-cover');
  });

  it('should start with "media-" prefix', () => {
    const id = generateMediaId('images/cover.jpg');
    expect(id).toMatch(/^media-/);
  });

  it('should handle paths without extension', () => {
    const id = generateMediaId('images/cover');
    expect(id).toContain('cover');
  });

  it('should sanitize special characters in filename', () => {
    const id = generateMediaId('images/my cover (1).jpg');
    // Parentheses and spaces become hyphens: "my-cover-1-" with hash
    expect(id).toMatch(/^media-my-cover-1--[0-9a-f]+$/);
  });

  it.skip('should generate random ID when no path provided', () => {
    // Skipped: requires browser environment for window.crypto
    // In Node, this would use the fallback with Date.now()
    const id1 = generateMediaId('');
    const id2 = generateMediaId('');
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^(media-|[0-9a-f]{8}-)/);
  });
});

describe('sanitizeFolderFromName', () => {
  it('should convert to lowercase', () => {
    expect(sanitizeFolderFromName('Chapter 1')).toBe('chapters/chapter-1');
  });

  it('should replace spaces with hyphens', () => {
    expect(sanitizeFolderFromName('My Chapter Name')).toBe('chapters/my-chapter-name');
  });

  it('should remove special characters', () => {
    expect(sanitizeFolderFromName('Chapter #1!!')).toBe('chapters/chapter-1');
  });

  it('should handle custom chapters root', () => {
    expect(sanitizeFolderFromName('Chapter 1', 'comics')).toBe('comics/chapter-1');
  });

  it('should generate fallback for empty name', () => {
    const result = sanitizeFolderFromName('');
    expect(result).toMatch(/^chapters\/chapter-\d+$/);
  });

  it('should trim leading/trailing hyphens', () => {
    expect(sanitizeFolderFromName('---Chapter---')).toBe('chapters/chapter');
  });
});

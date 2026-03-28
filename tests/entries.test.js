/**
 * Tests for entry utility functions.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  extractEntryNumber,
  sortEntryNames,
  sortEntryNamesWithMeta,
  sanitizeEntries
} from '../reader/entries.js';

describe('extractEntryNumber', () => {
  it('extracts entry numbers from supported labels', () => {
    expect(extractEntryNumber('Entry 5')).toBe(5);
    expect(extractEntryNumber('issue 10')).toBe(10);
    expect(extractEntryNumber('CHAPTER 1')).toBe(1);
  });

  it('handles leading zeros', () => {
    expect(extractEntryNumber('Entry 01')).toBe(1);
    expect(extractEntryNumber('Issue 007')).toBe(7);
  });

  it('returns null for non-numbered names', () => {
    expect(extractEntryNumber('Bonus')).toBe(null);
    expect(extractEntryNumber('Epilogue')).toBe(null);
    expect(extractEntryNumber('Special Edition')).toBe(null);
  });

  it('handles empty or invalid input', () => {
    expect(extractEntryNumber('')).toBe(null);
    expect(extractEntryNumber()).toBe(null);
  });
});

describe('sortEntryNames', () => {
  it('sorts numbered entries numerically', () => {
    const input = ['Entry 10', 'Entry 2', 'Entry 1', 'Entry 5'];
    const expected = ['Entry 1', 'Entry 2', 'Entry 5', 'Entry 10'];
    expect(sortEntryNames(input)).toEqual(expected);
  });

  it('places non-numbered entries at the end', () => {
    const input = ['Entry 2', 'Bonus', 'Entry 1', 'Epilogue'];
    const expected = ['Entry 1', 'Entry 2', 'Bonus', 'Epilogue'];
    expect(sortEntryNames(input)).toEqual(expected);
  });

  it('sorts non-numbered entries alphabetically', () => {
    const input = ['Zebra', 'Alpha', 'Beta'];
    const expected = ['Alpha', 'Beta', 'Zebra'];
    expect(sortEntryNames(input)).toEqual(expected);
  });

  it('does not mutate the original array', () => {
    const input = ['Entry 3', 'Entry 1'];
    const original = [...input];
    sortEntryNames(input);
    expect(input).toEqual(original);
  });
});

describe('sanitizeEntries', () => {
  it('normalizes entry data and preserves sortable order', () => {
    const input = {
      'Entry 1': ['page1.png', 'page2.png'],
      'Entry 2': ['page1.png']
    };

    const result = sanitizeEntries(input);

    expect(result.chapters).toEqual(input);
    expect(result.order).toEqual(['Entry 1', 'Entry 2']);
  });

  it('drops empty entries without metadata flags', () => {
    const input = {
      'Entry 1': ['page1.png'],
      'Empty Entry': [],
      'Entry 2': ['page1.png']
    };

    const result = sanitizeEntries(input);

    expect(result.chapters['Entry 1']).toEqual(['page1.png']);
    expect(result.chapters['Empty Entry']).toBeUndefined();
    expect(result.chapters['Entry 2']).toEqual(['page1.png']);
  });

  it('keeps empty entries when metadata requires them', () => {
    const input = {
      'Store Release': []
    };
    const meta = {
      'Store Release': { releaseType: 'store' }
    };

    const result = sanitizeEntries(input, meta);

    expect(result.chapters['Store Release']).toEqual([]);
  });

  it('trims whitespace and filters falsy pages', () => {
    const input = {
      '  Entry 1  ': ['page1.png', null, '', 'page2.png', undefined]
    };

    const result = sanitizeEntries(input);

    expect(result.chapters['Entry 1']).toEqual(['page1.png', 'page2.png']);
    expect(result.chapters['  Entry 1  ']).toBeUndefined();
  });

  it('ignores duplicate names case-insensitively', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const input = {
      'Entry 1': ['page1.png'],
      'entry 1': ['page2.png']
    };

    const result = sanitizeEntries(input);

    expect(result.chapters).toEqual({
      'Entry 1': ['page1.png']
    });
    expect(warnSpy).toHaveBeenCalledWith('Duplicate entry name ignored: entry 1');
    warnSpy.mockRestore();
  });
});

describe('sortEntryNamesWithMeta', () => {
  it('sorts by displayNumber when available', () => {
    const names = ['Start Here', 'Issue 10', 'Issue 2'];
    const meta = {
      'Start Here': { displayNumber: 1 },
      'Issue 2': { displayNumber: 2 },
      'Issue 10': { displayNumber: 10 }
    };

    expect(sortEntryNamesWithMeta(names, meta)).toEqual([
      'Start Here',
      'Issue 2',
      'Issue 10'
    ]);
  });

  it('falls back to name sorting when displayNumber is missing', () => {
    const names = ['Bonus', 'Issue 2', 'Issue 10'];
    const meta = { 'Issue 10': { displayNumber: 10 } };

    expect(sortEntryNamesWithMeta(names, meta)).toEqual([
      'Issue 10',
      'Issue 2',
      'Bonus'
    ]);
  });
});

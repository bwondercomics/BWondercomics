/**
 * Tests for chapter utility functions
 */

import { describe, it, expect } from 'vitest';
import {
    extractChapterNumber,
    sortChapterNames,
    sortChapterNamesWithMeta,
    sanitizeChapters
} from '../reader/entries.js';

describe('extractChapterNumber', () => {
    it('should extract chapter number from standard format', () => {
        expect(extractChapterNumber('Chapter 5')).toBe(5);
        expect(extractChapterNumber('chapter 10')).toBe(10);
        expect(extractChapterNumber('CHAPTER 1')).toBe(1);
    });

    it('should handle chapters with leading zeros', () => {
        expect(extractChapterNumber('Chapter 01')).toBe(1);
        expect(extractChapterNumber('Chapter 007')).toBe(7);
    });

    it('should return null for non-numbered chapters', () => {
        expect(extractChapterNumber('Bonus')).toBe(null);
        expect(extractChapterNumber('Epilogue')).toBe(null);
        expect(extractChapterNumber('Special Edition')).toBe(null);
    });

    it('should handle empty or invalid input', () => {
        expect(extractChapterNumber('')).toBe(null);
        expect(extractChapterNumber()).toBe(null);
    });
});

describe('sortChapterNames', () => {
    it('should sort chapters numerically', () => {
        const input = ['Chapter 10', 'Chapter 2', 'Chapter 1', 'Chapter 5'];
        const expected = ['Chapter 1', 'Chapter 2', 'Chapter 5', 'Chapter 10'];
        expect(sortChapterNames(input)).toEqual(expected);
    });

    it('should place non-numbered chapters at the end', () => {
        const input = ['Chapter 2', 'Bonus', 'Chapter 1', 'Epilogue'];
        const expected = ['Chapter 1', 'Chapter 2', 'Bonus', 'Epilogue'];
        expect(sortChapterNames(input)).toEqual(expected);
    });

    it('should sort non-numbered chapters alphabetically', () => {
        const input = ['Zebra', 'Alpha', 'Beta'];
        const expected = ['Alpha', 'Beta', 'Zebra'];
        expect(sortChapterNames(input)).toEqual(expected);
    });

    it('should handle empty array', () => {
        expect(sortChapterNames([])).toEqual([]);
    });

    it('should not mutate original array', () => {
        const input = ['Chapter 3', 'Chapter 1'];
        const original = [...input];
        sortChapterNames(input);
        expect(input).toEqual(original);
    });
});

describe('sanitizeChapters', () => {
    it('should normalize chapter data correctly', () => {
        const input = {
            'Chapter 1': ['page1.png', 'page2.png'],
            'Chapter 2': ['page1.png']
        };
        const result = sanitizeChapters(input);

        expect(result.chapters).toEqual(input);
        expect(result.order).toEqual(['Chapter 1', 'Chapter 2']);
    });

    it('should drop empty entries without meta flags', () => {
        const input = {
            'Chapter 1': ['page1.png'],
            'Empty Chapter': [],
            'Chapter 2': ['page1.png']
        };
        const result = sanitizeChapters(input);

        expect(result.chapters['Chapter 1']).toEqual(['page1.png']);
        expect(result.chapters['Empty Chapter']).toBeUndefined();
        expect(result.chapters['Chapter 2']).toEqual(['page1.png']);
    });

    it('should keep empty entries with gallery or dropdown flags', () => {
        const input = {
            'Empty Chapter': []
        };
        const meta = {
            'Empty Chapter': { showInGallery: true }
        };
        const result = sanitizeChapters(input, meta);

        expect(result.chapters['Empty Chapter']).toEqual([]);
    });

    it('should trim whitespace from chapter names', () => {
        const input = {
            '  Chapter 1  ': ['page1.png'],
            'Chapter 2': ['page1.png']
        };
        const result = sanitizeChapters(input);

        expect(result.chapters['Chapter 1']).toEqual(['page1.png']);
        expect(result.chapters['  Chapter 1  ']).toBeUndefined();
    });

    it('should handle empty input', () => {
        const result = sanitizeChapters({});
        expect(result.chapters).toEqual({});
        expect(result.order).toEqual([]);
    });

    it('should filter out falsy page values', () => {
        const input = {
            'Chapter 1': ['page1.png', null, '', 'page2.png', undefined]
        };
        const result = sanitizeChapters(input);

        expect(result.chapters['Chapter 1']).toEqual(['page1.png', 'page2.png']);
    });

    it('should create sorted order array', () => {
        const input = {
            'Chapter 10': ['page1.png'],
            'Chapter 2': ['page1.png'],
            'Chapter 1': ['page1.png']
        };
        const result = sanitizeChapters(input);

        expect(result.order).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 10']);
    });
});

describe('sortChapterNamesWithMeta', () => {
    it('should sort by displayNumber when available', () => {
        const names = ['Start Here', 'Issue 10', 'Issue 2'];
        const meta = {
            'Start Here': { displayNumber: 1 },
            'Issue 2': { displayNumber: 2 },
            'Issue 10': { displayNumber: 10 }
        };

        expect(sortChapterNamesWithMeta(names, meta)).toEqual([
            'Start Here',
            'Issue 2',
            'Issue 10'
        ]);
    });

    it('should fall back to name sorting when displayNumber missing', () => {
        const names = ['Bonus', 'Issue 2', 'Issue 10'];
        const meta = { 'Issue 10': { displayNumber: 10 } };

        expect(sortChapterNamesWithMeta(names, meta)).toEqual([
            'Issue 10',
            'Issue 2',
            'Bonus'
        ]);
    });
});

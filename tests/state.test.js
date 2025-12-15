/**
 * Tests for state management and progress persistence
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { state, saveProgress, loadProgress } from '../reader/state.js';

describe('state object', () => {
    it('should have correct initial structure', () => {
        expect(state).toHaveProperty('currentChapter');
        expect(state).toHaveProperty('pages');
        expect(state).toHaveProperty('pageIndex');
        expect(state).toHaveProperty('scale');
        expect(state).toHaveProperty('pan');
        expect(state).toHaveProperty('imageCache');
    });

    it('should initialize with default values', () => {
        expect(state.currentChapter).toBe('');
        expect(state.pages).toEqual([]);
        expect(state.pageIndex).toBe(0);
        expect(state.scale).toBe(1);
        expect(state.pan).toEqual({ x: 0, y: 0 });
    });

    it('should have Map for imageCache', () => {
        expect(state.imageCache).toBeInstanceOf(Map);
    });
});

describe('saveProgress', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('should save progress to localStorage', () => {
        const testState = {
            currentChapter: 'Chapter 1',
            pageIndex: 5
        };

        saveProgress(testState);

        const saved = localStorage.getItem('battleBros_progress');
        expect(saved).toBeTruthy();

        const parsed = JSON.parse(saved);
        expect(parsed.chapter).toBe('Chapter 1');
        expect(parsed.page).toBe(5);
        expect(parsed.timestamp).toBeDefined();
    });

    it('should use global state if no argument provided', () => {
        state.currentChapter = 'Chapter 2';
        state.pageIndex = 3;

        saveProgress();

        const saved = localStorage.getItem('battleBros_progress');
        const parsed = JSON.parse(saved);
        expect(parsed.chapter).toBe('Chapter 2');
        expect(parsed.page).toBe(3);
    });

    it('should include timestamp', () => {
        const before = Date.now();
        saveProgress({ currentChapter: 'Test', pageIndex: 0 });
        const after = Date.now();

        const saved = JSON.parse(localStorage.getItem('battleBros_progress'));
        expect(saved.timestamp).toBeGreaterThanOrEqual(before);
        expect(saved.timestamp).toBeLessThanOrEqual(after);
    });

    it('should handle localStorage errors gracefully', () => {
        // Mock localStorage.setItem to throw
        const originalSetItem = localStorage.setItem;
        localStorage.setItem = () => {
            throw new Error('Storage full');
        };

        // Should not throw
        expect(() => {
            saveProgress({ currentChapter: 'Test', pageIndex: 0 });
        }).not.toThrow();

        // Restore
        localStorage.setItem = originalSetItem;
    });
});

describe('loadProgress', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('should load saved progress', () => {
        const testData = {
            chapter: 'Chapter 3',
            page: 7,
            timestamp: Date.now()
        };

        localStorage.setItem('battleBros_progress', JSON.stringify(testData));

        const loaded = loadProgress();
        expect(loaded.chapter).toBe('Chapter 3');
        expect(loaded.page).toBe(7);
        expect(loaded.timestamp).toBe(testData.timestamp);
    });

    it('should return null if no progress saved', () => {
        const loaded = loadProgress();
        expect(loaded).toBeNull();
    });

    it('should return null for invalid JSON', () => {
        localStorage.setItem('battleBros_progress', 'invalid json {');

        const loaded = loadProgress();
        expect(loaded).toBeNull();
    });

    it('should handle localStorage errors gracefully', () => {
        // Mock localStorage.getItem to throw
        const originalGetItem = localStorage.getItem;
        localStorage.getItem = () => {
            throw new Error('Storage error');
        };

        const loaded = loadProgress();
        expect(loaded).toBeNull();

        // Restore
        localStorage.getItem = originalGetItem;
    });
});

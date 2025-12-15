/**
 * Application state management for the Battle Bros comic reader
 * Handles reading progress persistence and runtime state
 */

import { CONFIG } from './config.js';

/**
 * Global application state object
 * Contains all runtime state for the comic reader
 * @type {Object}
 * @property {string} currentChapter - Name of the currently displayed chapter
 * @property {string[]} pages - Array of image URLs for the current chapter
 * @property {number} pageIndex - Current page index (0-based)
 * @property {number} scale - Current zoom scale factor
 * @property {{x: number, y: number}} pan - Current pan offset in pixels
 * @property {Map} pointers - Active pointer/touch events
 * @property {boolean} isDragging - Whether user is currently dragging
 * @property {Object|null} dragStart - Starting position of drag gesture
 * @property {Object|null} panStart - Starting pan offset when drag began
 * @property {Object|null} touchStart - Starting touch position
 * @property {number|null} pinchDistance - Distance between pinch touch points
 * @property {Object|null} pinchCenter - Center point of pinch gesture
 * @property {number} pinchScale - Scale factor from pinch gesture
 * @property {Map} imageCache - FIFO cache of preloaded images
 * @property {number} lastTap - Timestamp of last tap (for double-tap detection)
 * @property {boolean} isTransitioning - Whether page transition animation is active
 * @property {number|null} rafId - RequestAnimationFrame ID for animations
 * @property {Object|null} prevTransformOrigin - Previous transform origin for animations
 */
export const state = {
  currentChapter: '',
  pages: [],
  pageIndex: 0,
  scale: 1,
  pan: { x: 0, y: 0 },
  pointers: new Map(),
  isDragging: false,
  dragStart: null,
  panStart: null,
  touchStart: null,
  pinchDistance: null,
  pinchCenter: null,
  pinchScale: 1,
  imageCache: new Map(),
  lastTap: 0,
  isTransitioning: false,
  rafId: null,
  prevTransformOrigin: null
};

/**
 * Saves reading progress to localStorage
 * Stores current chapter, page index, and timestamp
 * @param {Object} [stateObj=state] - State object to save (defaults to global state)
 */
export function saveProgress(stateObj = state) {
  try {
    const data = {
      chapter: stateObj.currentChapter,
      page: stateObj.pageIndex,
      timestamp: Date.now()
    };
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save progress:', e);
  }
}

/**
 * Loads saved reading progress from localStorage
 * @returns {Object|null} Saved progress object with chapter, page, and timestamp, or null if none exists
 */
export function loadProgress() {
  try {
    const json = localStorage.getItem(CONFIG.STORAGE_KEY);
    return json ? JSON.parse(json) : null;
  } catch (e) {
    return null;
  }
}

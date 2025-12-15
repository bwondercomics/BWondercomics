/**
 * Application configuration constants
 * Centralized configuration for the Battle Bros comic reader
 */
export const CONFIG = {
  /** LocalStorage key for saving reading progress */
  STORAGE_KEY: 'battleBros_progress',

  /** Maximum number of images to cache in memory (FIFO) */
  IMAGE_CACHE_SIZE: 60,

  /** Number of pages to preload ahead of current position */
  PRELOAD_AHEAD: 8,

  /** Minimum viewport width (px) required for two-page mode */
  TWO_PAGE_BREAKPOINT: 900,

  /** Minimum aspect ratio (width/height) for two-page mode
   * 0.714 ≈ 5:7 ratio - ensures viewport is wide enough for comfortable dual-page viewing */
  TWO_PAGE_ASPECT_RATIO: 0.714,

  /** Zoom multiplier for each zoom in/out step */
  ZOOM_STEP: 1.2,

  /** Minimum zoom level (5% of original size) */
  ZOOM_MIN: 0.05,

  /** Maximum zoom level (20x original size) */
  ZOOM_MAX: 20,

  /** Duration (ms) for page transition animations */
  ANIMATION_DURATION: 200,

  /** Delay (ms) before auto-hiding controls in fullscreen */
  CONTROLS_HIDE_DELAY: 800,

  /** Percentage of viewport width/height for edge navigation zones */
  EDGE_ZONE_THRESHOLD: 0.12,

  /** Minimum swipe distance (px) to trigger page navigation */
  SWIPE_THRESHOLD: 50,

  /** Maximum time (ms) for a gesture to be considered a swipe */
  SWIPE_TIMEOUT: 500
};

export const CHAPTER_NUMBER_PATTERN = /chapter\s+(\d+)/i;

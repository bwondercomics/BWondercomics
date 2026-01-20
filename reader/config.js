/**
 * Application configuration constants
 * Centralized configuration for the Battle Bros comic reader
 */

/**
 * Detect if device is low-end based on available signals.
 * Used to adjust cache/preload for better performance on older devices.
 */
function isLowEndDevice() {
  // Check device memory (in GB) - available in Chrome/Edge
  const memory = navigator.deviceMemory;
  if (memory && memory <= 4) return true;

  // Check hardware concurrency (CPU cores)
  const cores = navigator.hardwareConcurrency;
  if (cores && cores <= 4) return true;

  // Check for mobile user agent as fallback
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // If mobile and we couldn't detect memory, assume low-end to be safe
  if (isMobile && !memory) return true;

  return false;
}

const lowEnd = isLowEndDevice();

export const CONFIG = {
  /** LocalStorage key for saving reading progress */
  STORAGE_KEY: 'battleBros_progress',

  /** Maximum number of images to cache in memory (FIFO)
   * Reduced on low-end devices to avoid memory pressure */
  IMAGE_CACHE_SIZE: lowEnd ? 15 : 30,

  /** Number of pages to preload ahead of current position
   * Reduced on low-end devices for faster initial load */
  PRELOAD_AHEAD: lowEnd ? 3 : 5,

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

export const CHAPTER_NUMBER_PATTERN = /(?:entry|issue|chapter)\s*(\d+)/i;

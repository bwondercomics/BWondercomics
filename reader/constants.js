/**
 * BWonderComics Reader - Constants
 * Centralized constants to eliminate magic numbers and improve maintainability
 */

// ==================== TOUCH & GESTURE ====================
export const TOUCH = {
    DOUBLE_TAP_DELAY: 300, // ms - max time between taps to register as double-tap
    PINCH_THRESHOLD: 10, // pixels - minimum distance change to register as pinch
    SWIPE_THRESHOLD: 50, // pixels - minimum distance to register as swipe
    TAP_TOLERANCE: 10, // pixels - max movement allowed for tap vs drag
};

// ==================== ZOOM & SCALE ====================
export const ZOOM = {
    MIN_SCALE: 0.5, // minimum zoom level (50%)
    MAX_SCALE: 4.0, // maximum zoom level (400%)
    DEFAULT_SCALE: 1.0, // default zoom level (100%)
    ZOOM_STEP: 0.2, // zoom increment/decrement per action
    DOUBLE_TAP_SCALE: 2.0, // zoom level when double-tapping
};

// ==================== ANIMATION & TIMING ====================
export const ANIMATION = {
    TRANSITION_DURATION: 300, // ms - standard transition time
    TRANSITION_FAST: 150, // ms - fast transitions
    TRANSITION_SLOW: 500, // ms - slow transitions
    DEBOUNCE_DELAY: 150, // ms - debounce delay for resize/scroll
    THROTTLE_DELAY: 100, // ms - throttle delay for high-frequency events
};

// ==================== CACHING ====================
export const CACHE = {
    MAX_CACHED_IMAGES: 10, // maximum number of images to keep in memory
    PRELOAD_PAGES: 2, // number of pages to preload ahead/behind current
    CACHE_STRATEGY: 'fifo', // first-in-first-out cache eviction
};

// ==================== STORAGE ====================
export const STORAGE = {
    PROGRESS_KEY: 'battleBros_progress', // localStorage key for reading progress
    CONFIG_KEY_PREFIX: 'battlebros_page_config:', // prefix for page config keys
    THEME_KEY: 'battlebros_theme', // localStorage key for theme preferences
};

// ==================== UI DIMENSIONS ====================
export const UI = {
    MOBILE_BREAKPOINT: 768, // px - mobile vs desktop breakpoint
    TABLET_BREAKPOINT: 1024, // px - tablet vs desktop breakpoint
    HEADER_HEIGHT: 60, // px - header height
    PANEL_MIN_WIDTH: 250, // px - minimum side panel width
    PANEL_MAX_WIDTH: 400, // px - maximum side panel width
};

// ==================== KEYBOARD SHORTCUTS ====================
export const KEYS = {
    ARROW_LEFT: 'ArrowLeft',
    ARROW_RIGHT: 'ArrowRight',
    ARROW_UP: 'ArrowUp',
    ARROW_DOWN: 'ArrowDown',
    SPACE: ' ',
    ESCAPE: 'Escape',
    ENTER: 'Enter',
    QUESTION_MARK: '?',
    F: 'f',
    G: 'g',
    H: 'h',
};

// ==================== API ENDPOINTS ====================
export const API = {
    BASE_URL: '/api',
    ENDPOINTS: {
        SESSION: '/api/session',
        LOGIN: '/api/login',
        LOGOUT: '/api/logout',
        REGISTER: '/api/register',
        COMMENTS: '/api/comments',
        POSTS_LATEST: '/api/posts/latest',
        POSTS: '/api/posts',
        SAVE: '/api/save',
    },
};

// ==================== FILE PATHS ====================
export const PATHS = {
    ADMIN_DATA: 'admin/data.json',
    ADMIN_SERIES: 'admin/series.json',
    ADMIN_PAGE_CONFIG: 'admin/page-config.json',
    SERIES_DATA_TEMPLATE: 'admin/series/{id}/data.json',
    SERIES_CONFIG_TEMPLATE: 'admin/series/{id}/page-config.json',
};

// ==================== DEFAULT VALUES ====================
export const DEFAULTS = {
    SERIES_ID: 'battle-bros',
    UNIT_LABEL_SINGULAR: 'Chapter',
    UNIT_LABEL_PLURAL: 'Chapters',
    PAGE_INDEX: 0,
};

// ==================== GALLERY ====================
export const GALLERY = {
    CARD_ANIMATION_DELAY: 60, // ms - delay between card animations
    CARD_ANIMATION_BASE_DELAY: 120, // ms - base delay before first card
    GRID_MIN_COLUMN_WIDTH: 200, // px - minimum width for gallery grid columns
    GRID_GAP: 20, // px - gap between gallery items
};

// ==================== ERROR MESSAGES ====================
export const ERRORS = {
    CHAPTER_LOAD_FAILED: 'Failed to load chapter data',
    CONFIG_LOAD_FAILED: 'Failed to load configuration',
    IMAGE_LOAD_FAILED: 'Failed to load image',
    NETWORK_ERROR: 'Network error occurred',
    INVALID_DATA: 'Invalid data structure',
};

// ==================== HTTP STATUS CODES ====================
export const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    SERVER_ERROR: 500,
};

// ==================== FEATURE FLAGS ====================
export const FEATURES = {
    ENABLE_ANALYTICS: true,
    ENABLE_COMMENTS: true,
    ENABLE_PREMIUM: true,
    ENABLE_GALLERY: true,
    ENABLE_CUSTOMIZATION: true,
};

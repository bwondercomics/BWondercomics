/**
 * BWonderComics Reader - Constants
 * Centralized constants to eliminate magic numbers and improve maintainability
 */

// ==================== STORAGE ====================
export const STORAGE = {
    PROGRESS_KEY: 'battleBros_progress', // localStorage key for reading progress
    CONFIG_KEY_PREFIX: 'battlebros_page_config:', // prefix for page config keys
    THEME_KEY: 'battlebros_theme', // localStorage key for theme preferences
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

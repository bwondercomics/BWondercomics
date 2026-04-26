/**
 * BWonderComics Reader - Constants
 * Centralized constants to eliminate magic numbers and improve maintainability
 */

// ==================== STORAGE ====================
export const STORAGE = {
  PROGRESS_KEY: 'battleBros_progress', // localStorage key for reading progress
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
    USER_SETTINGS: '/api/user/settings',
    USER_EMAIL_OPT: '/api/user/email-opt',
    USER_DELETE_COMMENTS: '/api/user/comments/delete',
    USER_COMMENTS: '/api/user/comments',
    USER_DELETE_ACCOUNT: '/api/user/account',
    USER_REDEEM_PREMIUM: '/api/user/premium/redeem',
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

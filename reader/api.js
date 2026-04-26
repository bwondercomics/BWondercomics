/**
 * API Utility Functions
 * Centralized API request handling with error management
 */

import { API } from './constants.js';
import { logger } from './logger.js';

/**
 * Base fetch wrapper with error handling
 * @param {string} url - API endpoint URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>}
 * @throws {Error} On network or HTTP errors
 */
async function apiFetch(url, options = {}) {
  const defaultOptions = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, { ...defaultOptions, ...options });
    return response;
  } catch (err) {
    logger.error(`API request failed: ${url}`, err);
    throw new Error(`Network error: ${err.message}`);
  }
}

/**
 * GET request
 * @param {string} url - API endpoint URL
 * @param {Object} options - Additional fetch options
 * @returns {Promise<any>} Parsed JSON response
 */
export async function apiGet(url, options = {}) {
  const response = await apiFetch(url, { method: 'GET', ...options });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * POST request
 * @param {string} url - API endpoint URL
 * @param {Object} data - Request body data
 * @param {Object} options - Additional fetch options
 * @returns {Promise<any>} Parsed JSON response
 */
export async function apiPost(url, data, options = {}) {
  const response = await apiFetch(url, {
    method: 'POST',
    body: JSON.stringify(data),
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * PUT request
 * @param {string} url - API endpoint URL
 * @param {Object} data - Request body data
 * @param {Object} options - Additional fetch options
 * @returns {Promise<any>} Parsed JSON response
 */
export async function apiPut(url, data, options = {}) {
  const response = await apiFetch(url, {
    method: 'PUT',
    body: JSON.stringify(data),
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * DELETE request
 * @param {string} url - API endpoint URL
 * @param {Object} options - Additional fetch options
 * @returns {Promise<any>} Parsed JSON response
 */
export async function apiDelete(url, options = {}) {
  const response = await apiFetch(url, { method: 'DELETE', ...options });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch comments for a target
 * @param {string} targetId - Target identifier (e.g., chapter ID)
 * @returns {Promise<Array>} Array of comments
 */
export async function fetchComments(targetId) {
  try {
    const data = await apiGet(
      `${API.ENDPOINTS.COMMENTS}?target_id=${encodeURIComponent(targetId)}`
    );
    return data.comments || [];
  } catch (err) {
    logger.error('Failed to fetch comments:', err);
    return [];
  }
}

/**
 * Post a new comment
 * @param {string} targetId - Target identifier
 * @param {string} message - Comment message
 * @returns {Promise<Object>} Created comment
 */
export async function postComment(targetId, message) {
  return apiPost(API.ENDPOINTS.COMMENTS, {
    target_id: targetId,
    message: message,
  });
}

/**
 * Fetch latest post
 * @returns {Promise<Object|null>} Latest post or null
 */
export async function fetchLatestPost() {
  try {
    const data = await apiGet(API.ENDPOINTS.POSTS_LATEST);
    return data.post || null;
  } catch (err) {
    logger.error('Failed to fetch latest post:', err);
    return null;
  }
}

/**
 * Fetch all posts
 * @param {Object} params - Query parameters
 * @returns {Promise<Array>} Array of posts
 */
export async function fetchPosts(params = {}) {
  try {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${API.ENDPOINTS.POSTS}?${queryString}` : API.ENDPOINTS.POSTS;
    const data = await apiGet(url);
    return data.posts || [];
  } catch (err) {
    logger.error('Failed to fetch posts:', err);
    return [];
  }
}

/**
 * Save data to server
 * @param {string} filename - File path to save to
 * @param {Object|string} content - Content to save
 * @returns {Promise<Object>} Save response
 */
export async function saveData(filename, content) {
  const body = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

  return apiPost(API.ENDPOINTS.SAVE, {
    filename: filename,
    content: body,
  });
}

/**
 * Check if response indicates success
 * @param {number} status - HTTP status code
 * @returns {boolean}
 */
export function isSuccessStatus(status) {
  return status >= 200 && status < 300;
}

/**
 * Check if response indicates client error
 * @param {number} status - HTTP status code
 * @returns {boolean}
 */
export function isClientError(status) {
  return status >= 400 && status < 500;
}

/**
 * Check if response indicates server error
 * @param {number} status - HTTP status code
 * @returns {boolean}
 */
export function isServerError(status) {
  return status >= 500;
}

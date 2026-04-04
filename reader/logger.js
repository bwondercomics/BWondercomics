/**
 * Development logger utility
 * Automatically suppresses console.log in production environments
 */

const isDevelopment =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname === '';

export const logger = {
  /**
   * Log informational messages (only in development)
   * @param {...any} args - Arguments to log
   */
  log: (...args) => {
    if (isDevelopment) console.warn('[log]', ...args);
  },

  /**
   * Log informational messages (only in development)
   * @param {...any} args - Arguments to log
   */
  info: (...args) => {
    if (isDevelopment) console.warn('[info]', ...args);
  },

  /**
   * Log warning messages (always shown)
   * @param {...any} args - Arguments to log
   */
  warn: (...args) => console.warn(...args),

  /**
   * Log error messages (always shown)
   * @param {...any} args - Arguments to log
   */
  error: (...args) => console.error(...args),

  /**
   * Check if running in development mode
   * @returns {boolean}
   */
  isDev: () => isDevelopment,
};

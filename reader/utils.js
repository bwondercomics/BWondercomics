/**
 * Performance utilities for the reader.
 */

/**
 * Throttle a function to run at most once per `limit` milliseconds.
 * Uses performance.now() for accurate timing.
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Minimum ms between calls
 * @returns {Function} Throttled function
 */
export function throttle(fn, limit) {
  let lastCall = 0;
  return function throttled(...args) {
    const now = performance.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      fn.apply(this, args);
    }
  };
}

/**
 * Cache a DOM measurement (like getBoundingClientRect) with a TTL.
 * @param {Function} measureFn - Function that returns the measurement
 * @param {number} ttl - Cache TTL in milliseconds
 * @returns {Function} Cached measurement function
 */
export function cachedMeasure(measureFn, ttl = 100) {
  let cache = null;
  let cacheTime = 0;
  return function getCached() {
    const now = performance.now();
    if (!cache || now - cacheTime > ttl) {
      cache = measureFn();
      cacheTime = now;
    }
    return cache;
  };
}

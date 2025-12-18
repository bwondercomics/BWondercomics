/**
 * Data loading utilities for the Battle Bros comic reader
 * Handles fetching and parsing chapter data, page config, and latest posts
 */

import { sanitizeChapters } from './chapters.js';
import { getSeriesDataPath, getSeriesPageConfigPath } from './series.js';
import { logger } from './logger.js';

/**
 * Loads chapter data from admin/data.json
 * Fetches chapter list, page URLs, and status message from the admin panel
 * @async
 * @returns {Promise<{chapters: Object, chapterOrder: string[], statusMessage: string}>} Normalized chapter data
 * @throws {Error} If fetch fails or data structure is invalid
 */
export async function loadChapterData(seriesId) {
  try {
    const dataPath = getSeriesDataPath(seriesId);
    const response = await fetch(dataPath, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load chapter data: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();

    if (!data.chapters || typeof data.chapters !== 'object') {
      throw new Error(`Invalid chapter data structure in ${dataPath}`);
    }

    const normalized = sanitizeChapters(data.chapters);
    return {
      chapters: normalized.chapters,
      chapterOrder: normalized.order,
      statusMessage: data.statusMessage || '',
      chapterMeta: data.chapterMeta && typeof data.chapterMeta === 'object' ? data.chapterMeta : {},
      premiumOnly: !!data.premiumOnly,
      unitLabelSingular: String(data.unitLabelSingular || '').trim() || 'Chapter',
      unitLabelPlural: String(data.unitLabelPlural || '').trim() || 'Chapters'
    };
  } catch (error) {
    console.error('Failed to load chapter data:', error);
    throw error;
  }
}

/**
 * Loads page configuration from admin/page-config.json
 * Applies custom subtitles and theme overrides if available
 * @async
 * @param {Function} setSubtitlesFn - Callback function to set subtitles in the UI
 * @returns {Promise<boolean>} True if config loaded successfully, false otherwise
 */
export async function loadPageConfig(setSubtitlesFn, seriesId) {
  try {
    const configPath = getSeriesPageConfigPath(seriesId);
    const response = await fetch(configPath, { cache: 'no-store' });
    if (!response.ok) {
      console.warn(`Failed to load page config: ${response.status} ${response.statusText}`);
      return false;
    }
    const config = await response.json();

    if (config.content && config.content.header && Array.isArray(config.content.header.subtitles)) {
      setSubtitlesFn(config.content.header.subtitles);
      logger.log(`✓ Page config loaded from ${configPath}`);
    } else {
      console.warn('No subtitles found in page-config.json');
    }

    return true;
  } catch (error) {
    console.error('Failed to load page config:', error);
    return false;
  }
}

/**
 * Loads the latest post from /api/posts/latest for the "Latest Update" widget
 * Displays loading state and handles errors gracefully
 * @async
 * @returns {Promise<Object|null>} Latest post object sorted by date, or null if none available
 */
export async function loadLatestPost() {
  const body = document.getElementById('latestBody');
  if (!body) return null;

  body.innerHTML = '<div class="latest-loading">Loading...</div>';

  try {
    const response = await fetch('/api/posts/latest', { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to load latest post');
    const data = await response.json().catch(() => ({}));
    const post = data && typeof data === 'object' ? data.post : null;

    if (!post) {
      body.innerHTML = '<div class="latest-empty">No updates yet.</div>';
      return null;
    }

    return post;
  } catch (error) {
    console.error('Latest update widget error:', error);
    body.innerHTML = '<div class="latest-empty" style="color: var(--danger);">Could not load updates.</div>';
    return null;
  }
}

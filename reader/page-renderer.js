/**
 * Page Renderer: Renders pages built with the page builder.
 * Fetches page config from the API and renders modules to HTML.
 *
 * Module HTML output is provided by the shared renderer factory in
 * admin/page-builder/shared-renderers.js. This file owns the reader-specific
 * runtime layer: fetching, mounting, live email forms, and promo carousels.
 */

import { getActiveSeriesId } from './series.js';
import { logger } from './logger.js';
import { createRenderers } from '../admin/page-builder/shared-renderers.js';
import { escapeHtml } from '../admin/page-builder/helpers.js';

function resolveReaderImageUrl(raw) {
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `/${raw}`;
}

const _renderers = createRenderers({
  resolveImageUrl: resolveReaderImageUrl,
  getSeriesId: () => getActiveSeriesId(),
  showMountPlaceholders: false,
});

export const MODULE_RENDERERS = _renderers.MODULE_RENDERERS;
export const renderModule = _renderers.renderModule;

/**
 * Render a complete page to HTML, including the page-id data attribute
 * that reader pages use for live context.
 */
export function renderPage(page, options = {}) {
  if (!page || !page.sections) {
    return '<div class="pb-page-empty">Page not configured.</div>';
  }

  const builderEditing = options.builderEditing === true;
  const deviceId = options.deviceId;
  const sectionsHtml = page.sections
    .map((section, sectionIndex) =>
      _renderers.renderSection(section, { builderEditing, deviceId, sectionIndex })
    )
    .join('');
  const builderAttrs = builderEditing ? ` data-builder-page-id="${escapeHtml(page.id || '')}"` : '';

  return `<div class="pb-page" data-page-id="${escapeHtml(page.id || '')}"${builderAttrs}>${sectionsHtml}</div>`;
}

/**
 * Fetch a page by slug from the API.
 */
export async function fetchPage(slug, seriesId = null, options = {}) {
  const sid = seriesId || getActiveSeriesId();
  const url =
    options?.pageScope === 'global'
      ? `/api/pages/global/by-slug/${encodeURIComponent(slug)}`
      : `/api/pages/${encodeURIComponent(sid)}/${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) {
        logger.log(`Page "${slug}" not found for series "${sid}"`);
        return null;
      }
      throw new Error(`Failed to fetch page: ${res.status}`);
    }
    const data = await res.json();
    return data.page || null;
  } catch (err) {
    logger.error('fetchPage error:', err);
    return null;
  }
}

/**
 * Mount a page into a container element.
 */
export async function mountPage(container, slug, seriesId = null, options = {}) {
  if (!container) {
    logger.error('mountPage: container is required');
    return;
  }

  container.innerHTML = '<div class="pb-loading">Loading...</div>';

  const page = await fetchPage(slug, seriesId, options);
  if (!page) {
    container.innerHTML = '<div class="pb-error">Page not found.</div>';
    return;
  }

  container.innerHTML = renderPage(page, { builderEditing: options.builderEditing === true });

  // Initialize interactive modules
  initEmailForms(container, { previewMode: !!options.previewMode });
  initPromoCarousels(container);
}

/**
 * Initialize email signup forms within a container.
 */
export function initEmailForms(container, options = {}) {
  if (!container) return;
  const previewMode = !!options.previewMode;
  container.querySelectorAll('[data-email-signup]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.querySelector('input[type="email"]');
      const status = form.parentElement.querySelector('.pb-email-status');
      const email = input?.value?.trim();

      if (!email) return;
      if (previewMode) {
        if (status) status.textContent = 'Form works! (Preview mode - not submitted)';
        return;
      }

      try {
        const res = await fetch('/api/email/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        if (res.ok) {
          if (status) status.textContent = 'Thanks for subscribing!';
          if (input) input.value = '';
        } else {
          const data = await res.json();
          if (status) status.textContent = data.error || 'Failed to subscribe.';
        }
      } catch {
        if (status) status.textContent = 'Failed to subscribe.';
      }
    });
  });
}

/**
 * Initialize promo carousel modules within a container.
 */
export function initPromoCarousels(container) {
  if (!container) return;
  container.querySelectorAll('.pb-promo[data-item-count]').forEach((promo) => {
    const itemCount = parseInt(promo.dataset.itemCount, 10);
    if (itemCount <= 1) return;

    const autoRotate = promo.dataset.autoRotate === 'true';
    const interval = parseInt(promo.dataset.interval, 10) || 5000;
    const slides = promo.querySelectorAll('.pb-promo-slide');
    const indicators = promo.querySelectorAll('.pb-promo-indicator');
    const prevBtn = promo.querySelector('.pb-promo-nav--prev');
    const nextBtn = promo.querySelector('.pb-promo-nav--next');

    let currentIndex = 0;
    let autoRotateTimer = null;
    let isPaused = false;

    function showSlide(index) {
      currentIndex = (index + itemCount) % itemCount;
      slides.forEach((slide, i) => {
        slide.classList.toggle('active', i === currentIndex);
      });
      indicators.forEach((ind, i) => {
        ind.classList.toggle('active', i === currentIndex);
      });
    }

    function nextSlide() {
      showSlide(currentIndex + 1);
    }

    function prevSlide() {
      showSlide(currentIndex - 1);
    }

    function startAutoRotate() {
      if (autoRotate && !isPaused) {
        stopAutoRotate();
        autoRotateTimer = setInterval(nextSlide, interval);
      }
    }

    function stopAutoRotate() {
      if (autoRotateTimer) {
        clearInterval(autoRotateTimer);
        autoRotateTimer = null;
      }
    }

    prevBtn?.addEventListener('click', () => {
      prevSlide();
      startAutoRotate();
    });

    nextBtn?.addEventListener('click', () => {
      nextSlide();
      startAutoRotate();
    });

    indicators.forEach((ind) => {
      ind.addEventListener('click', () => {
        showSlide(parseInt(ind.dataset.index, 10));
        startAutoRotate();
      });
    });

    promo.addEventListener('mouseenter', () => {
      isPaused = true;
      stopAutoRotate();
    });

    promo.addEventListener('mouseleave', () => {
      isPaused = false;
      startAutoRotate();
    });

    let touchStartX = 0;
    promo.addEventListener(
      'touchstart',
      (e) => {
        touchStartX = e.changedTouches[0].screenX;
      },
      { passive: true }
    );

    promo.addEventListener(
      'touchend',
      (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 50) {
          if (diff > 0) {
            nextSlide();
          } else {
            prevSlide();
          }
          startAutoRotate();
        }
      },
      { passive: true }
    );

    startAutoRotate();
  });
}

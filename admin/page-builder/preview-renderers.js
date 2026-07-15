/**
 * Preview renderers for the admin page builder.
 *
 * Module HTML output is delegated to the shared renderer factory in
 * shared-renderers.js. This file owns the preview-specific layer:
 * the asset URL resolver for the admin context, and stub interactive
 * behaviour for email forms and promo carousels inside the builder.
 *
 * All names are re-exported under their existing identifiers for
 * backward compatibility with tests and any existing call sites.
 */

import { resolveAssetUrl } from '../../shared/page-builder/helpers.js';
import { createRenderers } from '../../shared/page-builder/shared-renderers.js';
import { sanitizeAssetUrl } from '../../shared/page-builder/sanitize.js';

// Module-level series ID used for button link resolution in the preview.
// The builder shell calls setPreviewSeriesId(id) when a series is active.
let _previewSeriesId = '';

export function setPreviewSeriesId(id) {
  _previewSeriesId = String(id || '');
}

function resolvePreviewAssetUrl(path) {
  const raw = sanitizeAssetUrl(path || '');
  return raw ? resolveAssetUrl(raw) : '';
}

const _renderers = createRenderers({
  resolveImageUrl: resolvePreviewAssetUrl,
  getSeriesId: () => _previewSeriesId,
  showMountPlaceholders: true,
});

export const PREVIEW_RENDERERS = _renderers.MODULE_RENDERERS;
export const renderPreviewModule = _renderers.renderModule;
export const renderPreviewSection = _renderers.renderSection;
export const renderPreviewPage = _renderers.renderPage;

/**
 * Stub email form submissions in preview mode so they don't POST.
 */
export function initPreviewEmailForms(container) {
  container.querySelectorAll('[data-email-signup]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const status = form.parentElement.querySelector('.pb-email-status');
      if (status) status.textContent = 'Form works! (Preview mode - not submitted)';
    });
  });
}

/**
 * Initialize promo carousels in preview mode.
 */
export function initPreviewPromoCarousels(container) {
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
    let timer = null;

    function showSlide(index) {
      currentIndex = (index + itemCount) % itemCount;
      slides.forEach((s, i) => s.classList.toggle('active', i === currentIndex));
      indicators.forEach((ind, i) => ind.classList.toggle('active', i === currentIndex));
    }

    function startTimer() {
      if (autoRotate) {
        stopTimer();
        timer = setInterval(() => showSlide(currentIndex + 1), interval);
      }
    }

    function stopTimer() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    prevBtn?.addEventListener('click', () => {
      showSlide(currentIndex - 1);
      startTimer();
    });
    nextBtn?.addEventListener('click', () => {
      showSlide(currentIndex + 1);
      startTimer();
    });
    indicators.forEach((ind) => {
      ind.addEventListener('click', () => {
        showSlide(parseInt(ind.dataset.index, 10));
        startTimer();
      });
    });
    promo.addEventListener('mouseenter', stopTimer);
    promo.addEventListener('mouseleave', startTimer);
    startTimer();
  });
}

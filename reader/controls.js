import { CONFIG } from './config.js';
import { state, saveProgress } from './state.js';
import { el } from './dom.js';
import { render, isTwoPageMode } from './render.js';

/**
 * Navigate to the previous page(s)
 * In two-page mode, moves back by 2 pages; otherwise by 1 page
 */
export function prevPage() {
  if (state.isTransitioning) return;

  const step = isTwoPageMode() ? 2 : 1;
  const newIndex = Math.max(0, state.pageIndex - step);

  if (newIndex === state.pageIndex) return;

  animatePageChange('prev', () => {
    state.pageIndex = newIndex;
    render();
    saveProgress(state);
  });
}

/**
 * Navigate to the next page(s)
 * In two-page mode, moves forward by 2 pages; otherwise by 1 page
 * Shows end-of-chapter overlay when reaching the last page
 */
export function nextPage() {
  if (state.isTransitioning) return;

  const twoPageMode = isTwoPageMode();
  const total = state.pages.length;

  const rightIsLast = twoPageMode && state.pageIndex + 1 === total - 1;
  const isAtEnd = state.pageIndex >= total - 1;

  if (rightIsLast || isAtEnd) {
    showEndOfChapter();
    return;
  }

  let newIndex;
  if (twoPageMode) {
    newIndex = state.pageIndex + 2 >= total
      ? total - 1
      : state.pageIndex + 2;
  } else {
    newIndex = Math.min(total - 1, state.pageIndex + 1);
  }

  animatePageChange('next', () => {
    state.pageIndex = newIndex;
    render();
    saveProgress(state);
  });
}

export function restartChapter() {
  state.pageIndex = 0;
  render();
  saveProgress(state);
  hideEndOfChapter();
}

export function showEndOfChapter() {
  const overlay = document.getElementById('chapterEndOverlay');
  if (overlay) {
    overlay.classList.add('active');
  }
}

export function hideEndOfChapter() {
  const overlay = document.getElementById('chapterEndOverlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

/**
 * Animates page transitions with slide effects
 * @param {string} direction - Either 'next' or 'prev' to determine slide direction
 * @param {Function} onMid - Callback to execute at the midpoint of the animation
 */
function animatePageChange(direction, onMid) {
  if (state.isTransitioning) return;
  if (!el.stageWrap) {
    if (typeof onMid === 'function') onMid();
    return;
  }

  state.isTransitioning = true;
  const duration = CONFIG.ANIMATION_DURATION;

  el.stageWrap.classList.remove('slide-in-left', 'slide-in-right', 'slide-out-left', 'slide-out-right');
  void el.stageWrap.offsetWidth;

  const slideOut = direction === 'next' ? 'slide-out-left' : 'slide-out-right';
  el.stageWrap.classList.add(slideOut);

  if (el.flash) {
    setTimeout(() => {
      el.flash.style.opacity = '1';
    }, 80);
  }

  setTimeout(() => {
    if (typeof onMid === 'function') onMid();

    if (el.flash) {
      el.flash.style.transition = 'opacity 160ms linear';
      el.flash.style.opacity = '0';
    }

    el.stageWrap.classList.remove('slide-out-left', 'slide-out-right');

    if (direction === 'next') {
      el.stageWrap.style.transform = 'translateX(18px)';
      requestAnimationFrame(() => {
        el.stageWrap.classList.add('slide-in-left');
        el.stageWrap.style.transform = 'translateX(0)';
      });
    } else {
      el.stageWrap.style.transform = 'translateX(-18px)';
      requestAnimationFrame(() => {
        el.stageWrap.classList.add('slide-in-right');
        el.stageWrap.style.transform = 'translateX(0)';
      });
    }

    setTimeout(() => {
      el.stageWrap.classList.remove('slide-in-left', 'slide-in-right');
      el.stageWrap.style.transform = '';
      state.isTransitioning = false;
    }, duration);
  }, duration);
}

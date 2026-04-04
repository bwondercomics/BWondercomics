// Fullscreen toggles + auto-hiding controls.
import { CONFIG } from './config.js';
import { el } from './dom.js';
import { state } from './state.js';
import { clearOnPageFrame, fitHeightFullscreen, fitOnPageFrame } from './transform.js';

let hideTimer = null;
let mouseOverControls = false;

function isCoarsePointer() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

function getFullscreenHideDelay() {
  if (document.fullscreenElement && isCoarsePointer()) {
    return CONFIG.CONTROLS_HIDE_DELAY + 6000;
  }
  return CONFIG.CONTROLS_HIDE_DELAY;
}

export function showControlsBar() {
  // Keep topbar/controls visible, then auto-hide after a delay.
  if (el.topbar) el.topbar.classList.remove('hidden');
  if (el.controls) el.controls.classList.remove('hidden');

  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  if (document.fullscreenElement && !mouseOverControls) {
    hideTimer = setTimeout(() => {
      if (!mouseOverControls) {
        if (el.topbar) el.topbar.classList.add('hidden');
        if (el.controls) el.controls.classList.add('hidden');
      }
    }, getFullscreenHideDelay());
  }
}

export function hideControlsBar() {
  if (el.topbar) el.topbar.classList.add('hidden');
  if (el.controls) el.controls.classList.add('hidden');
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

export function toggleControlsBar() {
  const topHidden = !el.topbar || el.topbar.classList.contains('hidden');
  const controlsHidden = !el.controls || el.controls.classList.contains('hidden');
  const isHidden = topHidden && controlsHidden;
  if (isHidden) {
    showControlsBar();
  } else {
    hideControlsBar();
  }
}

export function onFullscreenChange() {
  // Sync UI when entering/exiting fullscreen and refit the viewport.
  if (document.fullscreenElement) {
    document.body.classList.add('fullscreen-active');
    if (el.fullscreenBtn) el.fullscreenBtn.textContent = 'EXIT';
    clearOnPageFrame();
    showControlsBar();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          fitHeightFullscreen();
        } catch (e) {
          console.warn('Fit failed on fullscreen enter:', e);
        }
      });
    });
  } else {
    document.body.classList.remove('fullscreen-active');
    if (el.fullscreenBtn) el.fullscreenBtn.textContent = 'FULL';
    if (el.topbar) el.topbar.classList.remove('hidden');
    if (el.controls) el.controls.classList.remove('hidden');

    state.fullscreenBaseScale = 1;
    if (el.stage && state.prevTransformOrigin !== null) {
      el.stage.style.transformOrigin = state.prevTransformOrigin;
      state.prevTransformOrigin = null;
    }

    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }

    fitOnPageFrame();
  }
}

export function toggleFullscreen() {
  // Request or exit fullscreen mode.
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
}

export function handleMouseEnterControls() {
  mouseOverControls = true;
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

export function handleMouseLeaveControls() {
  mouseOverControls = false;
  showControlsBar();
}

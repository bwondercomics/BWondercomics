import { CONFIG } from './config.js';
import { el } from './dom.js';
import { state } from './state.js';
import { fitHeightFullscreen } from './transform.js';

let hideTimer = null;
let mouseOverControls = false;

export function showControlsBar() {
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
    }, CONFIG.CONTROLS_HIDE_DELAY);
  }
}

export function onFullscreenChange() {
  if (document.fullscreenElement) {
    document.body.classList.add('fullscreen-active');
    if (el.fullscreenBtn) el.fullscreenBtn.textContent = 'EXIT';
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

    if (el.stage && state.prevTransformOrigin !== null) {
      el.stage.style.transformOrigin = state.prevTransformOrigin;
      state.prevTransformOrigin = null;
    }

    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }
}

export function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => { });
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

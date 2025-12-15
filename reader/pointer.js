import { CONFIG } from './config.js';
import { state } from './state.js';
import { el } from './dom.js';
import { applyTransform, fitToScreen } from './transform.js';
import { prevPage, nextPage } from './controls.js';

function getDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function initPointerHandlers() {
  if (el.stage) el.stage.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  if (el.stage) el.stage.addEventListener('wheel', onWheel, { passive: false });

  if (el.viewport) {
    el.viewport.addEventListener('mousemove', (e) => {
      updateEdgeZones(e.clientX, e.clientY);
    });

    el.viewport.addEventListener('pointerup', (e) => {
      if (!state.isDragging && state.pointers.size === 0) {
        const now = Date.now();
        if (state.lastTap && now - state.lastTap < 300) {
          state.lastTap = 0;
          fitToScreen();
        } else {
          state.lastTap = now;
        }
      }
    });
  }
}

function onPointerDown(e) {
  try {
    e.target.setPointerCapture(e.pointerId);
  } catch (err) { }

  state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const pointerCount = state.pointers.size;

  if (pointerCount === 1) {
    state.touchStart = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now()
    };
    state.dragStart = { x: e.clientX, y: e.clientY };
    state.panStart = { ...state.pan };
    state.isDragging = state.scale > 1.01;
  } else if (pointerCount === 2) {
    const points = Array.from(state.pointers.values());
    state.pinchDistance = getDistance(points[0], points[1]);
    state.pinchScale = state.scale;
    state.pinchCenter = {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2
    };
    state.panStart = { ...state.pan };
    state.isDragging = false;
  }

  if (document.fullscreenElement) {
    const nearEdge = e.clientY < 150 || e.clientY > window.innerHeight - 200;
    if (nearEdge && el.topbar && el.controls) {
      el.topbar.classList.remove('hidden');
      el.controls.classList.remove('hidden');
    }
  }
}

function onPointerMove(e) {
  if (!state.pointers.has(e.pointerId)) return;

  state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  updateEdgeZones(e.clientX, e.clientY);

  const pointerCount = state.pointers.size;

  if (pointerCount === 1) {
    if (state.isDragging) {
      const point = Array.from(state.pointers.values())[0];
      state.pan.x = state.panStart.x + (point.x - state.dragStart.x);
      state.pan.y = state.panStart.y + (point.y - state.dragStart.y);
      applyTransform();
    }
  } else if (pointerCount >= 2) {
    const points = Array.from(state.pointers.values());
    const newDist = getDistance(points[0], points[1]);

    if (state.pinchDistance && state.pinchScale != null) {
      const scale = state.pinchScale * (newDist / state.pinchDistance);
      const newScale = Math.max(CONFIG.ZOOM_MIN, Math.min(CONFIG.ZOOM_MAX, scale));

      const newCenter = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2
      };

      state.scale = newScale;
      state.pan.x = state.panStart.x + (newCenter.x - state.pinchCenter.x);
      state.pan.y = state.panStart.y + (newCenter.y - state.pinchCenter.y);
      applyTransform();
    }
  }
}

function onPointerUp(e) {
  try {
    e.target.releasePointerCapture(e.pointerId);
  } catch (err) { }

  state.pointers.delete(e.pointerId);

  if (state.pointers.size === 0) {
    const wasPinching = state.pinchDistance !== null;

    if (!wasPinching && state.touchStart) {
      const dx = e.clientX - state.touchStart.x;
      const dy = e.clientY - state.touchStart.y;
      const dt = Date.now() - state.touchStart.time;

      const isHorizontalSwipe = Math.abs(dx) > CONFIG.SWIPE_THRESHOLD;
      const isDominantlyHorizontal = Math.abs(dx) > Math.abs(dy);
      const isFastEnough = dt < CONFIG.SWIPE_TIMEOUT;
      const isNotZoomed = state.scale <= 1.01;

      if (isHorizontalSwipe && isDominantlyHorizontal && isFastEnough && isNotZoomed) {
        dx > 0 ? prevPage() : nextPage();
      }
    }

    state.isDragging = false;
    state.touchStart = null;
    state.pinchDistance = null;
    state.pinchCenter = null;
    state.pinchScale = state.scale;
  } else if (state.pointers.size === 1) {
    const remaining = Array.from(state.pointers.values())[0];
    state.dragStart = { x: remaining.x, y: remaining.y };
    state.panStart = { ...state.pan };
    state.isDragging = state.scale > 1.01;
  }
}

function onWheel(e) {
  if (e.ctrlKey) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    state.scale = Math.max(CONFIG.ZOOM_MIN, Math.min(CONFIG.ZOOM_MAX, state.scale + delta));
    applyTransform();
  }
}

export function updateEdgeZones(x, y) {
  if (!el.viewport) return;

  if (state.isDragging || state.pointers.size > 0) {
    if (el.edgeLeft) el.edgeLeft.classList.remove('active');
    if (el.edgeRight) el.edgeRight.classList.remove('active');
    if (el.viewport) el.viewport.style.cursor = '';
    return;
  }

  const rect = el.viewport.getBoundingClientRect();
  const relX = x - rect.left;
  const pct = relX / rect.width;

  if (pct < CONFIG.EDGE_ZONE_THRESHOLD) {
    if (el.edgeLeft) el.edgeLeft.classList.add('active');
    if (el.edgeRight) el.edgeRight.classList.remove('active');
    if (el.viewport) el.viewport.style.cursor = 'pointer';
  } else if (pct > 1 - CONFIG.EDGE_ZONE_THRESHOLD) {
    if (el.edgeRight) el.edgeRight.classList.add('active');
    if (el.edgeLeft) el.edgeLeft.classList.remove('active');
    if (el.viewport) el.viewport.style.cursor = 'pointer';
  } else {
    if (el.edgeLeft) el.edgeLeft.classList.remove('active');
    if (el.edgeRight) el.edgeRight.classList.remove('active');
    if (el.viewport) el.viewport.style.cursor = '';
  }
}

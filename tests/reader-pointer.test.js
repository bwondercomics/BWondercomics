import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../reader/transform.js', () => ({
  applyTransform: vi.fn(),
  fitToScreen: vi.fn(),
}));

vi.mock('../reader/fullscreen.js', () => ({
  toggleControlsBar: vi.fn(),
}));

vi.mock('../reader/controls.js', () => ({
  prevPage: vi.fn(),
  nextPage: vi.fn(),
}));

import { CONFIG } from '../reader/config.js';
import { el } from '../reader/dom.js';
import { initPointerHandlers, updateEdgeZones } from '../reader/pointer.js';
import { state } from '../reader/state.js';
import { applyTransform, fitToScreen } from '../reader/transform.js';
import { toggleControlsBar } from '../reader/fullscreen.js';
import { nextPage } from '../reader/controls.js';
import { createPointerEvent, setFullscreenElement } from './helpers/reader-fixture.js';

describe('reader pointer interactions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    el.stage = document.createElement('div');
    el.viewport = document.createElement('div');
    el.edgeLeft = document.createElement('div');
    el.edgeRight = document.createElement('div');
    el.topbar = document.createElement('div');
    el.controls = document.createElement('div');
    document.body.append(el.stage, el.viewport, el.edgeLeft, el.edgeRight, el.topbar, el.controls);
    el.viewport.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800 });
    applyTransform.mockClear();
    fitToScreen.mockClear();
    toggleControlsBar.mockClear();
    nextPage.mockClear();
    state.currentEntry = 'Issue 10';
    state.pages = ['1.png', '2.png', '3.png'];
    state.pageIndex = 0;
    state.scale = 1;
    state.pan = { x: 0, y: 0 };
    state.panStart = null;
    state.dragStart = null;
    state.touchStart = null;
    state.pinchDistance = null;
    state.pinchCenter = null;
    state.pinchScale = 1;
    state.lastTap = 0;
    state.isDragging = false;
    state.pointers.clear();
    setFullscreenElement(null);
  });

  it('highlights edge zones based on viewport position', () => {
    updateEdgeZones(20, 100);
    expect(el.edgeLeft.classList.contains('active')).toBe(true);
    expect(el.viewport.style.cursor).toBe('pointer');

    updateEdgeZones(980, 100);
    expect(el.edgeRight.classList.contains('active')).toBe(true);
    expect(el.edgeLeft.classList.contains('active')).toBe(false);
  });

  it('double taps to fit the current spread', () => {
    initPointerHandlers();

    el.viewport.dispatchEvent(createPointerEvent('pointerup', { pointerType: 'mouse' }));
    vi.advanceTimersByTime(100);
    el.viewport.dispatchEvent(createPointerEvent('pointerup', { pointerType: 'mouse' }));

    expect(fitToScreen).toHaveBeenCalledTimes(1);
  });

  it('swipes horizontally to navigate when not zoomed', () => {
    initPointerHandlers();

    el.stage.dispatchEvent(
      createPointerEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 300,
        clientY: 120,
      })
    );
    window.dispatchEvent(
      createPointerEvent('pointerup', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 180,
        clientY: 126,
      })
    );

    expect(nextPage).toHaveBeenCalledTimes(1);
  });

  it('toggles fullscreen controls on a fullscreen touch tap', () => {
    setFullscreenElement(document.documentElement);
    initPointerHandlers();

    el.stage.dispatchEvent(
      createPointerEvent('pointerdown', {
        pointerId: 2,
        pointerType: 'touch',
        clientX: 150,
        clientY: 100,
      })
    );
    window.dispatchEvent(
      createPointerEvent('pointerup', {
        pointerId: 2,
        pointerType: 'touch',
        clientX: 156,
        clientY: 104,
      })
    );

    expect(toggleControlsBar).toHaveBeenCalledTimes(1);
  });

  it('drags the spread when zoomed in', () => {
    initPointerHandlers();
    state.scale = 2;

    el.stage.dispatchEvent(
      createPointerEvent('pointerdown', {
        pointerId: 3,
        pointerType: 'mouse',
        clientX: 40,
        clientY: 50,
      })
    );
    window.dispatchEvent(
      createPointerEvent('pointermove', {
        pointerId: 3,
        pointerType: 'mouse',
        clientX: 120,
        clientY: 140,
      })
    );

    expect(state.pan).toEqual({ x: 80, y: 90 });
    expect(applyTransform).toHaveBeenCalledTimes(1);
  });
});

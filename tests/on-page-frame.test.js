import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../reader/analytics.js', () => ({
  markEntryComplete: vi.fn(),
  trackVisiblePages: vi.fn()
}));

import { initElements, el } from '../reader/dom.js';
import { render } from '../reader/render.js';
import { fitOnPageFrame } from '../reader/transform.js';
import { state } from '../reader/state.js';

function setClientSize(node, width, height) {
  Object.defineProperty(node, 'clientWidth', {
    configurable: true,
    value: width
  });
  Object.defineProperty(node, 'clientHeight', {
    configurable: true,
    value: height
  });
}

function setRect(node, width, height) {
  node.getBoundingClientRect = () => ({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON() {
      return {};
    }
  });
}

describe('on-page reader frame sizing', () => {
  let stackedLayout = false;

  beforeEach(() => {
    stackedLayout = false;
    window.matchMedia = vi.fn((query) => ({
      matches: query === '(max-aspect-ratio: 7/5)' ? stackedLayout : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));

    document.body.className = '';
    document.body.innerHTML = `
      <div id="mainContent" class="viewer-content-wrapper">
        <section id="viewport" class="viewport">
          <div id="stageWrap">
            <div id="stage" style="gap: 8px;">
              <div id="leftPage" class="page" style="border: 3px solid transparent;">
                <img id="leftImg" alt="" />
              </div>
              <div id="rightPage" class="page" style="display: none; border: 3px solid transparent;">
                <img id="rightImg" alt="" />
              </div>
            </div>
          </div>
        </section>
        <div id="controls" class="controls" style="margin-top: 12px; margin-bottom: 16px;"></div>
      </div>
    `;

    initElements();
    setClientSize(el.mainContent, 900, 700);
    setRect(el.controls, 900, 80);
    setRect(el.leftPage, 300, 450);
    setRect(el.rightPage, 300, 450);

    state.currentEntry = 'Entry 1';
    state.pages = [];
    state.pageIndex = 0;
    state.entryMeta = null;
    state.scale = 1;
    state.pan = { x: 0, y: 0 };
    state.imageCache = new Map();
    state.pageMetrics = new Map();
    state.lastOnPageFrame = null;

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null
    });

    window.innerWidth = 800;
    window.innerHeight = 1000;
  });

  afterEach(() => {
    document.body.className = '';
  });

  it('updates the viewport frame when render navigates between page ratios', () => {
    state.pages = ['page-portrait.png', 'page-landscape.png'];
    state.pageMetrics = new Map([
      ['page-portrait.png', { width: 600, height: 900 }],
      ['page-landscape.png', { width: 1600, height: 900 }]
    ]);

    render();
    const firstWidth = parseFloat(el.viewport.style.getPropertyValue('--on-page-frame-width'));
    const firstHeight = parseFloat(el.viewport.style.getPropertyValue('--on-page-frame-height'));

    state.pageIndex = 1;
    render();
    const secondWidth = parseFloat(el.viewport.style.getPropertyValue('--on-page-frame-width'));
    const secondHeight = parseFloat(el.viewport.style.getPropertyValue('--on-page-frame-height'));

    expect(el.viewport.classList.contains('dynamic-frame')).toBe(true);
    expect(secondWidth).toBeGreaterThan(firstWidth);
    expect(secondHeight).toBeLessThan(firstHeight);
  });

  it('ignores on-page sizing while fullscreen is active', () => {
    state.pages = ['page-portrait.png'];
    state.pageMetrics = new Map([
      ['page-portrait.png', { width: 600, height: 900 }]
    ]);

    expect(fitOnPageFrame()).not.toBeNull();
    expect(el.viewport.classList.contains('dynamic-frame')).toBe(true);

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: {}
    });

    expect(fitOnPageFrame()).toBeNull();
    expect(el.viewport.classList.contains('dynamic-frame')).toBe(false);
  });

  it('keeps the responsive stacked layout on the existing full-width path', () => {
    state.pages = ['page-portrait.png'];
    state.pageMetrics = new Map([
      ['page-portrait.png', { width: 600, height: 900 }]
    ]);
    stackedLayout = true;

    expect(fitOnPageFrame()).toBeNull();
    expect(el.viewport.classList.contains('dynamic-frame')).toBe(false);
    expect(el.viewport.style.getPropertyValue('--on-page-frame-width')).toBe('');
  });
});

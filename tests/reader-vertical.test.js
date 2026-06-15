/**
 * Tests for vertical (Webtoon-style) reader display mode.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Analytics is mocked so we can assert page-view / completion side effects
// without the umami/live-tracking plumbing.
const markEntryComplete = vi.fn();
const trackVisiblePages = vi.fn();
vi.mock('../reader/analytics.js', () => ({
  markEntryComplete,
  trackVisiblePages,
  // setActiveEntry/resetEntryCompletion are referenced by other modules in the
  // graph; provide no-ops so imports resolve.
  setActiveEntry: vi.fn(),
  resetEntryCompletion: vi.fn(),
  trackEntryExit: vi.fn(),
}));

// Transform is paged-only; stub it so the paged render branch stays cheap.
vi.mock('../reader/transform.js', () => ({
  clearOnPageFrame: vi.fn(),
  fitOnPageFrame: vi.fn(),
}));

let state;
let saveProgress;
let loadProgress;
let render;
let renderVertical;
let teardownVerticalMode;
let setVerticalScrollRestore;
let updateUI;
let initElements;
let el;
let isVerticalMode;

let observerCallback = null;
let observerInstances = [];

function setVerticalDom() {
  document.body.innerHTML = `
    <select id="entry">
      <option value="entry-1">Entry 1</option>
      <option value="entry-2">Entry 2</option>
    </select>
    <section class="viewport" id="viewport">
      <div class="stageWrap" id="stageWrap">
        <div class="stage" id="stage">
          <div class="page" id="leftPage"><img id="leftImg" /></div>
          <div class="page" id="rightPage"><img id="rightImg" /></div>
        </div>
      </div>
    </section>
    <div class="controls" id="controls">
      <button id="prevBtn"></button>
      <button id="nextBtn"></button>
      <span id="pageIndicator"></span>
      <div id="progressFill"></div>
    </div>
  `;
  initElements();
}

function defineGeometry(node, { offsetTop, offsetHeight }) {
  Object.defineProperty(node, 'offsetTop', { value: offsetTop, configurable: true });
  Object.defineProperty(node, 'offsetHeight', { value: offsetHeight, configurable: true });
}

function flushRestoreFrames() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

beforeEach(async () => {
  vi.clearAllMocks();
  observerCallback = null;

  // jsdom lacks IntersectionObserver; capture the callback so tests can drive it.
  observerInstances = [];
  global.IntersectionObserver = class {
    constructor(cb) {
      observerCallback = cb;
      this.disconnected = false;
      observerInstances.push(this);
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
  };
  if (typeof global.requestAnimationFrame !== 'function') {
    global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
    global.cancelAnimationFrame = (id) => clearTimeout(id);
  }

  const stateMod = await import('../reader/state.js');
  state = stateMod.state;
  saveProgress = stateMod.saveProgress;
  loadProgress = stateMod.loadProgress;
  const renderMod = await import('../reader/render.js');
  render = renderMod.render;
  updateUI = renderMod.updateUI;
  const verticalMod = await import('../reader/vertical.js');
  renderVertical = verticalMod.renderVertical;
  teardownVerticalMode = verticalMod.teardownVerticalMode;
  setVerticalScrollRestore = verticalMod.setVerticalScrollRestore;
  const domMod = await import('../reader/dom.js');
  initElements = domMod.initElements;
  el = domMod.el;
  ({ isVerticalMode } = await import('../reader/display-mode.js'));

  setVerticalDom();
  document.body.dataset.readerDisplayMode = 'vertical-scroll';
  document.body.dataset.readerShell = 'active';
  state.currentEntry = 'entry-1';
  state.pages = ['p1.png', 'p2.png', 'p3.png'];
  state.pageIndex = 0;
  localStorage.clear();
});

afterEach(() => {
  teardownVerticalMode();
  document.body.innerHTML = '';
  delete document.body.dataset.readerDisplayMode;
});

describe('vertical render', () => {
  it('mounts every page in document order and hides the paged stage', () => {
    renderVertical();
    const strip = document.getElementById('verticalStrip');
    expect(strip).not.toBeNull();
    const imgs = strip.querySelectorAll('img');
    expect(imgs.length).toBe(3);
    expect([...imgs].map((img) => img.getAttribute('src'))).toEqual(['p1.png', 'p2.png', 'p3.png']);
    expect([...imgs].every((img) => img.getAttribute('loading') === 'lazy')).toBe(true);
    expect(el.stageWrap.style.display).toBe('none');
  });

  it('routes render() through the vertical branch in vertical mode', () => {
    render();
    expect(document.getElementById('verticalStrip')).not.toBeNull();
  });

  it('tears down the strip and restores the paged stage when leaving vertical mode', () => {
    renderVertical();
    expect(document.getElementById('verticalStrip')).not.toBeNull();
    teardownVerticalMode();
    expect(document.getElementById('verticalStrip')).toBeNull();
    expect(el.stageWrap.style.display).toBe('');
  });

  it('disconnects the prior observer on re-render so observers do not stack', () => {
    renderVertical();
    expect(observerInstances).toHaveLength(1);
    renderVertical();
    expect(observerInstances).toHaveLength(2);
    expect(observerInstances[0].disconnected).toBe(true);
    expect(observerInstances[1].disconnected).toBe(false);

    teardownVerticalMode();
    expect(observerInstances[1].disconnected).toBe(true);
  });

  it('survives a vertical -> paged -> vertical cycle without stale observers', () => {
    render();
    expect(document.getElementById('verticalStrip')).not.toBeNull();
    document.body.dataset.readerDisplayMode = 'paged';
    render();
    expect(document.getElementById('verticalStrip')).toBeNull();
    expect(observerInstances.every((obs) => obs.disconnected)).toBe(true);
    document.body.dataset.readerDisplayMode = 'vertical-scroll';
    render();
    expect(document.getElementById('verticalStrip')).not.toBeNull();
  });
});

describe('scroll-driven page tracking', () => {
  it('updates state.pageIndex from the scroll center and completes at the last page', () => {
    renderVertical();
    const strip = document.getElementById('verticalStrip');
    const pages = strip.children;
    [...pages].forEach((page, index) => {
      defineGeometry(page, { offsetTop: index * 1000, offsetHeight: 1000 });
    });
    Object.defineProperty(el.viewport, 'clientHeight', { value: 800, configurable: true });

    // Scroll so the second page's center is in view.
    el.viewport.scrollTop = 1100;
    observerCallback([]);
    expect(state.pageIndex).toBe(1);
    expect(trackVisiblePages).toHaveBeenCalled();
    expect(markEntryComplete).not.toHaveBeenCalled();

    // Scroll to the last page → completion.
    el.viewport.scrollTop = 2200;
    observerCallback([]);
    expect(state.pageIndex).toBe(2);
    expect(markEntryComplete).toHaveBeenCalled();
  });
});

describe('updateUI in vertical mode', () => {
  it('disables prev/next based on the entry selector position', () => {
    el.entry.selectedIndex = 0;
    updateUI();
    expect(el.prevBtn.disabled).toBe(true);
    expect(el.nextBtn.disabled).toBe(false);

    el.entry.selectedIndex = 1;
    updateUI();
    expect(el.prevBtn.disabled).toBe(false);
    expect(el.nextBtn.disabled).toBe(true);
  });
});

describe('progress persistence', () => {
  it('round-trips scrollRatio through save/load in vertical mode', () => {
    Object.defineProperty(el.viewport, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(el.viewport, 'clientHeight', { value: 1000, configurable: true });
    el.viewport.scrollTop = 500; // 500 / (2000 - 1000) = 0.5

    saveProgress(state);
    const saved = loadProgress();
    expect(saved.chapter).toBe('entry-1');
    expect(saved.scrollRatio).toBeCloseTo(0.5, 5);
  });

  it('restores the saved scroll position when rebuilding the strip', () => {
    Object.defineProperty(el.viewport, 'scrollHeight', { value: 3000, configurable: true });
    Object.defineProperty(el.viewport, 'clientHeight', { value: 1000, configurable: true });
    setVerticalScrollRestore({ chapter: 'entry-1', page: 0, scrollRatio: 0.5 });
    renderVertical();
    // Restore is applied via rAF after build; flush it.
    return flushRestoreFrames().then(() => {
      // 0.5 * (3000 - 1000) = 1000
      expect(el.viewport.scrollTop).toBe(1000);
    });
  });

  it('cancels pending scroll restore after real user scroll so late image loads do not snap back', async () => {
    Object.defineProperty(el.viewport, 'scrollHeight', { value: 3000, configurable: true });
    Object.defineProperty(el.viewport, 'clientHeight', { value: 1000, configurable: true });
    setVerticalScrollRestore({ chapter: 'entry-1', page: 0, scrollRatio: 0.5 });
    renderVertical();
    await flushRestoreFrames();
    expect(el.viewport.scrollTop).toBe(1000);

    el.viewport.scrollTop = 240;
    el.viewport.dispatchEvent(new Event('scroll'));
    Object.defineProperty(el.viewport, 'scrollHeight', { value: 5000, configurable: true });
    document.querySelector('#verticalStrip img')?.dispatchEvent(new Event('load'));

    expect(el.viewport.scrollTop).toBe(240);
  });

  it('starts a later entry at the top after a restored entry unless that entry has its own restore', async () => {
    Object.defineProperty(el.viewport, 'scrollHeight', { value: 3000, configurable: true });
    Object.defineProperty(el.viewport, 'clientHeight', { value: 1000, configurable: true });
    setVerticalScrollRestore({ chapter: 'entry-1', page: 0, scrollRatio: 0.5 });
    renderVertical();
    await flushRestoreFrames();
    expect(el.viewport.scrollTop).toBe(1000);

    state.currentEntry = 'entry-2';
    state.pages = ['q1.png', 'q2.png'];
    state.pageIndex = 0;
    renderVertical();
    await flushRestoreFrames();

    expect(el.viewport.scrollTop).toBe(0);
  });

  it('settles restore state on image errors so failed images cannot keep a stale restore pending', async () => {
    Object.defineProperty(el.viewport, 'scrollHeight', { value: 3000, configurable: true });
    Object.defineProperty(el.viewport, 'clientHeight', { value: 1000, configurable: true });
    setVerticalScrollRestore({ chapter: 'entry-1', page: 0, scrollRatio: 0.5 });
    renderVertical();
    await flushRestoreFrames();

    document.querySelectorAll('#verticalStrip img').forEach((img) => {
      img.dispatchEvent(new Event('error'));
    });
    el.viewport.scrollTop = 333;
    Object.defineProperty(el.viewport, 'scrollHeight', { value: 5000, configurable: true });
    document.querySelector('#verticalStrip img')?.dispatchEvent(new Event('load'));

    expect(el.viewport.scrollTop).toBe(333);
  });
});

describe('paged mode is unaffected', () => {
  it('does not build a vertical strip in paged mode', () => {
    document.body.dataset.readerDisplayMode = 'paged';
    expect(isVerticalMode()).toBe(false);
    render();
    expect(document.getElementById('verticalStrip')).toBeNull();
    expect(el.stageWrap.style.display).toBe('');
  });
});

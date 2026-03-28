// Centralized DOM cache for reader elements.
export const el = {};

export function initElements() {
  // Cache DOM nodes once to avoid repeated lookups.
  el.entry = document.getElementById('entry');
  el.stageWrap = document.getElementById('stageWrap');
  el.stage = document.getElementById('stage');
  el.viewport = document.getElementById('viewport');
  el.mainContent = document.getElementById('mainContent');
  el.topbar = document.getElementById('topbar');
  el.statusPanel = document.getElementById('statusPanel');
  el.statusText = document.getElementById('statusText');
  el.statusCursor = document.getElementById('statusCursor');
  el.controls = document.getElementById('controls');
  el.leftPage = document.getElementById('leftPage');
  el.rightPage = document.getElementById('rightPage');
  el.leftImg = document.getElementById('leftImg');
  el.rightImg = document.getElementById('rightImg');
  el.leftSpinner = document.getElementById('leftSpinner');
  el.rightSpinner = document.getElementById('rightSpinner');
  el.indicator = document.getElementById('pageIndicator');
  el.progressFill = document.getElementById('progressFill');
  el.prevBtn = document.getElementById('prevBtn');
  el.nextBtn = document.getElementById('nextBtn');
  el.zoomIn = document.getElementById('zoomIn');
  el.zoomOut = document.getElementById('zoomOut');
  el.fitBtn = document.getElementById('fitBtn');
  el.fullscreenBtn = document.getElementById('fullscreenBtn');
  el.flash = document.getElementById('flashOverlay');
  el.edgeLeft = document.getElementById('edgeLeft');
  el.edgeRight = document.getElementById('edgeRight');
  el.edgeLeftBtn = document.getElementById('edgeLeftBtn');
  el.edgeRightBtn = document.getElementById('edgeRightBtn');
  el.subtitle = document.getElementById('subtitle');
}

/**
 * Lightweight hyperscript helper for creating DOM elements.
 * @param {string} tag - Tag name (e.g. 'div')
 * @param {object} [props] - Attributes/properties (e.g. { className: 'foo', onClick: ... })
 * @param {Array|string|Node} [children] - Child nodes or text
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, val] of Object.entries(props)) {
      if (key === 'className' || key === 'class') {
        el.className = val;
      } else if (key === 'style' && typeof val === 'object') {
        Object.assign(el.style, val);
      } else if (key.startsWith('on') && typeof val === 'function') {
        const eventName = key.substring(2).toLowerCase();
        el.addEventListener(eventName, val);
      } else if (key === 'dataset' && typeof val === 'object') {
        Object.assign(el.dataset, val);
      } else if (val === true) {
        el.setAttribute(key, '');
      } else if (val !== false && val != null) {
        el.setAttribute(key, val);
      }
    }
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const kid of kids) {
    if (typeof kid === 'string' || typeof kid === 'number') {
      el.textContent = String(kid); // Safer than appendChild text node for simple cases
    } else if (kid instanceof Node) {
      el.appendChild(kid);
    }
  }
  return el;
}

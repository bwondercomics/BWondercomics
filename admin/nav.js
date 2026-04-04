import { el } from './dom.js';
import { NAV_COLLAPSED_KEY, NAV_LAYOUT_KEY, SCANLINES_KEY } from './state.js';

const SCANLINES_CLASS = 'admin-scanlines-off';

// Sidebar layout + collapsed state live in localStorage for fast UI recall.
function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures (private mode / blocked storage).
  }
}

function normalizeNavLayout(raw) {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  if (value === 'right' || value === 'top') return value;
  return 'left';
}

function applyNavLayout(layout) {
  const normalized = normalizeNavLayout(layout);
  if (!el.adminDashboard) return normalized;
  el.adminDashboard.classList.remove(
    'admin-layout--left',
    'admin-layout--right',
    'admin-layout--top'
  );
  el.adminDashboard.classList.add(`admin-layout--${normalized}`);
  if (el.navLayoutSelect) el.navLayoutSelect.value = normalized;
  return normalized;
}

function applyScanlines(enabled) {
  const isEnabled = Boolean(enabled);
  if (document.body) {
    document.body.classList.toggle(SCANLINES_CLASS, !isEnabled);
  }
  if (el.scanlinesToggle) el.scanlinesToggle.checked = isEnabled;
  return isEnabled;
}

function setScanlinesEnabled(enabled) {
  const isEnabled = applyScanlines(enabled);
  writeStorage(SCANLINES_KEY, isEnabled ? 'true' : 'false');
  return isEnabled;
}

function setNavCollapsed(collapsed) {
  if (!el.adminDashboard) return;
  const shouldCollapse = Boolean(collapsed);
  el.adminDashboard.classList.toggle('nav-collapsed', shouldCollapse);
  if (el.adminNavToggle) {
    el.adminNavToggle.setAttribute('aria-expanded', String(!shouldCollapse));
  }
  if (el.adminSettingsPanel && shouldCollapse) {
    el.adminSettingsPanel.hidden = true;
  }
  if (el.innerNetPanel && shouldCollapse) {
    el.innerNetPanel.hidden = true;
  }
  writeStorage(NAV_COLLAPSED_KEY, shouldCollapse ? 'true' : 'false');
}

function toggleNavCollapsed() {
  if (!el.adminDashboard) return;
  const isCollapsed = el.adminDashboard.classList.contains('nav-collapsed');
  setNavCollapsed(!isCollapsed);
}

function toggleSettingsPanel() {
  if (!el.adminSettingsPanel) return;
  if (el.adminSettingsPanel.hasAttribute('hidden')) {
    el.adminSettingsPanel.removeAttribute('hidden');
  } else {
    el.adminSettingsPanel.setAttribute('hidden', '');
  }
}

function initNavPreferences() {
  const storedLayout = normalizeNavLayout(readStorage(NAV_LAYOUT_KEY));
  applyNavLayout(storedLayout);
  if (el.navLayoutSelect) el.navLayoutSelect.value = storedLayout;
  const collapsed = readStorage(NAV_COLLAPSED_KEY) === 'true';
  setNavCollapsed(collapsed);
  const scanlinesEnabled = readStorage(SCANLINES_KEY) !== 'false';
  applyScanlines(scanlinesEnabled);
}

export {
  applyNavLayout,
  initNavPreferences,
  normalizeNavLayout,
  readStorage,
  setScanlinesEnabled,
  setNavCollapsed,
  toggleNavCollapsed,
  toggleSettingsPanel,
  writeStorage,
};

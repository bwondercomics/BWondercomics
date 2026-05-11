export const EDITOR_MODE_KEY = 'pb-editor-mode';
export const SIDEBAR_MODE_KEY = 'pb-sidebar-mode';
export const WIDE_EDITOR_BREAKPOINT = 1440;
export const STACK_EDITOR_BREAKPOINT = 1100;
export const SIDEBAR_EXPANDED_WIDTH = 200;
export const SIDEBAR_COLLAPSED_WIDTH = 72;

export function getViewportEditorBand() {
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  if (width >= WIDE_EDITOR_BREAKPOINT) return 'wide';
  if (width >= STACK_EDITOR_BREAKPOINT) return 'medium';
  return 'stacked';
}

export function readStoredEditorMode() {
  const saved = localStorage.getItem(EDITOR_MODE_KEY);
  if (saved === 'collapsed' || saved === 'docked' || saved === 'overlay') {
    return saved;
  }
  return null;
}

export function readStoredSidebarMode() {
  const saved = localStorage.getItem(SIDEBAR_MODE_KEY);
  if (saved === 'collapsed' || saved === 'expanded') {
    return saved;
  }
  return null;
}

export function getEffectiveEditorMode(storedMode = readStoredEditorMode()) {
  const band = getViewportEditorBand();
  if (!storedMode) {
    return band === 'wide' ? 'docked' : 'overlay';
  }
  if (band === 'wide') {
    return storedMode === 'docked' || storedMode === 'overlay' ? 'docked' : 'collapsed';
  }
  return storedMode === 'collapsed' ? 'collapsed' : 'overlay';
}

export function getEffectiveSidebarMode(storedMode = readStoredSidebarMode()) {
  const band = getViewportEditorBand();
  if (band === 'stacked') {
    return 'expanded';
  }
  return storedMode === 'collapsed' ? 'collapsed' : 'expanded';
}

export function getSidebarWidth(sidebarMode) {
  return sidebarMode === 'collapsed'
    ? `${SIDEBAR_COLLAPSED_WIDTH}px`
    : `${SIDEBAR_EXPANDED_WIDTH}px`;
}

export function getEditorWidth(
  mode,
  sidebarMode = getEffectiveSidebarMode(),
  navCollapsed = false
) {
  const baseWidth = mode === 'docked' ? (navCollapsed ? 620 : 520) : navCollapsed ? 420 : 320;
  const sidebarBonus =
    sidebarMode === 'collapsed' ? SIDEBAR_EXPANDED_WIDTH - SIDEBAR_COLLAPSED_WIDTH : 0;
  return `${baseWidth + sidebarBonus}px`;
}

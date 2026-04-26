import { appearanceToInlineStyle } from '../admin/page-builder/appearance-utils.js';
import {
  resolveHeaderNavItemAppearance,
  resolveHeaderShellScrolledAppearance,
  resolveHeaderShellTopAppearance,
  resolvePageHeaderState,
} from '../admin/page-builder/header-config.js';
import {
  normalizeHeaderNavItems,
  resolveLinkTargetHref,
  shouldOpenLinkInNewTab,
} from '../admin/page-builder/link-utils.js';

const BLOCK_SELECTORS = {
  brand: '.brand',
  patron: '#patronWelcome',
  status: '#statusPanel',
  entryControls: '.entry-controls',
  nav: '.nav-links',
};

const CONTROLLED_TOPBAR_STYLE_PROPS = [
  'background',
  'color',
  'border',
  'border-width',
  'border-style',
  'border-color',
  'border-radius',
];

let activeAppearanceTopbar = null;
let activeTopAppearance = null;
let activeScrolledAppearance = null;
let headerAppearanceScrollListenerInstalled = false;

function clearControlledTopbarStyles(topbar) {
  if (!topbar) return;
  CONTROLLED_TOPBAR_STYLE_PROPS.forEach((prop) => {
    topbar.style.removeProperty(prop);
  });
  if (!topbar.getAttribute('style')?.trim()) {
    topbar.removeAttribute('style');
  }
}

function applyControlledTopbarStyle(topbar, inlineStyle) {
  clearControlledTopbarStyles(topbar);
  if (!topbar || !inlineStyle) return;
  inlineStyle
    .split(';')
    .map((token) => token.trim())
    .filter(Boolean)
    .forEach((token) => {
      const separatorIndex = token.indexOf(':');
      if (separatorIndex === -1) return;
      const property = token.slice(0, separatorIndex).trim();
      const value = token.slice(separatorIndex + 1).trim();
      if (!property || !value) return;
      topbar.style.setProperty(property, value);
    });
}

function getCurrentScrollOffset() {
  return Math.max(
    window.scrollY || 0,
    window.pageYOffset || 0,
    document.documentElement?.scrollTop || 0,
    document.body?.scrollTop || 0
  );
}

function syncTopbarAppearanceState() {
  if (!activeAppearanceTopbar) return;

  const hasAppearance = !!(activeTopAppearance || activeScrolledAppearance);
  if (!hasAppearance) {
    activeAppearanceTopbar.classList.remove('topbar--scrolled');
    activeAppearanceTopbar.removeAttribute('data-header-appearance-state');
    clearControlledTopbarStyles(activeAppearanceTopbar);
    return;
  }

  const isScrolled = getCurrentScrollOffset() > 0;
  const resolvedAppearance = isScrolled ? activeScrolledAppearance : activeTopAppearance;
  applyControlledTopbarStyle(activeAppearanceTopbar, appearanceToInlineStyle(resolvedAppearance));
  activeAppearanceTopbar.dataset.headerAppearanceState = isScrolled ? 'scrolled' : 'top';
  activeAppearanceTopbar.classList.toggle('topbar--scrolled', isScrolled);
}

function ensureHeaderAppearanceScrollListener() {
  if (headerAppearanceScrollListenerInstalled) return;
  window.addEventListener('scroll', syncTopbarAppearanceState, { passive: true });
  headerAppearanceScrollListenerInstalled = true;
}

function ensureHeaderScaffold() {
  const topbar = document.getElementById('topbar');
  if (!topbar) return null;

  let layout = topbar.querySelector('.topbar-layout');
  if (!layout) {
    layout = document.createElement('div');
    layout.className = 'topbar-layout';
    topbar.appendChild(layout);
  }

  let stash = topbar.querySelector('.topbar-stash');
  if (!stash) {
    stash = document.createElement('div');
    stash.className = 'topbar-stash';
    stash.hidden = true;
    topbar.appendChild(stash);
  }

  const regions = {};
  ['left', 'center', 'right'].forEach((region) => {
    let node = layout.querySelector(`.topbar-region[data-region="${region}"]`);
    if (!node) {
      node = document.createElement('div');
      node.className = 'topbar-region';
      node.dataset.region = region;
      layout.appendChild(node);
    }
    regions[region] = node;
  });

  const headerActions = topbar.querySelector('.header-actions');
  if (headerActions && !headerActions.children.length) {
    headerActions.remove();
  }

  return { topbar, layout, stash, regions };
}

function collectHeaderBlocks(topbar) {
  return Object.fromEntries(
    Object.entries(BLOCK_SELECTORS).map(([blockId, selector]) => [
      blockId,
      topbar.querySelector(selector),
    ])
  );
}

function renderNavItems(navEl, headerConfig, seriesId) {
  if (!navEl) return;
  const adminLink = navEl.querySelector('#adminNavLink');
  navEl.querySelectorAll('.nav-link').forEach((link) => {
    if (link !== adminLink) {
      link.remove();
    }
  });

  (headerConfig.nav?.items || []).forEach((item) => {
    if (item.enabled === false) return;
    const link = document.createElement('a');
    const variant = item.style === 'secondary' ? 'secondary' : 'primary';
    link.className = `nav-link nav-link--${variant}`;
    link.textContent = item.label || 'Link';
    link.href = resolveLinkTargetHref(item.link, { seriesId });
    if (shouldOpenLinkInNewTab(item.link)) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    const inlineStyle = appearanceToInlineStyle(resolveHeaderNavItemAppearance(headerConfig, item));
    if (inlineStyle) {
      link.setAttribute('style', inlineStyle);
    }
    navEl.insertBefore(link, adminLink || null);
  });
}

export function applySharedHeaderLayout(pageConfig = null, options = {}) {
  const scaffold = ensureHeaderScaffold();
  if (!scaffold) return;

  const seriesId = options.seriesId || 'battle-bros';
  const currentPage = options.page || null;
  const headerState =
    options.headerState ||
    resolvePageHeaderState({
      page: currentPage,
      pageConfig,
      normalizeNavItems: normalizeHeaderNavItems,
    });
  const headerConfig = headerState.header;
  const blocks = collectHeaderBlocks(scaffold.topbar);
  activeAppearanceTopbar = scaffold.topbar;
  activeTopAppearance = resolveHeaderShellTopAppearance(headerConfig);
  activeScrolledAppearance = resolveHeaderShellScrolledAppearance(headerConfig);
  ensureHeaderAppearanceScrollListener();
  syncTopbarAppearanceState();

  Object.values(blocks).forEach((node) => {
    if (!node) return;
    node.style.display = 'none';
    scaffold.stash.appendChild(node);
  });

  renderNavItems(blocks.nav, headerConfig, seriesId);

  ['left', 'center', 'right'].forEach((region) => {
    const regionNode = scaffold.regions[region];
    regionNode.innerHTML = '';
    (headerConfig.regions?.[region] || []).forEach((blockId) => {
      const blockEl = blocks[blockId];
      const enabled = headerConfig.blocks?.[blockId]?.enabled !== false;
      if (!blockEl || !enabled) return;
      blockEl.style.display = '';
      regionNode.appendChild(blockEl);
    });
  });

  const headerActions = scaffold.topbar.querySelector('.header-actions');
  if (headerActions && !headerActions.children.length) {
    headerActions.remove();
  }
}

export const applyPageHeaderLayout = applySharedHeaderLayout;

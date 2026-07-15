import { appearanceToInlineStyle } from '../shared/page-builder/appearance-utils.js';
import {
  HEADER_REGION_ORDER,
  HEADER_ROW_ORDER,
  normalizeHeaderConfig,
  resolveHeaderBlockAppearance,
  resolveHeaderNavItemAppearance,
  resolveHeaderShellScrolledAppearance,
  resolveHeaderShellTopAppearance,
  resolvePageHeaderState,
} from '../shared/page-builder/header-config.js';
import { sanitizeAssetUrl } from '../shared/page-builder/sanitize.js';
import {
  normalizeHeaderNavItems,
  resolveLinkTargetHref,
  shouldOpenLinkInNewTab,
} from '../shared/page-builder/link-utils.js';

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
  'font-size',
  'font-weight',
  'text-transform',
];

// Per-block appearance (Phase 5) uses the same controlled-props discipline as the
// topbar shell: only these inline properties are ever set/cleared, so scripted styles
// (display toggling during stash/placement) are never clobbered.
const CONTROLLED_BLOCK_STYLE_PROPS = CONTROLLED_TOPBAR_STYLE_PROPS;

// The entry picker's chrome lives on inner elements (trigger, menu, options), so its
// block appearance is delivered as CSS variables consumed by
// assets/css/main.core.05-entry-select.css instead of direct inline properties.
const ENTRY_SELECT_STYLE_VARS = [
  '--entry-select-bg',
  '--entry-select-text',
  '--entry-select-border-width',
  '--entry-select-border-style',
  '--entry-select-border-color',
  '--entry-select-radius',
];

function parseInlineStyleTokens(inlineStyle = '') {
  return String(inlineStyle || '')
    .split(';')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const separatorIndex = token.indexOf(':');
      if (separatorIndex === -1) return null;
      return {
        property: token.slice(0, separatorIndex).trim(),
        value: token.slice(separatorIndex + 1).trim(),
      };
    })
    .filter((entry) => entry && entry.property && entry.value);
}

function clearControlledProps(element, props) {
  if (!element) return;
  props.forEach((prop) => {
    element.style.removeProperty(prop);
  });
  if (!element.getAttribute('style')?.trim()) {
    element.removeAttribute('style');
  }
}

// Standard block styling: clear-then-apply the controlled props from the shared
// appearance schema's inline style.
function applyBlockAppearanceStyle(element, appearance) {
  if (!element) return;
  clearControlledProps(element, CONTROLLED_BLOCK_STYLE_PROPS);
  const inlineStyle = appearanceToInlineStyle(appearance);
  if (!inlineStyle) return;
  parseInlineStyleTokens(inlineStyle).forEach(({ property, value }) => {
    if (CONTROLLED_BLOCK_STYLE_PROPS.includes(property)) {
      element.style.setProperty(property, value);
    }
  });
}

// Entry picker styling: translate the appearance inline tokens into the CSS vars the
// entry-select stylesheet consumes (defaults there equal today's hardcoded look).
function applyEntryControlsAppearance(element, appearance) {
  if (!element) return;
  clearControlledProps(element, ENTRY_SELECT_STYLE_VARS);
  const inlineStyle = appearanceToInlineStyle(appearance);
  if (!inlineStyle) return;
  parseInlineStyleTokens(inlineStyle).forEach(({ property, value }) => {
    if (property === 'background') {
      element.style.setProperty('--entry-select-bg', value);
    } else if (property === 'color') {
      element.style.setProperty('--entry-select-text', value);
    } else if (property === 'border-radius') {
      element.style.setProperty('--entry-select-radius', value);
    } else if (property === 'border-color') {
      element.style.setProperty('--entry-select-border-color', value);
    } else if (property === 'border-width') {
      element.style.setProperty('--entry-select-border-width', value);
    } else if (property === 'border-style') {
      element.style.setProperty('--entry-select-border-style', value);
    } else if (property === 'border') {
      if (value === 'none') {
        element.style.setProperty('--entry-select-border-width', '0px');
        return;
      }
      // appearanceToInlineStyle emits "border: <width>px <style> <color>".
      const parts = value.split(' ').filter(Boolean);
      if (parts.length >= 3) {
        element.style.setProperty('--entry-select-border-width', parts[0]);
        element.style.setProperty('--entry-select-border-style', parts[1]);
        element.style.setProperty('--entry-select-border-color', parts.slice(2).join(' '));
      }
    }
  });
}

function applyHeaderBlockAppearance(blockId, element, headerConfig) {
  const appearance = resolveHeaderBlockAppearance(headerConfig, blockId);
  if (blockId === 'entryControls') {
    applyEntryControlsAppearance(element, appearance);
    return;
  }
  applyBlockAppearanceStyle(element, appearance);
}

// Brand logo content (Phase 5): swap the hardcoded "BWC" letters for custom text or an
// image; unset pages restore the original markup captured on first run.
function applyBrandLogo(brandEl, brand) {
  const logo = brandEl?.querySelector('.logo');
  if (!logo) return;
  if (logo.dataset.pbDefaultLogoText === undefined) {
    logo.dataset.pbDefaultLogoText = logo.textContent || '';
  }
  const logoImage = sanitizeAssetUrl(brand?.logoImage || '');
  const logoText = String(brand?.logoText || '').trim();
  if (logoImage) {
    logo.replaceChildren();
    const img = document.createElement('img');
    img.className = 'logo-image';
    img.src =
      logoImage.startsWith('/') || /^https?:\/\//i.test(logoImage)
        ? logoImage
        : `/assets/${logoImage.replace(/^assets\//, '')}`;
    img.alt = logoText || logo.dataset.pbDefaultLogoText || 'Logo';
    logo.appendChild(img);
  } else {
    logo.textContent = logoText || logo.dataset.pbDefaultLogoText;
  }
  applyBlockAppearanceStyle(logo, brand?.logoAppearance);
}

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

  const headerActions = topbar.querySelector('.header-actions');
  if (headerActions && !headerActions.children.length) {
    headerActions.remove();
  }

  return { topbar, layout, stash };
}

function syncHeaderBuilderMarkers(topbar, page, builderEditing) {
  if (!topbar) return;
  if (builderEditing && page?.id) {
    topbar.setAttribute('data-builder-page-id', String(page.id));
    topbar.setAttribute('data-builder-surface', 'page-header');
    return;
  }
  topbar.removeAttribute('data-builder-page-id');
  topbar.removeAttribute('data-builder-surface');
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
  const builderEditing = options.builderEditing === true;
  const headerState =
    options.headerState ||
    resolvePageHeaderState({
      page: currentPage,
      pageConfig,
      normalizeNavItems: normalizeHeaderNavItems,
    });
  const headerConfig = normalizeHeaderConfig(headerState.header, normalizeHeaderNavItems);
  const blocks = collectHeaderBlocks(scaffold.topbar);
  syncHeaderBuilderMarkers(scaffold.topbar, currentPage, builderEditing);
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

  // Per-block styling + brand logo content (Phase 5). Applied to every block element
  // (placed or stashed) so styles clear correctly when a page removes them.
  Object.entries(blocks).forEach(([blockId, node]) => {
    if (!node) return;
    applyHeaderBlockAppearance(blockId, node, headerConfig);
  });
  applyBrandLogo(blocks.brand, headerConfig.brand);

  renderNavItems(blocks.nav, headerConfig, seriesId);

  scaffold.layout.replaceChildren();

  HEADER_ROW_ORDER.forEach((rowId) => {
    const rowRegions = HEADER_REGION_ORDER.map((region) => {
      const blockIds = (headerConfig.layoutRows?.[rowId]?.[region] || []).filter((blockId) => {
        const enabled = headerConfig.blocks?.[blockId]?.enabled !== false;
        return !!blocks[blockId] && enabled;
      });
      return { region, blockIds };
    });
    // Published pages skip empty rows/regions. In builder edit mode every 3×3 cell is
    // rendered (marked data-builder-header-cell) so the bridge can measure it as a drop
    // target for on-canvas header block drags — including currently-empty cells. Empty
    // rows/cells stay display:none until a header drag starts (CSS keyed off the
    // html[data-builder-header-dragging] flag) so the at-rest preview keeps pixel
    // parity with the published page.
    const rowHasBlocks = rowRegions.some(({ blockIds }) => blockIds.length > 0);
    if (!builderEditing && !rowHasBlocks) return;

    const rowNode = document.createElement('div');
    rowNode.className = 'topbar-layout-row';
    rowNode.dataset.row = rowId;
    if (builderEditing && !rowHasBlocks) {
      rowNode.classList.add('topbar-layout-row--builder-empty');
    }

    rowRegions.forEach(({ region, blockIds }) => {
      if (!builderEditing && !blockIds.length) return;
      const regionNode = document.createElement('div');
      regionNode.className = 'topbar-region';
      regionNode.dataset.region = region;
      if (builderEditing) {
        regionNode.setAttribute('data-builder-header-cell', 'true');
        regionNode.setAttribute('data-builder-header-row', rowId);
        if (!blockIds.length) {
          regionNode.classList.add('topbar-region--builder-empty');
        }
      }
      blockIds.forEach((blockId) => {
        const blockEl = blocks[blockId];
        blockEl.style.display = '';
        // Edit-mode marker: lets the builder bridge target this specific header block
        // (click → header editor opens with the block's Parts row highlighted).
        if (builderEditing) {
          blockEl.setAttribute('data-builder-header-block', blockId);
        } else {
          blockEl.removeAttribute('data-builder-header-block');
        }
        regionNode.appendChild(blockEl);
      });
      rowNode.appendChild(regionNode);
    });

    scaffold.layout.appendChild(rowNode);
  });

  const headerActions = scaffold.topbar.querySelector('.header-actions');
  if (headerActions && !headerActions.children.length) {
    headerActions.remove();
  }
}

export const applyPageHeaderLayout = applySharedHeaderLayout;

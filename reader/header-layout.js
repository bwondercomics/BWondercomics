import { appearanceToInlineStyle } from '../admin/page-builder/appearance-utils.js';
import {
  HEADER_REGION_ORDER,
  HEADER_ROW_ORDER,
  normalizeHeaderConfig,
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

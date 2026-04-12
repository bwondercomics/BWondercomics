import {
  createEffectiveHeaderConfig,
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
    Object.entries(BLOCK_SELECTORS).map(([blockId, selector]) => [blockId, topbar.querySelector(selector)])
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
    link.className = 'nav-link';
    link.textContent = item.label || 'Link';
    link.href = resolveLinkTargetHref(item.link, { seriesId });
    if (shouldOpenLinkInNewTab(item.link)) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    navEl.insertBefore(link, adminLink || null);
  });
}

export function applySharedHeaderLayout(pageConfig = null, options = {}) {
  const scaffold = ensureHeaderScaffold();
  if (!scaffold) return;

  const seriesId = options.seriesId || 'battle-bros';
  const currentPage = options.page || null;
  const headerConfig = createEffectiveHeaderConfig(currentPage, pageConfig, normalizeHeaderNavItems);
  const blocks = collectHeaderBlocks(scaffold.topbar);

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

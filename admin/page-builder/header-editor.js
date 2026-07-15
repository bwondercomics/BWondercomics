import {
  cloneValue as cloneAppearanceValue,
  isObject,
  syncAppearanceColorInputs,
  removeAppearanceLeaf,
  renderAppearanceControls,
  setAppearanceLeaf,
  toSparseAppearance,
} from './appearance-editor.js';
import { escapeAttr, escapeHtml } from '../../shared/page-builder/helpers.js';
import {
  HEADER_BLOCK_DEFS,
  HEADER_REGION_ORDER,
  HEADER_ROW_ORDER,
  cloneValue,
  normalizeHeaderConfig,
  normalizeHeaderCopy,
} from '../../shared/page-builder/header-config.js';
import {
  isBuilderPageTargetMissing,
  normalizeHeaderNavItem,
  normalizeHeaderNavItems,
  normalizeLinkTarget,
} from '../../shared/page-builder/link-utils.js';
import { renderInspectorSection } from './inspector-sections.js';
import {
  getBuilderDeviceLabel,
  getResponsiveBranch,
  normalizeBuilderDeviceId,
  pruneEmptyResponsiveOverrides,
} from '../../shared/page-builder/responsive-overrides.js';

export function findBlockPlacement(header, blockId) {
  for (const rowId of HEADER_ROW_ORDER) {
    for (const region of HEADER_REGION_ORDER) {
      if ((header.layoutRows?.[rowId]?.[region] || []).includes(blockId)) {
        return { rowId, region };
      }
    }
  }
  return { rowId: 'top', region: 'left' };
}

// Brand block content (Phase 5): custom logo letters or an image, plus logo styling.
// Blank fields keep the built-in BWC logo untouched.
function renderBrandEditor(header) {
  const brand = header.brand || {};
  return renderInspectorSection({
    kicker: 'Brand',
    title: 'Logo',
    summary: brand.logoImage ? 'Custom image' : brand.logoText || 'BWC',
    copy: 'Swap the logo letters or use an image. Leave blank to keep the built-in logo.',
    body: `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Logo Letters</label>
        <input type="text" class="pb-editor-input pb-header-brand-input" data-brand-key="logoText" maxlength="24" placeholder="BWC" value="${escapeAttr(brand.logoText || '')}">
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Logo Image Path</label>
        <input type="text" class="pb-editor-input pb-header-brand-input" data-brand-key="logoImage" placeholder="media/logo.png" value="${escapeAttr(brand.logoImage || '')}">
        <p class="pb-editor-help">An uploaded asset path (from the Media library). When set, the image replaces the logo letters.</p>
      </div>
      ${renderAppearanceControls(
        brand.logoAppearance,
        'brand-logo',
        null,
        'Logo Styling',
        'Background, border, and text color of the logo box.'
      )}
    `,
  });
}

// Per-block styling (Phase 5): one sparse appearance group per header part, applied
// inline on the block wrapper at layout time (the Entry Picker maps to its CSS vars).
function renderBlockStylingEditor(header) {
  const styledCount = HEADER_BLOCK_DEFS.filter(
    (block) => !!header.blocks?.[block.id]?.appearance
  ).length;
  const groups = HEADER_BLOCK_DEFS.map((block) =>
    renderAppearanceControls(
      header.blocks?.[block.id]?.appearance,
      `block-${block.id}`,
      null,
      block.label,
      `Styling for the ${block.label} block on this page.`
    )
  ).join('');
  return renderInspectorSection({
    kicker: 'Styling',
    title: 'Block Styling',
    summary: styledCount ? `${styledCount} customized` : 'Default',
    copy: 'Style each header part individually. Blocks without custom styling keep the stock look.',
    body: `<div class="pb-appearance-stack">${groups}</div>`,
  });
}

function renderCopyEditor(copy) {
  return renderInspectorSection({
    kicker: 'Header',
    title: 'Header Text',
    summary: copy.title || 'Page title',
    copy: 'This is the text readers see in the live header. Rotating lines cycle through the list below.',
    body: `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Title</label>
        <input type="text" class="pb-editor-input pb-header-copy-input" data-copy-key="title" value="${escapeAttr(copy.title || '')}">
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Subtitle</label>
        <input type="text" class="pb-editor-input pb-header-copy-input" data-copy-key="subtitle" value="${escapeAttr(copy.subtitle || '')}">
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Rotating Subtitles</label>
        <textarea class="pb-editor-textarea pb-header-copy-input" data-copy-key="subtitles" placeholder="One line per subtitle">${escapeHtml((copy.subtitles || []).join('\n'))}</textarea>
        <p class="pb-editor-help">Use one line per rotating subtitle. Leave blank if this page should stay static.</p>
      </div>
    `,
  });
}

function renderLinkFields(item, index, pages) {
  const link = normalizeLinkTarget(item.link, '');
  const isMissingPage = isBuilderPageTargetMissing(link, pages);
  const pageScope = link.pageScope === 'global' ? 'global' : 'series';
  const pageOptions = pages
    .filter((page) => (page?.scope === 'global' ? 'global' : 'series') === pageScope)
    .map((page) => {
      const slug = String(page?.slug || '').trim();
      const title = page?.title || slug || 'Untitled page';
      const seriesId = pageScope === 'series' ? String(page?.seriesId || '').trim() : '';
      const selected =
        link.pageSlug === slug &&
        (pageScope === 'global' || !link.seriesId || link.seriesId === seriesId);
      return `<option value="${escapeAttr(slug)}" data-series-id="${escapeAttr(seriesId)}" ${selected ? 'selected' : ''}>${escapeHtml(title)} (${escapeHtml(slug)})</option>`;
    })
    .join('');
  const isExternalUrl = /^https?:\/\//i.test(link.url || '');

  return `
    <div class="pb-editor-field">
      <label class="pb-editor-label">Destination Type</label>
      <select class="pb-editor-select pb-header-nav-input" data-item-index="${index}" data-item-key="kind">
        <option value="builder-page" ${link.kind === 'builder-page' ? 'selected' : ''}>Builder Page</option>
        <option value="url" ${link.kind === 'url' ? 'selected' : ''}>URL</option>
        <option value="anchor" ${link.kind === 'anchor' ? 'selected' : ''}>Jump to Section</option>
      </select>
    </div>
    ${
      link.kind === 'builder-page'
        ? `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Page Scope</label>
        <select class="pb-editor-select pb-header-nav-input" data-item-index="${index}" data-item-key="pageScope">
          <option value="series" ${pageScope === 'series' ? 'selected' : ''}>Series Pages</option>
          <option value="global" ${pageScope === 'global' ? 'selected' : ''}>Global Pages</option>
        </select>
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">Page</label>
        <select class="pb-editor-select pb-header-nav-input" data-item-index="${index}" data-item-key="pageSlug">
          <option value="">Select a page</option>
          ${pageOptions}
        </select>
        ${
          isMissingPage
            ? '<p class="pb-editor-help" data-status="warning">This saved page slug is not available in this scope.</p>'
            : '<p class="pb-editor-help">Links to another builder page.</p>'
        }
      </div>
    `
        : ''
    }
    ${
      link.kind === 'url'
        ? `
      <div class="pb-editor-field">
        <label class="pb-editor-label">URL</label>
        <input type="text" class="pb-editor-input pb-header-nav-input" data-item-index="${index}" data-item-key="url" value="${escapeAttr(link.url || '')}" placeholder="feed.html or https://example.com">
        <p class="pb-editor-help">Use this for off-site URLs or existing pages like feed.html and media.html.</p>
      </div>
      ${
        isExternalUrl
          ? `
      <div class="pb-editor-field">
        <label class="pb-editor-label">
          <input type="checkbox" class="pb-header-nav-input" data-item-index="${index}" data-item-key="openInNewTab" ${link.openInNewTab ? 'checked' : ''}> Open this external link in a new tab
        </label>
      </div>
      `
          : ''
      }
    `
        : ''
    }
    ${
      link.kind === 'anchor'
        ? `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Anchor</label>
        <input type="text" class="pb-editor-input pb-header-nav-input" data-item-index="${index}" data-item-key="hash" value="${escapeAttr(link.hash || '')}" placeholder="#section-id">
        <p class="pb-editor-help">Scrolls to a section on the current page.</p>
      </div>
    `
        : ''
    }
  `;
}

function renderNavigationEditor(header, pages) {
  const navItems = normalizeHeaderNavItems(header.nav?.items || []);
  const navHtml = navItems
    .map(
      (item, index) => `
      <div class="pb-social-item pb-header-nav-item" data-item-index="${index}">
        <div class="pb-promo-item-header">
          <div>
            <strong>${escapeHtml(item.label || `Button ${index + 1}`)}</strong>
            <div class="pb-editor-help">The admin link still appears automatically for admins.</div>
          </div>
          <div class="pb-promo-item-actions">
            <button type="button" class="pb-promo-action" data-action="move-up" ${index === 0 ? 'disabled' : ''} title="Move up">↑</button>
            <button type="button" class="pb-promo-action" data-action="move-down" ${index === navItems.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
            <button type="button" class="pb-promo-action danger" data-action="remove" title="Remove">×</button>
          </div>
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Button Label</label>
          <input type="text" class="pb-editor-input pb-header-nav-input" data-item-index="${index}" data-item-key="label" value="${escapeAttr(item.label || '')}">
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Style</label>
          <select class="pb-editor-select pb-header-nav-input" data-item-index="${index}" data-item-key="style">
            <option value="primary" ${item.style !== 'secondary' ? 'selected' : ''}>Primary</option>
            <option value="secondary" ${item.style === 'secondary' ? 'selected' : ''}>Secondary</option>
          </select>
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">
            <input type="checkbox" class="pb-header-nav-input" data-item-index="${index}" data-item-key="enabled" ${item.enabled !== false ? 'checked' : ''}> Show this button
          </label>
        </div>
        ${renderLinkFields(item, index, pages)}
        ${renderAppearanceControls(
          item.appearance,
          'nav-item',
          index,
          'Appearance Overrides',
          'Enable only the leaves you want to override for this header button.'
        )}
      </div>
    `
    )
    .join('');

  return renderInspectorSection({
    kicker: 'Navigation',
    title: 'Navigation Buttons',
    summary: `${navItems.length} button${navItems.length === 1 ? '' : 's'}`,
    copy: 'Choose which buttons appear in this page header and where each one goes.',
    body: `
      ${renderAppearanceControls(
        header.appearance?.navItemDefaults,
        'nav-defaults',
        null,
        'Header Nav Defaults',
        'Set sparse defaults that author-created header buttons inherit unless an item override is enabled.'
      )}
      <div class="pb-promo-editor-list">
        ${navHtml || '<div class="pb-promo-empty">No header buttons yet. Click "+ Add Button" to create one.</div>'}
      </div>
      <div class="pb-editor-actions">
        <button type="button" class="btn-secondary" id="pbHeaderAddNavItem">+ Add Button</button>
      </div>
    `,
  });
}

function renderPartsEditor(header) {
  const partsHtml = HEADER_BLOCK_DEFS.map((block) => {
    const enabled = header.blocks?.[block.id]?.enabled !== false;
    const actionId = escapeAttr(`pb-header-part-${block.id}-action`);
    const descriptionId = escapeAttr(`pb-header-part-${block.id}-description`);
    return `
      <label class="pb-header-toggle-row pb-field-row" data-block-id="${escapeAttr(block.id)}">
        <span class="pb-header-toggle-text">
          <span class="pb-header-toggle-label pb-truncate" title="${escapeAttr(block.label)}">${escapeHtml(block.label)}</span>
          <span id="${descriptionId}" class="pb-header-toggle-help pb-truncate" title="${escapeAttr(block.description)}">${escapeHtml(block.description)}</span>
        </span>
        <span class="pb-header-toggle-switch">
          <input type="checkbox" class="pb-header-block-input" data-block-id="${block.id}" data-key="enabled" aria-labelledby="${actionId}" aria-describedby="${descriptionId}" ${enabled ? 'checked' : ''}>
          <span id="${actionId}" class="pb-sr-only">Show ${escapeHtml(block.label)} in header</span>
        </span>
      </label>
    `;
  }).join('');

  const visibleCount = HEADER_BLOCK_DEFS.filter(
    (block) => header.blocks?.[block.id]?.enabled !== false
  ).length;
  return renderInspectorSection({
    kicker: 'Parts',
    title: 'Header Parts',
    summary: `${visibleCount} visible`,
    copy: 'Turn built-in header parts on or off for this page. To move a part, click it in the preview and drag it (or use the toolbar arrows).',
    body: `<div class="pb-header-toggle-list">${partsHtml}</div>`,
  });
}

function renderShellAppearanceEditor(header) {
  const hasAppearance = !!(
    header.appearance?.top ||
    header.appearance?.scrolled ||
    header.appearance?.navItemDefaults
  );
  return renderInspectorSection({
    kicker: 'Styling',
    title: 'Header Styling',
    summary: hasAppearance ? 'Custom' : 'Default',
    copy: 'Control the normal header style and the optional style used after the reader scrolls.',
    body: `
      <div class="pb-appearance-stack">
        ${renderAppearanceControls(
          header.appearance?.top,
          'shell-top',
          null,
          'Normal Header',
          'Styles used before the reader scrolls.'
        )}
        ${renderAppearanceControls(
          header.appearance?.scrolled,
          'shell-scrolled',
          null,
          'After Page Scroll',
          'Styles used once the sticky header has scrolled.'
        )}
      </div>
    `,
  });
}

function renderResponsiveScopeControl({ activeDeviceId, responsiveEditScope }) {
  const deviceLabel = getBuilderDeviceLabel(activeDeviceId);
  return renderInspectorSection({
    kicker: 'Device',
    title: 'Edit Scope',
    summary: responsiveEditScope === 'device' ? deviceLabel : 'Global',
    copy: '',
    body: `
      <div class="pb-editor-stack pb-editor-stack--compact">
        <div class="pb-editor-field">
          <label class="pb-editor-label" for="pbResponsiveEditScope">Scope</label>
          <select id="pbResponsiveEditScope" class="pb-editor-select" data-responsive-edit-scope>
            <option value="global" ${responsiveEditScope === 'global' ? 'selected' : ''}>Global</option>
            <option value="device" ${responsiveEditScope === 'device' ? 'selected' : ''}>Current Device (${escapeHtml(deviceLabel)})</option>
          </select>
        </div>
      </div>
    `,
  });
}

function renderDeviceAppearanceEditor(appearance = {}, activeDeviceId = 'desktop') {
  const deviceLabel = getBuilderDeviceLabel(activeDeviceId);
  const hasAppearance = !!(appearance?.top || appearance?.scrolled || appearance?.navItemDefaults);
  return renderInspectorSection({
    kicker: 'Styling',
    title: 'Header Styling',
    summary: hasAppearance ? deviceLabel : 'Default',
    copy: 'Control header appearance for the active device without changing global header content.',
    body: `
      <div class="pb-appearance-stack">
        ${renderAppearanceControls(
          appearance?.top,
          'shell-top',
          null,
          'Normal Header',
          'Styles used before the reader scrolls.'
        )}
        ${renderAppearanceControls(
          appearance?.scrolled,
          'shell-scrolled',
          null,
          'After Page Scroll',
          'Styles used once the sticky header has scrolled.'
        )}
        ${renderAppearanceControls(
          appearance?.navItemDefaults,
          'nav-defaults',
          null,
          'Header Nav Defaults',
          'Set device-specific defaults that author-created header buttons inherit.'
        )}
      </div>
    `,
  });
}

function renderHeaderStyleEditor(header, responsiveAppearance, activeDeviceId, scope) {
  if (scope === 'device') {
    return renderDeviceAppearanceEditor(responsiveAppearance || {}, activeDeviceId);
  }
  const hasAppearance = !!(
    header.appearance?.top ||
    header.appearance?.scrolled ||
    header.appearance?.navItemDefaults
  );
  return renderInspectorSection({
    kicker: 'Styling',
    title: 'Header Styling',
    summary: hasAppearance ? 'Custom' : 'Default',
    copy: 'Control sanitized header shell and navigation defaults.',
    body: `
      <div class="pb-appearance-stack">
        ${renderAppearanceControls(
          header.appearance?.top,
          'shell-top',
          null,
          'Normal Header',
          'Styles used before the reader scrolls.'
        )}
        ${renderAppearanceControls(
          header.appearance?.scrolled,
          'shell-scrolled',
          null,
          'After Page Scroll',
          'Styles used once the sticky header has scrolled.'
        )}
        ${renderAppearanceControls(
          header.appearance?.navItemDefaults,
          'nav-defaults',
          null,
          'Header Nav Defaults',
          'Set sparse defaults that author-created header buttons inherit.'
        )}
      </div>
    `,
  });
}

function renderSourceBanner(source) {
  if (source === 'legacy-import') {
    return `
      <div class="pb-editor-source-notice" data-status="warning">
        <strong>Header migration needed.</strong>
        <span>This page is missing canonical V3 header metadata. Save to write page.meta.header.version = 3.</span>
      </div>
    `;
  }
  if (source === 'page-meta-stale') {
    return `
      <div class="pb-editor-source-notice" data-status="warning">
        <strong>Older header metadata detected.</strong>
        <span>Save to upgrade this page to canonical V3 header metadata.</span>
      </div>
    `;
  }
  return '';
}

export function renderHeaderEditorContent({
  draftState,
  pages = [],
  activeDeviceId = 'desktop',
  responsiveEditScope = 'global',
  mode = 'settings',
}) {
  const normalizedDeviceId = normalizeBuilderDeviceId(activeDeviceId);
  const scope = responsiveEditScope === 'device' ? 'device' : 'global';
  const header = normalizeHeaderConfig(draftState?.header, normalizeHeaderNavItems);
  const copy = normalizeHeaderCopy(draftState?.copy);
  const responsiveAppearance = getResponsiveBranch(draftState || {}, normalizedDeviceId)?.header
    ?.appearance;

  if (mode === 'styles') {
    return [
      renderSourceBanner(draftState?.source),
      renderResponsiveScopeControl({
        activeDeviceId: normalizedDeviceId,
        responsiveEditScope: scope,
      }),
      renderHeaderStyleEditor(header, responsiveAppearance, normalizedDeviceId, scope),
    ].join('');
  }

  if (scope === 'device') {
    return [
      renderSourceBanner(draftState?.source),
      renderResponsiveScopeControl({
        activeDeviceId: normalizedDeviceId,
        responsiveEditScope: scope,
      }),
      renderDeviceAppearanceEditor(responsiveAppearance || {}, normalizedDeviceId),
    ].join('');
  }

  return [
    renderSourceBanner(draftState?.source),
    renderResponsiveScopeControl({
      activeDeviceId: normalizedDeviceId,
      responsiveEditScope: scope,
    }),
    renderCopyEditor(copy),
    renderBrandEditor(header),
    renderPartsEditor(header),
    renderBlockStylingEditor(header),
    renderNavigationEditor(header, pages),
    renderShellAppearanceEditor(header),
  ].join('');
}

// Placement model API: these pure functions are the single mutation path for header block
// placement. They are driven from the live canvas (toolbar arrows + on-canvas drag) via
// page-builder.js; the old abstract placement board that used to call them is retired.
export function moveBlockToPlacement(header, blockId, nextRowId, nextRegion) {
  const nextHeader = normalizeHeaderConfig(cloneValue(header), normalizeHeaderNavItems);
  HEADER_ROW_ORDER.forEach((rowId) => {
    HEADER_REGION_ORDER.forEach((region) => {
      nextHeader.layoutRows[rowId][region] = (nextHeader.layoutRows[rowId][region] || []).filter(
        (id) => id !== blockId
      );
    });
  });
  nextHeader.layoutRows[nextRowId][nextRegion] = nextHeader.layoutRows[nextRowId][nextRegion] || [];
  nextHeader.layoutRows[nextRowId][nextRegion].push(blockId);
  return normalizeHeaderConfig(nextHeader, normalizeHeaderNavItems);
}

export function moveBlockAcrossRegions(header, blockId, direction) {
  const placement = findBlockPlacement(
    normalizeHeaderConfig(header, normalizeHeaderNavItems),
    blockId
  );
  const currentIndex = HEADER_REGION_ORDER.indexOf(placement.region);
  if (currentIndex === -1) {
    return normalizeHeaderConfig(cloneValue(header), normalizeHeaderNavItems);
  }
  const nextRegion = HEADER_REGION_ORDER[currentIndex + direction];
  if (!nextRegion) return normalizeHeaderConfig(cloneValue(header), normalizeHeaderNavItems);
  return moveBlockToPlacement(header, blockId, placement.rowId, nextRegion);
}

export function moveBlockAcrossRows(header, blockId, direction) {
  const placement = findBlockPlacement(
    normalizeHeaderConfig(header, normalizeHeaderNavItems),
    blockId
  );
  const currentIndex = HEADER_ROW_ORDER.indexOf(placement.rowId);
  if (currentIndex === -1) {
    return normalizeHeaderConfig(cloneValue(header), normalizeHeaderNavItems);
  }
  const nextRowId = HEADER_ROW_ORDER[currentIndex + direction];
  if (!nextRowId) return normalizeHeaderConfig(cloneValue(header), normalizeHeaderNavItems);
  return moveBlockToPlacement(header, blockId, nextRowId, placement.region);
}

function setCopyValue(state, key, value) {
  const nextState = cloneValue(state);
  if (key === 'subtitles') {
    nextState.copy.subtitles = String(value || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } else {
    nextState.copy[key] = value;
  }
  return nextState;
}

function updateNavItemLink(item, key, input) {
  const nextLink = normalizeLinkTarget(item.link, '');
  const selectedOption =
    input.selectedOptions?.[0] ||
    (Number.isInteger(input.selectedIndex) ? input.options?.[input.selectedIndex] : null);
  if (key === 'kind') {
    nextLink.kind = input.value;
    nextLink.pageScope = 'series';
    nextLink.seriesId = '';
    nextLink.pageSlug = '';
    nextLink.url = '';
    nextLink.hash = '';
    nextLink.openInNewTab = false;
  } else if (key === 'pageScope') {
    nextLink.pageScope = input.value === 'global' ? 'global' : 'series';
    nextLink.seriesId = '';
    nextLink.pageSlug = '';
  } else if (key === 'pageSlug') {
    nextLink.pageSlug = input.value;
    nextLink.seriesId =
      nextLink.pageScope === 'series' ? selectedOption?.dataset?.seriesId || '' : '';
  } else if (key === 'openInNewTab') {
    nextLink.openInNewTab = input.checked;
  } else {
    nextLink[key] = input.value;
  }
  item.link = normalizeLinkTarget(nextLink, '');
}

const SHELL_APPEARANCE_SCOPE_TO_KEY = {
  'shell-top': 'top',
  'shell-scrolled': 'scrolled',
  'nav-defaults': 'navItemDefaults',
};

export function bindHeaderEditorEvents({
  el,
  draftState,
  setDraftState,
  markDirty,
  renderEditorPanel,
  renderCanvas,
  activeDeviceId = 'desktop',
  responsiveEditScope = 'global',
}) {
  const normalizedDeviceId = normalizeBuilderDeviceId(activeDeviceId);
  const useDeviceAppearance = responsiveEditScope === 'device';
  let state = {
    source: draftState?.source || null,
    header: normalizeHeaderConfig(draftState?.header, normalizeHeaderNavItems),
    copy: normalizeHeaderCopy(draftState?.copy),
    responsive: pruneEmptyResponsiveOverrides(draftState?.responsive || {}),
  };

  const commit = (nextState, options = {}) => {
    const { rerenderEditor = false, rerenderCanvas = true } = options;
    const responsive = pruneEmptyResponsiveOverrides(nextState?.responsive || {});
    state = {
      source: nextState?.source || state.source || null,
      header: normalizeHeaderConfig(nextState.header, normalizeHeaderNavItems),
      copy: normalizeHeaderCopy(nextState.copy),
      responsive,
    };
    setDraftState(cloneValue(state));
    markDirty('header');
    if (rerenderCanvas) {
      renderCanvas();
    }
    if (rerenderEditor) {
      renderEditorPanel();
    }
  };

  el.pbModuleEditor.querySelectorAll('.pb-header-copy-input').forEach((input) => {
    const eventName = input.tagName === 'TEXTAREA' ? 'input' : 'input';
    input.addEventListener(eventName, () => {
      const key = input.dataset.copyKey;
      if (!key) return;
      commit(setCopyValue(state, key, input.value), { rerenderCanvas: true });
    });
  });

  el.pbModuleEditor.querySelectorAll('.pb-header-block-input').forEach((input) => {
    input.addEventListener('change', () => {
      const blockId = input.dataset.blockId;
      if (!blockId) return;
      const nextState = cloneValue(state);
      nextState.header.blocks[blockId].enabled = input.checked;
      commit(nextState, { rerenderEditor: true, rerenderCanvas: true });
    });
  });

  // Brand logo content: sparse — blank fields drop their key, an empty brand object
  // drops entirely (the built-in BWC markup is the fallback).
  el.pbModuleEditor.querySelectorAll('.pb-header-brand-input').forEach((input) => {
    input.addEventListener('input', () => {
      const key = input.dataset.brandKey;
      if (!key) return;
      const nextState = cloneValue(state);
      const brand = isObject(nextState.header.brand) ? nextState.header.brand : {};
      const value = String(input.value || '').trim();
      if (value) {
        brand[key] = value;
      } else {
        delete brand[key];
      }
      nextState.header.brand = Object.keys(brand).length ? brand : null;
      commit(nextState, { rerenderCanvas: true });
    });
  });

  const ensureHeaderAppearanceRoot = (nextState) => {
    if (!isObject(nextState.header.appearance)) {
      nextState.header.appearance = {};
    }
    return nextState.header.appearance;
  };

  const cleanupHeaderAppearanceRoot = (nextState) => {
    const appearance = nextState.header.appearance;
    if (!appearance || (!appearance.top && !appearance.scrolled && !appearance.navItemDefaults)) {
      delete nextState.header.appearance;
    }
  };

  const ensureResponsiveAppearanceRoot = (nextState) => {
    nextState.responsive = isObject(nextState.responsive) ? nextState.responsive : {};
    nextState.responsive[normalizedDeviceId] = isObject(nextState.responsive[normalizedDeviceId])
      ? nextState.responsive[normalizedDeviceId]
      : {};
    const branch = nextState.responsive[normalizedDeviceId];
    branch.header = isObject(branch.header) ? branch.header : {};
    branch.header.appearance = isObject(branch.header.appearance) ? branch.header.appearance : {};
    return branch.header.appearance;
  };

  const cleanupResponsiveRoot = (nextState) => {
    const responsive = pruneEmptyResponsiveOverrides(nextState.responsive || {});
    if (Object.keys(responsive).length) {
      nextState.responsive = responsive;
    } else {
      delete nextState.responsive;
    }
  };

  const resolveAppearanceTarget = (nextState, scope, index) => {
    if (scope === 'nav-item') {
      if (useDeviceAppearance) return null;
      return Number.isInteger(index) ? nextState.header.nav.items[index] : null;
    }
    // Logo styling lives on header.brand.logoAppearance (global scope only).
    if (scope === 'brand-logo') {
      if (useDeviceAppearance) return null;
      return {
        appearance: nextState.header.brand?.logoAppearance,
        setAppearance(appearance) {
          if (appearance) {
            if (!isObject(nextState.header.brand)) nextState.header.brand = {};
            nextState.header.brand.logoAppearance = appearance;
          } else if (isObject(nextState.header.brand)) {
            delete nextState.header.brand.logoAppearance;
            if (!Object.keys(nextState.header.brand).length) {
              nextState.header.brand = null;
            }
          }
        },
      };
    }
    // Per-block styling lives on header.blocks[blockId].appearance (global scope only).
    if (scope.startsWith('block-')) {
      if (useDeviceAppearance) return null;
      const blockId = scope.slice('block-'.length);
      const block = nextState.header.blocks?.[blockId];
      if (!block) return null;
      return {
        appearance: block.appearance,
        setAppearance(appearance) {
          if (appearance) {
            block.appearance = appearance;
          } else {
            delete block.appearance;
          }
        },
      };
    }
    const key = SHELL_APPEARANCE_SCOPE_TO_KEY[scope];
    if (!key) return null;
    if (useDeviceAppearance) {
      const root = ensureResponsiveAppearanceRoot(nextState);
      return {
        appearance: root[key],
        setAppearance(appearance) {
          if (appearance) {
            root[key] = appearance;
          } else {
            delete root[key];
            cleanupResponsiveRoot(nextState);
          }
        },
      };
    }
    const root = ensureHeaderAppearanceRoot(nextState);
    return {
      appearance: root[key],
      setAppearance(appearance) {
        if (appearance) {
          root[key] = appearance;
        } else {
          delete root[key];
          cleanupHeaderAppearanceRoot(nextState);
        }
      },
    };
  };

  const updateAppearanceTarget = (nextState, scope, index, key, value) => {
    const target = resolveAppearanceTarget(nextState, scope, index);
    if (!target || !key) return;
    const appearance = cloneAppearanceValue(target.appearance) || {};
    setAppearanceLeaf(appearance, key, value);
    const sparse = toSparseAppearance(appearance);
    if (target.setAppearance) {
      target.setAppearance(sparse);
      return;
    }
    if (sparse) {
      target.appearance = sparse;
    } else {
      delete target.appearance;
    }
  };

  const removeAppearanceFromTarget = (nextState, scope, index, key) => {
    const target = resolveAppearanceTarget(nextState, scope, index);
    if (!target?.appearance || !key) return;
    const appearance = cloneAppearanceValue(target.appearance);
    removeAppearanceLeaf(appearance, key);
    const sparse = toSparseAppearance(appearance);
    if (target.setAppearance) {
      target.setAppearance(sparse);
      return;
    }
    if (sparse) {
      target.appearance = sparse;
    } else {
      delete target.appearance;
    }
  };

  const getAppearanceInput = ({ scope, index, key }) =>
    el.pbModuleEditor.querySelector(
      [
        '[data-appearance-input="true"]',
        `[data-appearance-scope="${scope}"]`,
        `[data-appearance-key="${key}"]`,
        Number.isInteger(index) ? `[data-item-index="${index}"]` : '',
      ].join('')
    );

  document.getElementById('pbHeaderAddNavItem')?.addEventListener('click', () => {
    const nextState = cloneValue(state);
    nextState.header.nav.items.push(
      normalizeHeaderNavItem({
        label: 'New Button',
        enabled: true,
        link: { kind: 'builder-page' },
      })
    );
    commit(nextState, { rerenderEditor: true, rerenderCanvas: true });
  });

  el.pbModuleEditor.querySelectorAll('.pb-header-nav-item').forEach((itemEl) => {
    const index = parseInt(itemEl.dataset.itemIndex, 10);

    itemEl.querySelector('[data-action="remove"]')?.addEventListener('click', () => {
      const nextState = cloneValue(state);
      nextState.header.nav.items.splice(index, 1);
      commit(nextState, { rerenderEditor: true, rerenderCanvas: true });
    });

    itemEl.querySelector('[data-action="move-up"]')?.addEventListener('click', () => {
      if (index <= 0) return;
      const nextState = cloneValue(state);
      [nextState.header.nav.items[index - 1], nextState.header.nav.items[index]] = [
        nextState.header.nav.items[index],
        nextState.header.nav.items[index - 1],
      ];
      commit(nextState, { rerenderEditor: true, rerenderCanvas: true });
    });

    itemEl.querySelector('[data-action="move-down"]')?.addEventListener('click', () => {
      if (index >= state.header.nav.items.length - 1) return;
      const nextState = cloneValue(state);
      [nextState.header.nav.items[index], nextState.header.nav.items[index + 1]] = [
        nextState.header.nav.items[index + 1],
        nextState.header.nav.items[index],
      ];
      commit(nextState, { rerenderEditor: true, rerenderCanvas: true });
    });
  });

  el.pbModuleEditor.querySelectorAll('.pb-header-nav-input').forEach((input) => {
    const eventName = input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      const index = parseInt(input.dataset.itemIndex, 10);
      const key = input.dataset.itemKey;
      const nextState = cloneValue(state);
      const item = nextState.header.nav.items[index];
      if (!item || !key) return;
      if (['kind', 'pageScope', 'pageSlug', 'url', 'hash', 'openInNewTab'].includes(key)) {
        updateNavItemLink(item, key, input);
        commit(nextState, {
          rerenderEditor: key === 'kind' || key === 'pageScope' || key === 'url',
          rerenderCanvas: true,
        });
        return;
      }
      if (input.type === 'checkbox') {
        item[key] = input.checked;
      } else {
        item[key] = input.value;
      }
      commit(nextState, { rerenderCanvas: true });
    });
  });

  el.pbModuleEditor.querySelectorAll('[data-appearance-toggle="true"]').forEach((toggle) => {
    toggle.addEventListener('change', () => {
      const scope = toggle.dataset.appearanceScope;
      const key = toggle.dataset.appearanceKey;
      const index = toggle.dataset.itemIndex ? parseInt(toggle.dataset.itemIndex, 10) : null;
      if (!scope || !key) return;
      const nextState = cloneValue(state);
      if (toggle.checked) {
        const pairedInput = getAppearanceInput({ scope, index, key });
        if (!pairedInput) return;
        updateAppearanceTarget(nextState, scope, index, key, pairedInput.value);
      } else {
        removeAppearanceFromTarget(nextState, scope, index, key);
      }
      commit(nextState, { rerenderEditor: true, rerenderCanvas: true });
    });
  });

  el.pbModuleEditor.querySelectorAll('[data-appearance-input="true"]').forEach((input) => {
    const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      if (input.disabled) return;
      const scope = input.dataset.appearanceScope;
      const key = input.dataset.appearanceKey;
      const index = input.dataset.itemIndex ? parseInt(input.dataset.itemIndex, 10) : null;
      if (!scope || !key) return;
      const value = syncAppearanceColorInputs(el.pbModuleEditor, input);
      if (value === null) return;
      const nextState = cloneValue(state);
      updateAppearanceTarget(nextState, scope, index, key, value);
      commit(nextState, { rerenderCanvas: true });
    });
  });
}

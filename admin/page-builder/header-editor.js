import {
  cloneValue as cloneAppearanceValue,
  isObject,
  syncAppearanceColorInputs,
  removeAppearanceLeaf,
  renderAppearanceControls,
  setAppearanceLeaf,
  toSparseAppearance,
} from './appearance-editor.js';
import { escapeAttr, escapeHtml } from './helpers.js';
import {
  HEADER_BLOCK_DEFS,
  HEADER_REGION_ORDER,
  HEADER_ROW_ORDER,
  cloneValue,
  normalizeHeaderConfig,
  normalizeHeaderCopy,
} from './header-config.js';
import {
  isBuilderPageTargetMissing,
  normalizeHeaderNavItem,
  normalizeHeaderNavItems,
  normalizeLinkTarget,
} from './link-utils.js';
import { renderInspectorSection } from './inspector-sections.js';

function getRegionLabel(region) {
  return String(region || '').replace(/^\w/, (char) => char.toUpperCase());
}

function getRowLabel(rowId) {
  return String(rowId || '').replace(/^\w/, (char) => char.toUpperCase());
}

function findBlockPlacement(header, blockId) {
  for (const rowId of HEADER_ROW_ORDER) {
    for (const region of HEADER_REGION_ORDER) {
      if ((header.layoutRows?.[rowId]?.[region] || []).includes(blockId)) {
        return { rowId, region };
      }
    }
  }
  return { rowId: 'top', region: 'left' };
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
  const pageOptions = pages
    .map((page) => {
      const slug = String(page?.slug || '').trim();
      const title = page?.title || slug || 'Untitled page';
      return `<option value="${escapeAttr(slug)}" ${link.pageSlug === slug ? 'selected' : ''}>${escapeHtml(title)} (${escapeHtml(slug)})</option>`;
    })
    .join('');
  const isExternalUrl = /^https?:\/\//i.test(link.url || '');

  return `
    <div class="pb-editor-field">
      <label class="pb-editor-label">Destination Type</label>
      <select class="pb-editor-select pb-header-nav-input" data-item-index="${index}" data-item-key="kind">
        <option value="builder-page" ${link.kind === 'builder-page' ? 'selected' : ''}>Page in This Series</option>
        <option value="url" ${link.kind === 'url' ? 'selected' : ''}>URL</option>
        <option value="anchor" ${link.kind === 'anchor' ? 'selected' : ''}>Jump to Section</option>
      </select>
    </div>
    ${
      link.kind === 'builder-page'
        ? `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Page</label>
        <select class="pb-editor-select pb-header-nav-input" data-item-index="${index}" data-item-key="pageSlug">
          <option value="">Select a page</option>
          ${pageOptions}
        </select>
        ${
          isMissingPage
            ? '<p class="pb-editor-help" data-status="warning">This saved page slug is not in the current series.</p>'
            : '<p class="pb-editor-help">Links to another builder page in this series.</p>'
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
    return `
      <div class="pb-header-toggle-row">
        <div>
          <strong>${escapeHtml(block.label)}</strong>
          <div class="pb-editor-help">${escapeHtml(block.description)}</div>
        </div>
        <div class="pb-header-toggle-actions">
          <label class="pb-editor-label">
            <input type="checkbox" class="pb-header-block-input" data-block-id="${block.id}" data-key="enabled" ${enabled ? 'checked' : ''}> Show in header
          </label>
        </div>
      </div>
    `;
  }).join('');

  const visibleCount = HEADER_BLOCK_DEFS.filter(
    (block) => header.blocks?.[block.id]?.enabled !== false
  ).length;
  return renderInspectorSection({
    kicker: 'Parts',
    title: 'Header Parts',
    summary: `${visibleCount} visible`,
    copy: 'Turn built-in header parts on or off for this page.',
    body: `<div class="pb-header-toggle-list">${partsHtml}</div>`,
  });
}

function renderPlacementEditor(header) {
  const board = HEADER_ROW_ORDER.map((rowId, rowIndex) => {
    const rowCells = HEADER_REGION_ORDER.map((region) => {
      const blockIds = header.layoutRows?.[rowId]?.[region] || [];
      const regionBlocks = blockIds
        .map((blockId) => {
          const block = HEADER_BLOCK_DEFS.find((item) => item.id === blockId);
          const enabled = header.blocks?.[blockId]?.enabled !== false;
          return `
            <div
              class="pb-header-layout-card ${enabled ? '' : 'is-disabled'}"
              data-block-id="${blockId}"
              draggable="true"
            >
              <div class="pb-header-layout-card-head">
                <div class="pb-header-layout-card-drag-handle" aria-hidden="true">⠿</div>
                <div>
                  <strong>${escapeHtml(block?.label || blockId)}</strong>
                  <div class="pb-editor-help">${enabled ? 'Visible' : 'Hidden on this page'}</div>
                </div>
                <span class="pb-header-layout-region-chip">${escapeHtml(getRowLabel(rowId))} / ${escapeHtml(getRegionLabel(region))}</span>
              </div>
              <div class="pb-header-layout-actions">
                <button type="button" class="btn-secondary pb-header-layout-button" data-action="move-left" data-block-id="${blockId}" ${region === 'left' ? 'disabled' : ''}>Move Left</button>
                <button type="button" class="btn-secondary pb-header-layout-button" data-action="move-right" data-block-id="${blockId}" ${region === 'right' ? 'disabled' : ''}>Move Right</button>
                <button type="button" class="btn-secondary pb-header-layout-button" data-action="move-up" data-block-id="${blockId}" ${rowIndex === 0 ? 'disabled' : ''}>Move Up</button>
                <button type="button" class="btn-secondary pb-header-layout-button" data-action="move-down" data-block-id="${blockId}" ${rowIndex === HEADER_ROW_ORDER.length - 1 ? 'disabled' : ''}>Move Down</button>
              </div>
            </div>
          `;
        })
        .join('');

      return `
        <div
          class="pb-header-region pb-header-region--board"
          data-row="${rowId}"
          data-region="${region}"
        >
          <div class="pb-header-region-title">${escapeHtml(getRegionLabel(region))}</div>
          ${regionBlocks || '<div class="pb-editor-help pb-header-region-empty">Drop blocks here</div>'}
        </div>
      `;
    }).join('');

    return `
      <div class="pb-header-layout-row" data-row="${rowId}">
        <div class="pb-header-layout-row-title">${escapeHtml(getRowLabel(rowId))}</div>
        <div class="pb-header-layout-row-cells">${rowCells}</div>
      </div>
    `;
  }).join('');

  return renderInspectorSection({
    kicker: 'Placement',
    title: 'Placement',
    summary: '3 rows',
    copy: 'Drag blocks between cells, or use the buttons below each block.',
    body: `<div class="pb-header-layout-grid">${board}</div>`,
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

export function renderHeaderEditorContent({ draftState, pages = [] }) {
  const header = normalizeHeaderConfig(draftState?.header, normalizeHeaderNavItems);
  const copy = normalizeHeaderCopy(draftState?.copy);

  return [
    renderSourceBanner(draftState?.source),
    renderCopyEditor(copy),
    renderPartsEditor(header),
    renderPlacementEditor(header),
    renderNavigationEditor(header, pages),
    renderShellAppearanceEditor(header),
  ].join('');
}

function moveBlockToPlacement(header, blockId, nextRowId, nextRegion) {
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

function moveBlockAcrossRegions(header, blockId, direction) {
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

function moveBlockAcrossRows(header, blockId, direction) {
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
  if (key === 'kind') {
    nextLink.kind = input.value;
    nextLink.pageSlug = '';
    nextLink.url = '';
    nextLink.hash = '';
    nextLink.openInNewTab = false;
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
}) {
  let state = {
    source: draftState?.source || null,
    header: normalizeHeaderConfig(draftState?.header, normalizeHeaderNavItems),
    copy: normalizeHeaderCopy(draftState?.copy),
  };

  const commit = (nextState, options = {}) => {
    const { rerenderEditor = false, rerenderCanvas = true } = options;
    state = {
      source: nextState?.source || state.source || null,
      header: normalizeHeaderConfig(nextState.header, normalizeHeaderNavItems),
      copy: normalizeHeaderCopy(nextState.copy),
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

  const resolveAppearanceTarget = (nextState, scope, index) => {
    if (scope === 'nav-item') {
      return Number.isInteger(index) ? nextState.header.nav.items[index] : null;
    }
    const key = SHELL_APPEARANCE_SCOPE_TO_KEY[scope];
    if (!key) return null;
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

  // ── Placement board: drag-and-drop ────────────────────────────────────
  let draggedBlockId = null;

  el.pbModuleEditor.querySelectorAll('.pb-header-layout-card').forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      draggedBlockId = card.dataset.blockId || null;
      if (!draggedBlockId) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = 'move';
      // Defer class so the card isn't invisible before the drag image is captured.
      requestAnimationFrame(() => card.classList.add('is-dragging'));
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      el.pbModuleEditor.querySelectorAll('.pb-header-region--board').forEach((zone) => {
        zone.classList.remove('is-drag-over');
      });
      draggedBlockId = null;
    });
  });

  el.pbModuleEditor.querySelectorAll('.pb-header-region--board').forEach((zone) => {
    zone.addEventListener('dragover', (event) => {
      if (!draggedBlockId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    });

    zone.addEventListener('dragenter', (event) => {
      if (!draggedBlockId) return;
      event.preventDefault();
      zone.classList.add('is-drag-over');
    });

    zone.addEventListener('dragleave', (event) => {
      // Only remove the class when we leave the zone itself, not a child element.
      if (!zone.contains(/** @type {Node} */ (event.relatedTarget))) {
        zone.classList.remove('is-drag-over');
      }
    });

    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('is-drag-over');
      const targetRowId = zone.dataset.row;
      const targetRegion = zone.dataset.region;
      if (!draggedBlockId || !targetRowId || !targetRegion) return;
      const nextState = cloneValue(state);
      nextState.header = moveBlockToPlacement(
        nextState.header,
        draggedBlockId,
        targetRowId,
        targetRegion
      );
      draggedBlockId = null;
      commit(nextState, { rerenderEditor: true, rerenderCanvas: true });
    });
  });

  el.pbModuleEditor.querySelectorAll('.pb-header-layout-button').forEach((button) => {
    button.addEventListener('click', () => {
      const blockId = button.dataset.blockId;
      const action = button.dataset.action;
      if (!blockId || !action) return;
      const nextState = cloneValue(state);
      if (action === 'move-left') {
        nextState.header = moveBlockAcrossRegions(nextState.header, blockId, -1);
      } else if (action === 'move-right') {
        nextState.header = moveBlockAcrossRegions(nextState.header, blockId, 1);
      } else if (action === 'move-up') {
        nextState.header = moveBlockAcrossRows(nextState.header, blockId, -1);
      } else if (action === 'move-down') {
        nextState.header = moveBlockAcrossRows(nextState.header, blockId, 1);
      }
      commit(nextState, { rerenderEditor: true, rerenderCanvas: true });
    });
  });

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
      if (['kind', 'pageSlug', 'url', 'hash', 'openInNewTab'].includes(key)) {
        updateNavItemLink(item, key, input);
        commit(nextState, {
          rerenderEditor: key === 'kind' || key === 'url',
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

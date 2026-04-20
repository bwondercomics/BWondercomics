import { LAYOUT_OPTIONS, MODULE_TYPES } from './constants.js';
import { escapeAttr, escapeHtml } from './helpers.js';
import {
  HEADER_BLOCK_DEFS,
  HEADER_REGION_ORDER,
  normalizeHeaderCopy,
  resolvePageHeaderState,
} from './header-config.js';
import { normalizeHeaderNavItems } from './link-utils.js';

const INSERTABLE_MODULE_TYPES = MODULE_TYPES.filter((module) => module.type !== 'header');

function formatRegionLabel(region) {
  return String(region || '').replace(/^\w/, (char) => char.toUpperCase());
}

function getHeaderPreviewState({ currentPage, currentSeriesPageConfig, activeHeaderDraft }) {
  return resolvePageHeaderState({
    page: currentPage,
    pageConfig: currentSeriesPageConfig,
    draftState: activeHeaderDraft,
    normalizeNavItems: normalizeHeaderNavItems,
  });
}

function getHeaderBlockPreview(blockId, headerState, currentPage) {
  const copy = normalizeHeaderCopy(headerState.copy, {
    title: currentPage?.title || 'Page Title',
    subtitle: '',
    subtitles: [],
  });
  const enabledNavItems = normalizeHeaderNavItems(headerState.header?.nav?.items || []).filter(
    (item) => item.enabled !== false
  );

  if (blockId === 'brand') {
    const supportingCopy = copy.subtitle || copy.subtitles?.[0] || 'Subtitle line';
    return `
      <span class="pb-page-header-part-primary">${escapeHtml(copy.title || currentPage?.title || 'Page Title')}</span>
      <span class="pb-page-header-part-secondary">${escapeHtml(supportingCopy)}</span>
    `;
  }

  if (blockId === 'nav') {
    if (!enabledNavItems.length) {
      return '<span class="pb-page-header-part-secondary pb-page-header-part-empty">No buttons — add one in Navigation Buttons</span>';
    }
    return `
      <div class="pb-page-header-chip-row">
        ${enabledNavItems
          .slice(0, 4)
          .map((item) => {
            const variant = item.style === 'secondary' ? 'secondary' : 'primary';
            return `<span class="pb-page-header-chip pb-page-header-chip--${variant}">${escapeHtml(item.label)}</span>`;
          })
          .join('')}
        ${enabledNavItems.length > 4 ? '<span class="pb-page-header-chip">…</span>' : ''}
      </div>
    `;
  }

  if (blockId === 'patron') {
    return `
      <div class="pb-page-header-chip-row">
        <span class="pb-page-header-chip">👋 Welcome, reader</span>
      </div>
    `;
  }

  if (blockId === 'status') {
    return `
      <div class="pb-page-header-chip-row">
        <span class="pb-page-header-chip">📢 Status message</span>
      </div>
    `;
  }

  if (blockId === 'entryControls') {
    return `
      <div class="pb-page-header-chip-row">
        <span class="pb-page-header-chip">◀</span>
        <span class="pb-page-header-chip">Ch. 42</span>
        <span class="pb-page-header-chip">▶</span>
      </div>
    `;
  }

  const definition = HEADER_BLOCK_DEFS.find((item) => item.id === blockId);
  return `<span class="pb-page-header-part-secondary">${escapeHtml(definition?.description || '')}</span>`;
}

function renderPageHeaderSurface(state) {
  const headerState = getHeaderPreviewState(state);
  const isSelected = state.selectedCanvasSurface === 'page-header';
  const isDirty = state.dirtyScope === 'header';
  const source = state.activeHeaderDraft?.source;

  let sourceBadge = '';
  if (source === 'legacy-import') {
    sourceBadge = '<span class="pb-page-header-badge pb-page-header-badge--import">Imported</span>';
  } else if (source === 'page-meta-stale') {
    sourceBadge =
      '<span class="pb-page-header-badge pb-page-header-badge--stale">Needs upgrade</span>';
  }

  return `
    <button
      type="button"
      class="pb-page-header-surface ${isSelected ? 'selected' : ''}"
      data-action="select-page-header"
    >
      <div class="pb-page-header-surface-head">
        <div>
          <span class="pb-page-header-kicker">Page Header</span>
          <div class="pb-page-header-title">Click to edit title, buttons, visible parts, and placement</div>
        </div>
        <div class="pb-page-header-badge-group">
          ${sourceBadge}
          ${isDirty ? '<span class="pb-page-header-badge">Unsaved</span>' : '<span class="pb-page-header-badge">Click to edit</span>'}
        </div>
      </div>
      <div class="pb-page-header-surface-layout">
        ${HEADER_REGION_ORDER.map((region) => {
          const blockIds = headerState.header?.regions?.[region] || [];
          return `
            <div class="pb-page-header-region" data-region="${region}">
              <div class="pb-page-header-region-label">${escapeHtml(formatRegionLabel(region))}</div>
              <div class="pb-page-header-region-stack">
                ${
                  blockIds.length
                    ? blockIds
                        .map((blockId) => {
                          const block = HEADER_BLOCK_DEFS.find((item) => item.id === blockId);
                          const enabled = headerState.header?.blocks?.[blockId]?.enabled !== false;
                          return `
                          <div class="pb-page-header-part ${enabled ? '' : 'is-disabled'}">
                            <span class="pb-page-header-part-label">${escapeHtml(block?.label || blockId)}</span>
                            ${getHeaderBlockPreview(blockId, headerState, state.currentPage)}
                          </div>
                        `;
                        })
                        .join('')
                    : '<div class="pb-page-header-empty-region">Empty region</div>'
                }
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </button>
  `;
}

function renderModulePicker(target) {
  const groups = Array.from(new Set(INSERTABLE_MODULE_TYPES.map((module) => module.category)));
  return `
    <div class="pb-inline-picker">
      ${groups
        .map((category) => {
          const items = INSERTABLE_MODULE_TYPES.filter((module) => module.category === category);
          return `
            <div class="pb-inline-picker-group">
              <div class="pb-inline-picker-title">${escapeHtml(category)}</div>
              <div class="pb-inline-picker-grid">
                ${items
                  .map(
                    (module) => `
                      <button
                        type="button"
                        class="pb-inline-picker-item"
                        data-action="insert-module-type"
                        data-module-type="${module.type}"
                        data-section-id="${target.sectionId}"
                        data-column-index="${target.columnIndex}"
                        data-insert-index="${target.insertIndex}"
                      >
                        <span class="pb-inline-picker-icon">${module.icon}</span>
                        <span class="pb-inline-picker-label">${module.label}</span>
                      </button>
                    `
                  )
                  .join('')}
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderModuleInsertBar(sectionId, columnIndex, insertIndex, activeInsertTarget) {
  const isActive =
    activeInsertTarget &&
    activeInsertTarget.sectionId === sectionId &&
    activeInsertTarget.columnIndex === columnIndex &&
    activeInsertTarget.insertIndex === insertIndex;

  return `
    <div
      class="pb-module-insert ${isActive ? 'active' : ''}"
      data-section-id="${sectionId}"
      data-column-index="${columnIndex}"
      data-insert-index="${insertIndex}"
    >
      <button
        type="button"
        class="pb-inline-insert-trigger"
        data-action="toggle-module-picker"
        data-section-id="${sectionId}"
        data-column-index="${columnIndex}"
        data-insert-index="${insertIndex}"
      >
        + Add Module
      </button>
      ${isActive ? renderModulePicker({ sectionId, columnIndex, insertIndex }) : ''}
    </div>
  `;
}

function renderSectionInsertBar(insertIndex) {
  return `
    <div class="pb-section-insert" data-insert-index="${insertIndex}">
      <button
        type="button"
        class="pb-section-insert-trigger"
        data-action="insert-section"
        data-insert-index="${insertIndex}"
      >
        + Add Section
      </button>
    </div>
  `;
}

function renderPageTitle(state, helpers) {
  if (!state.currentPage) return '';

  return `
    <div class="pb-page-title-main">
      <div class="pb-page-title-copy">
        <span class="pb-page-title-label">Editing Page</span>
        <span class="pb-page-title-name">${escapeHtml(helpers.getPageDisplayTitle(state.currentPage))}</span>
        <span class="pb-page-title-meta">${escapeHtml(state.currentPage.slug || 'reader')} · ${escapeHtml(state.currentPage.pageType || 'custom')}</span>
      </div>
      <div class="pb-page-title-actions">
        <span class="pb-page-title-badges">${helpers.renderPageStatusBadges(state.currentPage)}</span>
        <button type="button" class="btn-small btn-secondary pb-page-settings-btn" data-action="select-page-settings">Page Settings</button>
        <a class="pb-open-reader-link" href="${escapeAttr(helpers.getReaderUrl(state.currentPage))}" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(helpers.getReaderLinkLabel(state.currentPage))}
        </a>
      </div>
    </div>
    <div class="pb-page-title-note" data-status="${escapeAttr(helpers.getReaderPreviewStatus(state.currentPage))}">
      ${escapeHtml(helpers.getReaderPreviewNote(state.currentPage))}
    </div>
  `;
}

function getSectionDraft(section, state) {
  if (state.activeSectionId === section.id && state.activeSectionDraft) {
    return state.activeSectionDraft;
  }

  return {
    moduleGap: section.settings?.moduleGap ?? '',
    columnGap: section.settings?.columnGap ?? '',
    sectionGap: section.settings?.sectionGap ?? '',
  };
}

function renderCanvasSection(section, sectionIndex, state, helpers) {
  const layoutValue = section.layout || '1';
  const columnCount = layoutValue.split('-').length;
  const columnIndices = Array.from({ length: columnCount }, (_, index) => index);
  const moduleCount = helpers.getVisibleSectionModuleCount(section);
  const isSettingsOpen = state.activeSectionId === section.id;
  const sectionDraft = getSectionDraft(section, state);

  return `
    ${renderSectionInsertBar(sectionIndex)}
    <div class="pb-section ${isSettingsOpen ? 'pb-section--active' : ''}" data-section-id="${section.id}">
      <div class="pb-section-header">
        <div class="pb-section-header-main">
          <button
            type="button"
            class="pb-section-drag-handle"
            data-action="section-drag"
            data-section-id="${section.id}"
            draggable="true"
            title="Reorder section"
          >
            \u22EE
          </button>
          <div class="pb-section-summary">
            <span class="pb-section-summary-title">Section ${sectionIndex + 1}</span>
            <span class="pb-section-summary-meta">${moduleCount} module${moduleCount === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div class="pb-section-header-actions">
          <select class="pb-section-layout-select" data-action="change-layout" data-section-id="${section.id}">
            ${LAYOUT_OPTIONS.map(
              (option) => `
                <option value="${option.value}" ${layoutValue === option.value ? 'selected' : ''}>${option.label}</option>
              `
            ).join('')}
          </select>
          <button
            type="button"
            class="btn-small btn-secondary pb-section-settings-toggle"
            data-action="toggle-section-settings"
            data-section-id="${section.id}"
          >
            ${isSettingsOpen ? 'Hide Settings' : 'Section Settings'}
          </button>
          <button class="pb-page-action delete" data-action="delete-section" data-section-id="${section.id}" title="Delete section">\u00D7</button>
        </div>
      </div>
      ${
        isSettingsOpen
          ? `
            <div class="pb-section-settings-card">
              <div class="pb-section-settings-grid">
                <label class="pb-section-settings-field">
                  <span>Module Gap</span>
                  <input type="number" class="pb-section-settings-input" data-setting="moduleGap" value="${escapeAttr(String(sectionDraft.moduleGap ?? ''))}" min="0" step="1" placeholder="16">
                </label>
                <label class="pb-section-settings-field">
                  <span>Column Gap</span>
                  <input type="number" class="pb-section-settings-input" data-setting="columnGap" value="${escapeAttr(String(sectionDraft.columnGap ?? ''))}" min="0" step="1" placeholder="16">
                </label>
                <label class="pb-section-settings-field">
                  <span>Section Gap</span>
                  <input type="number" class="pb-section-settings-input" data-setting="sectionGap" value="${escapeAttr(String(sectionDraft.sectionGap ?? ''))}" min="0" step="1" placeholder="24">
                </label>
              </div>
              <div class="pb-section-settings-actions">
                <div class="pb-section-settings-status">${state.dirtyScope === 'section' ? 'Section settings have unsaved changes.' : 'Section spacing saves explicitly.'}</div>
                <div class="pb-section-settings-buttons">
                  <button type="button" class="btn-secondary" data-action="discard-section-settings" ${state.dirtyScope === 'section' ? '' : 'disabled'}>Discard</button>
                  <button type="button" class="btn-primary" data-action="save-section-settings" ${state.dirtyScope === 'section' ? '' : 'disabled'}>Save</button>
                </div>
              </div>
            </div>
          `
          : ''
      }
      <div class="pb-section-columns" data-layout="${layoutValue}">
        ${columnIndices
          .map((columnIndex) => {
            const modules = helpers.sortCanvasModulesForColumn(section, columnIndex);
            return `
              <div class="pb-column" data-column-index="${columnIndex}" data-section-id="${section.id}">
                ${renderModuleInsertBar(section.id, columnIndex, 0, state.activeInsertTarget)}
                ${modules
                  .map(
                    (module, moduleIndex) => `
                      <div
                        class="pb-module ${state.selectedModuleId === module.id ? 'selected' : ''}"
                        data-module-id="${module.id}"
                        data-module-type="${module.moduleType}"
                        draggable="true"
                      >
                        <div class="pb-module-header">
                          <div class="pb-module-header-main">
                            <button type="button" class="pb-module-drag-handle" title="Move module">\u22EE</button>
                            <span class="pb-module-type-badge">${module.moduleType}</span>
                            ${state.dirtyScope === 'module' && state.selectedModuleId === module.id ? '<span class="pb-module-draft-badge">Draft</span>' : ''}
                          </div>
                          <button class="pb-page-action delete" data-action="delete-module" data-module-id="${module.id}" title="Delete">\u00D7</button>
                        </div>
                        <div class="pb-module-preview">${escapeHtml(helpers.getModulePreview(module.moduleType, module.config || {}))}</div>
                      </div>
                      ${renderModuleInsertBar(section.id, columnIndex, moduleIndex + 1, state.activeInsertTarget)}
                    `
                  )
                  .join('')}
              </div>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

export function renderCanvasSnapshot({ state, helpers }) {
  const pageTitleHtml = renderPageTitle(state, helpers);

  if (!state.currentPage) {
    return {
      pageTitleHtml,
      canvasHtml: `
        <div class="pb-canvas-empty">
          <p>Select a page from the sidebar or create a new one to get started.</p>
        </div>
      `,
    };
  }

  const sections = helpers.sortSections(state.currentPage.sections || []);
  const canvasNotice = state.canvasStatus.message
    ? `<div class="pb-canvas-notice" data-status="${escapeAttr(state.canvasStatus.type || 'neutral')}" id="pbCanvasNotice">${escapeHtml(state.canvasStatus.message)}</div>`
    : '';

  return {
    pageTitleHtml,
    canvasHtml: `
      ${canvasNotice}
      ${renderPageHeaderSurface(state)}
      ${sections.map((section, index) => renderCanvasSection(section, index, state, helpers)).join('')}
      ${renderSectionInsertBar(sections.length)}
    `,
  };
}

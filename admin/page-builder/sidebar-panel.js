import { getInsertableModuleDescriptors } from '../../shared/page-builder/module-descriptors.js';
import { BUILDER_STRUCTURAL_COMMANDS } from './structural-commands.js';
import { escapeAttr, escapeHtml } from '../../shared/page-builder/helpers.js';

const INSERTABLE_MODULE_TYPES = getInsertableModuleDescriptors();

let draggedSidebarPageId = null;

export function createSidebarPanel({ el, getState, actions, helpers }) {
  function runBuilderCommand(id, payload = {}) {
    return actions.runCommand?.(id, payload) ?? actions.runStructuralCommand?.(id, payload);
  }

  function sortSections(sections = []) {
    return sections.slice().sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
  }

  function sortModules(modules = []) {
    return modules.slice().sort((a, b) => {
      if ((a.columnIndex ?? 0) !== (b.columnIndex ?? 0)) {
        return (a.columnIndex ?? 0) - (b.columnIndex ?? 0);
      }
      return (a.sortIndex ?? 0) - (b.sortIndex ?? 0);
    });
  }

  function formatCategoryLabel(category = '') {
    return String(category || 'other').replace(/^\w/, (char) => char.toUpperCase());
  }

  function getPageScopeLabel(page) {
    return page?.scope === 'global' ? 'Global' : 'Series';
  }

  function isReaderBinding(page, pageBindings) {
    return page?.id && pageBindings?.bindings?.reader?.pageId === page.id;
  }

  function renderScopeControls(activePageScope, pageBindings) {
    const warnings = Array.isArray(pageBindings?.warnings) ? pageBindings.warnings : [];
    const warningHtml =
      activePageScope === 'series' && warnings.length
        ? `<div class="pb-page-scope-warning">${warnings
            .map((warning) => escapeHtml(warning.message || 'Page binding needs attention.'))
            .join(' ')}</div>`
        : '';
    return `
      <div class="pb-page-scope-controls" role="group" aria-label="Page scope">
        <button type="button" class="pb-page-scope-toggle ${activePageScope === 'series' ? 'active' : ''}" data-page-scope="series">Series Pages</button>
        <button type="button" class="pb-page-scope-toggle ${activePageScope === 'global' ? 'active' : ''}" data-page-scope="global">Global Pages</button>
      </div>
      ${warningHtml}
    `;
  }

  function getLayoutColumnCount(layout = '1') {
    return String(layout || '1')
      .split('-')
      .filter(Boolean).length;
  }

  function getLayerColumnIndices(section) {
    const layoutColumnCount = getLayoutColumnCount(section?.layout || '1');
    const moduleColumnMax = Math.max(
      -1,
      ...(section?.modules || []).map((module) => Number(module.columnIndex) || 0)
    );
    const columnCount = Math.max(layoutColumnCount, moduleColumnMax + 1);
    return Array.from({ length: columnCount }, (_, index) => index);
  }

  function renderPageList() {
    if (!el.pbPageList) return;

    const { activePageScope = 'series', currentPage, pageBindings, pages } = getState();

    const controlsHtml = renderScopeControls(activePageScope, pageBindings);

    if (pages.length === 0) {
      el.pbPageList.innerHTML = `
        ${controlsHtml}
        <div class="pb-page-list-empty" style="color: rgba(255,255,255,0.5); font-size: 0.85rem; padding: 10px;">
          No ${activePageScope === 'global' ? 'global' : 'series'} pages yet. Create one to get started.
        </div>
      `;
      bindPageScopeControls();
      return;
    }

    el.pbPageList.innerHTML =
      controlsHtml +
      pages
        .map(
          (page) => `
          <div class="pb-page-item ${currentPage?.id === page.id ? 'active' : ''}" data-page-id="${page.id}" draggable="true">
            <div class="pb-page-item-main">
              <button type="button" class="pb-page-drag-handle" title="Move page" aria-label="Move page">\u22EE</button>
              <span class="pb-page-item-copy">
                <span class="pb-page-item-title" title="${escapeAttr(helpers.getPageDisplayTitle(page))}">${escapeHtml(helpers.getPageDisplayTitle(page))}</span>
                <span class="pb-page-item-meta">${escapeHtml(page.slug || 'reader')} · ${escapeHtml(page.pageType || 'custom')} · ${escapeHtml(getPageScopeLabel(page))}</span>
              </span>
            </div>
            <span class="pb-page-item-badges">${helpers.renderPageStatusBadges(page)}</span>
            <span class="pb-page-item-actions">
              ${
                activePageScope === 'series'
                  ? `<button class="pb-page-action reader" data-action="reader" title="Set as reader page" ${isReaderBinding(page, pageBindings) ? 'disabled' : ''}>Reader</button>`
                  : ''
              }
              <button class="pb-page-action delete" data-action="delete" title="Delete page">\u00D7</button>
            </span>
          </div>
        `
        )
        .join('');

    bindPageScopeControls();

    el.pbPageList.querySelectorAll('.pb-page-item').forEach((item) => {
      item.addEventListener('click', async (event) => {
        if (
          event.target.closest('.pb-page-action') ||
          event.target.closest('.pb-page-drag-handle')
        ) {
          return;
        }
        await actions.selectPage(item.dataset.pageId);
      });

      item.querySelector('.pb-page-action.delete')?.addEventListener('click', async (event) => {
        event.stopPropagation();
        await actions.deletePage(item.dataset.pageId);
      });

      item.querySelector('.pb-page-action.reader')?.addEventListener('click', async (event) => {
        event.stopPropagation();
        await actions.updateReaderBinding?.(item.dataset.pageId);
      });

      item.addEventListener('dragstart', (event) => {
        draggedSidebarPageId = item.dataset.pageId;
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
        }
        item.style.opacity = '0.5';
      });

      item.addEventListener('dragend', () => {
        draggedSidebarPageId = null;
        item.style.opacity = '';
        el.pbPageList.querySelectorAll('.pb-page-item').forEach((el) => {
          el.style.borderTop = '';
          el.style.borderBottom = '';
        });
      });

      item.addEventListener('dragover', (event) => {
        if (!draggedSidebarPageId || draggedSidebarPageId === item.dataset.pageId) return;
        event.preventDefault();
        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (event.clientY < midY) {
          item.style.borderTop = '2px solid var(--accent-color)';
          item.style.borderBottom = '';
          item.dataset.dragOver = 'top';
        } else {
          item.style.borderTop = '';
          item.style.borderBottom = '2px solid var(--accent-color)';
          item.dataset.dragOver = 'bottom';
        }
      });

      item.addEventListener('dragleave', () => {
        item.style.borderTop = '';
        item.style.borderBottom = '';
        delete item.dataset.dragOver;
      });

      item.addEventListener('drop', async (event) => {
        if (!draggedSidebarPageId || draggedSidebarPageId === item.dataset.pageId) return;
        event.preventDefault();

        const isTop = item.dataset.dragOver === 'top';
        item.style.borderTop = '';
        item.style.borderBottom = '';
        delete item.dataset.dragOver;

        const currentPages = getState().pages;
        const pageIds = currentPages.map((p) => p.id);
        const draggedIdx = pageIds.indexOf(draggedSidebarPageId);

        if (draggedIdx === -1) return;

        pageIds.splice(draggedIdx, 1);
        const newTargetIdx = pageIds.indexOf(item.dataset.pageId);
        const insertIdx = isTop ? newTargetIdx : newTargetIdx + 1;

        pageIds.splice(insertIdx, 0, draggedSidebarPageId);

        draggedSidebarPageId = null;
        await actions.reorderSidebarPages(pageIds);
      });
    });
  }

  function bindPageScopeControls() {
    el.pbPageList?.querySelectorAll('.pb-page-scope-toggle').forEach((button) => {
      button.addEventListener('click', async () => {
        await actions.switchPageScope?.(button.dataset.pageScope);
      });
    });
  }

  function renderModulePalette() {
    if (!el.pbModulePalette) return;

    const categories = Array.from(
      new Set(INSERTABLE_MODULE_TYPES.map((module) => module.category))
    );
    el.pbModulePalette.innerHTML = categories
      .map((category) => {
        const modules = INSERTABLE_MODULE_TYPES.filter((module) => module.category === category);
        return `
          <div class="pb-block-group" data-block-category="${category}">
            <div class="pb-block-group-title">${escapeHtml(formatCategoryLabel(category))}</div>
            <div class="pb-block-group-grid">
              ${modules
                .map(
                  (module) => `
                    <div class="pb-module-type" draggable="true" data-module-type="${module.type}">
                      <span class="pb-module-type-icon" aria-hidden="true">${module.icon}</span>
                      <span class="pb-module-type-label" title="${escapeAttr(module.label)}">${escapeHtml(module.label)}</span>
                    </div>
                  `
                )
                .join('')}
            </div>
          </div>
        `;
      })
      .join('');

    el.pbModulePalette.querySelectorAll('.pb-module-type').forEach((item) => {
      item.addEventListener('dragstart', (event) => {
        actions.setDraggedModuleId(null);
        const result = runBuilderCommand(BUILDER_STRUCTURAL_COMMANDS.DRAG_START, {
          source: 'block',
          moduleType: item.dataset.moduleType,
        });
        if (result?.ok === false) {
          event.preventDefault();
          return;
        }
        if (event.dataTransfer) {
          event.dataTransfer.setData('text/plain', item.dataset.moduleType);
          event.dataTransfer.setData('application/x-bw-builder-block', item.dataset.moduleType);
          event.dataTransfer.effectAllowed = 'copy';
        }
      });
      item.addEventListener('dragend', () => {
        runBuilderCommand(BUILDER_STRUCTURAL_COMMANDS.DRAG_END);
      });
      item.addEventListener('click', async () => {
        const { activeInsertTarget } = getState();
        if (!activeInsertTarget) return;
        await runBuilderCommand(BUILDER_STRUCTURAL_COMMANDS.INSERT, {
          moduleType: item.dataset.moduleType,
          placement: activeInsertTarget,
        });
      });
    });
  }

  function renderLayerTree() {
    if (!el.pbLayerTree) return;

    const { activeSectionId, currentPage, selectedCanvasSurface, selectedModuleId } = getState();
    if (!currentPage) {
      el.pbLayerTree.innerHTML = `
        <div class="pb-layer-empty">
          Select a page to inspect its layers.
        </div>
      `;
      return;
    }

    const sections = sortSections(currentPage.sections || []);
    const sectionsHtml = sections.length
      ? sections
          .map((section, sectionIndex) => {
            const columnIndices = getLayerColumnIndices(section);
            const columnsHtml = columnIndices
              .map((columnIndex) => {
                const modules = sortModules(section.modules || []).filter(
                  (module) => (Number(module.columnIndex) || 0) === columnIndex
                );
                const modulesHtml = modules.length
                  ? modules
                      .map(
                        (module) => `
                          <div class="pb-layer-row pb-layer-row--module">
                            <button
                              type="button"
                              class="pb-layer-item pb-layer-item--module ${selectedModuleId === module.id ? 'active' : ''}"
                              data-layer-action="select-module"
                              data-layer-drag-source="module"
                              data-module-id="${escapeHtml(module.id || '')}"
                              draggable="true"
                            >
                              <span class="pb-layer-item-label">${escapeHtml(helpers.getModuleLabel(module.moduleType))}</span>
                              <span class="pb-layer-item-meta">Module</span>
                            </button>
                            <button
                              type="button"
                              class="pb-layer-row-action"
                              data-layer-action="delete-module"
                              data-module-id="${escapeHtml(module.id || '')}"
                            >
                              Delete
                            </button>
                          </div>
                        `
                      )
                      .join('')
                  : '<div class="pb-layer-empty pb-layer-empty--nested">Empty column</div>';
                return `
                  <div class="pb-layer-column" data-section-id="${escapeHtml(section.id || '')}" data-column-index="${columnIndex}">
                    <button
                      type="button"
                      class="pb-layer-item pb-layer-item--column ${selectedCanvasSurface === 'section' && activeSectionId === section.id ? 'active' : ''}"
                      data-layer-action="select-column"
                      data-section-id="${escapeHtml(section.id || '')}"
                      data-column-index="${columnIndex}"
                    >
                      <span class="pb-layer-item-label">Column ${columnIndex + 1}</span>
                      <span class="pb-layer-item-meta">${modules.length} module${modules.length === 1 ? '' : 's'}</span>
                    </button>
                    <div class="pb-layer-section-modules">${modulesHtml}</div>
                  </div>
                `;
              })
              .join('');
            return `
              <div class="pb-layer-section">
                <div class="pb-layer-row pb-layer-row--section">
                  <button
                    type="button"
                    class="pb-layer-item pb-layer-item--section ${selectedCanvasSurface === 'section' && activeSectionId === section.id ? 'active' : ''}"
                    data-layer-action="select-section"
                    data-layer-drag-source="section"
                    data-section-id="${escapeHtml(section.id || '')}"
                    draggable="true"
                  >
                    <span class="pb-layer-item-label">Section ${sectionIndex + 1}</span>
                    <span class="pb-layer-item-meta">${escapeHtml(section.layout || '1')}</span>
                  </button>
                  <button
                    type="button"
                    class="pb-layer-row-action"
                    data-layer-action="delete-section"
                    data-section-id="${escapeHtml(section.id || '')}"
                  >
                    Delete
                  </button>
                </div>
                <div class="pb-layer-columns">${columnsHtml}</div>
              </div>
            `;
          })
          .join('')
      : '<div class="pb-layer-empty">This page has no sections.</div>';

    el.pbLayerTree.innerHTML = `
      <div class="pb-layer-root">
        <button
          type="button"
          class="pb-layer-item ${selectedCanvasSurface === 'page-settings' ? 'active' : ''}"
          data-layer-action="select-page-settings"
        >
          <span class="pb-layer-item-label">${escapeHtml(helpers.getPageDisplayTitle(currentPage))}</span>
          <span class="pb-layer-item-meta">Page settings</span>
        </button>
        <button
          type="button"
          class="pb-layer-item ${selectedCanvasSurface === 'page-header' ? 'active' : ''}"
          data-layer-action="select-page-header"
        >
          <span class="pb-layer-item-label">Page Header</span>
          <span class="pb-layer-item-meta">Header surface</span>
        </button>
        ${sectionsHtml}
      </div>
    `;

    el.pbLayerTree.querySelectorAll('[data-layer-action="select-page-settings"]').forEach((item) =>
      item.addEventListener('click', () => {
        actions.selectPageSettings();
      })
    );
    el.pbLayerTree.querySelectorAll('[data-layer-action="select-page-header"]').forEach((item) =>
      item.addEventListener('click', () => {
        actions.selectPageHeader();
      })
    );
    el.pbLayerTree.querySelectorAll('[data-layer-action="select-module"]').forEach((item) =>
      item.addEventListener('click', () => {
        actions.selectModule(item.dataset.moduleId);
      })
    );
    el.pbLayerTree.querySelectorAll('[data-layer-action="select-section"]').forEach((item) =>
      item.addEventListener('click', () => {
        actions.selectSection(item.dataset.sectionId);
      })
    );
    el.pbLayerTree.querySelectorAll('[data-layer-action="select-column"]').forEach((item) =>
      item.addEventListener('click', () => {
        actions.selectColumn(item.dataset.sectionId, Number(item.dataset.columnIndex) || 0);
      })
    );
    el.pbLayerTree.querySelectorAll('[data-layer-drag-source]').forEach((item) => {
      item.addEventListener('dragstart', (event) => {
        const source = item.dataset.layerDragSource;
        const payload =
          source === 'section'
            ? { source, sectionId: item.dataset.sectionId }
            : { source, moduleId: item.dataset.moduleId };
        const result = runBuilderCommand(BUILDER_STRUCTURAL_COMMANDS.DRAG_START, payload);
        if (result?.ok === false) {
          event.preventDefault();
          return;
        }
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', item.dataset.moduleId || item.dataset.sectionId);
        }
      });
      item.addEventListener('dragend', () => {
        runBuilderCommand(BUILDER_STRUCTURAL_COMMANDS.DRAG_END);
      });
    });
    el.pbLayerTree.querySelectorAll('[data-layer-action="delete-module"]').forEach((item) =>
      item.addEventListener('click', async (event) => {
        event.stopPropagation();
        await runBuilderCommand(BUILDER_STRUCTURAL_COMMANDS.DELETE_SELECTED, {
          target: { kind: 'module', moduleId: item.dataset.moduleId },
        });
      })
    );
    el.pbLayerTree.querySelectorAll('[data-layer-action="delete-section"]').forEach((item) =>
      item.addEventListener('click', async (event) => {
        event.stopPropagation();
        await runBuilderCommand(BUILDER_STRUCTURAL_COMMANDS.DELETE_SELECTED, {
          target: { kind: 'section', sectionId: item.dataset.sectionId },
        });
      })
    );
  }

  function bindSidebarTabs() {
    const sidebar = document.querySelector('.page-builder-sidebar');
    if (!sidebar) return;

    sidebar.querySelectorAll('.pb-sidebar-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        if (target === 'settings' || target === 'styles') {
          const nextInspectorTab = target === 'styles' ? 'theme' : 'modules';
          if (!actions.selectInspectorTab(nextInspectorTab)) return;
        }
        actions.setActiveSidePanelTab(target);

        sidebar
          .querySelectorAll('.pb-sidebar-tab')
          .forEach((button) => button.classList.remove('active'));
        tab.classList.add('active');

        const contentTarget = target === 'settings' || target === 'styles' ? 'inspector' : target;
        sidebar.querySelectorAll('.pb-sidebar-content').forEach((content) => {
          content.hidden = content.dataset.content !== contentTarget;
        });

        actions.syncSidebarRailLabel();
      });
    });
  }

  return {
    renderPageList,
    renderLayerTree,
    renderModulePalette,
    bindSidebarTabs,
  };
}

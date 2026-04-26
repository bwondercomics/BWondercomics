import { MODULE_TYPES } from './constants.js';
import { escapeHtml } from './helpers.js';

const INSERTABLE_MODULE_TYPES = MODULE_TYPES.filter((module) => module.type !== 'header');

let draggedSidebarPageId = null;

export function createSidebarPanel({ el, getState, actions, helpers }) {
  function renderPageList() {
    if (!el.pbPageList) return;

    const { currentPage, pages } = getState();

    if (pages.length === 0) {
      el.pbPageList.innerHTML = `
        <div class="pb-page-list-empty" style="color: rgba(255,255,255,0.5); font-size: 0.85rem; padding: 10px;">
          No pages yet. Create one to get started.
        </div>
      `;
      return;
    }

    el.pbPageList.innerHTML = pages
      .map(
        (page) => `
          <div class="pb-page-item ${currentPage?.id === page.id ? 'active' : ''}" data-page-id="${page.id}" draggable="true">
            <div class="pb-page-item-main">
              <button type="button" class="pb-page-drag-handle" title="Move page" style="background:none;border:none;color:currentColor;cursor:grab;padding:0 8px 0 0;font-size:1.1rem;opacity:0.3;">\u22EE</button>
              <span class="pb-page-item-title">${escapeHtml(helpers.getPageDisplayTitle(page))}</span>
              <span class="pb-page-item-meta">${escapeHtml(page.slug || 'reader')} · ${escapeHtml(page.pageType || 'custom')}</span>
            </div>
            <span class="pb-page-item-badges">${helpers.renderPageStatusBadges(page)}</span>
            <span class="pb-page-item-actions">
              <button class="pb-page-action delete" data-action="delete" title="Delete page">\u00D7</button>
            </span>
          </div>
        `
      )
      .join('');

    el.pbPageList.querySelectorAll('.pb-page-item').forEach((item) => {
      item.addEventListener('click', async (event) => {
        if (event.target.closest('.pb-page-action') || event.target.closest('.pb-page-drag-handle')) return;
        await actions.selectPage(item.dataset.pageId);
      });

      item.querySelector('.pb-page-action.delete')?.addEventListener('click', async (event) => {
        event.stopPropagation();
        await actions.deletePage(item.dataset.pageId);
      });

      item.addEventListener('dragstart', (event) => {
        draggedSidebarPageId = item.dataset.pageId;
        event.dataTransfer.effectAllowed = 'move';
        item.style.opacity = '0.5';
      });

      item.addEventListener('dragend', () => {
        draggedSidebarPageId = null;
        item.style.opacity = '';
        el.pbPageList.querySelectorAll('.pb-page-item').forEach(el => {
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
        const pageIds = currentPages.map(p => p.id);
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

  function renderModulePalette() {
    if (!el.pbModulePalette) return;

    el.pbModulePalette.innerHTML = INSERTABLE_MODULE_TYPES.map(
      (module) => `
        <div class="pb-module-type" draggable="true" data-module-type="${module.type}">
          <span class="pb-module-type-icon">${module.icon}</span>
          <span class="pb-module-type-label">${module.label}</span>
        </div>
      `
    ).join('');

    el.pbModulePalette.querySelectorAll('.pb-module-type').forEach((item) => {
      item.addEventListener('dragstart', (event) => {
        actions.setDraggedModuleId(null);
        event.dataTransfer.setData('text/plain', item.dataset.moduleType);
        event.dataTransfer.effectAllowed = 'copy';
      });
    });
  }

  function bindSidebarTabs() {
    const sidebar = document.querySelector('.page-builder-sidebar');
    if (!sidebar) return;

    sidebar.querySelectorAll('.pb-sidebar-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        sidebar
          .querySelectorAll('.pb-sidebar-tab')
          .forEach((button) => button.classList.remove('active'));
        tab.classList.add('active');

        const target = tab.dataset.tab;
        sidebar.querySelectorAll('.pb-sidebar-content').forEach((content) => {
          content.hidden = content.dataset.content !== target;
        });

        actions.syncSidebarRailLabel();
      });
    });
  }

  return {
    renderPageList,
    renderModulePalette,
    bindSidebarTabs,
  };
}

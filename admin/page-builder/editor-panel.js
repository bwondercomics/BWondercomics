import { escapeHtml } from './helpers.js';
import { bindHeaderEditorEvents, renderHeaderEditorContent } from './header-editor.js';
import { bindModuleEditorEvents, renderModuleEditorContent } from './module-editor.js';
import { bindThemeEditorEvents, renderThemeEditorContent } from './theme-editor.js';

function renderPageSettingsContent(draft) {
  if (!draft) return '';
  return `
    <div class="form-editor">
      <div class="form-group">
        <label class="form-label" for="pbEditPageSlug">Page Slug</label>
        <input type="text" id="pbEditPageSlug" class="form-input" value="${escapeHtml(draft.slug)}" />
        <div class="settings-note">Used in the URL (letters, numbers, dashes).</div>
      </div>
      <div class="form-group">
        <label class="form-label" for="pbEditPageTitle">Page Title</label>
        <input type="text" id="pbEditPageTitle" class="form-input" value="${escapeHtml(draft.title)}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="pbEditPageType">Page Type</label>
        <input type="text" id="pbEditPageType" class="form-input" value="${escapeHtml(draft.pageType || '')}" />
        <div class="settings-note">e.g., custom, reader, gallery.</div>
      </div>
      <div class="form-group">
        <label style="display: flex; align-items: center; gap: 10px; font-size: 0.95rem;">
          <input type="checkbox" id="pbEditIsHomepage" ${draft.isHomepage ? 'checked' : ''} />
          Is Homepage
        </label>
        <div class="settings-note" style="margin-top: 6px;">Check to make this page the default landing page for the series.</div>
      </div>
    </div>
  `;
}

function renderTabs(activeEditorTab, disableTabs = false) {
  return `
    <div class="pb-editor-tabs" data-count="2" role="tablist" aria-label="Inspector tabs">
      <button
        class="pb-editor-tab ${activeEditorTab === 'modules' ? 'active' : ''}"
        data-tab="modules"
        role="tab"
        aria-selected="${String(activeEditorTab === 'modules')}"
        ${disableTabs ? 'disabled' : ''}
      >
        Modules
      </button>
      <button
        class="pb-editor-tab ${activeEditorTab === 'theme' ? 'active' : ''}"
        data-tab="theme"
        role="tab"
        aria-selected="${String(activeEditorTab === 'theme')}"
        ${disableTabs ? 'disabled' : ''}
      >
        Theme
      </button>
    </div>
  `;
}

function renderFooter({ scope, actionsHtml = '' }) {
  return `
    <div class="pb-editor-footer" data-scope="${scope}">
      <div class="pb-editor-footer-status" data-editor-status></div>
      <div class="pb-editor-footer-actions">${actionsHtml}</div>
    </div>
  `;
}

function renderShell({
  activeEditorTab,
  kicker,
  title,
  subtitle,
  contentHtml,
  footerHtml = '',
  disableTabs = false,
}) {
  return `
    <div class="pb-editor-shell">
      <div class="pb-editor-header">
        <div class="pb-editor-header-copy">
          <div class="pb-editor-heading-line">
            <span class="pb-editor-kicker">${escapeHtml(kicker)}</span>
            <h3 class="pb-editor-title" id="pbEditorTitle">${escapeHtml(title)}</h3>
          </div>
          <p class="pb-editor-subtitle">${escapeHtml(subtitle)}</p>
        </div>
        ${renderTabs(activeEditorTab, disableTabs)}
      </div>
      <div class="pb-editor-content">${contentHtml}</div>
      ${footerHtml}
    </div>
  `;
}

export function createEditorPanelRenderer({ el, getState, actions, helpers, deps }) {
  function renderEditorPanel() {
    if (!el.pbModuleEditor) return;

    let state = getState();

    if (!state.currentPage) {
      el.pbModuleEditor.innerHTML = renderShell({
        activeEditorTab: state.activeEditorTab,
        kicker: 'Inspector',
        title: 'Choose a Page',
        subtitle:
          'Select a page on the left to unlock page-header editing, module editing, and theme controls.',
        contentHtml: `
          <div class="pb-editor-empty">
            <div class="pb-editor-empty-card">
              <span class="pb-editor-empty-kicker">Start Here</span>
              <h4>Pick a page from the left rail</h4>
              <p>Once a page is active, click the page header or a module in the canvas to edit it. Theme still handles page-wide styling.</p>
            </div>
          </div>
        `,
        disableTabs: true,
      });
      return;
    }

    const selectedModule = helpers.getSelectedModuleRecord(state.selectedModuleId);
    if (!state.activeThemeDraft) {
      actions.initializeThemeDraft();
    }
    if (!state.activeHeaderDraft) {
      actions.initializeHeaderDraft();
    }
    if (!state.activePageSettingsDraft) {
      actions.initializePageSettingsDraft();
    }
    if (selectedModule && state.activeModuleDraftId !== selectedModule.id) {
      actions.initializeModuleDraft(selectedModule.id);
    }

    state = getState();

    const selectedModuleRecord = helpers.getSelectedModuleRecord(state.selectedModuleId);
    const pageTitle = helpers.getPageDisplayTitle(state.currentPage);
    let contentHtml = '';
    let footerHtml = '';
    let kicker = 'Inspector';
    let title = 'Page Inspector';
    let subtitle = `Adjust structure and visual polish for ${pageTitle}.`;

    if (state.activeEditorTab === 'theme') {
      contentHtml = renderThemeEditorContent(state.currentPage, state.activeThemeDraft);
      kicker = 'Theme Studio';
      title = 'Page Theme';
      subtitle = `Tune presets, palette, panel backgrounds, and spacing for ${pageTitle}.`;
      footerHtml = renderFooter({
        scope: 'theme',
        actionsHtml: `
          <button class="btn-secondary" id="pbDiscardTheme" data-action="discard-current" type="button">Discard</button>
          <button class="btn-secondary" id="pbResetTheme" data-action="reset-theme" type="button">Reset to Default</button>
          <button class="btn-primary" id="pbSaveTheme" data-action="save-current" type="button">Save Theme</button>
        `,
      });
    } else if (state.selectedCanvasSurface === 'page-header') {
      contentHtml = renderHeaderEditorContent({
        draftState: state.activeHeaderDraft,
        pages: state.pages,
      });
      kicker = 'Page Header';
      title = 'Header Settings';
      subtitle = `Configure what readers see in the header for ${pageTitle}.`;
      footerHtml = renderFooter({
        scope: 'header',
        actionsHtml: `
          <button class="btn-secondary" id="pbDiscardHeader" data-action="discard-current" type="button">Discard</button>
          <button class="btn-primary" id="pbSaveHeader" data-action="save-current" type="button">Save Header</button>
        `,
      });
    } else if (state.selectedCanvasSurface === 'page-settings') {
      contentHtml = renderPageSettingsContent(state.activePageSettingsDraft);
      kicker = 'Page Settings';
      title = 'Metadata Configuration';
      subtitle = `Adjust URL slug, title, type, and homepage status for ${pageTitle}.`;
      footerHtml = renderFooter({
        scope: 'page-settings',
        actionsHtml: `
          <button class="btn-secondary" id="pbDiscardPageSettings" data-action="discard-current" type="button">Discard</button>
          <button class="btn-primary" id="pbSavePageSettings" data-action="save-current" type="button">Save Settings</button>
        `,
      });
    } else {
      contentHtml = renderModuleEditorContent({
        currentPage: state.currentPage,
        selectedModuleId: state.selectedModuleId,
        draftConfig: selectedModuleRecord ? state.activeModuleDraft : null,
        pages: state.pages,
      });
      kicker = selectedModuleRecord ? 'Selected Module' : 'Module Inspector';
      title = selectedModuleRecord
        ? `${helpers.getModuleLabel(selectedModuleRecord.moduleType)} Module`
        : 'Choose Something to Edit';
      subtitle = selectedModuleRecord
        ? `Editing ${helpers.getModulePreview(selectedModuleRecord.moduleType, state.activeModuleDraft || selectedModuleRecord.config || {})}.`
        : 'Click the page header or a module in the canvas to edit it. Theme still controls page-wide styling.';
      if (selectedModuleRecord) {
        footerHtml = renderFooter({
          scope: 'module',
          actionsHtml: `
            <button class="btn-secondary" id="pbDiscardModule" data-action="discard-current" type="button">Discard</button>
            <button class="btn-secondary" id="pbDeleteModule" data-action="delete-module" type="button">Delete</button>
            <button class="btn-primary" id="pbSaveModule" data-action="save-current" type="button">Save</button>
          `,
        });
      }
    }

    el.pbModuleEditor.innerHTML = renderShell({
      activeEditorTab: state.activeEditorTab,
      kicker,
      title,
      subtitle,
      contentHtml,
      footerHtml,
    });

    el.pbModuleEditor.querySelectorAll('.pb-editor-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const nextTab = tab.dataset.tab;
        if (nextTab === getState().activeEditorTab) return;
        if (
          !actions.ensureCleanWorkspace(
            'Save or discard your current changes before switching inspector tabs.'
          )
        ) {
          renderEditorPanel();
          return;
        }

        actions.setActiveEditorTab(nextTab);
        const nextState = getState();
        if (nextTab === 'theme') {
          actions.initializeThemeDraft();
        } else if (nextState.selectedCanvasSurface === 'page-header') {
          actions.initializeHeaderDraft();
        } else if (nextState.selectedCanvasSurface === 'page-settings') {
          actions.initializePageSettingsDraft();
        } else if (nextState.selectedModuleId) {
          actions.initializeModuleDraft(nextState.selectedModuleId);
        }
        actions.setEditorStatus('', 'neutral');
        renderEditorPanel();
      });
    });

    if (state.activeEditorTab === 'theme') {
      bindThemeEditorEvents({
        el,
        draftMeta: state.activeThemeDraft,
        setDraftMeta: actions.setActiveThemeDraft,
        markDirty: actions.markDirty,
        openImagePicker: deps.openImagePicker,
        fetchAssets: deps.fetchAssets,
        uploadAssetFile: deps.uploadAssetFile,
        resolveAssetUrl: deps.resolveAssetUrl,
      });

      document.getElementById('pbSaveTheme')?.addEventListener('click', async () => {
        await actions.saveActiveThemeDraft();
      });
      document.getElementById('pbDiscardTheme')?.addEventListener('click', () => {
        actions.discardActiveThemeDraft();
      });
      document.getElementById('pbResetTheme')?.addEventListener('click', () => {
        actions.resetActiveThemeDraft();
      });
    } else if (state.selectedCanvasSurface === 'page-header') {
      bindHeaderEditorEvents({
        el,
        draftState: state.activeHeaderDraft,
        setDraftState: actions.setActiveHeaderDraft,
        markDirty: actions.markDirty,
        renderEditorPanel,
        renderCanvas: actions.renderCanvas,
      });

      document.getElementById('pbSaveHeader')?.addEventListener('click', async () => {
        await actions.saveActiveHeaderDraft();
      });
      document.getElementById('pbDiscardHeader')?.addEventListener('click', () => {
        actions.discardActiveHeaderDraft();
      });
    } else if (state.selectedCanvasSurface === 'page-settings') {
      document.getElementById('pbEditPageSlug')?.addEventListener('input', (e) => {
        actions.updateActivePageSettingsDraftField(
          'slug',
          /** @type {HTMLInputElement} */ (e.target).value
        );
      });
      document.getElementById('pbEditPageTitle')?.addEventListener('input', (e) => {
        actions.updateActivePageSettingsDraftField(
          'title',
          /** @type {HTMLInputElement} */ (e.target).value
        );
      });
      document.getElementById('pbEditPageType')?.addEventListener('input', (e) => {
        actions.updateActivePageSettingsDraftField(
          'pageType',
          /** @type {HTMLInputElement} */ (e.target).value
        );
      });
      document.getElementById('pbEditIsHomepage')?.addEventListener('change', (e) => {
        actions.updateActivePageSettingsDraftField(
          'isHomepage',
          /** @type {HTMLInputElement} */ (e.target).checked
        );
      });

      document.getElementById('pbSavePageSettings')?.addEventListener('click', async () => {
        await actions.saveActivePageSettingsDraft();
      });
      document.getElementById('pbDiscardPageSettings')?.addEventListener('click', () => {
        actions.discardActivePageSettingsDraft();
      });
    } else if (selectedModuleRecord) {
      bindModuleEditorEvents({
        el,
        currentPage: state.currentPage,
        selectedModuleId: state.selectedModuleId,
        draftConfig: state.activeModuleDraft,
        setDraftConfig: (nextDraft) => {
          actions.setActiveModuleDraftId(getState().selectedModuleId);
          actions.setActiveModuleDraft(nextDraft);
        },
        markDirty: actions.markDirty,
        renderEditorPanel,
        pages: state.pages,
        openImagePicker: deps.openImagePicker,
        fetchAssets: deps.fetchAssets,
        uploadAssetFile: deps.uploadAssetFile,
      });

      document.getElementById('pbSaveModule')?.addEventListener('click', async () => {
        await actions.saveActiveModuleDraft();
      });
      document.getElementById('pbDiscardModule')?.addEventListener('click', () => {
        actions.discardActiveModuleDraft();
      });
      document.getElementById('pbDeleteModule')?.addEventListener('click', async () => {
        const { selectedModuleId } = getState();
        if (!selectedModuleId) return;
        if (!confirm('Delete this module? This cannot be undone.')) return;
        if (await deps.deleteModule(selectedModuleId)) {
          actions.removeModuleFromCurrentPage(selectedModuleId);
          actions.clearSelectedModuleState();
          actions.clearDirty('module');
          actions.setEditorStatus('Module deleted.', 'success');
          actions.renderCanvas();
          renderEditorPanel();
        } else {
          actions.setEditorStatus('Failed to delete module.', 'danger');
          renderEditorPanel();
        }
      });
    }

    actions.updateEditorFooterUi();
  }

  return renderEditorPanel;
}

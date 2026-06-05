import { escapeAttr, escapeHtml } from './helpers.js';
import { BUILDER_COMMANDS } from './commands.js';
import { BUILDER_STRUCTURAL_COMMANDS } from './structural-commands.js';
import { bindHeaderEditorEvents, renderHeaderEditorContent } from './header-editor.js';
import {
  bindModuleEditorEvents,
  bindModuleStyleEditorEvents,
  renderModuleEditorContent,
  renderModuleStyleEditorContent,
} from './module-editor.js';
import {
  getBuilderDeviceLabel,
  getEffectiveSectionLayout,
  getEffectiveSectionSettings,
} from './responsive-overrides.js';
import { bindThemeEditorEvents, renderThemeEditorContent } from './theme-editor.js';
import { renderInspectorSection } from './inspector-sections.js';

function renderPageSettingsContent(draft) {
  if (!draft) return '';
  return `
    ${renderInspectorSection({
      kicker: 'Identity',
      title: 'Page Identity',
      summary: draft.slug || 'Page URL',
      copy: 'Control the page URL, title, and type.',
      body: `
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
        </div>
      `,
    })}
    ${renderInspectorSection({
      kicker: 'Publishing',
      title: 'Publishing',
      summary: draft.isHomepage ? 'Homepage' : 'Standard page',
      copy: 'Choose whether this page is the default landing page for the series.',
      body: `
        <div class="form-editor">
          <div class="form-group">
            <label style="display: flex; align-items: center; gap: 10px; font-size: 0.95rem;">
              <input type="checkbox" id="pbEditIsHomepage" ${draft.isHomepage ? 'checked' : ''} />
              Is Homepage
            </label>
            <div class="settings-note" style="margin-top: 6px;">Check to make this page the default landing page for the series.</div>
          </div>
        </div>
      `,
    })}
  `;
}

function renderResponsiveScopeControl({ activeDeviceId, responsiveEditScope }) {
  const deviceLabel = getBuilderDeviceLabel(activeDeviceId);
  return renderInspectorSection({
    kicker: 'Device',
    title: 'Edit Scope',
    summary: responsiveEditScope === 'device' ? deviceLabel : 'Global',
    copy: '',
    body: `
      <div class="form-editor">
        <div class="form-group">
          <label class="form-label" for="pbResponsiveEditScope">Scope</label>
          <select id="pbResponsiveEditScope" class="form-input" data-responsive-edit-scope>
            <option value="global" ${responsiveEditScope === 'global' ? 'selected' : ''}>Global</option>
            <option value="device" ${responsiveEditScope === 'device' ? 'selected' : ''}>Current Device (${escapeHtml(deviceLabel)})</option>
          </select>
        </div>
      </div>
    `,
  });
}

function renderSectionSettingsContent(section, draft, options = {}) {
  if (!section || !draft) return '';
  const activeDeviceId = options.activeDeviceId;
  const responsiveEditScope = options.responsiveEditScope === 'device' ? 'device' : 'global';
  const displaySection =
    responsiveEditScope === 'device'
      ? {
          ...section,
          settings: draft,
        }
      : section;
  const displayDraft =
    responsiveEditScope === 'device'
      ? getEffectiveSectionSettings(displaySection, {
          builderEditing: true,
          deviceId: activeDeviceId,
        })
      : draft;
  const displayLayout =
    responsiveEditScope === 'device'
      ? getEffectiveSectionLayout(displaySection, {
          builderEditing: true,
          deviceId: activeDeviceId,
        })
      : section.layout || '1';
  return `
    ${renderResponsiveScopeControl({ activeDeviceId, responsiveEditScope })}
    ${renderInspectorSection({
      kicker: 'Section',
      title: 'Spacing',
      summary: displayLayout || 'Layout',
      copy: 'Adjust spacing for this section.',
      body: `
        <div class="form-editor">
          ${
            responsiveEditScope === 'device'
              ? `
          <div class="form-group">
            <label class="form-label" for="pbEditSectionLayout">Layout</label>
            <select id="pbEditSectionLayout" class="form-input" data-section-setting="layout">
              ${['1', '1-1', '1-2', '2-1', '1-1-1', '1-3-1']
                .map(
                  (layout) =>
                    `<option value="${escapeAttr(layout)}" ${displayLayout === layout ? 'selected' : ''}>${escapeHtml(layout)}</option>`
                )
                .join('')}
            </select>
          </div>
          `
              : ''
          }
          <div class="form-group">
            <label class="form-label" for="pbEditSectionModuleGap">Module Gap</label>
            <input type="number" id="pbEditSectionModuleGap" class="form-input" value="${escapeHtml(String(displayDraft.moduleGap ?? ''))}" min="0" step="1" placeholder="16" data-section-setting="moduleGap" />
          </div>
          <div class="form-group">
            <label class="form-label" for="pbEditSectionColumnGap">Column Gap</label>
            <input type="number" id="pbEditSectionColumnGap" class="form-input" value="${escapeHtml(String(displayDraft.columnGap ?? ''))}" min="0" step="1" placeholder="16" data-section-setting="columnGap" />
          </div>
          <div class="form-group">
            <label class="form-label" for="pbEditSectionGap">Section Gap</label>
            <input type="number" id="pbEditSectionGap" class="form-input" value="${escapeHtml(String(displayDraft.sectionGap ?? ''))}" min="0" step="1" placeholder="24" data-section-setting="sectionGap" />
          </div>
        </div>
      `,
    })}
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
        Settings
      </button>
      <button
        class="pb-editor-tab ${activeEditorTab === 'theme' ? 'active' : ''}"
        data-tab="theme"
        role="tab"
        aria-selected="${String(activeEditorTab === 'theme')}"
        ${disableTabs ? 'disabled' : ''}
      >
        Styles
      </button>
    </div>
  `;
}

function renderFooter({ scope, actionsHtml = '' }) {
  return `
    <div class="pb-editor-footer" data-scope="${scope}">
      <div class="pb-editor-footer-status" data-editor-status></div>
      <div class="pb-editor-footer-actions">
        <button class="btn-secondary" data-action="undo-current" type="button" disabled>Undo</button>
        <button class="btn-secondary" data-action="redo-current" type="button" disabled>Redo</button>
        ${actionsHtml}
      </div>
    </div>
  `;
}

function renderStylesEmptyContent(title, copy) {
  return `
    <div class="pb-editor-empty">
      <div class="pb-editor-empty-card">
        <span class="pb-editor-empty-kicker">Styles</span>
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(copy)}</p>
      </div>
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

function getPageIdentity(page) {
  return page?.id || page?.slug || '';
}

function getEditorContextKey(state) {
  const pageKey = getPageIdentity(state.currentPage);
  if (!pageKey) return 'empty';
  if (state.activeEditorTab === 'theme') return `${pageKey}:theme`;
  if (state.selectedCanvasSurface === 'page-header') return `${pageKey}:page-header`;
  if (state.selectedCanvasSurface === 'page-settings') return `${pageKey}:page-settings`;
  if (state.selectedCanvasSurface === 'section') {
    return `${pageKey}:section:${state.activeSectionId || 'none'}`;
  }
  return `${pageKey}:module:${state.selectedModuleId || 'none'}`;
}

export function createEditorPanelRenderer({ el, getState, actions, helpers, deps }) {
  function captureEditorContentScroll() {
    const content = el.pbModuleEditor?.querySelector('.pb-editor-content');
    if (!content) return null;
    return {
      contextKey: el.pbModuleEditor.dataset.editorContextKey || '',
      scrollLeft: content.scrollLeft,
      scrollTop: content.scrollTop,
    };
  }

  function restoreEditorContentScroll(snapshot, contextKey) {
    if (el.pbModuleEditor) {
      el.pbModuleEditor.dataset.editorContextKey = contextKey;
    }
    const content = el.pbModuleEditor?.querySelector('.pb-editor-content');
    if (!content || snapshot?.contextKey !== contextKey) return;
    content.scrollLeft = snapshot.scrollLeft;
    content.scrollTop = snapshot.scrollTop;
  }

  function renderEditorPanel() {
    if (!el.pbModuleEditor) return;

    let state = getState();
    const scrollSnapshot = captureEditorContentScroll();

    if (!state.currentPage) {
      const editorContextKey = getEditorContextKey(state);
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
      restoreEditorContentScroll(scrollSnapshot, editorContextKey);
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
    const editorContextKey = getEditorContextKey(state);

    const selectedModuleRecord = helpers.getSelectedModuleRecord(state.selectedModuleId);
    const pageTitle = helpers.getPageDisplayTitle(state.currentPage);
    let contentHtml = '';
    let footerHtml = '';
    let kicker = 'Inspector';
    let title = 'Page Inspector';
    let subtitle = `Adjust structure and visual polish for ${pageTitle}.`;

    if (state.activeEditorTab === 'theme') {
      if (state.selectedCanvasSurface === 'page-header') {
        contentHtml = renderHeaderEditorContent({
          draftState: state.activeHeaderDraft,
          pages: state.pages,
          activeDeviceId: state.activeDeviceId,
          responsiveEditScope: state.responsiveEditScope,
          mode: 'styles',
        });
        kicker = 'Header Styles';
        title = 'Header Appearance';
        subtitle = `Tune sanitized header appearance for ${pageTitle}.`;
        footerHtml = renderFooter({
          scope: 'header',
          actionsHtml: `
            <button class="btn-secondary" id="pbDiscardHeader" data-action="discard-current" type="button">Discard</button>
            <button class="btn-primary" id="pbSaveHeader" data-action="save-current" type="button">Save Header</button>
          `,
        });
      } else if (selectedModuleRecord) {
        contentHtml = renderModuleStyleEditorContent({
          currentPage: state.currentPage,
          selectedModuleId: state.selectedModuleId,
          draftConfig: state.activeModuleDraft,
          pages: state.pages,
          activeDeviceId: state.activeDeviceId,
          responsiveEditScope: state.responsiveEditScope,
        });
        kicker = 'Module Styles';
        title = `${helpers.getModuleLabel(selectedModuleRecord.moduleType)} Styles`;
        subtitle = 'Edit only supported sanitized appearance sectors for the selected module.';
        footerHtml = renderFooter({
          scope: 'module',
          actionsHtml: `
            <button class="btn-secondary" id="pbDiscardModule" data-action="discard-current" type="button">Discard</button>
            <button class="btn-primary" id="pbSaveModule" data-action="save-current" type="button">Save</button>
          `,
        });
      } else if (state.selectedCanvasSurface === 'section') {
        contentHtml = renderStylesEmptyContent(
          'No section style controls',
          'This section does not expose sanitized style sectors in the builder style manager.'
        );
        kicker = 'Section Styles';
        title = 'Section Appearance';
        subtitle = 'Select a page, header, or supported module to edit constrained style controls.';
      } else {
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
      }
    } else if (state.selectedCanvasSurface === 'page-header') {
      contentHtml = renderHeaderEditorContent({
        draftState: state.activeHeaderDraft,
        pages: state.pages,
        activeDeviceId: state.activeDeviceId,
        responsiveEditScope: state.responsiveEditScope,
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
    } else if (state.selectedCanvasSurface === 'section' && state.activeSectionId) {
      const section = helpers.getSectionRecord(state.activeSectionId);
      contentHtml = renderSectionSettingsContent(section, state.activeSectionDraft, {
        activeDeviceId: state.activeDeviceId,
        responsiveEditScope: state.responsiveEditScope,
      });
      kicker = 'Section';
      title = 'Section Settings';
      subtitle = `Adjust spacing for ${pageTitle}.`;
      footerHtml = renderFooter({
        scope: 'section',
        actionsHtml: `
          <button class="btn-secondary" id="pbDiscardSectionSettings" data-action="discard-current" type="button">Discard</button>
          <button class="btn-primary" id="pbSaveSectionSettings" data-action="save-current" type="button">Save Settings</button>
        `,
      });
    } else {
      contentHtml = renderModuleEditorContent({
        currentPage: state.currentPage,
        selectedModuleId: state.selectedModuleId,
        draftConfig: selectedModuleRecord ? state.activeModuleDraft : null,
        pages: state.pages,
        activeDeviceId: state.activeDeviceId,
        responsiveEditScope: state.responsiveEditScope,
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
    restoreEditorContentScroll(scrollSnapshot, editorContextKey);

    el.pbModuleEditor
      .querySelector('[data-responsive-edit-scope]')
      ?.addEventListener('change', (event) => {
        actions.setResponsiveEditScope(
          /** @type {HTMLSelectElement} */ (event.target).value === 'device' ? 'device' : 'global'
        );
        renderEditorPanel();
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
        } else if (nextState.selectedCanvasSurface === 'section') {
          actions.setActiveEditorTab('modules');
        } else if (nextState.selectedModuleId) {
          actions.initializeModuleDraft(nextState.selectedModuleId);
        }
        actions.setEditorStatus('', 'neutral');
        renderEditorPanel();
      });
    });

    el.pbModuleEditor
      .querySelector('[data-action="undo-current"]')
      ?.addEventListener('click', () => {
        actions.runCommand?.(BUILDER_COMMANDS.UNDO_DRAFT);
      });
    el.pbModuleEditor
      .querySelector('[data-action="redo-current"]')
      ?.addEventListener('click', () => {
        actions.runCommand?.(BUILDER_COMMANDS.REDO_DRAFT);
      });

    if (state.activeEditorTab === 'theme' && state.selectedCanvasSurface === 'page-header') {
      bindHeaderEditorEvents({
        el,
        draftState: state.activeHeaderDraft,
        setDraftState: actions.setActiveHeaderDraft,
        markDirty: actions.markDirty,
        renderEditorPanel,
        renderCanvas: actions.renderCanvas,
        activeDeviceId: state.activeDeviceId,
        responsiveEditScope: state.responsiveEditScope,
      });

      document.getElementById('pbSaveHeader')?.addEventListener('click', async () => {
        await actions.runCommand?.(BUILDER_COMMANDS.SAVE_DRAFT);
      });
      document.getElementById('pbDiscardHeader')?.addEventListener('click', () => {
        actions.runCommand?.(BUILDER_COMMANDS.DISCARD_DRAFT);
      });
    } else if (state.activeEditorTab === 'theme' && selectedModuleRecord) {
      bindModuleStyleEditorEvents({
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
        activeDeviceId: state.activeDeviceId,
        responsiveEditScope: state.responsiveEditScope,
      });

      document.getElementById('pbSaveModule')?.addEventListener('click', async () => {
        await actions.runCommand?.(BUILDER_COMMANDS.SAVE_DRAFT);
      });
      document.getElementById('pbDiscardModule')?.addEventListener('click', () => {
        actions.runCommand?.(BUILDER_COMMANDS.DISCARD_DRAFT);
      });
    } else if (state.activeEditorTab === 'theme') {
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
        await actions.runCommand?.(BUILDER_COMMANDS.SAVE_DRAFT);
      });
      document.getElementById('pbDiscardTheme')?.addEventListener('click', () => {
        actions.runCommand?.(BUILDER_COMMANDS.DISCARD_DRAFT);
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
        activeDeviceId: state.activeDeviceId,
        responsiveEditScope: state.responsiveEditScope,
      });

      document.getElementById('pbSaveHeader')?.addEventListener('click', async () => {
        await actions.runCommand?.(BUILDER_COMMANDS.SAVE_DRAFT);
      });
      document.getElementById('pbDiscardHeader')?.addEventListener('click', () => {
        actions.runCommand?.(BUILDER_COMMANDS.DISCARD_DRAFT);
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
        await actions.runCommand?.(BUILDER_COMMANDS.SAVE_DRAFT);
      });
      document.getElementById('pbDiscardPageSettings')?.addEventListener('click', () => {
        actions.runCommand?.(BUILDER_COMMANDS.DISCARD_DRAFT);
      });
    } else if (state.selectedCanvasSurface === 'section') {
      el.pbModuleEditor.querySelectorAll('[data-section-setting]').forEach((input) => {
        input.addEventListener('change', (e) => {
          actions.updateActiveSectionDraftField(
            /** @type {HTMLElement} */ (e.target).dataset.sectionSetting,
            /** @type {HTMLInputElement} */ (e.target).value
          );
        });
      });

      document.getElementById('pbSaveSectionSettings')?.addEventListener('click', async () => {
        await actions.runCommand?.(BUILDER_COMMANDS.SAVE_DRAFT);
      });
      document.getElementById('pbDiscardSectionSettings')?.addEventListener('click', () => {
        actions.runCommand?.(BUILDER_COMMANDS.DISCARD_DRAFT);
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
        activeDeviceId: state.activeDeviceId,
        responsiveEditScope: state.responsiveEditScope,
      });

      document.getElementById('pbSaveModule')?.addEventListener('click', async () => {
        await actions.runCommand?.(BUILDER_COMMANDS.SAVE_DRAFT);
      });
      document.getElementById('pbDiscardModule')?.addEventListener('click', () => {
        actions.runCommand?.(BUILDER_COMMANDS.DISCARD_DRAFT);
      });
      document.getElementById('pbDeleteModule')?.addEventListener('click', async () => {
        const { selectedModuleId } = getState();
        if (!selectedModuleId) return;
        const result = await actions.runCommand?.(BUILDER_STRUCTURAL_COMMANDS.DELETE_SELECTED, {
          target: { kind: 'module', moduleId: selectedModuleId },
        });
        if (result?.ok === false) {
          actions.setEditorStatus('Failed to delete module.', 'danger');
          renderEditorPanel();
        }
      });
    }

    actions.updateEditorFooterUi();
  }

  return renderEditorPanel;
}

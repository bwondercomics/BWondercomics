import { escapeAttr, escapeHtml } from './helpers.js';
import { COLUMN_ALIGNMENTS, MAX_COLUMNS, parseLayoutRatios } from './layout-utils.js';
import {
  getAppearanceInputValue,
  removeAppearanceLeaf,
  renderAppearanceControls,
  setAppearanceLeaf,
  syncAppearanceColorInputs,
  toSparseAppearance,
} from './appearance-editor.js';
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
        <div class="pb-editor-stack pb-editor-stack--compact">
          <div class="pb-editor-field">
            <label class="pb-editor-label" for="pbEditPageSlug">Page Slug</label>
            <input type="text" id="pbEditPageSlug" class="pb-editor-input" value="${escapeAttr(draft.slug)}" />
            <div class="pb-editor-hint">Used in the URL (letters, numbers, dashes).</div>
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label" for="pbEditPageTitle">Page Title</label>
            <input type="text" id="pbEditPageTitle" class="pb-editor-input" value="${escapeAttr(draft.title)}" />
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label" for="pbEditPageType">Page Type</label>
            <input type="text" id="pbEditPageType" class="pb-editor-input" value="${escapeAttr(draft.pageType || '')}" />
            <div class="pb-editor-hint">e.g., custom, reader, gallery.</div>
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
        <div class="pb-editor-stack pb-editor-stack--compact">
          <div class="pb-editor-field">
            <label class="pb-editor-label pb-editor-checkbox">
              <input type="checkbox" id="pbEditIsHomepage" ${draft.isHomepage ? 'checked' : ''} />
              <span>Is Homepage</span>
            </label>
            <div class="pb-editor-hint">Check to make this page the default landing page for the series.</div>
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

function getColumnDraft(draft, index) {
  const columns = Array.isArray(draft?.columns) ? draft.columns : [];
  return columns.find((column) => Number(column?.index) === index) || {};
}

function getColumnScopeDraft(draft, index, responsiveEditScope, activeDeviceId) {
  const column = getColumnDraft(draft, index);
  if (responsiveEditScope !== 'device') return column;
  const branch = column?.responsive?.[activeDeviceId];
  return branch && typeof branch === 'object' && !Array.isArray(branch) ? branch : {};
}

function cloneAppearanceValue(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function renderSectionLayoutEditor(draft, { activeDeviceId, responsiveEditScope }) {
  const globalRatios = parseLayoutRatios(draft?.layout || '1');
  const deviceLayout =
    responsiveEditScope === 'device'
      ? String(draft?.responsive?.[activeDeviceId]?.layout || '')
      : '';
  const ratios =
    responsiveEditScope === 'device'
      ? deviceLayout
        ? parseLayoutRatios(deviceLayout).slice(0, globalRatios.length)
        : []
      : globalRatios;
  const count = ratios.length;
  const maxColumns =
    responsiveEditScope === 'device' ? Math.max(1, globalRatios.length) : MAX_COLUMNS;
  const countOptions = Array.from({ length: maxColumns }, (_, i) => i + 1)
    .map(
      (value) => `<option value="${value}" ${value === count ? 'selected' : ''}>${value}</option>`
    )
    .join('');
  const inheritOption =
    responsiveEditScope === 'device'
      ? `<option value="inherit" ${deviceLayout ? '' : 'selected'}>Inherit global (${globalRatios.length})</option>`
      : '';
  const ratioInputs = ratios
    .map(
      (ratio, index) => `
        <div class="pb-editor-field">
          <label class="pb-editor-label">Track ${index + 1} ratio</label>
          <input type="number" class="pb-editor-input" min="1" max="12" step="1" value="${escapeAttr(String(ratio))}" data-column-ratio data-column-index="${index}" />
        </div>
      `
    )
    .join('');

  return `
    <div class="pb-editor-stack pb-editor-stack--compact">
      <div class="pb-editor-field">
        <label class="pb-editor-label" for="pbEditSectionColumnCount">${
          responsiveEditScope === 'device' ? 'Reflow track count' : 'Column count'
        }</label>
        <select id="pbEditSectionColumnCount" class="pb-editor-select" data-section-column-count>
          ${inheritOption}${countOptions}
        </select>
        <div class="pb-editor-hint">${
          responsiveEditScope === 'device'
            ? `Choose up to ${globalRatios.length} tracks. Structural columns and module ownership remain global.`
            : 'Choose 1–6 structural columns and set their width ratios.'
        }</div>
      </div>
      ${ratioInputs}
    </div>
  `;
}

function renderColumnEditorContent(draft, { activeDeviceId, responsiveEditScope }) {
  const globalRatios = parseLayoutRatios(draft?.layout || '1');
  const columnCards = globalRatios
    .map((_, index) => {
      const column = getColumnScopeDraft(draft, index, responsiveEditScope, activeDeviceId);
      const padding = column.padding || {};
      const alignment = column.alignment || '';
      const paddingInputs = ['Top', 'Right', 'Bottom', 'Left']
        .map((side) => {
          const value = padding[side.toLowerCase()];
          return `<input type="number" class="pb-editor-input pb-column-padding-input" min="0" step="1" value="${escapeAttr(String(value ?? ''))}" placeholder="${side[0]}" aria-label="Padding ${side}" data-column-field="padding${side}" data-column-index="${index}" />`;
        })
        .join('');
      return `
        <div class="pb-column-editor" data-column-index="${index}">
          <div class="pb-column-editor-title">Global Column ${index + 1}</div>
          ${renderAppearanceControls(
            column.appearance,
            'section-column',
            index,
            'Appearance',
            responsiveEditScope === 'device'
              ? 'Unset fields inherit the global column appearance.'
              : 'Use the shared sanitized background, text, and border controls.'
          )}
          <div class="pb-editor-field">
            <label class="pb-editor-label">Alignment</label>
            <select class="pb-editor-select" data-column-field="alignment" data-column-index="${index}">
              ${
                responsiveEditScope === 'device'
                  ? `<option value="inherit" ${alignment ? '' : 'selected'}>Inherit global</option>`
                  : ''
              }
              ${COLUMN_ALIGNMENTS.map(
                (value) =>
                  `<option value="${value}" ${
                    (alignment || (responsiveEditScope === 'global' ? 'stretch' : '')) === value
                      ? 'selected'
                      : ''
                  }>${value}</option>`
              ).join('')}
            </select>
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Padding (T / R / B / L)</label>
            <div class="pb-column-padding-grid">${paddingInputs}</div>
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Min height</label>
            <input type="number" class="pb-editor-input" min="0" step="1" value="${escapeAttr(String(column.minHeight ?? ''))}" placeholder="auto" data-column-field="minHeight" data-column-index="${index}" />
          </div>
          <div class="pb-editor-field">
            ${
              responsiveEditScope === 'device'
                ? `
                  <label class="pb-editor-label">Visibility</label>
                  <select class="pb-editor-select" data-column-field="hidden" data-column-index="${index}">
                    <option value="inherit" ${
                      Object.prototype.hasOwnProperty.call(column, 'hidden') ? '' : 'selected'
                    }>Inherit global</option>
                    <option value="false" ${column.hidden === false ? 'selected' : ''}>Visible</option>
                    <option value="true" ${column.hidden === true ? 'selected' : ''}>Hidden</option>
                  </select>
                `
                : `
                  <label class="pb-editor-label pb-editor-checkbox">
                    <input type="checkbox" data-column-field="hidden" data-column-index="${index}" ${column.hidden ? 'checked' : ''} />
                    <span>Hidden</span>
                  </label>
                `
            }
          </div>
        </div>
      `;
    })
    .join('');

  return `
    ${renderSectionLayoutEditor(draft, { activeDeviceId, responsiveEditScope })}
    <div class="pb-column-editor-list">${columnCards}</div>
  `;
}

function renderSectionSettingsContent(section, draft, options = {}) {
  if (!section || !draft) return '';
  const activeDeviceId = options.activeDeviceId;
  const responsiveEditScope = options.responsiveEditScope === 'device' ? 'device' : 'global';
  const displaySection =
    responsiveEditScope === 'device'
      ? {
          ...section,
          layout: draft.layout || section.layout || '1',
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
      title: 'Columns',
      summary:
        responsiveEditScope === 'device'
          ? `${getBuilderDeviceLabel(activeDeviceId)} reflow`
          : `${parseLayoutRatios(draft.layout || section.layout || '1').length} cols`,
      copy:
        responsiveEditScope === 'device'
          ? 'Reflow stable structural columns and author sparse device-specific column styles.'
          : 'Choose structural column count, ratios, and base per-column styling.',
      body: renderColumnEditorContent(draft, {
        activeDeviceId,
        responsiveEditScope,
      }),
    })}
    ${renderInspectorSection({
      kicker: 'Section',
      title: 'Spacing',
      summary: displayLayout || 'Layout',
      copy: 'Adjust spacing for this section.',
      body: `
        <div class="pb-editor-stack pb-editor-stack--compact">
          <div class="pb-editor-field">
            <label class="pb-editor-label" for="pbEditSectionModuleGap">Module Gap</label>
            <input type="number" id="pbEditSectionModuleGap" class="pb-editor-input" value="${escapeAttr(String(displayDraft.moduleGap ?? ''))}" min="0" step="1" placeholder="16" data-section-setting="moduleGap" />
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label" for="pbEditSectionColumnGap">Column Gap</label>
            <input type="number" id="pbEditSectionColumnGap" class="pb-editor-input" value="${escapeAttr(String(displayDraft.columnGap ?? ''))}" min="0" step="1" placeholder="16" data-section-setting="columnGap" />
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label" for="pbEditSectionGap">Section Gap</label>
            <input type="number" id="pbEditSectionGap" class="pb-editor-input" value="${escapeAttr(String(displayDraft.sectionGap ?? ''))}" min="0" step="1" placeholder="24" data-section-setting="sectionGap" />
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
  if (state.activeEditorTab === 'theme') {
    if (state.selectedCanvasSurface === 'page-header') return `${pageKey}:theme:page-header`;
    if (state.selectedCanvasSurface === 'page-settings') return `${pageKey}:theme:page-settings`;
    if (state.selectedCanvasSurface === 'section') {
      return `${pageKey}:theme:section:${state.activeSectionId || 'none'}`;
    }
    if (state.selectedModuleId) return `${pageKey}:theme:module:${state.selectedModuleId}`;
    return `${pageKey}:theme:page`;
  }
  if (state.selectedCanvasSurface === 'page-header') return `${pageKey}:page-header`;
  if (state.selectedCanvasSurface === 'page-settings') return `${pageKey}:page-settings`;
  if (state.selectedCanvasSurface === 'section') {
    return `${pageKey}:section:${state.activeSectionId || 'none'}`;
  }
  return `${pageKey}:module:${state.selectedModuleId || 'none'}`;
}

export function createEditorPanelRenderer({ el, getState, actions, helpers, deps }) {
  function normalizeDetailsKeyPart(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function getDetailsSummaryText(details) {
    const summary = Array.from(details.children || []).find((child) => child.tagName === 'SUMMARY');
    return summary?.textContent || '';
  }

  function getDetailsStateKey(details, content) {
    const explicitKey = details.dataset.inspectorSectionKey;
    if (explicitKey) return `inspector:${explicitKey}`;

    const parentSection = details.parentElement?.closest('details[data-inspector-section-key]');
    const parentKey = parentSection?.dataset.inspectorSectionKey || 'root';
    const scopeRoot = parentSection || content;
    const scopedDetails = Array.from(scopeRoot?.querySelectorAll('details') || []);
    const index = Math.max(0, scopedDetails.indexOf(details));
    const summaryKey = normalizeDetailsKeyPart(getDetailsSummaryText(details)) || 'details';
    const classKey = normalizeDetailsKeyPart(Array.from(details.classList || []).join(' '));
    return ['nested', parentKey, index, summaryKey, classKey].filter(Boolean).join(':');
  }

  function captureEditorDetailsState(content) {
    const detailsState = new Map();
    content?.querySelectorAll('details').forEach((details) => {
      detailsState.set(getDetailsStateKey(details, content), details.open === true);
    });
    return detailsState;
  }

  function restoreEditorDetailsState(content, detailsState) {
    if (!(detailsState instanceof Map)) return;
    content?.querySelectorAll('details').forEach((details) => {
      const stateKey = getDetailsStateKey(details, content);
      if (detailsState.has(stateKey)) {
        details.open = detailsState.get(stateKey) === true;
      }
    });
  }

  function captureEditorContentScroll() {
    const content = el.pbModuleEditor?.querySelector('.pb-editor-content');
    const sidebarContent = el.pbModuleEditor?.closest('.pb-sidebar-content');
    if (!content) return null;
    return {
      contextKey: el.pbModuleEditor.dataset.editorContextKey || '',
      scrollLeft: content.scrollLeft,
      scrollTop: content.scrollTop,
      sidebarScrollLeft: sidebarContent?.scrollLeft || 0,
      sidebarScrollTop: sidebarContent?.scrollTop || 0,
      detailsState: captureEditorDetailsState(content),
    };
  }

  function restoreEditorContentScroll(snapshot, contextKey) {
    if (el.pbModuleEditor) {
      el.pbModuleEditor.dataset.editorContextKey = contextKey;
    }
    const content = el.pbModuleEditor?.querySelector('.pb-editor-content');
    if (!content || snapshot?.contextKey !== contextKey) return;
    restoreEditorDetailsState(content, snapshot.detailsState);

    const restoreScrollPosition = () => {
      const currentContent = el.pbModuleEditor?.querySelector('.pb-editor-content');
      const currentSidebarContent = el.pbModuleEditor?.closest('.pb-sidebar-content');
      if (!currentContent || el.pbModuleEditor?.dataset.editorContextKey !== contextKey) return;
      currentContent.scrollLeft = snapshot.scrollLeft;
      currentContent.scrollTop = snapshot.scrollTop;
      if (currentSidebarContent) {
        currentSidebarContent.scrollLeft = snapshot.sidebarScrollLeft || 0;
        currentSidebarContent.scrollTop = snapshot.sidebarScrollTop || 0;
      }
    };
    restoreScrollPosition();

    const scheduleRestore =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (callback) => setTimeout(callback, 0);
    scheduleRestore(restoreScrollPosition);
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

      el.pbModuleEditor
        .querySelector('[data-section-column-count]')
        ?.addEventListener('change', (e) => {
          actions.setActiveSectionColumnCount(/** @type {HTMLInputElement} */ (e.target).value);
        });

      el.pbModuleEditor.querySelectorAll('[data-column-ratio]').forEach((input) => {
        input.addEventListener('change', (e) => {
          const target = /** @type {HTMLInputElement} */ (e.target);
          actions.updateActiveSectionColumnRatio(target.dataset.columnIndex, target.value);
        });
      });

      el.pbModuleEditor.querySelectorAll('[data-column-field]').forEach((input) => {
        input.addEventListener('change', (e) => {
          const target = /** @type {HTMLInputElement} */ (e.target);
          const value = target.type === 'checkbox' ? target.checked : target.value;
          actions.updateActiveSectionColumnField(
            target.dataset.columnIndex,
            target.dataset.columnField,
            value
          );
        });
      });

      el.pbModuleEditor.querySelectorAll('[data-appearance-toggle="true"]').forEach((toggle) => {
        toggle.addEventListener('change', () => {
          const index = Number(toggle.dataset.itemIndex);
          const key = toggle.dataset.appearanceKey;
          if (!Number.isInteger(index) || !key) return;
          const latestState = getState();
          const column = getColumnScopeDraft(
            latestState.activeSectionDraft,
            index,
            latestState.responsiveEditScope,
            latestState.activeDeviceId
          );
          const appearance = cloneAppearanceValue(column.appearance);
          if (toggle.checked) {
            const pairedInput = el.pbModuleEditor.querySelector(
              `[data-appearance-input="true"][data-appearance-scope="section-column"][data-appearance-key="${key}"][data-item-index="${index}"]:not([data-appearance-input-kind="hex"])`
            );
            const value = getAppearanceInputValue(pairedInput);
            if (value !== null) {
              setAppearanceLeaf(appearance, key, value);
            }
          } else {
            removeAppearanceLeaf(appearance, key);
          }
          actions.updateActiveSectionColumnField(
            index,
            'appearance',
            toSparseAppearance(appearance)
          );
        });
      });

      el.pbModuleEditor.querySelectorAll('[data-appearance-input="true"]').forEach((input) => {
        const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
        input.addEventListener(eventName, () => {
          if (input.disabled) return;
          const index = Number(input.dataset.itemIndex);
          const key = input.dataset.appearanceKey;
          if (!Number.isInteger(index) || !key) return;
          const value = syncAppearanceColorInputs(el.pbModuleEditor, input);
          if (value === null) return;
          const latestState = getState();
          const column = getColumnScopeDraft(
            latestState.activeSectionDraft,
            index,
            latestState.responsiveEditScope,
            latestState.activeDeviceId
          );
          const appearance = cloneAppearanceValue(column.appearance);
          setAppearanceLeaf(appearance, key, value);
          actions.updateActiveSectionColumnField(
            index,
            'appearance',
            toSparseAppearance(appearance),
            { rerenderEditor: false }
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

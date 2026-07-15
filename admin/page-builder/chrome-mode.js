import { cloneValue } from '../../shared/page-builder/helpers.js';
import {
  SIDEBAR_MODE_KEY,
  getEditorWidth,
  getEffectiveSidebarMode,
  getSidebarWidth,
  getViewportEditorBand,
} from './layout.js';
import { BUILDER_DEVICE_ORDER } from '../../shared/page-builder/preview-contract.js';
import { BUILDER_STRUCTURAL_COMMANDS } from './structural-commands.js';

// Chrome/preview mode: the canvas view mode (edit/preview), the editor chrome mode
// (full chrome vs. immersive preview with restore state), the sidebar band layout,
// and the builder device switch. The controller owns the mode fields; the shell
// store exposes canvasMode/editorChromeMode through read-only getters.
export function createChromeModeController({ el, getState, actions }) {
  /** @type {'edit'|'preview'} */
  let canvasMode = 'preview';
  /** @type {'edit'|'preview'} */
  let editorChromeMode = 'edit';
  /** @type {'edit'|'preview'|null} */
  let preChromeCanvasMode = null;
  let previewChromeRestoreState = null;

  function getCanvasMode() {
    return canvasMode;
  }

  function getEditorChromeMode() {
    return editorChromeMode;
  }

  function setCanvasMode(nextMode) {
    canvasMode = nextMode;
  }

  // Restore the default chrome for a page switch or builder (re)entry; canvasMode is
  // left alone because resetBuilderState preserves it while showPageBuilderSection
  // sets it explicitly.
  function resetChrome() {
    editorChromeMode = 'edit';
    preChromeCanvasMode = null;
    previewChromeRestoreState = null;
  }

  function getBuilderRoot() {
    return el.pageBuilderSection?.querySelector('.page-builder') || null;
  }

  function syncChromeModeUi() {
    const isChromePreview = editorChromeMode === 'preview';
    const root = getBuilderRoot();
    if (root) {
      root.dataset.chromeMode = isChromePreview ? 'preview' : 'edit';
    }
    if (el.pbEnterPreview) {
      el.pbEnterPreview.setAttribute('aria-pressed', String(isChromePreview));
      el.pbEnterPreview.disabled = isChromePreview;
    }
    if (el.pbRestorePreviewChrome) {
      el.pbRestorePreviewChrome.hidden = !isChromePreview;
      el.pbRestorePreviewChrome.setAttribute('aria-hidden', String(!isChromePreview));
    }
  }

  function syncCanvasModeUi() {
    const layout = /** @type {HTMLElement|null} */ (document.querySelector('.page-builder-layout'));
    if (layout) {
      if (canvasMode === 'preview') {
        layout.dataset.canvasMode = 'live';
      } else {
        layout.dataset.canvasMode = 'structure';
      }
    }
    el.pbViewToggles?.querySelectorAll('.pb-view-toggle').forEach((node) => {
      const button = /** @type {HTMLElement} */ (node);
      button.classList.toggle('pb-view-toggle--active', button.dataset.view === canvasMode);
    });
    el.pbWidthToggles?.querySelectorAll('.pb-width-toggle').forEach((node) => {
      const button = /** @type {HTMLElement} */ (node);
      button.classList.toggle(
        'pb-width-toggle--active',
        button.dataset.width === getState().activeDeviceId
      );
    });
    syncChromeModeUi();
  }

  function applyEditorMode() {
    const layout = document.querySelector('.page-builder-layout');
    if (!layout) {
      syncChromeModeUi();
      return;
    }

    const band = getViewportEditorBand();
    const sidebarMode = getEffectiveSidebarMode();
    const sidebarCollapsed = sidebarMode === 'collapsed';
    const sidebarLabel = sidebarCollapsed ? '❯' : '❮';
    const sidebarActionLabel = sidebarCollapsed ? 'Expand' : 'Collapse';

    layout.dataset.editorMode = 'side-panel';
    layout.dataset.viewportBand = band;
    layout.dataset.sidebarMode = sidebarMode;
    layout.style.setProperty('--pb-sidebar-width', getSidebarWidth(sidebarMode));
    layout.style.setProperty('--pb-editor-width', getEditorWidth('collapsed', sidebarMode, false));
    actions.syncSidebarRailLabel();

    if (el.pbToggleEditor) {
      el.pbToggleEditor.textContent = sidebarLabel;
      el.pbToggleEditor.setAttribute('aria-expanded', String(!sidebarCollapsed));
      el.pbToggleEditor.setAttribute('aria-label', `${sidebarActionLabel} side panel`);
      el.pbToggleEditor.dataset.mode = sidebarMode;
      el.pbToggleEditor.dataset.viewportBand = band;
      el.pbToggleEditor.hidden = band === 'stacked';
    }

    if (el.pbToggleSidebar) {
      el.pbToggleSidebar.textContent = sidebarCollapsed ? 'Show Panel' : 'Hide Panel';
      el.pbToggleSidebar.setAttribute('aria-expanded', String(!sidebarCollapsed));
      el.pbToggleSidebar.setAttribute('aria-label', `${sidebarActionLabel} side panel`);
      el.pbToggleSidebar.hidden = false;
      el.pbToggleSidebar.dataset.mode = sidebarMode;
      el.pbToggleSidebar.dataset.viewportBand = band;
    }
    syncChromeModeUi();
    actions.reflowPreviewScale();
  }

  function toggleSidebarMode() {
    if (getViewportEditorBand() === 'stacked') return;
    const nextMode = getEffectiveSidebarMode() === 'collapsed' ? 'expanded' : 'collapsed';
    localStorage.setItem(SIDEBAR_MODE_KEY, nextMode);
    applyEditorMode();
  }

  function setBuilderDevice(deviceId) {
    const shouldCleanupInlineEdit =
      BUILDER_DEVICE_ORDER.includes(deviceId) && deviceId !== getState().activeDeviceId;
    if (shouldCleanupInlineEdit) {
      actions.clearInlineEditView('device-switch', 'cancel');
    }
    const changed = actions.setPreviewViewport(deviceId);
    if (changed !== false) {
      actions.resetVisibleResponsiveDraftHistory();
    }
    syncCanvasModeUi();
    return { ok: changed !== false, deviceId: getState().activeDeviceId };
  }

  function cancelTransientState() {
    let changed = false;
    if (getState().activeInsertTarget) {
      actions.clearActiveInsertTarget();
      changed = true;
    }
    if (getState().liveDragState) {
      actions.runCommand(BUILDER_STRUCTURAL_COMMANDS.DRAG_END);
      changed = true;
    }
    if (actions.clearInlineEditView('transient-cancel', 'cancel')) {
      changed = true;
    }
    if (changed) {
      actions.renderCanvas();
      actions.setCanvasStatus('', 'neutral');
    }
    return { ok: changed };
  }

  function enterChromePreview() {
    if (editorChromeMode === 'preview') return { ok: true };
    const selectedTarget = actions.getSelectedTarget();
    preChromeCanvasMode = canvasMode;
    previewChromeRestoreState = {
      canvasMode: canvasMode,
      activeSidePanelTab: getState().activeSidePanelTab,
      selectedTarget: selectedTarget ? cloneValue(selectedTarget) : null,
      selectedTargetKey: actions.getTargetKey(selectedTarget),
      scrollTop: el.pbCanvas?.scrollTop || 0,
      scrollLeft: el.pbCanvas?.scrollLeft || 0,
    };
    actions.clearActiveInsertTarget();
    if (getState().liveDragState) {
      actions.runCommand(BUILDER_STRUCTURAL_COMMANDS.DRAG_END);
    }
    actions.clearInlineEditView('chrome-preview', 'cancel');
    editorChromeMode = 'preview';
    canvasMode = 'preview';
    actions.renderCanvas();
    applyEditorMode();
    window.requestAnimationFrame(() => {
      el.pbRestorePreviewChrome?.focus();
    });
    return { ok: true };
  }

  function exitChromePreview() {
    if (editorChromeMode !== 'preview') return { ok: true };
    const restoreState = previewChromeRestoreState || {};
    editorChromeMode = 'edit';
    canvasMode = preChromeCanvasMode || restoreState.canvasMode || 'preview';
    preChromeCanvasMode = null;
    previewChromeRestoreState = null;
    actions.renderCanvas();
    actions.renderEditorPanel();
    applyEditorMode();
    if (restoreState.activeSidePanelTab) {
      actions.showSidePanelTab(restoreState.activeSidePanelTab);
    }
    if (canvasMode === 'preview') {
      actions.restorePreviewSelectedTarget(
        restoreState.selectedTarget || restoreState.selectedTargetKey || null
      );
      actions.requestPreviewTargetRefresh(restoreState.selectedTarget || null);
    }
    window.requestAnimationFrame(() => {
      if (el.pbCanvas) {
        el.pbCanvas.scrollTop = restoreState.scrollTop || 0;
        el.pbCanvas.scrollLeft = restoreState.scrollLeft || 0;
      }
      el.pbEnterPreview?.focus();
    });
    return { ok: true };
  }

  return {
    applyEditorMode,
    cancelTransientState,
    enterChromePreview,
    exitChromePreview,
    getCanvasMode,
    getEditorChromeMode,
    resetChrome,
    setBuilderDevice,
    setCanvasMode,
    syncCanvasModeUi,
    toggleSidebarMode,
  };
}

import { cloneValue } from '../../shared/page-builder/helpers.js';
import { sanitizeBuilderHtml } from '../../shared/page-builder/sanitize.js';

// Inline text editing bridges the preview iframe and the module draft: the iframe
// reports edits, the controller mirrors them into the module draft, and admin-side
// draft changes sync back into the iframe. The controller owns inlineEditState;
// the shell store exposes it through a read-only getter.
export function createInlineEditController({ getState, actions }) {
  let inlineEditState = null;

  function getInlineEditState() {
    return inlineEditState;
  }

  function isInlineEditableTextPayload(payload = {}) {
    const target = payload.target || {};
    return (
      target.kind === 'module' &&
      target.moduleType === 'text' &&
      !!target.moduleId &&
      payload.field === 'content'
    );
  }

  function sanitizeInlineTextContent(value) {
    return sanitizeBuilderHtml(String(value ?? ''), 'text');
  }

  function getInlineEditTarget(target = null) {
    if (target?.kind === 'module' && target.moduleId) return cloneValue(target);
    if (inlineEditState?.target) return cloneValue(inlineEditState.target);
    const s = getState();
    if (!s.selectedModuleId || !s.currentPage?.id) return null;
    const location = actions.getModuleLocation(s.selectedModuleId);
    if (!location?.module || location.module.moduleType !== 'text') return null;
    return {
      kind: 'module',
      key: `module:${s.selectedModuleId}`,
      pageId: s.currentPage.id,
      sectionId: location.section.id,
      columnIndex: Number(location.module.columnIndex) || 0,
      moduleId: s.selectedModuleId,
      moduleType: 'text',
    };
  }

  function getInlineDraftValue() {
    return sanitizeInlineTextContent(getState().activeModuleDraft?.content || '');
  }

  function syncDraftToPreview(reason = 'admin-sync') {
    if (!inlineEditState || inlineEditState.field !== 'content') return;
    const target = getInlineEditTarget(inlineEditState.target);
    if (!target) return;
    const draftValue = getInlineDraftValue();
    inlineEditState = {
      ...inlineEditState,
      target,
      draftValue,
      status: 'editing',
    };
    actions.syncPreviewDraft?.(target, draftValue, reason);
  }

  function syncDraftFromHistory(snapshot, reason) {
    if (!inlineEditState) return;
    inlineEditState = {
      ...inlineEditState,
      draftValue: String(snapshot?.content || ''),
    };
    syncDraftToPreview(reason);
  }

  function clearInlineEditView(reason = 'admin-cancel', mode = 'cancel', notify = true) {
    if (!inlineEditState) return false;
    const target = getInlineEditTarget(inlineEditState.target);
    if (notify && target) {
      if (mode === 'commit') {
        actions.commitPreviewEdit?.(target, getInlineDraftValue(), reason);
      } else {
        actions.cancelPreviewEdit?.(target, reason);
      }
    }
    inlineEditState = null;
    return true;
  }

  function isStaleInlineIframePayload(moduleId, nextContent) {
    if (!inlineEditState || inlineEditState.moduleId !== moduleId) return false;
    if (inlineEditState.lastIframeValue === undefined) return false;
    return (
      nextContent === inlineEditState.lastIframeValue &&
      String(inlineEditState.draftValue ?? '') !== nextContent
    );
  }

  function startInlineEdit(payload = {}) {
    if (!isInlineEditableTextPayload(payload)) {
      return { ok: false, status: 'Inline editing is only available for text content.' };
    }
    const moduleId = payload.target.moduleId;
    const module = actions.getSelectedModuleRecord(moduleId);
    if (!module || module.moduleType !== 'text') {
      return { ok: false, status: 'Text module not found.' };
    }
    if (actions.selectModule(moduleId, { renderCanvas: false }) === false) {
      return { ok: false, status: 'Save or discard your current changes before editing text.' };
    }
    let s = getState();
    if (!s.activeModuleDraft || s.activeModuleDraftId !== moduleId) {
      actions.setModuleDraft(moduleId, module.config || {});
      s = getState();
    }
    inlineEditState = {
      moduleId,
      target: getInlineEditTarget(payload.target),
      field: 'content',
      initialValue: String(s.activeModuleDraft.content || ''),
      draftValue: sanitizeInlineTextContent(s.activeModuleDraft.content || ''),
      lastIframeValue:
        payload.value !== undefined ? sanitizeInlineTextContent(payload.value) : undefined,
      status: 'editing',
    };
    actions.showSidePanelTab('settings');
    actions.renderEditorPanel();
    actions.updateEditorFooterUi();
    return { ok: true, value: String(s.activeModuleDraft.content || '') };
  }

  function changeInlineEdit(payload = {}) {
    if (!isInlineEditableTextPayload(payload)) {
      return { ok: false, status: 'Inline edit change is unsupported.' };
    }
    const moduleId = payload.target.moduleId;
    const module = actions.getSelectedModuleRecord(moduleId);
    if (!module || module.moduleType !== 'text') {
      return { ok: false, status: 'Text module not found.' };
    }
    let s = getState();
    if (
      s.selectedModuleId !== moduleId &&
      actions.selectModule(moduleId, { renderCanvas: false }) === false
    ) {
      return { ok: false, status: 'Save or discard your current changes before editing text.' };
    }
    s = getState();
    if (!s.activeModuleDraft || s.activeModuleDraftId !== moduleId) {
      actions.setModuleDraft(moduleId, module.config || {});
      s = getState();
    }
    const nextContent = sanitizeInlineTextContent(payload.value);
    const target = getInlineEditTarget(payload.target);
    if (String(s.activeModuleDraft.content || '') !== nextContent) {
      actions.updateModuleDraft({
        ...(s.activeModuleDraft || {}),
        content: nextContent,
      });
      actions.markModuleDraftDirtyFromIframe();
      actions.renderEditorPanel();
    }
    inlineEditState = {
      ...(inlineEditState || {
        moduleId,
        target,
        field: 'content',
        initialValue: String(module.config?.content || ''),
      }),
      moduleId,
      target,
      field: 'content',
      draftValue: nextContent,
      lastIframeValue: nextContent,
      status: 'editing',
    };
    return { ok: true, value: nextContent };
  }

  function commitInlineEdit(payload = {}) {
    let result = { ok: true };
    if (payload.value !== undefined) {
      const moduleId = payload.target?.moduleId;
      const nextContent = sanitizeInlineTextContent(payload.value);
      if (moduleId && isStaleInlineIframePayload(moduleId, nextContent)) {
        clearInlineEditView('stale-iframe-commit', 'commit', false);
        actions.refreshLiveCanvas();
        actions.renderEditorPanel();
        return { ok: true, status: 'Ignored stale inline edit commit.' };
      }
      result = changeInlineEdit(payload);
      if (result?.ok === false) return result;
    }
    clearInlineEditView(payload.reason || 'iframe-commit', 'commit', false);
    actions.refreshLiveCanvas();
    actions.renderEditorPanel();
    return { ok: true };
  }

  function cancelInlineEdit(payload = {}) {
    if (payload.value !== undefined) {
      const moduleId = payload.target?.moduleId;
      const nextContent = sanitizeInlineTextContent(payload.value);
      if (moduleId && isStaleInlineIframePayload(moduleId, nextContent)) {
        clearInlineEditView('stale-iframe-cancel', 'cancel', false);
        actions.refreshLiveCanvas();
        actions.renderEditorPanel();
        return { ok: true, status: 'Ignored stale inline edit cancel.' };
      }
      const result = changeInlineEdit(payload);
      if (result?.ok === false) return result;
    }
    clearInlineEditView(payload.reason || 'iframe-cancel', 'cancel', false);
    actions.refreshLiveCanvas();
    actions.renderEditorPanel();
    return { ok: true };
  }

  return {
    cancelInlineEdit,
    changeInlineEdit,
    clearInlineEditView,
    commitInlineEdit,
    getInlineEditState,
    startInlineEdit,
    syncDraftFromHistory,
    syncDraftToPreview,
  };
}

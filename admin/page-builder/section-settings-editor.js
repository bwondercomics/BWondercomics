import { cloneValue } from '../../shared/page-builder/helpers.js';
import { MAX_COLUMNS, parseLayoutRatios, ratiosToLayout } from '../../shared/page-builder/layout-utils.js';
import {
  isSectionResponsiveField,
  pruneEmptyResponsiveOverrides,
  setResponsiveOverrideValue,
} from '../../shared/page-builder/responsive-overrides.js';

// Section settings editing: layout (column count/ratios), spacing, per-column styling,
// and the save/discard lifecycle. The section draft object itself is owned by the draft
// manager; this editor mutates that live draft in place (matching the inspector's
// field-by-field editing) and stages dirty state through the draft actions.
export function createSectionSettingsEditor({ getState, actions, deps }) {
  // Drop column entries that fall outside the effective column count or carry no
  // styling beyond their index; the backend sanitizer makes the final decision.
  function pruneSectionColumns(columns, layout) {
    if (!Array.isArray(columns)) return [];
    const count = parseLayoutRatios(layout || '1').length;
    return columns
      .filter((column) => column && typeof column === 'object')
      .map((column) => ({ ...column, index: Number(column.index) }))
      .filter(
        (column) => Number.isInteger(column.index) && column.index >= 0 && column.index < count
      )
      .filter((column) => Object.keys(column).some((key) => key !== 'index'));
  }

  function buildSectionSettingsFromDraft(draft = getState().activeSectionDraft) {
    const settings = cloneValue(draft || {}) || {};
    // Layout is a top-level section field, not a setting; saveSectionSettings reads it
    // separately from the draft and sends it atomically alongside settings.
    delete settings.layout;
    ['moduleGap', 'columnGap', 'sectionGap', 'paddingTop', 'paddingBottom', 'minHeight'].forEach(
      (key) => {
        const value = settings?.[key];
        if (value !== '' && value !== null && value !== undefined) {
          settings[key] = value;
        } else {
          delete settings[key];
        }
      }
    );
    if (!settings.backgroundColor) {
      delete settings.backgroundColor;
    }
    settings.columns = pruneSectionColumns(settings.columns, draft?.layout);
    if (!settings.columns.length) {
      delete settings.columns;
    }
    settings.responsive = pruneEmptyResponsiveOverrides(settings.responsive);
    if (!Object.keys(settings.responsive).length) {
      delete settings.responsive;
    }
    return settings;
  }

  function getSectionLayoutFromDraft(draft = getState().activeSectionDraft) {
    return ratiosToLayout(parseLayoutRatios(draft?.layout || '1'));
  }

  // After an atomic section update the backend may have rehomed modules orphaned by a
  // column-count reduction; mirror the returned column/sort indexes onto local records
  // so the canvas reflects the new placement without a reload.
  function syncSectionModulesFromUpdate(section, updated) {
    if (!section || !Array.isArray(updated?.modules)) return;
    const byId = new Map((section.modules || []).map((module) => [module.id, module]));
    updated.modules.forEach((updatedModule) => {
      const local = byId.get(updatedModule.id);
      if (local) {
        local.columnIndex = updatedModule.columnIndex;
        local.sortIndex = updatedModule.sortIndex;
      }
    });
  }

  function toggleSectionSettings(sectionId) {
    const s = getState();
    if (s.activeSectionId === sectionId && s.dirtyScope !== 'section') {
      actions.clearActiveSectionState();
      actions.setSelectedCanvasSurface(null);
      actions.setCanvasStatus('', 'neutral');
      actions.renderCanvas();
      actions.renderEditorPanel();
      return;
    }

    if (s.dirtyScope === 'section' && s.activeSectionId !== sectionId) {
      actions.setCanvasStatus(
        'Save or discard the current section settings before switching sections.',
        'warning'
      );
      actions.renderCanvas();
      return;
    }

    actions.clearSelectedModuleState();
    actions.setSelectedCanvasSurface('section');
    actions.setSelectedColumnIndex(null);
    actions.setActiveEditorTab('modules');
    actions.initializeSectionDraft(sectionId);
    actions.setCanvasStatus('', 'neutral');
    actions.renderCanvas();
    actions.renderEditorPanel();
  }

  function updateActiveSectionDraftField(key, rawValue) {
    const s = getState();
    const draft = s.activeSectionDraft;
    if (!draft || !key) return;
    const raw = String(rawValue ?? '').trim();
    let value = raw;
    if (
      ['moduleGap', 'columnGap', 'sectionGap', 'paddingTop', 'paddingBottom', 'minHeight'].includes(
        key
      )
    ) {
      value = raw ? Math.max(0, Math.round(Number(raw) || 0)) : '';
    }
    if (s.responsiveEditScope === 'device' && isSectionResponsiveField(key)) {
      setResponsiveOverrideValue(draft, s.activeDeviceId, key, value);
    } else if (key !== 'layout') {
      draft[key] = value;
    }
    actions.markDirty('section');
    actions.renderCanvas();
    actions.renderEditorPanel();
  }

  function ensureSectionColumnEntry(index) {
    const draft = getState().activeSectionDraft;
    if (!Array.isArray(draft.columns)) draft.columns = [];
    let entry = draft.columns.find((col) => Number(col?.index) === index);
    if (!entry) {
      entry = { index };
      draft.columns.push(entry);
      draft.columns.sort((a, b) => Number(a.index) - Number(b.index));
    }
    return entry;
  }

  function cleanupSectionColumnEntry(entry) {
    const draft = getState().activeSectionDraft;
    if (!entry || !Array.isArray(draft?.columns)) return;
    if (entry.responsive) {
      entry.responsive = pruneEmptyResponsiveOverrides(entry.responsive);
      if (!Object.keys(entry.responsive).length) {
        delete entry.responsive;
      }
    }
    if (!Object.keys(entry).some((key) => key !== 'index')) {
      draft.columns = draft.columns.filter((item) => item !== entry);
    }
    if (!draft.columns.length) {
      delete draft.columns;
    }
  }

  function ensureSectionColumnEditTarget(index) {
    const s = getState();
    const entry = ensureSectionColumnEntry(index);
    if (s.responsiveEditScope !== 'device') return { entry, target: entry };
    entry.responsive =
      entry.responsive && typeof entry.responsive === 'object' ? entry.responsive : {};
    entry.responsive[s.activeDeviceId] =
      entry.responsive[s.activeDeviceId] && typeof entry.responsive[s.activeDeviceId] === 'object'
        ? entry.responsive[s.activeDeviceId]
        : {};
    return { entry, target: entry.responsive[s.activeDeviceId] };
  }

  function setActiveSectionColumnCount(rawCount) {
    const s = getState();
    const draft = s.activeSectionDraft;
    if (!draft) return;
    const globalRatios = parseLayoutRatios(draft.layout || '1');
    if (s.responsiveEditScope === 'device') {
      const raw = String(rawCount ?? '').trim();
      if (!raw || raw === 'inherit') {
        setResponsiveOverrideValue(draft, s.activeDeviceId, 'layout', '');
      } else {
        const count = Math.max(1, Math.min(globalRatios.length, Math.round(Number(rawCount) || 1)));
        const branchLayout = draft.responsive?.[s.activeDeviceId]?.layout;
        const sourceRatios = branchLayout ? parseLayoutRatios(branchLayout) : globalRatios;
        const next = [];
        for (let index = 0; index < count; index += 1) {
          next.push(sourceRatios[index] ?? globalRatios[index] ?? 1);
        }
        setResponsiveOverrideValue(draft, s.activeDeviceId, 'layout', ratiosToLayout(next));
      }
      actions.markDirty('section');
      actions.renderCanvas();
      actions.renderEditorPanel();
      return;
    }

    const count = Math.max(1, Math.min(MAX_COLUMNS, Math.round(Number(rawCount) || 1)));
    // Guard (client mirror of the backend authority): don't reduce the column count
    // while a to-be-removed column still has modules. The backend rejects this (409),
    // so surface guidance up front instead of mutating the draft into an unsavable state.
    const blockedColumns = [
      ...new Set(
        (actions.getSectionRecord(s.activeSectionId)?.modules || [])
          .map((module) => Number(module.columnIndex) || 0)
          .filter((index) => index >= count)
      ),
    ].sort((a, b) => a - b);
    if (blockedColumns.length) {
      actions.setCanvasStatus(
        `Move or delete the modules in column ${blockedColumns
          .map((index) => index + 1)
          .join(', ')} before reducing the column count.`,
        'warning'
      );
      actions.renderEditorPanel();
      return;
    }
    const ratios = globalRatios;
    // Appended columns get an average share of the existing weights (not weight 1, which
    // would be a sliver under percent-scale weight strings like '20-60-20').
    const appendWeight = Math.max(
      1,
      Math.round(ratios.reduce((sum, r) => sum + r, 0) / ratios.length)
    );
    const next = [];
    for (let i = 0; i < count; i++) next.push(ratios[i] ?? appendWeight);
    draft.layout = ratiosToLayout(next);
    if (Array.isArray(draft.columns)) {
      draft.columns = draft.columns.filter((col) => Number(col?.index) < count);
    }
    actions.markDirty('section');
    actions.renderCanvas();
    actions.renderEditorPanel();
  }

  // `rawValue` is the column's requested width as a PERCENT of the row (the inspector
  // inputs work in percent steps). The other columns renormalize proportionally so the
  // weights always sum to 100 — finer control than stepping small integer ratios.
  function updateActiveSectionColumnRatio(rawIndex, rawValue) {
    const s = getState();
    const draft = s.activeSectionDraft;
    if (!draft) return;
    const index = Number(rawIndex);
    const branchLayout =
      s.responsiveEditScope === 'device' ? draft.responsive?.[s.activeDeviceId]?.layout : null;
    const current = parseLayoutRatios(branchLayout || draft.layout || '1');
    if (!Number.isInteger(index) || index < 0 || index >= current.length) return;
    if (current.length === 1) return; // a single column is always the full row
    const requested = Math.round(Number(rawValue) || 0);
    const clamped = Math.max(5, Math.min(90, requested));
    const oldOtherTotal = current.reduce((sum, r, i) => (i === index ? sum : sum + r), 0);
    const otherBudget = 100 - clamped;
    const ratios = current.map((r, i) => {
      if (i === index) return clamped;
      const share = oldOtherTotal > 0 ? r / oldOtherTotal : 1 / (current.length - 1);
      return Math.max(1, Math.round(share * otherBudget));
    });
    // Fix rounding drift so the weights sum to exactly 100 (adjust the widest other column).
    const drift = 100 - ratios.reduce((sum, r) => sum + r, 0);
    if (drift !== 0) {
      let adjust = -1;
      ratios.forEach((r, i) => {
        if (i !== index && (adjust === -1 || r > ratios[adjust])) adjust = i;
      });
      if (adjust !== -1) ratios[adjust] = Math.max(1, ratios[adjust] + drift);
    }
    if (s.responsiveEditScope === 'device') {
      setResponsiveOverrideValue(draft, s.activeDeviceId, 'layout', ratiosToLayout(ratios));
    } else {
      draft.layout = ratiosToLayout(ratios);
    }
    actions.markDirty('section');
    actions.renderCanvas();
    actions.renderEditorPanel();
  }

  function updateActiveSectionColumnField(rawIndex, key, rawValue, options = {}) {
    const s = getState();
    const draft = s.activeSectionDraft;
    if (!draft || !key) return;
    const index = Number(rawIndex);
    const globalColumnCount = parseLayoutRatios(draft.layout || '1').length;
    if (!Number.isInteger(index) || index < 0 || index >= globalColumnCount) return;
    const { entry, target } = ensureSectionColumnEditTarget(index);
    switch (key) {
      case 'hidden': {
        if (s.responsiveEditScope === 'device') {
          const value = String(rawValue ?? '').trim();
          if (!value || value === 'inherit') delete target.hidden;
          else target.hidden = value === 'true';
        } else if (rawValue) {
          target.hidden = true;
        } else {
          delete target.hidden;
        }
        break;
      }
      case 'alignment': {
        const raw = String(rawValue || '').trim();
        const value = raw === 'inherit' ? '' : raw;
        if (value && (s.responsiveEditScope === 'device' || value !== 'stretch')) {
          target.alignment = value;
        } else {
          delete target.alignment;
        }
        break;
      }
      case 'minHeight': {
        const raw = String(rawValue ?? '').trim();
        if (raw) target.minHeight = Math.max(0, Math.round(Number(raw) || 0));
        else delete target.minHeight;
        break;
      }
      case 'appearance': {
        if (rawValue && typeof rawValue === 'object' && Object.keys(rawValue).length) {
          target.appearance = cloneValue(rawValue);
        } else {
          delete target.appearance;
        }
        break;
      }
      case 'paddingTop':
      case 'paddingRight':
      case 'paddingBottom':
      case 'paddingLeft': {
        const side = key.replace('padding', '').toLowerCase();
        const raw = String(rawValue ?? '').trim();
        const padding = { ...(target.padding || {}) };
        if (raw) padding[side] = Math.max(0, Math.round(Number(raw) || 0));
        else delete padding[side];
        if (Object.keys(padding).length) target.padding = padding;
        else delete target.padding;
        break;
      }
      case 'panelBackground': {
        // Non-responsive: panel background art lives on the global column entry, not a device branch.
        if (rawValue && typeof rawValue === 'object' && Object.keys(rawValue).length) {
          entry.panelBackground = cloneValue(rawValue);
        } else {
          delete entry.panelBackground;
        }
        break;
      }
      case 'panelGap': {
        // Non-responsive: write module spacing to the global column entry.
        const raw = String(rawValue ?? '').trim();
        if (raw) entry.panelGap = Math.max(0, Math.round(Number(raw) || 0));
        else delete entry.panelGap;
        break;
      }
      default:
        return;
    }
    cleanupSectionColumnEntry(entry);
    actions.markDirty('section');
    actions.renderCanvas();
    if (options.rerenderEditor !== false) {
      actions.renderEditorPanel();
    }
  }

  function discardSectionSettings() {
    const { activeSectionId } = getState();
    if (!activeSectionId) return;
    actions.initializeSectionDraft(activeSectionId);
    actions.clearDirty('section');
    actions.setCanvasStatus('Section changes discarded.', 'neutral');
    actions.renderCanvas();
  }

  async function saveSectionSettings() {
    const { activeSectionId, activeSectionDraft } = getState();
    if (!activeSectionId || !activeSectionDraft) return false;

    const section = actions.getSectionRecord(activeSectionId);
    if (!section) return false;

    const settings = buildSectionSettingsFromDraft(activeSectionDraft);
    const layout = getSectionLayoutFromDraft(activeSectionDraft);

    // Layout (column count/ratio) and settings (per-column styling, spacing) save in one
    // request; the backend rejects (409) a column-count reduction that would orphan
    // modules, which surfaces here as a failed save (the column-count control guards
    // against this up front).
    let updateError = '';
    const updated = await deps.updateSection(
      activeSectionId,
      { layout, settings },
      {
        onError: (error) => {
          updateError = error?.message || '';
        },
      }
    );
    if (updated) {
      section.settings = updated.settings || settings;
      section.layout = updated.layout || layout;
      syncSectionModulesFromUpdate(section, updated);
      actions.initializeSectionDraft(activeSectionId);
      actions.clearDirty('section');
      actions.setCanvasStatus('Section settings saved.', 'success');
      actions.renderCanvas();
      return true;
    }

    actions.setCanvasStatus(updateError || 'Failed to save section settings.', 'danger');
    actions.renderCanvas();
    return false;
  }

  return {
    buildSectionSettingsFromDraft,
    discardSectionSettings,
    getSectionLayoutFromDraft,
    saveSectionSettings,
    setActiveSectionColumnCount,
    toggleSectionSettings,
    updateActiveSectionColumnField,
    updateActiveSectionColumnRatio,
    updateActiveSectionDraftField,
  };
}

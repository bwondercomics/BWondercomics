import { cloneValue } from '../../shared/page-builder/helpers.js';

const DEFAULT_HISTORY_LIMIT = 50;

function stableSerialize(value) {
  return JSON.stringify(value ?? null);
}

function createEmptyEntry(snapshot = null) {
  return {
    baseline: cloneValue(snapshot),
    entries: [cloneValue(snapshot)],
    index: 0,
  };
}

export function createDraftUndoStack({
  getKey,
  getSnapshot,
  applySnapshot,
  onChange,
  limit = DEFAULT_HISTORY_LIMIT,
} = {}) {
  const histories = new Map();

  function getHistory(scope, options = {}) {
    const key = getKey?.(scope) || '';
    if (!key) return null;
    if (!histories.has(key) && options.create !== false) {
      histories.set(key, createEmptyEntry(getSnapshot?.(scope) ?? null));
    }
    return histories.get(key) || null;
  }

  function emitChange(scope) {
    if (typeof onChange === 'function') {
      onChange(scope, getState(scope));
    }
  }

  function reset(scope) {
    const key = getKey?.(scope) || '';
    if (!key) return;
    histories.set(key, createEmptyEntry(getSnapshot?.(scope) ?? null));
    emitChange(scope);
  }

  function record(scope) {
    const history = getHistory(scope);
    if (!history) return;
    const snapshot = getSnapshot?.(scope) ?? null;
    const serialized = stableSerialize(snapshot);
    if (stableSerialize(history.entries[history.index]) === serialized) return;

    history.entries = history.entries.slice(0, history.index + 1);
    history.entries.push(cloneValue(snapshot));
    if (history.entries.length > limit) {
      history.entries.shift();
    }
    history.index = history.entries.length - 1;
    emitChange(scope);
  }

  function isSnapshotDirty(history, snapshot) {
    return stableSerialize(snapshot) !== stableSerialize(history?.baseline ?? null);
  }

  function apply(scope, direction) {
    const history = getHistory(scope, { create: false });
    if (!history) return { ok: false, status: 'No draft history available.' };
    const nextIndex = history.index + direction;
    if (nextIndex < 0 || nextIndex >= history.entries.length) {
      return { ok: false, status: direction < 0 ? 'Nothing to undo.' : 'Nothing to redo.' };
    }
    history.index = nextIndex;
    const snapshot = cloneValue(history.entries[history.index]);
    applySnapshot?.(scope, snapshot, {
      dirty: isSnapshotDirty(history, snapshot),
      canUndo: history.index > 0,
      canRedo: history.index < history.entries.length - 1,
    });
    emitChange(scope);
    return {
      ok: true,
      snapshot,
      dirty: isSnapshotDirty(history, snapshot),
      canUndo: history.index > 0,
      canRedo: history.index < history.entries.length - 1,
    };
  }

  function undo(scope) {
    return apply(scope, -1);
  }

  function redo(scope) {
    return apply(scope, 1);
  }

  function getState(scope) {
    const history = getHistory(scope, { create: false });
    if (!history) return { canUndo: false, canRedo: false, dirty: false };
    const snapshot = history.entries[history.index];
    return {
      canUndo: history.index > 0,
      canRedo: history.index < history.entries.length - 1,
      dirty: isSnapshotDirty(history, snapshot),
      index: history.index,
      length: history.entries.length,
    };
  }

  function canUndo(scope) {
    return getState(scope).canUndo;
  }

  function canRedo(scope) {
    return getState(scope).canRedo;
  }

  function clear() {
    histories.clear();
    emitChange(null);
  }

  return {
    canRedo,
    canUndo,
    clear,
    getState,
    record,
    redo,
    reset,
    undo,
  };
}

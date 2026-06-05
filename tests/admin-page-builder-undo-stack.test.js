import { describe, expect, it, vi } from 'vitest';

import { createDraftUndoStack } from '../admin/page-builder/undo-stack.js';

describe('admin page-builder draft undo stack', () => {
  function createHarness(limit) {
    let scope = 'module';
    let snapshot = { content: 'saved' };
    const applied = [];
    const stack = createDraftUndoStack({
      limit,
      getKey: (nextScope) => `${nextScope || scope}:target`,
      getSnapshot: () => snapshot,
      applySnapshot: (_scope, nextSnapshot, meta) => {
        snapshot = nextSnapshot;
        applied.push({ snapshot: nextSnapshot, meta });
      },
    });
    return {
      applied,
      get snapshot() {
        return snapshot;
      },
      setSnapshot(nextSnapshot) {
        snapshot = nextSnapshot;
      },
      setScope(nextScope) {
        scope = nextScope;
      },
      stack,
    };
  }

  it('resets the baseline and records unique draft snapshots', () => {
    const harness = createHarness();
    harness.stack.reset('module');
    harness.setSnapshot({ content: 'first' });
    harness.stack.record('module');
    harness.stack.record('module');
    harness.setSnapshot({ content: 'second' });
    harness.stack.record('module');

    expect(harness.stack.getState('module')).toMatchObject({
      canUndo: true,
      canRedo: false,
      dirty: true,
      length: 3,
    });
  });

  it('undoes and redoes local draft snapshots without persistence hooks', () => {
    const harness = createHarness();
    harness.stack.reset('module');
    harness.setSnapshot({ content: 'draft one' });
    harness.stack.record('module');
    harness.setSnapshot({ content: 'draft two' });
    harness.stack.record('module');

    expect(harness.stack.undo('module')).toMatchObject({ ok: true, dirty: true });
    expect(harness.snapshot).toEqual({ content: 'draft one' });
    expect(harness.stack.undo('module')).toMatchObject({ ok: true, dirty: false });
    expect(harness.snapshot).toEqual({ content: 'saved' });
    expect(harness.stack.redo('module')).toMatchObject({ ok: true, dirty: true });
    expect(harness.snapshot).toEqual({ content: 'draft one' });
    expect(harness.applied).toHaveLength(3);
  });

  it('clears redo after a new edit following undo', () => {
    const harness = createHarness();
    harness.stack.reset('module');
    harness.setSnapshot({ content: 'draft one' });
    harness.stack.record('module');
    harness.setSnapshot({ content: 'draft two' });
    harness.stack.record('module');
    harness.stack.undo('module');
    harness.setSnapshot({ content: 'replacement' });
    harness.stack.record('module');

    expect(harness.stack.getState('module')).toMatchObject({
      canUndo: true,
      canRedo: false,
      length: 3,
    });
  });

  it('caps history length', () => {
    const harness = createHarness(3);
    harness.stack.reset('module');
    for (let index = 0; index < 5; index += 1) {
      harness.setSnapshot({ content: `draft ${index}` });
      harness.stack.record('module');
    }

    expect(harness.stack.getState('module')).toMatchObject({
      length: 3,
      index: 2,
    });
  });

  it('reports missing history as a no-op instead of creating snapshots during undo', () => {
    const applySnapshot = vi.fn();
    const stack = createDraftUndoStack({
      getKey: () => '',
      getSnapshot: () => ({ content: 'draft' }),
      applySnapshot,
    });

    expect(stack.undo('module')).toEqual({
      ok: false,
      status: 'No draft history available.',
    });
    expect(applySnapshot).not.toHaveBeenCalled();
  });
});

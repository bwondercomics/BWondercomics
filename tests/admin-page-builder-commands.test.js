import { describe, expect, it, vi } from 'vitest';

import { BUILDER_COMMANDS, createBuilderCommandRegistry } from '../admin/page-builder/commands.js';
import { BUILDER_STRUCTURAL_COMMANDS } from '../admin/page-builder/structural-commands.js';

describe('admin page-builder command registry', () => {
  it('rejects duplicate command IDs', () => {
    expect(() =>
      createBuilderCommandRegistry({
        commands: [{ id: BUILDER_COMMANDS.SELECT, run: vi.fn() }],
      })
    ).toThrow(/Duplicate builder command/);
  });

  it('reports unknown commands without throwing', () => {
    const registry = createBuilderCommandRegistry();

    expect(registry.runCommand('builder:missing')).toEqual({
      ok: false,
      status: 'Unknown command: builder:missing',
    });
  });

  it('delegates structural commands and preserves synchronous results', () => {
    const runCommand = vi.fn(() => ({ ok: true, status: 'dragging' }));
    const registry = createBuilderCommandRegistry({
      managers: {
        structuralCommands: { runCommand },
      },
    });

    const result = registry.runCommand(BUILDER_STRUCTURAL_COMMANDS.DRAG_START, {
      source: 'block',
    });

    expect(result).toEqual({ ok: true, status: 'dragging' });
    expect(runCommand).toHaveBeenCalledWith(BUILDER_STRUCTURAL_COMMANDS.DRAG_START, {
      source: 'block',
    });
  });

  it('registers every structural command in the central registry', () => {
    const registry = createBuilderCommandRegistry();

    expect(registry.listCommands()).toEqual(
      expect.arrayContaining(Object.values(BUILDER_STRUCTURAL_COMMANDS))
    );
  });

  it('uses enabled state for disabled commands', () => {
    const run = vi.fn(() => ({ ok: true }));
    const registry = createBuilderCommandRegistry({
      commands: [
        { id: 'builder:test-disabled', enabled: false, visible: true, describe: 'Disabled', run },
      ],
    });

    expect(registry.canRunCommand('builder:test-disabled')).toBe(false);
    expect(registry.isCommandVisible('builder:test-disabled')).toBe(true);
    expect(registry.runCommand('builder:test-disabled')).toEqual({
      ok: false,
      status: 'Command is disabled.',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('runs confirmations before custom commands', () => {
    const run = vi.fn(() => ({ ok: true }));
    const registry = createBuilderCommandRegistry({
      commands: [{ id: 'builder:test-confirm', confirm: 'Really?', run }],
      deps: { confirm: vi.fn(() => false) },
    });

    expect(registry.runCommand('builder:test-confirm')).toEqual({
      ok: false,
      status: 'Command cancelled.',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('routes chrome preview and draft commands through injected actions', async () => {
    const enterChromePreview = vi.fn(() => ({ ok: true, status: 'preview' }));
    const saveCurrentDraft = vi.fn(async () => ({ ok: true, status: 'saved' }));
    const registry = createBuilderCommandRegistry({
      getState: () => ({ editorChromeMode: 'edit', dirtyScope: 'module' }),
      actions: {
        canSaveCurrentDraft: () => true,
        enterChromePreview,
        saveCurrentDraft,
      },
    });

    expect(registry.runCommand(BUILDER_COMMANDS.ENTER_PREVIEW)).toEqual({
      ok: true,
      status: 'preview',
    });
    await expect(registry.runCommand(BUILDER_COMMANDS.SAVE_DRAFT)).resolves.toEqual({
      ok: true,
      status: 'saved',
    });
    expect(enterChromePreview).toHaveBeenCalledTimes(1);
    expect(saveCurrentDraft).toHaveBeenCalledTimes(1);
  });

  it('routes inline text edit commands through injected actions', () => {
    const startInlineEdit = vi.fn(() => ({ ok: true, value: '<p>Copy</p>' }));
    const changeInlineEdit = vi.fn(() => ({ ok: true }));
    const target = {
      kind: 'module',
      key: 'module:text-1',
      pageId: 'page-1',
      moduleId: 'text-1',
      moduleType: 'text',
    };
    const registry = createBuilderCommandRegistry({
      getState: () => ({ editorChromeMode: 'edit' }),
      actions: {
        startInlineEdit,
        changeInlineEdit,
      },
    });

    expect(
      registry.runCommand(BUILDER_COMMANDS.INLINE_EDIT_START, { target, field: 'content' })
    ).toEqual({ ok: true, value: '<p>Copy</p>' });
    expect(
      registry.runCommand(BUILDER_COMMANDS.INLINE_EDIT_CHANGE, {
        target,
        field: 'content',
        value: '<p>Updated</p>',
      })
    ).toEqual({ ok: true });
    expect(startInlineEdit).toHaveBeenCalledWith({ target, field: 'content' });
    expect(changeInlineEdit).toHaveBeenCalledWith({
      target,
      field: 'content',
      value: '<p>Updated</p>',
    });
  });

  it('disables inline edit commands outside text content editing', () => {
    const registry = createBuilderCommandRegistry({
      getState: () => ({ editorChromeMode: 'preview' }),
    });

    expect(
      registry.canRunCommand(BUILDER_COMMANDS.INLINE_EDIT_START, {
        target: { kind: 'module', moduleType: 'text', moduleId: 'm1' },
        field: 'content',
      })
    ).toBe(false);
    expect(
      registry.canRunCommand(BUILDER_COMMANDS.INLINE_EDIT_START, {
        target: { kind: 'module', moduleType: 'buttons', moduleId: 'm1' },
        field: 'content',
      })
    ).toBe(false);
  });

  it('restores snapshots through the async command contract and reconciles canonical state', async () => {
    const page = { id: 'page-1', sections: [{ id: 'fresh-section', modules: [] }] };
    const ensureCleanWorkspace = vi.fn(() => true);
    const restorePageSnapshot = vi.fn(async () => page);
    let resolveRefresh;
    const refreshRestoredPage = vi.fn(() => new Promise((resolve) => (resolveRefresh = resolve)));
    const activateRestoredPage = vi.fn();
    const context = { generation: 4, pageId: 'page-1' };
    const registry = createBuilderCommandRegistry({
      actions: {
        ensureCleanWorkspace,
        activateRestoredPage,
        refreshRestoredPage,
        captureRecoveryContext: () => context,
        isRecoveryContextCurrent: () => true,
      },
      deps: { restorePageSnapshot },
    });

    await expect(
      registry.runCommand(BUILDER_COMMANDS.RESTORE_SNAPSHOT, {
        snapshotId: 'snapshot-1',
        deleted: true,
      })
    ).resolves.toMatchObject({
      ok: true,
      committed: true,
      contextChanged: false,
      page,
      status: 'Deleted page recovered as an unpublished, unbound draft.',
    });
    expect(ensureCleanWorkspace.mock.invocationCallOrder[0]).toBeLessThan(
      restorePageSnapshot.mock.invocationCallOrder[0]
    );
    expect(restorePageSnapshot).toHaveBeenCalledWith('snapshot-1', { signal: undefined });
    expect(activateRestoredPage).toHaveBeenCalledWith(page, { deleted: true });
    expect(refreshRestoredPage).toHaveBeenCalledWith(page, { context, deleted: true });
    resolveRefresh({ refreshWarning: '' });
  });

  it('does not reconcile a committed restore after the builder context changes', async () => {
    const page = { id: 'page-1' };
    const activateRestoredPage = vi.fn();
    const refreshRestoredPage = vi.fn();
    const context = Object.freeze({ generation: 7, pageId: 'page-1' });
    const registry = createBuilderCommandRegistry({
      actions: {
        ensureCleanWorkspace: () => true,
        isRecoveryContextCurrent: () => false,
        activateRestoredPage,
        refreshRestoredPage,
      },
      deps: { restorePageSnapshot: vi.fn(async () => page) },
    });

    await expect(
      registry.runCommand(BUILDER_COMMANDS.RESTORE_SNAPSHOT, {
        snapshotId: 'snapshot-stale-context',
        context,
      })
    ).resolves.toMatchObject({
      ok: true,
      committed: true,
      contextChanged: true,
      status: expect.stringMatching(/previous builder context/i),
    });
    expect(activateRestoredPage).not.toHaveBeenCalled();
    expect(refreshRestoredPage).not.toHaveBeenCalled();
  });

  it('classifies malformed success and post-commit activation errors as committed', async () => {
    const malformedRegistry = createBuilderCommandRegistry({
      actions: { ensureCleanWorkspace: () => true },
      deps: {
        restorePageSnapshot: vi.fn(async () => {
          throw Object.assign(new Error('invalid response'), {
            status: 200,
            code: 'invalid_recovery_response',
          });
        }),
      },
    });
    await expect(
      malformedRegistry.runCommand(BUILDER_COMMANDS.RESTORE_SNAPSHOT, {
        snapshotId: 'snapshot-malformed-success',
      })
    ).resolves.toMatchObject({
      ok: true,
      committed: true,
      code: 'invalid_recovery_response',
      status: expect.stringMatching(/reload/i),
    });

    const activationRegistry = createBuilderCommandRegistry({
      actions: {
        ensureCleanWorkspace: () => true,
        isRecoveryContextCurrent: () => true,
        activateRestoredPage: () => {
          throw new Error('render failed');
        },
      },
      deps: { restorePageSnapshot: vi.fn(async () => ({ id: 'page-1' })) },
    });
    await expect(
      activationRegistry.runCommand(BUILDER_COMMANDS.RESTORE_SNAPSHOT, {
        snapshotId: 'snapshot-activation-failure',
      })
    ).resolves.toMatchObject({
      ok: true,
      committed: true,
      code: 'post_commit_client_failure',
      status: expect.stringMatching(/reload/i),
    });
  });

  it('blocks dirty or duplicate restores and maps structured conflicts', async () => {
    const dirtyRestore = vi.fn();
    const dirtyRegistry = createBuilderCommandRegistry({
      actions: { ensureCleanWorkspace: () => false },
      deps: { restorePageSnapshot: dirtyRestore },
    });
    await expect(
      dirtyRegistry.runCommand(BUILDER_COMMANDS.RESTORE_SNAPSHOT, {
        snapshotId: 'snapshot-dirty',
      })
    ).resolves.toMatchObject({ ok: false, code: 'dirty_workspace' });
    expect(dirtyRestore).not.toHaveBeenCalled();

    let resolveRestore;
    const restorePageSnapshot = vi.fn(() => new Promise((resolve) => (resolveRestore = resolve)));
    const registry = createBuilderCommandRegistry({
      actions: {
        ensureCleanWorkspace: () => true,
        activateRestoredPage: vi.fn(async () => ({})),
      },
      deps: { restorePageSnapshot },
    });
    const pending = registry.runCommand(BUILDER_COMMANDS.RESTORE_SNAPSHOT, {
      snapshotId: 'snapshot-pending',
    });
    expect(
      registry.runCommand(BUILDER_COMMANDS.RESTORE_SNAPSHOT, {
        snapshotId: 'snapshot-pending',
      })
    ).toEqual({ ok: false, status: 'Command is disabled.' });
    resolveRestore({ id: 'page-1' });
    await pending;

    const conflictRegistry = createBuilderCommandRegistry({
      actions: { ensureCleanWorkspace: () => true },
      deps: {
        restorePageSnapshot: vi.fn(async () => {
          throw Object.assign(new Error('conflict'), {
            status: 409,
            code: 'snapshot_slug_conflict',
          });
        }),
      },
    });
    await expect(
      conflictRegistry.runCommand(BUILDER_COMMANDS.RESTORE_SNAPSHOT, {
        snapshotId: 'snapshot-conflict',
      })
    ).resolves.toMatchObject({
      ok: false,
      code: 'snapshot_slug_conflict',
      status: expect.stringMatching(/slug is now in use/i),
    });

    const incompatibleRegistry = createBuilderCommandRegistry({
      actions: { ensureCleanWorkspace: () => true },
      deps: {
        restorePageSnapshot: vi.fn(async () => {
          throw Object.assign(new Error('current page incompatible'), {
            status: 409,
            code: 'current_page_incompatible',
          });
        }),
      },
    });
    await expect(
      incompatibleRegistry.runCommand(BUILDER_COMMANDS.RESTORE_SNAPSHOT, {
        snapshotId: 'snapshot-current-incompatible',
      })
    ).resolves.toMatchObject({
      ok: false,
      code: 'current_page_incompatible',
      status: expect.stringMatching(/live page could not be serialized safely/i),
    });
  });
});

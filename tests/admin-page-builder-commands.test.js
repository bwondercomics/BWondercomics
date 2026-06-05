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

  it('uses enabled state for disabled commands', () => {
    const registry = createBuilderCommandRegistry();

    expect(registry.canRunCommand(BUILDER_STRUCTURAL_COMMANDS.DUPLICATE_SELECTED)).toBe(false);
    expect(registry.isCommandVisible(BUILDER_STRUCTURAL_COMMANDS.DUPLICATE_SELECTED)).toBe(true);
    expect(registry.runCommand(BUILDER_STRUCTURAL_COMMANDS.DUPLICATE_SELECTED)).toEqual({
      ok: false,
      status: 'Command is disabled.',
    });
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
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BUILDER_COMMANDS } from '../admin/page-builder/commands.js';
import {
  createBuilderKeymapManager,
  resolveBuilderKeymapCommand,
  shouldSuppressBuilderKeymap,
} from '../admin/page-builder/keymaps.js';
import { BUILDER_STRUCTURAL_COMMANDS } from '../admin/page-builder/structural-commands.js';

function keydown(key, init = {}) {
  return new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
}

describe('admin page-builder keymaps', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('maps conservative shortcuts to builder command IDs', () => {
    expect(resolveBuilderKeymapCommand(keydown('s', { ctrlKey: true }))).toEqual({
      id: BUILDER_COMMANDS.SAVE_DRAFT,
    });
    expect(resolveBuilderKeymapCommand(keydown('z', { metaKey: true }))).toEqual({
      id: BUILDER_COMMANDS.UNDO_DRAFT,
    });
    expect(resolveBuilderKeymapCommand(keydown('z', { metaKey: true, shiftKey: true }))).toEqual({
      id: BUILDER_COMMANDS.REDO_DRAFT,
    });
    expect(resolveBuilderKeymapCommand(keydown('Delete'))).toEqual({
      id: BUILDER_STRUCTURAL_COMMANDS.DELETE_SELECTED,
    });
    expect(resolveBuilderKeymapCommand(keydown('ArrowDown', { altKey: true }))).toEqual({
      id: BUILDER_COMMANDS.SELECT_NEXT,
    });
  });

  it('suppresses shortcuts while focus is in text controls or modal surfaces', () => {
    document.body.innerHTML = '<input id="field"><div class="modal active"></div>';
    const input = document.getElementById('field');
    input.focus();

    expect(shouldSuppressBuilderKeymap(keydown('s', { ctrlKey: true }))).toBe(true);
    input.blur();
    expect(shouldSuppressBuilderKeymap(keydown('s', { ctrlKey: true }))).toBe(true);
  });

  it('does not prevent default when the builder is closed or command is disabled', async () => {
    const runCommand = vi.fn();
    const manager = createBuilderKeymapManager({
      getState: () => ({ builderOpen: false }),
      actions: {
        canRunCommand: () => true,
        runCommand,
      },
    });
    const closedEvent = keydown('s', { ctrlKey: true });

    await manager.handleKeydown(closedEvent);
    expect(runCommand).not.toHaveBeenCalled();
    expect(closedEvent.defaultPrevented).toBe(false);

    const disabledManager = createBuilderKeymapManager({
      getState: () => ({ builderOpen: true }),
      actions: {
        canRunCommand: () => false,
        runCommand,
      },
    });
    const disabledEvent = keydown('s', { ctrlKey: true });

    await disabledManager.handleKeydown(disabledEvent);
    expect(disabledEvent.defaultPrevented).toBe(false);
  });

  it('prevents default only after an enabled command runs', async () => {
    const runCommand = vi.fn(() => ({ ok: true }));
    const manager = createBuilderKeymapManager({
      getState: () => ({ builderOpen: true }),
      actions: {
        canRunCommand: () => true,
        runCommand,
      },
    });
    const event = keydown('s', { ctrlKey: true });

    await manager.handleKeydown(event);

    expect(runCommand).toHaveBeenCalledWith(BUILDER_COMMANDS.SAVE_DRAFT);
    expect(event.defaultPrevented).toBe(true);
  });

  it('falls Escape back to transient cancel when chrome preview is not active', async () => {
    const runCommand = vi.fn(() => ({ ok: true }));
    const manager = createBuilderKeymapManager({
      getState: () => ({ builderOpen: true }),
      actions: {
        canRunCommand: (id) => id === BUILDER_COMMANDS.CANCEL_TRANSIENT,
        runCommand,
      },
    });
    const event = keydown('Escape');

    await manager.handleKeydown(event);

    expect(runCommand).toHaveBeenCalledWith(BUILDER_COMMANDS.CANCEL_TRANSIENT);
    expect(event.defaultPrevented).toBe(true);
  });

  it('allows Escape to exit chrome preview when the restore button has focus', async () => {
    document.body.innerHTML = '<button id="pbRestorePreviewChrome">Edit</button>';
    const restoreButton = document.getElementById('pbRestorePreviewChrome');
    restoreButton.focus();
    const runCommand = vi.fn(() => ({ ok: true }));
    const manager = createBuilderKeymapManager({
      getState: () => ({ builderOpen: true, editorChromeMode: 'preview' }),
      actions: {
        canRunCommand: (id) => id === BUILDER_COMMANDS.EXIT_PREVIEW,
        runCommand,
      },
    });
    const event = keydown('Escape');

    manager.bind();
    restoreButton.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 0));
    manager.unbind();

    expect(runCommand).toHaveBeenCalledWith(BUILDER_COMMANDS.EXIT_PREVIEW);
    expect(event.defaultPrevented).toBe(true);
  });

  it('replaces previous document keymap bindings when a new manager binds', async () => {
    const firstRunCommand = vi.fn(() => ({ ok: true }));
    const secondRunCommand = vi.fn(() => ({ ok: true }));
    const firstManager = createBuilderKeymapManager({
      getState: () => ({ builderOpen: true }),
      actions: {
        canRunCommand: () => true,
        runCommand: firstRunCommand,
      },
    });
    const secondManager = createBuilderKeymapManager({
      getState: () => ({ builderOpen: true }),
      actions: {
        canRunCommand: () => true,
        runCommand: secondRunCommand,
      },
    });

    firstManager.bind();
    secondManager.bind();
    document.dispatchEvent(keydown('s', { ctrlKey: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(firstRunCommand).not.toHaveBeenCalled();
    expect(secondRunCommand).toHaveBeenCalledWith(BUILDER_COMMANDS.SAVE_DRAFT);
    secondManager.unbind();
  });
});

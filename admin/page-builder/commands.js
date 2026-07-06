import { BUILDER_STRUCTURAL_COMMANDS } from './structural-commands.js';

export const BUILDER_COMMANDS = Object.freeze({
  SELECT: 'builder:select',
  SELECT_PARENT: 'builder:select-parent',
  SELECT_NEXT: 'builder:select-next',
  SELECT_PREV: 'builder:select-prev',
  SET_DEVICE: 'builder:set-device',
  TOGGLE_PREVIEW: 'builder:toggle-preview',
  ENTER_PREVIEW: 'builder:enter-preview',
  EXIT_PREVIEW: 'builder:exit-preview',
  TOGGLE_MENUS: 'builder:toggle-menus',
  CANCEL_TRANSIENT: 'builder:cancel-transient',
  SAVE_DRAFT: 'builder:save-draft',
  DISCARD_DRAFT: 'builder:discard-draft',
  UNDO_DRAFT: 'builder:undo-draft',
  REDO_DRAFT: 'builder:redo-draft',
  INLINE_EDIT_START: 'builder:inline-edit-start',
  INLINE_EDIT_CHANGE: 'builder:inline-edit-change',
  INLINE_EDIT_COMMIT: 'builder:inline-edit-commit',
  INLINE_EDIT_CANCEL: 'builder:inline-edit-cancel',
});

function result(ok, details = {}) {
  return { ok, ...details };
}

function normalizeCommandResult(value) {
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'ok')) {
    return value;
  }
  return result(value !== false);
}

function createCommandContext({ id, payload, getState, actions, managers, deps }) {
  return {
    id,
    payload,
    state: typeof getState === 'function' ? getState() : {},
    actions,
    managers,
    deps,
  };
}

function isEnabled(definition, context) {
  if (typeof definition.enabled !== 'function') return definition.enabled !== false;
  return definition.enabled(context) !== false;
}

function isVisible(definition, context) {
  if (typeof definition.visible === 'function') return definition.visible(context) !== false;
  return definition.visible !== false;
}

function describe(definition, context) {
  if (typeof definition.describe === 'function') return definition.describe(context);
  return definition.describe || definition.id;
}

function createStructuralCommand(id) {
  return {
    id,
    run: ({ payload, managers }) => managers.structuralCommands?.runCommand(id, payload),
  };
}

function createDefaultCommands() {
  return [
    createStructuralCommand(BUILDER_STRUCTURAL_COMMANDS.DRAG_START),
    createStructuralCommand(BUILDER_STRUCTURAL_COMMANDS.DRAG_OVER),
    createStructuralCommand(BUILDER_STRUCTURAL_COMMANDS.DROP),
    createStructuralCommand(BUILDER_STRUCTURAL_COMMANDS.DRAG_END),
    createStructuralCommand(BUILDER_STRUCTURAL_COMMANDS.INSERT),
    createStructuralCommand(BUILDER_STRUCTURAL_COMMANDS.MOVE),
    createStructuralCommand(BUILDER_STRUCTURAL_COMMANDS.INSERT_SECTION),
    createStructuralCommand(BUILDER_STRUCTURAL_COMMANDS.MOVE_SECTION),
    createStructuralCommand(BUILDER_STRUCTURAL_COMMANDS.DELETE_SELECTED),
    createStructuralCommand(BUILDER_STRUCTURAL_COMMANDS.HIDE_ON_DEVICE),
    createStructuralCommand(BUILDER_STRUCTURAL_COMMANDS.DUPLICATE_SELECTED),
    createStructuralCommand(BUILDER_STRUCTURAL_COMMANDS.MOVE_MODULE_STEP),
    {
      id: BUILDER_COMMANDS.SELECT,
      enabled: ({ payload }) => !!payload?.target,
      run: ({ payload, actions }) =>
        result(actions.selectCanvasTarget?.(payload.target) !== false, {
          selectedTarget: payload.target,
        }),
    },
    {
      id: BUILDER_COMMANDS.SELECT_PARENT,
      enabled: ({ actions }) => actions.canSelectRelativeTarget?.('parent') !== false,
      run: ({ actions }) => actions.selectRelativeTarget?.('parent'),
    },
    {
      id: BUILDER_COMMANDS.SELECT_NEXT,
      enabled: ({ actions }) => actions.canSelectRelativeTarget?.('next') !== false,
      run: ({ actions }) => actions.selectRelativeTarget?.('next'),
    },
    {
      id: BUILDER_COMMANDS.SELECT_PREV,
      enabled: ({ actions }) => actions.canSelectRelativeTarget?.('prev') !== false,
      run: ({ actions }) => actions.selectRelativeTarget?.('prev'),
    },
    {
      id: BUILDER_COMMANDS.SET_DEVICE,
      enabled: ({ payload }) => !!payload?.deviceId,
      run: ({ payload, actions }) => actions.setDevice?.(payload.deviceId),
    },
    {
      id: BUILDER_COMMANDS.TOGGLE_PREVIEW,
      run: ({ state, actions }) =>
        state.editorChromeMode === 'preview'
          ? actions.exitChromePreview?.()
          : actions.enterChromePreview?.(),
    },
    {
      id: BUILDER_COMMANDS.ENTER_PREVIEW,
      enabled: ({ state }) => state.editorChromeMode !== 'preview',
      run: ({ actions }) => actions.enterChromePreview?.(),
    },
    {
      id: BUILDER_COMMANDS.EXIT_PREVIEW,
      enabled: ({ state }) => state.editorChromeMode === 'preview',
      run: ({ actions }) => actions.exitChromePreview?.(),
    },
    {
      id: BUILDER_COMMANDS.TOGGLE_MENUS,
      run: ({ actions }) => actions.toggleMenus?.(),
    },
    {
      id: BUILDER_COMMANDS.CANCEL_TRANSIENT,
      enabled: ({ state }) => !!state.activeInsertTarget || !!state.liveDragState,
      run: ({ actions }) => actions.cancelTransientState?.(),
    },
    {
      id: BUILDER_COMMANDS.SAVE_DRAFT,
      enabled: ({ actions }) => actions.canSaveCurrentDraft?.() !== false,
      run: ({ actions }) => actions.saveCurrentDraft?.(),
    },
    {
      id: BUILDER_COMMANDS.DISCARD_DRAFT,
      enabled: ({ actions }) => actions.canDiscardCurrentDraft?.() !== false,
      run: ({ actions }) => actions.discardCurrentDraft?.(),
    },
    {
      id: BUILDER_COMMANDS.UNDO_DRAFT,
      enabled: ({ actions }) => actions.canUndoDraft?.() === true,
      run: ({ actions }) => actions.undoDraft?.(),
    },
    {
      id: BUILDER_COMMANDS.REDO_DRAFT,
      enabled: ({ actions }) => actions.canRedoDraft?.() === true,
      run: ({ actions }) => actions.redoDraft?.(),
    },
    {
      id: BUILDER_COMMANDS.INLINE_EDIT_START,
      enabled: ({ state, payload }) =>
        state.editorChromeMode !== 'preview' &&
        payload?.target?.kind === 'module' &&
        payload?.target?.moduleType === 'text' &&
        payload?.field === 'content',
      run: ({ payload, actions }) => actions.startInlineEdit?.(payload),
    },
    {
      id: BUILDER_COMMANDS.INLINE_EDIT_CHANGE,
      enabled: ({ state, payload }) =>
        state.editorChromeMode !== 'preview' &&
        payload?.target?.kind === 'module' &&
        payload?.target?.moduleType === 'text' &&
        payload?.field === 'content',
      run: ({ payload, actions }) => actions.changeInlineEdit?.(payload),
    },
    {
      id: BUILDER_COMMANDS.INLINE_EDIT_COMMIT,
      enabled: ({ state }) => state.editorChromeMode !== 'preview',
      run: ({ payload, actions }) => actions.commitInlineEdit?.(payload),
    },
    {
      id: BUILDER_COMMANDS.INLINE_EDIT_CANCEL,
      enabled: ({ state }) => state.editorChromeMode !== 'preview',
      run: ({ payload, actions }) => actions.cancelInlineEdit?.(payload),
    },
  ];
}

export function createBuilderCommandRegistry({
  getState,
  actions = {},
  managers = {},
  deps = {},
  commands = [],
} = {}) {
  const registry = new Map();
  const events = [];

  function addCommand(definition) {
    if (!definition?.id) {
      throw new Error('Builder command definitions require an id.');
    }
    if (registry.has(definition.id)) {
      throw new Error(`Duplicate builder command: ${definition.id}`);
    }
    registry.set(definition.id, definition);
  }

  [...createDefaultCommands(), ...commands].forEach(addCommand);

  function getContext(id, payload = {}) {
    return createCommandContext({ id, payload, getState, actions, managers, deps });
  }

  function getDefinition(id) {
    return registry.get(id) || null;
  }

  function emit(event) {
    events.push(event);
    deps.onCommand?.(event);
  }

  function canRunCommand(id, payload = {}) {
    const definition = getDefinition(id);
    if (!definition) return false;
    return isEnabled(definition, getContext(id, payload));
  }

  function isCommandVisible(id, payload = {}) {
    const definition = getDefinition(id);
    if (!definition) return false;
    return isVisible(definition, getContext(id, payload));
  }

  function describeCommand(id, payload = {}) {
    const definition = getDefinition(id);
    if (!definition) return '';
    return describe(definition, getContext(id, payload));
  }

  function runCommand(id, payload = {}) {
    const definition = getDefinition(id);
    const context = getContext(id, payload);
    if (!definition) {
      const commandResult = result(false, { status: `Unknown command: ${id}` });
      emit({ id, payload, result: commandResult });
      return commandResult;
    }
    if (!isEnabled(definition, context)) {
      const commandResult = result(false, { status: 'Command is disabled.' });
      emit({ id, payload, result: commandResult });
      return commandResult;
    }
    if (definition.confirm) {
      const message =
        typeof definition.confirm === 'function' ? definition.confirm(context) : definition.confirm;
      if (message && deps.confirm?.(message) === false) {
        const commandResult = result(false, { status: 'Command cancelled.' });
        emit({ id, payload, result: commandResult });
        return commandResult;
      }
    }
    const commandValue = definition.run?.(context);
    if (commandValue && typeof commandValue.then === 'function') {
      return commandValue.then((value) => {
        const commandResult = normalizeCommandResult(value);
        emit({ id, payload, result: commandResult });
        return commandResult;
      });
    }
    const commandResult = normalizeCommandResult(commandValue);
    emit({ id, payload, result: commandResult });
    return commandResult;
  }

  function listCommands() {
    return Array.from(registry.keys());
  }

  function getCommandEvents() {
    return events.slice();
  }

  return {
    addCommand,
    canRunCommand,
    describeCommand,
    getCommandEvents,
    isCommandVisible,
    listCommands,
    runCommand,
  };
}

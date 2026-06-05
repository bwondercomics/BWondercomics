import { BUILDER_COMMANDS } from './commands.js';
import { BUILDER_STRUCTURAL_COMMANDS } from './structural-commands.js';

const TEXT_CONTROL_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  '[contenteditable]',
  '[contenteditable="true"]',
  '[data-builder-keymap-suppressed]',
].join(',');

const ACTIVE_MODAL_SELECTOR = [
  '.modal.active',
  '.confirm-modal.active',
  '.ip-overlay',
  '[role="dialog"][aria-modal="true"]',
  'dialog[open]',
].join(',');

const GLOBAL_KEYMAP_CLEANUP = '__bwPageBuilderKeymapCleanup';

function hasModifier(event) {
  return !!(event.ctrlKey || event.metaKey || event.altKey || event.shiftKey);
}

function isRestorePreviewEscapeTarget(element, context = {}) {
  return (
    context.resolved?.id === BUILDER_COMMANDS.EXIT_PREVIEW &&
    context.state?.editorChromeMode === 'preview' &&
    !!element?.closest?.('#pbRestorePreviewChrome')
  );
}

function isSuppressedControl(element, context = {}) {
  if (!element) return false;
  if (isRestorePreviewEscapeTarget(element, context)) return false;
  return !!element.closest(TEXT_CONTROL_SELECTOR);
}

export function shouldSuppressBuilderKeymap(event, root = document, context = {}) {
  if (!event || event.defaultPrevented || event.isComposing) return true;
  const target = event.target instanceof Element ? event.target : null;
  if (isSuppressedControl(target, context)) return true;
  const activeElement = root.activeElement instanceof Element ? root.activeElement : null;
  if (isSuppressedControl(activeElement, context)) return true;
  const activeModal = root.querySelector?.(ACTIVE_MODAL_SELECTOR);
  if (activeModal) return true;
  return false;
}

export function resolveBuilderKeymapCommand(event) {
  const key = String(event?.key || '');
  const lowerKey = key.toLowerCase();
  const primary = !!(event?.ctrlKey || event?.metaKey);

  if (primary && lowerKey === 's' && !event.altKey) {
    return { id: BUILDER_COMMANDS.SAVE_DRAFT };
  }
  if (primary && lowerKey === 'z' && !event.altKey && !event.shiftKey) {
    return { id: BUILDER_COMMANDS.UNDO_DRAFT };
  }
  if (
    (primary && lowerKey === 'z' && event.shiftKey && !event.altKey) ||
    (primary && lowerKey === 'y' && !event.altKey)
  ) {
    return { id: BUILDER_COMMANDS.REDO_DRAFT };
  }
  if (key === 'Escape' && !hasModifier(event)) {
    return { id: BUILDER_COMMANDS.EXIT_PREVIEW, fallbackId: BUILDER_COMMANDS.CANCEL_TRANSIENT };
  }
  if ((key === 'Delete' || key === 'Backspace') && !hasModifier(event)) {
    return { id: BUILDER_STRUCTURAL_COMMANDS.DELETE_SELECTED };
  }
  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (key === 'ArrowUp') return { id: BUILDER_COMMANDS.SELECT_PREV };
    if (key === 'ArrowDown') return { id: BUILDER_COMMANDS.SELECT_NEXT };
    if (key === 'ArrowLeft') return { id: BUILDER_COMMANDS.SELECT_PARENT };
    if (lowerKey === 'p') return { id: BUILDER_COMMANDS.TOGGLE_PREVIEW };
  }
  return null;
}

export function createBuilderKeymapManager({
  target = document,
  getState = () => ({}),
  actions = {},
} = {}) {
  let bound = false;

  function getRunnableCommandId(resolved) {
    if (!resolved?.id) return '';
    if (actions.canRunCommand?.(resolved.id) === false && resolved.fallbackId) {
      if (actions.canRunCommand?.(resolved.fallbackId) === false) return '';
      return resolved.fallbackId;
    }
    if (actions.canRunCommand?.(resolved.id) === false) return '';
    return resolved.id;
  }

  async function handleKeydown(event) {
    const state = getState();
    if (!state.builderOpen) return;
    const resolved = resolveBuilderKeymapCommand(event);
    if (!resolved) return;
    if (
      shouldSuppressBuilderKeymap(event, target.ownerDocument || document, {
        resolved,
        state,
      })
    ) {
      return;
    }
    const commandId = getRunnableCommandId(resolved);
    if (!commandId) return;
    event.preventDefault();
    await actions.runCommand?.(commandId);
  }

  function bind() {
    if (bound) return;
    if (typeof target[GLOBAL_KEYMAP_CLEANUP] === 'function') {
      target[GLOBAL_KEYMAP_CLEANUP]();
    }
    target.addEventListener('keydown', handleKeydown, true);
    target[GLOBAL_KEYMAP_CLEANUP] = () => {
      target.removeEventListener('keydown', handleKeydown, true);
      if (target[GLOBAL_KEYMAP_CLEANUP]) {
        delete target[GLOBAL_KEYMAP_CLEANUP];
      }
    };
    bound = true;
  }

  function unbind() {
    if (!bound) return;
    if (target[GLOBAL_KEYMAP_CLEANUP]) {
      target[GLOBAL_KEYMAP_CLEANUP]();
    } else {
      target.removeEventListener('keydown', handleKeydown, true);
    }
    bound = false;
  }

  return {
    bind,
    handleKeydown,
    unbind,
  };
}

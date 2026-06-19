import { isModuleHiddenForDevice } from '../admin/page-builder/responsive-overrides.js';

const READER_SHELL_STATE_KEY = '__BW_READER_SHELL_STATE__';

function createShellStore() {
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  return {
    state: null,
    ready,
    resolveReady,
  };
}

function getShellStore() {
  if (typeof window === 'undefined') {
    return createShellStore();
  }
  if (!window[READER_SHELL_STATE_KEY]) {
    window[READER_SHELL_STATE_KEY] = createShellStore();
  }
  return window[READER_SHELL_STATE_KEY];
}

function normalizeShellState(state) {
  return {
    active: state?.active === true,
    reason: String(
      state?.reason || (state?.active === true ? 'reader-module' : 'no-reader-module')
    ),
  };
}

export function resolveReaderShellState(page, options = {}) {
  if (!page || !Array.isArray(page.sections)) {
    return { active: false, reason: 'no-page' };
  }

  for (const section of page.sections) {
    for (const module of section?.modules || []) {
      if (module?.moduleType !== 'reader') continue;
      const hidden = isModuleHiddenForDevice(module, {
        builderEditing: options.builderEditing === true,
        deviceId: options.deviceId,
      });
      if (!hidden) {
        return { active: true, reason: 'reader-module' };
      }
    }
  }

  return { active: false, reason: 'no-reader-module' };
}

export function publishReaderShellState(state) {
  const normalized = normalizeShellState(state);
  const store = getShellStore();
  store.state = normalized;

  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.readerShell = normalized.active ? 'active' : 'inactive';
  }
  if (typeof window !== 'undefined') {
    store.resolveReady?.(normalized);
    window.dispatchEvent(
      new CustomEvent('readerShellStateChanged', {
        detail: normalized,
      })
    );
  }

  return normalized;
}

export function getReaderShellState() {
  return getShellStore().state;
}

export function waitForReaderShellState() {
  const store = getShellStore();
  return store.state ? Promise.resolve(store.state) : store.ready;
}

export function subscribeReaderShellState(callback, options = {}) {
  if (typeof callback !== 'function') return () => {};
  const store = getShellStore();
  const immediate = options.immediate !== false;

  const handleChange = (event) => {
    callback(normalizeShellState(event?.detail || store.state));
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('readerShellStateChanged', handleChange);
  }

  if (immediate && store.state) {
    callback(store.state);
  }

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('readerShellStateChanged', handleChange);
    }
  };
}

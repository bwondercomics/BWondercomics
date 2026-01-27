// Overlay helpers for shortcuts, end-of-entry, and chapter switching.
import { el } from './dom.js';
import { state, saveProgress } from './state.js';
import { render } from './render.js';
import { hideEndOfEntry } from './controls.js';
import { resetEntryCompletion, setActiveEntry, trackEntryExit } from './analytics.js';

export function toggleShortcutsOverlay() {
  const overlay = document.getElementById('shortcutsOverlay');
  if (overlay) {
    overlay.classList.toggle('active');
  }
}

export function closeShortcutsOverlay() {
  const overlay = document.getElementById('shortcutsOverlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

export function goToNextEntry(entryOrder, entries, entryMeta = {}) {
  const entryNames = entryOrder.length ? entryOrder : Object.keys(entries);
  const currentIndex = entryNames.indexOf(state.currentEntry);
  if (currentIndex >= 0 && currentIndex < entryNames.length - 1) {
    const nextEntry = entryNames[currentIndex + 1];
    if (el.entry) el.entry.value = nextEntry;
    changeEntry(nextEntry, entries, entryMeta);
    hideEndOfEntry();
  }
}

export function restartEntry(_entries) {
  state.pageIndex = 0;
  render();
  saveProgress(state);
  resetEntryCompletion();
  hideEndOfEntry();
}

export function changeEntry(name, entries, entryMeta = {}) {
  // Reset view state when switching entries.
  if (!entries[name]) return;
  trackEntryExit("change_entry");
  state.currentEntry = name;
  state.pages = entries[name];
  state.pageIndex = 0;
  state.scale = 1;
  state.pan = { x: 0, y: 0 };
  state.entryMeta = entryMeta?.[name] || null;
  setActiveEntry();
  render();
  saveProgress(state);
  window.dispatchEvent(new CustomEvent("entryChanged", { detail: { entry: name } }));
}

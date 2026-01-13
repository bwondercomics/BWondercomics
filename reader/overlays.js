// Overlay helpers for shortcuts, end-of-chapter, and chapter switching.
import { el } from './dom.js';
import { state, saveProgress } from './state.js';
import { render } from './render.js';
import { hideEndOfChapter } from './controls.js';
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

export function goToNextChapter(entryOrder, entries, entryMeta = {}) {
  const entryNames = entryOrder.length ? entryOrder : Object.keys(entries);
  const currentIndex = entryNames.indexOf(state.currentChapter);
  if (currentIndex >= 0 && currentIndex < entryNames.length - 1) {
    const nextChapter = entryNames[currentIndex + 1];
    if (el.chapter) el.chapter.value = nextChapter;
    changeChapter(nextChapter, entries, entryMeta);
    hideEndOfChapter();
  }
}

export function restartChapter(entries) {
  state.pageIndex = 0;
  render();
  saveProgress(state);
  resetEntryCompletion();
  hideEndOfChapter();
}

export function changeChapter(name, entries, entryMeta = {}) {
  // Reset view state when switching chapters.
  if (!entries[name]) return;
  trackEntryExit("change_chapter");
  state.currentChapter = name;
  state.pages = entries[name];
  state.pageIndex = 0;
  state.scale = 1;
  state.pan = { x: 0, y: 0 };
  state.entryMeta = entryMeta?.[name] || null;
  setActiveEntry();
  render();
  saveProgress(state);
  window.dispatchEvent(new CustomEvent("chapterChanged", { detail: { chapter: name } }));
}

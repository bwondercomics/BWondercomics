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

export function goToNextChapter(chapterOrder, chapters, chapterMeta = {}) {
  const chapterNames = chapterOrder.length ? chapterOrder : Object.keys(chapters);
  const currentIndex = chapterNames.indexOf(state.currentChapter);
  if (currentIndex >= 0 && currentIndex < chapterNames.length - 1) {
    const nextChapter = chapterNames[currentIndex + 1];
    if (el.chapter) el.chapter.value = nextChapter;
    changeChapter(nextChapter, chapters, chapterMeta);
    hideEndOfChapter();
  }
}

export function restartChapter(chapters) {
  state.pageIndex = 0;
  render();
  saveProgress(state);
  resetEntryCompletion();
  hideEndOfChapter();
}

export function changeChapter(name, chapters, chapterMeta = {}) {
  // Reset view state when switching chapters.
  if (!chapters[name]) return;
  trackEntryExit("change_chapter");
  state.currentChapter = name;
  state.pages = chapters[name];
  state.pageIndex = 0;
  state.scale = 1;
  state.pan = { x: 0, y: 0 };
  state.entryMeta = chapterMeta?.[name] || null;
  setActiveEntry();
  render();
  saveProgress(state);
  window.dispatchEvent(new CustomEvent("chapterChanged", { detail: { chapter: name } }));
}

import { el } from "./dom.js";
import { state } from "./state.js";
import { sortPagesByFilename } from "./utils.js";

function createPreviewManager({
  hideAllSections,
  setActiveNav,
  getChaptersDataFileUrl,
  showError,
} = {}) {
  async function loadPreviewPayload() {
    if (el.previewData) el.previewData.textContent = "Loading...";
    state.previewPayload = null;
    try {
      const url =
        typeof getChaptersDataFileUrl === "function"
          ? getChaptersDataFileUrl()
          : "data.json";
      // DB-only snapshot for Preview panel (no fallback).
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load database preview data.");
      const payload = await res.json();
      state.previewPayload = payload;
      if (el.previewData) {
        el.previewData.textContent = JSON.stringify(payload, null, 2);
      }
      return payload;
    } catch (err) {
      const message = err?.message || "Failed to load database preview data.";
      if (el.previewData) el.previewData.textContent = message;
      console.warn("Preview fetch failed:", err);
    }
    return null;
  }

  function showPreviewSection() {
    if (hideAllSections) hideAllSections();
    if (el.previewSection) {
      el.previewSection.style.display = "block";
      el.previewSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (setActiveNav) setActiveNav(el.btnPreview);
  }

  // Populate preview selector from the currently loaded chapter state.
  function updatePreviewChapters(selectedName = "") {
    if (!el.previewChapterSelect) return;
    const names = Object.keys(state.chapters).filter(
      (name) => name && name !== "undefined",
    );
    if (
      state.currentEditingChapter &&
      state.currentEditingChapter !== "undefined" &&
      !names.includes(state.currentEditingChapter)
    ) {
      names.push(state.currentEditingChapter);
    }
    el.previewChapterSelect.innerHTML = "";
    names.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      el.previewChapterSelect.appendChild(opt);
    });
    const target = names.includes(selectedName) ? selectedName : names[0] || "";
    if (target) {
      el.previewChapterSelect.value = target;
      setPreviewChapter(target);
    } else {
      state.previewState = { chapter: "", pages: [], index: 0 };
      renderPreviewImage();
    }
  }

  function setPreviewChapter(name) {
    state.previewState.chapter = name;
    state.previewState.pages = sortPagesByFilename(getPreviewPages(name));
    state.previewState.index = 0;
    renderPreviewImage();
  }

  // Use the loaded chapters map to build the preview page list.
  function getPreviewPages(name) {
    return sortPagesByFilename(state.chapters[name] || state.currentPages || []);
  }

  function renderPreviewImage() {
    if (!el.previewFrame || !el.previewEmpty) return;
    const { pages } = state.previewState;
    if (!pages.length) {
      el.previewFrame.style.display = "none";
      el.previewEmpty.style.display = "block";
      if (el.previewPageLabel) el.previewPageLabel.textContent = "";
      return;
    }

    if (state.previewState.index >= pages.length) {
      state.previewState.index = pages.length - 1;
    }

    const src = pages[state.previewState.index];
    const resolvedSrc = src.startsWith("http")
      ? src
      : src.startsWith("/")
        ? src
        : `../${src}`;
    if (el.previewImg) el.previewImg.src = resolvedSrc;
    if (el.previewPageLabel) {
      el.previewPageLabel.textContent = `Page ${
        state.previewState.index + 1
      } / ${pages.length}`;
    }

    el.previewFrame.style.display = "block";
    el.previewEmpty.style.display = "none";
    if (el.previewPrev) el.previewPrev.disabled = state.previewState.index <= 0;
    if (el.previewNext)
      el.previewNext.disabled =
        state.previewState.index >= pages.length - 1;
  }

  function copyToClipboard() {
    if (!state.previewPayload) {
      if (showError) showError("Preview data not loaded from database.");
      return;
    }
    const jsonData = JSON.stringify(state.previewPayload, null, 2);
    navigator.clipboard
      .writeText(jsonData)
      .then(() => {
        if (!el.copySuccess) return;
        el.copySuccess.textContent = "Copied to clipboard!";
        el.copySuccess.className = "success-message";
        el.copySuccess.style.display = "block";
        setTimeout(() => {
          el.copySuccess.style.display = "none";
        }, 3000);
      })
      .catch((err) => {
        alert("Failed to copy: " + err);
      });
  }

  function downloadJSON() {
    if (!state.previewPayload) {
      if (showError) showError("Preview data not loaded from database.");
      return;
    }
    const jsonData = JSON.stringify(state.previewPayload, null, 2);
    const blob = new Blob([jsonData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "battle-bros-chapters.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return {
    copyToClipboard,
    downloadJSON,
    loadPreviewPayload,
    renderPreviewImage,
    setPreviewChapter,
    showPreviewSection,
    updatePreviewChapters,
  };
}

export { createPreviewManager };

import {
  escapeHtml,
  sortPagesByFilename,
  inferFolderFromPages,
  ensureChapterFolder,
  getChapterFolder,
  normalizePages,
  pagesEqual
} from './utils.js';

/**
 * Chapter management logic extracted from app.js for reuse and readability.
 * All state is passed in by reference so the main app remains the source of truth.
 */
export function createChaptersApi({
  state,
  el,
  saveToServer,
  showSuccess,
  showError,
  getUnitLabels,
  getDataFileUrl,
  getSaveFilename,
  getChaptersRoot,
  getStorageKey,
  STORAGE_KEY
}) {
  const getRoot = () => (typeof getChaptersRoot === 'function' ? getChaptersRoot() : 'chapters');
  const getDataUrl = () => (typeof getDataFileUrl === 'function' ? getDataFileUrl() : 'data.json');
  const getSaveFile = () => (typeof getSaveFilename === 'function' ? getSaveFilename() : 'admin/data.json');
  const getStorage = () => (typeof getStorageKey === 'function' ? getStorageKey() : STORAGE_KEY);
  const labels = () => {
    const fallback = { singular: 'Chapter', plural: 'Chapters' };
    if (typeof getUnitLabels !== 'function') return fallback;
    try {
      const got = getUnitLabels() || {};
      const singular = String(got.singular || '').trim() || fallback.singular;
      const plural = String(got.plural || '').trim() || fallback.plural;
      return { singular, plural };
    } catch {
      return fallback;
    }
  };

  let selectedPageIndex = null;
  let insertGutterIndex = 0;
  let reorderUiActive = false;
  let scrollSnapTimer = null;
  let isSnapping = false;
  let caretForwardTimer = null;
  let snapReleaseTimer = null;
  let wheelTargetIndex = null;
  let wheelIdleTimer = null;
  let lastWheelAtMs = 0;
  let topSpacerEl = null;
  let bottomSpacerEl = null;
  let moveModeEnabled = false;

  const isValidIndex = (value, arr = []) => Number.isInteger(value) && value >= 0 && value < arr.length;
  const isReorderActive = () => isValidIndex(selectedPageIndex, state.currentPages || []);

  const resolvePageSrc = (src = '') => {
    const raw = String(src || '').trim();
    if (!raw) return '';
    if (raw.startsWith('http')) return raw;
    if (raw.startsWith('/')) return raw;
    return `../${raw}`;
  };

  function setReorderUiActive(active) {
    if (!el.pageReorderShell || !el.pageList || !el.pagePreviewPanel) return;
    if (active === reorderUiActive) return;

    reorderUiActive = active;
    if (active) {
      el.pageReorderShell.classList.add('is-active');
      el.pagePreviewPanel.style.display = '';
      setCaretForward(true);
      el.pageReorderShell.addEventListener('click', handleReorderShellClick);
      el.pageList.addEventListener('scroll', handleReorderScroll, { passive: true });
      el.pageList.addEventListener('wheel', handleReorderWheel, { passive: false });
      window.addEventListener('resize', handleReorderResize);
    } else {
      el.pageReorderShell.classList.remove('is-active');
      el.pagePreviewPanel.style.display = 'none';
      el.pageReorderShell.removeEventListener('click', handleReorderShellClick);
      el.pageList.removeEventListener('scroll', handleReorderScroll);
      el.pageList.removeEventListener('wheel', handleReorderWheel);
      window.removeEventListener('resize', handleReorderResize);
      if (scrollSnapTimer) window.clearTimeout(scrollSnapTimer);
      scrollSnapTimer = null;
      if (caretForwardTimer) window.clearTimeout(caretForwardTimer);
      caretForwardTimer = null;
      if (snapReleaseTimer) window.clearTimeout(snapReleaseTimer);
      snapReleaseTimer = null;
      if (wheelIdleTimer) window.clearTimeout(wheelIdleTimer);
      wheelIdleTimer = null;
      wheelTargetIndex = null;
      lastWheelAtMs = 0;
      setCaretForward(false);
      isSnapping = false;
      insertGutterIndex = 0;
      topSpacerEl = null;
      bottomSpacerEl = null;
      if (el.pagePreviewImg) el.pagePreviewImg.src = '';
    }
  }

  function setCaretForward(forward) {
    if (!el.insertCaret) return;
    el.insertCaret.classList.toggle('is-forward', !!forward);
  }

  function queueCaretForward(forward, delayMs = 0) {
    if (!el.insertCaret) return;
    if (caretForwardTimer) window.clearTimeout(caretForwardTimer);
    caretForwardTimer = window.setTimeout(() => {
      caretForwardTimer = null;
      setCaretForward(forward);
    }, Math.max(0, delayMs || 0));
  }

  function setMoveModeEnabled(enabled, { rerender = true } = {}) {
    moveModeEnabled = !!enabled;

    if (el.btnMoveMode) {
      el.btnMoveMode.classList.toggle('is-active', moveModeEnabled);
      el.btnMoveMode.setAttribute('aria-pressed', String(moveModeEnabled));
      el.btnMoveMode.textContent = moveModeEnabled ? 'Exit Move Mode' : 'Move Pages';
    }

    if (!moveModeEnabled && isReorderActive()) {
      clearSelection({ rerender: false });
    }

    if (rerender) renderPageList(state.currentPages || []);
  }

  function clearSelection({ rerender = true } = {}) {
    selectedPageIndex = null;
    insertGutterIndex = 0;
    wheelTargetIndex = null;
    setReorderUiActive(false);
    if (rerender) renderPageList(state.currentPages || []);
  }

  function scrollToCenter(index) {
    if (!el.pageList) return;
    const item = el.pageList.querySelector(`.page-item[data-index="${index}"]`);
    if (!item) return;

    // Calculate center position targets
    const itemRect = item.getBoundingClientRect();
    const listRect = el.pageList.getBoundingClientRect();
    // Use offsetTop directly as pageList is the positioned container
    const relativeTop = item.offsetTop;
    const perfectCenter = relativeTop - (listRect.height / 2) + (itemRect.height / 2);

    // "Nudge" logic: Move only 25% of the way to the center
    // This gives tactile feedback of selection without losing context
    const currentScroll = el.pageList.scrollTop;
    const diff = perfectCenter - currentScroll;
    const nudgeAmount = diff * 0.25;

    el.pageList.scrollTo({
      top: Math.max(0, currentScroll + nudgeAmount),
      behavior: 'smooth'
    });
  }

  function selectPage(index) {
    if (!isValidIndex(index, state.currentPages || [])) return;
    setMoveModeEnabled(true, { rerender: false });
    selectedPageIndex = index;
    setReorderUiActive(true);
    wheelTargetIndex = null;
    renderPageList(state.currentPages || []);

    // Nudge/Center the selected item
    window.requestAnimationFrame(() => scrollToCenter(index));
  }

  function handleReorderShellClick(event) {
    if (!isReorderActive()) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    // Allow dragging to not trigger deselect
    if (isDragClickLocked()) return;

    if (target.closest('.page-item')) return;
    if (target.closest('#pageList')) return;
    if (target.closest('#btnInsertPage') || target.closest('#btnDeletePage')) return;
    clearSelection();
  }

  // --- Drag to Scroll Logic ---
  let isDraggingScroll = false;
  let dragStartY = 0;
  let dragStartScrollTop = 0;
  let dragReleaseAt = 0;
  const dragScrollThreshold = 5;
  const dragClickLockoutMs = 200;

  function isDragClickLocked() {
    if (isDraggingScroll) return true;
    if (!dragReleaseAt) return false;
    return (Date.now() - dragReleaseAt) < dragClickLockoutMs;
  }

  function initDragToScroll() {
    if (!el.pageList) return;

    el.pageList.addEventListener('mousedown', (e) => {
      if (!moveModeEnabled) return;
      isDraggingScroll = false;
      dragStartY = e.clientY;
      dragStartScrollTop = el.pageList.scrollTop;

      // We don't preventDefault here so clicks can still register if no drag happens
    });

    window.addEventListener('mousemove', (e) => {
      if (!moveModeEnabled || dragStartY === 0) return;

      const deltaY = e.clientY - dragStartY;
      if (!isDraggingScroll && Math.abs(deltaY) <= dragScrollThreshold) return;
      isDraggingScroll = true; // Threshold passed, consider it a drag
      el.pageList.scrollTop = dragStartScrollTop - deltaY;
    });

    window.addEventListener('mouseup', () => {
      if (!moveModeEnabled) return;
      if (isDraggingScroll) {
        dragReleaseAt = Date.now();
      }
      dragStartY = 0;
      dragStartScrollTop = 0;
      setTimeout(() => {
        isDraggingScroll = false;
      }, dragClickLockoutMs);
    });
  }
  // Initialize once
  initDragToScroll();

  function handleReorderResize() {
    if (!isReorderActive()) return;
    syncReorderSpacers();
    updateInsertGutterIndex();
  }

  function getCaretOffsetY() {
    if (!el.pageList) return 0;
    return Math.round(el.pageList.clientHeight / 2);
  }

  function syncReorderSpacers() {
    if (!isReorderActive() || !el.pageList || !topSpacerEl || !bottomSpacerEl) return;
    const caretY = getCaretOffsetY();
    topSpacerEl.style.height = `${caretY}px`;
    bottomSpacerEl.style.height = `${Math.max(0, el.pageList.clientHeight - caretY)}px`;
  }

  function getGutterPositions() {
    if (!el.pageList) return [];
    const items = Array.from(el.pageList.querySelectorAll('.page-item'));
    if (!items.length) return [0];
    const gutters = items.map((item) => item.offsetTop);
    const last = items[items.length - 1];
    gutters.push(last.offsetTop + last.offsetHeight);
    return gutters;
  }

  function updateInsertGutterIndex() {
    if (!isReorderActive() || !el.pageList) return;
    const gutters = getGutterPositions();
    if (!gutters.length) return;

    const caretY = getCaretOffsetY();
    const caretContentY = el.pageList.scrollTop + caretY;

    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    gutters.forEach((pos, idx) => {
      const distance = Math.abs(pos - caretContentY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = idx;
      }
    });

    insertGutterIndex = bestIndex;
  }

  function snapToGutterIndex(gutterIndex, behavior = 'smooth') {
    if (!isReorderActive() || !el.pageList) return;
    const gutters = getGutterPositions();
    if (!gutters.length) return;

    insertGutterIndex = Math.max(0, Math.min(gutters.length - 1, gutterIndex));

    const caretY = getCaretOffsetY();
    const desired = gutters[insertGutterIndex] - caretY;
    const maxScroll = Math.max(0, el.pageList.scrollHeight - el.pageList.clientHeight);
    const clamped = Math.max(0, Math.min(maxScroll, desired));
    if (Math.abs(el.pageList.scrollTop - clamped) < 1) {
      queueCaretForward(true, 0);
      return;
    }

    isSnapping = true;
    el.pageList.scrollTo({ top: clamped, behavior });
    queueCaretForward(true, behavior === 'auto' ? 0 : 200);
    if (snapReleaseTimer) window.clearTimeout(snapReleaseTimer);
    const releaseDelay = behavior === 'auto' ? 120 : 320;
    snapReleaseTimer = window.setTimeout(() => {
      snapReleaseTimer = null;
      isSnapping = false;
    }, releaseDelay);
  }

  function snapToNearestGutter(behavior = 'smooth') {
    if (!isReorderActive() || !el.pageList) return;
    updateInsertGutterIndex();
    snapToGutterIndex(insertGutterIndex, behavior);
  }

  function handleReorderScroll() {
    if (!isReorderActive()) return;
    if (!isSnapping) {
      if (caretForwardTimer) window.clearTimeout(caretForwardTimer);
      caretForwardTimer = null;
      setCaretForward(false);
    } else {
      return;
    }
    updateInsertGutterIndex();
    if (scrollSnapTimer) window.clearTimeout(scrollSnapTimer);
    scrollSnapTimer = window.setTimeout(() => {
      snapToNearestGutter('smooth');
    }, 140);
  }

  function handleReorderWheel(event) {
    if (!isReorderActive() || !el.pageList) return;
    if (event.ctrlKey) return;

    const deltaY = event.deltaY || 0;
    if (!deltaY) return;

    // Let trackpads do their thing; handle mouse wheels as 1-step ticks.
    if (event.deltaMode === 0 && Math.abs(deltaY) < 15) return;

    event.preventDefault();
    event.stopPropagation();

    const gutters = getGutterPositions();
    if (gutters.length < 2) return;

    if (scrollSnapTimer) window.clearTimeout(scrollSnapTimer);
    scrollSnapTimer = null;

    if (!Number.isInteger(wheelTargetIndex)) {
      updateInsertGutterIndex();
      wheelTargetIndex = insertGutterIndex;
    }

    setCaretForward(false);

    const direction = deltaY > 0 ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(gutters.length - 1, wheelTargetIndex + direction));
    if (nextIndex === wheelTargetIndex) {
      queueCaretForward(true, 0);
      return;
    }

    wheelTargetIndex = nextIndex;
    insertGutterIndex = nextIndex;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = lastWheelAtMs ? now - lastWheelAtMs : Number.POSITIVE_INFINITY;
    lastWheelAtMs = now;
    const fast = dt < 90 || Math.abs(deltaY) > 120;
    snapToGutterIndex(insertGutterIndex, fast ? 'auto' : 'smooth');

    if (wheelIdleTimer) window.clearTimeout(wheelIdleTimer);
    wheelIdleTimer = window.setTimeout(() => {
      wheelIdleTimer = null;
      wheelTargetIndex = null;
    }, 220);
  }

  function updatePreview() {
    if (!isReorderActive()) return;
    const path = (state.currentPages || [])[selectedPageIndex];
    if (!path || !el.pagePreviewImg) return;
    el.pagePreviewImg.src = resolvePageSrc(path);
  }

  async function insertSelectedAtCaret() {
    if (!isReorderActive()) return;
    snapToNearestGutter('auto');

    const pages = [...(state.currentPages || [])];
    const from = selectedPageIndex;
    const rawTo = insertGutterIndex;
    const to = Math.max(0, Math.min(pages.length, rawTo));
    if (to === from || to === from + 1) return;

    const [moved] = pages.splice(from, 1);
    const target = to > from ? to - 1 : to;
    pages.splice(target, 0, moved);
    selectedPageIndex = target;
    renderPageList(pages);
    markUnsaved();

    // Trigger Shimmy
    window.setTimeout(() => {
      const item = el.pageList.querySelector(`.page-item[data-index="${target}"]`);
      if (item) {
        item.classList.add('just-moved');
        // Remove class after animation plays to allow re-trigger
        setTimeout(() => item.classList.remove('just-moved'), 500);
      }
    }, 50);
  }

  async function deleteSelectedPage() {
    if (!isReorderActive()) return;
    await removePage(selectedPageIndex);
  }

  if (el.btnInsertPage) {
    el.btnInsertPage.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      insertSelectedAtCaret();
    });
  }

  if (el.btnDeletePage) {
    el.btnDeletePage.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteSelectedPage();
    });
  }

  if (el.btnMoveMode) {
    el.btnMoveMode.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMoveModeEnabled(!moveModeEnabled);
    });
    setMoveModeEnabled(moveModeEnabled, { rerender: false });
  }

  async function loadChapters() {
    try {
      const response = await fetch(getDataUrl());
      if (response.ok) {
        const data = await response.json();
        if (data.chapters && typeof data.chapters === 'object') {
          state.chapters = data.chapters;
          state.chapterFolders = data.chapterFolders || {};
          state.chapterMeta = data.chapterMeta || {};
          state.statusMessage = data.statusMessage || '';
          state.premiumOnly = !!data.premiumOnly;
          const removed = pruneInvalidChapters();
          if (removed > 0) {
            await saveChapters();
          }
          Object.keys(state.chapters).forEach(name => {
            if (!state.chapterFolders[name]) {
              const inferred = inferFolderFromPages(name, state.chapters, state.currentPages, getRoot());
              if (inferred) {
                state.chapterFolders[name] = inferred;
              }
            }
          });
          return;
        }
      }
    } catch (e) {
      console.warn('Could not load from data.json, trying localStorage:', e);
    }

    const saved = localStorage.getItem(getStorage());
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.chapters) {
          state.chapters = parsed.chapters;
          state.chapterFolders = parsed.chapterFolders || {};
          state.chapterMeta = parsed.chapterMeta || {};
          state.statusMessage = parsed.statusMessage || '';
          state.premiumOnly = !!parsed.premiumOnly;
        } else {
          state.chapters = parsed || {};
          state.chapterFolders = {};
          state.chapterMeta = {};
          state.premiumOnly = false;
        }
        const removed = pruneInvalidChapters();
        if (removed > 0) {
          await saveChapters();
        }
        return;
      } catch (e) {
        console.error('Error loading saved data:', e);
      }
    }
    console.warn('No chapter data found, starting with empty chapters');
    state.chapters = {};
    state.chapterMeta = {};
    state.premiumOnly = false;
  }

  async function saveChapters(showMessage = false) {
    try {
      localStorage.setItem(
        getStorage(),
        JSON.stringify({
          chapters: state.chapters,
          chapterFolders: state.chapterFolders,
          chapterMeta: state.chapterMeta,
          premiumOnly: !!state.premiumOnly,
          statusMessage: state.statusMessage
        })
      );
    } catch (error) {
      console.warn('Unable to persist chapters to localStorage:', error);
    }

    const payload = {
      chapters: state.chapters,
      chapterFolders: state.chapterFolders,
      chapterMeta: state.chapterMeta,
      statusMessage: state.statusMessage,
      premiumOnly: !!state.premiumOnly,
      lastUpdated: new Date().toISOString(),
      publishedBy: 'Admin Panel'
    };

    try {
      await saveToServer(getSaveFile(), payload);
      if (showMessage && showSuccess) {
        showSuccess(`Saved ${labels().plural}.`);
      }
    } catch (error) {
      console.error('Save chapters failed:', error);
      if (showError) {
        showError(`Failed to save ${labels().plural}. A draft is stored in your browser.`);
      }
    }
  }

  function renderStatusMessageInput() {
    if (el.statusMessageInput) {
      el.statusMessageInput.value = state.statusMessage || '';
    }
  }

  function setStatusMessageFeedback(message, isError = false) {
    if (!el.statusMessageStatus) return;
    el.statusMessageStatus.textContent = message;
    el.statusMessageStatus.style.display = 'block';
    el.statusMessageStatus.style.background = isError ? 'var(--danger)' : 'var(--success)';
    el.statusMessageStatus.style.color = isError ? 'var(--text)' : 'var(--bg-dark)';
    setTimeout(() => {
      el.statusMessageStatus.style.display = 'none';
    }, 2500);
  }

  async function saveStatusMessage() {
    state.statusMessage = (el.statusMessageInput?.value || '').trim();
    try {
      await saveChapters(false);
      setStatusMessageFeedback('Status updated.');
    } catch (error) {
      console.error('Save status failed:', error);
      setStatusMessageFeedback('Failed to save status.', true);
    }
  }

  function renderPageList(pages) {
    if (!el.pageList) return;

    const previousScrollTop = el.pageList.scrollTop;
    state.currentPages = [...pages];

    if (!isValidIndex(selectedPageIndex, state.currentPages)) {
      selectedPageIndex = null;
    }

    const active = isReorderActive();
    setReorderUiActive(active);

    el.pageList.classList.toggle('is-move-mode', moveModeEnabled && !active);

    el.pageList.innerHTML = '';

    if (active) {
      topSpacerEl = document.createElement('div');
      topSpacerEl.className = 'page-spacer';
      topSpacerEl.dataset.spacer = 'top';
      bottomSpacerEl = document.createElement('div');
      bottomSpacerEl.className = 'page-spacer';
      bottomSpacerEl.dataset.spacer = 'bottom';
      const caretY = getCaretOffsetY();
      topSpacerEl.style.height = `${caretY}px`;
      bottomSpacerEl.style.height = `${Math.max(0, el.pageList.clientHeight - caretY)}px`;
      el.pageList.appendChild(topSpacerEl);
    }

    state.currentPages.forEach((path, index) => {
      const item = document.createElement('div');
      item.className = 'page-item';
      item.dataset.index = index;

      if (active) {
        item.classList.toggle('is-selected', index === selectedPageIndex);
        item.addEventListener('click', () => {
          if (isDragClickLocked()) return;
          selectPage(index);
        });
        item.innerHTML = `
          <span class="page-number">#${index + 1}</span>
          <span class="page-path">${escapeHtml(path)}</span>
        `;
      } else {
        const allowDrag = !moveModeEnabled;
        item.draggable = allowDrag;

        if (moveModeEnabled) {
          item.addEventListener('click', (e) => {
            // If we are currently dragging, OR we just finished dragging, do not select
            if (isDragClickLocked()) return;
            selectPage(index);
          });
        } else {
          item.addEventListener('dblclick', () => selectPage(index));

          item.addEventListener('dragstart', (e) => {
            state.draggingIndex = index;
            item.classList.add('dragging');
            if (!e.dataTransfer) return;
            e.dataTransfer.effectAllowed = 'move';
            try {
              e.dataTransfer.setData('text/plain', String(index));
              e.dataTransfer.setData('text/html', item.innerHTML);
            } catch {
            }
          });

          item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            state.draggingIndex = null;
          });

          item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            item.classList.add('drag-over');
          });

          item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
          });

          item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');
            if (state.draggingIndex !== null && state.draggingIndex !== index) {
              const newPages = [...state.currentPages];
              const [moved] = newPages.splice(state.draggingIndex, 1);
              newPages.splice(index, 0, moved);
              renderPageList(newPages);
              markUnsaved();
            }
          });
        }

        item.innerHTML = `
          <span class="drag-handle" draggable="false" title="Drag to reorder" aria-label="Drag to reorder">≡</span>
          <span class="page-number">#${index + 1}</span>
          <span class="page-path">${escapeHtml(path)}</span>
          <div class="page-actions">
            <button type="button" class="btn-move btn-move-up" data-index="${index}" title="Move up" ${index === 0 ? 'disabled' : ''}>UP</button>
            <button type="button" class="btn-move btn-move-down" data-index="${index}" title="Move down" ${index === state.currentPages.length - 1 ? 'disabled' : ''}>DOWN</button>
            <button type="button" class="btn-remove" data-index="${index}" data-path="${escapeHtml(path)}">Remove</button>
          </div>
        `;


        const pageActions = item.querySelector('.page-actions');
        if (pageActions) {
          pageActions.addEventListener('dblclick', (e) => e.stopPropagation());
        }
      }

      el.pageList.appendChild(item);
    });

    if (active && bottomSpacerEl) {
      el.pageList.appendChild(bottomSpacerEl);
    }

    if (!active) {
      el.pageList.querySelectorAll('.btn-move-up').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          movePage(parseInt(btn.dataset.index, 10), -1);
        });
      });

      el.pageList.querySelectorAll('.btn-move-down').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          movePage(parseInt(btn.dataset.index, 10), 1);
        });
      });

      el.pageList.querySelectorAll('.btn-remove').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          removePage(parseInt(btn.dataset.index, 10), btn.dataset.path);
        });
      });

      const maxScroll = Math.max(0, el.pageList.scrollHeight - el.pageList.clientHeight);
      el.pageList.scrollTop = Math.max(0, Math.min(maxScroll, previousScrollTop));
      return;
    }

    const maxScroll = Math.max(0, el.pageList.scrollHeight - el.pageList.clientHeight);
    const clampedScrollTop = Math.max(0, Math.min(maxScroll, previousScrollTop));
    const wasSnapping = isSnapping;
    isSnapping = true;
    el.pageList.scrollTop = clampedScrollTop;
    window.setTimeout(() => {
      isSnapping = wasSnapping;
    }, 0);

    window.requestAnimationFrame(() => {
      syncReorderSpacers();
      updatePreview();
      updateInsertGutterIndex();
    });
  }

  function movePage(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= state.currentPages.length) return;
    const newPages = [...state.currentPages];
    const [item] = newPages.splice(index, 1);
    newPages.splice(newIndex, 0, item);
    renderPageList(newPages);
    markUnsaved();
  }

  function markUnsaved() {
    state.hasUnsavedChanges = true;
    if (el.unsavedIndicator) el.unsavedIndicator.style.display = 'block';
  }

  function clearUnsaved() {
    state.hasUnsavedChanges = false;
    if (el.unsavedIndicator) el.unsavedIndicator.style.display = 'none';
  }

  async function reconcileChapterPages(chapterName) {
    const stored = normalizePages(state.chapters[chapterName] || []);
    const diskPages = await fetchChapterImages(chapterName);
    const diskNormalized = normalizePages(diskPages || []);
    const preferred = diskNormalized.length ? diskNormalized : stored;
    const merged = sortPagesByFilename(Array.from(new Set(preferred)));
    if (!pagesEqual(merged, stored)) {
      state.chapters[chapterName] = merged;
      await saveChapters();
    }
    return merged;
  }

  async function editChapter(chapterName) {
    setMoveModeEnabled(false, { rerender: false });
    clearSelection({ rerender: false });
    state.currentEditingChapter = chapterName;
    el.modalTitle.textContent = `Edit ${labels().singular}`;
    el.chapterName.value = chapterName;
    if (el.chapterPremium) {
      el.chapterPremium.checked = !!(state.chapterMeta?.[chapterName]?.premium);
    }
    const combined = await reconcileChapterPages(chapterName);
    renderPageList(sortPagesByFilename(combined));
    showModal();
  }

  function addNewChapter() {
    setMoveModeEnabled(false, { rerender: false });
    clearSelection({ rerender: false });
    state.currentEditingChapter = '';
    el.modalTitle.textContent = `Add New ${labels().singular}`;
    el.chapterName.value = '';
    if (el.chapterPremium) el.chapterPremium.checked = false;
    renderPageList([]);
    showModal();
  }

  function deleteChapter(chapterName) {
    if (confirm(`Are you sure you want to delete "${chapterName}"?`)) {
      delete state.chapters[chapterName];
      if (state.chapterMeta && state.chapterMeta[chapterName]) delete state.chapterMeta[chapterName];
      saveChapters();
      renderChapterList();
    }
  }

  async function saveChapterEdit() {
    const newName = getActiveChapterName();
    if (!newName) {
      alert(`${labels().singular} name is required`);
      return;
    }

    const pages = [...state.currentPages];
    const chapterFolder = ensureChapterFolder(newName, state.chapterFolders, state.chapters, state.currentPages, getRoot());
    try {
      const resp = await fetch('/api/create-chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterFolder })
      });
      if (!resp.ok) {
        const result = await resp.json().catch(() => ({}));
        throw new Error(result.error || 'Unable to create chapter folder');
      }
    } catch (e) {
      console.warn('Create chapter folder failed:', e);
      if (showError) showError(`Could not create folder for ${newName}: ${e.message}`);
      return;
    }

    if (state.currentEditingChapter && state.currentEditingChapter !== newName) {
      delete state.chapters[state.currentEditingChapter];
      if (state.chapterFolders[state.currentEditingChapter]) {
        state.chapterFolders[newName] = state.chapterFolders[state.currentEditingChapter];
        delete state.chapterFolders[state.currentEditingChapter];
      }
      if (state.chapterMeta && state.chapterMeta[state.currentEditingChapter]) {
        state.chapterMeta[newName] = state.chapterMeta[state.currentEditingChapter];
        delete state.chapterMeta[state.currentEditingChapter];
      }
    }

    state.chapters[newName] = pages;
    const premiumFlag = !!el.chapterPremium?.checked;
    state.chapterMeta = state.chapterMeta || {};
    state.chapterMeta[newName] = { ...(state.chapterMeta[newName] || {}), premium: premiumFlag };
    await saveChapters();
    renderChapterList();
    clearUnsaved();
    hideModal();
  }

  function addPage() {
    const path = prompt(`Enter image path (e.g., ${getRoot()}/01/01.png):`);
    if (path) {
      state.currentPages.push(path.trim());
      state.currentPages = sortPagesByFilename(state.currentPages);
      renderPageList(state.currentPages);
      markUnsaved();
    }
  }

  async function removePage(index, imagePath) {
    if (!isValidIndex(index, state.currentPages || [])) return;

    const wasReorderActive = isReorderActive();
    const previousSelected = selectedPageIndex;
    const targetPath = imagePath || state.currentPages[index];
    const rootPrefix = `${String(getRoot() || 'chapters').replace(/\/+$/, '')}/`;
    if (targetPath && targetPath.startsWith(rootPrefix)) {
      try {
        const response = await fetch('/api/delete-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: targetPath })
        });
        if (!response.ok && response.status !== 404) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || 'Failed to delete file');
        }
      } catch (error) {
        console.error('Delete error:', error);
        if (showError) showError(`Delete failed: ${error.message}`);
        return;
      }
    }
    state.currentPages.splice(index, 1);

    if (wasReorderActive && Number.isInteger(previousSelected)) {
      if (!state.currentPages.length) {
        selectedPageIndex = null;
      } else if (index < previousSelected) {
        selectedPageIndex = previousSelected - 1;
      } else if (index === previousSelected) {
        selectedPageIndex = Math.min(index, state.currentPages.length - 1);
      }
    }

    renderPageList(state.currentPages);
    markUnsaved();
  }

  function renderChapterList() {
    el.chapterList.innerHTML = '';
    const chapterNames = Object.keys(state.chapters).filter(name => name && name !== 'undefined');
    chapterNames.forEach(name => {
      const pages = state.chapters[name];
      const isPremium = !!(state.chapterMeta?.[name]?.premium);
      const item = document.createElement('div');
      item.className = 'chapter-item';
      item.innerHTML = `
        <div class="chapter-info">
          <div class="chapter-name">${escapeHtml(name)}</div>
          <div class="chapter-meta">${pages.length} pages${isPremium ? ' • Premium' : ''}</div>
        </div>
        <div class="chapter-actions">
          <button class="btn-small btn-edit" data-chapter="${escapeHtml(name)}">Edit</button>
          <button class="btn-small btn-delete" data-chapter="${escapeHtml(name)}">Delete</button>
        </div>
      `;
      el.chapterList.appendChild(item);
    });
    el.chapterList.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => editChapter(btn.dataset.chapter));
    });
    el.chapterList.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteChapter(btn.dataset.chapter));
    });
  }

  function pruneInvalidChapters() {
    const invalid = Object.keys(state.chapters || {}).filter(name => !name || name === 'undefined' || name === 'null');
    invalid.forEach(name => {
      delete state.chapters[name];
      if (state.chapterFolders[name]) delete state.chapterFolders[name];
      if (state.chapterMeta && state.chapterMeta[name]) delete state.chapterMeta[name];
    });
    return invalid.length;
  }

  function getActiveChapterName() {
    const fromInput = el.chapterName?.value?.trim();
    return fromInput || state.currentEditingChapter || '';
  }

  async function fetchChapterImages(chapterName) {
    const chapterFolder = getChapterFolder(chapterName, state.chapterFolders, state.chapters, state.currentPages, getRoot());
    try {
      const response = await fetch('/api/list-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterFolder })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Failed to load chapter files');
      }
      const data = await response.json();
      return sortPagesByFilename(data.paths || []);
    } catch (error) {
      console.warn('Unable to load files from disk for', chapterName, error);
      return null;
    }
  }

  function showModal() {
    if (el.editModal) el.editModal.style.display = 'flex';
  }

  function hideModal() {
    setMoveModeEnabled(false, { rerender: false });
    clearSelection({ rerender: false });
    if (el.editModal) el.editModal.style.display = 'none';
  }

  return {
    loadChapters,
    saveChapters,
    renderStatusMessageInput,
    setStatusMessageFeedback,
    saveStatusMessage,
    renderPageList,
    movePage,
    markUnsaved,
    clearUnsaved,
    reconcileChapterPages,
    editChapter,
    addNewChapter,
    deleteChapter,
    saveChapterEdit,
    addPage,
    removePage,
    renderChapterList,
    getActiveChapterName,
    fetchChapterImages,
    showModal,
    hideModal
  };
}

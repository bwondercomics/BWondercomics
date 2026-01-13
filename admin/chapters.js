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
 * Entry management logic extracted from app.js for reuse and readability.
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
  const getBaseRoot = () => (typeof getChaptersRoot === 'function' ? getChaptersRoot() : 'chapters');
  const getRootForLabel = (labelId = null) => {
    const base = getBaseRoot();
    const label = getEntryLabels().find((item) => item && item.id === labelId) || getActiveEntryLabel();
    const slug = label?.slug ? String(label.slug).trim().replace(/^\/+/, '') : '';
    if (!slug) return base;
    return `${String(base || 'chapters').replace(/\/+$/g, '')}/${slug}`;
  };
  const getRoot = () => getRootForLabel(getActiveEntryLabel()?.id || null);
  const getDataUrl = () => (typeof getDataFileUrl === 'function' ? getDataFileUrl() : 'data.json');
  const getSaveFile = () => (typeof getSaveFilename === 'function' ? getSaveFilename() : 'admin/data.json');
  const getStorage = () => (typeof getStorageKey === 'function' ? getStorageKey() : STORAGE_KEY);
  const labels = () => {
    const fallback = { singular: 'Entry', plural: 'Entries' };
    const activeLabel = getActiveEntryLabel();
    if (activeLabel) {
      return {
        singular: String(activeLabel.singular || '').trim() || fallback.singular,
        plural: String(activeLabel.plural || '').trim() || fallback.plural
      };
    }
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

  const getEntryLabels = () => (Array.isArray(state.entryLabels) ? state.entryLabels : []);

  const getDefaultEntryLabel = () => {
    const labels = getEntryLabels();
    if (!labels.length) return null;
    return labels.find((label) => label && label.isDefault) || labels[0];
  };

  const getActiveEntryLabel = () => {
    const labels = getEntryLabels();
    if (!labels.length) return null;
    const activeId = state.activeEntryLabelId;
    const active = labels.find((label) => label && label.id === activeId);
    return active || getDefaultEntryLabel();
  };

  const setActiveEntryLabel = (id) => {
    const labels = getEntryLabels();
    if (!labels.length) {
      state.activeEntryLabelId = null;
      return;
    }
    const match = labels.find((label) => label && label.id === id);
    state.activeEntryLabelId = match ? match.id : getDefaultEntryLabel()?.id || labels[0].id;
  };

  const slugifyLabel = (value) => {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'entry';
  };

  const ensureUniqueSlug = (base) => {
    const labels = getEntryLabels();
    if (!labels.some((label) => label.slug === base)) return base;
    let counter = 2;
    let candidate = `${base}-${counter}`;
    while (labels.some((label) => label.slug === candidate)) {
      counter += 1;
      candidate = `${base}-${counter}`;
    }
    return candidate;
  };

  const STATUS_VALUES = new Set(['published', 'scheduled', 'draft']);
  const normalizeEntryStatus = (raw) => {
    const value = String(raw || '').trim().toLowerCase();
    return STATUS_VALUES.has(value) ? value : 'published';
  };

  const isoToDateTimeLocal = (iso = '') => {
    const value = String(iso || '').trim();
    if (!value) return '';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  };

  const dateTimeLocalToIso = (raw = '') => {
    const value = String(raw || '').trim();
    if (!value) return '';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString();
  };

  const formatDateTime = (value) => {
    if (!value) return '';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  function syncEntryScheduleFields() {
    const status = normalizeEntryStatus(el.entryStatus?.value);
    const isScheduled = status === 'scheduled';
    const isDraft = status === 'draft';
    const autoPostEnabled = !!el.entryAutoPost?.checked && !isDraft;

    if (el.entryPublishAt) {
      el.entryPublishAt.disabled = isDraft;
      if (isDraft) el.entryPublishAt.value = '';
    }
    if (el.entryComingSoon) {
      el.entryComingSoon.disabled = !isScheduled;
      if (!isScheduled) el.entryComingSoon.checked = false;
    }
    if (el.entryAutoPost) {
      el.entryAutoPost.disabled = isDraft;
      if (isDraft) el.entryAutoPost.checked = false;
    }
    if (el.entryShareBluesky) {
      el.entryShareBluesky.disabled = !autoPostEnabled;
      if (!autoPostEnabled) el.entryShareBluesky.checked = false;
    }
    if (el.entryPostTitle) {
      el.entryPostTitle.disabled = !autoPostEnabled;
    }
    if (el.entryPostContent) {
      el.entryPostContent.disabled = !autoPostEnabled;
    }
  }

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

  if (el.entryStatus) {
    el.entryStatus.addEventListener('change', () => {
      syncEntryScheduleFields();
    });
  }
  if (el.entryAutoPost) {
    el.entryAutoPost.addEventListener('change', () => {
      syncEntryScheduleFields();
    });
  }
  if (el.entryReleaseType) {
    el.entryReleaseType.addEventListener('change', () => {
      syncReleaseTypeFields();
    });
  }

  async function loadChapters() {
    // Load DB-backed chapter data; fall back to local drafts if API fails.
    try {
      const response = await fetch(getDataUrl());
      if (response.ok) {
        const data = await response.json();
        const entries = data.entries && typeof data.entries === 'object' ? data.entries : null;
        if (entries) {
          const entryFolders = data.entryFolders && typeof data.entryFolders === 'object' ? data.entryFolders : {};
          const entryMeta = data.entryMeta && typeof data.entryMeta === 'object' ? data.entryMeta : {};

          state.chapters = entries;
          state.chapterFolders = entryFolders;
          state.chapterMeta = entryMeta;
          state.entryLabels = Array.isArray(data.entryLabels) ? data.entryLabels : [];
          if (!state.entryLabels.length) {
            const singular = String(data.unitLabelSingular || '').trim() || 'Entry';
            const plural = String(data.unitLabelPlural || '').trim() || 'Entries';
            const slug = slugifyLabel(plural || singular);
            state.entryLabels = [
              {
                id: crypto?.randomUUID ? crypto.randomUUID() : `label-${Date.now()}`,
                singular,
                plural,
                slug,
                sortIndex: 0,
                isDefault: true
              }
            ];
          }
          setActiveEntryLabel(state.activeEntryLabelId);
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
          renderEntryLabelTabs();
          applyEntryLabelUi();
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
        const storedEntries = parsed && typeof parsed === 'object' ? parsed.entries : null;
        if (storedEntries && typeof storedEntries === 'object') {
          state.chapters = storedEntries;
          state.chapterFolders = parsed.entryFolders || {};
          state.chapterMeta = parsed.entryMeta || {};
          state.entryLabels = Array.isArray(parsed.entryLabels) ? parsed.entryLabels : [];
          setActiveEntryLabel(state.activeEntryLabelId);
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
        renderEntryLabelTabs();
        applyEntryLabelUi();
        return;
      } catch (e) {
        console.error('Error loading saved data:', e);
      }
    }
    console.warn('No chapter data found, starting with empty chapters');
    state.chapters = {};
    state.chapterMeta = {};
    state.premiumOnly = false;
    if (!getEntryLabels().length) {
      const defaults = getUnitLabels ? getUnitLabels() : { singular: 'Entry', plural: 'Entries' };
      const slug = ensureUniqueSlug(slugifyLabel(defaults.plural || defaults.singular));
      state.entryLabels = [
        {
          id: crypto?.randomUUID ? crypto.randomUUID() : `label-${Date.now()}`,
          singular: defaults.singular || 'Entry',
          plural: defaults.plural || 'Entries',
          slug,
          sortIndex: 0,
          isDefault: true
        }
      ];
    }
    setActiveEntryLabel(state.activeEntryLabelId);
    renderEntryLabelTabs();
    applyEntryLabelUi();
  }

  async function saveChapters(showMessage = false) {
    // Persist chapters to localStorage (draft) and DB via /api/save.
    try {
      localStorage.setItem(
        getStorage(),
        JSON.stringify({
          entries: state.chapters,
          entryFolders: state.chapterFolders,
          entryMeta: state.chapterMeta,
          entryLabels: state.entryLabels,
          premiumOnly: !!state.premiumOnly,
          statusMessage: state.statusMessage
        })
      );
    } catch (error) {
      console.warn('Unable to persist chapters to localStorage:', error);
    }

    const payload = {
      entries: state.chapters,
      entryFolders: state.chapterFolders,
      entryMeta: state.chapterMeta,
      entryLabels: state.entryLabels,
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

  function renderEntryLabelTabs() {
    if (!el.entryLabelTabs) return;
    const labels = [...getEntryLabels()].sort((a, b) => {
      const aIndex = Number.isFinite(a?.sortIndex) ? a.sortIndex : 0;
      const bIndex = Number.isFinite(b?.sortIndex) ? b.sortIndex : 0;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return String(a?.plural || a?.singular || '').localeCompare(String(b?.plural || b?.singular || ''));
    });
    el.entryLabelTabs.innerHTML = '';
    labels.forEach((label) => {
      if (!label) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-small btn-secondary entry-label-tab';
      button.textContent = String(label.plural || label.singular || 'Entries');
      button.dataset.labelId = label.id;
      if (label.id === getActiveEntryLabel()?.id) {
        button.classList.add('is-active');
      }
      button.addEventListener('click', () => {
        setActiveEntryLabel(label.id);
        renderEntryLabelTabs();
        applyEntryLabelUi();
        renderChapterList();
      });
      el.entryLabelTabs.appendChild(button);
    });
  }

  function updateEntryLabelSelect(selectedId = null) {
    if (!el.entryLabelSelect) return;
    const labels = [...getEntryLabels()].sort((a, b) => {
      const aIndex = Number.isFinite(a?.sortIndex) ? a.sortIndex : 0;
      const bIndex = Number.isFinite(b?.sortIndex) ? b.sortIndex : 0;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return String(a?.plural || a?.singular || '').localeCompare(String(b?.plural || b?.singular || ''));
    });
    el.entryLabelSelect.innerHTML = '';
    labels.forEach((label) => {
      if (!label) return;
      const option = document.createElement('option');
      option.value = label.id;
      option.textContent = String(label.singular || 'Entry');
      el.entryLabelSelect.appendChild(option);
    });
    const targetId = selectedId || getActiveEntryLabel()?.id || labels[0]?.id;
    if (targetId) el.entryLabelSelect.value = targetId;
  }

  async function addEntryLabel() {
    const singular = (prompt('Entry label (singular):') || '').trim();
    if (!singular) return;
    const plural = (prompt('Entry label (plural):', `${singular}s`) || '').trim();
    const baseSlug = slugifyLabel(plural || singular);
    const slug = ensureUniqueSlug(baseSlug);
    const labels = getEntryLabels();
    const id = crypto?.randomUUID ? crypto.randomUUID() : `label-${Date.now()}`;
    const isFirst = labels.length === 0;
    labels.push({
      id,
      singular,
      plural: plural || `${singular}s`,
      slug,
      sortIndex: labels.length,
      isDefault: isFirst
    });
    state.entryLabels = labels;
    setActiveEntryLabel(id);
    renderEntryLabelTabs();
    applyEntryLabelUi();
    renderChapterList();
    await saveChapters(true);
  }

  function applyEntryLabelUi() {
    const { singular, plural } = labels();
    const title = document.getElementById('chaptersSectionTitle');
    if (title) title.textContent = `${plural} Management`;
    if (el.btnAddChapter) el.btnAddChapter.textContent = `+ Add New ${singular}`;
    const nameLabel = document.getElementById('entryNameLabel');
    if (nameLabel) nameLabel.textContent = `${singular} Name`;
    if (el.chapterName) el.chapterName.placeholder = `e.g., ${singular} 1`;
    const accessLabel = document.getElementById('entryAccessLabel');
    if (accessLabel) accessLabel.textContent = `${singular} Access`;
  }

  function syncReleaseTypeFields() {
    const releaseType = String(el.entryReleaseType?.value || 'digital').toLowerCase();
    const isStore = releaseType === 'store';
    if (el.entryStoreUrl) {
      el.entryStoreUrl.disabled = !isStore;
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
    // Render the current page list, wiring drag/drop and move-mode behaviors.
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
      item.dataset.path = path;

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
          item.addEventListener('click', () => {
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
              // Ignore drag data transfer errors in older browsers.
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
    const meta = state.chapterMeta?.[chapterName] || {};
    updateEntryLabelSelect(meta.entryLabelId || meta.entry_label_id || getDefaultEntryLabel()?.id || null);
    if (el.entryShowInDropdown) {
      el.entryShowInDropdown.checked = meta.showInDropdown !== false;
    }
    if (el.entryShowInGallery) {
      el.entryShowInGallery.checked = meta.showInGallery !== false;
    }
    if (el.entryReleaseType) {
      el.entryReleaseType.value = String(meta.releaseType || 'digital').toLowerCase();
    }
    if (el.entryStoreUrl) {
      el.entryStoreUrl.value = String(meta.storeUrl || '');
    }
    if (el.entryCoverImage) {
      el.entryCoverImage.value = String(meta.coverImage || '');
    }
    if (el.chapterPremium) {
      el.chapterPremium.checked = !!meta.premium;
    }
    if (el.entryDisplayNumber) {
      const value = meta.displayNumber;
      el.entryDisplayNumber.value =
        Number.isFinite(value) ? String(value) : "";
    }
    if (el.entryStatus) {
      el.entryStatus.value = normalizeEntryStatus(meta.status);
    }
    if (el.entryPublishAt) {
      el.entryPublishAt.value = isoToDateTimeLocal(meta.publishAt);
    }
    if (el.entryComingSoon) {
      el.entryComingSoon.checked = !!meta.comingSoon;
    }
    if (el.entryAutoPost) {
      el.entryAutoPost.checked = !!meta.autoPost;
    }
    if (el.entryShareBluesky) {
      el.entryShareBluesky.checked = !!meta.shareBluesky;
    }
    if (el.entryPostTitle) {
      el.entryPostTitle.value = String(meta.releasePostTitle || '');
    }
    if (el.entryPostContent) {
      el.entryPostContent.value = String(meta.releasePostContent || '');
    }
    syncReleaseTypeFields();
    syncEntryScheduleFields();
    const combined = normalizePages(state.chapters[chapterName] || []);
    renderPageList(combined);
    showModal();
  }

  function addNewChapter() {
    setMoveModeEnabled(false, { rerender: false });
    clearSelection({ rerender: false });
    state.currentEditingChapter = '';
    el.modalTitle.textContent = `Add New ${labels().singular}`;
    el.chapterName.value = '';
    updateEntryLabelSelect(getActiveEntryLabel()?.id || getDefaultEntryLabel()?.id || null);
    if (el.entryShowInDropdown) el.entryShowInDropdown.checked = true;
    if (el.entryShowInGallery) el.entryShowInGallery.checked = true;
    if (el.entryReleaseType) el.entryReleaseType.value = 'digital';
    if (el.entryStoreUrl) el.entryStoreUrl.value = '';
    if (el.entryCoverImage) el.entryCoverImage.value = '';
    if (el.chapterPremium) el.chapterPremium.checked = false;
    if (el.entryDisplayNumber) el.entryDisplayNumber.value = '';
    if (el.entryStatus) el.entryStatus.value = 'published';
    if (el.entryPublishAt) el.entryPublishAt.value = '';
    if (el.entryComingSoon) el.entryComingSoon.checked = false;
    if (el.entryAutoPost) el.entryAutoPost.checked = false;
    if (el.entryShareBluesky) el.entryShareBluesky.checked = false;
    if (el.entryPostTitle) el.entryPostTitle.value = '';
    if (el.entryPostContent) el.entryPostContent.value = '';
    syncReleaseTypeFields();
    syncEntryScheduleFields();
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
    syncCurrentPagesFromDom();
    const newName = getActiveChapterName();
    if (!newName) {
      alert(`${labels().singular} name is required`);
      return;
    }

    const pages = [...state.currentPages];
    const selectedLabelId = el.entryLabelSelect?.value || getActiveEntryLabel()?.id || getDefaultEntryLabel()?.id || null;
    const releaseType = String(el.entryReleaseType?.value || 'digital').toLowerCase();
    const chapterRoot = getRootForLabel(selectedLabelId);
    const chapterFolder = ensureChapterFolder(newName, state.chapterFolders, state.chapters, state.currentPages, chapterRoot);
    const needsFolder = releaseType !== 'store' || pages.length > 0;
    if (needsFolder) {
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
    const rawDisplayNumber = el.entryDisplayNumber?.value ?? "";
    const trimmedDisplayNumber = String(rawDisplayNumber).trim();
    let displayNumber = null;
    if (trimmedDisplayNumber) {
      const parsed = Number.parseInt(trimmedDisplayNumber, 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        displayNumber = parsed;
      } else {
        alert("Entry number must be a non-negative whole number.");
        return;
      }
    }
    const status = normalizeEntryStatus(el.entryStatus?.value);
    const publishAtIso = dateTimeLocalToIso(el.entryPublishAt?.value ?? "");
    const comingSoon = status === 'scheduled' && !!el.entryComingSoon?.checked;
    const autoPost = !!el.entryAutoPost?.checked;
    const shareBluesky = autoPost && !!el.entryShareBluesky?.checked;
    const releasePostTitle = String(el.entryPostTitle?.value || '').trim();
    const releasePostContent = String(el.entryPostContent?.value || '').trim();
    const showInDropdown = el.entryShowInDropdown ? !!el.entryShowInDropdown.checked : true;
    const showInGallery = el.entryShowInGallery ? !!el.entryShowInGallery.checked : true;
    const storeUrl = String(el.entryStoreUrl?.value || '').trim();
    const coverImage = String(el.entryCoverImage?.value || '').trim();
    const entryLabel = getEntryLabels().find((label) => label && label.id === selectedLabelId) || getActiveEntryLabel();
    state.chapterMeta = state.chapterMeta || {};
    state.chapterMeta[newName] = {
      ...(state.chapterMeta[newName] || {}),
      premium: premiumFlag,
      displayNumber,
      entryLabelId: selectedLabelId,
      entryLabelSingular: entryLabel?.singular || labels().singular,
      entryLabelPlural: entryLabel?.plural || labels().plural,
      showInDropdown,
      showInGallery,
      releaseType,
      storeUrl,
      coverImage,
      status,
      publishAt: publishAtIso,
      comingSoon,
      autoPost,
      shareBluesky,
      releasePostTitle,
      releasePostContent,
    };
    await saveChapters();
    renderChapterList();
    clearUnsaved();
    hideModal();
  }

  function syncCurrentPagesFromDom() {
    if (!el.pageList) return;
    const items = Array.from(el.pageList.querySelectorAll('.page-item'));
    if (!items.length) return;
    const pages = items
      .map((item) => item.dataset.path || item.querySelector('.page-path')?.textContent || '')
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (!pages.length) return;
    state.currentPages = pages;
  }

  function addPage() {
    const path = prompt(`Enter image path (e.g., ${getRoot()}/01/01.png):`);
    if (path) {
      state.currentPages.push(path.trim());
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
    const activeLabelId = getActiveEntryLabel()?.id || null;
    const sortedNames = chapterNames
      .map(name => {
        const displayNumber = state.chapterMeta?.[name]?.displayNumber;
        return { name, displayNumber };
      })
      .sort((a, b) => {
        const aNum = Number.isFinite(a.displayNumber) ? a.displayNumber : null;
        const bNum = Number.isFinite(b.displayNumber) ? b.displayNumber : null;
        if (aNum != null && bNum != null && aNum !== bNum) return aNum - bNum;
        if (aNum != null && bNum == null) return -1;
        if (aNum == null && bNum != null) return 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      })
      .map(item => item.name)
      .filter((name) => {
        const meta = state.chapterMeta?.[name] || {};
        const labelId = meta.entryLabelId || meta.entry_label_id || null;
        const effectiveId = labelId || getDefaultEntryLabel()?.id || null;
        return !activeLabelId || effectiveId === activeLabelId;
      });
    sortedNames.forEach(name => {
      const pages = state.chapters[name];
      const meta = state.chapterMeta?.[name] || {};
      const isPremium = !!meta.premium;
      const status = normalizeEntryStatus(meta.status);
      const publishAtLabel = formatDateTime(meta.publishAt);
      const statusLabel = status === 'draft'
        ? 'Draft'
        : status === 'scheduled'
          ? (publishAtLabel ? `Scheduled - ${publishAtLabel}` : 'Scheduled')
          : 'Published';
      const comingSoonLabel = status === 'scheduled' && meta.comingSoon ? 'Coming soon' : '';
      const displayNumber = Number.isFinite(meta.displayNumber)
        ? meta.displayNumber
        : null;
      const entryLabelSingular = String(meta.entryLabelSingular || '').trim() || labels().singular;
      const displayLabel = displayNumber != null
        ? `${entryLabelSingular} ${displayNumber} - ${name}`
        : name;
      const metaParts = [`${pages.length} pages`, statusLabel];
      if (isPremium) metaParts.push('Premium');
      if (meta.releaseType === 'store') metaParts.push('Store');
      if (meta.showInDropdown === false) metaParts.push('No dropdown');
      if (meta.showInGallery === false) metaParts.push('No gallery');
      if (comingSoonLabel) metaParts.push(comingSoonLabel);
      const item = document.createElement('div');
      item.className = 'chapter-item';
      item.innerHTML = `
        <div class="chapter-info">
          <div class="chapter-name">${escapeHtml(displayLabel)}</div>
          <div class="chapter-meta">${escapeHtml(metaParts.join(' | '))}</div>
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
    addEntryLabel,
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
    renderEntryLabelTabs,
    getActiveChapterName,
    fetchChapterImages,
    showModal,
    hideModal
  };
}

import { cloneValue, escapeAttr, escapeHtml } from './helpers.js';
import {
  BUILDER_PREVIEW_MESSAGE_TYPES,
  BUILDER_PREVIEW_SNAPSHOT_VERSION,
  BUILDER_PREVIEW_SOURCES,
  DEFAULT_BUILDER_PREVIEW_SIDE_EFFECTS,
  buildPreviewSnapshotMessage,
  getPreviewStatusCopy,
  getPreviewViewport,
  isPreviewViewportId,
  validatePreviewEnvelope,
} from './preview-contract.js';

const TARGET_STALE_TIMEOUT_MS = 1500;

function createPreviewSessionToken() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getPreviewIdentity(snapshot) {
  if (!snapshot) return '';
  return [
    snapshot.seriesId || '',
    snapshot.pageId || '',
    snapshot.pageSlug || '',
    snapshot.draftMode || '',
  ].join('|');
}

function getTargetKey(target) {
  return target?.key || '';
}

function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function getTargetStyle(targetGeometry) {
  const rect = targetGeometry?.rect || {};
  return [
    `top: ${Math.max(0, Number(rect.top) || 0)}px`,
    `left: ${Math.max(0, Number(rect.left) || 0)}px`,
    `width: ${Math.max(0, Number(rect.width) || 0)}px`,
    `height: ${Math.max(0, Number(rect.height) || 0)}px`,
  ].join('; ');
}

export function createPreviewManager({ el, getState, actions, deps }) {
  let previewSession = '';
  let previewIdentity = '';
  let latestPreviewSnapshot = null;
  let latestPreviewMetrics = null;
  let latestPreviewTargets = [];
  let latestTargetSequence = -1;
  let hoveredTargetKey = '';
  let selectedTargetKey = '';
  let previewMessageBound = false;
  let targetStaleTimeoutId = null;

  function getPreviewIframeUrl(snapshot, session) {
    const params = new URLSearchParams({
      series: snapshot.seriesId || deps.getSeriesId(),
      page: String(snapshot.pageSlug || '').trim() || 'reader',
      pageId: snapshot.pageId || '',
      builderPreview: '1',
      previewSession: session,
    });
    if (snapshot.draftMode === 'draft') {
      params.set('draft', '1');
    }
    return new URL(`/index.html?${params.toString()}`, window.location.origin).toString();
  }

  function getPreviewExpectedIdentity(snapshot = latestPreviewSnapshot) {
    return {
      previewSession,
      snapshotVersion: BUILDER_PREVIEW_SNAPSHOT_VERSION,
      seriesId: snapshot?.seriesId || '',
      pageId: snapshot?.pageId || '',
      pageSlug: snapshot?.pageSlug || '',
    };
  }

  function postPreviewSnapshot() {
    const iframe = /** @type {HTMLIFrameElement|null} */ (
      el.pbCanvas?.querySelector('.pb-preview-iframe')
    );
    if (!iframe?.contentWindow || !latestPreviewSnapshot || !previewSession) return;
    iframe.contentWindow.postMessage(
      buildPreviewSnapshotMessage(latestPreviewSnapshot, previewSession),
      window.location.origin
    );
  }

  function updatePreviewFrameDataset(frame, snapshot, viewport) {
    if (!frame || !snapshot) return;
    frame.dataset.width = viewport.id;
    frame.dataset.previewSource = snapshot.source || '';
    frame.dataset.pageId = snapshot.pageId || '';
    frame.dataset.pageSlug = snapshot.pageSlug || '';
    frame.dataset.draftMode = snapshot.draftMode || '';
    frame.dataset.snapshotVersion = String(snapshot.snapshotVersion || '');
    frame.dataset.builderEditing = snapshot.options?.builderEditing === true ? 'true' : 'false';
    frame.dataset.viewportWidth = String(viewport.width);
    frame.dataset.viewportHeight = String(viewport.height);
    frame.dataset.previewSession = previewSession;
    frame.style.width = `${viewport.width}px`;
    frame.style.height = `${viewport.height}px`;
  }

  function applyPreviewIframeSize(iframe, viewport) {
    if (!iframe || !viewport) return;
    iframe.width = String(viewport.width);
    iframe.height = String(viewport.height);
    iframe.style.width = `${viewport.width}px`;
    iframe.style.height = `${viewport.height}px`;
  }

  function isPreviewDebugEnabled() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const queryValue = String(params.get('previewDebug') || '').toLowerCase();
      if (queryValue === '1' || queryValue === 'true' || queryValue === 'yes') return true;
      return localStorage.getItem('pb-preview-debug') === '1';
    } catch {
      return false;
    }
  }

  function renderPreviewDebugOverlay(frame, metrics = latestPreviewMetrics) {
    if (!frame) return;
    let overlay = frame.querySelector('.pb-preview-debug-overlay');
    if (!isPreviewDebugEnabled() || !metrics) {
      overlay?.remove();
      return;
    }
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'pb-preview-debug-overlay';
      overlay.setAttribute('aria-live', 'polite');
      frame.appendChild(overlay);
    }

    const viewport = metrics.viewport || {};
    const branchFlags = Object.entries(metrics.branchFlags || {})
      .map(([key, value]) => `${key}: ${value ? 'on' : 'off'}`)
      .join(', ');
    const offenders = metrics.overflow?.offenders || [];
    const offenderText = offenders.length
      ? offenders
          .map((item) => item.selector)
          .slice(0, 6)
          .join(', ')
      : 'none';

    overlay.textContent = [
      `Preset: ${viewport.label || viewport.id || 'unknown'} (${viewport.width || '?'}x${viewport.height || '?'})`,
      `Inner: ${metrics.innerWidth || '?'}x${metrics.innerHeight || '?'}`,
      `Page: ${metrics.pageSlug || 'unknown'} · Snapshot v${metrics.snapshotVersion || '?'}`,
      `Two-page: ${metrics.twoPageMode ? 'on' : 'off'}`,
      `Branches: ${branchFlags || 'none'}`,
      `Overflow: ${metrics.overflow?.hasOverflow ? 'yes' : 'no'} · ${offenderText}`,
    ].join('\n');
  }

  function findTargetGeometry(targetKey) {
    if (!targetKey) return null;
    return latestPreviewTargets.find((item) => getTargetKey(item.target) === targetKey) || null;
  }

  function clearTargetStaleTimeout() {
    if (!targetStaleTimeoutId) return;
    window.clearTimeout(targetStaleTimeoutId);
    targetStaleTimeoutId = null;
  }

  function scheduleTargetStaleTimeout(frame, sequence = latestTargetSequence) {
    clearTargetStaleTimeout();
    if (!frame || latestPreviewSnapshot?.options?.builderEditing !== true) return;
    if (!latestPreviewTargets.length && !hoveredTargetKey && !selectedTargetKey) return;
    const expectedSequence = Number.isSafeInteger(sequence) ? sequence : latestTargetSequence;
    targetStaleTimeoutId = window.setTimeout(() => {
      targetStaleTimeoutId = null;
      if (latestTargetSequence === expectedSequence) {
        resetPreviewTargets({ preserveSequence: true });
      }
    }, TARGET_STALE_TIMEOUT_MS);
  }

  function ensurePreviewTargetOverlay(frame) {
    if (!frame || latestPreviewSnapshot?.options?.builderEditing !== true) return null;
    let overlay = frame.querySelector('.pb-preview-target-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'pb-preview-target-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      frame.appendChild(overlay);
    }
    return overlay;
  }

  function bindPreviewTargetOverlayControls(overlay) {
    overlay
      .querySelector('[data-preview-target-action="settings"]')
      ?.addEventListener('click', () => {
        const selectedGeometry = findTargetGeometry(selectedTargetKey);
        if (!selectedGeometry?.target) return;
        actions.selectCanvasTarget?.(selectedGeometry.target);
      });
  }

  function renderPreviewTargetOverlay(frame = el.pbCanvas?.querySelector('.pb-preview-frame')) {
    if (!frame) return;
    if (latestPreviewSnapshot?.options?.builderEditing !== true) {
      frame.querySelector('.pb-preview-target-overlay')?.remove();
      return;
    }

    const overlay = ensurePreviewTargetOverlay(frame);
    if (!overlay) return;

    const hoverGeometry = findTargetGeometry(hoveredTargetKey);
    const selectedGeometry = findTargetGeometry(selectedTargetKey);
    const frameWidth = Number(frame.dataset.viewportWidth) || frame.clientWidth || 0;
    const selectedRect = selectedGeometry?.rect || null;
    const toolbarWidth = 180;
    const toolbarLeft = selectedRect
      ? clampNumber(selectedRect.left, 4, Math.max(4, frameWidth - toolbarWidth - 4))
      : 4;
    const toolbarTop = selectedRect
      ? selectedRect.top > 40
        ? Math.max(4, selectedRect.top - 36)
        : selectedRect.bottom + 8
      : 4;

    const hoverHtml =
      hoverGeometry?.visible && getTargetKey(hoverGeometry.target) !== selectedTargetKey
        ? `<div class="pb-preview-target-box pb-preview-target-box--hover" style="${escapeAttr(getTargetStyle(hoverGeometry))}"></div>`
        : '';
    const selectedHtml = selectedGeometry?.visible
      ? `<div class="pb-preview-target-box pb-preview-target-box--selected" style="${escapeAttr(getTargetStyle(selectedGeometry))}"></div>`
      : '';
    const guideHtml = selectedGeometry?.visible
      ? `
        <div class="pb-preview-insert-guide pb-preview-insert-guide--before" style="top: ${escapeAttr(String(Math.max(0, selectedRect.top)))}px; left: ${escapeAttr(String(Math.max(0, selectedRect.left)))}px; width: ${escapeAttr(String(Math.max(0, selectedRect.width)))}px;"></div>
        <div class="pb-preview-insert-guide pb-preview-insert-guide--after" style="top: ${escapeAttr(String(Math.max(0, selectedRect.bottom)))}px; left: ${escapeAttr(String(Math.max(0, selectedRect.left)))}px; width: ${escapeAttr(String(Math.max(0, selectedRect.width)))}px;"></div>
      `
      : '';
    const toolbarHtml = selectedGeometry?.visible
      ? `
        <div
          class="pb-preview-target-toolbar"
          style="top: ${escapeAttr(String(toolbarTop))}px; left: ${escapeAttr(String(toolbarLeft))}px;"
        >
          <span class="pb-preview-target-toolbar-label">${escapeHtml(selectedGeometry.label || 'Selected')}</span>
          <button type="button" class="btn-small btn-secondary" data-preview-target-action="settings">Settings</button>
        </div>
      `
      : '';

    overlay.innerHTML = `${hoverHtml}${selectedHtml}${guideHtml}${toolbarHtml}`;
    bindPreviewTargetOverlayControls(overlay);
  }

  function resetPreviewTargets(options = {}) {
    clearTargetStaleTimeout();
    const previousSequence = latestTargetSequence;
    latestPreviewTargets = [];
    latestTargetSequence = options.preserveSequence ? previousSequence : -1;
    hoveredTargetKey = '';
    selectedTargetKey = '';
    const frame = /** @type {HTMLElement|null} */ (el.pbCanvas?.querySelector('.pb-preview-frame'));
    if (frame) {
      if (options.preserveSequence && latestTargetSequence >= 0) {
        frame.dataset.targetSequence = String(latestTargetSequence);
      } else {
        delete frame.dataset.targetSequence;
      }
      delete frame.dataset.targetCount;
      delete frame.dataset.hoveredTargetKey;
      delete frame.dataset.selectedTargetKey;
    }
    if (options.render !== false) {
      renderPreviewTargetOverlay(frame);
    }
  }

  function storePreviewTargets(frame, message) {
    if (!frame || (latestTargetSequence >= 0 && message.sequence <= latestTargetSequence)) return;
    clearTargetStaleTimeout();
    latestTargetSequence = message.sequence;
    latestPreviewTargets = Array.isArray(message.targets) ? message.targets : [];
    if (hoveredTargetKey && !findTargetGeometry(hoveredTargetKey)) hoveredTargetKey = '';
    if (selectedTargetKey && !findTargetGeometry(selectedTargetKey)) selectedTargetKey = '';
    frame.dataset.targetSequence = String(latestTargetSequence);
    frame.dataset.targetCount = String(latestPreviewTargets.length);
    renderPreviewTargetOverlay(frame);
  }

  function handleTargetHover(frame, message) {
    if (!frame || message.sequence < latestTargetSequence) return;
    hoveredTargetKey = getTargetKey(message.target);
    frame.dataset.hoveredTargetKey = hoveredTargetKey;
    renderPreviewTargetOverlay(frame);
  }

  function handleTargetSelect(frame, message) {
    if (!frame || message.sequence < latestTargetSequence) return;
    const targetKey = getTargetKey(message.target);
    const accepted = actions.selectCanvasTarget?.(message.target) !== false;
    if (accepted) {
      selectedTargetKey = targetKey;
      frame.dataset.selectedTargetKey = selectedTargetKey;
    }
    renderPreviewTargetOverlay(frame);
  }

  function storePreviewMetrics(frame, metrics) {
    if (!frame || !metrics) return;
    latestPreviewMetrics = metrics;
    const viewport = metrics.viewport || {};
    frame.dataset.metricsPreset = viewport.id || '';
    frame.dataset.metricsExpectedWidth = String(viewport.width ?? '');
    frame.dataset.metricsExpectedHeight = String(viewport.height ?? '');
    frame.dataset.metricsInnerWidth = String(metrics.innerWidth ?? '');
    frame.dataset.metricsInnerHeight = String(metrics.innerHeight ?? '');
    frame.dataset.metricsPageSlug = metrics.pageSlug || '';
    frame.dataset.metricsSnapshotVersion = String(metrics.snapshotVersion ?? '');
    frame.dataset.metricsTwoPageMode = metrics.twoPageMode ? 'true' : 'false';
    frame.dataset.metricsBranchFlags = JSON.stringify(metrics.branchFlags || {});
    frame.dataset.metricsHasOverflow = metrics.overflow?.hasOverflow ? 'true' : 'false';
    frame.dataset.metricsOverflowOffenders = JSON.stringify(metrics.overflow?.offenders || []);
    renderPreviewDebugOverlay(frame, metrics);
  }

  function handlePreviewMessage(event) {
    const iframe = /** @type {HTMLIFrameElement|null} */ (
      el.pbCanvas?.querySelector('.pb-preview-iframe')
    );
    if (!iframe || !latestPreviewSnapshot || event.origin !== window.location.origin) return;
    if (event.source && iframe.contentWindow && event.source !== iframe.contentWindow) return;

    const validation = validatePreviewEnvelope(event.data, getPreviewExpectedIdentity());
    if (!validation.valid) return;

    if (event.data.type === BUILDER_PREVIEW_MESSAGE_TYPES.REQUEST_SNAPSHOT) {
      postPreviewSnapshot();
      return;
    }

    const frame = /** @type {HTMLElement|null} */ (el.pbCanvas?.querySelector('.pb-preview-frame'));
    if (event.data.type === BUILDER_PREVIEW_MESSAGE_TYPES.TARGETS) {
      storePreviewTargets(frame, event.data);
      return;
    }
    if (event.data.type === BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_HOVER) {
      handleTargetHover(frame, event.data);
      return;
    }
    if (event.data.type === BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_SELECT) {
      handleTargetSelect(frame, event.data);
      return;
    }
    if (event.data.type === BUILDER_PREVIEW_MESSAGE_TYPES.METRICS) {
      storePreviewMetrics(frame, event.data.metrics);
      return;
    }
    if (event.data.type === BUILDER_PREVIEW_MESSAGE_TYPES.ACK) {
      if (frame) frame.dataset.previewReady = 'true';
      return;
    }
    if (event.data.type === BUILDER_PREVIEW_MESSAGE_TYPES.ERROR) {
      if (frame) frame.dataset.previewError = event.data.error || 'Preview failed';
      const status = /** @type {HTMLElement|null} */ (
        el.pbCanvas?.querySelector('.pb-preview-status')
      );
      if (status) {
        status.dataset.status = 'danger';
        status.textContent = event.data.error || 'Preview failed';
      }
    }
  }

  function applyPreviewWorkingDraft(pageSnapshot) {
    const {
      dirtyScope,
      activeModuleDraftId,
      selectedModuleId,
      activeModuleDraft,
      activeThemeDraft,
      activeHeaderDraft,
      activePageSettingsDraft,
      activeSectionId,
      activeSectionDraft,
    } = getState();
    if (!pageSnapshot || !dirtyScope) return;

    if (dirtyScope === 'module') {
      const targetModuleId = activeModuleDraftId || selectedModuleId;
      if (!targetModuleId || !activeModuleDraft) return;
      for (const section of pageSnapshot.sections || []) {
        const module = (section.modules || []).find((item) => item.id === targetModuleId);
        if (module) {
          module.config = cloneValue(activeModuleDraft);
          return;
        }
      }
      return;
    }

    if (dirtyScope === 'theme' && activeThemeDraft) {
      pageSnapshot.meta = {
        ...(pageSnapshot.meta || {}),
        theme: cloneValue(activeThemeDraft.theme),
        panelBackgrounds: cloneValue(activeThemeDraft.panelBackgrounds),
        panelSpacing: cloneValue(activeThemeDraft.panelSpacing),
      };
      return;
    }

    if (dirtyScope === 'header' && activeHeaderDraft) {
      pageSnapshot.meta = actions.buildNormalizedPageMeta(pageSnapshot, activeHeaderDraft);
      return;
    }

    if (dirtyScope === 'page-settings' && activePageSettingsDraft) {
      pageSnapshot.slug = activePageSettingsDraft.slug;
      pageSnapshot.title = activePageSettingsDraft.title;
      pageSnapshot.pageType = activePageSettingsDraft.pageType;
      pageSnapshot.isHomepage = activePageSettingsDraft.isHomepage;
      return;
    }

    if (dirtyScope === 'section' && activeSectionId && activeSectionDraft) {
      const section = (pageSnapshot.sections || []).find((item) => item.id === activeSectionId);
      if (section) {
        section.settings = actions.buildSectionSettingsFromDraft(activeSectionDraft);
      }
    }
  }

  function createPreviewPageSnapshot(options = {}) {
    const { currentPage, dirtyScope, previewWidth } = getState();
    if (!currentPage) return null;

    const pageSnapshot = cloneValue(currentPage);
    const source = dirtyScope ? BUILDER_PREVIEW_SOURCES.WORKING : BUILDER_PREVIEW_SOURCES.SAVED;
    applyPreviewWorkingDraft(pageSnapshot);

    const viewport = getPreviewViewport(previewWidth);
    return {
      seriesId: deps.getSeriesId(),
      pageId: pageSnapshot.id || currentPage.id || '',
      pageSlug: pageSnapshot.slug || currentPage.slug || '',
      draftMode: currentPage.isPublished === false ? 'draft' : 'published',
      snapshotVersion: BUILDER_PREVIEW_SNAPSHOT_VERSION,
      source,
      page: pageSnapshot,
      options: {
        builderEditing: options.builderEditing === true,
        viewport: { ...viewport },
        sideEffects: { ...DEFAULT_BUILDER_PREVIEW_SIDE_EFFECTS },
        scrollState: { top: 0, left: 0 },
      },
    };
  }

  function renderPreview(options = {}) {
    if (!el.pbCanvas) return;

    const snapshot = createPreviewPageSnapshot(options);
    if (!snapshot) {
      latestPreviewSnapshot = null;
      previewIdentity = '';
      previewSession = '';
      resetPreviewTargets({ render: false });
      el.pbCanvas.dataset.mode = 'preview';
      el.pbCanvas.innerHTML =
        '<div class="pb-canvas-empty"><p>Select a page to preview it.</p></div>';
      return;
    }

    const { previewWidth } = getState();
    const viewport = snapshot?.options?.viewport || getPreviewViewport(previewWidth);
    const nextIdentity = getPreviewIdentity(snapshot);
    const shouldReload = !previewSession || previewIdentity !== nextIdentity;
    if (shouldReload) {
      previewSession = createPreviewSessionToken();
      previewIdentity = nextIdentity;
      latestPreviewMetrics = null;
      resetPreviewTargets({ render: false });
    }
    latestPreviewSnapshot = snapshot;

    el.pbCanvas.dataset.mode = 'preview';
    const statusHtml = `<div class="pb-canvas-notice pb-preview-status" data-status="${snapshot.source === BUILDER_PREVIEW_SOURCES.WORKING ? 'warning' : 'neutral'}" data-preview-source="${escapeAttr(snapshot.source)}">${getPreviewStatusCopy(snapshot.source)}</div>`;
    const existingFrame = /** @type {HTMLElement|null} */ (
      el.pbCanvas.querySelector('.pb-preview-frame')
    );
    const existingIframe = /** @type {HTMLIFrameElement|null} */ (
      el.pbCanvas.querySelector('.pb-preview-iframe')
    );

    if (shouldReload || !existingFrame || !existingIframe) {
      const iframeUrl = getPreviewIframeUrl(snapshot, previewSession);
      el.pbCanvas.innerHTML = `
        ${statusHtml}
        <div class="pb-preview-frame"
             data-width="${escapeAttr(viewport.id)}"
             data-preview-source="${escapeAttr(snapshot.source || '')}"
             data-page-id="${escapeAttr(snapshot.pageId || '')}"
             data-page-slug="${escapeAttr(snapshot.pageSlug || '')}"
             data-draft-mode="${escapeAttr(snapshot.draftMode || '')}"
             data-snapshot-version="${escapeAttr(String(snapshot.snapshotVersion || ''))}"
             data-builder-editing="${snapshot.options?.builderEditing === true ? 'true' : 'false'}"
             data-viewport-width="${escapeAttr(String(viewport.width))}"
             data-viewport-height="${escapeAttr(String(viewport.height))}"
             data-preview-session="${escapeAttr(previewSession)}"
             style="width: ${escapeAttr(String(viewport.width))}px; height: ${escapeAttr(String(viewport.height))}px;">
          <iframe
            class="pb-preview-iframe"
            title="Reader preview"
            src="${escapeAttr(iframeUrl)}"
            width="${escapeAttr(String(viewport.width))}"
            height="${escapeAttr(String(viewport.height))}"
            style="width: ${escapeAttr(String(viewport.width))}px; height: ${escapeAttr(String(viewport.height))}px;"
            loading="eager"
            referrerpolicy="same-origin">
          </iframe>
        </div>
      `;
      const iframe = /** @type {HTMLIFrameElement|null} */ (
        el.pbCanvas.querySelector('.pb-preview-iframe')
      );
      iframe?.addEventListener('load', postPreviewSnapshot);
      renderPreviewTargetOverlay(el.pbCanvas.querySelector('.pb-preview-frame'));
      return;
    }

    const status = /** @type {HTMLElement|null} */ (
      el.pbCanvas.querySelector('.pb-preview-status')
    );
    if (status) {
      status.dataset.status =
        snapshot.source === BUILDER_PREVIEW_SOURCES.WORKING ? 'warning' : 'neutral';
      status.dataset.previewSource = snapshot.source || '';
      status.textContent = getPreviewStatusCopy(snapshot.source);
    }
    updatePreviewFrameDataset(existingFrame, snapshot, viewport);
    applyPreviewIframeSize(existingIframe, viewport);
    renderPreviewDebugOverlay(existingFrame);
    renderPreviewTargetOverlay(existingFrame);
    scheduleTargetStaleTimeout(existingFrame, latestTargetSequence);
    postPreviewSnapshot();
  }

  function setViewport(nextWidth) {
    if (!isPreviewViewportId(nextWidth)) return false;
    if (nextWidth === getState().previewWidth) return false;

    actions.setPreviewWidth(nextWidth);
    const viewport = getPreviewViewport(nextWidth);
    const frame = /** @type {HTMLElement|null} */ (el.pbCanvas?.querySelector('.pb-preview-frame'));
    const iframe = /** @type {HTMLIFrameElement|null} */ (
      el.pbCanvas?.querySelector('.pb-preview-iframe')
    );
    if (frame) {
      frame.dataset.width = viewport.id;
      frame.dataset.viewportWidth = String(viewport.width);
      frame.dataset.viewportHeight = String(viewport.height);
      frame.style.width = `${viewport.width}px`;
      frame.style.height = `${viewport.height}px`;
      renderPreviewDebugOverlay(frame);
    }
    if (iframe) {
      applyPreviewIframeSize(iframe, viewport);
    }
    if (latestPreviewSnapshot?.options) {
      latestPreviewSnapshot.options.viewport = { ...viewport };
      resetPreviewTargets({ preserveSequence: true });
      postPreviewSnapshot();
    }
    return true;
  }

  function resetSession() {
    previewSession = '';
    previewIdentity = '';
    latestPreviewSnapshot = null;
    resetPreviewTargets();
  }

  function bindMessageHandler() {
    if (previewMessageBound) return;
    window.addEventListener('message', handlePreviewMessage);
    previewMessageBound = true;
  }

  function getSnapshot() {
    return latestPreviewSnapshot;
  }

  return {
    bindMessageHandler,
    getSnapshot,
    renderPreview,
    resetSession,
    setViewport,
  };
}

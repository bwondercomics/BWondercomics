import { cloneValue, escapeAttr } from './helpers.js';
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

export function createPreviewManager({ el, getState, actions, deps }) {
  let previewSession = '';
  let previewIdentity = '';
  let latestPreviewSnapshot = null;
  let previewMessageBound = false;

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
    frame.dataset.viewportWidth = String(viewport.width);
    frame.dataset.viewportHeight = String(viewport.height);
    frame.dataset.previewSession = previewSession;
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

  function createPreviewPageSnapshot() {
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
        viewport: { ...viewport },
        sideEffects: { ...DEFAULT_BUILDER_PREVIEW_SIDE_EFFECTS },
        scrollState: { top: 0, left: 0 },
      },
    };
  }

  function renderPreview() {
    if (!el.pbCanvas) return;

    const snapshot = createPreviewPageSnapshot();
    if (!snapshot) {
      latestPreviewSnapshot = null;
      previewIdentity = '';
      previewSession = '';
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
             data-viewport-width="${escapeAttr(String(viewport.width))}"
             data-viewport-height="${escapeAttr(String(viewport.height))}"
             data-preview-session="${escapeAttr(previewSession)}">
          <iframe
            class="pb-preview-iframe"
            title="Reader preview"
            src="${escapeAttr(iframeUrl)}"
            width="${escapeAttr(String(viewport.width))}"
            height="${escapeAttr(String(viewport.height))}"
            loading="eager"
            referrerpolicy="same-origin">
          </iframe>
        </div>
      `;
      const iframe = /** @type {HTMLIFrameElement|null} */ (
        el.pbCanvas.querySelector('.pb-preview-iframe')
      );
      iframe?.addEventListener('load', postPreviewSnapshot);
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
    existingIframe.width = String(viewport.width);
    existingIframe.height = String(viewport.height);
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
    }
    if (iframe) {
      iframe.width = String(viewport.width);
      iframe.height = String(viewport.height);
    }
    if (latestPreviewSnapshot?.options) {
      latestPreviewSnapshot.options.viewport = { ...viewport };
      postPreviewSnapshot();
    }
    return true;
  }

  function resetSession() {
    previewSession = '';
    previewIdentity = '';
    latestPreviewSnapshot = null;
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

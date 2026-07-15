import { cloneValue, escapeAttr, escapeHtml } from '../../shared/page-builder/helpers.js';
import { getPageModuleDuplicateEligibility } from './module-eligibility.js';
import {
  BUILDER_PREVIEW_MESSAGE_TYPES,
  BUILDER_PREVIEW_SNAPSHOT_VERSION,
  BUILDER_PREVIEW_SOURCES,
  BUILDER_PREVIEW_TARGET_ACTIONS,
  DEFAULT_BUILDER_PREVIEW_SIDE_EFFECTS,
  buildPreviewInlineEditMessage,
  buildPreviewSnapshotMessage,
  buildPreviewTargetMessage,
  getBuilderDevice,
  getPreviewStatusCopy,
  getPreviewViewport,
  isBuilderDeviceId,
  validatePreviewEnvelope,
} from '../../shared/page-builder/preview-contract.js';

const TARGET_STALE_TIMEOUT_MS = 1500;
const PREVIEW_SCALE_PRECISION = 4;

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

function getPlacementGuideStyle(placement, geometry) {
  const rect = geometry?.rect || {};
  if (placement?.placement === 'header-cell') {
    // Header drops target a whole 3×3 cell, so the guide is the cell box itself.
    return [
      `top: ${Math.max(0, Number(rect.top) || 0)}px`,
      `left: ${Math.max(0, Number(rect.left) || 0)}px`,
      `width: ${Math.max(24, Number(rect.width) || 0)}px`,
      `height: ${Math.max(24, Number(rect.height) || 0)}px`,
    ].join('; ');
  }
  if (placement?.target?.surface === 'page-end') {
    return [
      `top: ${Math.max(0, Number(rect.top) || 0)}px`,
      `left: ${Math.max(0, Number(rect.left) || 0)}px`,
      `width: ${Math.max(24, Number(rect.width) || 0)}px`,
      `height: ${Math.max(3, Number(rect.height) || 0)}px`,
    ].join('; ');
  }
  const top = Math.max(
    0,
    ['after', 'end', 'section-after', 'page-end'].includes(placement?.placement)
      ? Number(rect.bottom) || 0
      : Number(rect.top) || 0
  );
  return [
    `top: ${top}px`,
    `left: ${Math.max(0, Number(rect.left) || 0)}px`,
    `width: ${Math.max(24, Number(rect.width) || 0)}px`,
  ].join('; ');
}

function getFallbackPlacementGeometry(frame, placement) {
  if (!frame || placement?.placement !== 'page-end') return null;
  const frameWidth = Number(frame.dataset.viewportWidth) || frame.clientWidth || 0;
  const frameHeight = Number(frame.dataset.viewportHeight) || frame.clientHeight || 0;
  const left = 8;
  const width = Math.max(24, frameWidth - left * 2);
  const top = Math.max(0, frameHeight - 8);
  return {
    target: placement.target || { kind: 'page' },
    visible: true,
    rect: {
      top,
      left,
      right: left + width,
      bottom: top,
      width,
      height: 0,
    },
  };
}

function formatScaleValue(value) {
  const scale = Number(value);
  if (!Number.isFinite(scale) || scale <= 0) return '1';
  return String(Number(scale.toFixed(PREVIEW_SCALE_PRECISION)));
}

function getPreviewScale(frame) {
  const rawScale = Number(
    frame?.dataset.previewScale || frame?.closest?.('.pb-preview-scale-shell')?.dataset.previewScale
  );
  return Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
}

function getFramePoint(frame, event) {
  if (!frame) return { x: 0, y: 0 };
  const rect = frame.getBoundingClientRect();
  const scale = getPreviewScale(frame);
  return {
    x: (Number(event.clientX) - rect.left) / scale,
    y: (Number(event.clientY) - rect.top) / scale,
  };
}

function getToolbarActions(target, currentPage) {
  if (target?.kind === 'module') {
    const actions = [
      ['settings', 'Settings'],
      ['move', 'Move'],
      ['insert-before', 'Insert Before'],
      ['insert-after', 'Insert After'],
      ['hide-device', 'Hide Device'],
      ['delete', 'Delete'],
    ];
    // One-step precision moves (drag stays for free placement). The Comic Reader owns
    // the viewport, so stepping it between columns is not offered.
    if (target.moduleType !== 'reader') {
      actions.splice(
        2,
        0,
        ['move-up', '↑'],
        ['move-down', '↓'],
        ['move-left', '←'],
        ['move-right', '→']
      );
    }
    if (getPageModuleDuplicateEligibility(currentPage, target.moduleId).allowed) {
      actions.push(['duplicate', 'Duplicate']);
    }
    if (target.moduleType === 'text') {
      actions.splice(1, 0, ['edit-text', 'Edit Text']);
    }
    return actions;
  }
  if (target?.kind === 'section') {
    return [
      ['settings', 'Settings'],
      ['move', 'Move'],
      ['insert-section-before', 'Section Before'],
      ['insert-section-after', 'Section After'],
      ['delete', 'Delete'],
    ];
  }
  if (target?.kind === 'page') {
    return [['insert-section-end', 'Add Section']];
  }
  if (target?.kind === 'header' && target.blockId) {
    // Selected header block: drag to any header cell, or step regions/rows one at a time.
    return [
      ['settings', 'Settings'],
      ['move', 'Move'],
      ['move-up', '↑'],
      ['move-down', '↓'],
      ['move-left', '←'],
      ['move-right', '→'],
    ];
  }
  return [['settings', 'Settings']];
}

function getSectionInsertIndex(target, action, targets = []) {
  const explicitIndex = Number(target?.sectionIndex);
  if (Number.isSafeInteger(explicitIndex)) {
    return explicitIndex + (action === 'insert-section-after' ? 1 : 0);
  }

  const sectionTargets = targets.filter((item) => item?.target?.kind === 'section');
  const sectionIndex = sectionTargets.findIndex(
    (item) => item.target.sectionId === target?.sectionId
  );
  if (sectionIndex >= 0) {
    return sectionIndex + (action === 'insert-section-after' ? 1 : 0);
  }
  return sectionTargets.length;
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
  let pendingRestoreTargetKey = '';
  let previewMessageBound = false;
  let previewResizeBound = false;
  let targetStaleTimeoutId = null;

  function runBuilderCommand(id, payload = {}) {
    return actions.runCommand?.(id, payload) ?? actions.runStructuralCommand?.(id, payload);
  }

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
    if (snapshot.page?.scope === 'global') {
      params.set('pageScope', 'global');
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

  function postTargetAction(action, target = null) {
    const iframe = /** @type {HTMLIFrameElement|null} */ (
      el.pbCanvas?.querySelector('.pb-preview-iframe')
    );
    if (!iframe?.contentWindow || !latestPreviewSnapshot || !previewSession) return;
    iframe.contentWindow.postMessage(
      buildPreviewTargetMessage(
        BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_ACTION,
        { action, target, sequence: Math.max(0, latestTargetSequence) },
        {
          previewSession,
          snapshotVersion: latestPreviewSnapshot.snapshotVersion,
          seriesId: latestPreviewSnapshot.seriesId,
          pageId: latestPreviewSnapshot.pageId,
          pageSlug: latestPreviewSnapshot.pageSlug,
        }
      ),
      window.location.origin
    );
  }

  function postInlineEditMessage(type, payload = {}) {
    const iframe = /** @type {HTMLIFrameElement|null} */ (
      el.pbCanvas?.querySelector('.pb-preview-iframe')
    );
    if (!iframe?.contentWindow || !latestPreviewSnapshot || !previewSession) return;
    iframe.contentWindow.postMessage(
      buildPreviewInlineEditMessage(
        type,
        {
          sequence: Math.max(0, latestTargetSequence),
          field: 'content',
          ...payload,
        },
        {
          previewSession,
          snapshotVersion: latestPreviewSnapshot.snapshotVersion,
          seriesId: latestPreviewSnapshot.seriesId,
          pageId: latestPreviewSnapshot.pageId,
          pageSlug: latestPreviewSnapshot.pageSlug,
        }
      ),
      window.location.origin
    );
  }

  function updatePreviewFrameDataset(frame, snapshot, viewport) {
    if (!frame || !snapshot) return;
    frame.dataset.width = viewport.id;
    frame.dataset.deviceId = snapshot.options?.deviceId || viewport.id;
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
    applyPreviewFrameScale(frame, viewport);
  }

  function getPreviewScaleShell(frame) {
    const shell = frame?.closest?.('.pb-preview-scale-shell');
    return shell instanceof HTMLElement ? shell : null;
  }

  function getCanvasAvailablePreviewSize() {
    const canvas = el.pbCanvas;
    if (!canvas) return { width: 0, height: 0 };
    const style =
      typeof window.getComputedStyle === 'function' ? window.getComputedStyle(canvas) : null;
    const paddingX =
      (Number.parseFloat(style?.paddingLeft || '0') || 0) +
      (Number.parseFloat(style?.paddingRight || '0') || 0);
    const paddingY =
      (Number.parseFloat(style?.paddingTop || '0') || 0) +
      (Number.parseFloat(style?.paddingBottom || '0') || 0);
    const status = /** @type {HTMLElement|null} */ (canvas.querySelector('.pb-preview-status'));
    const statusStyle =
      status && typeof window.getComputedStyle === 'function'
        ? window.getComputedStyle(status)
        : null;
    const statusRect = status?.getBoundingClientRect?.();
    const statusVisible =
      status && statusStyle?.display !== 'none' && statusStyle?.visibility !== 'hidden';
    const statusHeight = statusVisible
      ? (statusRect?.height || status.offsetHeight || 0) +
        (Number.parseFloat(statusStyle?.marginTop || '0') || 0) +
        (Number.parseFloat(statusStyle?.marginBottom || '0') || 0)
      : 0;

    return {
      width: Math.max(0, (canvas.clientWidth || 0) - paddingX),
      height: Math.max(0, (canvas.clientHeight || 0) - paddingY - statusHeight),
    };
  }

  function calculatePreviewScale(viewport) {
    const width = Number(viewport?.width) || 0;
    const height = Number(viewport?.height) || 0;
    if (!width || !height) return 1;
    const available = getCanvasAvailablePreviewSize();
    const widthScale = available.width > 0 ? available.width / width : 1;
    const heightScale = available.height > 0 ? available.height / height : 1;
    return Math.min(1, widthScale, heightScale);
  }

  function applyPreviewFrameScale(frame, viewport) {
    if (!frame || !viewport) return 1;
    const width = Number(viewport.width) || 0;
    const height = Number(viewport.height) || 0;
    const scale = calculatePreviewScale(viewport);
    const scaleText = formatScaleValue(scale);
    const scaledWidth = Math.max(0, width * scale);
    const scaledHeight = Math.max(0, height * scale);
    const shell = getPreviewScaleShell(frame);

    frame.dataset.previewScale = scaleText;
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
    frame.style.transform = scale === 1 ? '' : `scale(${scaleText})`;
    frame.style.transformOrigin = 'top left';

    if (shell) {
      shell.dataset.width = viewport.id || '';
      shell.dataset.viewportWidth = String(width);
      shell.dataset.viewportHeight = String(height);
      shell.dataset.previewScale = scaleText;
      shell.style.width = `${scaledWidth}px`;
      shell.style.height = `${scaledHeight}px`;
    }
    return scale;
  }

  function reflowPreviewScale() {
    const frame = /** @type {HTMLElement|null} */ (el.pbCanvas?.querySelector('.pb-preview-frame'));
    if (!frame) return 1;
    const viewport = {
      id: frame.dataset.width || '',
      width: Number(frame.dataset.viewportWidth) || frame.clientWidth || 0,
      height: Number(frame.dataset.viewportHeight) || frame.clientHeight || 0,
    };
    return applyPreviewFrameScale(frame, viewport);
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

  function getRestoreTargetKey(targetOrKey) {
    if (!targetOrKey) return '';
    if (typeof targetOrKey === 'string') return targetOrKey;
    return getTargetKey(targetOrKey);
  }

  function applyPendingRestoreTarget(frame) {
    if (!pendingRestoreTargetKey) return;
    const restoreKey = pendingRestoreTargetKey;
    pendingRestoreTargetKey = '';
    const geometry = findTargetGeometry(restoreKey);
    if (geometry) {
      selectedTargetKey = restoreKey;
      if (frame) frame.dataset.selectedTargetKey = restoreKey;
      return;
    }
    selectedTargetKey = '';
    if (frame) delete frame.dataset.selectedTargetKey;
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
      overlay.setAttribute('aria-hidden', 'false');
      frame.appendChild(overlay);
    }
    return overlay;
  }

  function bindPreviewTargetOverlayControls(overlay) {
    overlay.querySelectorAll('[data-preview-target-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const action = button.dataset.previewTargetAction;
        const selectedGeometry = findTargetGeometry(selectedTargetKey);
        const target = selectedGeometry?.target;
        if (!target || button.disabled) return;
        if (action === 'settings') {
          actions.selectCanvasTarget?.(target);
          return;
        }
        if (action === 'edit-text') {
          const result = await runBuilderCommand('builder:inline-edit-start', {
            target,
            field: 'content',
            reason: 'toolbar',
          });
          if (result?.ok === false) return;
          postInlineEditMessage(BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_START, {
            target,
            field: 'content',
            value: result?.value,
            reason: 'toolbar',
          });
          return;
        }
        if (
          action === 'move-up' ||
          action === 'move-down' ||
          action === 'move-left' ||
          action === 'move-right'
        ) {
          await runBuilderCommand(
            target.kind === 'header' ? 'builder:move-header-block' : 'builder:move-module-step',
            {
              target,
              direction: action.slice(5),
            }
          );
          return;
        }
        if (action === 'insert-before' || action === 'insert-after') {
          await runBuilderCommand('builder:insert', {
            target,
            position: action === 'insert-before' ? 'before' : 'after',
          });
          return;
        }
        if (action === 'insert-section-before' || action === 'insert-section-after') {
          const placement = {
            sectionIndex: getSectionInsertIndex(target, action, latestPreviewTargets),
          };
          await runBuilderCommand('builder:insert-section', placement);
          return;
        }
        if (action === 'insert-section-end') {
          await runBuilderCommand('builder:insert-section', {});
          return;
        }
        if (action === 'hide-device') {
          await runBuilderCommand('builder:hide-on-device', { target });
          return;
        }
        if (action === 'duplicate') {
          await runBuilderCommand('builder:duplicate-selected', { target });
          return;
        }
        if (action === 'delete') {
          await runBuilderCommand('builder:delete-selected', { target });
        }
      });
    });

    overlay.querySelectorAll('[data-preview-target-action="move"]').forEach((button) => {
      button.addEventListener('dragstart', (event) => {
        const selectedGeometry = findTargetGeometry(selectedTargetKey);
        const target = selectedGeometry?.target;
        if (!target) return;
        const result = runBuilderCommand('builder:drag-start', {
          source: target.kind === 'header' ? 'header-block' : target.kind,
          moduleId: target.moduleId,
          sectionId: target.sectionId,
          blockId: target.blockId,
          originTarget: target,
        });
        if (result?.ok === false) {
          event.preventDefault();
          return;
        }
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData(
            'text/plain',
            target.moduleId || target.sectionId || target.blockId || ''
          );
        }
        if (target.kind === 'header') {
          // Ask the preview to reveal the 3×3 header drop cells for this drag.
          postTargetAction(BUILDER_PREVIEW_TARGET_ACTIONS.HEADER_DRAG_START);
        }
        renderPreviewTargetOverlay();
      });
      button.addEventListener('dragend', () => {
        postTargetAction(BUILDER_PREVIEW_TARGET_ACTIONS.HEADER_DRAG_END);
        runBuilderCommand('builder:drag-end');
        renderPreviewTargetOverlay();
      });
    });

    if (overlay.dataset.liveDropEventsBound !== 'true') {
      overlay.dataset.liveDropEventsBound = 'true';
      overlay.addEventListener('dragover', (event) => {
        if (!getState().liveDragState) return;
        event.preventDefault();
        const frame = overlay.closest('.pb-preview-frame');
        const result = runBuilderCommand('builder:drag-over', {
          point: getFramePoint(frame, event),
          targets: latestPreviewTargets,
        });
        if (result?.ok || getState().liveDragState) {
          renderPreviewTargetOverlay(frame);
        }
      });

      overlay.addEventListener('drop', async (event) => {
        if (!getState().liveDragState) return;
        event.preventDefault();
        const frame = overlay.closest('.pb-preview-frame');
        await runBuilderCommand('builder:drop', {
          point: getFramePoint(frame, event),
          targets: latestPreviewTargets,
        });
        renderPreviewTargetOverlay(frame);
      });
    }
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
    const liveDragState = getState().liveDragState || null;
    const dragPlacement = liveDragState?.currentPlacement || null;
    const frameWidth = Number(frame.dataset.viewportWidth) || frame.clientWidth || 0;
    const dragGeometry =
      (dragPlacement?.target?.key ? findTargetGeometry(dragPlacement.target.key) : null) ||
      getFallbackPlacementGeometry(frame, dragPlacement);
    const selectedRect = selectedGeometry?.rect || null;
    const toolbarWidth = 360;
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
    const dragGuideHtml =
      liveDragState && dragPlacement && dragGeometry?.visible
        ? `<div class="pb-preview-drop-guide pb-preview-drop-guide--${escapeAttr(dragPlacement.placement)}${dragPlacement.target?.surface === 'page-end' ? ' pb-preview-drop-guide--page-end-target' : ''}" style="${escapeAttr(getPlacementGuideStyle(dragPlacement, dragGeometry))}"></div>`
        : '';
    const toolbarHtml = selectedGeometry?.visible
      ? `
        <div
          class="pb-preview-target-toolbar"
          style="top: ${escapeAttr(String(toolbarTop))}px; left: ${escapeAttr(String(toolbarLeft))}px;"
        >
          <span class="pb-preview-target-toolbar-label">${escapeHtml(selectedGeometry.label || 'Selected')}</span>
          ${getToolbarActions(selectedGeometry.target, getState().currentPage)
            .map(([action, label]) => {
              const draggable = action === 'move' ? ' draggable="true"' : '';
              return `<button type="button" class="btn-small btn-secondary" data-preview-target-action="${escapeAttr(action)}"${draggable}>${escapeHtml(label)}</button>`;
            })
            .join('')}
        </div>
      `
      : '';

    overlay.classList.toggle('is-live-dragging', !!liveDragState);
    overlay.innerHTML = `${hoverHtml}${selectedHtml}${guideHtml}${dragGuideHtml}${toolbarHtml}`;
    bindPreviewTargetOverlayControls(overlay);
  }

  function resetPreviewTargets(options = {}) {
    clearTargetStaleTimeout();
    if (getState().liveDragState) {
      runBuilderCommand('builder:drag-end');
    }
    const previousSequence = latestTargetSequence;
    latestPreviewTargets = [];
    latestTargetSequence = options.preserveSequence ? previousSequence : -1;
    hoveredTargetKey = '';
    selectedTargetKey = '';
    pendingRestoreTargetKey = '';
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
    applyPendingRestoreTarget(frame);
    if (hoveredTargetKey && !findTargetGeometry(hoveredTargetKey)) hoveredTargetKey = '';
    if (selectedTargetKey && !findTargetGeometry(selectedTargetKey)) selectedTargetKey = '';
    frame.dataset.targetSequence = String(latestTargetSequence);
    frame.dataset.targetCount = String(latestPreviewTargets.length);
    if (selectedTargetKey) {
      frame.dataset.selectedTargetKey = selectedTargetKey;
    } else {
      delete frame.dataset.selectedTargetKey;
    }
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

  function handleInlineEditMessage(frame, message) {
    if (latestPreviewSnapshot?.options?.builderEditing !== true) return;
    if (!frame || (latestTargetSequence >= 0 && message.sequence < latestTargetSequence)) return;
    const commandByType = {
      [BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_START]: 'builder:inline-edit-start',
      [BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE]: 'builder:inline-edit-change',
      [BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_COMMIT]: 'builder:inline-edit-commit',
      [BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CANCEL]: 'builder:inline-edit-cancel',
    };
    const commandId = commandByType[message.type];
    if (!commandId) return;
    const result = runBuilderCommand(commandId, {
      target: message.target,
      field: message.field,
      value: message.value,
      reason: message.reason,
      sequence: message.sequence,
    });
    if (result?.ok === false) return;
    const targetKey = getTargetKey(message.target);
    if (targetKey) {
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
      if (latestPreviewSnapshot?.options?.builderEditing !== true) return;
      storePreviewTargets(frame, event.data);
      return;
    }
    if (event.data.type === BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_HOVER) {
      if (latestPreviewSnapshot?.options?.builderEditing !== true) return;
      handleTargetHover(frame, event.data);
      return;
    }
    if (event.data.type === BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_SELECT) {
      if (latestPreviewSnapshot?.options?.builderEditing !== true) return;
      handleTargetSelect(frame, event.data);
      return;
    }
    if (
      event.data.type === BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_START ||
      event.data.type === BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE ||
      event.data.type === BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_COMMIT ||
      event.data.type === BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CANCEL
    ) {
      handleInlineEditMessage(frame, event.data);
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
      // The theme draft no longer models panel background/spacing (those live on the column now);
      // preserve any existing page.meta panel keys via the spread as a read-time fallback.
      pageSnapshot.meta = {
        ...(pageSnapshot.meta || {}),
        theme: cloneValue(activeThemeDraft.theme),
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
        section.layout = actions.getSectionLayoutFromDraft(activeSectionDraft);
        section.settings = actions.buildSectionSettingsFromDraft(activeSectionDraft);
      }
    }
  }

  function createPreviewPageSnapshot(options = {}) {
    const { currentPage, dirtyScope, activeDeviceId, previewWidth } = getState();
    if (!currentPage) return null;

    const pageSnapshot = cloneValue(currentPage);
    const source = dirtyScope ? BUILDER_PREVIEW_SOURCES.WORKING : BUILDER_PREVIEW_SOURCES.SAVED;
    applyPreviewWorkingDraft(pageSnapshot);

    const deviceId = isBuilderDeviceId(activeDeviceId) ? activeDeviceId : previewWidth;
    const device = getBuilderDevice(deviceId);
    const viewport = getPreviewViewport(device.id);
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
        deviceId: device.id,
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

    const { activeDeviceId, previewWidth } = getState();
    const viewport =
      snapshot?.options?.viewport || getPreviewViewport(activeDeviceId || previewWidth);
    const nextIdentity = getPreviewIdentity(snapshot);
    const shouldReload = !previewSession || previewIdentity !== nextIdentity;
    if (shouldReload) {
      previewSession = createPreviewSessionToken();
      previewIdentity = nextIdentity;
      latestPreviewMetrics = null;
      resetPreviewTargets({ render: false });
    }
    latestPreviewSnapshot = snapshot;
    if (snapshot.options?.builderEditing !== true) {
      resetPreviewTargets({ render: false, preserveSequence: true });
    }

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
        <div class="pb-preview-scale-shell"
             data-width="${escapeAttr(viewport.id)}"
             data-viewport-width="${escapeAttr(String(viewport.width))}"
             data-viewport-height="${escapeAttr(String(viewport.height))}"
             data-preview-scale="1"
             style="width: ${escapeAttr(String(viewport.width))}px; height: ${escapeAttr(String(viewport.height))}px;">
          <div class="pb-preview-frame"
               data-width="${escapeAttr(viewport.id)}"
               data-device-id="${escapeAttr(snapshot.options?.deviceId || viewport.id)}"
               data-preview-source="${escapeAttr(snapshot.source || '')}"
               data-page-id="${escapeAttr(snapshot.pageId || '')}"
               data-page-slug="${escapeAttr(snapshot.pageSlug || '')}"
               data-draft-mode="${escapeAttr(snapshot.draftMode || '')}"
               data-snapshot-version="${escapeAttr(String(snapshot.snapshotVersion || ''))}"
               data-builder-editing="${snapshot.options?.builderEditing === true ? 'true' : 'false'}"
               data-viewport-width="${escapeAttr(String(viewport.width))}"
               data-viewport-height="${escapeAttr(String(viewport.height))}"
               data-preview-session="${escapeAttr(previewSession)}"
               data-preview-scale="1"
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
        </div>
      `;
      const frame = /** @type {HTMLElement|null} */ (
        el.pbCanvas.querySelector('.pb-preview-frame')
      );
      const iframe = /** @type {HTMLIFrameElement|null} */ (
        el.pbCanvas.querySelector('.pb-preview-iframe')
      );
      applyPreviewFrameScale(frame, viewport);
      iframe?.addEventListener('load', postPreviewSnapshot);
      renderPreviewTargetOverlay(frame);
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
    if (snapshot.options?.builderEditing !== true) {
      existingFrame.querySelector('.pb-preview-debug-overlay')?.remove();
      renderPreviewTargetOverlay(existingFrame);
      postPreviewSnapshot();
      return;
    }
    renderPreviewDebugOverlay(existingFrame);
    renderPreviewTargetOverlay(existingFrame);
    scheduleTargetStaleTimeout(existingFrame, latestTargetSequence);
    postPreviewSnapshot();
  }

  function refreshPreviewSnapshotState(options = {}) {
    if (!el.pbCanvas) return null;
    const builderEditing =
      options.builderEditing ?? latestPreviewSnapshot?.options?.builderEditing === true;
    const snapshot = createPreviewPageSnapshot({ builderEditing });
    if (!snapshot) return null;
    latestPreviewSnapshot = snapshot;
    const viewport = snapshot.options?.viewport || getPreviewViewport(snapshot.options?.deviceId);
    const status = /** @type {HTMLElement|null} */ (
      el.pbCanvas.querySelector('.pb-preview-status')
    );
    if (status) {
      status.dataset.status =
        snapshot.source === BUILDER_PREVIEW_SOURCES.WORKING ? 'warning' : 'neutral';
      status.dataset.previewSource = snapshot.source || '';
      status.textContent = getPreviewStatusCopy(snapshot.source);
    }
    const frame = /** @type {HTMLElement|null} */ (el.pbCanvas.querySelector('.pb-preview-frame'));
    updatePreviewFrameDataset(frame, snapshot, viewport);
    applyPreviewFrameScale(frame, viewport);
    return snapshot;
  }

  function setViewport(nextWidth) {
    if (!isBuilderDeviceId(nextWidth)) return false;
    const { activeDeviceId, previewWidth } = getState();
    if (nextWidth === (activeDeviceId || previewWidth)) return false;

    actions.setActiveDeviceId?.(nextWidth);
    actions.setPreviewWidth?.(nextWidth);
    const viewport = getPreviewViewport(nextWidth);
    const frame = /** @type {HTMLElement|null} */ (el.pbCanvas?.querySelector('.pb-preview-frame'));
    const iframe = /** @type {HTMLIFrameElement|null} */ (
      el.pbCanvas?.querySelector('.pb-preview-iframe')
    );
    if (frame) {
      frame.dataset.width = viewport.id;
      frame.dataset.deviceId = viewport.id;
      frame.dataset.viewportWidth = String(viewport.width);
      frame.dataset.viewportHeight = String(viewport.height);
      frame.style.width = `${viewport.width}px`;
      frame.style.height = `${viewport.height}px`;
      applyPreviewFrameScale(frame, viewport);
      renderPreviewDebugOverlay(frame);
    }
    if (iframe) {
      applyPreviewIframeSize(iframe, viewport);
    }
    if (latestPreviewSnapshot?.options) {
      latestPreviewSnapshot.options.deviceId = viewport.id;
      latestPreviewSnapshot.options.viewport = { ...viewport };
      resetPreviewTargets({ preserveSequence: true });
      postPreviewSnapshot();
    }
    actions.renderEditorPanel?.();
    return true;
  }

  function resetSession() {
    previewSession = '';
    previewIdentity = '';
    latestPreviewSnapshot = null;
    resetPreviewTargets();
  }

  function bindMessageHandler() {
    if (!previewMessageBound) {
      window.addEventListener('message', handlePreviewMessage);
      previewMessageBound = true;
    }
    if (!previewResizeBound) {
      window.addEventListener('resize', reflowPreviewScale);
      previewResizeBound = true;
    }
  }

  function getSnapshot() {
    return latestPreviewSnapshot;
  }

  function renderTargetOverlay() {
    renderPreviewTargetOverlay();
  }

  function requestTargetRefresh(target = null) {
    postTargetAction(BUILDER_PREVIEW_TARGET_ACTIONS.REFRESH_TARGETS, target);
  }

  function syncInlineEditDraft(target = null, value = '', reason = 'admin-sync') {
    if (!target) return;
    postInlineEditMessage(BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE, {
      target,
      value,
      reason,
    });
  }

  function commitInlineEdit(target = null, value = '', reason = 'admin-commit') {
    if (!target) return;
    postInlineEditMessage(BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_COMMIT, {
      target,
      value,
      reason,
    });
  }

  function cancelInlineEdit(target = null, reason = 'admin-cancel') {
    if (!target) return;
    postInlineEditMessage(BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CANCEL, {
      target,
      reason,
    });
  }

  function restoreSelectedTarget(targetOrKey = null) {
    pendingRestoreTargetKey = getRestoreTargetKey(targetOrKey);
    hoveredTargetKey = '';
    selectedTargetKey = '';
    const frame = /** @type {HTMLElement|null} */ (el.pbCanvas?.querySelector('.pb-preview-frame'));
    if (frame) {
      delete frame.dataset.hoveredTargetKey;
      delete frame.dataset.selectedTargetKey;
      if (latestPreviewTargets.length) {
        applyPendingRestoreTarget(frame);
      }
    }
    renderPreviewTargetOverlay(frame);
  }

  return {
    bindMessageHandler,
    cancelInlineEdit,
    commitInlineEdit,
    getSnapshot,
    requestTargetRefresh,
    restoreSelectedTarget,
    renderTargetOverlay,
    renderPreview,
    refreshPreviewSnapshotState,
    reflowPreviewScale,
    resetSession,
    setViewport,
    syncInlineEditDraft,
  };
}

import {
  BUILDER_PREVIEW_MESSAGE_TYPES,
  BUILDER_PREVIEW_SNAPSHOT_VERSION,
  BUILDER_PREVIEW_TARGET_ACTIONS,
  BUILDER_PREVIEW_TARGET_KINDS,
  PREVIEW_MEDIA_QUERIES,
  buildPreviewControlMessage,
  buildPreviewInlineEditMessage,
  buildPreviewMetricsMessage,
  buildPreviewTargetMessage,
  getPreviewViewport,
  isPreviewViewportId,
  validatePreviewEnvelope,
} from '../admin/page-builder/preview-contract.js';
import { sanitizeBuilderHtml, sanitizeHref } from '../admin/page-builder/sanitize.js';
import { CONFIG } from './config.js';
import {
  getActiveSeriesId,
  getPreviewPageId,
  getPreviewSessionToken,
  getRequestedPageSlug,
} from './series.js';

const DEFAULT_TIMEOUT_MS = 5000;
const OVERFLOW_SELECTORS = Object.freeze([
  'header.topbar',
  '.header-actions',
  '.viewerWrap',
  '.controls',
  '.pb-page',
  '.pb-section',
  '.pb-buttons',
  '.pb-html',
]);

let activePreviewContext = null;
let activeSnapshotSubscriptionCleanup = null;
let activeTargetBridgeCleanup = null;
let targetSequence = 0;

const TARGET_SELECTOR = [
  '[data-builder-module-id]',
  '[data-builder-surface="page-header"]',
  '[data-builder-surface="page-end"]',
  '[data-builder-column-index]',
  '[data-builder-section-id]',
  '[data-builder-page-id]',
].join(',');
const BUILDER_EDITING_BLOCKED_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  '+',
  '=',
  '-',
  '0',
  'f',
  'F',
  '?',
  'Escape',
  'Enter',
  ' ',
  'Space',
  'Spacebar',
]);

function getExpectedIdentity(overrides = {}) {
  return {
    previewSession: overrides.previewSession || getPreviewSessionToken(),
    snapshotVersion: BUILDER_PREVIEW_SNAPSHOT_VERSION,
    seriesId: overrides.seriesId || getActiveSeriesId(),
    pageId: overrides.pageId || getPreviewPageId(),
    pageSlug: overrides.pageSlug || getRequestedPageSlug(),
  };
}

function postToParent(message) {
  if (!window.parent) return;
  window.parent.postMessage(message, window.location.origin);
}

function isExpectedSource(event) {
  return event.origin === window.location.origin && event.source === window.parent;
}

function createBridgeError(message) {
  const err = new Error(message || 'Invalid preview snapshot.');
  err.name = 'BuilderPreviewBridgeError';
  return err;
}

function getSnapshotExpectedIdentity(snapshot, overrides = {}) {
  return {
    previewSession: overrides.previewSession || getPreviewSessionToken(),
    snapshotVersion: snapshot?.snapshotVersion || BUILDER_PREVIEW_SNAPSHOT_VERSION,
    seriesId: snapshot?.seriesId || overrides.seriesId || getActiveSeriesId(),
    pageId: snapshot?.pageId || overrides.pageId || getPreviewPageId(),
    pageSlug: snapshot?.pageSlug || overrides.pageSlug || getRequestedPageSlug(),
  };
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function parseColumnIndex(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function getTargetKey(target) {
  return target?.key || '';
}

function escapeCssIdent(value) {
  const raw = String(value ?? '');
  if (window.CSS && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(raw);
  }
  return raw.replace(/["\\]/g, '\\$&');
}

function getTargetPageId(snapshot) {
  return normalizeText(snapshot?.pageId || snapshot?.page?.id || getPreviewPageId());
}

function getNearestSectionId(element) {
  return normalizeText(element?.closest?.('[data-builder-section-id]')?.dataset.builderSectionId);
}

function getNearestColumnIndex(element) {
  const column = element?.closest?.('[data-builder-column-index]');
  return parseColumnIndex(column?.dataset.builderColumnIndex);
}

function buildTargetRef(element, snapshot = activePreviewContext?.snapshot) {
  if (!element || typeof element.matches !== 'function') return null;
  const pageId = getTargetPageId(snapshot);
  if (!pageId) return null;

  if (element.matches('[data-builder-module-id]')) {
    const moduleId = normalizeText(element.dataset.builderModuleId);
    if (!moduleId) return null;
    const moduleType = normalizeText(element.dataset.builderModuleType);
    const sectionId = getNearestSectionId(element);
    const columnIndex = getNearestColumnIndex(element);
    return {
      kind: BUILDER_PREVIEW_TARGET_KINDS.MODULE,
      key: `module:${moduleId}`,
      pageId,
      ...(sectionId ? { sectionId } : {}),
      ...(columnIndex !== null ? { columnIndex } : {}),
      moduleId,
      ...(moduleType ? { moduleType } : {}),
    };
  }

  if (element.matches('[data-builder-surface="page-header"]')) {
    return {
      kind: BUILDER_PREVIEW_TARGET_KINDS.HEADER,
      key: `header:${pageId}`,
      pageId,
      surface: 'page-header',
    };
  }

  if (element.matches('[data-builder-surface="page-end"]')) {
    return {
      kind: BUILDER_PREVIEW_TARGET_KINDS.PAGE,
      key: `page-end:${pageId}`,
      pageId,
      surface: 'page-end',
    };
  }

  if (element.matches('[data-builder-column-index]')) {
    const sectionId = getNearestSectionId(element);
    const columnIndex = parseColumnIndex(element.dataset.builderColumnIndex);
    if (!sectionId || columnIndex === null) return null;
    return {
      kind: BUILDER_PREVIEW_TARGET_KINDS.COLUMN,
      key: `column:${sectionId}:${columnIndex}`,
      pageId,
      sectionId,
      columnIndex,
    };
  }

  if (element.matches('[data-builder-section-id]')) {
    const sectionId = normalizeText(element.dataset.builderSectionId);
    if (!sectionId) return null;
    return {
      kind: BUILDER_PREVIEW_TARGET_KINDS.SECTION,
      key: `section:${sectionId}`,
      pageId,
      sectionId,
    };
  }

  if (element.matches('[data-builder-page-id]')) {
    return {
      kind: BUILDER_PREVIEW_TARGET_KINDS.PAGE,
      key: `page:${pageId}`,
      pageId,
    };
  }

  return null;
}

function getTargetLabel(target) {
  if (!target) return '';
  if (target.kind === BUILDER_PREVIEW_TARGET_KINDS.MODULE) {
    return target.moduleType ? `${target.moduleType} module` : 'Module';
  }
  if (target.kind === BUILDER_PREVIEW_TARGET_KINDS.HEADER) return 'Page header';
  if (target.kind === BUILDER_PREVIEW_TARGET_KINDS.PAGE && target.surface === 'page-end') {
    return 'Page end';
  }
  if (target.kind === BUILDER_PREVIEW_TARGET_KINDS.SECTION) return 'Section';
  if (target.kind === BUILDER_PREVIEW_TARGET_KINDS.COLUMN) {
    return `Column ${(target.columnIndex ?? 0) + 1}`;
  }
  return 'Page';
}

function getViewportSize() {
  const docEl = document.documentElement;
  return {
    width: window.innerWidth || docEl?.clientWidth || 0,
    height: window.innerHeight || docEl?.clientHeight || 0,
  };
}

function roundRectValue(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function measureTarget(element) {
  if (!element || typeof element.getBoundingClientRect !== 'function') return null;
  const rect = element.getBoundingClientRect();
  const viewport = getViewportSize();
  const measured = {
    top: roundRectValue(rect.top),
    left: roundRectValue(rect.left),
    right: roundRectValue(rect.right),
    bottom: roundRectValue(rect.bottom),
    width: roundRectValue(rect.width),
    height: roundRectValue(rect.height),
  };
  const visible =
    measured.width > 0 &&
    measured.height > 0 &&
    measured.bottom >= 0 &&
    measured.right >= 0 &&
    measured.top <= viewport.height &&
    measured.left <= viewport.width;
  return { rect: measured, visible };
}

function findTargetFromEventTarget(rawTarget, snapshot = activePreviewContext?.snapshot) {
  let element =
    rawTarget?.nodeType === Node.TEXT_NODE ? rawTarget.parentElement : rawTarget?.closest?.('*');
  let fallback = null;
  while (element && element !== document.documentElement) {
    if (element.matches?.('[data-builder-surface="page-end"]')) return null;
    if (
      element.matches?.('[data-builder-module-id]') ||
      element.matches?.('[data-builder-surface="page-header"]')
    ) {
      return buildTargetRef(element, snapshot);
    }
    if (!fallback && element.matches?.(TARGET_SELECTOR)) {
      fallback = element;
    }
    element = element.parentElement;
  }
  return fallback ? buildTargetRef(fallback, snapshot) : null;
}

function collectBuilderTargetElements() {
  const elements = [];
  const pageElement =
    document.querySelector('.pb-page[data-builder-page-id]') ||
    document.querySelector('.viewerWrap[data-builder-page-id]') ||
    (document.body?.matches?.('[data-builder-page-id]') ? document.body : null);
  if (pageElement) elements.push(pageElement);

  document
    .querySelectorAll(
      [
        '[data-builder-surface="page-header"]',
        '[data-builder-surface="page-end"]',
        '[data-builder-section-id]',
        '[data-builder-column-index]',
        '[data-builder-module-id]',
      ].join(',')
    )
    .forEach((element) => elements.push(element));
  return elements;
}

export function collectPreviewTargets(snapshot = activePreviewContext?.snapshot) {
  if (!snapshot?.options || snapshot.options.builderEditing !== true) return [];
  const targetsByKey = new Map();
  collectBuilderTargetElements().forEach((element) => {
    const target = buildTargetRef(element, snapshot);
    const key = getTargetKey(target);
    if (!target || !key || targetsByKey.has(key)) return;
    const measurement = measureTarget(element);
    if (!measurement) return;
    targetsByKey.set(key, {
      target,
      rect: measurement.rect,
      visible: measurement.visible,
      order: targetsByKey.size,
      label: getTargetLabel(target),
    });
  });
  return Array.from(targetsByKey.values());
}

function findElementForTarget(target) {
  if (!target) return null;
  if (target.kind === BUILDER_PREVIEW_TARGET_KINDS.MODULE && target.moduleId) {
    return document.querySelector(`[data-builder-module-id="${escapeCssIdent(target.moduleId)}"]`);
  }
  if (target.kind === BUILDER_PREVIEW_TARGET_KINDS.HEADER) {
    return document.querySelector('[data-builder-surface="page-header"]');
  }
  if (target.kind === BUILDER_PREVIEW_TARGET_KINDS.PAGE && target.surface === 'page-end') {
    return document.querySelector('[data-builder-surface="page-end"]');
  }
  if (target.kind === BUILDER_PREVIEW_TARGET_KINDS.COLUMN && target.sectionId) {
    const sectionSelector = `[data-builder-section-id="${escapeCssIdent(target.sectionId)}"]`;
    const columnSelector = `[data-builder-column-index="${escapeCssIdent(String(target.columnIndex))}"]`;
    return document.querySelector(`${sectionSelector} ${columnSelector}`);
  }
  if (target.kind === BUILDER_PREVIEW_TARGET_KINDS.SECTION && target.sectionId) {
    return document.querySelector(
      `[data-builder-section-id="${escapeCssIdent(target.sectionId)}"]`
    );
  }
  if (target.kind === BUILDER_PREVIEW_TARGET_KINDS.PAGE) {
    return (
      document.querySelector('.pb-page[data-builder-page-id]') ||
      document.querySelector('.viewerWrap[data-builder-page-id]') ||
      document.body
    );
  }
  return null;
}

function isInlineEditableTextTarget(target) {
  return (
    target?.kind === BUILDER_PREVIEW_TARGET_KINDS.MODULE &&
    target.moduleType === 'text' &&
    !!target.moduleId
  );
}

function findEditableElementForTarget(target, field = 'content') {
  if (!isInlineEditableTextTarget(target) || field !== 'content') return null;
  const moduleElement = findElementForTarget(target);
  return moduleElement?.querySelector?.('[data-builder-edit-field="content"]') || null;
}

function requestFrame(callback) {
  if (typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(callback);
  }
  return window.setTimeout(callback, 16);
}

function cancelFrame(handle) {
  if (!handle) return;
  if (typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(handle);
    return;
  }
  window.clearTimeout(handle);
}

export function setPreviewMetricsContext(snapshot, overrides = {}) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  activePreviewContext = {
    expected: getSnapshotExpectedIdentity(snapshot, overrides),
    snapshot,
  };
  return activePreviewContext;
}

function resolveSnapshotViewport(snapshot) {
  const rawViewport = snapshot?.options?.viewport || {};
  if (isPreviewViewportId(rawViewport.id)) {
    return { ...getPreviewViewport(rawViewport.id) };
  }
  return {
    id: String(rawViewport.id || 'desktop'),
    label: String(rawViewport.label || 'Desktop'),
    width: Number(rawViewport.width) || window.innerWidth || 0,
    height: Number(rawViewport.height) || window.innerHeight || 0,
  };
}

function collectBranchFlags() {
  return Object.entries(PREVIEW_MEDIA_QUERIES).reduce((acc, [key, config]) => {
    acc[key] =
      typeof window.matchMedia === 'function' ? !!window.matchMedia(config.query).matches : false;
    return acc;
  }, {});
}

function isPreviewTwoPageMode() {
  const aspectRatio = window.innerWidth / window.innerHeight;
  const hasMinWidth = window.innerWidth >= CONFIG.TWO_PAGE_BREAKPOINT;
  const isWideEnough = aspectRatio > CONFIG.TWO_PAGE_ASPECT_RATIO;
  return hasMinWidth && isWideEnough;
}

function getElementOverflowOffenders(viewportWidth) {
  const offenders = [];
  const tolerance = 1;
  OVERFLOW_SELECTORS.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node, index) => {
      if (typeof node.getBoundingClientRect !== 'function') return;
      const rect = node.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const leftOverflow = rect.left < -tolerance;
      const rightOverflow = rect.right > viewportWidth + tolerance;
      if (!leftOverflow && !rightOverflow) return;
      offenders.push({
        selector,
        index,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        viewportWidth,
        side: leftOverflow && rightOverflow ? 'both' : leftOverflow ? 'left' : 'right',
      });
    });
  });
  return offenders;
}

function collectOverflowMetrics(viewportWidth) {
  const docEl = document.documentElement;
  const body = document.body;
  const rootScrollWidth = Math.max(docEl?.scrollWidth || 0, body?.scrollWidth || 0);
  const rootClientWidth = Math.max(docEl?.clientWidth || 0, body?.clientWidth || 0, viewportWidth);
  const rootHasOverflow = rootScrollWidth > rootClientWidth + 1;
  const offenders = getElementOverflowOffenders(viewportWidth);
  return {
    hasOverflow: rootHasOverflow || offenders.length > 0,
    rootHasOverflow,
    offenders,
  };
}

export function collectPreviewMetrics(snapshot = activePreviewContext?.snapshot) {
  if (!snapshot) return null;
  const viewport = resolveSnapshotViewport(snapshot);
  const innerWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
  const innerHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
  return {
    viewport,
    innerWidth,
    innerHeight,
    pageSlug: snapshot.pageSlug || '',
    snapshotVersion: snapshot.snapshotVersion,
    twoPageMode: isPreviewTwoPageMode(),
    branchFlags: collectBranchFlags(),
    overflow: collectOverflowMetrics(innerWidth),
  };
}

export function emitPreviewMetrics(reason = 'manual') {
  if (!activePreviewContext) return null;
  const metrics = collectPreviewMetrics(activePreviewContext.snapshot);
  if (!metrics) return null;
  metrics.reason = reason;
  postToParent(buildPreviewMetricsMessage(metrics, activePreviewContext.expected));
  return metrics;
}

export function stopPreviewTargetBridge() {
  if (activeTargetBridgeCleanup) {
    activeTargetBridgeCleanup();
    activeTargetBridgeCleanup = null;
  }
}

export function startPreviewTargetBridge(
  snapshot = activePreviewContext?.snapshot,
  overrides = {}
) {
  stopPreviewTargetBridge();
  if (!snapshot || snapshot.options?.builderEditing !== true) {
    return null;
  }

  setPreviewMetricsContext(snapshot, overrides);
  const expected = getSnapshotExpectedIdentity(snapshot, overrides);
  let hoveredTargetKey = '';
  let scheduledFrame = null;
  let observer = null;
  let activeInlineEdit = null;
  let inlineChangeFrame = null;
  let inlineToolbar = null;

  const postTargetMessage = (type, payload = {}) => {
    postToParent(buildPreviewTargetMessage(type, payload, expected));
  };

  const postInlineEditMessage = (type, payload = {}) => {
    postToParent(
      buildPreviewInlineEditMessage(
        type,
        {
          sequence: targetSequence,
          field: 'content',
          ...payload,
        },
        expected
      )
    );
  };

  const emitTargets = (reason = 'manual') => {
    scheduledFrame = null;
    const sequence = ++targetSequence;
    const targets = collectPreviewTargets(snapshot);
    postTargetMessage(BUILDER_PREVIEW_MESSAGE_TYPES.TARGETS, {
      sequence,
      targets,
      reason,
    });
    return targets;
  };

  const scheduleTargets = (reason = 'manual') => {
    if (scheduledFrame) return;
    scheduledFrame = requestFrame(() => emitTargets(reason));
  };

  const emitHover = (target, reason = 'pointer') => {
    postTargetMessage(BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_HOVER, {
      sequence: targetSequence,
      target,
      reason,
    });
  };

  const blockInteractiveEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };

  const sanitizeInlineHtml = (value = '') => sanitizeBuilderHtml(String(value || ''), 'text');

  const getInlineEditValue = () =>
    activeInlineEdit?.element ? sanitizeInlineHtml(activeInlineEdit.element.innerHTML || '') : '';

  const replaceElementHtml = (element, value = undefined) => {
    if (!element) return '';
    const safeHtml = sanitizeInlineHtml(value === undefined ? element.innerHTML || '' : value);
    if (String(element.innerHTML || '') !== safeHtml) {
      element.innerHTML = safeHtml;
    }
    return safeHtml;
  };

  const sanitizeActiveInlineElement = () =>
    activeInlineEdit?.element ? replaceElementHtml(activeInlineEdit.element) : '';

  const insertInlineHtml = (html = '') => {
    if (!activeInlineEdit?.element) return;
    const safeHtml = sanitizeInlineHtml(html);
    try {
      if (document.execCommand?.('insertHTML', false, safeHtml)) return;
    } catch {
      // Fall back to direct range insertion below.
    }
    const template = document.createElement('template');
    template.innerHTML = safeHtml;
    const fragment = template.content;
    const selection = window.getSelection?.();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(fragment);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    activeInlineEdit.element.appendChild(fragment);
  };

  const removeInlineToolbar = () => {
    inlineToolbar?.remove?.();
    inlineToolbar = null;
  };

  const scheduleInlineChange = (reason = 'input') => {
    if (!activeInlineEdit || inlineChangeFrame) return;
    inlineChangeFrame = requestFrame(() => {
      inlineChangeFrame = null;
      if (!activeInlineEdit) return;
      const value = sanitizeActiveInlineElement();
      postInlineEditMessage(BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE, {
        target: activeInlineEdit.target,
        value,
        reason,
      });
    });
  };

  const stopInlineEdit = (reason = 'commit', mode = 'commit', notify = true) => {
    if (!activeInlineEdit) return;
    const edit = activeInlineEdit;
    if (inlineChangeFrame) {
      cancelFrame(inlineChangeFrame);
      inlineChangeFrame = null;
    }
    const value = replaceElementHtml(edit.element);
    if (notify && mode === 'cancel') {
      postInlineEditMessage(BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE, {
        target: edit.target,
        value,
        reason,
      });
    }
    edit.element.removeEventListener('input', edit.handleInput);
    edit.element.removeEventListener('paste', edit.handlePaste);
    edit.element.removeEventListener('blur', edit.handleBlur);
    edit.element.removeAttribute('contenteditable');
    edit.element.removeAttribute('role');
    edit.element.removeAttribute('aria-label');
    edit.element.classList.remove('builder-inline-editing');
    removeInlineToolbar();
    activeInlineEdit = null;
    if (notify) {
      postInlineEditMessage(
        mode === 'cancel'
          ? BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CANCEL
          : BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_COMMIT,
        {
          target: edit.target,
          value,
          reason,
        }
      );
    }
    scheduleTargets(mode === 'cancel' ? 'inline-edit-cancel' : 'inline-edit-commit');
  };

  const applyInlineFormat = (command, value = null) => {
    if (!activeInlineEdit) return;
    activeInlineEdit.element.focus();
    try {
      document.execCommand?.(command, false, value);
    } catch {
      return;
    }
    sanitizeActiveInlineElement();
    scheduleInlineChange(`format-${command}`);
  };

  const promptInlineLink = () => {
    const url = window.prompt?.('Link URL') || '';
    if (!url.trim()) return;
    const safeUrl = sanitizeHref(url);
    if (!safeUrl) return;
    applyInlineFormat('createLink', safeUrl);
  };

  const createInlineToolbar = () => {
    removeInlineToolbar();
    inlineToolbar = document.createElement('div');
    inlineToolbar.className = 'builder-inline-edit-toolbar';
    inlineToolbar.setAttribute('aria-label', 'Text editing tools');
    inlineToolbar.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'top:10px',
      'left:10px',
      'display:flex',
      'gap:4px',
      'padding:6px',
      'background:#111827',
      'border:1px solid rgba(255,255,255,0.18)',
      'border-radius:6px',
      'box-shadow:0 8px 24px rgba(0,0,0,0.28)',
    ].join(';');
    const buttons = [
      ['B', 'Bold', () => applyInlineFormat('bold')],
      ['I', 'Italic', () => applyInlineFormat('italic')],
      ['Link', 'Link', promptInlineLink],
      [
        'Clear',
        'Clear formatting',
        () => {
          applyInlineFormat('removeFormat');
          applyInlineFormat('unlink');
        },
      ],
      ['Done', 'Done', () => stopInlineEdit('toolbar-done', 'commit')],
      ['Cancel', 'Cancel', () => stopInlineEdit('toolbar-cancel', 'cancel')],
    ];
    buttons.forEach(([label, title, action]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.title = title;
      button.style.cssText =
        'font:600 12px/1 system-ui,sans-serif;color:#fff;background:#1f2937;border:1px solid rgba(255,255,255,0.18);border-radius:4px;padding:5px 7px;cursor:pointer;';
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        action();
      });
      inlineToolbar.appendChild(button);
    });
    document.body?.appendChild(inlineToolbar);
  };

  const startInlineEdit = (target, field = 'content', reason = 'start') => {
    if (!isInlineEditableTextTarget(target) || field !== 'content') return false;
    const element = findEditableElementForTarget(target, field);
    if (!element) return false;
    if (activeInlineEdit?.target?.key === target.key) {
      activeInlineEdit.element.focus();
      return true;
    }
    stopInlineEdit('switch-inline-edit', 'commit');

    const handleInput = () => {
      sanitizeActiveInlineElement();
      scheduleInlineChange('input');
    };
    const handlePaste = (event) => {
      const html =
        event.clipboardData?.getData?.('text/html') ||
        event.clipboardData?.getData?.('text/plain') ||
        '';
      if (!html) {
        requestFrame(() => {
          sanitizeActiveInlineElement();
          scheduleInlineChange('paste');
        });
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      insertInlineHtml(html);
      sanitizeActiveInlineElement();
      scheduleInlineChange('paste');
    };
    const handleBlur = () => {
      window.setTimeout(() => {
        if (!activeInlineEdit || document.activeElement === inlineToolbar) return;
        stopInlineEdit('blur', 'commit');
      }, 0);
    };

    activeInlineEdit = {
      target,
      field,
      element,
      initialValue: replaceElementHtml(element),
      handleInput,
      handlePaste,
      handleBlur,
    };
    element.setAttribute('contenteditable', 'true');
    element.setAttribute('role', 'textbox');
    element.setAttribute('aria-label', 'Edit text content');
    element.classList.add('builder-inline-editing');
    element.addEventListener('input', handleInput);
    element.addEventListener('paste', handlePaste);
    element.addEventListener('blur', handleBlur);
    createInlineToolbar();
    element.focus();
    postInlineEditMessage(BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_START, {
      target,
      field,
      value: getInlineEditValue(),
      reason,
    });
    return true;
  };

  const handleKeyDown = (event) => {
    if (activeInlineEdit) {
      if (event.key === 'Escape') {
        blockInteractiveEvent(event);
        stopInlineEdit('escape', 'cancel');
      }
      return;
    }
    if (BUILDER_EDITING_BLOCKED_KEYS.has(event.key)) {
      blockInteractiveEvent(event);
    }
  };

  const handlePointerMove = (event) => {
    if (activeInlineEdit) return;
    const target = findTargetFromEventTarget(event.target, snapshot);
    const key = getTargetKey(target);
    if (key === hoveredTargetKey) return;
    hoveredTargetKey = key;
    emitHover(target || null);
  };

  const handleClick = (event) => {
    if (activeInlineEdit && inlineToolbar?.contains?.(event.target)) {
      return;
    }
    if (activeInlineEdit?.element?.contains?.(event.target)) {
      const anchor = event.target?.closest?.('a[href]');
      if (anchor && activeInlineEdit.element.contains(anchor)) {
        event.preventDefault();
      }
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      return;
    }
    if (activeInlineEdit) {
      stopInlineEdit('outside-click', 'commit');
    }
    const target = findTargetFromEventTarget(event.target, snapshot);
    blockInteractiveEvent(event);
    if (!target) return;
    postTargetMessage(BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_SELECT, {
      sequence: targetSequence,
      target,
      reason: 'click',
    });
  };

  const handleDoubleClick = (event) => {
    const target = findTargetFromEventTarget(event.target, snapshot);
    if (!isInlineEditableTextTarget(target)) return;
    const editElement = findEditableElementForTarget(target);
    if (!editElement?.contains?.(event.target)) return;
    blockInteractiveEvent(event);
    startInlineEdit(target, 'content', 'double-click');
  };

  const handleActionMessage = (event) => {
    if (!isExpectedSource(event)) return;
    const message = event.data;
    if (
      !message ||
      (message.type !== BUILDER_PREVIEW_MESSAGE_TYPES.TARGET_ACTION &&
        message.type !== BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_START &&
        message.type !== BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE &&
        message.type !== BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_COMMIT &&
        message.type !== BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CANCEL)
    ) {
      return;
    }
    const validation = validatePreviewEnvelope(message, expected);
    if (!validation.valid) return;

    if (message.type === BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_START) {
      startInlineEdit(message.target, message.field, message.reason || 'toolbar');
      return;
    }
    if (message.type === BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CHANGE) {
      if (
        activeInlineEdit &&
        message.field === activeInlineEdit.field &&
        message.target?.key === activeInlineEdit.target?.key
      ) {
        replaceElementHtml(activeInlineEdit.element, message.value);
        scheduleTargets(message.reason || 'inline-edit-sync');
      }
      return;
    }
    if (message.type === BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_COMMIT) {
      stopInlineEdit(message.reason || 'admin-commit', 'commit', false);
      return;
    }
    if (message.type === BUILDER_PREVIEW_MESSAGE_TYPES.INLINE_EDIT_CANCEL) {
      stopInlineEdit(message.reason || 'admin-cancel', 'cancel', false);
      return;
    }

    if (message.action === BUILDER_PREVIEW_TARGET_ACTIONS.REFRESH_TARGETS) {
      scheduleTargets('target-action');
      return;
    }
    if (message.action === BUILDER_PREVIEW_TARGET_ACTIONS.CLEAR_HOVER) {
      hoveredTargetKey = '';
      emitHover(null, 'target-action');
      return;
    }
    if (message.action === BUILDER_PREVIEW_TARGET_ACTIONS.SCROLL_INTO_VIEW) {
      const element = findElementForTarget(message.target);
      element?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      scheduleTargets('scroll-into-view');
    }
  };

  const handleLoadOrScroll = () => scheduleTargets('layout-change');
  const handleResize = () => scheduleTargets('resize');

  document.addEventListener('pointermove', handlePointerMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('dblclick', handleDoubleClick, true);
  document.addEventListener('submit', blockInteractiveEvent, true);
  document.addEventListener('change', blockInteractiveEvent, true);
  document.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('scroll', handleLoadOrScroll, true);
  window.addEventListener('resize', handleResize);
  window.addEventListener('message', handleActionMessage);
  document.addEventListener('load', handleLoadOrScroll, true);

  if (typeof MutationObserver !== 'undefined' && document.body) {
    observer = new MutationObserver(() => scheduleTargets('mutation'));
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'data-builder-page-id',
        'data-builder-section-id',
        'data-builder-column-index',
        'data-builder-module-id',
        'data-builder-module-type',
        'data-builder-surface',
        'class',
        'style',
      ],
    });
  }

  scheduleTargets('start');

  activeTargetBridgeCleanup = () => {
    if (scheduledFrame) {
      cancelFrame(scheduledFrame);
      scheduledFrame = null;
    }
    stopInlineEdit('bridge-cleanup', 'cancel', false);
    observer?.disconnect();
    document.removeEventListener('pointermove', handlePointerMove, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('dblclick', handleDoubleClick, true);
    document.removeEventListener('submit', blockInteractiveEvent, true);
    document.removeEventListener('change', blockInteractiveEvent, true);
    document.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('scroll', handleLoadOrScroll, true);
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('message', handleActionMessage);
    document.removeEventListener('load', handleLoadOrScroll, true);
  };

  return activeTargetBridgeCleanup;
}

export function validatePreviewMessageEvent(event, expected = getExpectedIdentity()) {
  if (!isExpectedSource(event)) {
    return { valid: false, reason: 'Unexpected preview message source.' };
  }
  return validatePreviewEnvelope(event.data, expected);
}

export function requestPreviewSnapshot(options = {}) {
  const expected = getExpectedIdentity(options);
  const timeoutMs =
    typeof options.timeoutMs === 'number' && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let timeoutId = null;

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const sendError = (reason) => {
      postToParent(
        buildPreviewControlMessage(BUILDER_PREVIEW_MESSAGE_TYPES.ERROR, {
          ...expected,
          error: reason,
        })
      );
    };

    const handleMessage = (event) => {
      if (!isExpectedSource(event)) return;
      const message = event.data;
      if (!message || message.type !== BUILDER_PREVIEW_MESSAGE_TYPES.SNAPSHOT) return;

      const validation = validatePreviewEnvelope(message, expected);
      if (!validation.valid) {
        cleanup();
        sendError(validation.reason);
        reject(createBridgeError(validation.reason));
        return;
      }

      cleanup();
      setPreviewMetricsContext(message.snapshot, expected);
      postToParent(buildPreviewControlMessage(BUILDER_PREVIEW_MESSAGE_TYPES.ACK, expected));
      resolve({
        source: 'builder',
        page: message.snapshot.page,
        previewMode: true,
        builderEditing: message.snapshot.options?.builderEditing === true,
        deviceId: message.snapshot.options?.deviceId,
        snapshot: message.snapshot,
      });
    };

    window.addEventListener('message', handleMessage);
    timeoutId = window.setTimeout(() => {
      cleanup();
      const reason = 'Timed out waiting for preview snapshot.';
      sendError(reason);
      reject(createBridgeError(reason));
    }, timeoutMs);

    postToParent(
      buildPreviewControlMessage(BUILDER_PREVIEW_MESSAGE_TYPES.REQUEST_SNAPSHOT, expected)
    );
  });
}

export function subscribePreviewSnapshots(onSnapshot, options = {}) {
  if (activeSnapshotSubscriptionCleanup) {
    activeSnapshotSubscriptionCleanup();
    activeSnapshotSubscriptionCleanup = null;
  }

  const expected = getExpectedIdentity(options);

  const sendError = (reason) => {
    postToParent(
      buildPreviewControlMessage(BUILDER_PREVIEW_MESSAGE_TYPES.ERROR, {
        ...expected,
        error: reason,
      })
    );
  };

  const handleMessage = (event) => {
    if (!isExpectedSource(event)) return;
    const message = event.data;
    if (!message || message.type !== BUILDER_PREVIEW_MESSAGE_TYPES.SNAPSHOT) return;

    const validation = validatePreviewEnvelope(message, expected);
    if (!validation.valid) {
      sendError(validation.reason);
      return;
    }

    setPreviewMetricsContext(message.snapshot, expected);
    postToParent(buildPreviewControlMessage(BUILDER_PREVIEW_MESSAGE_TYPES.ACK, expected));
    try {
      onSnapshot?.({
        source: 'builder',
        page: message.snapshot.page,
        previewMode: true,
        builderEditing: message.snapshot.options?.builderEditing === true,
        deviceId: message.snapshot.options?.deviceId,
        snapshot: message.snapshot,
      });
    } catch (err) {
      sendError(err?.message || 'Failed to apply preview snapshot.');
    }
  };

  window.addEventListener('message', handleMessage);
  activeSnapshotSubscriptionCleanup = () => {
    window.removeEventListener('message', handleMessage);
  };
  return activeSnapshotSubscriptionCleanup;
}

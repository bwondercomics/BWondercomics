import { escapeAttr, escapeHtml } from '../../shared/page-builder/helpers.js';
import { BUILDER_COMMANDS } from './commands.js';

const SNAPSHOT_ACTION_LABELS = Object.freeze({
  page_created: 'Creation baseline',
  page_updated: 'Before page update',
  page_deleted: 'Before page deletion',
  page_reordered: 'Before page reorder',
  bindings_updated: 'Before binding update',
  section_added: 'Before section addition',
  section_updated: 'Before section update',
  section_deleted: 'Before section deletion',
  sections_reordered: 'Before section reorder',
  module_added: 'Before module addition',
  module_updated: 'Before module update',
  module_deleted: 'Before module deletion',
  module_moved: 'Before module move',
  modules_reordered: 'Before module reorder',
  module_placements_saved: 'Before module placement save',
  pre_restore: 'Before snapshot restore',
});

export function getSnapshotActionLabel(action) {
  return SNAPSHOT_ACTION_LABELS[action] || 'Saved recovery point';
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function timeHtml(value) {
  return `<time datetime="${escapeAttr(value || '')}">${escapeHtml(formatTimestamp(value))}</time>`;
}

function validateSnapshotDetail(detail, expected = {}) {
  const payload = detail?.payload;
  const page = payload?.page;
  if (
    !detail?.id ||
    detail.id !== expected.snapshotId ||
    (expected.pageId && detail.pageId !== expected.pageId) ||
    payload?.snapshotVersion !== 1 ||
    !page ||
    page.id !== detail.pageId ||
    !Array.isArray(page.sections) ||
    !Array.isArray(payload.bindings) ||
    !Object.prototype.hasOwnProperty.call(SNAPSHOT_ACTION_LABELS, detail.action)
  ) {
    throw new Error('The selected recovery point returned an invalid detail contract.');
  }
  if (page.sections.some((section) => !Array.isArray(section?.modules))) {
    throw new Error('The selected recovery point contains invalid section details.');
  }
  if (detail.scope !== page.scope || detail.slug !== page.slug) {
    throw new Error('The selected recovery point metadata does not match its saved page.');
  }
  if ((detail.seriesId || null) !== (page.seriesId || null)) {
    throw new Error('The selected recovery point series does not match its saved page.');
  }

  return {
    detail,
    page,
    sectionCount: page.sections.length,
    moduleCount: page.sections.reduce((count, section) => count + section.modules.length, 0),
  };
}

function getFocusable(dialog) {
  return Array.from(
    dialog?.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) || []
  ).filter((item) => !item.hidden && item.getAttribute('aria-hidden') !== 'true');
}

export function createHistoryPanel({ el, getState, actions, deps }) {
  let view = 'history';
  let invoker = null;
  let requestController = null;
  let requestGeneration = 0;
  let restoring = false;
  let restoreGeneration = 0;
  let selected = null;

  function setStatus(message, type = 'success') {
    if (!el.pbRecoveryStatus) return;
    el.pbRecoveryStatus.textContent = message || '';
    el.pbRecoveryStatus.dataset.status = type;
  }

  function setDialogOpen(open) {
    const dialog = el.pbHistoryDialog;
    if (!dialog) return;
    if (open) {
      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
      return;
    }
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }

  function setDialogSemantics(mode = 'history') {
    const dialog = el.pbHistoryDialog;
    if (!dialog) return;
    if (mode === 'confirmation') {
      dialog.setAttribute('aria-labelledby', 'pbHistoryConfirmTitle');
      dialog.setAttribute(
        'aria-describedby',
        'pbHistoryConfirmConsequence pbHistoryConfirmDescription'
      );
      return;
    }
    dialog.setAttribute('aria-labelledby', 'pbHistoryDialogTitle');
    dialog.setAttribute('aria-describedby', 'pbHistoryDialogDescription');
  }

  function renderDialogBody(html, { busy = false, focusSelector = '' } = {}) {
    if (!el.pbHistoryDialogBody) return;
    el.pbHistoryDialog?.setAttribute('aria-busy', busy ? 'true' : 'false');
    el.pbHistoryDialogBody.innerHTML = html;
    if (focusSelector) {
      el.pbHistoryDialogBody.querySelector(focusSelector)?.focus();
    }
  }

  function abortRequest() {
    requestGeneration += 1;
    requestController?.abort();
    requestController = null;
  }

  function close({ focusPageId = '', force = false, restoreFocus = true } = {}) {
    if (restoring && !force) return false;
    if (force) {
      restoreGeneration += 1;
      restoring = false;
      if (el.pbHistoryDialogClose) el.pbHistoryDialogClose.disabled = false;
    }
    abortRequest();
    setDialogOpen(false);
    setDialogSemantics();
    el.pbHistoryDialog?.setAttribute('aria-busy', 'false');
    if (focusPageId) {
      const focusRecoveredPage = () =>
        Array.from(document.querySelectorAll('.pb-page-item'))
          .find((item) => item.dataset.pageId === focusPageId)
          ?.focus();
      focusRecoveredPage();
      // Native dialogs may restore their invoker after close(). Re-assert the logical
      // destination once that browser-managed focus step has completed.
      window.setTimeout(focusRecoveredPage, 0);
    } else if (restoreFocus && invoker?.isConnected) {
      invoker.focus();
    }
    selected = null;
    return true;
  }

  function renderState(
    message,
    { retry = false, error = false, onRetry = null, busy = false } = {}
  ) {
    setDialogSemantics();
    renderDialogBody(
      `
      <div class="pb-history-state" ${error ? 'role="alert"' : 'role="status"'} tabindex="-1" data-history-state-focus>
        <p>${escapeHtml(message)}</p>
        ${retry ? '<button type="button" data-history-retry>Retry</button>' : ''}
      </div>
    `,
      {
        busy,
        focusSelector: retry ? '[data-history-retry]' : '[data-history-state-focus]',
      }
    );
    el.pbHistoryDialogBody
      .querySelector('[data-history-retry]')
      ?.addEventListener('click', () => (onRetry || loadList)());
  }

  function renderList(items, { focusSnapshotId = '' } = {}) {
    if (!el.pbHistoryDialogBody) return;
    if (!items.length) {
      renderState(
        view === 'deleted'
          ? 'No retained deleted pages exist in this scope.'
          : 'No saved history exists for this page yet.'
      );
      return;
    }

    setDialogSemantics();
    renderDialogBody(`<div class="pb-history-list">
      ${items
        .map((item) => {
          const isDeleted = view === 'deleted';
          const snapshotId = isDeleted ? item.latestSnapshotId : item.id;
          const timestamp = isDeleted ? item.latestSnapshotAt : item.createdAt;
          const title = isDeleted ? item.title || item.slug : getSnapshotActionLabel(item.action);
          const meta = isDeleted
            ? `${item.slug || 'page'} · ${item.scope === 'global' ? 'Global page' : 'Series page'}`
            : `${escapeHtml(item.createdByDisplayName || 'System or former administrator')} · ${timeHtml(timestamp)}`;
          return `
            <article class="pb-history-item">
              <div class="pb-history-item-copy">
                <strong>${escapeHtml(title)}</strong>
                <span class="pb-history-meta">${isDeleted ? escapeHtml(meta) + ` · ${timeHtml(timestamp)}` : meta}</span>
              </div>
              <div class="pb-history-actions">
                <button type="button" data-snapshot-id="${escapeAttr(snapshotId)}" data-page-id="${escapeAttr(item.pageId)}">
                  ${isDeleted ? 'Review recovery' : 'Inspect'}
                </button>
              </div>
            </article>
          `;
        })
        .join('')}
    </div>`);

    el.pbHistoryDialogBody.querySelectorAll('[data-snapshot-id]').forEach((button) => {
      button.addEventListener('click', () =>
        loadDetail({
          snapshotId: button.dataset.snapshotId,
          pageId: button.dataset.pageId,
          deleted: view === 'deleted',
        })
      );
    });
    const focusTarget = focusSnapshotId
      ? Array.from(el.pbHistoryDialogBody.querySelectorAll('[data-snapshot-id]')).find(
          (button) => button.dataset.snapshotId === focusSnapshotId
        )
      : el.pbHistoryDialogBody.querySelector('[data-snapshot-id]');
    focusTarget?.focus();
  }

  async function loadList({ focusSnapshotId = '' } = {}) {
    abortRequest();
    const generation = requestGeneration;
    requestController = new AbortController();
    renderState(view === 'deleted' ? 'Loading deleted pages…' : 'Loading page history…', {
      busy: true,
    });
    try {
      const state = getState();
      const items =
        view === 'deleted'
          ? await deps.fetchDeletedPageSnapshots({
              scope: state.activePageScope,
              seriesId: state.activePageScope === 'series' ? actions.getSeriesId() : null,
              signal: requestController.signal,
            })
          : await deps.fetchPageSnapshots(state.currentPage.id, {
              signal: requestController.signal,
            });
      if (generation !== requestGeneration) return;
      renderList(items, { focusSnapshotId });
    } catch (error) {
      if (error?.name === 'AbortError' || generation !== requestGeneration) return;
      renderState(error?.message || 'History could not be loaded.', { retry: true, error: true });
    }
  }

  function renderDetail(validated, { focusRestore = false } = {}) {
    if (!el.pbHistoryDialogBody) return;
    const { detail, page, sectionCount, moduleCount } = validated;
    const dirtyScope = getState().dirtyScope;
    const dirtyWarning = dirtyScope
      ? `<div class="pb-history-warning">Restore is disabled because the ${escapeHtml(
          dirtyScope
        )} workspace has unsaved changes. Save or discard it first.</div>`
      : '';
    setDialogSemantics();
    renderDialogBody(
      `
      <div class="pb-history-detail">
        <button type="button" data-history-back>← Back to ${view === 'deleted' ? 'deleted pages' : 'history'}</button>
        <h3 tabindex="-1" data-history-detail-title>${escapeHtml(page.title || page.slug || 'Untitled page')}</h3>
        <dl class="pb-history-summary">
          <div><dt>Recovery point</dt><dd>${escapeHtml(getSnapshotActionLabel(detail.action))}</dd></div>
          <div><dt>Saved</dt><dd>${timeHtml(detail.createdAt)}</dd></div>
          <div><dt>Page type</dt><dd>${escapeHtml(page.pageType || 'custom')}</dd></div>
          <div><dt>Historical route</dt><dd>${escapeHtml(detail.scope === 'global' ? 'Global' : detail.seriesId || 'Series')} / ${escapeHtml(detail.slug)}</dd></div>
          <div><dt>Content</dt><dd>${sectionCount} ${sectionCount === 1 ? 'section' : 'sections'}, ${moduleCount} ${moduleCount === 1 ? 'module' : 'modules'}</dd></div>
          <div><dt>Saved by</dt><dd>${escapeHtml(detail.createdByDisplayName || 'System or former administrator')}</dd></div>
        </dl>
        ${dirtyWarning}
        <div class="pb-history-actions">
          <button type="button" data-history-close>Close</button>
          <button type="button" class="pb-history-danger" data-history-restore ${dirtyScope ? 'disabled' : ''}>${selected.deleted ? 'Recover deleted page' : 'Restore this version'}</button>
        </div>
      </div>
    `,
      {
        focusSelector: focusRestore ? '[data-history-restore]' : '[data-history-detail-title]',
      }
    );
    bindCommonButtons();
    el.pbHistoryDialogBody
      .querySelector('[data-history-back]')
      ?.addEventListener('click', () => loadList({ focusSnapshotId: selected.snapshotId }));
    el.pbHistoryDialogBody
      .querySelector('[data-history-restore]')
      ?.addEventListener('click', () => renderConfirmation());
  }

  async function loadDetail(nextSelected) {
    abortRequest();
    selected = nextSelected;
    const generation = requestGeneration;
    requestController = new AbortController();
    renderState('Validating recovery details…', { busy: true });
    try {
      const detail = await deps.fetchPageSnapshot(selected.snapshotId, {
        signal: requestController.signal,
      });
      const validated = validateSnapshotDetail(detail, selected);
      if (generation !== requestGeneration) return;
      selected.validated = validated;
      renderDetail(validated);
    } catch (error) {
      if (error?.name === 'AbortError' || generation !== requestGeneration) return;
      renderState(error?.message || 'This recovery point could not be validated.', {
        retry: true,
        error: true,
        onRetry: () => loadDetail(nextSelected),
      });
    }
  }

  function bindCommonButtons() {
    el.pbHistoryDialogBody
      ?.querySelectorAll('[data-history-close]')
      .forEach((button) => button.addEventListener('click', () => close()));
  }

  function renderConfirmation(errorMessage = '') {
    if (!el.pbHistoryDialogBody || !selected?.validated) return;
    const page = selected.validated.page;
    const warning = selected.deleted
      ? 'This recreates the page as an appended unpublished, non-homepage, unbound draft.'
      : `This replaces saved content while preserving the current slug, scope, order, publication/homepage state, and bindings.${
          getState().currentPage?.isPublished ? ' The published page may change immediately.' : ''
        }`;
    setDialogSemantics('confirmation');
    renderDialogBody(
      `
      <div class="pb-history-confirm">
        <h3 id="pbHistoryConfirmTitle">Restore “${escapeHtml(page.title || page.slug || 'this page')}”?</h3>
        <div id="pbHistoryConfirmConsequence" class="pb-history-warning">${escapeHtml(warning)}</div>
        <p id="pbHistoryConfirmDescription">The validated server recovery point will become canonical saved content. Unsaved local drafts are never included.</p>
        ${errorMessage ? `<div class="pb-history-error" role="alert" tabindex="-1" data-history-confirm-error>${escapeHtml(errorMessage)}</div>` : ''}
        <div class="pb-history-actions">
          <button type="button" data-confirm-cancel>Cancel</button>
          <button type="button" class="pb-history-danger" data-confirm-restore>${selected.deleted ? 'Recover page' : 'Restore page'}</button>
        </div>
      </div>
    `,
      { focusSelector: errorMessage ? '[data-history-confirm-error]' : '[data-confirm-cancel]' }
    );
    const cancelButton = el.pbHistoryDialogBody.querySelector('[data-confirm-cancel]');
    cancelButton?.addEventListener('click', () =>
      renderDetail(selected.validated, { focusRestore: true })
    );
    el.pbHistoryDialogBody
      .querySelector('[data-confirm-restore]')
      ?.addEventListener('click', commitRestore);
  }

  async function commitRestore() {
    if (restoring || !selected?.validated) return;
    const restoreSelection = Object.freeze({
      snapshotId: selected.snapshotId,
      pageId: selected.pageId || '',
      deleted: selected.deleted === true,
    });
    const recoveryContext = actions.captureRecoveryContext?.() || null;
    const generation = ++restoreGeneration;
    restoring = true;
    if (el.pbHistoryDialogClose) el.pbHistoryDialogClose.disabled = true;
    setDialogSemantics();
    renderDialogBody(
      `
      <div class="pb-history-state" role="status" tabindex="-1" data-history-state-focus>
        <p>${restoreSelection.deleted ? 'Recovering deleted page…' : 'Restoring saved page…'}</p>
      </div>
    `,
      { busy: true, focusSelector: '[data-history-state-focus]' }
    );
    const result = await actions.runCommand(BUILDER_COMMANDS.RESTORE_SNAPSHOT, {
      snapshotId: restoreSelection.snapshotId,
      deleted: restoreSelection.deleted,
      context: recoveryContext,
    });
    if (generation !== restoreGeneration) {
      if (result?.committed) {
        setStatus(
          result.status,
          result.contextChanged || result.refreshWarning ? 'warning' : 'success'
        );
      }
      return;
    }
    restoring = false;
    if (el.pbHistoryDialogClose) el.pbHistoryDialogClose.disabled = false;
    if (!result?.ok) {
      renderConfirmation(result?.status || 'The page could not be restored.');
      return;
    }
    setStatus(
      result.status,
      result.contextChanged || result.refreshWarning ? 'warning' : 'success'
    );
    close({ focusPageId: restoreSelection.deleted ? result.page?.id : '' });
  }

  function open(nextView, nextInvoker) {
    if (restoring || !el.pbHistoryDialog) return;
    if (nextView === 'history' && !getState().currentPage?.id) return;
    abortRequest();
    setDialogSemantics();
    view = nextView;
    selected = null;
    invoker = nextInvoker || document.activeElement;
    el.pbHistoryDialogTitle.textContent = view === 'deleted' ? 'Deleted pages' : 'Page history';
    setDialogOpen(true);
    el.pbHistoryDialogTitle?.focus();
    loadList();
  }

  function handleKeydown(event) {
    if (!el.pbHistoryDialog?.hasAttribute('open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = getFocusable(el.pbHistoryDialog);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function bind() {
    el.pbHistory?.addEventListener('click', (event) => open('history', event.currentTarget));
    el.pbHistoryDialogClose?.addEventListener('click', () => close());
    el.pbHistoryDialog?.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    el.pbHistoryDialog?.addEventListener('keydown', handleKeydown);
  }

  return {
    bind,
    close,
    openCurrent: (nextInvoker) => open('history', nextInvoker),
    openDeleted: (nextInvoker) => open('deleted', nextInvoker),
    setStatus,
  };
}

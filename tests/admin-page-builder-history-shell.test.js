import { afterEach, describe, expect, it, vi } from 'vitest';

import { getSnapshotActionLabel } from '../admin/page-builder/history-panel.js';
import { buildContractFixture, getContractFixture } from './helpers/contracts.js';
import { flushAdminUi } from './helpers/admin-fixture.js';
import {
  getCssRule,
  openBuilderPage,
  readCss,
  setupPageBuilder,
} from './helpers/admin-page-builder-shell.js';

const SNAPSHOT_ID = '11111111-1111-4111-8111-111111111111';

function snapshotSummary(page, overrides = {}) {
  return {
    id: SNAPSHOT_ID,
    pageId: page.id,
    scope: page.scope,
    seriesId: page.seriesId,
    slug: page.slug,
    action: 'page_updated',
    createdAt: '2026-07-31T14:22:00+00:00',
    createdByDisplayName: 'Recovery Admin',
    ...overrides,
  };
}

function snapshotDetail(page, overrides = {}) {
  return {
    ...snapshotSummary(page),
    payload: {
      snapshotVersion: 1,
      page,
      bindings: [],
    },
    ...overrides,
  };
}

function click(selector) {
  document.querySelector(selector)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('admin page-builder history and recovery shell', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('keeps Deleted pages available in an empty scope and renders empty recovery state', async () => {
    const { manager, mocks } = await setupPageBuilder({ fetchPagesResults: [[]] });
    await manager.showPageBuilderSection();

    expect(document.querySelector('.pb-deleted-pages-action')).not.toBeNull();
    click('.pb-deleted-pages-action');
    await flushAdminUi(2);

    expect(document.getElementById('pbHistoryDialog')?.hasAttribute('open')).toBe(true);
    expect(document.getElementById('pbHistoryDialogTitle')?.textContent).toBe('Deleted pages');
    expect(document.getElementById('pbHistoryDialogBody')?.textContent).toMatch(
      /No retained deleted pages/i
    );
    expect(mocks.fetchDeletedPageSnapshots).toHaveBeenCalledWith({
      scope: 'series',
      seriesId: 'battle-bros',
      signal: expect.any(AbortSignal),
    });
  });

  it('labels every backend action and renders actor fallback with semantic time', async () => {
    expect(
      [
        'page_created',
        'page_updated',
        'page_deleted',
        'page_reordered',
        'bindings_updated',
        'section_added',
        'section_updated',
        'section_deleted',
        'sections_reordered',
        'module_added',
        'module_updated',
        'module_deleted',
        'module_moved',
        'modules_reordered',
        'module_placements_saved',
        'pre_restore',
      ].map(getSnapshotActionLabel)
    ).toEqual([
      'Creation baseline',
      'Before page update',
      'Before page deletion',
      'Before page reorder',
      'Before binding update',
      'Before section addition',
      'Before section update',
      'Before section deletion',
      'Before section reorder',
      'Before module addition',
      'Before module update',
      'Before module deletion',
      'Before module move',
      'Before module reorder',
      'Before module placement save',
      'Before snapshot restore',
    ]);

    const page = getContractFixture('builderPage');
    const summary = snapshotSummary(page, {
      action: 'page_created',
      createdByDisplayName: null,
    });
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[page]],
      fetchPageResult: page,
      fetchPageSnapshotsResult: [summary],
    });
    await openBuilderPage(manager);
    click('#pbHistory');
    await flushAdminUi(2);

    expect(document.getElementById('pbHistoryDialogBody')?.textContent).toContain(
      'Creation baseline'
    );
    expect(document.getElementById('pbHistoryDialogBody')?.textContent).toContain(
      'System or former administrator'
    );
    expect(document.querySelector('time')?.getAttribute('datetime')).toBe(summary.createdAt);
  });

  it('validates detail, shows compact counts, and disables restore for dirty drafts', async () => {
    const page = getContractFixture('builderPage');
    const summary = snapshotSummary(page);
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[page]],
      fetchPageResult: page,
      fetchPageSnapshotsResult: [summary],
      fetchPageSnapshotResult: snapshotDetail(page),
    });
    await openBuilderPage(manager);

    const titleInput = document.getElementById('pbEditPageTitle');
    titleInput.value = 'Unsaved title';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    click('#pbHistory');
    await flushAdminUi(2);
    click('[data-snapshot-id]');
    await flushAdminUi(2);

    const sectionCount = page.sections.length;
    const moduleCount = page.sections.reduce((count, section) => count + section.modules.length, 0);
    expect(document.querySelector('.pb-history-summary')?.textContent).toContain(
      `${sectionCount} sections, ${moduleCount} modules`
    );
    expect(document.querySelector('.pb-history-warning')?.textContent).toMatch(
      /page-settings workspace has unsaved changes/i
    );
    expect(document.querySelector('[data-history-restore]')?.disabled).toBe(true);
  });

  it('rejects malformed detail instead of exposing restore controls', async () => {
    const page = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[page]],
      fetchPageResult: page,
      fetchPageSnapshotsResult: [snapshotSummary(page)],
      fetchPageSnapshotResult: {
        ...snapshotDetail(page),
        payload: { snapshotVersion: 1, page: { ...page, sections: null }, bindings: [] },
      },
    });
    await openBuilderPage(manager);
    click('#pbHistory');
    await flushAdminUi(2);
    click('[data-snapshot-id]');
    await flushAdminUi(2);

    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(
      /invalid detail contract/i
    );
    expect(document.querySelector('[data-history-restore]')).toBeNull();
  });

  it('restores current history into a fresh canonical page and keeps success in the live region', async () => {
    const page = getContractFixture('builderPage');
    const restoredPage = buildContractFixture('builderPage', {
      ...page,
      title: 'Restored canonical title',
      sections: page.sections.slice(0, 1),
    });
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[page]],
      fetchPageResult: page,
      fetchPageSnapshotsResult: [snapshotSummary(page)],
      fetchPageSnapshotResult: snapshotDetail(page),
      restorePageSnapshotResult: restoredPage,
    });
    let previewSessionNumber = 0;
    window.crypto.randomUUID = () => `recovery-session-${++previewSessionNumber}`;
    await openBuilderPage(manager);
    const previewSessionBefore =
      document.querySelector('.pb-preview-frame')?.dataset.previewSession;
    click('#pbHistory');
    await flushAdminUi(2);
    click('[data-snapshot-id]');
    await flushAdminUi(2);
    click('[data-history-restore]');

    expect(document.activeElement).toBe(document.querySelector('[data-confirm-cancel]'));
    click('[data-confirm-restore]');
    await flushAdminUi(20);

    expect(mocks.restorePageSnapshot).toHaveBeenCalledWith(SNAPSHOT_ID, { signal: undefined });
    expect(document.querySelector('.pb-page-item-title')?.textContent).toBe(
      'Restored canonical title'
    );
    expect(document.getElementById('pbRecoveryStatus')?.textContent).toMatch(
      /Page restored from saved history/i
    );
    expect(document.getElementById('pbHistoryDialog')?.hasAttribute('open')).toBe(false);
    expect(document.querySelector('.pb-sidebar-tab[data-tab="pages"]')?.classList).toContain(
      'active'
    );
    const previewSessionAfter = document.querySelector('.pb-preview-frame')?.dataset.previewSession;
    expect(previewSessionBefore).toBeTruthy();
    expect(previewSessionAfter).toBeTruthy();
    expect(previewSessionAfter).not.toBe(previewSessionBefore);
    expect(document.querySelector('.pb-preview-target-box--selected')).toBeNull();
    expect(
      Array.from(document.querySelectorAll('[data-action="undo-current"]')).every(
        (button) => button.disabled
      )
    ).toBe(true);
  });

  it('recovers a deleted page in scope and focuses the newly active draft', async () => {
    const page = getContractFixture('builderPage');
    const deletedPage = buildContractFixture('builderPageDraft', {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      scope: 'series',
      seriesId: 'battle-bros',
      slug: 'recovered-page',
      title: 'Recovered page',
      isPublished: false,
      isHomepage: false,
    });
    const candidate = {
      pageId: deletedPage.id,
      scope: 'series',
      seriesId: 'battle-bros',
      slug: deletedPage.slug,
      title: deletedPage.title,
      latestSnapshotId: SNAPSHOT_ID,
      latestSnapshotAt: '2026-07-31T14:22:00+00:00',
    };
    const onDesignerRouteChange = vi.fn();
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[page]],
      fetchPageResult: page,
      fetchDeletedPageSnapshotsResult: [candidate],
      fetchPageSnapshotResult: snapshotDetail(deletedPage, {
        id: SNAPSHOT_ID,
        pageId: deletedPage.id,
        scope: 'series',
        seriesId: 'battle-bros',
        slug: deletedPage.slug,
        action: 'page_deleted',
      }),
      restorePageSnapshotResult: deletedPage,
      onDesignerRouteChange,
    });
    await manager.showPageBuilderSection({
      entrypoint: 'designer',
      pageSlug: page.slug,
      surface: 'header',
    });
    click('.pb-deleted-pages-action');
    await flushAdminUi(2);
    click('[data-snapshot-id]');
    await flushAdminUi(2);
    click('[data-history-restore]');
    click('[data-confirm-restore]');
    await flushAdminUi(20);

    const activePage = Array.from(document.querySelectorAll('.pb-page-item')).find(
      (item) => item.dataset.pageId === deletedPage.id
    );
    expect(activePage?.classList).toContain('active');
    expect(document.activeElement).toBe(activePage);
    expect(document.getElementById('pbRecoveryStatus')?.textContent).toMatch(
      /Deleted page recovered|Page restored/i
    );
    expect(onDesignerRouteChange).toHaveBeenLastCalledWith(
      { pageSlug: deletedPage.slug, surface: 'header' },
      'replace'
    );
  });

  it('releases the modal before a secondary refresh settles', async () => {
    const page = getContractFixture('builderPage');
    const secondPage = buildContractFixture('builderPageDraft', {
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      slug: 'refresh-navigation',
      title: 'Refresh navigation page',
    });
    const restoredPage = buildContractFixture('builderPage', {
      ...page,
      title: 'Committed before refresh',
    });
    let bindingRequestCount = 0;
    let resolveRefresh;
    const refreshPending = new Promise((resolve) => (resolveRefresh = resolve));
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[page, secondPage]],
      fetchPageResult: (pageId) => (pageId === secondPage.id ? secondPage : page),
      fetchPageSnapshotsResult: [snapshotSummary(page)],
      fetchPageSnapshotResult: snapshotDetail(page),
      restorePageSnapshotResult: restoredPage,
      fetchPageBindingsResult: () => {
        bindingRequestCount += 1;
        return bindingRequestCount === 1 ? { bindings: {}, warnings: [] } : refreshPending;
      },
    });
    await openBuilderPage(manager);
    click('#pbHistory');
    await flushAdminUi(2);
    click('[data-snapshot-id]');
    await flushAdminUi(2);
    click('[data-history-restore]');
    click('[data-confirm-restore]');
    await flushAdminUi(2);

    expect(document.getElementById('pbHistoryDialog')?.hasAttribute('open')).toBe(false);
    expect(document.querySelector('.pb-page-item-title')?.textContent).toBe(
      'Committed before refresh'
    );
    expect(document.getElementById('pbRecoveryStatus')?.textContent).toMatch(/Page restored/i);

    const refreshSignal = mocks.fetchPageBindings.mock.calls.at(-1)?.[1]?.signal;
    expect(refreshSignal).toBeInstanceOf(AbortSignal);
    const secondRow = Array.from(document.querySelectorAll('.pb-page-item')).find(
      (item) => item.dataset.pageId === secondPage.id
    );
    secondRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);
    expect(refreshSignal.aborted).toBe(true);

    resolveRefresh({ bindings: {}, warnings: [] });
    await flushAdminUi(3);
    expect(document.querySelector('.pb-page-item.active')?.dataset.pageId).toBe(secondPage.id);
  });

  it('force-closes a restoring dialog and rejects reconciliation after page navigation', async () => {
    const firstPage = getContractFixture('builderPage');
    const secondPage = buildContractFixture('builderPageDraft', {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      slug: 'second-page',
      title: 'Second page',
    });
    const restoredFirstPage = buildContractFixture('builderPage', {
      ...firstPage,
      title: 'Restored in old context',
    });
    let resolveRestore;
    const restorePending = new Promise((resolve) => (resolveRestore = resolve));
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[firstPage, secondPage]],
      fetchPageResult: (pageId) => (pageId === secondPage.id ? secondPage : firstPage),
      fetchPageSnapshotsResult: [snapshotSummary(firstPage)],
      fetchPageSnapshotResult: snapshotDetail(firstPage),
      restorePageSnapshotResult: () => restorePending,
    });
    await openBuilderPage(manager);
    click('#pbHistory');
    await flushAdminUi(2);
    click('[data-snapshot-id]');
    await flushAdminUi(2);
    click('[data-history-restore]');
    click('[data-confirm-restore]');
    await flushAdminUi(1);

    const secondRow = Array.from(document.querySelectorAll('.pb-page-item')).find(
      (item) => item.dataset.pageId === secondPage.id
    );
    secondRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);
    expect(document.getElementById('pbHistoryDialog')?.hasAttribute('open')).toBe(false);
    expect(document.querySelector('.pb-page-item.active')?.dataset.pageId).toBe(secondPage.id);

    resolveRestore(restoredFirstPage);
    await flushAdminUi(4);
    expect(document.querySelector('.pb-page-item.active')?.dataset.pageId).toBe(secondPage.id);
    expect(document.querySelector('.pb-page-item.active')?.textContent).toContain('Second page');
    expect(document.getElementById('pbRecoveryStatus')?.textContent).toMatch(
      /previous builder context/i
    );
  });

  it('retains the canonical restore response and reports a secondary refresh failure', async () => {
    const page = getContractFixture('builderPage');
    const restoredPage = buildContractFixture('builderPage', {
      ...page,
      title: 'Canonical response retained',
    });
    let bindingRequestCount = 0;
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[page]],
      fetchPageResult: page,
      fetchPageSnapshotsResult: [snapshotSummary(page)],
      fetchPageSnapshotResult: snapshotDetail(page),
      restorePageSnapshotResult: restoredPage,
      fetchPageBindingsResult: () => {
        bindingRequestCount += 1;
        if (bindingRequestCount > 1) throw new Error('binding refresh unavailable');
        return { bindings: {}, warnings: [] };
      },
    });
    await openBuilderPage(manager);
    click('#pbHistory');
    await flushAdminUi(2);
    click('[data-snapshot-id]');
    await flushAdminUi(2);
    click('[data-history-restore]');
    click('[data-confirm-restore]');
    await flushAdminUi(5);

    expect(document.querySelector('.pb-page-item-title')?.textContent).toBe(
      'Canonical response retained'
    );
    expect(document.getElementById('pbRecoveryStatus')?.textContent).toMatch(
      /related page and binding data could not be refreshed/i
    );
    expect(document.getElementById('pbRecoveryStatus')?.dataset.status).toBe('warning');
  });

  it('returns focus on Escape and ignores a stale history response after view changes', async () => {
    const page = getContractFixture('builderPage');
    let resolveHistory;
    const historyRequest = new Promise((resolve) => (resolveHistory = resolve));
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[page]],
      fetchPageResult: page,
      fetchPageSnapshotsResult: () => historyRequest,
      fetchDeletedPageSnapshotsResult: [],
    });
    await openBuilderPage(manager);
    const historyButton = document.getElementById('pbHistory');
    historyButton.focus();
    click('#pbHistory');
    expect(document.activeElement).toBe(document.querySelector('[data-history-state-focus]'));

    document
      .getElementById('pbHistoryDialog')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.activeElement).toBe(historyButton);

    click('.pb-deleted-pages-action');
    await flushAdminUi(2);
    resolveHistory([snapshotSummary(page)]);
    await flushAdminUi(2);

    expect(document.getElementById('pbHistoryDialogTitle')?.textContent).toBe('Deleted pages');
    expect(document.getElementById('pbHistoryDialogBody')?.textContent).toMatch(
      /No retained deleted pages/i
    );
    expect(document.getElementById('pbHistoryDialogBody')?.textContent).not.toContain(
      'Before page update'
    );
  });

  it('invalidates History for builder loads, scope changes, and series changes', async () => {
    const page = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[page]],
      fetchGlobalPagesResults: [[]],
      fetchPageResult: page,
      fetchPageSnapshotsResult: [snapshotSummary(page)],
      fetchDeletedPageSnapshotsResult: [],
    });
    await openBuilderPage(manager);

    click('#pbHistory');
    await flushAdminUi(2);
    expect(document.getElementById('pbHistoryDialog')?.hasAttribute('open')).toBe(true);
    const reload = manager.showPageBuilderSection();
    expect(document.getElementById('pbHistoryDialog')?.hasAttribute('open')).toBe(false);
    await reload;

    click('.pb-deleted-pages-action');
    await flushAdminUi(2);
    click('[data-page-scope="global"]');
    await flushAdminUi(3);
    expect(document.getElementById('pbHistoryDialog')?.hasAttribute('open')).toBe(false);

    click('.pb-deleted-pages-action');
    await flushAdminUi(2);
    manager.onSeriesChange();
    expect(document.getElementById('pbHistoryDialog')?.hasAttribute('open')).toBe(false);
    await flushAdminUi(4);
  });

  it('focuses loading, retry, detail, confirmation, cancel, and back transitions', async () => {
    const page = getContractFixture('builderPage');
    const summary = snapshotSummary(page);
    let listAttempts = 0;
    let detailAttempts = 0;
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[page]],
      fetchPageResult: page,
      fetchPageSnapshotsResult: () => {
        listAttempts += 1;
        if (listAttempts === 1) throw new Error('history unavailable');
        return [summary];
      },
      fetchPageSnapshotResult: () => {
        detailAttempts += 1;
        if (detailAttempts === 1) throw new Error('detail unavailable');
        return snapshotDetail(page);
      },
    });
    await openBuilderPage(manager);
    click('#pbHistory');
    expect(document.activeElement).toBe(document.querySelector('[data-history-state-focus]'));
    await flushAdminUi(2);
    expect(document.activeElement).toBe(document.querySelector('[data-history-retry]'));

    click('[data-history-retry]');
    await flushAdminUi(2);
    expect(document.activeElement).toBe(document.querySelector('[data-snapshot-id]'));
    click('[data-snapshot-id]');
    expect(document.activeElement).toBe(document.querySelector('[data-history-state-focus]'));
    await flushAdminUi(2);
    expect(document.activeElement).toBe(document.querySelector('[data-history-retry]'));

    click('[data-history-retry]');
    await flushAdminUi(2);
    expect(document.activeElement).toBe(document.querySelector('[data-history-detail-title]'));
    click('[data-history-restore]');
    expect(document.activeElement).toBe(document.querySelector('[data-confirm-cancel]'));
    expect(document.getElementById('pbHistoryDialog')?.getAttribute('aria-labelledby')).toBe(
      'pbHistoryConfirmTitle'
    );

    click('[data-confirm-cancel]');
    expect(document.activeElement).toBe(document.querySelector('[data-history-restore]'));
    click('[data-history-back]');
    await flushAdminUi(2);
    expect(document.activeElement).toBe(document.querySelector('[data-snapshot-id]'));
  });

  it('keeps restore conflicts retryable and focuses the confirmation error', async () => {
    const page = getContractFixture('builderPage');
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[page]],
      fetchPageResult: page,
      fetchPageSnapshotsResult: [snapshotSummary(page)],
      fetchPageSnapshotResult: snapshotDetail(page),
      restorePageSnapshotResult: () => {
        throw Object.assign(new Error('slug conflict'), {
          status: 409,
          code: 'snapshot_slug_conflict',
        });
      },
    });
    await openBuilderPage(manager);
    click('#pbHistory');
    await flushAdminUi(2);
    click('[data-snapshot-id]');
    await flushAdminUi(2);
    click('[data-history-restore]');
    click('[data-confirm-restore]');
    await flushAdminUi(3);

    expect(document.getElementById('pbHistoryDialog')?.hasAttribute('open')).toBe(true);
    expect(document.querySelector('[data-history-confirm-error]')?.textContent).toMatch(
      /slug is now in use/i
    );
    expect(document.activeElement).toBe(document.querySelector('[data-history-confirm-error]'));
    expect(document.querySelector('[data-confirm-restore]')).not.toBeNull();
  });

  it('uses an atomic non-blocking status below the stacked-toolbar breakpoint', async () => {
    const { manager } = await setupPageBuilder({ fetchPagesResults: [[]] });
    await manager.showPageBuilderSection();
    const status = document.getElementById('pbRecoveryStatus');
    expect(status?.getAttribute('aria-atomic')).toBe('true');
    const css = readCss('admin/css/page-builder/history.css');
    expect(getCssRule(css, '.pb-recovery-status')).toMatch(/pointer-events:\s*none/);
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.pb-recovery-status/);
  });
});

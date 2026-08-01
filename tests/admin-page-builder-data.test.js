import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addModule,
  addSection,
  createPage,
  createScopedPage,
  deleteModule,
  deletePage,
  deleteSection,
  fetchGlobalPages,
  fetchPage,
  fetchPageBuilderRuntime,
  fetchPageSnapshots,
  fetchDeletedPageSnapshots,
  fetchPageSnapshot,
  restorePageSnapshot,
  fetchPages,
  fetchPageBindings,
  fetchSeriesPages,
  getLastPageBuilderDataError,
  moveModule,
  reorderModules,
  reorderSections,
  reorderScopedPages,
  updatePageBindings,
  updateModule,
  updatePage,
  updateSection,
} from '../admin/page-builder/data.js';
import { buildContractFixture, getContractFixture } from './helpers/contracts.js';
import { jsonResponse, stubAdminGlobals } from './helpers/admin-fixture.js';

describe('admin page-builder data layer', () => {
  beforeEach(() => {
    stubAdminGlobals(vi);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('round-trips page CRUD against the current admin contract', async () => {
    const page = getContractFixture('builderPage');
    const updatedPage = buildContractFixture('builderPage', {
      title: 'Reader Updated',
      isPublished: false,
    });
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/admin/pages/series/battle-bros') {
        if (options.method === 'POST') {
          return jsonResponse({ page });
        }
        return jsonResponse({ pages: [page] });
      }
      if (url === `/api/admin/pages/${page.id}`) {
        if (options.method === 'PUT') {
          return jsonResponse({ page: updatedPage });
        }
        if (options.method === 'DELETE') {
          return jsonResponse({}, { status: 204, statusText: 'No Content' });
        }
        return jsonResponse({ page });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchPages('battle-bros')).toEqual([page]);
    expect(await fetchPage(page.id)).toEqual(page);
    expect(await createPage('battle-bros', 'reader', 'Reader')).toEqual(page);
    expect(await updatePage(page.id, { isPublished: false })).toEqual(updatedPage);
    expect(await deletePage(page.id)).toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/pages/series/battle-bros',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'same-origin',
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/pages/${page.id}`,
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'same-origin',
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/pages/series/battle-bros',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ slug: 'reader', title: 'Reader' }),
      })
    );
  });

  it('loads the no-store builder runtime contract', async () => {
    const runtime = {
      contractVersion: 1,
      processStartedAt: '2026-07-14T10:00:00+00:00',
      capabilities: ['responsive-module-round-trip'],
    };
    const fetchMock = vi.fn(async () => jsonResponse(runtime));
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchPageBuilderRuntime()).toEqual(runtime);
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/page-builder/runtime', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
  });

  it('loads typed recovery summaries and detail with encoded no-store requests', async () => {
    const snapshots = [{ id: 'snapshot/one', pageId: 'page one' }];
    const deleted = [{ pageId: 'deleted-one', latestSnapshotId: 'snapshot-two' }];
    const detail = { id: 'snapshot/one', payload: { snapshotVersion: 1 } };
    const controller = new AbortController();
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/admin/pages/page%20one%2F%C3%9F/snapshots') {
        return jsonResponse({ snapshots });
      }
      if (
        url === '/api/admin/page-snapshots/deleted?scope=series&series_id=battle+brothers%2F%C3%9F'
      ) {
        return jsonResponse({ pages: deleted });
      }
      if (url === '/api/admin/page-snapshots/snapshot%2Fone') {
        return jsonResponse({ snapshot: detail });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchPageSnapshots('page one/ß', { signal: controller.signal })).toEqual(
      snapshots
    );
    expect(
      await fetchDeletedPageSnapshots({
        scope: 'series',
        seriesId: 'battle brothers/ß',
        signal: controller.signal,
      })
    ).toEqual(deleted);
    expect(await fetchPageSnapshot('snapshot/one', { signal: controller.signal })).toEqual(detail);

    for (const [, options] of fetchMock.mock.calls) {
      expect(options).toMatchObject({
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      });
    }
  });

  it('sends snapshot restore as a bodyless POST and preserves structured errors', async () => {
    const restoredPage = getContractFixture('builderPage');
    const controller = new AbortController();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ page: restoredPage }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: 'A nested snapshot ID belongs to another page',
            code: 'snapshot_identity_conflict',
            path: 'page.sections.0.id',
          },
          { status: 409, statusText: 'Conflict' }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    expect(await restorePageSnapshot('snapshot one', { signal: controller.signal })).toEqual(
      restoredPage
    );
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/page-snapshots/snapshot%20one/restore');
    expect(options).toEqual({
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    });
    expect(options).not.toHaveProperty('body');
    expect(options).not.toHaveProperty('headers');

    await expect(fetchPageSnapshot('conflict')).rejects.toMatchObject({
      message: 'A nested snapshot ID belongs to another page',
      status: 409,
      code: 'snapshot_identity_conflict',
      path: 'page.sections.0.id',
      payload: expect.objectContaining({ code: 'snapshot_identity_conflict' }),
    });
  });

  it('forwards aborts and rejects malformed successful recovery responses', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_url, { signal }) => {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const request = fetchPageSnapshots('page-one', { signal: controller.signal });
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ snapshots: null }))
    );
    await expect(fetchPageSnapshots('page-one')).rejects.toMatchObject({
      status: 200,
      code: 'invalid_recovery_response',
      path: 'snapshots',
    });
  });

  it('uses explicit scope endpoints for global pages and page bindings', async () => {
    const seriesPage = getContractFixture('builderPage');
    const globalPage = buildContractFixture('builderPageDraft', {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee99',
      scope: 'global',
      seriesId: null,
      slug: 'about',
      title: 'About',
      isPublished: true,
    });
    const bindings = {
      seriesId: 'battle-bros',
      bindings: { reader: { role: 'reader', pageId: seriesPage.id, page: seriesPage } },
      warnings: [],
    };
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/admin/pages/global') {
        if (options.method === 'POST') return jsonResponse({ page: globalPage });
        return jsonResponse({ pages: [globalPage] });
      }
      if (url === '/api/admin/pages/series/battle-bros') {
        return jsonResponse({ pages: [seriesPage] });
      }
      if (url === '/api/admin/pages/global/reorder' && options.method === 'POST') {
        return jsonResponse({ status: 'success' });
      }
      if (url === '/api/admin/pages/series/battle-bros/reorder' && options.method === 'POST') {
        return jsonResponse({ status: 'success' });
      }
      if (url === '/api/admin/page-bindings/battle-bros') {
        if (options.method === 'PUT') return jsonResponse(bindings);
        return jsonResponse(bindings);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchSeriesPages('battle-bros')).toEqual([seriesPage]);
    expect(await fetchGlobalPages()).toEqual([globalPage]);
    expect(await createScopedPage('global', 'battle-bros', 'about', 'About')).toEqual(globalPage);
    expect(await reorderScopedPages('global', 'battle-bros', [globalPage.id])).toBe(true);
    expect(await reorderScopedPages('series', 'battle-bros', [seriesPage.id])).toBe(true);
    expect(await fetchPageBindings('battle-bros')).toEqual(bindings);
    expect(await updatePageBindings('battle-bros', { reader: seriesPage.id })).toEqual(bindings);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/pages/global',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ slug: 'about', title: 'About' }),
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/page-bindings/battle-bros',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ bindings: { reader: seriesPage.id } }),
      })
    );
  });

  it('preserves structured reader-binding validation errors from admin wrappers', async () => {
    const page = getContractFixture('builderPage');
    const validationPayload = {
      error: 'The bound reader page must contain one Comic Reader module.',
      code: 'reader_module_missing',
      warnings: [
        {
          role: 'reader',
          code: 'reader_module_missing',
          message: 'The bound reader page must contain one Comic Reader module.',
        },
      ],
    };
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/admin/page-bindings/battle-bros' && options.method === 'PUT') {
        return jsonResponse(validationPayload, { status: 400, statusText: 'Bad Request' });
      }
      if (url === `/api/admin/pages/${page.id}` && options.method === 'PUT') {
        return jsonResponse(validationPayload, { status: 400, statusText: 'Bad Request' });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await updatePageBindings('battle-bros', { reader: page.id })).toBeNull();
    expect(getLastPageBuilderDataError()).toMatchObject({
      message: validationPayload.error,
      code: 'reader_module_missing',
      warnings: validationPayload.warnings,
    });
    expect(globalThis.alert).toHaveBeenCalledWith(validationPayload.error);

    expect(await updatePage(page.id, { isPublished: true })).toBeNull();
    expect(getLastPageBuilderDataError()).toMatchObject({
      message: validationPayload.error,
      code: 'reader_module_missing',
      warnings: validationPayload.warnings,
    });
  });

  it('handles section and module endpoint wrappers plus page-create failures', async () => {
    const section = getContractFixture('builderPage').sections[0];
    const secondSection = getContractFixture('builderPage').sections[1];
    const module = getContractFixture('builderModules').feed;
    const updatedSection = { ...section, settings: { moduleGap: 18 } };
    const updatedModule = { ...module, config: { limit: 8 } };
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/admin/pages/series/battle-bros' && options.method === 'POST') {
        return jsonResponse(
          { error: 'Duplicate slug' },
          { status: 400, statusText: 'Bad Request' }
        );
      }
      if (url === '/api/admin/pages/page-id/sections' && options.method === 'POST') {
        return jsonResponse({ section });
      }
      if (url === `/api/admin/sections/${section.id}` && options.method === 'PUT') {
        return jsonResponse({ section: updatedSection });
      }
      if (url === `/api/admin/sections/${section.id}` && options.method === 'DELETE') {
        return jsonResponse({}, { status: 204, statusText: 'No Content' });
      }
      if (url === `/api/admin/sections/${section.id}/modules` && options.method === 'POST') {
        return jsonResponse({ module });
      }
      if (url === `/api/admin/modules/${module.id}` && options.method === 'PUT') {
        return jsonResponse({ module: updatedModule });
      }
      if (url === `/api/admin/modules/${module.id}/move` && options.method === 'POST') {
        return jsonResponse({ module: { ...module, columnIndex: 1, sortIndex: 0 } });
      }
      if (
        url === `/api/admin/sections/${section.id}/modules/reorder` &&
        options.method === 'POST'
      ) {
        return jsonResponse({}, { status: 204, statusText: 'No Content' });
      }
      if (url === `/api/admin/modules/${module.id}` && options.method === 'DELETE') {
        return jsonResponse({}, { status: 204, statusText: 'No Content' });
      }
      if (url === '/api/admin/pages/page-id/sections/reorder' && options.method === 'POST') {
        return jsonResponse({}, { status: 204, statusText: 'No Content' });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await createPage('battle-bros', 'reader', 'Reader')).toBeNull();
    expect(globalThis.alert).toHaveBeenCalledWith('Duplicate slug');
    expect(await addSection('page-id', 'row', '1-1')).toEqual(section);
    expect(await updateSection(section.id, { settings: { moduleGap: 18 } })).toEqual(
      updatedSection
    );
    expect(await deleteSection(section.id)).toBe(true);
    expect(await addModule(section.id, 'feed', 1, module.config)).toEqual(module);
    expect(await addModule(section.id, 'feed', 1, module.config, 2)).toEqual(module);
    expect(await updateModule(module.id, { config: { limit: 8 } })).toEqual(updatedModule);
    expect(await moveModule(module.id, secondSection.id, 1, 0)).toEqual(
      expect.objectContaining({
        columnIndex: 1,
        sortIndex: 0,
      })
    );
    expect(await reorderModules(section.id, 0, [module.id])).toBe(true);
    expect(await reorderSections('page-id', [secondSection.id, section.id])).toBe(true);
    expect(await deleteModule(module.id)).toBe(true);
  });

  it('reports parsed updateSection failures through the optional callback', async () => {
    const payload = { error: 'Move or delete modules first.' };
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/admin/sections/section-id' && options.method === 'PUT') {
        return jsonResponse(payload, { status: 409, statusText: 'Conflict' });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const onError = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await updateSection('section-id', { layout: '1' }, { onError })).toBeNull();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: payload.error,
        status: 409,
        payload,
      })
    );
    expect(getLastPageBuilderDataError()).toMatchObject({
      message: payload.error,
    });
  });
});

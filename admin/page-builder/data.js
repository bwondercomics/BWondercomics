let lastPageBuilderDataError = null;

function clearLastPageBuilderDataError() {
  lastPageBuilderDataError = null;
}

function rememberPageBuilderDataError(error, fallbackMessage) {
  lastPageBuilderDataError = {
    message: error?.message || fallbackMessage,
    code: error?.code || '',
    warnings: Array.isArray(error?.warnings) ? error.warnings : [],
  };
}

export function getLastPageBuilderDataError() {
  return lastPageBuilderDataError;
}

async function readRecoveryResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || fallbackMessage);
    error.status = response.status;
    error.code = payload.code || '';
    error.path = payload.path || '';
    error.payload = payload;
    throw error;
  }
  return payload;
}

function invalidRecoveryResponse(message, path, payload) {
  const error = new Error(message);
  error.status = 200;
  error.code = 'invalid_recovery_response';
  error.path = path;
  error.payload = payload;
  return error;
}

/**
 * Load newest-first saved recovery points for one page.
 * @param {string} pageId
 * @param {{signal?: AbortSignal}} options
 */
export async function fetchPageSnapshots(pageId, { signal } = {}) {
  const response = await fetch(`/api/admin/pages/${encodeURIComponent(pageId)}/snapshots`, {
    cache: 'no-store',
    credentials: 'same-origin',
    signal,
  });
  const payload = await readRecoveryResponse(response, 'Failed to load page history');
  if (!Array.isArray(payload.snapshots)) {
    throw invalidRecoveryResponse(
      'Page history returned an invalid response',
      'snapshots',
      payload
    );
  }
  return payload.snapshots;
}

/**
 * Load recoverable deleted pages in the active builder scope.
 * @param {{scope: 'series'|'global', seriesId?: string|null, signal?: AbortSignal}} options
 */
export async function fetchDeletedPageSnapshots({ scope, seriesId, signal } = {}) {
  const safeScope = scope === 'global' ? 'global' : 'series';
  const params = new URLSearchParams({ scope: safeScope });
  if (safeScope === 'series') params.set('series_id', String(seriesId || ''));
  const response = await fetch(`/api/admin/page-snapshots/deleted?${params.toString()}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    signal,
  });
  const payload = await readRecoveryResponse(response, 'Failed to load deleted pages');
  if (!Array.isArray(payload.pages)) {
    throw invalidRecoveryResponse('Deleted pages returned an invalid response', 'pages', payload);
  }
  return payload.pages;
}

/**
 * Load and server-validate one recovery point before confirmation.
 * @param {string} snapshotId
 * @param {{signal?: AbortSignal}} options
 */
export async function fetchPageSnapshot(snapshotId, { signal } = {}) {
  const response = await fetch(`/api/admin/page-snapshots/${encodeURIComponent(snapshotId)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    signal,
  });
  const payload = await readRecoveryResponse(response, 'Failed to load recovery point');
  if (!payload.snapshot || typeof payload.snapshot !== 'object') {
    throw invalidRecoveryResponse(
      'Recovery point returned an invalid response',
      'snapshot',
      payload
    );
  }
  return payload.snapshot;
}

/**
 * Restore a server-owned recovery point. The POST is intentionally bodyless.
 * @param {string} snapshotId
 * @param {{signal?: AbortSignal}} options
 */
export async function restorePageSnapshot(snapshotId, { signal } = {}) {
  const response = await fetch(
    `/api/admin/page-snapshots/${encodeURIComponent(snapshotId)}/restore`,
    {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    }
  );
  const payload = await readRecoveryResponse(response, 'Failed to restore recovery point');
  if (!payload.page || typeof payload.page !== 'object') {
    throw invalidRecoveryResponse('Restore returned an invalid page response', 'page', payload);
  }
  return payload.page;
}

export async function fetchPageBuilderRuntime() {
  try {
    const res = await fetch('/api/admin/page-builder/runtime', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(payload.error || 'Builder API compatibility check failed');
      error.status = res.status;
      throw error;
    }
    return payload;
  } catch (err) {
    console.error('fetchPageBuilderRuntime error:', err);
    return null;
  }
}

export async function fetchPages(seriesId) {
  return fetchSeriesPages(seriesId);
}

export async function fetchSeriesPages(seriesId, { throwOnError = false, signal } = {}) {
  try {
    const res = await fetch(`/api/admin/pages/series/${encodeURIComponent(seriesId)}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    });
    if (!res.ok) throw new Error('Failed to fetch pages');
    const data = await res.json();
    return data.pages || [];
  } catch (err) {
    console.error('fetchPages error:', err);
    if (throwOnError) throw err;
    return [];
  }
}

export async function fetchGlobalPages({ throwOnError = false, signal } = {}) {
  try {
    const res = await fetch('/api/admin/pages/global', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    });
    if (!res.ok) throw new Error('Failed to fetch global pages');
    const data = await res.json();
    return data.pages || [];
  } catch (err) {
    console.error('fetchGlobalPages error:', err);
    if (throwOnError) throw err;
    return [];
  }
}

export async function fetchPage(pageId) {
  try {
    const res = await fetch(`/api/admin/pages/${pageId}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error('Failed to fetch page');
    const data = await res.json();
    return data.page || null;
  } catch (err) {
    console.error('fetchPage error:', err);
    return null;
  }
}

export async function createPage(seriesId, slug, title) {
  return createScopedPage('series', seriesId, slug, title);
}

export async function createScopedPage(scope, seriesId, slug, title) {
  try {
    const safeScope = scope === 'global' ? 'global' : 'series';
    const url =
      safeScope === 'global'
        ? '/api/admin/pages/global'
        : `/api/admin/pages/series/${encodeURIComponent(seriesId)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, title }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create page');
    }
    const data = await res.json();
    return data.page;
  } catch (err) {
    console.error('createScopedPage error:', err);
    alert(err.message || 'Failed to create page');
    return null;
  }
}

export async function deletePage(pageId) {
  try {
    const res = await fetch(`/api/admin/pages/${pageId}`, { method: 'DELETE' });
    return res.ok;
  } catch (err) {
    console.error('deletePage error:', err);
    return false;
  }
}

export async function reorderPages(seriesId, pageIds) {
  return reorderScopedPages('series', seriesId, pageIds);
}

export async function reorderScopedPages(scope, seriesId, pageIds) {
  try {
    const safeScope = scope === 'global' ? 'global' : 'series';
    const url =
      safeScope === 'global'
        ? '/api/admin/pages/global/reorder'
        : `/api/admin/pages/series/${encodeURIComponent(seriesId)}/reorder`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_ids: pageIds }),
    });
    return res.ok;
  } catch (err) {
    console.error('reorderScopedPages error:', err);
    return false;
  }
}

export async function fetchPageBindings(seriesId, { throwOnError = false, signal } = {}) {
  try {
    const res = await fetch(`/api/admin/page-bindings/${encodeURIComponent(seriesId)}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    });
    if (!res.ok) throw new Error('Failed to fetch page bindings');
    return await res.json();
  } catch (err) {
    console.error('fetchPageBindings error:', err);
    if (throwOnError) throw err;
    return { seriesId, bindings: {}, warnings: [] };
  }
}

export async function updatePageBindings(seriesId, bindings) {
  clearLastPageBuilderDataError();
  try {
    const res = await fetch(`/api/admin/page-bindings/${encodeURIComponent(seriesId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bindings }),
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Failed to update page bindings');
      err.code = data.code || '';
      err.warnings = data.warnings || [];
      throw err;
    }
    return data;
  } catch (err) {
    rememberPageBuilderDataError(err, 'Failed to update page bindings');
    console.error('updatePageBindings error:', err);
    alert(err.message || 'Failed to update page bindings');
    return null;
  }
}

export async function updatePage(pageId, data) {
  clearLastPageBuilderDataError();
  try {
    const res = await fetch(`/api/admin/pages/${pageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(payload.error || 'Failed to update page');
      err.code = payload.code || '';
      err.warnings = payload.warnings || [];
      throw err;
    }
    return payload.page;
  } catch (err) {
    rememberPageBuilderDataError(err, 'Failed to update page');
    console.error('updatePage error:', err);
    return null;
  }
}

export async function fetchAssets() {
  try {
    const res = await fetch('/api/admin/assets', { cache: 'no-store', credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load assets');
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map((item) => ({
      path: item.path,
      label: item.name || item.path?.split('/').pop() || item.path,
      thumbSrc: item.path,
    }));
  } catch (err) {
    console.error('fetchAssets error:', err);
    return [];
  }
}

export async function uploadAsset(file, readFileAsBase64) {
  const payload = { file: { name: file.name, data: await readFileAsBase64(file) } };
  const res = await fetch('/api/admin/assets/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

export async function addSection(pageId, sectionType = 'row', layout = '1') {
  try {
    const res = await fetch(`/api/admin/pages/${pageId}/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionType, layout }),
    });
    if (!res.ok) throw new Error('Failed to add section');
    const data = await res.json();
    return data.section;
  } catch (err) {
    console.error('addSection error:', err);
    return null;
  }
}

export async function updateSection(sectionId, data, options = {}) {
  clearLastPageBuilderDataError();
  try {
    const res = await fetch(`/api/admin/sections/${sectionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(payload.error || 'Failed to update section');
      err.code = payload.code || '';
      err.warnings = payload.warnings || [];
      err.status = res.status;
      err.payload = payload;
      throw err;
    }
    return payload.section;
  } catch (err) {
    rememberPageBuilderDataError(err, 'Failed to update section');
    if (typeof options?.onError === 'function') {
      options.onError({
        message: err?.message || 'Failed to update section',
        code: err?.code || '',
        warnings: Array.isArray(err?.warnings) ? err.warnings : [],
        status: err?.status || 0,
        payload: err?.payload || null,
      });
    }
    console.error('updateSection error:', err);
    return null;
  }
}

export async function deleteSection(sectionId) {
  try {
    const res = await fetch(`/api/admin/sections/${sectionId}`, { method: 'DELETE' });
    return res.ok;
  } catch (err) {
    console.error('deleteSection error:', err);
    return false;
  }
}

export async function addModule(
  sectionId,
  moduleType,
  columnIndex = 0,
  config = {},
  sortIndex = null
) {
  try {
    const res = await fetch(`/api/admin/sections/${sectionId}/modules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moduleType,
        columnIndex,
        config,
        ...(sortIndex === null ? {} : { sortIndex }),
      }),
    });
    if (!res.ok) throw new Error('Failed to add module');
    return (await res.json()).module;
  } catch (err) {
    console.error('addModule error:', err);
    return null;
  }
}

export async function updateModule(moduleId, data) {
  clearLastPageBuilderDataError();
  try {
    const res = await fetch(`/api/admin/modules/${moduleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'same-origin',
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(payload.error || 'Failed to update module');
      error.code = payload.code || '';
      throw error;
    }
    return payload.module || null;
  } catch (err) {
    rememberPageBuilderDataError(err, 'Failed to update module');
    console.error('updateModule error:', err);
    return null;
  }
}

export async function moveModule(moduleId, targetSectionId, columnIndex, sortIndex) {
  try {
    const res = await fetch(`/api/admin/modules/${moduleId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetSectionId, columnIndex, sortIndex }),
    });
    if (!res.ok) throw new Error('Failed to move module');
    return (await res.json()).module;
  } catch (err) {
    console.error('moveModule error:', err);
    return null;
  }
}

export async function saveModulePlacements(pageId, placements) {
  clearLastPageBuilderDataError();
  try {
    const res = await fetch(`/api/admin/pages/${pageId}/modules/placements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placements }),
      credentials: 'same-origin',
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(payload.error || 'Failed to save module placements');
      err.code = payload.code || '';
      throw err;
    }
    return payload.page || null;
  } catch (err) {
    rememberPageBuilderDataError(err, 'Failed to save module placements');
    console.error('saveModulePlacements error:', err);
    return null;
  }
}

export async function reorderModules(sectionId, columnIndex, moduleIds) {
  try {
    const res = await fetch(`/api/admin/sections/${sectionId}/modules/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columnIndex, moduleIds }),
    });
    return res.ok;
  } catch (err) {
    console.error('reorderModules error:', err);
    return false;
  }
}

export async function deleteModule(moduleId) {
  try {
    const res = await fetch(`/api/admin/modules/${moduleId}`, { method: 'DELETE' });
    return res.ok;
  } catch (err) {
    console.error('deleteModule error:', err);
    return false;
  }
}

export async function reorderSections(pageId, sectionIds) {
  try {
    const res = await fetch(`/api/admin/pages/${pageId}/sections/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionIds }),
    });
    return res.ok;
  } catch (err) {
    console.error('reorderSections error:', err);
    return false;
  }
}

import { auditPagesFallbacks } from './header-config.js';

function normalizeRequiredString(value) {
  return String(value ?? '').trim();
}

function errorMessage(error, fallback = 'Unknown error') {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
}

function makeGateError(reason, message) {
  const error = new Error(message);
  error.reason = reason;
  return error;
}

function normalizeListError(reason, error) {
  return {
    reason,
    message: errorMessage(error),
  };
}

function normalizeDetailError(summary, error) {
  return {
    pageId: normalizeRequiredString(summary?.id) || '(missing)',
    slug: normalizeRequiredString(summary?.slug) || '(unknown)',
    reason: normalizeRequiredString(error?.reason) || 'detailFetchFailed',
    message: errorMessage(error),
  };
}

async function strictListPages(seriesId) {
  const res = await fetch(`/api/admin/pages?series_id=${encodeURIComponent(seriesId)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch page list (${res.status})`);
  }
  const data = await res.json();
  if (!Array.isArray(data?.pages)) {
    throw makeGateError('invalidPageList', 'Page list response did not include a pages array.');
  }
  return data.pages;
}

async function strictGetPage(pageId) {
  const res = await fetch(`/api/admin/pages/${encodeURIComponent(pageId)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch page detail (${res.status})`);
  }
  const data = await res.json();
  if (!data?.page || typeof data.page !== 'object' || Array.isArray(data.page)) {
    throw makeGateError('missingPageDetail', 'Page detail response did not include a page object.');
  }
  return data.page;
}

function buildGateResult({
  seriesId,
  pageSummaries = [],
  fullPages = [],
  listError = null,
  detailErrors = [],
}) {
  const completePageDetails = !listError && detailErrors.length === 0;
  const audit = auditPagesFallbacks(fullPages);
  return {
    seriesId,
    pageCount: pageSummaries.length,
    scannedPageIds: pageSummaries.map((page) => normalizeRequiredString(page?.id)).filter(Boolean),
    completePageDetails,
    listError,
    detailErrors,
    audit,
    retirementReady: completePageDetails && audit.clean,
  };
}

async function loadPageDetail(summary, getPage) {
  const pageId = normalizeRequiredString(summary?.id);
  if (!pageId) {
    throw makeGateError('missingPageId', 'Page summary did not include an id.');
  }

  let page;
  try {
    page = await getPage(pageId);
  } catch (error) {
    if (error?.reason) throw error;
    throw makeGateError('detailFetchFailed', errorMessage(error, 'Failed to fetch page detail.'));
  }

  if (!page || typeof page !== 'object' || Array.isArray(page)) {
    throw makeGateError('missingPageDetail', 'Page detail loader did not return a page object.');
  }
  if (!Array.isArray(page.sections)) {
    throw makeGateError('missingSections', 'Page detail did not include sections.');
  }
  return page;
}

export async function loadFallbackRetirementGate(seriesId, deps = {}) {
  const normalizedSeriesId = normalizeRequiredString(seriesId);
  if (!normalizedSeriesId) {
    return buildGateResult({
      seriesId: normalizedSeriesId,
      listError: {
        reason: 'missingSeriesId',
        message: 'seriesId is required.',
      },
    });
  }

  const listPages = deps.listPages || strictListPages;
  const getPage = deps.getPage || strictGetPage;
  let pageSummaries;

  try {
    pageSummaries = await listPages(normalizedSeriesId);
  } catch (error) {
    return buildGateResult({
      seriesId: normalizedSeriesId,
      listError: normalizeListError(error?.reason || 'listFetchFailed', error),
    });
  }

  if (!Array.isArray(pageSummaries)) {
    return buildGateResult({
      seriesId: normalizedSeriesId,
      listError: {
        reason: 'invalidPageList',
        message: 'listPages must resolve to an array of page summaries.',
      },
    });
  }

  const detailResults = await Promise.allSettled(
    pageSummaries.map((summary) => loadPageDetail(summary, getPage))
  );
  const fullPages = [];
  const detailErrors = [];

  detailResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      fullPages.push(result.value);
      return;
    }
    detailErrors.push(normalizeDetailError(pageSummaries[index], result.reason));
  });

  return buildGateResult({
    seriesId: normalizedSeriesId,
    pageSummaries,
    fullPages,
    detailErrors,
  });
}

import { el } from '../dom.js';
import { ANALYTICS_VISITOR_HISTORY_ENDPOINT } from '../state.js';
import { escapeHtml, formatDateTime, formatStat, formatTimeAgo } from './shared.js';

function createVisitorHistoryAnalytics() {
  let lastVisitorHistoryPayload = null;
  let visitorHistoryQuery = '';
  let visitorHistorySort = 'recent';
  let selectedVisitorHistoryKey = '';

  function getAnalyticsRange() {
    return (el.analyticsPagesRange?.value || '7d').trim();
  }

  function setVisitorHistoryStatus(message, isError = false) {
    if (!el.analyticsVisitorHistoryStatus) return;
    el.analyticsVisitorHistoryStatus.textContent = message || '';
    el.analyticsVisitorHistoryStatus.style.display = message ? 'block' : 'none';
    el.analyticsVisitorHistoryStatus.className = isError ? 'error-message' : 'success-message';
  }

  function formatVisitorKey(value) {
    const text = String(value || '').trim();
    if (!text) return 'Unknown visitor';
    if (text.length <= 18) return text;
    return `${text.slice(0, 8)}…${text.slice(-6)}`;
  }

  function getVisitorHistoryQuery() {
    return (el.analyticsVisitorHistorySearch?.value || '').trim().toLowerCase();
  }

  function getVisitorHistorySort() {
    return (el.analyticsVisitorHistorySort?.value || 'recent').trim();
  }

  function buildVisitorHistorySearchText(visitor) {
    const issues = Array.isArray(visitor?.issues) ? visitor.issues : [];
    const issueText = issues
      .map((issue) =>
        [
          issue?.seriesTitle,
          issue?.seriesId,
          issue?.entryTitle,
          issue?.entryDisplayNumber,
          issue?.finished ? 'finished' : 'in progress',
        ].join(' ')
      )
      .join(' ');
    return [
      visitor?.visitorKey,
      visitor?.landingPage,
      visitor?.lastPath,
      visitor?.referrer,
      visitor?.country,
      visitor?.browser,
      visitor?.device,
      issueText,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  function sortVisitorHistory(visitors, sortKey) {
    const list = [...visitors];
    list.sort((a, b) => {
      if (sortKey === 'pages') {
        return (Number(b?.pagesRead) || 0) - (Number(a?.pagesRead) || 0);
      }
      if (sortKey === 'started') {
        return (Number(b?.issuesStarted) || 0) - (Number(a?.issuesStarted) || 0);
      }
      if (sortKey === 'finished') {
        return (Number(b?.issuesFinished) || 0) - (Number(a?.issuesFinished) || 0);
      }
      const aTime = new Date(a?.lastSeen || 0).getTime() || 0;
      const bTime = new Date(b?.lastSeen || 0).getTime() || 0;
      return bTime - aTime;
    });
    return list;
  }

  function getFilteredVisitorHistory(payload) {
    const visitors = Array.isArray(payload?.visitors) ? payload.visitors : [];
    const filtered = visitorHistoryQuery
      ? visitors.filter((visitor) =>
          buildVisitorHistorySearchText(visitor).includes(visitorHistoryQuery)
        )
      : visitors;
    return sortVisitorHistory(filtered, visitorHistorySort);
  }

  function getSelectedVisitor(visitors) {
    if (!Array.isArray(visitors) || !visitors.length) {
      selectedVisitorHistoryKey = '';
      return null;
    }
    const active = visitors.find(
      (visitor) => String(visitor?.visitorKey || '') === selectedVisitorHistoryKey
    );
    if (active) return active;
    selectedVisitorHistoryKey = String(visitors[0]?.visitorKey || '');
    return visitors[0] || null;
  }

  function renderVisitorHistoryDetail(visitor) {
    if (!el.analyticsVisitorHistoryDetail) return;
    if (!visitor) {
      el.analyticsVisitorHistoryDetail.innerHTML =
        '<div class="analytics-detail-empty">Select a visitor to inspect their reading history.</div>';
      return;
    }

    const issues = Array.isArray(visitor?.issues) ? visitor.issues : [];
    const sourceBits = [
      visitor?.referrer || 'Direct',
      visitor?.country || '',
      visitor?.browser || '',
      visitor?.device || '',
    ]
      .filter(Boolean)
      .join(' · ');
    const issueList = issues.length
      ? issues
          .map((issue) => {
            const progressParts = [`${formatStat(issue?.pagesRead)} pages`];
            if (issue?.maxPageReached) {
              progressParts.push(`max page ${formatStat(issue.maxPageReached)}`);
            }
            if (issue?.totalPages) {
              progressParts.push(`${formatStat(issue.totalPages)} total`);
            }
            progressParts.push(issue?.finished ? 'finished' : 'in progress');
            const issueLabel = issue?.entryTitle || `Entry ${issue?.entryDisplayNumber || '?'}`;
            const seriesLabel = issue?.seriesTitle || issue?.seriesId || 'Unknown series';
            return `
              <div class="analytics-visitor-issue">
                <div class="analytics-visitor-issue-title">${escapeHtml(seriesLabel)} · ${escapeHtml(issueLabel)}</div>
                <div class="analytics-visitor-issue-meta">${escapeHtml(progressParts.join(' · '))}</div>
              </div>
            `;
          })
          .join('')
      : '<div class="analytics-pages-empty" style="margin: 0;">No reader activity in this range.</div>';

    el.analyticsVisitorHistoryDetail.innerHTML = `
      <div class="analytics-visitor-detail-card">
        <div class="analytics-visitor-detail-header">
          <div>
            <div class="analytics-visitor-key" title="${escapeHtml(visitor?.visitorKey || '')}">${escapeHtml(formatVisitorKey(visitor?.visitorKey))}</div>
            <div class="analytics-visitor-summary-sub">${escapeHtml(sourceBits || 'Visitor metadata unavailable')}</div>
          </div>
          <div class="analytics-visitor-detail-lastseen">${escapeHtml(formatTimeAgo(visitor?.lastSeen))}</div>
        </div>
        <div class="analytics-visitor-detail-metrics">
          <span>${formatStat(visitor?.pagesRead)} pages read</span>
          <span>${formatStat(visitor?.issuesStarted)} issues started</span>
          <span>${formatStat(visitor?.issuesFinished)} issues finished</span>
        </div>
        <div class="analytics-visitor-fields">
          <div class="analytics-visitor-field"><span class="analytics-visitor-field-label">Visitor Key</span><span>${escapeHtml(visitor?.visitorKey || '—')}</span></div>
          <div class="analytics-visitor-field"><span class="analytics-visitor-field-label">First Seen</span><span>${escapeHtml(formatDateTime(visitor?.firstSeen))}</span></div>
          <div class="analytics-visitor-field"><span class="analytics-visitor-field-label">Last Seen</span><span>${escapeHtml(formatDateTime(visitor?.lastSeen))}</span></div>
          <div class="analytics-visitor-field"><span class="analytics-visitor-field-label">Landing Page</span><span>${escapeHtml(visitor?.landingPage || '—')}</span></div>
          <div class="analytics-visitor-field"><span class="analytics-visitor-field-label">Last Path</span><span>${escapeHtml(visitor?.lastPath || '—')}</span></div>
          <div class="analytics-visitor-field"><span class="analytics-visitor-field-label">Referrer</span><span>${escapeHtml(visitor?.referrer || 'Direct')}</span></div>
          <div class="analytics-visitor-field"><span class="analytics-visitor-field-label">Country</span><span>${escapeHtml(visitor?.country || '—')}</span></div>
          <div class="analytics-visitor-field"><span class="analytics-visitor-field-label">Browser</span><span>${escapeHtml(visitor?.browser || '—')}</span></div>
          <div class="analytics-visitor-field"><span class="analytics-visitor-field-label">Device</span><span>${escapeHtml(visitor?.device || '—')}</span></div>
        </div>
        <div class="analytics-visitor-detail-section">
          <div class="analytics-visitor-detail-title">Issue History</div>
          <div class="analytics-visitor-issues">${issueList}</div>
        </div>
      </div>
    `;
  }

  function renderVisitorHistoryView() {
    if (!el.analyticsVisitorHistoryList) return;
    const existingBody = el.analyticsVisitorHistoryList.querySelector(
      '.analytics-visitor-list-body'
    );
    const preservedScrollTop = existingBody instanceof HTMLElement ? existingBody.scrollTop : 0;
    const payload = lastVisitorHistoryPayload || {};
    const visitors = getFilteredVisitorHistory(payload);
    const returned =
      Number(payload?.returned) || (Array.isArray(payload?.visitors) ? payload.visitors.length : 0);
    const totalVisitors = Number(payload?.totalVisitors) || returned;
    const ts = payload?.generatedAt ? new Date(payload.generatedAt) : null;
    const tsText = ts ? ts.toLocaleString() : 'just now';
    const querySuffix = visitorHistoryQuery
      ? ` · ${formatStat(visitors.length)} match${visitors.length === 1 ? '' : 'es'}`
      : '';

    if (el.analyticsVisitorHistoryMeta) {
      el.analyticsVisitorHistoryMeta.textContent = `Showing ${formatStat(returned)} of ${formatStat(totalVisitors)} visitors${querySuffix}. Updated ${tsText}.`;
    }

    if (!Array.isArray(payload?.visitors) || !payload.visitors.length) {
      el.analyticsVisitorHistoryList.innerHTML =
        '<div class="analytics-pages-empty">No visitor history for this range yet.</div>';
      renderVisitorHistoryDetail(null);
      return;
    }

    if (!visitors.length) {
      el.analyticsVisitorHistoryList.innerHTML =
        '<div class="analytics-pages-empty">No visitors match the current search.</div>';
      renderVisitorHistoryDetail(null);
      return;
    }

    const selectedVisitor = getSelectedVisitor(visitors);
    el.analyticsVisitorHistoryList.innerHTML = `
      <div class="analytics-visitor-list-head">
        <span>Recent Path</span>
        <span>Last Seen</span>
        <span>Source</span>
        <span>Activity</span>
      </div>
      <div class="analytics-visitor-list-body">
        ${visitors
          .map((visitor) => {
            const visitorKey = String(visitor?.visitorKey || '');
            const contextBits = [
              visitor?.referrer || 'Direct',
              visitor?.landingPage && visitor?.landingPage !== visitor?.lastPath
                ? `Landing ${visitor.landingPage}`
                : '',
              `ID ${formatVisitorKey(visitorKey)}`,
            ]
              .filter(Boolean)
              .join(' · ');
            const sourceBits = [
              visitor?.country || '',
              visitor?.browser || '',
              visitor?.device || '',
            ]
              .filter(Boolean)
              .join(' · ');
            const primaryPath = visitor?.lastPath || visitor?.landingPage || 'No path recorded';
            const isActive = visitorKey === selectedVisitorHistoryKey;
            return `
              <button
                type="button"
                class="analytics-visitor-list-row ${isActive ? 'is-active' : ''}"
                data-visitor-key="${escapeHtml(visitorKey)}"
              >
                <span class="analytics-visitor-list-col analytics-visitor-list-col--identity">
                  <span class="analytics-visitor-list-title" title="${escapeHtml(primaryPath)}">${escapeHtml(primaryPath)}</span>
                  <span class="analytics-visitor-list-sub" title="${escapeHtml(contextBits)}">${escapeHtml(contextBits)}</span>
                </span>
                <span class="analytics-visitor-list-col analytics-visitor-list-col--last" title="${escapeHtml(formatDateTime(visitor?.lastSeen))}">
                  ${escapeHtml(formatTimeAgo(visitor?.lastSeen))}
                </span>
                <span class="analytics-visitor-list-col analytics-visitor-list-col--source" title="${escapeHtml(sourceBits || visitor?.referrer || 'Direct')}">
                  ${escapeHtml(sourceBits || visitor?.referrer || 'Direct')}
                </span>
                <span class="analytics-visitor-list-col analytics-visitor-list-col--activity">
                  <span class="analytics-visitor-pill">${formatStat(visitor?.pagesRead)} pages</span>
                  <span class="analytics-visitor-pill">${formatStat(visitor?.issuesStarted)} started</span>
                  <span class="analytics-visitor-pill">${formatStat(visitor?.issuesFinished)} finished</span>
                </span>
              </button>
            `;
          })
          .join('')}
      </div>
    `;
    const nextBody = el.analyticsVisitorHistoryList.querySelector('.analytics-visitor-list-body');
    if (nextBody instanceof HTMLElement) {
      nextBody.scrollTop = preservedScrollTop;
    }
    renderVisitorHistoryDetail(selectedVisitor);
  }

  function renderVisitorHistory(payload) {
    lastVisitorHistoryPayload = payload || {};
    renderVisitorHistoryView();
  }

  async function loadVisitorHistory({ showLoading = true } = {}) {
    if (!el.analyticsVisitorHistoryList) return null;
    const params = new URLSearchParams({
      range: getAnalyticsRange(),
      limit: '50',
    });

    if (showLoading) {
      if (el.analyticsVisitorHistoryMeta) {
        el.analyticsVisitorHistoryMeta.textContent = '';
      }
      if (el.analyticsVisitorHistoryDetail) {
        el.analyticsVisitorHistoryDetail.innerHTML =
          '<div class="analytics-detail-empty">Loading visitor history…</div>';
      }
      el.analyticsVisitorHistoryList.innerHTML =
        '<div class="analytics-pages-empty">Loading visitor history…</div>';
      setVisitorHistoryStatus('Loading visitor history…');
    }

    try {
      const res = await fetch(`${ANALYTICS_VISITOR_HISTORY_ENDPOINT}?${params.toString()}`, {
        cache: 'no-store',
      });
      let payload = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      if (!res.ok) {
        const errorText =
          (payload && typeof payload === 'object' && payload.error) || `HTTP ${res.status}`;
        throw new Error(errorText);
      }

      renderVisitorHistory(payload || {});
      setVisitorHistoryStatus('');
      return payload || {};
    } catch (err) {
      lastVisitorHistoryPayload = null;
      if (el.analyticsVisitorHistoryMeta) {
        el.analyticsVisitorHistoryMeta.textContent = '';
      }
      if (el.analyticsVisitorHistoryDetail) {
        el.analyticsVisitorHistoryDetail.innerHTML =
          '<div class="analytics-detail-empty">Visitor details will appear here.</div>';
      }
      el.analyticsVisitorHistoryList.innerHTML =
        '<div class="analytics-pages-empty">No visitor history available.</div>';
      setVisitorHistoryStatus(
        `Analytics error: ${err?.message || 'Unable to load visitor history.'}`,
        true
      );
      return null;
    }
  }

  function initVisitorHistoryControls() {
    visitorHistoryQuery = getVisitorHistoryQuery();
    visitorHistorySort = getVisitorHistorySort();

    if (el.analyticsVisitorHistorySearch && !el.analyticsVisitorHistorySearch.dataset.bound) {
      el.analyticsVisitorHistorySearch.dataset.bound = 'true';
      el.analyticsVisitorHistorySearch.addEventListener('input', () => {
        visitorHistoryQuery = getVisitorHistoryQuery();
        renderVisitorHistoryView();
      });
    }

    if (el.analyticsVisitorHistorySort && !el.analyticsVisitorHistorySort.dataset.bound) {
      el.analyticsVisitorHistorySort.dataset.bound = 'true';
      el.analyticsVisitorHistorySort.addEventListener('change', () => {
        visitorHistorySort = getVisitorHistorySort();
        renderVisitorHistoryView();
      });
    }

    if (el.analyticsVisitorHistoryList && !el.analyticsVisitorHistoryList.dataset.bound) {
      el.analyticsVisitorHistoryList.dataset.bound = 'true';
      el.analyticsVisitorHistoryList.addEventListener('click', (event) => {
        const row = event.target.closest('.analytics-visitor-list-row');
        if (!row || !el.analyticsVisitorHistoryList.contains(row)) return;
        selectedVisitorHistoryKey = row.dataset.visitorKey || '';
        renderVisitorHistoryView();
      });
    }
  }

  return {
    initVisitorHistoryControls,
    loadVisitorHistory,
  };
}

export { createVisitorHistoryAnalytics };

import { el } from '../dom.js';
import { ANALYTICS_READER_ENDPOINT, ANALYTICS_READER_SERIES_ENDPOINT } from '../state.js';
import {
  escapeHtml,
  formatBucketLabel,
  formatPercent,
  formatRangeLabel,
  formatShortDate,
  formatStat,
  isValidRange,
} from './shared.js';

const WEEKLY_DIGEST_ENDPOINT = '/api/admin/analytics/weekly-digest';

const HEALTH_THRESHOLDS = {
  finishRate: { good: 0.6, concern: 0.4 },
  weekChange: { good: 0.1, concern: -0.1 },
};

function createReaderAnalytics() {
  let lastWeeklyDigest = null;
  const activeReaderDetails = new Map();
  let lastReaderPayload = null;
  let lastReaderSeriesFilter = 'all';

  function getReaderRange() {
    return (el.analyticsReaderRange?.value || el.analyticsPagesRange?.value || '7d').trim();
  }

  function getReaderSeriesFilter() {
    return (el.analyticsReaderSeries?.value || 'all').trim();
  }

  function setReaderStatus(message, isError = false) {
    if (!el.analyticsReaderStatus) return;
    el.analyticsReaderStatus.textContent = message || '';
    el.analyticsReaderStatus.style.display = message ? 'block' : 'none';
    el.analyticsReaderStatus.className = isError ? 'error-message' : 'success-message';
  }

  function calculateHealthStatus(readerPayload, weeklyDigest) {
    const finishRate = Number(readerPayload?.finishRate) || 0;
    const changes = weeklyDigest?.changes || {};
    const thisWeek = weeklyDigest?.thisWeek || {};

    let status = 'neutral';
    let title = 'Content is performing steadily';
    let summary = 'Your reader engagement is holding stable.';

    const readsChange = changes.reads?.percent || 0;

    if (
      finishRate >= HEALTH_THRESHOLDS.finishRate.good ||
      readsChange >= HEALTH_THRESHOLDS.weekChange.good
    ) {
      status = 'good';
      title = 'Your content is performing well';
      if (finishRate >= HEALTH_THRESHOLDS.finishRate.good && readsChange > 0) {
        summary = `Readers are engaged with a ${Math.round(finishRate * 100)}% start-to-finish rate and page reads are growing.`;
      } else if (finishRate >= HEALTH_THRESHOLDS.finishRate.good) {
        summary = `Strong ${Math.round(finishRate * 100)}% start-to-finish rate shows readers are completing your content.`;
      } else {
        summary = `Page reads are up ${Math.round(readsChange * 100)}% from last week.`;
      }
    } else if (
      finishRate < HEALTH_THRESHOLDS.finishRate.concern &&
      readsChange < HEALTH_THRESHOLDS.weekChange.concern
    ) {
      status = 'concern';
      title = 'Content needs attention';
      summary = `Start-to-finish rate (${Math.round(finishRate * 100)}%) and page reads are both down. Consider reviewing recent entries.`;
    } else if (finishRate < HEALTH_THRESHOLDS.finishRate.concern) {
      status = 'concern';
      title = 'Readers are dropping off early';
      summary = `Only ${Math.round(finishRate * 100)}% of starts convert to finishes. Review your opening pages and pacing.`;
    } else if (readsChange > 0) {
      summary = `Page reads are up ${Math.round(readsChange * 100)}% this week with ${Math.round(finishRate * 100)}% start-to-finish rate.`;
    } else if (readsChange < 0) {
      summary = `Page reads are down ${Math.round(Math.abs(readsChange) * 100)}% but start-to-finish rate is ${Math.round(finishRate * 100)}%.`;
    }

    return { status, title, summary, finishRate, changes, thisWeek };
  }

  function formatTrendHtml(changeObj) {
    if (!changeObj || typeof changeObj.percent !== 'number') {
      return { html: '', className: 'trend-flat' };
    }
    const pct = changeObj.percent;
    const pctStr = Math.round(Math.abs(pct) * 100);
    if (pct > 0.01) {
      return { html: `↑${pctStr}%`, className: 'trend-up' };
    }
    if (pct < -0.01) {
      return { html: `↓${pctStr}%`, className: 'trend-down' };
    }
    return { html: '→', className: 'trend-flat' };
  }

  function renderHealthIndicator() {
    if (!el.healthDot || !el.healthTitle) return;

    const health = calculateHealthStatus(lastReaderPayload, lastWeeklyDigest);

    el.healthDot.className = `analytics-health-dot ${health.status}`;
    el.healthTitle.textContent = health.title;
    el.healthTitle.className = `analytics-health-title stat-${health.status}`;
    if (el.healthSummary) {
      el.healthSummary.textContent = health.summary;
    }
  }

  async function fetchWeeklyDigest() {
    try {
      const res = await fetch(WEEKLY_DIGEST_ENDPOINT, { credentials: 'include' });
      if (!res.ok) {
        lastWeeklyDigest = null;
        return null;
      }
      const data = await res.json();
      lastWeeklyDigest = data;
      return data;
    } catch {
      lastWeeklyDigest = null;
      return null;
    }
  }

  function generateInsightSentence(payload) {
    const entryViews = payload?.entryViews || [];
    if (!entryViews.length) return '';

    const top = entryViews[0];
    const topLabel = top?.label || top?.entryTitle || 'Unknown';
    const topReads = top?.count || 0;

    const topRate = (payload?.entryRates || []).find(
      (item) =>
        String(item?.seriesId || '') === String(top?.seriesId || '') &&
        Number(item?.displayNumber) === Number(top?.displayNumber)
    );
    const finishRate = Number.isFinite(Number(topRate?.completionRate))
      ? Math.round(Number(topRate.completionRate) * 100)
      : null;

    if (finishRate !== null) {
      return `${topLabel} leads the selected range with ${topReads} pages read and a ${finishRate}% start-to-finish rate.`;
    }
    return `${topLabel} leads the selected range with ${topReads} pages read.`;
  }

  function initReaderTabs() {
    const tabs = document.querySelectorAll('.analytics-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((item) => item.classList.remove('active'));
        tab.classList.add('active');

        const tabName = tab.dataset.tab;
        if (el.tabEntry) {
          el.tabEntry.classList.toggle('active', tabName === 'entry');
        }
        if (el.tabSeries) {
          el.tabSeries.classList.toggle('active', tabName === 'series');
        }
      });
    });
  }

  function normalizeAnalyticsItems(items, labelFn, valueFn) {
    const list = Array.isArray(items) ? items : [];
    return list.map((item) => {
      const labelRaw =
        typeof labelFn === 'function' ? labelFn(item) : item?.label || item?.value || 'Unknown';
      const valueRaw =
        typeof valueFn === 'function' ? valueFn(item) : item?.value || item?.label || labelRaw;
      return {
        label: String(labelRaw || 'Unknown'),
        value: String(valueRaw || labelRaw || 'Unknown'),
        count: Number(item?.count ?? item?.views ?? item?.total ?? item?.value ?? 0) || 0,
        subLabel: item?.subLabel || '',
        delta: item?.delta,
        deltaPct: item?.deltaPct,
        completionRate: item?.completionRate,
        starts: item?.starts,
        finishes: item?.finishes,
        pageViews: item?.pageViews,
        entryKey: item?.entryKey || '',
        displayNumber: item?.displayNumber,
        seriesId: item?.seriesId || '',
        seriesTitle: item?.seriesTitle || '',
        entryLabel: item?.entryLabel || '',
        avgStopPage: item?.avgStopPage,
        medianStopPage: item?.medianStopPage,
      };
    });
  }

  function formatDeltaText(item) {
    const rawDelta = Number(item?.delta);
    if (!Number.isFinite(rawDelta) || rawDelta === 0) return '';
    const deltaPct = Number(item?.deltaPct);
    if (Number.isFinite(deltaPct) && deltaPct !== 0) {
      const sign = deltaPct > 0 ? '+' : '';
      const pct = Math.round(deltaPct * 100);
      return `Δ ${sign}${pct}% vs prev`;
    }
    const sign = rawDelta > 0 ? '+' : '';
    return `Δ ${sign}${formatStat(rawDelta)} vs prev`;
  }

  function formatStartFinishText(item) {
    const starts = Number(item?.starts);
    const finishes = Number(item?.finishes);
    const startText = Number.isFinite(starts) ? formatStat(starts) : '0';
    const finishText = Number.isFinite(finishes) ? formatStat(finishes) : '0';
    return `${startText} starts · ${finishText} finishes`;
  }

  function extractSeriesName(label) {
    const parts = String(label || '').split(' | ');
    return (parts[0] || '').trim();
  }

  function collectSeriesOptions(payload) {
    const seriesViews = Array.isArray(payload?.seriesViews) ? payload.seriesViews : [];
    const fromSeriesViews = seriesViews
      .map((item) => String(item?.seriesTitle || item?.label || item?.value || '').trim())
      .filter(Boolean);
    if (fromSeriesViews.length) {
      return Array.from(new Set(fromSeriesViews));
    }

    const entryViews = Array.isArray(payload?.entryViews) ? payload.entryViews : [];
    const seriesSet = new Set();
    entryViews.forEach((item) => {
      const series = item?.seriesTitle || '';
      if (series) seriesSet.add(series);
    });
    return Array.from(seriesSet);
  }

  function updateReaderSeriesOptions(payload) {
    if (!el.analyticsReaderSeries) return 'all';
    const current = getReaderSeriesFilter() || 'all';
    const seriesOptions = collectSeriesOptions(payload);
    const normalized = ['all', ...seriesOptions];
    const nextValue = normalized.includes(current) ? current : 'all';

    const existing = Array.from(el.analyticsReaderSeries.options).map((option) => option.value);
    const needsUpdate =
      existing.length !== normalized.length ||
      normalized.some((value, index) => value !== existing[index]);

    if (needsUpdate) {
      el.analyticsReaderSeries.innerHTML = '';
      normalized.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value === 'all' ? 'All series' : value;
        el.analyticsReaderSeries.appendChild(option);
      });
    }

    el.analyticsReaderSeries.value = nextValue;
    return nextValue;
  }

  function filterEntryItems(items, seriesFilter) {
    const list = Array.isArray(items) ? items : [];
    if (!seriesFilter || seriesFilter === 'all') return list;
    return list.filter((item) => {
      const seriesTitle = item?.seriesTitle || '';
      const seriesId = item?.seriesId || '';
      if (seriesTitle === seriesFilter || seriesId === seriesFilter) {
        return true;
      }
      const label = item?.entryLabel || item?.value || item?.label || '';
      const extractedSeries = extractSeriesName(label);
      return extractedSeries === seriesFilter;
    });
  }

  function clearEntryDetails() {
    const targets = new Set([el.analyticsEntryReads?.id, el.analyticsEntryRates?.id]);
    targets.forEach((targetId) => {
      if (targetId) activeReaderDetails.delete(targetId);
    });
  }

  function renderReaderSummary(payload) {
    if (!payload) return;
    if (el.statEntryReads) {
      el.statEntryReads.textContent = formatStat(payload.entryReadsTotal);
    }
    if (el.statEntryStarts) {
      el.statEntryStarts.textContent = formatStat(payload.entryStartsTotal);
    }
    if (el.statFinishRate) {
      el.statFinishRate.textContent = formatPercent(payload.finishRate);
    }
    if (el.statUniqueVisitors) {
      el.statUniqueVisitors.textContent = formatStat(payload.uniqueVisitors);
    }
    updateSummaryTrends();
  }

  function updateSummaryTrends() {
    const changes = lastWeeklyDigest?.changes || {};

    if (el.statEntryReadsTrend) {
      const trend = formatTrendHtml(changes.reads);
      el.statEntryReadsTrend.textContent = trend.html;
      el.statEntryReadsTrend.className = `analytics-trend ${trend.className}`;
    }
    if (el.statEntryStartsTrend) {
      const trend = formatTrendHtml(changes.starts);
      el.statEntryStartsTrend.textContent = trend.html;
      el.statEntryStartsTrend.className = `analytics-trend ${trend.className}`;
    }
    if (el.statFinishRateTrend) {
      const trend = formatTrendHtml(changes.completionRate);
      el.statFinishRateTrend.textContent = trend.html;
      el.statFinishRateTrend.className = `analytics-trend ${trend.className}`;
    }
  }

  function renderAnalyticsList(target, items, emptyText, labelFn, options = {}) {
    if (!target) return;
    const list = normalizeAnalyticsItems(items, labelFn, options.valueFn);
    target.dataset.title = options.title || '';
    if (!list.length) {
      target.innerHTML = `<div class="analytics-pages-empty">${escapeHtml(emptyText)}</div>`;
      return;
    }

    const rankFn =
      typeof options.rankFn === 'function' ? options.rankFn : (item) => Number(item.count) || 0;
    const counts = list.map((item) => Number(rankFn(item)) || 0);
    const avg = counts.length ? counts.reduce((acc, value) => acc + value, 0) / counts.length : 0;
    const max = Math.max(...counts);

    target.innerHTML = list
      .map((item, index) => {
        const label = escapeHtml(item.label);
        const subLabel =
          typeof options.subLabelFn === 'function' ? options.subLabelFn(item) : item.subLabel;
        const safeSubLabel = subLabel ? escapeHtml(subLabel) : '';
        const subHtml = subLabel ? `<div class="analytics-reader-sub">${safeSubLabel}</div>` : '';
        const value = escapeHtml(item.value);
        const formatted =
          typeof options.valueFormatter === 'function'
            ? options.valueFormatter(item)
            : formatStat(item.count);
        const countAttr = escapeHtml(String(item.count ?? ''));
        const rateAttr = escapeHtml(String(item.completionRate ?? ''));
        const startsAttr = escapeHtml(String(item.starts ?? ''));
        const finishesAttr = escapeHtml(String(item.finishes ?? ''));
        const pageViewsAttr = escapeHtml(String(item.pageViews ?? ''));
        const entryKeyAttr = escapeHtml(String(item.entryKey ?? ''));
        const rankValue = Number(rankFn(item)) || 0;

        let colorClass = '';
        if (counts.length > 1) {
          if (index === 0 && rankValue === max) {
            colorClass = 'stat-good';
          } else if (rankValue < avg * 0.5) {
            colorClass = 'stat-concern';
          }
        }

        return `
          <div class="analytics-reader-item ${colorClass}" data-label="${label}" data-value="${value}" data-entry-key="${entryKeyAttr}" data-count="${countAttr}" data-rate="${rateAttr}" data-starts="${startsAttr}" data-finishes="${finishesAttr}" data-page-views="${pageViewsAttr}" data-sub="${safeSubLabel}" data-event="${options.eventName || ''}" data-property="${options.propertyName || ''}" data-metric="${options.metric || ''}">
            <div class="analytics-reader-label">
              <div>${label}</div>
              ${subHtml}
            </div>
            <div class="analytics-reader-value">${escapeHtml(formatted)}</div>
          </div>
        `;
      })
      .join('');
  }

  function renderReaderDetail(target, detail) {
    if (!target || !detail) return;
    const title = escapeHtml(detail.title || 'Reader Analytics');
    const label = escapeHtml(detail.label || detail.value || 'Unknown');
    const rangeKey = isValidRange(detail.range) ? detail.range : '7d';
    const rangeLabel = formatRangeLabel(rangeKey);
    const metric = detail.metric || 'page_views';
    const isRatioMetric = metric === 'completion_rate';
    const metaItems = [];
    if (isRatioMetric) {
      metaItems.push({
        label: 'Rate',
        value: formatPercent(detail.completionRate),
        note:
          detail.pageViews !== null && detail.pageViews !== undefined
            ? `${formatStat(detail.pageViews)} pages read`
            : '',
      });
      metaItems.push({
        label: 'Starts',
        value: formatStat(detail.starts),
        note: '',
      });
      metaItems.push({
        label: 'Finishes',
        value: formatStat(detail.finishes),
        note: detail.subLabel || '',
      });
    } else {
      metaItems.push({
        label: 'Pages Read',
        value: formatStat(detail.count),
        note: detail.subLabel || '',
      });
    }
    const metaHtml = metaItems.length
      ? `
        <div class="analytics-detail-meta">
          ${metaItems
            .map(
              (item) => `
            <div class="analytics-detail-meta-item">
              <div class="analytics-detail-meta-label">${escapeHtml(item.label)}</div>
              <div class="analytics-detail-meta-value">${escapeHtml(item.value)}</div>
              ${item.note ? `<div class="analytics-detail-meta-note">${escapeHtml(item.note)}</div>` : ''}
            </div>
          `
            )
            .join('')}
        </div>
      `
      : '';
    const hasSeries = Array.isArray(detail.series) && detail.series.length;
    const startLabel = hasSeries ? formatShortDate(detail.series[0]?.start) : '';
    const endLabel = hasSeries ? formatShortDate(detail.series[detail.series.length - 1]?.end) : '';

    let chartHtml = '<div class="analytics-detail-empty">No data yet.</div>';
    if (detail.loading) {
      chartHtml = '<div class="analytics-detail-empty">Loading chart…</div>';
    } else if (detail.error) {
      chartHtml = `<div class="error-message" style="margin: 0;">${escapeHtml(detail.error)}</div>`;
    } else if (hasSeries) {
      const max = isRatioMetric
        ? 100
        : detail.series.reduce((acc, point) => Math.max(acc, Number(point.count) || 0), 0);
      const bars = detail.series
        .map((point) => {
          const rate = Number(point?.completionRate) || 0;
          const count = Number(point.count) || 0;
          const pointStarts = Number(point?.starts) || 0;
          const pointFinishes = Number(point?.finishes) || 0;
          const metricValue = isRatioMetric ? Math.max(0, Math.min(rate * 100, 100)) : count;
          const pct = max > 0 ? Math.max(0, (metricValue / max) * 100) : 0;
          const height = metricValue > 0 ? Math.max(pct, 3) : 0;
          const titleText = isRatioMetric
            ? `${formatShortDate(point.start)}: ${formatPercent(rate)} (${formatStat(pointStarts)} starts · ${formatStat(pointFinishes)} finishes)`
            : `${formatShortDate(point.start)}: ${formatStat(count)} pages read`;
          const countLabel = isRatioMetric
            ? pointStarts || pointFinishes
              ? formatPercent(rate)
              : ''
            : count > 0
              ? formatStat(count)
              : '';
          const timeLabel = formatBucketLabel(rangeKey, point.end || point.start);
          return `
            <div class="analytics-detail-bar-wrap">
              <div class="analytics-detail-bar-body">
                <div class="analytics-detail-bar-count" title="${escapeHtml(
                  countLabel || '0'
                )}">${escapeHtml(countLabel)}</div>
                <div class="analytics-detail-bar-slot">
                  <div class="analytics-detail-bar" title="${escapeHtml(
                    titleText
                  )}" style="height: ${height.toFixed(1)}%"></div>
                </div>
              </div>
              <div class="analytics-detail-bar-time" title="${escapeHtml(
                timeLabel
              )}">${escapeHtml(timeLabel)}</div>
            </div>
          `;
        })
        .join('');

      chartHtml = `
        <div class="analytics-detail-chart">
          <div class="analytics-detail-bars">${bars}</div>
          <div class="analytics-detail-axis">
            <span>${escapeHtml(startLabel)}</span>
            <span>${escapeHtml(endLabel)}</span>
          </div>
        </div>
      `;
    }

    target.innerHTML = `
      <div class="analytics-detail">
        <button class="btn-secondary analytics-detail-back" type="button">← Back</button>
        <div class="analytics-detail-controls">
          <label class="settings-label">Range</label>
          <select class="form-input analytics-detail-select" data-detail-range>
            <option value="24h" ${rangeKey === '24h' ? 'selected' : ''}>Last 24h</option>
            <option value="7d" ${rangeKey === '7d' ? 'selected' : ''}>Last 7d</option>
            <option value="30d" ${rangeKey === '30d' ? 'selected' : ''}>Last 30d</option>
          </select>
        </div>
        <div class="analytics-detail-title">${title}</div>
        <div class="analytics-detail-label">${label}</div>
        <div class="analytics-detail-range">${escapeHtml(rangeLabel)}</div>
        ${chartHtml}
        ${metaHtml}
      </div>
    `;
  }

  async function loadReaderSeries(target, detail, { showLoading = true } = {}) {
    if (!target || !detail) return;
    const requestId = (detail.requestId || 0) + 1;
    detail.requestId = requestId;
    detail.loading = showLoading;
    if (showLoading) renderReaderDetail(target, detail);

    const range = detail.range || getReaderRange();
    const params = new URLSearchParams({
      event: detail.eventName || '',
      property: detail.propertyName || '',
      value: detail.value || '',
      metric: detail.metric || 'page_views',
      range,
      points: '12',
    });
    if (detail.entryKey) {
      params.set('entry_key', detail.entryKey);
    }

    try {
      const res = await fetch(`${ANALYTICS_READER_SERIES_ENDPOINT}?${params.toString()}`, {
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

      if (detail.requestId !== requestId) return;
      detail.series = Array.isArray(payload?.series) ? payload.series : [];
      detail.error = null;
    } catch (err) {
      if (detail.requestId !== requestId) return;
      detail.series = [];
      detail.error = err?.message || 'Unable to load item history.';
    }

    if (detail.requestId !== requestId) return;
    detail.loading = false;
    renderReaderDetail(target, detail);
  }

  function bindReaderInteractions(target) {
    if (!target || target.dataset.bound === 'true') return;
    target.dataset.bound = 'true';
    target.addEventListener('click', (event) => {
      const backButton = event.target.closest('.analytics-detail-back');
      if (backButton && target.contains(backButton)) {
        activeReaderDetails.delete(target.id);
        renderReaderAnalytics(lastReaderPayload || {});
        return;
      }

      const item = event.target.closest('.analytics-reader-item');
      if (!item || !target.contains(item)) return;
      const value = item.dataset.value || '';
      const label = item.dataset.label || value || 'Unknown';
      const subLabel = item.dataset.sub || '';
      const countRaw = item.dataset.count;
      const countValue = countRaw !== undefined && countRaw !== '' ? Number(countRaw) : null;
      const rateRaw = item.dataset.rate;
      const startsRaw = item.dataset.starts;
      const finishesRaw = item.dataset.finishes;
      const pageViewsRaw = item.dataset.pageViews;
      const entryKey = item.dataset.entryKey || '';
      const eventName = item.dataset.event || '';
      const propertyName = item.dataset.property || '';
      const metric = item.dataset.metric || 'page_views';
      if (!value || !eventName || !propertyName) return;

      const detail = {
        title: target.dataset.title || 'Reader Analytics',
        label,
        value,
        subLabel,
        count: metric === 'completion_rate' || Number.isNaN(countValue) ? null : countValue,
        completionRate: rateRaw !== undefined && rateRaw !== '' ? Number(rateRaw) : null,
        starts: startsRaw !== undefined && startsRaw !== '' ? Number(startsRaw) : null,
        finishes: finishesRaw !== undefined && finishesRaw !== '' ? Number(finishesRaw) : null,
        pageViews: pageViewsRaw !== undefined && pageViewsRaw !== '' ? Number(pageViewsRaw) : null,
        entryKey,
        metric,
        eventName,
        propertyName,
        range: getReaderRange(),
        rangeLocked: false,
        series: [],
        loading: true,
        error: null,
      };
      activeReaderDetails.set(target.id, detail);
      renderReaderDetail(target, detail);
      loadReaderSeries(target, detail, { showLoading: true });
    });

    target.addEventListener('change', (event) => {
      const select = event.target.closest('.analytics-detail-select');
      if (!select || !target.contains(select)) return;
      const detail = activeReaderDetails.get(target.id);
      if (!detail) return;
      const nextRange = select.value || '7d';
      if (!isValidRange(nextRange)) return;
      detail.range = nextRange;
      detail.rangeLocked = true;
      detail.loading = true;
      detail.error = null;
      renderReaderDetail(target, detail);
      loadReaderSeries(target, detail, { showLoading: true });
    });
  }

  function renderReaderCard(card) {
    const target = card?.target;
    if (!target) return;
    bindReaderInteractions(target);

    const detail = activeReaderDetails.get(target.id);
    if (detail) {
      detail.title = card.title || detail.title;
      detail.eventName = card.eventName || detail.eventName;
      detail.propertyName = card.propertyName || detail.propertyName;
      detail.metric = card.metric || detail.metric;
      const readerRange = getReaderRange();
      const targetRange = detail.rangeLocked ? detail.range : readerRange;
      const rangeChanged = detail.range !== targetRange;
      detail.range = targetRange || readerRange;
      renderReaderDetail(target, detail);
      loadReaderSeries(target, detail, { showLoading: rangeChanged });
      return;
    }

    renderAnalyticsList(target, card.items, card.emptyText, card.labelFn, card);
  }

  function renderReaderAnalytics(payload) {
    lastReaderPayload = payload || {};
    renderReaderSummary(lastReaderPayload);

    if (el.analyticsInsight) {
      el.analyticsInsight.textContent = generateInsightSentence(lastReaderPayload);
    }

    const seriesFilter = updateReaderSeriesOptions(lastReaderPayload);
    if (seriesFilter !== lastReaderSeriesFilter) {
      lastReaderSeriesFilter = seriesFilter;
      clearEntryDetails();
    }

    const entryViews = filterEntryItems(payload?.entryViews, seriesFilter);
    const entryRates = filterEntryItems(payload?.entryRates, seriesFilter);

    const cards = [
      {
        target: el.analyticsEntryReads,
        title: 'Pages Read',
        metric: 'page_views',
        eventName: 'reader_page_view',
        propertyName: 'entryLabel',
        items: entryViews,
        emptyText:
          'No page reads yet. Reader pageviews will appear here as visitors move through entries.',
        subLabelFn: (item) => formatDeltaText(item),
      },
      {
        target: el.analyticsSeriesReads,
        title: 'Series Pages Read',
        metric: 'page_views',
        eventName: 'reader_page_view',
        propertyName: 'series',
        items: payload?.seriesViews,
        emptyText:
          'No series page-read data yet. This will populate as readers explore your comics.',
        subLabelFn: (item) => formatDeltaText(item),
      },
      {
        target: el.analyticsEntryRates,
        title: 'Start-to-Finish Rate',
        metric: 'completion_rate',
        eventName: 'reader_entry_complete',
        propertyName: 'entryLabel',
        items: entryRates,
        emptyText:
          'No start-to-finish data yet. Rates will appear once entries have both starts and finishes.',
        subLabelFn: (item) => formatStartFinishText(item),
        valueFormatter: (item) => formatPercent(item?.completionRate),
        rankFn: (item) => Number(item?.completionRate) || 0,
      },
      {
        target: el.analyticsSeriesRates,
        title: 'Series Start-to-Finish Rate',
        metric: 'completion_rate',
        eventName: 'reader_entry_complete',
        propertyName: 'series',
        items: payload?.seriesRates,
        emptyText:
          'No series conversion data yet. Rates will appear once readers start and finish entries.',
        subLabelFn: (item) => formatStartFinishText(item),
        valueFormatter: (item) => formatPercent(item?.completionRate),
        rankFn: (item) => Number(item?.completionRate) || 0,
      },
    ];

    cards.forEach((card) => renderReaderCard(card));
  }

  async function loadReaderAnalytics({ showLoading = true } = {}) {
    if (!el.analyticsEntryReads || !el.analyticsEntryRates) return null;
    if (showLoading) setReaderStatus('Loading reader analytics…');
    const params = new URLSearchParams({
      range: getReaderRange(),
      limit: '12',
    });

    try {
      const res = await fetch(`${ANALYTICS_READER_ENDPOINT}?${params.toString()}`, {
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

      renderReaderAnalytics(payload || {});
      const ts = payload?.generatedAt ? new Date(payload.generatedAt) : null;
      const tsText = ts ? ts.toLocaleString() : 'just now';
      setReaderStatus(`Updated ${tsText}.`);
      return payload || {};
    } catch (err) {
      renderReaderAnalytics({});
      setReaderStatus(`Analytics error: ${err?.message || 'Unable to load reader stats.'}`, true);
      return null;
    }
  }

  function renderReaderAnalyticsView() {
    renderReaderAnalytics(lastReaderPayload || {});
  }

  function getLastReaderPayload() {
    return lastReaderPayload || {};
  }

  return {
    fetchWeeklyDigest,
    getLastReaderPayload,
    initReaderTabs,
    loadReaderAnalytics,
    renderHealthIndicator,
    renderReaderAnalyticsView,
    updateSummaryTrends,
  };
}

export { createReaderAnalytics };

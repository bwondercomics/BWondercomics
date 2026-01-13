/**
 * Admin Analytics UI
 *
 * Renders analytics data in the admin dashboard:
 * - Summary cards (reads, finishes, finish rate, avg stop page)
 * - Reader analytics cards with drill-down charts
 * - Reads over time chart (aggregate and per-entry)
 * - Live visitors ticker
 *
 * Key functions:
 * - renderReaderAnalytics(): Main entry point for reader stats
 * - renderReaderSummary(): Updates summary card values
 * - renderAnalyticsList(): Generic list renderer with click-to-detail
 * - formatDeltaText(): Formats week-over-week change
 */
import { el } from "./dom.js";
import {
  ANALYTICS_ENDPOINT,
  ANALYTICS_PAGES_ENDPOINT,
  ANALYTICS_READER_ENDPOINT,
  ANALYTICS_READER_SERIES_ENDPOINT,
  ANALYTICS_LIVE_ENDPOINT,
} from "./state.js";

const READS_OVER_TIME_ENDPOINT = "/api/admin/analytics/reads-over-time";

const activeReaderDetails = new Map();
let readsOverTimeData = [];
let readsOverTimeCtx = null;
let lastReaderPayload = null;
let lastReaderSeriesFilter = "all";
const LIVE_REFRESH_MS = 5 * 60 * 1000;
const LIVE_RANGE_OPTIONS = [30, 60, 120, 360, 720, 1440];
const LIVE_MAX_HISTORY_MS = 24 * 60 * 60 * 1000;
const LIVE_HISTORY_STORAGE_KEY = "battlebros_admin_live_history";
const LIVE_HISTORY_MAX_ITEMS = 300;
let liveHistory = [];
let liveTimer = null;
let liveTickerRaf = null;
let liveTickerLastTime = 0;
let liveGraphRaf = null;
let liveCanvasCtx = null;
let liveCanvasSize = { width: 0, height: 0 };
let liveCanvasColors = null;

function loadLiveHistoryFromStorage() {
  try {
    const raw = localStorage.getItem(LIVE_HISTORY_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const cutoff = Date.now() - LIVE_MAX_HISTORY_MS;
    const restored = parsed
      .map((item) => ({
        ts: Number(item?.ts),
        count: Number(item?.count),
      }))
      .filter((item) => Number.isFinite(item.ts) && Number.isFinite(item.count))
      .filter((item) => item.ts >= cutoff);
    liveHistory = restored.slice(-LIVE_HISTORY_MAX_ITEMS);
  } catch (err) {
    // Ignore storage parsing errors.
  }
}

function saveLiveHistoryToStorage() {
  try {
    if (!Array.isArray(liveHistory)) return;
    const trimmed = liveHistory.slice(-LIVE_HISTORY_MAX_ITEMS);
    localStorage.setItem(LIVE_HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    // Ignore storage write errors.
  }
}

loadLiveHistoryFromStorage();

function formatStat(value) {
  if (value === null || value === undefined) return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString("en-US");
}

function formatPercent(value) {
  if (value === null || value === undefined) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return `${Math.round(num * 100)}%`;
}

function formatDecimal(value) {
  if (value === null || value === undefined) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  const rounded = Math.round(num * 10) / 10;
  return Number.isInteger(rounded) ? formatStat(rounded) : rounded.toFixed(1);
}

function formatRangeMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m";
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`;
}

function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return "0m";
  const minutes = Math.floor(total / 60);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours > 0) return `${hours}h ${remainder}m`;
  return `${minutes}m`;
}

function formatTimeAgo(value) {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getCssVar(name, fallback) {
  if (!document?.documentElement) return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function getLiveColors() {
  return {
    line: getCssVar("--accent", "#ffed00"),
    glow: getCssVar("--secondary", "#ff00ea"),
    grid: "rgba(255, 255, 255, 0.12)",
    baseline: "rgba(0, 217, 255, 0.35)",
    now: "rgba(255, 255, 255, 0.2)",
    text: "rgba(255, 255, 255, 0.7)",
  };
}

function setAnalyticsValue(target, value) {
  if (!target) return;
  target.textContent = formatStat(value);
}

function setAnalyticsStatus(message, isError = false) {
  if (!el.analyticsStatus) return;
  el.analyticsStatus.textContent = message || "";
  el.analyticsStatus.style.display = message ? "block" : "none";
  el.analyticsStatus.className = isError ? "error-message" : "success-message";
}

function setPagesStatus(message, isError = false) {
  if (!el.analyticsPagesStatus) return;
  el.analyticsPagesStatus.textContent = message || "";
  el.analyticsPagesStatus.style.display = message ? "block" : "none";
  el.analyticsPagesStatus.className = isError ? "error-message" : "success-message";
}

function setReaderStatus(message, isError = false) {
  if (!el.analyticsReaderStatus) return;
  el.analyticsReaderStatus.textContent = message || "";
  el.analyticsReaderStatus.style.display = message ? "block" : "none";
  el.analyticsReaderStatus.className = isError ? "error-message" : "success-message";
}

function setLiveStatus(message, isError = false) {
  if (!el.liveVisitorsStatus) return;
  el.liveVisitorsStatus.textContent = message || "";
  el.liveVisitorsStatus.style.display = message ? "block" : "none";
  el.liveVisitorsStatus.className = isError ? "error-message" : "success-message";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getAnalyticsRange() {
  return (el.analyticsPagesRange?.value || "7d").trim();
}

function getReaderRange() {
  return (el.analyticsReaderRange?.value || getAnalyticsRange()).trim();
}

function getReaderSeriesFilter() {
  return (el.analyticsReaderSeries?.value || "all").trim();
}

function formatRangeLabel(rangeKey) {
  if (rangeKey === "24h") return "Last 24h";
  if (rangeKey === "30d") return "Last 30d";
  return "Last 7d";
}

function isValidRange(rangeKey) {
  return rangeKey === "24h" || rangeKey === "7d" || rangeKey === "30d";
}

function formatBucketLabel(rangeKey, timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  if (rangeKey === "24h") {
    return date.toLocaleTimeString("en-US", { hour: "numeric" });
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatShortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getAnalyticsCount(item) {
  const value = item?.count ?? item?.views ?? item?.total ?? item?.value ?? 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeAnalyticsItems(items, labelFn, valueFn) {
  const list = Array.isArray(items) ? items : [];
  return list.map((item) => {
    const labelRaw =
      typeof labelFn === "function"
        ? labelFn(item)
        : item?.label || item?.value || "Unknown";
    const valueRaw =
      typeof valueFn === "function"
        ? valueFn(item)
        : item?.value || item?.label || labelRaw;
    return {
      label: String(labelRaw || "Unknown"),
      value: String(valueRaw || labelRaw || "Unknown"),
      count: getAnalyticsCount(item),
      subLabel: item?.subLabel || "",
      delta: item?.delta,
      deltaPct: item?.deltaPct,
      completionRate: item?.completionRate,
      avgStopPage: item?.avgStopPage,
      medianStopPage: item?.medianStopPage,
    };
  });
}

function formatDeltaText(item) {
  const rawDelta = Number(item?.delta);
  if (!Number.isFinite(rawDelta) || rawDelta === 0) return "";
  const deltaPct = Number(item?.deltaPct);
  if (Number.isFinite(deltaPct) && deltaPct !== 0) {
    const sign = deltaPct > 0 ? "+" : "";
    const pct = Math.round(deltaPct * 100);
    return `Δ ${sign}${pct}% vs prev`;
  }
  const sign = rawDelta > 0 ? "+" : "";
  return `Δ ${sign}${formatStat(rawDelta)} vs prev`;
}

function formatCompletionRateText(item) {
  const rate = Number(item?.completionRate);
  if (!Number.isFinite(rate)) return "Finish rate —";
  const pct = Math.round(rate * 100);
  return `Finish rate ${pct}%`;
}

function formatStopStatsText(item) {
  const avgRaw = Number(item?.avgStopPage);
  const medRaw = Number(item?.medianStopPage);
  const parts = [];
  if (Number.isFinite(avgRaw) && avgRaw > 0) {
    const avgText = avgRaw % 1 === 0 ? avgRaw.toFixed(0) : avgRaw.toFixed(1);
    parts.push(`Avg ${avgText}`);
  }
  if (Number.isFinite(medRaw) && medRaw > 0) {
    const medText = medRaw % 1 === 0 ? medRaw.toFixed(0) : medRaw.toFixed(1);
    parts.push(`Med ${medText}`);
  }
  return parts.join(" · ");
}

function extractSeriesName(label) {
  const parts = String(label || "").split(" | ");
  return (parts[0] || "").trim();
}

function collectSeriesOptions(payload) {
  const seriesViews = Array.isArray(payload?.seriesViews)
    ? payload.seriesViews
    : [];
  // Use seriesTitle (label) for display and filtering consistency
  const fromSeriesViews = seriesViews
    .map((item) => String(item?.seriesTitle || item?.label || item?.value || "").trim())
    .filter(Boolean);
  if (fromSeriesViews.length) {
    return Array.from(new Set(fromSeriesViews));
  }

  // Fallback: collect from entryViews using seriesTitle field
  const entryViews = Array.isArray(payload?.entryViews)
    ? payload.entryViews
    : [];
  const seriesSet = new Set();
  entryViews.forEach((item) => {
    const series = item?.seriesTitle || "";
    if (series) seriesSet.add(series);
  });
  return Array.from(seriesSet);
}

function updateReaderSeriesOptions(payload) {
  if (!el.analyticsReaderSeries) return "all";
  const current = getReaderSeriesFilter() || "all";
  const seriesOptions = collectSeriesOptions(payload);
  const normalized = ["all", ...seriesOptions];
  const nextValue = normalized.includes(current) ? current : "all";

  const existing = Array.from(el.analyticsReaderSeries.options).map(
    (opt) => opt.value,
  );
  const needsUpdate =
    existing.length !== normalized.length ||
    normalized.some((value, idx) => value !== existing[idx]);

  if (needsUpdate) {
    el.analyticsReaderSeries.innerHTML = "";
    normalized.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value === "all" ? "All series" : value;
      el.analyticsReaderSeries.appendChild(option);
    });
  }

  el.analyticsReaderSeries.value = nextValue;
  return nextValue;
}

function filterEntryItems(items, seriesFilter) {
  const list = Array.isArray(items) ? items : [];
  if (!seriesFilter || seriesFilter === "all") return list;
  return list.filter((item) => {
    // Use seriesTitle or seriesId field directly (preferred)
    const seriesTitle = item?.seriesTitle || "";
    const seriesId = item?.seriesId || "";
    if (seriesTitle === seriesFilter || seriesId === seriesFilter) {
      return true;
    }
    // Fallback: extract from label format "Series | Entry N"
    const label =
      item?.entryLabel || item?.stopLabel || item?.value || item?.label || "";
    const extractedSeries = extractSeriesName(label);
    return extractedSeries === seriesFilter;
  });
}

function clearEntryDetails() {
  const targets = new Set([
    el.analyticsEntryReads?.id,
    el.analyticsEntryCompletes?.id,
    el.analyticsEntryStops?.id,
  ]);
  targets.forEach((targetId) => {
    if (targetId) activeReaderDetails.delete(targetId);
  });
}


function renderMetricList(containerId, items, valueLabel = "Views") {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items || !items.length) {
    container.innerHTML = `<div class="analytics-pages-empty">No data available</div>`;
    return;
  }

  const maxVal = Math.max(...items.map((i) => Number(i.views || i.count || 0)), 1);

  container.innerHTML = items
    .map((item) => {
      const label = item.path || item.value || "Unknown";
      const count = Number(item.views || item.count || 0);
      const pct = (count / maxVal) * 100;

      return `
      <div class="analytics-page-row" style="margin-bottom: 8px;">
        <div class="analytics-page-info" style="display: flex; flex-direction: column; width: 100%;">
          <div class="analytics-page-path" title="${escapeHtml(label)}" style="font-size: 0.9em; margin-bottom: 2px;">${escapeHtml(label)}</div>
          <div class="analytics-page-bar" style="background: rgba(255, 255, 255, 0.1); border-radius: 4px; overflow: hidden; height: 6px;">
            <div class="analytics-page-fill" style="width: ${pct}%; background: var(--primary); height: 100%;"></div>
          </div>
        </div>
        <div class="analytics-page-count" style="font-size: 0.85em; margin-top: 2px; text-align: right;">
          ${formatStat(count)} <span style="opacity: 0.6; font-size: 0.9em;">${valueLabel}</span>
        </div>
      </div>
    `;
    })
    .join("");
}

function renderAnalyticsSummary(summary) {
  const ranges = summary?.ranges || {};
  const last24h = ranges.last24h || {};
  const last7d = ranges.last7d || {};

  setAnalyticsValue(el.statViews24h, last24h.pageviews);
  setAnalyticsValue(el.statVisitors24h, last24h.visitors);
  setAnalyticsValue(el.statViews7d, last7d.pageviews);
  setAnalyticsValue(el.statVisitors7d, last7d.visitors);

  // Render Referrers & Events
  renderMetricList("analyticsReferrersList", summary.referrers, "Visits");
  renderMetricList("analyticsEventsList", summary.events, "Clicks");

  const ts = summary?.generatedAt ? new Date(summary.generatedAt) : null;
  const tsText = ts ? ts.toLocaleString() : "just now";
  const siteNote = summary?.websiteId ? ` for site ${summary.websiteId}` : "";
  setAnalyticsStatus(`Updated ${tsText}${siteNote}.`);
}

function clearAnalyticsSummary() {
  setAnalyticsValue(el.statViews24h, null);
  setAnalyticsValue(el.statVisitors24h, null);
  setAnalyticsValue(el.statViews7d, null);
  setAnalyticsValue(el.statVisitors7d, null);
}

function renderReaderSummary(payload) {
  if (!payload) return;
  if (el.statEntryReads)
    el.statEntryReads.textContent = formatStat(payload.entryReadsTotal);
  if (el.statEntryFinishes)
    el.statEntryFinishes.textContent = formatStat(payload.entryFinishesTotal);
  if (el.statFinishRate)
    el.statFinishRate.textContent = formatPercent(payload.finishRate);
  if (el.statAvgStopPage)
    el.statAvgStopPage.textContent = formatDecimal(payload.avgStopPage);
}

function renderAnalyticsPages(payload) {
  if (!el.analyticsPagesList) return;
  const pages = Array.isArray(payload?.pages) ? payload.pages : [];
  if (!pages.length) {
    el.analyticsPagesList.innerHTML =
      '<div class="analytics-pages-empty">No page reads yet.</div>';
    return;
  }
  el.analyticsPagesList.innerHTML = pages
    .map((page) => {
      const path = escapeHtml(page?.path || "Unknown");
      const views = formatStat(page?.views);
      return `
        <div class="analytics-pages-item">
          <div class="analytics-page-path">${path}</div>
          <div class="analytics-page-views">${views}</div>
        </div>
      `;
    })
    .join("");
}

function renderAnalyticsList(target, items, emptyText, labelFn, options = {}) {
  if (!target) return;
  const list = normalizeAnalyticsItems(items, labelFn, options.valueFn);
  target.dataset.title = options.title || "";
  if (!list.length) {
    target.innerHTML = `<div class="analytics-pages-empty">${escapeHtml(
      emptyText,
    )}</div>`;
    return;
  }
  target.innerHTML = list
    .map((item) => {
      const label = escapeHtml(item.label);
      const subLabel =
        typeof options.subLabelFn === "function"
          ? options.subLabelFn(item)
          : item.subLabel;
      const safeSubLabel = subLabel ? escapeHtml(subLabel) : "";
      const subHtml = subLabel
        ? `<div class="analytics-reader-sub">${safeSubLabel}</div>`
        : "";
      const value = escapeHtml(item.value);
      const formatted = formatStat(item.count);
      const countAttr = escapeHtml(String(item.count ?? ""));
      return `
        <div class="analytics-reader-item" data-label="${label}" data-value="${value}" data-count="${countAttr}" data-sub="${safeSubLabel}" data-event="${options.eventName || ""}" data-property="${options.propertyName || ""}">
          <div class="analytics-reader-label">
            <div>${label}</div>
            ${subHtml}
          </div>
          <div class="analytics-reader-value">${formatted}</div>
        </div>
      `;
    })
    .join("");
}

function renderReaderDetail(target, detail) {
  if (!target || !detail) return;
  const title = escapeHtml(detail.title || "Reader Analytics");
  const label = escapeHtml(detail.label || detail.value || "Unknown");
  const rangeKey = isValidRange(detail.range) ? detail.range : "7d";
  const rangeLabel = formatRangeLabel(rangeKey);
  const totalLabelMap = {
    reader_page_view: "Reads",
    reader_entry_complete: "Finishes",
    reader_entry_exit: "Stops",
  };
  const totalLabel = totalLabelMap[detail.eventName] || "Total";
  const hasCount = detail.count !== null && detail.count !== undefined;
  const hasSubLabel = Boolean(detail.subLabel);
  const countText = hasCount ? formatStat(detail.count) : "—";
  const metaHtml =
    hasCount || hasSubLabel
      ? `
      <div class="analytics-detail-meta">
        <div class="analytics-detail-meta-item">
          <div class="analytics-detail-meta-label">${escapeHtml(totalLabel)}</div>
          <div class="analytics-detail-meta-value">${escapeHtml(countText)}</div>
          ${hasSubLabel
        ? `<div class="analytics-detail-meta-note">${escapeHtml(
          detail.subLabel,
        )}</div>`
        : ""
      }
        </div>
      </div>
    `
      : "";
  const hasSeries = Array.isArray(detail.series) && detail.series.length;
  const startLabel = hasSeries ? formatShortDate(detail.series[0]?.start) : "";
  const endLabel = hasSeries
    ? formatShortDate(detail.series[detail.series.length - 1]?.end)
    : "";

  let chartHtml = `<div class="analytics-detail-empty">No data yet.</div>`;
  if (detail.loading) {
    chartHtml = `<div class="analytics-detail-empty">Loading chart…</div>`;
  } else if (detail.error) {
    chartHtml = `<div class="error-message" style="margin: 0;">${escapeHtml(
      detail.error,
    )}</div>`;
  } else if (hasSeries) {
    const max = detail.series.reduce(
      (acc, point) => Math.max(acc, Number(point.count) || 0),
      0,
    );
    const bars = detail.series
      .map((point) => {
        const count = Number(point.count) || 0;
        const pct = max > 0 ? Math.max(0, (count / max) * 100) : 0;
        const height = count > 0 ? Math.max(pct, 3) : 0;
        const titleText = `${formatShortDate(point.start)}: ${formatStat(
          count,
        )}`;
        const countLabel = count > 0 ? formatStat(count) : "";
        const timeLabel = formatBucketLabel(rangeKey, point.end || point.start);
        return `
          <div class="analytics-detail-bar-wrap">
            <div class="analytics-detail-bar-body">
              <div class="analytics-detail-bar-count">${escapeHtml(
          countLabel,
        )}</div>
              <div class="analytics-detail-bar-slot">
                <div class="analytics-detail-bar" title="${escapeHtml(
          titleText,
        )}" style="height: ${height.toFixed(1)}%"></div>
              </div>
            </div>
            <div class="analytics-detail-bar-time">${escapeHtml(
          timeLabel,
        )}</div>
          </div>
        `;
      })
      .join("");

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
          <option value="24h" ${rangeKey === "24h" ? "selected" : ""}>Last 24h</option>
          <option value="7d" ${rangeKey === "7d" ? "selected" : ""}>Last 7d</option>
          <option value="30d" ${rangeKey === "30d" ? "selected" : ""}>Last 30d</option>
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
    event: detail.eventName || "",
    property: detail.propertyName || "",
    value: detail.value || "",
    range,
    points: "12",
  });

  try {
    const res = await fetch(
      `${ANALYTICS_READER_SERIES_ENDPOINT}?${params.toString()}`,
      { cache: "no-store" },
    );
    let payload = null;
    try {
      payload = await res.json();
    } catch (err) {
      payload = null;
    }

    if (!res.ok) {
      const errorText =
        (payload && typeof payload === "object" && payload.error) ||
        `HTTP ${res.status}`;
      throw new Error(errorText);
    }

    if (detail.requestId !== requestId) return;
    detail.series = Array.isArray(payload?.series) ? payload.series : [];
    detail.error = null;
  } catch (err) {
    if (detail.requestId !== requestId) return;
    detail.series = [];
    detail.error = err?.message || "Unable to load item history.";
  } finally {
    if (detail.requestId !== requestId) return;
    detail.loading = false;
    renderReaderDetail(target, detail);
  }
}

function bindReaderInteractions(target) {
  if (!target || target.dataset.bound === "true") return;
  target.dataset.bound = "true";
  target.addEventListener("click", (event) => {
    const backButton = event.target.closest(".analytics-detail-back");
    if (backButton && target.contains(backButton)) {
      activeReaderDetails.delete(target.id);
      renderReaderAnalytics(lastReaderPayload || {});
      return;
    }

    const item = event.target.closest(".analytics-reader-item");
    if (!item || !target.contains(item)) return;
    const value = item.dataset.value || "";
    const label = item.dataset.label || value || "Unknown";
    const subLabel = item.dataset.sub || "";
    const countRaw = item.dataset.count;
    const countValue =
      countRaw !== undefined && countRaw !== "" ? Number(countRaw) : null;
    const eventName = item.dataset.event || "";
    const propertyName = item.dataset.property || "";
    if (!value || !eventName || !propertyName) return;

    const detail = {
      title: target.dataset.title || "Reader Analytics",
      label,
      value,
      subLabel,
      count: Number.isNaN(countValue) ? null : countValue,
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

  target.addEventListener("change", (event) => {
    const select = event.target.closest(".analytics-detail-select");
    if (!select || !target.contains(select)) return;
    const detail = activeReaderDetails.get(target.id);
    if (!detail) return;
    const nextRange = select.value || "7d";
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
    const readerRange = getReaderRange();
    const targetRange = detail.rangeLocked ? detail.range : readerRange;
    const rangeChanged = detail.range !== targetRange;
    detail.range = targetRange || readerRange;
    renderReaderDetail(target, detail);
    loadReaderSeries(target, detail, { showLoading: rangeChanged });
    return;
  }

  renderAnalyticsList(
    target,
    card.items,
    card.emptyText,
    card.labelFn,
    card,
  );
}

function renderReaderAnalytics(payload) {
  lastReaderPayload = payload || {};
  renderReaderSummary(lastReaderPayload);
  const seriesFilter = updateReaderSeriesOptions(lastReaderPayload);
  if (seriesFilter !== lastReaderSeriesFilter) {
    lastReaderSeriesFilter = seriesFilter;
    clearEntryDetails();
  }

  const entryViews = filterEntryItems(payload?.entryViews, seriesFilter);
  const entryCompletions = filterEntryItems(
    payload?.entryCompletions,
    seriesFilter,
  );
  const entryStops = filterEntryItems(payload?.entryStops, seriesFilter);

  const cards = [
    {
      target: el.analyticsEntryReads,
      title: "Entry Reads",
      eventName: "reader_page_view",
      propertyName: "entryLabel",
      items: entryViews,
      emptyText: "No entry reads yet.",
      subLabelFn: (item) => formatDeltaText(item),
    },
    {
      target: el.analyticsSeriesReads,
      title: "Series Reads",
      eventName: "reader_page_view",
      propertyName: "series",
      items: payload?.seriesViews,
      emptyText: "No series reads yet.",
      subLabelFn: (item) => formatDeltaText(item),
    },
    {
      target: el.analyticsEntryCompletes,
      title: "Entry Finishes",
      eventName: "reader_entry_complete",
      propertyName: "entryLabel",
      items: entryCompletions,
      emptyText: "No entry finishes yet.",
      subLabelFn: (item) => {
        const rateText = formatCompletionRateText(item);
        const deltaText = formatDeltaText(item);
        return deltaText ? `${rateText} · ${deltaText}` : rateText;
      },
    },
    {
      target: el.analyticsSeriesCompletes,
      title: "Series Finishes",
      eventName: "reader_entry_complete",
      propertyName: "series",
      items: payload?.seriesCompletions,
      emptyText: "No series finishes yet.",
      subLabelFn: (item) => {
        const rateText = formatCompletionRateText(item);
        const deltaText = formatDeltaText(item);
        return deltaText ? `${rateText} · ${deltaText}` : rateText;
      },
    },
    {
      target: el.analyticsEntryStops,
      title: "Stop Page (per entry)",
      eventName: "reader_entry_exit",
      propertyName: "stopLabel",
      items: entryStops,
      emptyText: "No stop-page data yet.",
      labelFn: (item) =>
        `${item?.entryLabel || item?.label || "Unknown entry"} - page ${item?.page ?? "?"
        }`,
      valueFn: (item) => item?.stopLabel || item?.value,
      subLabelFn: (item) => formatStopStatsText(item),
    },
  ];

  cards.forEach((card) => renderReaderCard(card));
}

function isLiveVisitorsVisible() {
  if (!el.liveVisitorsChart) return false;
  const section = el.liveVisitorsChart.closest("section");
  if (section && section instanceof HTMLElement) {
    return section.style.display !== "none";
  }
  if (el.moderationSection) return el.moderationSection.style.display !== "none";
  if (el.analyticsSection) return el.analyticsSection.style.display !== "none";
  return true;
}

function getLiveRangeMinutes() {
  const raw = el.liveVisitorsRange?.value || "30";
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return 30;
  return value;
}

function syncLiveRangeLabel(rangeMinutes) {
  if (!el.liveVisitorsRangeLabel) return;
  el.liveVisitorsRangeLabel.textContent = `Last ${formatRangeMinutes(rangeMinutes)}`;
}

function syncLiveAxisLabel(rangeMinutes) {
  if (!el.liveVisitorsAxisStart) return;
  el.liveVisitorsAxisStart.textContent = `-${formatRangeMinutes(rangeMinutes)}`;
}

function recordLiveSample(count, generatedAt) {
  const ts = generatedAt ? new Date(generatedAt).getTime() : Date.now();
  const safeTs = Number.isFinite(ts) ? ts : Date.now();
  const countValue = Number(count) || 0;
  const lastSample = liveHistory[liveHistory.length - 1];
  if (lastSample && Math.abs(safeTs - lastSample.ts) < 60 * 1000) {
    liveHistory = [
      ...liveHistory.slice(0, -1),
      { ts: safeTs, count: countValue },
    ];
  } else {
    liveHistory = [...liveHistory, { ts: safeTs, count: countValue }];
  }
  const cutoff = Date.now() - LIVE_MAX_HISTORY_MS;
  liveHistory = liveHistory.filter((item) => item.ts >= cutoff);
  saveLiveHistoryToStorage();
}

function ensureLiveCanvas() {
  if (!el.liveVisitorsChart) return null;
  if (!(el.liveVisitorsChart instanceof HTMLCanvasElement)) return null;
  const canvas = el.liveVisitorsChart;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const dpr = window.devicePixelRatio || 1;
  const targetWidth = Math.max(1, Math.round(width * dpr));
  const targetHeight = Math.max(1, Math.round(height * dpr));

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  if (!canvas.dataset.clickAttached) {
    canvas.dataset.clickAttached = "true";
    canvas.addEventListener("click", handleLiveChartClick);
    canvas.style.cursor = "crosshair";
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  liveCanvasCtx = ctx;
  liveCanvasSize = { width, height };
  if (!liveCanvasColors) liveCanvasColors = getLiveColors();
  return ctx;
}

let selectedLiveTime = null;

function handleLiveChartClick(e) {
  const rect = e.target.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const { width } = liveCanvasSize;
  const rangeMinutes = getLiveRangeMinutes();
  const rangeMs = rangeMinutes * 60 * 1000;

  // X=0 is -rangeMs, X=width is Now
  // time = now - (1 - x/width) * rangeMs
  const now = Date.now();
  const relative = (x / width);
  const timeOffset = (1 - relative) * rangeMs;
  const targetTime = now - timeOffset;

  selectedLiveTime = targetTime;
  loadLiveVisitors({ at: targetTime });
  drawLiveSeismometer(); // Redraw to show selection line

  // Show reset button
  const container = document.querySelector(".analytics-live-meta");
  if (container && !document.getElementById("btnLiveReset")) {
    const btn = document.createElement("button");
    btn.id = "btnLiveReset";
    btn.className = "btn-secondary";
    btn.style.padding = "2px 8px";
    btn.style.fontSize = "0.7rem";
    btn.style.marginLeft = "8px";
    btn.textContent = "Reset to Live";
    btn.onclick = clearLiveSelection;
    container.appendChild(btn);
  }
}

function clearLiveSelection() {
  selectedLiveTime = null;
  const btn = document.getElementById("btnLiveReset");
  if (btn) btn.remove();
  loadLiveVisitors(); // Reset to live
  drawLiveSeismometer();
}

function drawLiveSeismometer() {
  const ctx = ensureLiveCanvas();
  if (!ctx) return;
  const { width, height } = liveCanvasSize;
  const rangeMinutes = getLiveRangeMinutes();
  const rangeMs = rangeMinutes * 60 * 1000;
  const now = Date.now();
  const cutoff = now - rangeMs;
  const points = liveHistory
    .filter((item) => item.ts >= cutoff)
    .sort((a, b) => a.ts - b.ts);

  syncLiveRangeLabel(rangeMinutes);
  syncLiveAxisLabel(rangeMinutes);

  ctx.clearRect(0, 0, width, height);
  const colors = liveCanvasColors || getLiveColors();

  ctx.save();
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const verticalLines = 6;
  for (let i = 1; i < verticalLines; i += 1) {
    const x = (width / verticalLines) * i;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  const centerY = height * 0.55;
  ctx.moveTo(0, centerY);
  ctx.lineTo(width, centerY);
  ctx.stroke();
  ctx.restore();

  if (!points.length) {
    ctx.save();
    ctx.fillStyle = colors.text;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No live data yet.", width / 2, height / 2);
    ctx.restore();
    return;
  }

  const maxCount = points.reduce(
    (acc, item) => Math.max(acc, Number(item.count) || 0),
    1,
  );
  const amplitudeScale = height * 0.35;

  ctx.save();
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  let started = false;
  points.forEach((point) => {
    const x = width - ((now - point.ts) / rangeMs) * width;
    if (x < -10 || x > width + 10) return;
    const amplitude = (Number(point.count) || 0) / maxCount;
    const y = centerY - amplitude * amplitudeScale;
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  if (started) ctx.stroke();
  ctx.restore();

  const latest = points[points.length - 1];
  if (latest) {
    const x = width - ((now - latest.ts) / rangeMs) * width;
    const amplitude = (Number(latest.count) || 0) / maxCount;
    const y = centerY - amplitude * amplitudeScale;
    if (x >= 0 && x <= width) {
      ctx.save();
      ctx.fillStyle = colors.line;
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Draw selected time indicator
  if (selectedLiveTime) {
    const x = width - ((now - selectedLiveTime) / rangeMs) * width;
    if (x >= 0 && x <= width) {
      ctx.save();
      ctx.strokeStyle = colors.accent || "#ffed00";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.save();
  ctx.strokeStyle = colors.now;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width - 1, 0);
  ctx.lineTo(width - 1, height);
  ctx.stroke();
  ctx.restore();
}

function startLiveSeismometer() {
  if (liveGraphRaf) return;
  const step = () => {
    if (!isLiveVisitorsVisible()) {
      liveGraphRaf = null;
      return;
    }
    drawLiveSeismometer();
    liveGraphRaf = window.requestAnimationFrame(step);
  };
  liveGraphRaf = window.requestAnimationFrame(step);
}

function stopLiveSeismometer() {
  if (!liveGraphRaf) return;
  window.cancelAnimationFrame(liveGraphRaf);
  liveGraphRaf = null;
}

function renderLiveChart(rangeMinutes) {
  if (!el.liveVisitorsChart) return;
  const range = Number(rangeMinutes) || getLiveRangeMinutes();
  syncLiveRangeLabel(range);
  syncLiveAxisLabel(range);
  startLiveSeismometer();
}

function stopLiveTicker() {
  if (liveTickerRaf) {
    window.cancelAnimationFrame(liveTickerRaf);
    liveTickerRaf = null;
  }
}

function startLiveTicker() {
  stopLiveTicker();
  if (!el.liveVisitorsTicker || !el.liveVisitorsTrack) return;
  const container = el.liveVisitorsTicker;
  const track = el.liveVisitorsTrack;
  const maxScroll = track.scrollWidth - container.clientWidth;
  if (maxScroll <= 0) return;
  container.scrollLeft = maxScroll;
  liveTickerLastTime = performance.now();

  const speed = 20;
  const step = (now) => {
    const dt = now - liveTickerLastTime;
    liveTickerLastTime = now;
    const max = track.scrollWidth - container.clientWidth;
    if (max <= 0) {
      liveTickerRaf = null;
      return;
    }
    let next = container.scrollLeft - (speed * dt) / 1000;
    if (next <= 0) next = max;
    container.scrollLeft = next;
    liveTickerRaf = window.requestAnimationFrame(step);
  };

  liveTickerRaf = window.requestAnimationFrame(step);
}

function formatEntryList(entries) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!list.length) return "No reads yet";
  const slice = list.slice(-2);
  const summary = slice.join(" · ");
  const more = list.length - slice.length;
  return more > 0 ? `${summary} +${more} more` : summary;
}

function renderLiveTicker(visitors) {
  if (!el.liveVisitorsTrack || !el.liveVisitorsTicker) return;
  const list = Array.isArray(visitors) ? visitors : [];
  if (!list.length) {
    el.liveVisitorsTrack.innerHTML =
      '<div class="analytics-pages-empty" style="margin: 0;">No active visitors yet.</div>';
    stopLiveTicker();
    return;
  }

  el.liveVisitorsTrack.innerHTML = list
    .map((visitor) => {
      const user = visitor?.user;
      const displayName = user?.displayName || "Guest";
      const email = user?.email || "";
      const lastSeen = formatTimeAgo(visitor?.lastSeen);
      const timeSpent = formatDuration(visitor?.durationSeconds);
      const ipAddress = visitor?.ipAddress || "Unknown";
      const origin = visitor?.origin || "Direct";
      const hitCount = Number(visitor?.hitCount);
      const connections = Number.isFinite(hitCount) ? String(hitCount) : "0";
      const entries =
        Array.isArray(visitor?.entriesRead) && visitor.entriesRead.length
          ? visitor.entriesRead
          : visitor?.seriesRead || [];
      const reads = formatEntryList(entries);
      const metaParts = [];
      if (email) metaParts.push(email);
      if (lastSeen) metaParts.push(lastSeen);
      const metaText = metaParts.join(" · ");
      return `
        <div class="analytics-live-card">
          <div class="analytics-live-card-title">${escapeHtml(displayName)}</div>
          <div class="analytics-live-card-meta">${escapeHtml(metaText)}</div>
          <div class="analytics-live-card-row">IP: ${escapeHtml(ipAddress)}</div>
          <div class="analytics-live-card-row">Origin: ${escapeHtml(origin)}</div>
          <div class="analytics-live-card-row">Connections: ${escapeHtml(connections)}</div>
          <div class="analytics-live-card-row">Session: ${escapeHtml(timeSpent)}</div>
          <div class="analytics-live-card-row">Read: ${escapeHtml(reads)}</div>
        </div>
      `;
    })
    .join("");

  startLiveTicker();
}

function renderLiveVisitors(payload) {
  const count = Number(payload?.activeCount) || 0;
  if (el.liveVisitorsCount) el.liveVisitorsCount.textContent = formatStat(count);
  recordLiveSample(count, payload?.generatedAt);
  renderLiveChart(getLiveRangeMinutes());
  renderLiveTicker(payload?.visitors);
}

async function loadLiveVisitors({ showLoading = true, at = null } = {}) {
  if (!el.liveVisitorsChart) return;
  if (showLoading) setLiveStatus("Loading live visitors…");
  const range = getLiveRangeMinutes();
  const params = new URLSearchParams({
    window: String(range),
    limit: "200",
  });
  if (at) {
    params.append("at", String(at));
  }

  try {
    const res = await fetch(`${ANALYTICS_LIVE_ENDPOINT}?${params.toString()}`, {
      cache: "no-store",
    });
    let payload = null;
    try {
      payload = await res.json();
    } catch (err) {
      payload = null;
    }

    if (!res.ok) {
      const errorText =
        (payload && typeof payload === "object" && payload.error) ||
        `HTTP ${res.status}`;
      throw new Error(errorText);
    }

    renderLiveVisitors(payload || {});

    const ts = payload?.generatedAt ? new Date(payload.generatedAt) : null;
    const tsText = ts ? ts.toLocaleString() : "just now";
    setLiveStatus(`Updated ${tsText}.`);
  } catch (err) {
    setLiveStatus(
      `Live visitors error: ${err?.message || "Unable to load live data."}`,
      true,
    );
  }
}

function startLiveVisitors() {
  if (liveTimer) return;
  loadLiveVisitors({ showLoading: true });
  startLiveSeismometer();
  liveTimer = window.setInterval(() => {
    if (!isLiveVisitorsVisible()) return;
    loadLiveVisitors({ showLoading: false });
  }, LIVE_REFRESH_MS);
}

function stopLiveVisitors() {
  if (liveTimer) {
    window.clearInterval(liveTimer);
    liveTimer = null;
  }
  stopLiveTicker();
  stopLiveSeismometer();
}

function shiftLiveRange(direction) {
  if (!el.liveVisitorsRange) return;
  const current = getLiveRangeMinutes();
  const index = LIVE_RANGE_OPTIONS.indexOf(current);
  const nextIndex = Math.max(
    0,
    Math.min(LIVE_RANGE_OPTIONS.length - 1, index + direction),
  );
  el.liveVisitorsRange.value = String(LIVE_RANGE_OPTIONS[nextIndex]);
  loadLiveVisitors({ showLoading: true });
}

async function loadAnalyticsSummary({ showLoading = true } = {}) {
  if (showLoading) setAnalyticsStatus("Loading analytics…");
  try {
    const res = await fetch(ANALYTICS_ENDPOINT, { cache: "no-store" });
    let payload = null;
    try {
      payload = await res.json();
    } catch (err) {
      payload = null;
    }

    if (!res.ok) {
      const errorText =
        (payload && typeof payload === "object" && payload.error) ||
        `HTTP ${res.status}`;
      throw new Error(errorText);
    }

    renderAnalyticsSummary(payload || {});
  } catch (err) {
    clearAnalyticsSummary();
    setAnalyticsStatus(
      `Analytics error: ${err?.message || "Unable to load Umami stats."}`,
      true,
    );
  }
}

async function loadAnalyticsPages({ showLoading = true } = {}) {
  if (!el.analyticsPagesList) return;
  if (showLoading) setPagesStatus("Loading page reads…");
  const range = getAnalyticsRange();
  const params = new URLSearchParams({
    range,
    limit: "12",
  });

  try {
    const res = await fetch(`${ANALYTICS_PAGES_ENDPOINT}?${params.toString()}`, {
      cache: "no-store",
    });
    let payload = null;
    try {
      payload = await res.json();
    } catch (err) {
      payload = null;
    }

    if (!res.ok) {
      const errorText =
        (payload && typeof payload === "object" && payload.error) ||
        `HTTP ${res.status}`;
      throw new Error(errorText);
    }

    renderAnalyticsPages(payload || {});

    const ts = payload?.generatedAt ? new Date(payload.generatedAt) : null;
    const tsText = ts ? ts.toLocaleString() : "just now";
    setPagesStatus(`Updated ${tsText}.`);
  } catch (err) {
    renderAnalyticsPages({});
    setPagesStatus(
      `Analytics error: ${err?.message || "Unable to load page reads."}`,
      true,
    );
  }
}

async function loadReaderAnalytics({ showLoading = true } = {}) {
  if (!el.analyticsEntryReads) return;
  if (showLoading) setReaderStatus("Loading reader analytics…");
  const range = getReaderRange();
  const params = new URLSearchParams({
    range,
    limit: "12",
  });

  try {
    const res = await fetch(
      `${ANALYTICS_READER_ENDPOINT}?${params.toString()}`,
      { cache: "no-store" },
    );
    let payload = null;
    try {
      payload = await res.json();
    } catch (err) {
      payload = null;
    }

    if (!res.ok) {
      const errorText =
        (payload && typeof payload === "object" && payload.error) ||
        `HTTP ${res.status}`;
      throw new Error(errorText);
    }

    renderReaderAnalytics(payload || {});

    const ts = payload?.generatedAt ? new Date(payload.generatedAt) : null;
    const tsText = ts ? ts.toLocaleString() : "just now";
    setReaderStatus(`Updated ${tsText}.`);
  } catch (err) {
    renderReaderAnalytics({});
    setReaderStatus(
      `Analytics error: ${err?.message || "Unable to load reader stats."}`,
      true,
    );
  }
}

// Reads Over Time Chart
function getReadsOverTimeRange() {
  return (el.readsOverTimeRange?.value || "7d").trim();
}

function getReadsOverTimeMode() {
  return (el.readsOverTimeMode?.value || "aggregate").trim();
}

function getReadsOverTimeEntry() {
  return (el.readsOverTimeEntry?.value || "").trim();
}

function setReadsOverTimeStatus(message, isError = false) {
  if (!el.readsOverTimeStatus) return;
  el.readsOverTimeStatus.textContent = message || "";
  el.readsOverTimeStatus.style.display = message ? "block" : "none";
  el.readsOverTimeStatus.className = isError ? "error-message" : "success-message";
}

function updateReadsOverTimeEntryOptions(payload) {
  if (!el.readsOverTimeEntry) return;
  const entryViews = Array.isArray(payload?.entryViews) ? payload.entryViews : [];
  // Filter to entries with valid displayNumber
  const validEntries = entryViews
    .filter((item) => item?.displayNumber != null)
    .slice(0, 50);

  const current = getReadsOverTimeEntry();
  el.readsOverTimeEntry.innerHTML = "";

  validEntries.forEach((item) => {
    const option = document.createElement("option");
    // Use displayNumber as value for backend filtering
    option.value = String(item.displayNumber);
    const label = item.label || `Entry ${item.displayNumber}`;
    option.textContent = label.length > 25 ? label.slice(0, 25) + "…" : label;
    el.readsOverTimeEntry.appendChild(option);
  });

  const validValues = validEntries.map((e) => String(e.displayNumber));
  if (current && validValues.includes(current)) {
    el.readsOverTimeEntry.value = current;
  } else if (validEntries.length) {
    el.readsOverTimeEntry.value = String(validEntries[0].displayNumber);
  }
}

function drawReadsOverTimeChart() {
  const canvas = el.readsOverTimeCanvas;
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = rect.width;
  const height = rect.height;
  const padding = { top: 20, right: 20, bottom: 30, left: 45 };

  ctx.clearRect(0, 0, width, height);

  const data = readsOverTimeData;
  if (!data || !data.length) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No data available", width / 2, height / 2);
    return;
  }

  // Calculate scales
  const maxCount = Math.max(...data.map((d) => d.count || 0), 1);
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const xScale = chartWidth / Math.max(data.length - 1, 1);
  const yScale = chartHeight / maxCount;

  // Draw grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartHeight * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  // Draw line
  const lineColor = getCssVar("--accent", "#ffed00");
  const glowColor = getCssVar("--secondary", "#ff00ea");
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 6;
  ctx.beginPath();

  data.forEach((point, i) => {
    const x = padding.left + i * xScale;
    const y = padding.top + chartHeight - (point.count || 0) * yScale;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Draw points
  ctx.fillStyle = lineColor;
  data.forEach((point, i) => {
    const x = padding.left + i * xScale;
    const y = padding.top + chartHeight - (point.count || 0) * yScale;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw x-axis labels
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  const step = Math.max(1, Math.floor(data.length / 7));
  data.forEach((point, i) => {
    if (i % step === 0 || i === data.length - 1) {
      const x = padding.left + i * xScale;
      const date = new Date(point.date);
      const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      ctx.fillText(label, x, height - 10);
    }
  });

  // Draw y-axis labels
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const value = Math.round((maxCount * (4 - i)) / 4);
    const y = padding.top + (chartHeight * i) / 4;
    ctx.fillText(String(value), padding.left - 8, y + 4);
  }
}

async function loadReadsOverTime({ showLoading = true } = {}) {
  if (!el.readsOverTimeCanvas) return;

  const range = getReadsOverTimeRange();
  const mode = getReadsOverTimeMode();
  const entryId = mode === "entry" ? getReadsOverTimeEntry() : null;

  // Show/hide entry selector based on mode
  if (el.readsOverTimeEntry) {
    el.readsOverTimeEntry.style.display = mode === "entry" ? "inline-block" : "none";
  }

  const params = new URLSearchParams({ range });
  if (entryId) params.append("entry_id", entryId);

  if (showLoading) setReadsOverTimeStatus("Loading chart data…");

  try {
    const res = await fetch(`${READS_OVER_TIME_ENDPOINT}?${params.toString()}`, {
      cache: "no-store",
    });
    let payload = null;
    try {
      payload = await res.json();
    } catch (err) {
      payload = null;
    }

    if (!res.ok) {
      const errorText =
        (payload && typeof payload === "object" && payload.error) || `HTTP ${res.status}`;
      throw new Error(errorText);
    }

    readsOverTimeData = Array.isArray(payload?.series) ? payload.series : [];
    drawReadsOverTimeChart();

    // Update totals display
    if (el.readsOverTimeTotals && payload?.totals) {
      const { reads, uniqueVisitors } = payload.totals;
      el.readsOverTimeTotals.textContent = `Total: ${formatStat(reads)} reads · ${formatStat(uniqueVisitors)} visitors`;
    }

    setReadsOverTimeStatus("");
  } catch (err) {
    readsOverTimeData = [];
    drawReadsOverTimeChart();
    setReadsOverTimeStatus(err?.message || "Unable to load chart data.", true);
  }
}

function initReadsOverTimeControls() {
  if (el.readsOverTimeRange) {
    el.readsOverTimeRange.addEventListener("change", () => {
      loadReadsOverTime({ showLoading: true });
    });
  }

  if (el.readsOverTimeMode) {
    el.readsOverTimeMode.addEventListener("change", () => {
      loadReadsOverTime({ showLoading: true });
    });
  }

  if (el.readsOverTimeEntry) {
    el.readsOverTimeEntry.addEventListener("change", () => {
      loadReadsOverTime({ showLoading: true });
    });
  }

  // Update entry options when reader analytics loads
  window.addEventListener("resize", () => {
    if (readsOverTimeData.length) {
      drawReadsOverTimeChart();
    }
  });
}

function createAnalytics({ hideAllSections, setActiveNav }) {
  function renderReaderAnalyticsView() {
    renderReaderAnalytics(lastReaderPayload || {});
  }

  function refreshAnalytics({ showLoading = true } = {}) {
    loadAnalyticsSummary({ showLoading });
    loadAnalyticsPages({ showLoading });
    loadReaderAnalytics({ showLoading }).then(() => {
      // Update entry options after reader analytics loads
      updateReadsOverTimeEntryOptions(lastReaderPayload);
    });
    loadReadsOverTime({ showLoading });
  }

  function showAnalyticsSection() {
    hideAllSections();
    if (el.analyticsSection) {
      el.analyticsSection.style.display = "block";
      el.analyticsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setActiveNav(el.btnAnalytics);
    refreshAnalytics({ showLoading: true });
  }

  // Initialize Reads Over Time controls
  initReadsOverTimeControls();

  return {
    loadAnalyticsSummary,
    loadAnalyticsPages,
    loadReaderAnalytics,
    loadReadsOverTime,
    loadLiveVisitors,
    renderReaderAnalyticsView,
    refreshAnalytics,
    showAnalyticsSection,
    startLiveVisitors,
    stopLiveVisitors,
    shiftLiveRange,
  };
}

export { createAnalytics };

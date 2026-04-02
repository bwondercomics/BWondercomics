/**
 * Admin Analytics UI
 *
 * Renders analytics data in the admin dashboard:
 * - Summary cards (reads, finishes, finish rate, unique visitors)
 * - Visitor traffic/acquisition panels from Umami
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
  ANALYTICS_VISITORS_ENDPOINT,
  ANALYTICS_VISITOR_HISTORY_ENDPOINT,
  ANALYTICS_READER_ENDPOINT,
  ANALYTICS_READER_SERIES_ENDPOINT,
  ANALYTICS_LIVE_ENDPOINT,
} from "./state.js";

const READS_OVER_TIME_ENDPOINT = "/api/admin/analytics/reads-over-time";
const WEEKLY_DIGEST_ENDPOINT = "/api/admin/analytics/weekly-digest";

// Health indicator thresholds
const HEALTH_THRESHOLDS = {
  finishRate: { good: 0.6, concern: 0.4 },
  weekChange: { good: 0.1, concern: -0.1 },
};

let lastWeeklyDigest = null;
const activeReaderDetails = new Map();
let readsOverTimeData = [];
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
  } catch {
    // Ignore storage parsing errors.
  }
}

function saveLiveHistoryToStorage() {
  try {
    if (!Array.isArray(liveHistory)) return;
    const trimmed = liveHistory.slice(-LIVE_HISTORY_MAX_ITEMS);
    localStorage.setItem(LIVE_HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
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

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

/**
 * Calculate health status based on finish rate and week-over-week change.
 * Returns: { status: 'good'|'neutral'|'concern', title: string, summary: string }
 */
function calculateHealthStatus(readerPayload, weeklyDigest) {
  const finishRate = Number(readerPayload?.finishRate) || 0;
  const changes = weeklyDigest?.changes || {};
  const thisWeek = weeklyDigest?.thisWeek || {};

  // Determine status based on finish rate and week-over-week change
  let status = 'neutral';
  let title = 'Content is performing steadily';
  let summary = 'Your reader engagement is holding stable.';

  const readsChange = changes.reads?.percent || 0;

  // Good: high finish rate OR positive growth
  if (finishRate >= HEALTH_THRESHOLDS.finishRate.good || readsChange >= HEALTH_THRESHOLDS.weekChange.good) {
    status = 'good';
    title = 'Your content is performing well';
    if (finishRate >= HEALTH_THRESHOLDS.finishRate.good && readsChange > 0) {
      summary = `Readers are engaged with a ${Math.round(finishRate * 100)}% start-to-finish rate and page reads are growing.`;
    } else if (finishRate >= HEALTH_THRESHOLDS.finishRate.good) {
      summary = `Strong ${Math.round(finishRate * 100)}% start-to-finish rate shows readers are completing your content.`;
    } else {
      summary = `Page reads are up ${Math.round(readsChange * 100)}% from last week.`;
    }
  }
  // Concern: low finish rate AND negative growth
  else if (finishRate < HEALTH_THRESHOLDS.finishRate.concern && readsChange < HEALTH_THRESHOLDS.weekChange.concern) {
    status = 'concern';
    title = 'Content needs attention';
    summary = `Start-to-finish rate (${Math.round(finishRate * 100)}%) and page reads are both down. Consider reviewing recent entries.`;
  }
  // Concern: very low finish rate
  else if (finishRate < HEALTH_THRESHOLDS.finishRate.concern) {
    status = 'concern';
    title = 'Readers are dropping off early';
    summary = `Only ${Math.round(finishRate * 100)}% of starts convert to finishes. Review your opening pages and pacing.`;
  }
  // Neutral with context
  else {
    if (readsChange > 0) {
      summary = `Page reads are up ${Math.round(readsChange * 100)}% this week with ${Math.round(finishRate * 100)}% start-to-finish rate.`;
    } else if (readsChange < 0) {
      summary = `Page reads are down ${Math.round(Math.abs(readsChange) * 100)}% but start-to-finish rate is ${Math.round(finishRate * 100)}%.`;
    }
  }

  return { status, title, summary, finishRate, changes, thisWeek };
}

/**
 * Format a trend indicator with arrow and percentage.
 */
function formatTrendHtml(changeObj) {
  if (!changeObj || typeof changeObj.percent !== 'number') {
    return { html: '', className: 'trend-flat' };
  }
  const pct = changeObj.percent;
  const pctStr = Math.round(Math.abs(pct) * 100);
  if (pct > 0.01) {
    return { html: `↑${pctStr}%`, className: 'trend-up' };
  } else if (pct < -0.01) {
    return { html: `↓${pctStr}%`, className: 'trend-down' };
  }
  return { html: '→', className: 'trend-flat' };
}

/**
 * Update the health indicator UI.
 */
function renderHealthIndicator(readerPayload, weeklyDigest) {
  if (!el.healthDot || !el.healthTitle) return;

  const health = calculateHealthStatus(readerPayload, weeklyDigest);

  // Update dot color
  el.healthDot.className = `analytics-health-dot ${health.status}`;

  // Update title and summary
  el.healthTitle.textContent = health.title;
  el.healthTitle.className = `analytics-health-title stat-${health.status}`;
  if (el.healthSummary) {
    el.healthSummary.textContent = health.summary;
  }
}

/**
 * Fetch weekly digest for health indicator.
 */
async function fetchWeeklyDigest() {
  try {
    const res = await fetch(WEEKLY_DIGEST_ENDPOINT, { credentials: "include" });
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

/**
 * Generate an insight sentence about the top performer.
 */
function generateInsightSentence(payload) {
  const entryViews = payload?.entryViews || [];
  if (!entryViews.length) return "";

  // Find top performer
  const top = entryViews[0];
  const topLabel = top?.label || top?.entryTitle || "Unknown";
  const topReads = top?.count || 0;

  const topRate = (payload?.entryRates || [])
    .find((item) =>
      String(item?.seriesId || "") === String(top?.seriesId || "") &&
      Number(item?.displayNumber) === Number(top?.displayNumber),
    );
  const finishRate = Number.isFinite(Number(topRate?.completionRate))
    ? Math.round(Number(topRate.completionRate) * 100)
    : null;

  if (finishRate !== null) {
    return `${topLabel} leads the selected range with ${topReads} pages read and a ${finishRate}% start-to-finish rate.`;
  }
  return `${topLabel} leads the selected range with ${topReads} pages read.`;
}

/**
 * Initialize tab switching for Reader Analytics.
 */
function initReaderTabs() {
  const tabs = document.querySelectorAll('.analytics-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active tab button
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Show corresponding content
      const tabName = /** @type {HTMLElement} */ (tab).dataset.tab;
      if (el.tabEntry) {
        el.tabEntry.classList.toggle('active', tabName === 'entry');
      }
      if (el.tabSeries) {
        el.tabSeries.classList.toggle('active', tabName === 'series');
      }
    });
  });
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

function setVisitorHistoryStatus(message, isError = false) {
  if (!el.analyticsVisitorHistoryStatus) return;
  el.analyticsVisitorHistoryStatus.textContent = message || "";
  el.analyticsVisitorHistoryStatus.style.display = message ? "block" : "none";
  el.analyticsVisitorHistoryStatus.className = isError ? "error-message" : "success-message";
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
      starts: item?.starts,
      finishes: item?.finishes,
      pageViews: item?.pageViews,
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
  if (!Number.isFinite(rate)) return "Rate —";
  const pct = Math.round(rate * 100);
  return `Start-to-finish ${pct}%`;
}

function formatStartFinishText(item) {
  const starts = Number(item?.starts);
  const finishes = Number(item?.finishes);
  const startText = Number.isFinite(starts) ? formatStat(starts) : "0";
  const finishText = Number.isFinite(finishes) ? formatStat(finishes) : "0";
  return `${startText} starts · ${finishText} finishes`;
}

function formatBounceRate(item) {
  const visits = Number(item?.visits);
  const bounces = Number(item?.bounces);
  if (!Number.isFinite(visits) || visits <= 0 || !Number.isFinite(bounces)) {
    return "Bounce —";
  }
  return `Bounce ${Math.round((bounces / visits) * 100)}%`;
}

function formatAverageVisitTime(item) {
  const totalTime = Number(item?.totaltime);
  const visits = Number(item?.visits);
  if (!Number.isFinite(totalTime) || totalTime <= 0 || !Number.isFinite(visits) || visits <= 0) {
    return "Avg time —";
  }
  const averageSeconds = totalTime / visits / 1000;
  return `Avg time ${formatDuration(averageSeconds)}`;
}

function formatExpandedMetricText(item) {
  const parts = [];
  const pageviews = Number(item?.pageviews);
  const visits = Number(item?.visits);
  if (Number.isFinite(pageviews) && pageviews > 0) {
    parts.push(`${formatStat(pageviews)} views`);
  }
  if (Number.isFinite(visits) && visits > 0) {
    parts.push(`${formatStat(visits)} visits`);
  }
  parts.push(formatBounceRate(item));
  parts.push(formatAverageVisitTime(item));
  return parts.join(" · ");
}

function formatMetricName(item, fallback = "Unknown") {
  const raw = String(item?.name || item?.label || item?.path || item?.x || "").trim();
  if (!raw) return fallback;
  return raw === "/" ? "/ (home)" : raw;
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
    const label = item?.entryLabel || item?.value || item?.label || "";
    const extractedSeries = extractSeriesName(label);
    return extractedSeries === seriesFilter;
  });
}

function clearEntryDetails() {
  const targets = new Set([
    el.analyticsEntryReads?.id,
    el.analyticsEntryRates?.id,
  ]);
  targets.forEach((targetId) => {
    if (targetId) activeReaderDetails.delete(targetId);
  });
}


function renderMetricList(containerId, items, valueLabel = "Views", emptyText = "No data available") {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items || !items.length) {
    container.innerHTML = `<div class="analytics-pages-empty">${escapeHtml(emptyText)}</div>`;
    return;
  }

  const maxVal = Math.max(
    ...items.map((i) => Number(i.views || i.count || i.y || 0)),
    1,
  );

  container.innerHTML = items
    .map((item) => {
      const label = item.path || item.name || item.value || item.label || item.x || "Unknown";
      const count = Number(item.views || item.count || item.y || 0);
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

function clearAnalyticsVisitors() {
  renderExpandedMetricList(
    el.analyticsLandingPagesList,
    [],
    "No landing-page data available.",
  );
  renderExpandedMetricList(
    el.analyticsReferrersList,
    [],
    "No referrer data available.",
  );
  renderExpandedMetricList(
    el.analyticsCountriesList,
    [],
    "No country data available.",
  );
  renderExpandedMetricList(
    el.analyticsBrowsersList,
    [],
    "No browser data available.",
  );
  renderExpandedMetricList(
    el.analyticsDevicesList,
    [],
    "No device data available.",
  );
  renderMetricList("analyticsEventsList", [], "Events", "No event data available.");
}

function renderAnalyticsVisitors(payload) {
  renderExpandedMetricList(
    el.analyticsLandingPagesList,
    payload?.landingPages,
    "No landing-page data available.",
  );
  renderExpandedMetricList(
    el.analyticsReferrersList,
    payload?.referrers,
    "No referrer data available.",
  );
  renderExpandedMetricList(
    el.analyticsCountriesList,
    payload?.countries,
    "No country data available.",
  );
  renderExpandedMetricList(
    el.analyticsBrowsersList,
    payload?.browsers,
    "No browser data available.",
  );
  renderExpandedMetricList(
    el.analyticsDevicesList,
    payload?.devices,
    "No device data available.",
  );
  renderMetricList("analyticsEventsList", payload?.events, "Events", "No event data available.");
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
  // Update trends from weekly digest if available
  updateSummaryTrends();
}

/**
 * Update summary card trends from weekly digest.
 * Called after renderReaderSummary and when weekly digest loads.
 */
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

  // Calculate average for color-coding (relative performance)
  const rankFn =
    typeof options.rankFn === "function"
      ? options.rankFn
      : (item) => Number(item.count) || 0;
  const counts = list.map((item) => Number(rankFn(item)) || 0);
  const avg = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  const max = Math.max(...counts);

  target.innerHTML = list
    .map((item, index) => {
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
      const formatted =
        typeof options.valueFormatter === "function"
          ? options.valueFormatter(item)
          : formatStat(item.count);
      const countAttr = escapeHtml(String(item.count ?? ""));
      const rateAttr = escapeHtml(String(item.completionRate ?? ""));
      const startsAttr = escapeHtml(String(item.starts ?? ""));
      const finishesAttr = escapeHtml(String(item.finishes ?? ""));
      const pageViewsAttr = escapeHtml(String(item.pageViews ?? ""));
      const count = Number(item.count) || 0;
      const rankValue = Number(rankFn(item)) || 0;

      // Color-code: top item green, below average red, others neutral
      let colorClass = '';
      if (counts.length > 1) {
        if (index === 0 && rankValue === max) {
          colorClass = 'stat-good';
        } else if (rankValue < avg * 0.5) {
          colorClass = 'stat-concern';
        }
      }

      return `
        <div class="analytics-reader-item ${colorClass}" data-label="${label}" data-value="${value}" data-count="${countAttr}" data-rate="${rateAttr}" data-starts="${startsAttr}" data-finishes="${finishesAttr}" data-page-views="${pageViewsAttr}" data-sub="${safeSubLabel}" data-event="${options.eventName || ""}" data-property="${options.propertyName || ""}" data-metric="${options.metric || ""}">
          <div class="analytics-reader-label">
            <div>${label}</div>
            ${subHtml}
          </div>
          <div class="analytics-reader-value">${escapeHtml(formatted)}</div>
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
  const metric = detail.metric || "page_views";
  const isRatioMetric = metric === "completion_rate";
  const metaItems = [];
  if (isRatioMetric) {
    metaItems.push({
      label: "Rate",
      value: formatPercent(detail.completionRate),
      note: detail.pageViews !== null && detail.pageViews !== undefined
        ? `${formatStat(detail.pageViews)} pages read`
        : "",
    });
    metaItems.push({
      label: "Starts",
      value: formatStat(detail.starts),
      note: "",
    });
    metaItems.push({
      label: "Finishes",
      value: formatStat(detail.finishes),
      note: detail.subLabel || "",
    });
  } else {
    metaItems.push({
      label: "Pages Read",
      value: formatStat(detail.count),
      note: detail.subLabel || "",
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
            ${item.note
              ? `<div class="analytics-detail-meta-note">${escapeHtml(item.note)}</div>`
              : ""}
          </div>
        `,
          )
          .join("")}
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
    const max = isRatioMetric
      ? 100
      : detail.series.reduce(
          (acc, point) => Math.max(acc, Number(point.count) || 0),
          0,
        );
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
            : ""
          : count > 0
            ? formatStat(count)
            : "";
        const timeLabel = formatBucketLabel(rangeKey, point.end || point.start);
        return `
          <div class="analytics-detail-bar-wrap">
            <div class="analytics-detail-bar-body">
              <div class="analytics-detail-bar-count" title="${escapeHtml(
          countLabel || "0",
        )}">${escapeHtml(
          countLabel,
        )}</div>
              <div class="analytics-detail-bar-slot">
                <div class="analytics-detail-bar" title="${escapeHtml(
          titleText,
        )}" style="height: ${height.toFixed(1)}%"></div>
              </div>
            </div>
            <div class="analytics-detail-bar-time" title="${escapeHtml(
          timeLabel,
        )}">${escapeHtml(
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

function renderExpandedMetricList(target, items, emptyText) {
  if (!target) return;
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    target.innerHTML = `<div class="analytics-pages-empty">${escapeHtml(emptyText)}</div>`;
    return;
  }

  const maxVisitors = Math.max(...list.map((item) => Number(item?.visitors) || 0), 1);
  target.innerHTML = list
    .map((item) => {
      const label = formatMetricName(item);
      const visitors = Number(item?.visitors) || 0;
      const pct = (visitors / maxVisitors) * 100;
      const meta = formatExpandedMetricText(item);

      return `
        <div class="analytics-page-row" style="margin-bottom: 8px;">
          <div class="analytics-page-info" style="display: flex; flex-direction: column; width: 100%;">
            <div class="analytics-page-path" title="${escapeHtml(label)}" style="font-size: 0.9em; margin-bottom: 2px;">${escapeHtml(label)}</div>
            <div class="analytics-reader-sub" style="margin-top: 0; margin-bottom: 6px;">${escapeHtml(meta)}</div>
            <div class="analytics-page-bar" style="background: rgba(255, 255, 255, 0.1); border-radius: 4px; overflow: hidden; height: 6px;">
              <div class="analytics-page-fill" style="width: ${pct}%; background: var(--primary); height: 100%;"></div>
            </div>
          </div>
          <div class="analytics-page-count" style="font-size: 0.85em; margin-top: 2px; text-align: right;">
            ${formatStat(visitors)} <span style="opacity: 0.6; font-size: 0.9em;">Visitors</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function formatVisitorKey(value) {
  const text = String(value || "").trim();
  if (!text) return "Unknown visitor";
  if (text.length <= 18) return text;
  return `${text.slice(0, 8)}…${text.slice(-6)}`;
}

function renderVisitorHistory(payload) {
  if (!el.analyticsVisitorHistoryList) return;
  const visitors = Array.isArray(payload?.visitors) ? payload.visitors : [];
  const totalVisitors = Number(payload?.totalVisitors) || visitors.length;
  const returned = Number(payload?.returned) || visitors.length;
  const ts = payload?.generatedAt ? new Date(payload.generatedAt) : null;
  const tsText = ts ? ts.toLocaleString() : "just now";

  if (el.analyticsVisitorHistoryMeta) {
    el.analyticsVisitorHistoryMeta.textContent = `Showing ${formatStat(returned)} of ${formatStat(totalVisitors)} visitors. Updated ${tsText}.`;
  }

  if (!visitors.length) {
    el.analyticsVisitorHistoryList.innerHTML =
      '<div class="analytics-pages-empty">No visitor history for this range yet.</div>';
    return;
  }

  el.analyticsVisitorHistoryList.innerHTML = visitors
    .map((visitor) => {
      const issues = Array.isArray(visitor?.issues) ? visitor.issues : [];
      const metaLine = [
        visitor?.country || "",
        visitor?.browser || "",
        visitor?.device || "",
      ]
        .filter(Boolean)
        .join(" · ");
      const issuesHtml = issues.length
        ? issues
            .map((issue) => {
              const issueParts = [`${formatStat(issue?.pagesRead)} pages`];
              if (issue?.maxPageReached) {
                issueParts.push(`max page ${formatStat(issue.maxPageReached)}`);
              }
              if (issue?.totalPages) {
                issueParts.push(`${formatStat(issue.totalPages)} total`);
              }
              issueParts.push(issue?.finished ? "finished" : "in progress");
              const title = issue?.entryTitle || `Entry ${issue?.entryDisplayNumber || "?"}`;
              const seriesTitle = issue?.seriesTitle || issue?.seriesId || "Unknown series";
              return `
                <div class="analytics-visitor-issue">
                  <div class="analytics-visitor-issue-title">${escapeHtml(seriesTitle)} · ${escapeHtml(title)}</div>
                  <div class="analytics-visitor-issue-meta">${escapeHtml(issueParts.join(" · "))}</div>
                </div>
              `;
            })
            .join("")
        : '<div class="analytics-pages-empty" style="margin: 0;">No reader activity in this range.</div>';

      return `
        <details class="analytics-visitor-row">
          <summary class="analytics-visitor-summary">
            <div class="analytics-visitor-summary-main">
              <div class="analytics-visitor-key" title="${escapeHtml(visitor?.visitorKey || "")}">${escapeHtml(formatVisitorKey(visitor?.visitorKey))}</div>
              <div class="analytics-visitor-summary-sub">${escapeHtml(metaLine || "Visitor metadata unavailable")}</div>
            </div>
            <div class="analytics-visitor-summary-metrics">
              <span>${formatStat(visitor?.pagesRead)} pages</span>
              <span>${formatStat(visitor?.issuesStarted)} issues</span>
              <span>${formatStat(visitor?.issuesFinished)} finished</span>
            </div>
          </summary>
          <div class="analytics-visitor-body">
            <div class="analytics-visitor-fields">
              <div class="analytics-visitor-field"><span class="analytics-visitor-field-label">First Seen</span><span>${escapeHtml(formatDateTime(visitor?.firstSeen))}</span></div>
              <div class="analytics-visitor-field"><span class="analytics-visitor-field-label">Last Seen</span><span>${escapeHtml(formatDateTime(visitor?.lastSeen))}</span></div>
              <div class="analytics-visitor-field"><span class="analytics-visitor-field-label">Landing Page</span><span>${escapeHtml(visitor?.landingPage || "—")}</span></div>
              <div class="analytics-visitor-field"><span class="analytics-visitor-field-label">Last Path</span><span>${escapeHtml(visitor?.lastPath || "—")}</span></div>
              <div class="analytics-visitor-field"><span class="analytics-visitor-field-label">Referrer</span><span>${escapeHtml(visitor?.referrer || "Direct")}</span></div>
            </div>
            <div class="analytics-visitor-issues">${issuesHtml}</div>
          </div>
        </details>
      `;
    })
    .join("");
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
    metric: detail.metric || "page_views",
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
    } catch {
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
  }

  if (detail.requestId !== requestId) return;
  detail.loading = false;
  renderReaderDetail(target, detail);
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
    const rateRaw = item.dataset.rate;
    const startsRaw = item.dataset.starts;
    const finishesRaw = item.dataset.finishes;
    const pageViewsRaw = item.dataset.pageViews;
    const eventName = item.dataset.event || "";
    const propertyName = item.dataset.property || "";
    const metric = item.dataset.metric || "page_views";
    if (!value || !eventName || !propertyName) return;

    const detail = {
      title: target.dataset.title || "Reader Analytics",
      label,
      value,
      subLabel,
      count: metric === "completion_rate" || Number.isNaN(countValue) ? null : countValue,
      completionRate:
        rateRaw !== undefined && rateRaw !== "" ? Number(rateRaw) : null,
      starts: startsRaw !== undefined && startsRaw !== "" ? Number(startsRaw) : null,
      finishes:
        finishesRaw !== undefined && finishesRaw !== "" ? Number(finishesRaw) : null,
      pageViews:
        pageViewsRaw !== undefined && pageViewsRaw !== "" ? Number(pageViewsRaw) : null,
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
    detail.metric = card.metric || detail.metric;
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

  // Render insight sentence
  if (el.analyticsInsight) {
    el.analyticsInsight.textContent = generateInsightSentence(lastReaderPayload);
  }

  const seriesFilter = updateReaderSeriesOptions(lastReaderPayload);
  if (seriesFilter !== lastReaderSeriesFilter) {
    lastReaderSeriesFilter = seriesFilter;
    clearEntryDetails();
  }

  const entryViews = filterEntryItems(payload?.entryViews, seriesFilter);
  const entryRates = filterEntryItems(
    payload?.entryRates,
    seriesFilter,
  );

  const cards = [
    {
      target: el.analyticsEntryReads,
      title: "Pages Read",
      metric: "page_views",
      eventName: "reader_page_view",
      propertyName: "entryLabel",
      items: entryViews,
      emptyText: "No page reads yet. Reader pageviews will appear here as visitors move through entries.",
      subLabelFn: (item) => formatDeltaText(item),
    },
    {
      target: el.analyticsSeriesReads,
      title: "Series Pages Read",
      metric: "page_views",
      eventName: "reader_page_view",
      propertyName: "series",
      items: payload?.seriesViews,
      emptyText: "No series page-read data yet. This will populate as readers explore your comics.",
      subLabelFn: (item) => formatDeltaText(item),
    },
    {
      target: el.analyticsEntryRates,
      title: "Start-to-Finish Rate",
      metric: "completion_rate",
      eventName: "reader_entry_complete",
      propertyName: "entryLabel",
      items: entryRates,
      emptyText: "No start-to-finish data yet. Rates will appear once entries have both starts and finishes.",
      subLabelFn: (item) => formatStartFinishText(item),
      valueFormatter: (item) => formatPercent(item?.completionRate),
      rankFn: (item) => Number(item?.completionRate) || 0,
    },
    {
      target: el.analyticsSeriesRates,
      title: "Series Start-to-Finish Rate",
      metric: "completion_rate",
      eventName: "reader_entry_complete",
      propertyName: "series",
      items: payload?.seriesRates,
      emptyText: "No series conversion data yet. Rates will appear once readers start and finish entries.",
      subLabelFn: (item) => formatStartFinishText(item),
      valueFormatter: (item) => formatPercent(item?.completionRate),
      rankFn: (item) => Number(item?.completionRate) || 0,
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
    } catch {
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
    } catch {
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
    } catch {
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

async function loadAnalyticsVisitors({ showLoading = true } = {}) {
  if (!el.analyticsReferrersList) return;
  const range = getAnalyticsRange();
  const params = new URLSearchParams({
    range,
    limit: "8",
  });

  if (showLoading) {
    renderExpandedMetricList(
      el.analyticsLandingPagesList,
      [],
      "Loading visitor data…",
    );
    renderExpandedMetricList(
      el.analyticsReferrersList,
      [],
      "Loading visitor data…",
    );
    renderExpandedMetricList(
      el.analyticsCountriesList,
      [],
      "Loading visitor data…",
    );
    renderExpandedMetricList(
      el.analyticsBrowsersList,
      [],
      "Loading visitor data…",
    );
    renderExpandedMetricList(
      el.analyticsDevicesList,
      [],
      "Loading visitor data…",
    );
    renderMetricList("analyticsEventsList", [], "Events", "Loading visitor data…");
  }

  try {
    const res = await fetch(`${ANALYTICS_VISITORS_ENDPOINT}?${params.toString()}`, {
      cache: "no-store",
    });
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      const errorText =
        (payload && typeof payload === "object" && payload.error) ||
        `HTTP ${res.status}`;
      throw new Error(errorText);
    }

    renderAnalyticsVisitors(payload || {});
  } catch (_err) {
    clearAnalyticsVisitors();
  }
}

async function loadVisitorHistory({ showLoading = true } = {}) {
  if (!el.analyticsVisitorHistoryList) return;
  const range = getAnalyticsRange();
  const params = new URLSearchParams({
    range,
    limit: "50",
  });

  if (showLoading) {
    if (el.analyticsVisitorHistoryMeta) {
      el.analyticsVisitorHistoryMeta.textContent = "";
    }
    el.analyticsVisitorHistoryList.innerHTML =
      '<div class="analytics-pages-empty">Loading visitor history…</div>';
    setVisitorHistoryStatus("Loading visitor history…");
  }

  try {
    const res = await fetch(
      `${ANALYTICS_VISITOR_HISTORY_ENDPOINT}?${params.toString()}`,
      { cache: "no-store" },
    );
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      const errorText =
        (payload && typeof payload === "object" && payload.error) ||
        `HTTP ${res.status}`;
      throw new Error(errorText);
    }

    renderVisitorHistory(payload || {});
    setVisitorHistoryStatus("");
  } catch (err) {
    if (el.analyticsVisitorHistoryMeta) {
      el.analyticsVisitorHistoryMeta.textContent = "";
    }
    el.analyticsVisitorHistoryList.innerHTML =
      '<div class="analytics-pages-empty">No visitor history available.</div>';
    setVisitorHistoryStatus(
      `Analytics error: ${err?.message || "Unable to load visitor history."}`,
      true,
    );
  }
}

async function loadReaderAnalytics({ showLoading = true } = {}) {
  if (!el.analyticsEntryReads || !el.analyticsEntryRates) return;
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
    } catch {
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
  const width = Math.max(1, Math.floor(rect.width || canvas.clientWidth || 0));
  const height = Math.max(1, Math.floor(rect.height || canvas.clientHeight || 0));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const padding = { top: 20, right: 20, bottom: 34, left: 45 };

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
  const chartWidth = Math.max(1, width - padding.left - padding.right);
  const chartHeight = Math.max(1, height - padding.top - padding.bottom);
  const xScale = data.length > 1 ? chartWidth / (data.length - 1) : 0;
  const yScale = chartHeight / maxCount;
  const points = data.map((point, index) => {
    const count = Math.max(0, Number(point?.count) || 0);
    const x =
      data.length === 1
        ? padding.left + chartWidth / 2
        : padding.left + index * xScale;
    const y = padding.top + chartHeight - count * yScale;
    return { ...point, count, x, y };
  });

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

  // Draw area fill under the line
  const lineColor = getCssVar("--accent", "#ffed00");
  const glowColor = getCssVar("--secondary", "#ff00ea");
  const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
  gradient.addColorStop(0, "rgba(255, 237, 0, 0.3)");
  gradient.addColorStop(0.5, "rgba(255, 237, 0, 0.1)");
  gradient.addColorStop(1, "rgba(255, 237, 0, 0)");

  ctx.beginPath();
  points.forEach((point, i) => {
    const { x, y } = point;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  // Close the path to create the fill area
  const lastX = points[points.length - 1]?.x ?? padding.left;
  ctx.lineTo(lastX, padding.top + chartHeight);
  ctx.lineTo(points[0]?.x ?? padding.left, padding.top + chartHeight);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw line
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 6;
  ctx.beginPath();

  points.forEach((point, i) => {
    const { x, y } = point;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Draw points
  ctx.fillStyle = lineColor;
  const pointRadius = data.length > 21 ? 2 : 3;
  points.forEach((point) => {
    const { x, y } = point;
    ctx.beginPath();
    ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw x-axis labels
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  const maxLabels = Math.max(2, Math.floor(chartWidth / 72));
  const step = Math.max(1, Math.ceil(data.length / maxLabels));
  points.forEach((point, i) => {
    if (i % step === 0 || i === points.length - 1) {
      const date = new Date(point.date);
      const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      ctx.fillText(label, point.x, height - 10);
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

  if (showLoading) setReadsOverTimeStatus("Loading pages-read chart…");

  try {
    const res = await fetch(`${READS_OVER_TIME_ENDPOINT}?${params.toString()}`, {
      cache: "no-store",
    });
    let payload = null;
    try {
      payload = await res.json();
    } catch {
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
      el.readsOverTimeTotals.textContent = `Total: ${formatStat(reads)} pages read · ${formatStat(uniqueVisitors)} visitors`;
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
    loadAnalyticsVisitors({ showLoading });
    loadVisitorHistory({ showLoading });

    // Fetch reader analytics and weekly digest in parallel, then render health indicator
    const readerPromise = loadReaderAnalytics({ showLoading }).then(() => {
      // Update entry options after reader analytics loads
      updateReadsOverTimeEntryOptions(lastReaderPayload);
    });
    const digestPromise = fetchWeeklyDigest();

    Promise.all([readerPromise, digestPromise]).then(() => {
      renderHealthIndicator(lastReaderPayload, lastWeeklyDigest);
      updateSummaryTrends(); // Re-apply trends now that digest is loaded
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

  // Initialize Reader Analytics tabs
  initReaderTabs();

  return {
    loadAnalyticsSummary,
    loadAnalyticsPages,
    loadAnalyticsVisitors,
    loadVisitorHistory,
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

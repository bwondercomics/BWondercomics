import { el } from "../dom.js";
import {
  ANALYTICS_ENDPOINT,
  ANALYTICS_PAGES_ENDPOINT,
  ANALYTICS_VISITORS_ENDPOINT,
} from "../state.js";
import {
  escapeHtml,
  formatDuration,
  formatStat,
} from "./shared.js";

function createTrafficAnalytics() {
  function getAnalyticsRange() {
    return (el.analyticsPagesRange?.value || "7d").trim();
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

  function getAnalyticsCount(item) {
    const value = item?.count ?? item?.views ?? item?.total ?? item?.value ?? 0;
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
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
    if (
      !Number.isFinite(totalTime) ||
      totalTime <= 0 ||
      !Number.isFinite(visits) ||
      visits <= 0
    ) {
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

  function renderMetricList(
    containerId,
    items,
    valueLabel = "Views",
    emptyText = "No data available",
  ) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items || !items.length) {
      container.innerHTML = `<div class="analytics-pages-empty">${escapeHtml(emptyText)}</div>`;
      return;
    }

    const maxVal = Math.max(
      ...items.map((item) => Number(item.views || item.count || item.y || 0)),
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
    renderMetricList(
      "analyticsEventsList",
      payload?.events,
      "Events",
      "No event data available.",
    );
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
      return payload || {};
    } catch (err) {
      clearAnalyticsSummary();
      setAnalyticsStatus(
        `Analytics error: ${err?.message || "Unable to load Umami stats."}`,
        true,
      );
      return null;
    }
  }

  async function loadAnalyticsPages({ showLoading = true } = {}) {
    if (!el.analyticsPagesList) return null;
    if (showLoading) setPagesStatus("Loading page reads…");
    const params = new URLSearchParams({
      range: getAnalyticsRange(),
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
      return payload || {};
    } catch (err) {
      renderAnalyticsPages({});
      setPagesStatus(
        `Analytics error: ${err?.message || "Unable to load page reads."}`,
        true,
      );
      return null;
    }
  }

  async function loadAnalyticsVisitors({ showLoading = true } = {}) {
    if (!el.analyticsReferrersList) return null;
    const params = new URLSearchParams({
      range: getAnalyticsRange(),
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
      return payload || {};
    } catch {
      clearAnalyticsVisitors();
      return null;
    }
  }

  return {
    loadAnalyticsPages,
    loadAnalyticsSummary,
    loadAnalyticsVisitors,
  };
}

export { createTrafficAnalytics };

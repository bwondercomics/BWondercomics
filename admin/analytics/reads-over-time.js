import { el } from "../dom.js";
import {
  formatStat,
  getCssVar,
} from "./shared.js";

const READS_OVER_TIME_ENDPOINT = "/api/admin/analytics/reads-over-time";

function createReadsOverTimeAnalytics() {
  let readsOverTimeData = [];

  function syncReadsOverTimeEntryVisibility(mode) {
    const shell = document.getElementById("readsOverTimeEntryShell");
    if (!shell || !el.readsOverTimeEntry) return;
    const isEntryMode = mode === "entry";
    shell.classList.toggle("is-hidden", !isEntryMode);
    el.readsOverTimeEntry.disabled = !isEntryMode;
    shell.setAttribute("aria-hidden", isEntryMode ? "false" : "true");
  }

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
    const validEntries = entryViews
      .filter((item) => item?.displayNumber != null)
      .slice(0, 50);
    const duplicateDisplayNumbers = new Map();
    const duplicateLabels = new Map();
    validEntries.forEach((item) => {
      const displayKey = String(item?.displayNumber ?? "");
      duplicateDisplayNumbers.set(
        displayKey,
        (duplicateDisplayNumbers.get(displayKey) || 0) + 1,
      );
      const label = String(item?.label || `Entry ${item?.displayNumber ?? ""}`);
      duplicateLabels.set(label, (duplicateLabels.get(label) || 0) + 1);
    });

    const current = getReadsOverTimeEntry();
    el.readsOverTimeEntry.innerHTML = "";

    validEntries.forEach((item) => {
      const option = document.createElement("option");
      option.value = String(item.entryKey || item.displayNumber);
      const baseLabel = item.label || `Entry ${item.displayNumber}`;
      const needsSeriesContext =
        (duplicateDisplayNumbers.get(String(item.displayNumber)) || 0) > 1 ||
        (duplicateLabels.get(baseLabel) || 0) > 1;
      const label = needsSeriesContext && item.seriesTitle
        ? `${item.seriesTitle} · ${baseLabel}`
        : baseLabel;
      option.title = label;
      option.textContent = label.length > 38 ? `${label.slice(0, 38)}…` : label;
      el.readsOverTimeEntry.appendChild(option);
    });

    const validValues = validEntries.map((item) => String(item.entryKey || item.displayNumber));
    if (current && validValues.includes(current)) {
      el.readsOverTimeEntry.value = current;
    } else if (validEntries.length) {
      el.readsOverTimeEntry.value = String(validEntries[0].entryKey || validEntries[0].displayNumber);
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

    const maxCount = Math.max(...data.map((item) => item.count || 0), 1);
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

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    for (let index = 0; index <= 4; index += 1) {
      const y = padding.top + (chartHeight * index) / 4;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    const lineColor = getCssVar("--accent", "#ffed00");
    const glowColor = getCssVar("--secondary", "#ff00ea");
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
    gradient.addColorStop(0, "rgba(255, 237, 0, 0.3)");
    gradient.addColorStop(0.5, "rgba(255, 237, 0, 0.1)");
    gradient.addColorStop(1, "rgba(255, 237, 0, 0)");

    ctx.beginPath();
    points.forEach((point, index) => {
      const { x, y } = point;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    const lastX = points[points.length - 1]?.x ?? padding.left;
    ctx.lineTo(lastX, padding.top + chartHeight);
    ctx.lineTo(points[0]?.x ?? padding.left, padding.top + chartHeight);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    points.forEach((point, index) => {
      const { x, y } = point;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = lineColor;
    const pointRadius = data.length > 21 ? 2 : 3;
    points.forEach((point) => {
      const { x, y } = point;
      ctx.beginPath();
      ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    const maxLabels = Math.max(2, Math.floor(chartWidth / 72));
    const step = Math.max(1, Math.ceil(data.length / maxLabels));
    points.forEach((point, index) => {
      if (index % step === 0 || index === points.length - 1) {
        const date = new Date(point.date);
        const label = date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        ctx.fillText(label, point.x, height - 10);
      }
    });

    ctx.textAlign = "right";
    for (let index = 0; index <= 4; index += 1) {
      const value = Math.round((maxCount * (4 - index)) / 4);
      const y = padding.top + (chartHeight * index) / 4;
      ctx.fillText(String(value), padding.left - 8, y + 4);
    }
  }

  async function loadReadsOverTime({ showLoading = true } = {}) {
    if (!el.readsOverTimeCanvas) return null;

    const range = getReadsOverTimeRange();
    const mode = getReadsOverTimeMode();
    const entryId = mode === "entry" ? getReadsOverTimeEntry() : null;
    syncReadsOverTimeEntryVisibility(mode);

    const params = new URLSearchParams({ range });
    if (entryId) {
      if (entryId.includes(":")) params.append("entry_key", entryId);
      else params.append("entry_id", entryId);
    }

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
          (payload && typeof payload === "object" && payload.error) ||
          `HTTP ${res.status}`;
        throw new Error(errorText);
      }

      readsOverTimeData = Array.isArray(payload?.series) ? payload.series : [];
      drawReadsOverTimeChart();

      if (el.readsOverTimeTotals && payload?.totals) {
        const { reads, uniqueVisitors } = payload.totals;
        el.readsOverTimeTotals.textContent = `Total: ${formatStat(reads)} pages read · ${formatStat(uniqueVisitors)} visitors`;
      }

      setReadsOverTimeStatus("");
      return payload || {};
    } catch (err) {
      readsOverTimeData = [];
      drawReadsOverTimeChart();
      setReadsOverTimeStatus(err?.message || "Unable to load chart data.", true);
      return null;
    }
  }

  function initReadsOverTimeControls() {
    syncReadsOverTimeEntryVisibility(getReadsOverTimeMode());

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

    window.addEventListener("resize", () => {
      if (readsOverTimeData.length) {
        drawReadsOverTimeChart();
      }
    });
  }

  function setReaderPayload(payload) {
    updateReadsOverTimeEntryOptions(payload || {});
  }

  return {
    initReadsOverTimeControls,
    loadReadsOverTime,
    setReaderPayload,
  };
}

export { createReadsOverTimeAnalytics };

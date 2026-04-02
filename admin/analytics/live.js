import { el } from "../dom.js";
import { ANALYTICS_LIVE_ENDPOINT } from "../state.js";
import {
  escapeHtml,
  formatDuration,
  formatRangeMinutes,
  formatStat,
  formatTimeAgo,
  getCssVar,
} from "./shared.js";

const LIVE_REFRESH_MS = 5 * 60 * 1000;
const LIVE_RANGE_OPTIONS = [30, 60, 120, 360, 720, 1440];
const LIVE_MAX_HISTORY_MS = 24 * 60 * 60 * 1000;
const LIVE_HISTORY_STORAGE_KEY = "battlebros_admin_live_history";
const LIVE_HISTORY_MAX_ITEMS = 300;

function createLiveAnalytics() {
  let liveHistory = [];
  let liveTimer = null;
  let liveTickerRaf = null;
  let liveTickerLastTime = 0;
  let liveGraphRaf = null;
  let liveCanvasSize = { width: 0, height: 0 };
  let liveCanvasColors = null;
  let selectedLiveTime = null;

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

  function setLiveStatus(message, isError = false) {
    if (!el.liveVisitorsStatus) return;
    el.liveVisitorsStatus.textContent = message || "";
    el.liveVisitorsStatus.style.display = message ? "block" : "none";
    el.liveVisitorsStatus.className = isError ? "error-message" : "success-message";
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
      liveHistory = [...liveHistory.slice(0, -1), { ts: safeTs, count: countValue }];
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

  function clearLiveSelection() {
    selectedLiveTime = null;
    const btn = document.getElementById("btnLiveReset");
    if (btn) btn.remove();
    loadLiveVisitors();
    drawLiveSeismometer();
  }

  function handleLiveChartClick(event) {
    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const { width } = liveCanvasSize;
    const rangeMinutes = getLiveRangeMinutes();
    const rangeMs = rangeMinutes * 60 * 1000;
    const now = Date.now();
    const relative = x / width;
    const timeOffset = (1 - relative) * rangeMs;
    const targetTime = now - timeOffset;

    selectedLiveTime = targetTime;
    loadLiveVisitors({ at: targetTime });
    drawLiveSeismometer();

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
    for (let index = 1; index < verticalLines; index += 1) {
      const x = (width / verticalLines) * index;
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
        const displayName =
          user?.displayName || visitor?.userDisplayName || visitor?.userEmail || "Guest";
        const email = user?.email || visitor?.userEmail || "";
        const lastSeen = formatTimeAgo(visitor?.lastSeen);
        const derivedDurationSeconds =
          visitor?.durationSeconds ??
          (() => {
            const firstSeen = visitor?.firstSeen ? new Date(visitor.firstSeen).getTime() : NaN;
            const lastSeenTs = visitor?.lastSeen ? new Date(visitor.lastSeen).getTime() : NaN;
            if (!Number.isFinite(firstSeen) || !Number.isFinite(lastSeenTs)) return 0;
            return Math.max(0, Math.round((lastSeenTs - firstSeen) / 1000));
          })();
        const timeSpent = formatDuration(derivedDurationSeconds);
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
    const count = Number(payload?.activeCount ?? payload?.total) || 0;
    if (el.liveVisitorsCount) el.liveVisitorsCount.textContent = formatStat(count);
    recordLiveSample(count, payload?.generatedAt);
    renderLiveChart(getLiveRangeMinutes());
    renderLiveTicker(payload?.visitors || payload?.sessions);
  }

  async function loadLiveVisitors({ showLoading = true, at = null } = {}) {
    if (!el.liveVisitorsChart) return null;
    if (showLoading) setLiveStatus("Loading live visitors…");
    const params = new URLSearchParams({
      window: String(getLiveRangeMinutes()),
      limit: "200",
    });
    if (at) params.append("at", String(at));

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
      return payload || {};
    } catch (err) {
      setLiveStatus(
        `Live visitors error: ${err?.message || "Unable to load live data."}`,
        true,
      );
      return null;
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

  loadLiveHistoryFromStorage();

  return {
    loadLiveVisitors,
    shiftLiveRange,
    startLiveVisitors,
    stopLiveVisitors,
  };
}

export { createLiveAnalytics };

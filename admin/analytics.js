import { el } from './dom.js';
import { createLiveAnalytics } from './analytics/live.js';
import { createReaderAnalytics } from './analytics/reader.js';
import { createReadsOverTimeAnalytics } from './analytics/reads-over-time.js';
import { createTrafficAnalytics } from './analytics/traffic.js';
import { createVisitorHistoryAnalytics } from './analytics/visitor-history.js';

function createAnalytics({ hideAllSections, setActiveNav }) {
  const visitorHistory = createVisitorHistoryAnalytics();
  const readsOverTime = createReadsOverTimeAnalytics();
  const live = createLiveAnalytics();
  const traffic = createTrafficAnalytics();
  const reader = createReaderAnalytics();

  function renderReaderAnalyticsView() {
    reader.renderReaderAnalyticsView();
  }

  function loadAnalyticsSummary(options = {}) {
    return traffic.loadAnalyticsSummary(options);
  }

  function loadAnalyticsPages(options = {}) {
    return traffic.loadAnalyticsPages(options);
  }

  function loadAnalyticsVisitors(options = {}) {
    return traffic.loadAnalyticsVisitors(options);
  }

  function loadVisitorHistory(options = {}) {
    return visitorHistory.loadVisitorHistory(options);
  }

  function loadReaderAnalytics(options = {}) {
    return reader.loadReaderAnalytics(options).then((payload) => {
      readsOverTime.setReaderPayload(reader.getLastReaderPayload());
      return payload;
    });
  }

  function loadReadsOverTime(options = {}) {
    return readsOverTime.loadReadsOverTime(options);
  }

  function loadLiveVisitors(options = {}) {
    return live.loadLiveVisitors(options);
  }

  function refreshAnalytics({ showLoading = true } = {}) {
    loadAnalyticsSummary({ showLoading });
    loadAnalyticsPages({ showLoading });
    loadAnalyticsVisitors({ showLoading });
    loadVisitorHistory({ showLoading });

    const readerPromise = loadReaderAnalytics({ showLoading });
    const digestPromise = reader.fetchWeeklyDigest();

    Promise.all([readerPromise, digestPromise]).then(() => {
      reader.renderHealthIndicator();
      reader.updateSummaryTrends();
    });

    loadReadsOverTime({ showLoading });
  }

  function showAnalyticsSection() {
    hideAllSections();
    if (el.analyticsSection) {
      el.analyticsSection.style.display = 'block';
      el.analyticsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveNav(el.btnAnalytics);
    refreshAnalytics({ showLoading: true });
  }

  readsOverTime.initReadsOverTimeControls();
  visitorHistory.initVisitorHistoryControls();
  reader.initReaderTabs();

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
    startLiveVisitors: live.startLiveVisitors,
    stopLiveVisitors: live.stopLiveVisitors,
    shiftLiveRange: live.shiftLiveRange,
  };
}

export { createAnalytics };

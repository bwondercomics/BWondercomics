/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  flushAdminUi,
  jsonResponse,
  mountAdminDom,
  stubAdminGlobals,
} from "./helpers/admin-fixture.js";

function stubCanvas(vi) {
  const gradient = { addColorStop: vi.fn() };
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
  };

  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => ctx),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: vi.fn(() => ({
      width: 640,
      height: 180,
      left: 0,
      top: 0,
      right: 640,
      bottom: 180,
    })),
  });
}

function buildFetchStub(vi) {
  return vi.fn(async (url) => {
    const value = String(url);

    if (value === "/api/session") {
      return jsonResponse({ user: null });
    }
    if (value.startsWith("/api/admin/analytics/summary")) {
      return jsonResponse({
        websiteId: "site-1",
        generatedAt: "2026-03-30T08:00:00Z",
        ranges: {
          last24h: { pageviews: 14, visitors: 5 },
          last7d: { pageviews: 63, visitors: 22 },
        },
      });
    }
    if (value.startsWith("/api/admin/analytics/pages?")) {
      return jsonResponse({
        generatedAt: "2026-03-30T08:00:00Z",
        pages: [{ path: "/", views: 40, visitors: 18 }],
      });
    }
    if (value.startsWith("/api/admin/analytics/visitors?")) {
      return jsonResponse({
        generatedAt: "2026-03-30T08:00:00Z",
        range: value.includes("range=30d") ? "30d" : "7d",
        landingPages: [
          {
            name: "/launch-campaign",
            visitors: 18,
            visits: 24,
            pageviews: 41,
            bounces: 6,
            totaltime: 720000,
          },
        ],
        referrers: [
          {
            name: "google.com",
            visitors: 12,
            visits: 15,
            pageviews: 20,
            bounces: 4,
            totaltime: 420000,
          },
        ],
        countries: [
          {
            name: "US",
            visitors: 11,
            visits: 14,
            pageviews: 19,
            bounces: 3,
            totaltime: 360000,
          },
        ],
        browsers: [
          {
            name: "Chrome",
            visitors: 13,
            visits: 16,
            pageviews: 23,
            bounces: 5,
            totaltime: 540000,
          },
        ],
        devices: [
          {
            name: "Mobile",
            visitors: 10,
            visits: 12,
            pageviews: 17,
            bounces: 4,
            totaltime: 300000,
          },
        ],
        events: [{ name: "cta-click", count: 7 }],
      });
    }
    if (value.startsWith("/api/admin/analytics/reader?")) {
      return jsonResponse({
        generatedAt: "2026-03-30T08:00:00Z",
        entryReadsTotal: 18,
        entryStartsTotal: 3,
        entryFinishesTotal: 2,
        finishRate: 2 / 3,
        uniqueVisitors: 7,
        entryViews: [
          {
            label: "Issue 10",
            value: "10",
            entryKey: "battle-bros:10",
            displayNumber: 10,
            count: 18,
            seriesId: "battle-bros",
            seriesTitle: "Battle Bros",
            delta: 2,
            deltaPct: 0.125,
          },
          {
            label: "Issue 10",
            value: "10",
            entryKey: "space-racoons:10",
            displayNumber: 10,
            count: 9,
            seriesId: "space-racoons",
            seriesTitle: "Space Racoons",
            delta: 1,
            deltaPct: 0.1,
          },
        ],
        entryRates: [
          {
            label: "Issue 10",
            value: "10",
            entryKey: "battle-bros:10",
            displayNumber: 10,
            count: 2 / 3,
            pageViews: 18,
            starts: 3,
            finishes: 2,
            completionRate: 2 / 3,
            seriesId: "battle-bros",
            seriesTitle: "Battle Bros",
          },
          {
            label: "Issue 10",
            value: "10",
            entryKey: "space-racoons:10",
            displayNumber: 10,
            count: 0.5,
            pageViews: 9,
            starts: 2,
            finishes: 1,
            completionRate: 0.5,
            seriesId: "space-racoons",
            seriesTitle: "Space Racoons",
          },
        ],
        seriesViews: [
          {
            label: "Battle Bros",
            value: "battle-bros",
            seriesId: "battle-bros",
            seriesTitle: "Battle Bros",
            count: 18,
            delta: 2,
            deltaPct: 0.125,
          },
        ],
        seriesRates: [
          {
            label: "Battle Bros",
            value: "battle-bros",
            seriesId: "battle-bros",
            seriesTitle: "Battle Bros",
            count: 2 / 3,
            pageViews: 18,
            starts: 3,
            finishes: 2,
            completionRate: 2 / 3,
          },
        ],
      });
    }
    if (value.startsWith("/api/admin/analytics/weekly-digest")) {
      return jsonResponse({
        thisWeek: {
          reads: 18,
          starts: 3,
          finishes: 2,
          completionRate: 2 / 3,
          uniqueVisitors: 7,
        },
        lastWeek: {
          reads: 12,
          starts: 4,
          finishes: 2,
          completionRate: 0.5,
          uniqueVisitors: 6,
        },
        changes: {
          reads: { value: 6, percent: 0.5 },
          starts: { value: -1, percent: -0.25 },
          finishes: { value: 0, percent: 0 },
          completionRate: { value: 1 / 6, percent: 1 / 3 },
          uniqueVisitors: { value: 1, percent: 0.1667 },
        },
      });
    }
    if (value.startsWith("/api/admin/analytics/visitor-history?")) {
      return jsonResponse({
        generatedAt: "2026-03-30T08:00:00Z",
        range: value.includes("range=30d") ? "30d" : "7d",
        totalVisitors: 2,
        returned: 2,
        visitors: [
          {
            visitorKey: "visitor-a",
            firstSeen: "2026-03-24T12:00:00Z",
            lastSeen: "2026-03-25T14:30:00Z",
            landingPage: "/landing",
            lastPath: "/reader/issue-10/2",
            referrer: "google.com",
            country: "US",
            browser: "Chrome",
            device: "Mobile",
            pagesRead: 18,
            issuesStarted: 1,
            issuesFinished: 1,
            issues: [
              {
                seriesId: "battle-bros",
                seriesTitle: "Battle Bros",
                entryDisplayNumber: 10,
                entryTitle: "Issue 10",
                pagesRead: 18,
                maxPageReached: 6,
                totalPages: 6,
                finished: true,
              },
            ],
          },
          {
            visitorKey: "guest-omega",
            firstSeen: "2026-03-24T08:00:00Z",
            lastSeen: "2026-03-24T09:15:00Z",
            landingPage: "/campaign",
            lastPath: "/reader/issue-12/3",
            referrer: "newsletter",
            country: "CA",
            browser: "Safari",
            device: "Tablet",
            pagesRead: 9,
            issuesStarted: 2,
            issuesFinished: 0,
            issues: [
              {
                seriesId: "battle-bros",
                seriesTitle: "Battle Bros",
                entryDisplayNumber: 12,
                entryTitle: "Issue 12",
                pagesRead: 9,
                maxPageReached: 3,
                totalPages: 6,
                finished: false,
              },
            ],
          },
        ],
      });
    }
    if (value.startsWith("/api/admin/analytics/reads-over-time")) {
      if (value.includes("entry_key=battle-bros%3A10")) {
        return jsonResponse({
          series: [{ date: "2026-03-24", count: 6, uniqueVisitors: 2 }],
          totals: { reads: 6, uniqueVisitors: 2 },
          entryKey: "battle-bros:10",
        });
      }
      return jsonResponse({
        series: [
          { date: "2026-03-24", count: 4, uniqueVisitors: 3 },
          { date: "2026-03-25", count: 14, uniqueVisitors: 5 },
        ],
        totals: { reads: 18, uniqueVisitors: 7 },
      });
    }
    if (value.startsWith("/api/admin/analytics/live?")) {
      return jsonResponse({
        generatedAt: "2026-03-30T08:00:00Z",
        activeCount: value.includes("window=60") ? 5 : 3,
        total: value.includes("window=60") ? 5 : 3,
        visitors: [
          {
            lastSeen: "2026-03-30T07:59:00Z",
            durationSeconds: 420,
            ipAddress: "127.0.0.1",
            origin: "Direct",
            hitCount: 2,
            entriesRead: ["Issue 10"],
            userDisplayName: "Guest",
            userEmail: "",
          },
        ],
        sessions: [
          {
            lastSeen: "2026-03-30T07:59:00Z",
            durationSeconds: 420,
            ipAddress: "127.0.0.1",
            origin: "Direct",
            hitCount: 2,
            entriesRead: ["Issue 10"],
            userDisplayName: "Guest",
            userEmail: "",
          },
        ],
      });
    }
    if (value.startsWith("/api/admin/analytics/reader-series")) {
      if (value.includes("metric=completion_rate")) {
        return jsonResponse({
          metric: "completion_rate",
          series: [
            {
              start: "2026-03-24T00:00:00Z",
              end: "2026-03-25T00:00:00Z",
              starts: 3,
              finishes: 2,
              completionRate: 2 / 3,
            },
          ],
        });
      }
      return jsonResponse({
        metric: "page_views",
        series: [
          {
            start: "2026-03-24T00:00:00Z",
            end: "2026-03-25T00:00:00Z",
            count: 18,
          },
        ],
      });
    }

    return jsonResponse({});
  });
}

describe("admin analytics", () => {
  beforeEach(() => {
    vi.resetModules();
    mountAdminDom();
    stubAdminGlobals(vi);
    stubCanvas(vi);
    localStorage.clear();
  });

  it("removes the stop panel and health stat row from the analytics markup", () => {
    expect(document.getElementById("analyticsEntryStops")).toBeNull();
    expect(document.getElementById("healthReads")).toBeNull();
    expect(document.getElementById("statUniqueVisitors")).not.toBeNull();
    expect(document.getElementById("analyticsLandingPagesList")).not.toBeNull();
    expect(document.getElementById("analyticsVisitorHistoryList")).not.toBeNull();
    expect(document.getElementById("analyticsVisitorHistorySearch")).not.toBeNull();
    expect(document.getElementById("analyticsVisitorHistoryDetail")).not.toBeNull();
  });

  it("keeps the analytics facade manager surface stable", async () => {
    const { createAnalytics } = await import("../admin/analytics.js");
    const manager = createAnalytics({
      hideAllSections: vi.fn(),
      setActiveNav: vi.fn(),
    });

    expect(Object.keys(manager).sort()).toEqual(
      [
        "loadAnalyticsPages",
        "loadAnalyticsSummary",
        "loadAnalyticsVisitors",
        "loadLiveVisitors",
        "loadReaderAnalytics",
        "loadReadsOverTime",
        "loadVisitorHistory",
        "refreshAnalytics",
        "renderReaderAnalyticsView",
        "shiftLiveRange",
        "showAnalyticsSection",
        "startLiveVisitors",
        "stopLiveVisitors",
      ].sort(),
    );
  });

  it("renders pages-read summaries, ratio cards, and visitor history", async () => {
    vi.stubGlobal("fetch", buildFetchStub(vi));

    const { createAnalytics } = await import("../admin/analytics.js");
    const manager = createAnalytics({
      hideAllSections: vi.fn(),
      setActiveNav: vi.fn(),
    });

    manager.refreshAnalytics({ showLoading: false });
    await flushAdminUi(5);

    expect(document.getElementById("analyticsPagesList")?.textContent).toContain("/");
    expect(document.getElementById("analyticsPagesList")?.textContent).toContain("40");
    expect(document.getElementById("statEntryReads")?.textContent).toBe("18");
    expect(document.getElementById("statEntryStarts")?.textContent).toBe("3");
    expect(document.getElementById("statUniqueVisitors")?.textContent).toBe("7");
    expect(document.getElementById("analyticsInsight")?.textContent).toContain(
      "18 pages read",
    );
    expect(document.getElementById("analyticsInsight")?.textContent).toContain(
      "67% start-to-finish rate",
    );
    expect(document.getElementById("analyticsEntryRates")?.textContent).toContain("67%");
    expect(document.getElementById("analyticsEntryRates")?.textContent).toContain("3 starts");
    expect(document.getElementById("analyticsLandingPagesList")?.textContent).toContain(
      "/launch-campaign",
    );
    expect(document.getElementById("analyticsReferrersList")?.textContent).toContain(
      "google.com",
    );
    expect(document.getElementById("analyticsBrowsersList")?.textContent).toContain(
      "Chrome",
    );
    expect(document.getElementById("analyticsDevicesList")?.textContent).toContain(
      "Mobile",
    );
    expect(document.getElementById("analyticsEventsList")?.textContent).toContain(
      "cta-click",
    );
    expect(document.getElementById("analyticsVisitorHistoryList")?.textContent).toContain(
      "visitor-a",
    );
    expect(document.getElementById("analyticsVisitorHistoryList")?.textContent).toContain(
      "guest-omega",
    );
    expect(document.getElementById("analyticsVisitorHistoryDetail")?.textContent).toContain(
      "/landing",
    );
    expect(document.getElementById("analyticsVisitorHistoryDetail")?.textContent).toContain(
      "Issue 10",
    );
    expect(document.getElementById("readsOverTimeTotals")?.textContent).toContain(
      "pages read",
    );
  });

  it("reloads page, visitor, and visitor-history panels when the sitewide range changes", async () => {
    const fetchMock = buildFetchStub(vi);
    vi.stubGlobal("fetch", fetchMock);

    await import("../admin/app.js");
    await flushAdminUi(2);

    const range = document.getElementById("analyticsPagesRange");
    range.value = "30d";
    range.dispatchEvent(new Event("change"));
    await flushAdminUi(3);

    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/api/admin/analytics/pages?range=30d"),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/api/admin/analytics/visitors?range=30d"),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/api/admin/analytics/visitor-history?range=30d"),
      ),
    ).toBe(true);
  });

  it("requests completion-rate drilldowns for the ratio cards", async () => {
    const fetchMock = buildFetchStub(vi);
    vi.stubGlobal("fetch", fetchMock);

    const { createAnalytics } = await import("../admin/analytics.js");
    const manager = createAnalytics({
      hideAllSections: vi.fn(),
      setActiveNav: vi.fn(),
    });

    manager.refreshAnalytics({ showLoading: false });
    await flushAdminUi(5);

    const rateItem = document.querySelector("#analyticsEntryRates .analytics-reader-item");
    rateItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushAdminUi(3);

    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/api/admin/analytics/reader-series?")
        && String(url).includes("metric=completion_rate")
        && String(url).includes("entry_key=battle-bros%3A10"),
      ),
    ).toBe(true);
  });

  it("reloads reads-over-time when chart controls change", async () => {
    const fetchMock = buildFetchStub(vi);
    vi.stubGlobal("fetch", fetchMock);

    const { createAnalytics } = await import("../admin/analytics.js");
    const manager = createAnalytics({
      hideAllSections: vi.fn(),
      setActiveNav: vi.fn(),
    });

    manager.refreshAnalytics({ showLoading: false });
    await flushAdminUi(5);

    const mode = document.getElementById("readsOverTimeMode");
    mode.value = "entry";
    mode.dispatchEvent(new Event("change"));
    await flushAdminUi(3);

    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/api/admin/analytics/reads-over-time?range=7d&entry_key=battle-bros%3A10"),
      ),
    ).toBe(true);
    expect(document.getElementById("readsOverTimeTotals")?.textContent).toContain(
      "6 pages read",
    );
    expect(document.getElementById("readsOverTimeEntryShell")?.classList.contains("is-hidden")).toBe(false);
  });

  it("loads live visitors and reloads when the live range shifts", async () => {
    const fetchMock = buildFetchStub(vi);
    vi.stubGlobal("fetch", fetchMock);

    const { createAnalytics } = await import("../admin/analytics.js");
    const manager = createAnalytics({
      hideAllSections: vi.fn(),
      setActiveNav: vi.fn(),
    });

    manager.startLiveVisitors();
    await flushAdminUi(3);

    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/api/admin/analytics/live?window=30"),
      ),
    ).toBe(true);
    expect(document.getElementById("liveVisitorsCount")?.textContent).toBe("3");

    manager.shiftLiveRange(1);
    await flushAdminUi(3);

    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/api/admin/analytics/live?window=60"),
      ),
    ).toBe(true);
    expect(document.getElementById("liveVisitorsCount")?.textContent).toBe("5");

    manager.stopLiveVisitors();
  });

  it("filters and selects visitor history rows without expanding the whole list", async () => {
    vi.stubGlobal("fetch", buildFetchStub(vi));

    const { createAnalytics } = await import("../admin/analytics.js");
    const manager = createAnalytics({
      hideAllSections: vi.fn(),
      setActiveNav: vi.fn(),
    });

    manager.refreshAnalytics({ showLoading: false });
    await flushAdminUi(5);

    const search = document.getElementById("analyticsVisitorHistorySearch");
    search.value = "omega";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await flushAdminUi(2);

    expect(document.getElementById("analyticsVisitorHistoryList")?.textContent).toContain(
      "guest-omega",
    );
    expect(document.getElementById("analyticsVisitorHistoryList")?.textContent).not.toContain(
      "visitor-a",
    );

    const listBodyBefore = document.querySelector(".analytics-visitor-list-body");
    listBodyBefore.scrollTop = 123;

    const row = document.querySelector(".analytics-visitor-list-row");
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushAdminUi(2);

    const listBodyAfter = document.querySelector(".analytics-visitor-list-body");
    expect(listBodyAfter.scrollTop).toBe(123);
    expect(document.getElementById("analyticsVisitorHistoryDetail")?.textContent).toContain(
      "/campaign",
    );
    expect(document.getElementById("analyticsVisitorHistoryDetail")?.textContent).toContain(
      "Issue 12",
    );
  });

  it("renders visitor history activity chips with readable units", async () => {
    vi.stubGlobal("fetch", buildFetchStub(vi));

    const { createAnalytics } = await import("../admin/analytics.js");
    const manager = createAnalytics({
      hideAllSections: vi.fn(),
      setActiveNav: vi.fn(),
    });

    manager.refreshAnalytics({ showLoading: false });
    await flushAdminUi(5);

    const visitorListText = document.getElementById("analyticsVisitorHistoryList")?.textContent || "";
    expect(visitorListText).toContain("18 pages");
    expect(visitorListText).toContain("1 started");
    expect(visitorListText).toContain("1 finished");
    expect(visitorListText).not.toContain("18p");
    expect(visitorListText).not.toContain("1i");
    expect(visitorListText).not.toContain("1f");
  });
});

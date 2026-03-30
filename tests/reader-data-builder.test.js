import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyBuilderPageToDOM,
  loadBuilderPage,
  extractSubtitlesFromBuilderPage,
  loadPageConfigWithFallback,
} from "../reader/data.js";
import { buildContractFixture, getContractFixture } from "./helpers/contracts.js";
import { flushReaderUi, mountReaderDom, stubReaderGlobals } from "./helpers/reader-fixture.js";

function jsonResponse(body, options = {}) {
  const { ok = true, status = 200, statusText = "OK" } = options;
  return {
    ok,
    status,
    statusText,
    json: async () => body,
  };
}

describe("reader builder presentation loading", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mountReaderDom();
    stubReaderGlobals(vi);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("prefers a published builder page and extracts header subtitles", async () => {
    const builderPage = getContractFixture("builderPage");
    const setSubtitles = vi.fn();
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/pages/battle-bros/reader") {
        return jsonResponse({ page: builderPage });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadPageConfigWithFallback(setSubtitles, "battle-bros");

    expect(result).toEqual({ source: "builder", page: builderPage });
    expect(setSubtitles).toHaveBeenCalledWith(["Hero Time", "Lunch Break Justice"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(extractSubtitlesFromBuilderPage(builderPage)).toEqual(["Hero Time", "Lunch Break Justice"]);
    expect(console.log).not.toHaveBeenCalled();
  });

  it("loads a published custom builder page by slug without falling back to legacy config", async () => {
    const aboutPage = buildContractFixture("builderPageDraft", {
      isPublished: true,
    });
    const setSubtitles = vi.fn();
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/pages/battle-bros/about") {
        return jsonResponse({ page: aboutPage });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadPageConfigWithFallback(setSubtitles, "battle-bros", { pageSlug: "about" });

    expect(result).toEqual({ source: "builder", page: aboutPage });
    expect(setSubtitles).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loads unpublished draft pages through the admin slug endpoint", async () => {
    const draftPage = getContractFixture("builderPageDraft");
    const setSubtitles = vi.fn();
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/admin/pages/by-slug/battle-bros/about") {
        return jsonResponse({ page: draftPage });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadPageConfigWithFallback(setSubtitles, "battle-bros", {
      pageSlug: "about",
      draft: true,
    });

    expect(result).toEqual({ source: "builder", page: draftPage });
    expect(setSubtitles).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the legacy page-config contract when no builder page exists", async () => {
    const setSubtitles = vi.fn();
    const pageConfig = getContractFixture("pageConfig");
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/pages/battle-bros/reader") {
        return jsonResponse({}, { ok: false, status: 404, statusText: "Not Found" });
      }
      if (url === "page-config.json") {
        return jsonResponse(pageConfig);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadPageConfigWithFallback(setSubtitles, "battle-bros");

    expect(result).toEqual({ source: "legacy" });
    expect(setSubtitles).toHaveBeenCalledWith(["Hero Time", "Lunch Break Justice"]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/pages/battle-bros/reader",
      "page-config.json",
    ]);
  });

  it("does not use legacy fallback for non-reader page slugs", async () => {
    const setSubtitles = vi.fn();
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/pages/battle-bros/about") {
        return jsonResponse({}, { ok: false, status: 404, statusText: "Not Found" });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadPageConfigWithFallback(setSubtitles, "battle-bros", { pageSlug: "about" });

    expect(result).toEqual({ source: "none" });
    expect(setSubtitles).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("honors pb-no-fallback when the builder page is missing", async () => {
    localStorage.setItem("pb-no-fallback", "1");
    const setSubtitles = vi.fn();
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/pages/battle-bros/reader") {
        return jsonResponse({}, { ok: false, status: 404, statusText: "Not Found" });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadPageConfigWithFallback(setSubtitles, "battle-bros");

    expect(result).toEqual({ source: "none" });
    expect(setSubtitles).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when a draft page request is denied", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/admin/pages/by-slug/battle-bros/about") {
        return jsonResponse({}, { ok: false, status: 403, statusText: "Forbidden" });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadBuilderPage("about", "battle-bros", { draft: true });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("applies the builder page contract to the live reader DOM", async () => {
    const builderPage = getContractFixture("builderPage");
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/posts/latest") {
        return jsonResponse({ post: getContractFixture("latestPost") });
      }
      if (url === "/api/posts") {
        return jsonResponse({ posts: getContractFixture("feedPosts") });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    applyBuilderPageToDOM(builderPage);
    await flushReaderUi(4);

    expect(document.querySelector(".topbar .title h1")?.textContent).toBe("Battle Bros");
    expect(document.getElementById("subtitle")?.textContent).toBe("Hero Time");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#ffcc00");
    expect(document.documentElement.style.getPropertyValue("--bg-panel")).toBe("#151a33");

    const leftPanel = document.getElementById("leftPanel");
    const rightPanel = document.getElementById("rightPanel");
    const leftBuilder = leftPanel?.querySelector(".panel-builder--left");
    const rightBuilder = rightPanel?.querySelector(".panel-builder--right");

    expect(leftPanel?.style.getPropertyValue("--panel-bg-image")).toContain("/assets/media/panels/left-grid.png");
    expect(rightPanel?.style.getPropertyValue("--panel-bg-image")).toContain("/assets/media/panels/right-burst.png");
    expect(leftBuilder?.style.getPropertyValue("--pb-panel-gap")).toBe("18px");
    expect(rightBuilder?.style.getPropertyValue("--pb-panel-gap")).toBe("26px");
    expect(leftBuilder?.querySelector(".pb-module--promo")).not.toBeNull();
    expect(rightBuilder?.querySelector(".pb-module--feed")).not.toBeNull();
    expect(rightBuilder?.querySelector(".latest-name")?.textContent).toBe("Issue 10 Released");
  });

  it("uses the current empty-panel behavior and hideEmptyText contract", () => {
    const basePage = getContractFixture("builderPage");
    const emptyPage = buildContractFixture("builderPage", {
      sections: [basePage.sections[0]],
      meta: {
        panelBackgrounds: {
          right: {
            hideEmptyText: true,
          },
        },
      },
    });

    applyBuilderPageToDOM(emptyPage);

    const leftBuilder = document.getElementById("leftPanel")?.querySelector(".panel-builder--left");
    const rightBuilder = document.getElementById("rightPanel")?.querySelector(".panel-builder--right");

    expect(leftBuilder?.textContent).toContain("No panel modules.");
    expect(rightBuilder?.textContent?.trim() || "").toBe("");
  });
});

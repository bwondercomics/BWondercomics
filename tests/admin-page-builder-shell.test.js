import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildContractFixture, getContractFixture } from "./helpers/contracts.js";
import { flushAdminUi, mountAdminDom, stubAdminGlobals } from "./helpers/admin-fixture.js";

async function setupPageBuilder({
  fetchPagesResults = [],
  fetchPageResult = null,
  createPageResult = null,
  deletePageResult = true,
  addModuleResult = null,
  updatePageResult = null,
} = {}) {
  vi.resetModules();
  mountAdminDom();
  stubAdminGlobals(vi);
  vi.spyOn(console, "error").mockImplementation(() => {});

  const fetchPages = vi.fn();
  fetchPagesResults.forEach((result) => fetchPages.mockResolvedValueOnce(result));
  if (!fetchPages.mock.calls.length && fetchPagesResults.length === 0) {
    fetchPages.mockResolvedValue([]);
  }
  const fetchPage = vi.fn(async () => fetchPageResult);
  const createPage = vi.fn(async () => createPageResult);
  const deletePage = vi.fn(async () => deletePageResult);
  const updatePage = vi.fn(async (_pageId, data) => updatePageResult || {
    ...(fetchPageResult || createPageResult || {}),
    ...data,
  });
  const addModule = vi.fn(async (_sectionId, moduleType, columnIndex, config) => ({
    id: "new-module-id",
    moduleType,
    columnIndex,
    sortIndex: 99,
    config,
    ...(addModuleResult || {}),
  }));

  vi.doMock("../admin/page-builder/data.js", () => ({
    fetchPages,
    fetchPage,
    createPage,
    deletePage,
    updatePage,
    fetchAssets: vi.fn(async () => []),
    uploadAsset: vi.fn(async () => ({})),
    addSection: vi.fn(async () => null),
    updateSection: vi.fn(async () => null),
    deleteSection: vi.fn(async () => false),
    addModule,
    updateModule: vi.fn(async () => null),
    deleteModule: vi.fn(async () => false),
  }));
  vi.doMock("../admin/page-builder/theme-editor.js", () => ({
    renderThemeEditorContent: vi.fn(() => "<div>Theme Editor</div>"),
    bindThemeEditorEvents: vi.fn(),
  }));
  vi.doMock("../admin/page-builder/module-editor.js", () => ({
    renderModuleEditorContent: vi.fn(() => "<div>Module Editor</div>"),
    bindModuleEditorEvents: vi.fn(),
  }));
  vi.doMock("../admin/image-picker.js", () => ({
    openImagePicker: vi.fn(),
  }));
  vi.doMock("../admin/utils.js", () => ({
    readFileAsBase64: vi.fn(async () => "ZmFrZQ=="),
  }));

  const { createPageBuilder } = await import("../admin/page-builder.js");
  const hideAllSections = vi.fn();
  const setActiveNav = vi.fn();
  const manager = createPageBuilder({
    sanitizeSeriesId: (value) => String(value || "").toLowerCase().trim(),
    getActiveSeriesId: () => "battle-bros",
    hideAllSections,
    setActiveNav,
  });
  manager.initPageBuilder();

  return {
    manager,
    mocks: {
      addModule,
      createPage,
      deletePage,
      fetchPage,
      fetchPages,
      updatePage,
      hideAllSections,
      setActiveNav,
    },
  };
}

describe("admin page-builder shell", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("renders the empty state and adds a new page through the current prompts flow", async () => {
    const page = buildContractFixture("builderPage", {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee99",
      title: "Reader Builder",
    });
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[], [page]],
      createPageResult: page,
    });

    globalThis.prompt
      .mockReturnValueOnce("reader")
      .mockReturnValueOnce("Reader Builder");

    await manager.showPageBuilderSection();
    expect(document.getElementById("pbPageList")?.textContent).toContain("No pages yet");

    document.getElementById("pbAddPage")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.createPage).toHaveBeenCalledWith("battle-bros", "reader", "Reader Builder");
    expect(document.querySelector(".pb-page-item.active .pb-page-item-title")?.textContent).toBe("Reader Builder");
    expect(document.getElementById("pbPageTitle")?.textContent).toContain("Reader Builder");
  });

  it("supports page selection, page deletion, and default module config wiring", async () => {
    const firstPage = buildContractFixture("builderPageDraft", {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee31",
      title: "About",
    });
    const selectedPage = getContractFixture("builderPage");
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[firstPage, selectedPage], [selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();

    const pageItems = document.querySelectorAll(".pb-page-item");
    pageItems[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.fetchPage).toHaveBeenCalledWith(selectedPage.id);
    expect(document.getElementById("pbCanvas")?.textContent).toContain("feed");

    pageItems[0].querySelector(".pb-page-action.delete")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await flushAdminUi(3);

    expect(mocks.deletePage).toHaveBeenCalledWith(firstPage.id);
    expect(document.querySelectorAll(".pb-page-item")).toHaveLength(1);

    const dropZone = document.querySelector(".pb-drop-zone");
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.assign(dropEvent, {
      dataTransfer: {
        getData: () => "feed",
      },
    });
    dropZone?.dispatchEvent(dropEvent);
    await flushAdminUi(3);

    expect(mocks.addModule).toHaveBeenCalledWith(
      selectedPage.sections[0].id,
      "feed",
      0,
      expect.objectContaining({
        limit: 5,
        showMediaButton: true,
        style: expect.objectContaining({
          headingBgColor: "#ffed00",
          itemBorderColor: "#00d9ff",
        }),
      }),
    );
  });

  it("renders page status details and supports explicit draft/publish actions", async () => {
    const selectedPage = getContractFixture("builderPage");
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();

    document.querySelector(".pb-page-item")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushAdminUi(3);

    expect(document.getElementById("pbPageTitle")?.textContent).toContain("Page ID: reader");
    expect(document.getElementById("pbPageTitle")?.textContent).toContain("Published");
    expect(document.getElementById("pbPageTitle")?.textContent).toContain("Homepage");

    const link = document.querySelector(".pb-open-reader-link");
    expect(link?.getAttribute("href")).toContain("../index.html?series=battle-bros&page=reader");
    expect(link?.getAttribute("href")).not.toContain("draft=1");

    document.getElementById("pbSaveDraft")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.updatePage).toHaveBeenCalledWith(
      selectedPage.id,
      expect.objectContaining({ isPublished: false }),
    );
    expect(document.getElementById("pbPageTitle")?.textContent).toContain("Draft");
    expect(document.querySelector(".pb-open-reader-link")?.getAttribute("href")).toContain("draft=1");

    document.getElementById("pbPublish")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.updatePage).toHaveBeenCalledWith(
      selectedPage.id,
      expect.objectContaining({ isPublished: true }),
    );
    expect(document.getElementById("pbPageTitle")?.textContent).toContain("Published");
    expect(document.querySelector(".pb-open-reader-link")?.getAttribute("href")).not.toContain("draft=1");
  });
});

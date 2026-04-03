import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildContractFixture, getContractFixture } from "./helpers/contracts.js";
import { flushAdminUi, mountAdminDom, stubAdminGlobals } from "./helpers/admin-fixture.js";

function setViewportWidth(width) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

async function setupPageBuilder({
  fetchPagesResults = [],
  fetchPageResult = null,
  createPageResult = null,
  deletePageResult = true,
  addModuleResult = null,
  updatePageResult = null,
  useRealEditors = false,
  viewportWidth = 1600,
} = {}) {
  vi.resetModules();
  mountAdminDom();
  stubAdminGlobals(vi);
  vi.spyOn(console, "error").mockImplementation(() => {});
  window.localStorage.clear();
  setViewportWidth(viewportWidth);

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
  const addSection = vi.fn(async () => ({
    id: "new-section-id",
    layout: "1",
    modules: [],
    settings: {},
  }));
  const reorderSections = vi.fn(async () => true);
  const addModule = vi.fn(async (_sectionId, moduleType, columnIndex, config, _sortIndex) => ({
    id: "new-module-id",
    moduleType,
    columnIndex,
    sortIndex: 99,
    config,
    ...(addModuleResult || {}),
  }));
  const moveModule = vi.fn(async (_moduleId, _sectionId, columnIndex, sortIndex) => ({
    id: "moved-module-id",
    columnIndex,
    sortIndex,
    config: {},
  }));
  const reorderModules = vi.fn(async () => true);

  vi.doMock("../admin/page-builder/data.js", () => ({
    fetchPages,
    fetchPage,
    createPage,
    deletePage,
    updatePage,
    fetchAssets: vi.fn(async () => []),
    uploadAsset: vi.fn(async () => ({})),
    addSection,
    updateSection: vi.fn(async () => null),
    deleteSection: vi.fn(async () => false),
    reorderSections,
    addModule,
    updateModule: vi.fn(async () => null),
    moveModule,
    reorderModules,
    deleteModule: vi.fn(async () => false),
  }));
  if (useRealEditors) {
    vi.doUnmock("../admin/page-builder/theme-editor.js");
    vi.doUnmock("../admin/page-builder/module-editor.js");
  } else {
    vi.doMock("../admin/page-builder/theme-editor.js", () => ({
      renderThemeEditorContent: vi.fn(() => "<div>Theme Editor</div>"),
      bindThemeEditorEvents: vi.fn(),
    }));
    vi.doMock("../admin/page-builder/module-editor.js", () => ({
      renderModuleEditorContent: vi.fn(() => "<div>Module Editor</div>"),
      bindModuleEditorEvents: vi.fn(),
    }));
  }
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
      addSection,
      createPage,
      deletePage,
      fetchPage,
      fetchPages,
      moveModule,
      reorderModules,
      reorderSections,
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

  it("mounts the editor toggle beside the inspector rail and persists wide-screen mode changes", async () => {
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[]],
      viewportWidth: 1600,
    });

    await manager.showPageBuilderSection();

    const layout = document.querySelector(".page-builder-layout");
    const toggle = document.getElementById("pbToggleEditor");

    expect(toggle?.closest(".page-builder-editor")).not.toBeNull();
    expect(document.querySelector(".pb-canvas-header #pbToggleEditor")).toBeNull();
    expect(layout?.dataset.editorMode).toBe("docked");
    expect(layout?.style.getPropertyValue("--pb-editor-width")).toBe("520px");

    toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(layout?.dataset.editorMode).toBe("collapsed");
    expect(layout?.style.getPropertyValue("--pb-editor-width")).toBe("320px");
    expect(window.localStorage.getItem("pb-editor-mode")).toBe("collapsed");

    toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(layout?.dataset.editorMode).toBe("docked");
    expect(window.localStorage.getItem("pb-editor-mode")).toBe("docked");
  });

  it("routes nav-collapsed free space into the editor panel instead of the canvas", async () => {
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[]],
      viewportWidth: 1600,
    });

    await manager.showPageBuilderSection();

    const layout = document.querySelector(".page-builder-layout");
    const navToggle = document.getElementById("adminNavToggle");
    const dashboard = document.getElementById("adminDashboard");
    const editorToggle = document.getElementById("pbToggleEditor");

    expect(layout?.style.getPropertyValue("--pb-editor-width")).toBe("520px");

    dashboard?.classList.add("nav-collapsed");
    navToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushAdminUi(1);

    expect(layout?.style.getPropertyValue("--pb-editor-width")).toBe("620px");

    editorToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(layout?.style.getPropertyValue("--pb-editor-width")).toBe("420px");
  });

  it("lets the left rail collapse and sends that recovered width to the inspector", async () => {
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[]],
      viewportWidth: 1600,
    });

    await manager.showPageBuilderSection();

    const layout = document.querySelector(".page-builder-layout");
    const sidebarToggle = document.getElementById("pbToggleSidebar");
    const railLabel = document.getElementById("pbSidebarRailLabel");

    expect(layout?.dataset.sidebarMode).toBe("expanded");
    expect(layout?.style.getPropertyValue("--pb-sidebar-width")).toBe("200px");
    expect(layout?.style.getPropertyValue("--pb-editor-width")).toBe("520px");
    expect(railLabel?.textContent).toBe("Pages");

    sidebarToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(layout?.dataset.sidebarMode).toBe("collapsed");
    expect(layout?.style.getPropertyValue("--pb-sidebar-width")).toBe("72px");
    expect(layout?.style.getPropertyValue("--pb-editor-width")).toBe("648px");
    expect(window.localStorage.getItem("pb-sidebar-mode")).toBe("collapsed");
    expect(sidebarToggle?.getAttribute("aria-label")).toBe("Expand left panel");

    sidebarToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(layout?.dataset.sidebarMode).toBe("expanded");
    expect(layout?.style.getPropertyValue("--pb-sidebar-width")).toBe("200px");
    expect(layout?.style.getPropertyValue("--pb-editor-width")).toBe("520px");
    expect(window.localStorage.getItem("pb-sidebar-mode")).toBe("expanded");
  });

  it("switches the inspector to overlay mode on narrower desktop widths", async () => {
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[]],
      viewportWidth: 1280,
    });

    await manager.showPageBuilderSection();

    const layout = document.querySelector(".page-builder-layout");
    expect(layout?.dataset.editorMode).toBe("overlay");
    expect(layout?.dataset.viewportBand).toBe("medium");

    setViewportWidth(1600);
    window.dispatchEvent(new Event("resize"));

    expect(layout?.dataset.editorMode).toBe("docked");
    expect(layout?.dataset.viewportBand).toBe("wide");
  });

  it("blocks inspector tab switches until dirty theme edits are saved or discarded", async () => {
    const selectedPage = getContractFixture("builderPage");
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
      viewportWidth: 1600,
    });

    await manager.showPageBuilderSection();

    document.querySelector(".pb-page-item")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushAdminUi(3);

    document.querySelector('.pb-editor-tab[data-tab="theme"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushAdminUi(1);

    const primaryInput = document.querySelector('.pb-theme-color-text[data-key="primary"]');
    primaryInput.value = "#112233";
    primaryInput.dispatchEvent(new Event("input", { bubbles: true }));
    await flushAdminUi(1);

    document.querySelector('.pb-editor-tab[data-tab="modules"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushAdminUi(1);

    expect(document.querySelector('.pb-editor-tab.active[data-tab="theme"]')).not.toBeNull();
    expect(document.querySelector(".pb-editor-footer-status")?.textContent).toContain("unsaved");

    document.getElementById("pbDiscardTheme")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushAdminUi(1);
    document.querySelector('.pb-editor-tab[data-tab="modules"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushAdminUi(1);

    expect(document.querySelector('.pb-editor-tab.active[data-tab="modules"]')).not.toBeNull();
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

    document.querySelector('.pb-inline-insert-trigger')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushAdminUi(1);
    document.querySelector('[data-action="insert-module-type"][data-module-type="feed"]')?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
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
      null,
    );
    expect(mocks.reorderModules).toHaveBeenCalledWith(selectedPage.sections[0].id, 0, expect.any(Array));
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

    expect(document.getElementById("pbPageTitle")?.textContent).not.toContain("Page ID:");
    expect(document.getElementById("pbPageTitle")?.textContent).toContain("reader");
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

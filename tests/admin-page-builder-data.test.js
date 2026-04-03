import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addModule,
  addSection,
  createPage,
  deleteModule,
  deletePage,
  deleteSection,
  fetchPage,
  fetchPages,
  moveModule,
  reorderModules,
  reorderSections,
  updateModule,
  updatePage,
  updateSection,
} from "../admin/page-builder/data.js";
import { buildContractFixture, getContractFixture } from "./helpers/contracts.js";
import { jsonResponse, stubAdminGlobals } from "./helpers/admin-fixture.js";

describe("admin page-builder data layer", () => {
  beforeEach(() => {
    stubAdminGlobals(vi);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("round-trips page CRUD against the current admin contract", async () => {
    const page = getContractFixture("builderPage");
    const updatedPage = buildContractFixture("builderPage", {
      title: "Reader Updated",
      isPublished: false,
    });
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === "/api/admin/pages?series_id=battle-bros") {
        if (options.method === "POST") {
          return jsonResponse({ page });
        }
        return jsonResponse({ pages: [page] });
      }
      if (url === `/api/admin/pages/${page.id}`) {
        if (options.method === "PUT") {
          return jsonResponse({ page: updatedPage });
        }
        if (options.method === "DELETE") {
          return jsonResponse({}, { status: 204, statusText: "No Content" });
        }
        return jsonResponse({ page });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchPages("battle-bros")).toEqual([page]);
    expect(await fetchPage(page.id)).toEqual(page);
    expect(await createPage("battle-bros", "reader", "Reader")).toEqual(page);
    expect(await updatePage(page.id, { isPublished: false })).toEqual(updatedPage);
    expect(await deletePage(page.id)).toBe(true);

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/pages?series_id=battle-bros");
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/pages?series_id=battle-bros", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ slug: "reader", title: "Reader" }),
    }));
  });

  it("handles section and module endpoint wrappers plus page-create failures", async () => {
    const section = getContractFixture("builderPage").sections[0];
    const secondSection = getContractFixture("builderPage").sections[1];
    const module = getContractFixture("builderModules").feed;
    const updatedSection = { ...section, settings: { moduleGap: 18 } };
    const updatedModule = { ...module, config: { limit: 8 } };
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === "/api/admin/pages?series_id=battle-bros" && options.method === "POST") {
        return jsonResponse({ error: "Duplicate slug" }, { status: 400, statusText: "Bad Request" });
      }
      if (url === "/api/admin/pages/page-id/sections" && options.method === "POST") {
        return jsonResponse({ section });
      }
      if (url === `/api/admin/sections/${section.id}` && options.method === "PUT") {
        return jsonResponse({ section: updatedSection });
      }
      if (url === `/api/admin/sections/${section.id}` && options.method === "DELETE") {
        return jsonResponse({}, { status: 204, statusText: "No Content" });
      }
      if (url === `/api/admin/sections/${section.id}/modules` && options.method === "POST") {
        return jsonResponse({ module });
      }
      if (url === `/api/admin/modules/${module.id}` && options.method === "PUT") {
        return jsonResponse({ module: updatedModule });
      }
      if (url === `/api/admin/modules/${module.id}/move` && options.method === "POST") {
        return jsonResponse({ module: { ...module, columnIndex: 1, sortIndex: 0 } });
      }
      if (url === `/api/admin/sections/${section.id}/modules/reorder` && options.method === "POST") {
        return jsonResponse({}, { status: 204, statusText: "No Content" });
      }
      if (url === `/api/admin/modules/${module.id}` && options.method === "DELETE") {
        return jsonResponse({}, { status: 204, statusText: "No Content" });
      }
      if (url === "/api/admin/pages/page-id/sections/reorder" && options.method === "POST") {
        return jsonResponse({}, { status: 204, statusText: "No Content" });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await createPage("battle-bros", "reader", "Reader")).toBeNull();
    expect(globalThis.alert).toHaveBeenCalledWith("Duplicate slug");
    expect(await addSection("page-id", "row", "1-1")).toEqual(section);
    expect(await updateSection(section.id, { settings: { moduleGap: 18 } })).toEqual(updatedSection);
    expect(await deleteSection(section.id)).toBe(true);
    expect(await addModule(section.id, "feed", 1, module.config)).toEqual(module);
    expect(await addModule(section.id, "feed", 1, module.config, 2)).toEqual(module);
    expect(await updateModule(module.id, { config: { limit: 8 } })).toEqual(updatedModule);
    expect(await moveModule(module.id, secondSection.id, 1, 0)).toEqual(expect.objectContaining({
      columnIndex: 1,
      sortIndex: 0,
    }));
    expect(await reorderModules(section.id, 0, [module.id])).toBe(true);
    expect(await reorderSections("page-id", [secondSection.id, section.id])).toBe(true);
    expect(await deleteModule(module.id)).toBe(true);
  });
});

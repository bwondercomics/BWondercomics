/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountAdminDom, jsonResponse, stubAdminGlobals } from "./helpers/admin-fixture.js";

describe("admin entries api", () => {
  beforeEach(() => {
    vi.resetModules();
    mountAdminDom();
    stubAdminGlobals(vi);
    localStorage.clear();
  });

  it("creates an entry and renders it in the entry list", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === "/api/create-entry") {
        return jsonResponse({});
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const [{ createEntriesApi }, { state }, { el }] = await Promise.all([
      import("../admin/entries.js"),
      import("../admin/state.js"),
      import("../admin/dom.js"),
    ]);

    state.entries = {};
    state.entryFolders = {};
    state.entryMeta = {};
    state.entryLabels = [
      {
        id: "issues",
        singular: "Issue",
        plural: "Issues",
        slug: "issues",
        sortIndex: 0,
        isDefault: true,
      },
    ];
    state.activeEntryLabelId = "issues";
    state.currentPages = [];
    state.statusMessage = "";
    state.premiumOnly = false;
    state.loadedEntries = [];
    state.loadedEntryIds = [];

    const saveToServer = vi.fn(async () => true);
    const api = createEntriesApi({
      state,
      el,
      saveToServer,
      showSuccess: vi.fn(),
      showError: vi.fn(),
      getUnitLabels: () => ({ singular: "Issue", plural: "Issues" }),
      getDataFileUrl: () => "data.json",
      getSaveFilename: () => "admin/data.json",
      getChaptersRoot: () => "chapters",
      getStorageKey: () => "battlebros_admin_data",
      STORAGE_KEY: "battlebros_admin_data",
    });

    api.addNewEntry();
    document.getElementById("entryName").value = "Issue Alpha";
    document.getElementById("entryDisplayNumber").value = "7";
    document.getElementById("entryLabelSelect").value = "issues";

    await api.saveEntryEdit();

    expect(fetchMock).toHaveBeenCalledWith("/api/create-entry", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }));
    expect(saveToServer).toHaveBeenCalledWith("admin/data.json", expect.objectContaining({
      entries: { "Issue Alpha": [] },
      entryMeta: expect.objectContaining({
        "Issue Alpha": expect.objectContaining({
          displayNumber: 7,
          entryLabelId: "issues",
          entryLabelSingular: "Issue",
        }),
      }),
    }));
    expect(state.entries["Issue Alpha"]).toEqual([]);
    expect(document.getElementById("entryList").textContent).toContain("Issue 7 - Issue Alpha");
  });
});

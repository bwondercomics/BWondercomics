/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Minimal DOM fixture matching admin/dom.js IDs
const domTemplate = `
  <div id="loginScreen"></div>
  <form id="loginForm"></form>
  <div id="loginError"></div>
  <div id="adminDashboard"></div>
  <div id="chapterList"></div>
  <button id="btnAddChapter"></button>
  <input id="statusMessageInput" />
  <button id="btnSaveStatus"></button>
  <div id="statusMessageStatus"></div>
  <button id="btnLogout"></button>
  <button id="btnSettings"></button>
  <button id="btnBlog"></button>
  <div class="section"></div>
  <input id="postTitle" />
  <input id="postImage" />
  <input id="postImageFile" type="file" />
  <input id="postImageTags" />
  <button id="btnMediaPicker"></button>
  <textarea id="postContent"></textarea>
  <input id="postShare" type="checkbox" />
  <button id="btnSavePost"></button>
  <div id="postList"></div>
  <div id="postStatus"></div>
  <button id="btnPreview"></button>
  <button id="btnPublish"></button>
  <div id="previewSection"></div>
  <pre id="previewData"></pre>
  <button id="btnCopy"></button>
  <button id="btnDownload"></button>
  <div id="copySuccess"></div>
  <select id="previewChapterSelect"></select>
  <img id="previewImg" />
  <div id="previewPageLabel"></div>
  <button id="previewPrev"></button>
  <button id="previewNext"></button>
  <div id="previewFrame"></div>
  <div id="previewEmpty"></div>
  <button id="btnMedia"></button>
  <section id="mediaSection"></section>
  <div id="mediaList"></div>
  <input id="mediaPath" />
  <input id="mediaTags" />
  <input id="mediaSearch" />
  <button id="btnAddMedia"></button>
  <button id="btnSyncMedia"></button>
  <div id="mediaStatus"></div>
  <div id="editModal"></div>
  <div id="modalTitle"></div>
  <form id="editForm"></form>
  <input id="chapterName" />
  <div id="pageList"></div>
  <button id="btnAddPage"></button>
  <button id="btnCloseModal"></button>
  <button id="btnCancelEdit"></button>
  <div id="settingsModal"></div>
  <button id="btnCloseSettings"></button>
  <input id="githubToken" />
  <button id="btnSaveToken"></button>
  <div id="tokenSaveSuccess"></div>
  <button id="btnRenumberPages"></button>
  <div id="unsavedIndicator"></div>
  <div id="confirmModal"></div>
  <ul id="changesList"></ul>
  <button id="btnConfirmRenumber"></button>
  <button id="btnCancelRenumber"></button>
`;

describe("admin app smoke", () => {
  beforeEach(() => {
    document.body.innerHTML = domTemplate;

    // Stub alert and crypto to avoid runtime errors
    vi.stubGlobal("alert", vi.fn());
    vi.stubGlobal("crypto", { randomUUID: () => "uuid-123" });
    if (typeof Element !== "undefined") {
      // happy-dom doesn't implement scrollIntoView; stub it
      Element.prototype.scrollIntoView = vi.fn();
    }

    // Stub fetch for all admin endpoints
    vi.stubGlobal("fetch", async (url) => {
      const okResp = (body) => ({
        ok: true,
        json: async () => body,
        text: async () => JSON.stringify(body),
        status: 200,
      });

      if (typeof url === "string") {
        if (url.endsWith("data.json"))
          return okResp({
            chapters: {},
            chapterFolders: {},
            statusMessage: "",
          });
        if (url.endsWith("posts.json")) return okResp([]);
        if (url.endsWith("media.json")) return okResp([]);
        if (url.includes("/api/list-images")) return okResp({ paths: [] });
        if (url.includes("/api/list-media")) return okResp({ paths: [] });
        if (url.includes("/api/create-chapter")) return okResp({});
        if (url.includes("/api/renumber-chapter")) return okResp({ paths: [] });
        if (url.includes("api.github.com/repos") && url.includes("contents/")) {
          return okResp({ sha: "abc123" });
        }
        if (url.includes("/api/save")) return okResp({});
      }
      return okResp({});
    });
  });

  const waitTick = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("initializes without throwing and shows login screen when unauthenticated", async () => {
    vi.resetModules();
    await import("../admin/app.js");

    // Allow any pending timers/microtasks to run
    await waitTick();

    expect(document.getElementById("loginScreen")?.style.display).toBe("flex");
    expect(document.getElementById("adminDashboard")?.style.display).toBe(
      "none",
    );
  });

  it("allows creating a blog post and renders it", async () => {
    vi.resetModules();
    await import("../admin/app.js");
    await waitTick();

    // Simulate authenticated view
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("adminDashboard").style.display = "block";

    document.getElementById("postTitle").value = "Smoke Post";
    document.getElementById("postContent").value = "Some content";
    document.getElementById("postImageTags").value = "a,b";

    document.getElementById("btnSavePost").click();
    await waitTick();

    const postList = document.getElementById("postList");
    expect(postList.children.length).toBe(1);
    expect(postList.textContent).toContain("Smoke Post");
  });

  it("allows creating a chapter and renders it", async () => {
    vi.resetModules();
    await import("../admin/app.js");
    await waitTick();

    // Simulate authenticated view
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("adminDashboard").style.display = "block";

    // Add new chapter
    document.getElementById("btnAddChapter").click();
    await waitTick();

    document.getElementById("chapterName").value = "Chapter 1";
    const submitEvent = new Event("submit", {
      bubbles: true,
      cancelable: true,
    });
    document.getElementById("editForm").dispatchEvent(submitEvent);
    await waitTick();

    const chapterList = document.getElementById("chapterList");
    expect(chapterList.textContent).toContain("Chapter 1");
  });

  it("renders media section with empty placeholder", async () => {
    vi.resetModules();
    await import("../admin/app.js");
    await waitTick();

    document.getElementById("btnMedia").click();
    await waitTick();

    const mediaSection = document.getElementById("mediaSection");
    expect(mediaSection.style.display).toBe("block");
    expect(document.getElementById("mediaList").textContent).toContain(
      "No media found",
    );
  });

  it("fires publish flow with stubbed GitHub API", async () => {
    vi.resetModules();
    await import("../admin/app.js");
    await waitTick();

    // fake auth
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("adminDashboard").style.display = "block";

    // preset a token so publish continues
    localStorage.setItem("battlebros_github_user_token", "test-token");

    // stub confirm to auto-approve
    vi.stubGlobal("confirm", () => true);

    // click publish
    document.getElementById("btnPublish").click();
    await waitTick();
    await waitTick();
    await waitTick();

    // publish button should restore text (default label from DOM template is empty; check it's not "Publishing...")
    expect(document.getElementById("btnPublish").textContent).not.toBe(
      "Publishing...",
    );
  });
});

/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountAdminDom, jsonResponse, stubAdminGlobals } from "./helpers/admin-fixture.js";

describe("admin posts manager", () => {
  beforeEach(() => {
    vi.resetModules();
    mountAdminDom();
    stubAdminGlobals(vi);
    localStorage.clear();
  });

  it("saves a post and renders it in the blog list", async () => {
    const fetchMock = vi.fn(async (url, init = {}) => {
      if (url === "/api/admin/posts" && init.method === "POST") {
        const payload = JSON.parse(init.body);
        return jsonResponse({
          post: {
            id: "post-1",
            title: payload.title,
            content: payload.content,
            image: payload.image,
            imageTags: payload.imageTags,
            imageFit: payload.imageFit,
            imageFocus: payload.imageFocus,
            date: "2026-03-28T00:00:00.000Z",
            share: payload.share,
            shareBluesky: payload.shareBluesky,
            status: payload.status,
          },
        });
      }
      return jsonResponse({ posts: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const [{ createPostsManager }, { state }] = await Promise.all([
      import("../admin/posts.js"),
      import("../admin/state.js"),
    ]);

    state.posts = [];
    state.editingPostId = null;

    const manager = createPostsManager({
      hideAllSections: vi.fn(),
      setActiveNav: vi.fn(),
      upsertMediaEntry: vi.fn(async () => {}),
    });

    manager.showBlogSection();
    document.getElementById("postTitle").value = "Smoke Post";
    document.getElementById("postContent").innerHTML = "<p>Some content</p>";
    document.getElementById("postImageTags").value = "a, b";
    document.getElementById("postShare").checked = true;
    document.getElementById("postShareBluesky").checked = false;

    await manager.savePost();

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/posts", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
    }));
    expect(state.posts).toHaveLength(1);
    expect(document.getElementById("blogSection").style.display).toBe("block");
    expect(document.getElementById("postList").textContent).toContain("Smoke Post");
    expect(document.getElementById("postList").textContent).toContain("Some content");
  });
});

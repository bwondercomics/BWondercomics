/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mediaDom = `
  <div class="admin-content"></div>
  <button id="btnMedia"></button>
  <section id="mediaSection" style="display: none;"></section>
  <div id="mediaList"></div>
  <div id="mediaGallery"></div>
  <div id="mediaPreview" style="display: none;">
    <img id="mediaPreviewImg" />
    <div id="mediaPreviewInfo"></div>
    <div id="mediaPreviewPath"></div>
    <div id="mediaPreviewTags"></div>
    <div id="mediaPreviewUsage"></div>
    <div id="mediaUploadStatus"></div>
    <div id="mediaUploadStatusText"></div>
    <div id="mediaUploadStatusFill"></div>
    <img id="mediaPreviewBlurImg" />
    <div id="mediaPreviewBlurMissing"></div>
    <button id="mediaPreviewUse" type="button"></button>
    <button id="mediaPreviewSetOg" type="button"></button>
    <button id="mediaPreviewSetFavicon" type="button"></button>
    <button id="mediaPreviewCopy" type="button"></button>
    <button id="mediaPreviewTagsBtn" type="button"></button>
    <select id="mediaPreviewAccess">
      <option value="public">Public</option>
      <option value="premium">Premium</option>
      <option value="private">Private</option>
    </select>
    <div id="mediaPreviewPremiumRow"></div>
    <select id="mediaPreviewPremiumVisibility">
      <option value="blur">Blur</option>
      <option value="hidden">Hidden</option>
    </select>
    <button id="mediaPreviewDelete" type="button"></button>
    <button id="mediaPreviewClose" type="button"></button>
    <button id="mediaPreviewPrev" type="button"></button>
    <button id="mediaPreviewNext" type="button"></button>
  </div>
  <input id="mediaUploadInput" type="file" />
  <input id="mediaPath" />
  <input id="mediaTags" />
  <select id="mediaAccess">
    <option value="public">Public</option>
    <option value="premium">Premium</option>
    <option value="private">Private</option>
  </select>
  <div id="mediaPremiumVisibilityRow"></div>
  <select id="mediaPremiumVisibility">
    <option value="blur">Blur</option>
    <option value="hidden">Hidden</option>
  </select>
  <input id="mediaSearch" />
  <select id="mediaSort">
    <option value="library" selected>Library</option>
  </select>
  <div id="mediaListCount"></div>
  <div id="mediaGalleryCount"></div>
  <div id="mediaBrandingStatus"></div>
  <img id="mediaBrandingOgPreview" />
  <div id="mediaBrandingOgPath"></div>
  <button id="mediaBrandingOgReset" type="button"></button>
  <img id="mediaBrandingFaviconPreview" />
  <div id="mediaBrandingFaviconPath"></div>
  <button id="mediaBrandingFaviconReset" type="button"></button>
  <button id="btnAddMedia" type="button"></button>
  <button id="btnSyncMedia" type="button"></button>
  <div id="mediaStatus"></div>
`;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function importMediaModules() {
  const [{ state }, { createMediaManager }] = await Promise.all([
    import("../admin/state.js"),
    import("../admin/media.js"),
  ]);
  return { state, createMediaManager };
}

describe("admin media branding", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = mediaDom;
    vi.stubGlobal("alert", vi.fn());
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "",
    })));
    if (typeof Element !== "undefined") {
      Element.prototype.scrollIntoView = vi.fn();
    }
  });

  it("loads page-config branding from /page-config.json into shared state", async () => {
    const payload = {
      site: {
        ogImagePath: "media/share-card.png",
        faviconPath: "media/site-icon.png",
      },
    };
    global.fetch = vi.fn(async (url) => ({
      ok: url === "/page-config.json",
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    }));

    const [{ loadDefaultPageConfig }, { state }] = await Promise.all([
      import("../admin/page-config.js"),
      import("../admin/state.js"),
    ]);

    const config = await loadDefaultPageConfig({ force: true });
    expect(config.site.ogImagePath).toBe("media/share-card.png");
    expect(state.pageConfig.site.faviconPath).toBe("media/site-icon.png");
    expect(global.fetch).toHaveBeenCalledWith("/page-config.json", { cache: "no-store" });
  });

  it("saves selected public media as OG image and favicon", async () => {
    const savePayloads = [];
    global.fetch = vi.fn(async (url, init = {}) => {
      if (url === "/api/save") {
        savePayloads.push(JSON.parse(init.body));
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => "",
      };
    });

    const { state, createMediaManager } = await importMediaModules();
    state.pageConfig = { site: {} };
    state.posts = [];
    state.mediaItems = [
      {
        id: "hero",
        path: "media/hero.png",
        tags: ["cover"],
        access: "public",
        public: true,
        premiumVisibility: "blur",
      },
    ];

    const manager = createMediaManager({
      hideAllSections: vi.fn(),
      setActiveNav: vi.fn(),
    });
    manager.showMediaSection();
    await flush();

    document.querySelector(".media-card")?.click();
    await flush();

    document.getElementById("mediaPreviewSetOg").click();
    await flush();
    document.getElementById("mediaPreviewSetFavicon").click();
    await flush();

    const brandingSaves = savePayloads.filter((entry) => entry.filename === "admin/page-config.json");
    expect(brandingSaves).toHaveLength(2);
    expect(brandingSaves[0].content.site.ogImagePath).toBe("media/hero.png");
    expect(brandingSaves[1].content.site.faviconPath).toBe("media/hero.png");
    expect(state.pageConfig.site.ogImagePath).toBe("media/hero.png");
    expect(state.pageConfig.site.faviconPath).toBe("media/hero.png");
  });

  it("rejects premium media for branding assignment", async () => {
    const savePayloads = [];
    global.fetch = vi.fn(async (url, init = {}) => {
      if (url === "/api/save") {
        savePayloads.push(JSON.parse(init.body));
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => "",
      };
    });

    const { state, createMediaManager } = await importMediaModules();
    state.pageConfig = { site: {} };
    state.posts = [];
    state.mediaItems = [
      {
        id: "premium",
        path: "media/premium.png",
        tags: ["cover"],
        access: "premium",
        public: false,
        premiumVisibility: "blur",
      },
    ];

    const manager = createMediaManager({
      hideAllSections: vi.fn(),
      setActiveNav: vi.fn(),
    });
    manager.showMediaSection();
    await flush();

    document.querySelector(".media-card")?.click();
    await flush();
    document.getElementById("mediaPreviewSetOg").click();
    await flush();

    expect(savePayloads).toHaveLength(0);
    expect(document.getElementById("mediaBrandingStatus").textContent).toContain(
      "Only public media can be used for site branding.",
    );
  });

  it("clears branding when configured media becomes premium", async () => {
    const savePayloads = [];
    global.fetch = vi.fn(async (url, init = {}) => {
      if (url === "/api/rename-image") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: "renamed" }),
          text: async () => "",
        };
      }
      if (url === "/api/save") {
        savePayloads.push(JSON.parse(init.body));
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => "",
      };
    });

    const { state, createMediaManager } = await importMediaModules();
    state.pageConfig = {
      site: {
        ogImagePath: "media/hero.png",
        faviconPath: "media/hero.png",
      },
    };
    state.posts = [];
    state.mediaItems = [
      {
        id: "hero",
        path: "media/hero.png",
        tags: ["cover"],
        access: "public",
        public: true,
        premiumVisibility: "blur",
      },
    ];

    const manager = createMediaManager({
      hideAllSections: vi.fn(),
      setActiveNav: vi.fn(),
    });
    manager.showMediaSection();
    await flush();

    document.querySelector(".media-card")?.click();
    await flush();
    const accessSelect = document.getElementById("mediaPreviewAccess");
    accessSelect.value = "premium";
    accessSelect.dispatchEvent(new Event("change"));
    await flush();

    const brandingSave = savePayloads.find((entry) => entry.filename === "admin/page-config.json");
    expect(brandingSave).toBeTruthy();
    expect(brandingSave.content.site.ogImagePath).toBeUndefined();
    expect(brandingSave.content.site.faviconPath).toBeUndefined();
    expect(state.pageConfig.site.ogImagePath).toBeUndefined();
    expect(document.getElementById("mediaBrandingStatus").textContent).toContain(
      "no longer public",
    );
  });

  it("clears branding when configured media is deleted", async () => {
    const savePayloads = [];
    global.fetch = vi.fn(async (url, init = {}) => {
      if (url === "/api/delete-image") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: "deleted" }),
          text: async () => "",
        };
      }
      if (url === "/api/save") {
        savePayloads.push(JSON.parse(init.body));
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => "",
      };
    });
    vi.stubGlobal("confirm", vi.fn(() => true));

    const { state, createMediaManager } = await importMediaModules();
    state.pageConfig = { site: { ogImagePath: "media/hero.png" } };
    state.posts = [];
    state.mediaItems = [
      {
        id: "hero",
        path: "media/hero.png",
        tags: ["cover"],
        access: "public",
        public: true,
        premiumVisibility: "blur",
      },
    ];

    const manager = createMediaManager({
      hideAllSections: vi.fn(),
      setActiveNav: vi.fn(),
    });
    await manager.deleteMediaItem("hero");
    await flush();

    const brandingSave = savePayloads.find((entry) => entry.filename === "admin/page-config.json");
    expect(brandingSave).toBeTruthy();
    expect(brandingSave.content.site.ogImagePath).toBeUndefined();
    expect(state.pageConfig.site.ogImagePath).toBeUndefined();
    expect(document.getElementById("mediaBrandingStatus").textContent).toContain("was deleted");
  });
});

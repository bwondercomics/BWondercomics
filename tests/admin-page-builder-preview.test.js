import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bindModuleEditorEvents,
  renderModuleEditorContent,
} from "../admin/page-builder/module-editor.js";
import {
  initPreviewEmailForms,
  renderPreviewModule,
  renderPreviewPage,
} from "../admin/page-builder/preview-renderers.js";
import { getContractFixture } from "./helpers/contracts.js";

describe("admin page-builder editor and preview renderers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders current feed and email-signup editor controls", () => {
    const modules = getContractFixture("builderModules");
    const currentPage = {
      sections: [
        {
          id: "section-1",
          modules: [modules.feed, modules["email-signup"]],
        },
      ],
    };

    const feedHtml = renderModuleEditorContent({
      currentPage,
      selectedModuleId: modules.feed.id,
    });
    const emailHtml = renderModuleEditorContent({
      currentPage,
      selectedModuleId: modules["email-signup"].id,
    });

    const feedWrapper = document.createElement("div");
    feedWrapper.innerHTML = feedHtml;
    const emailWrapper = document.createElement("div");
    emailWrapper.innerHTML = emailHtml;

    expect(feedWrapper.querySelector('[data-key="heading"]')?.getAttribute("value")).toBe("BWC FEED");
    expect(feedWrapper.querySelector('[data-style-key="headingBgColor"]')?.getAttribute("value")).toBe("#ffed00");
    expect(emailWrapper.querySelector('[data-key="heading"]')?.getAttribute("value")).toBe("Join the List");
    expect(emailWrapper.querySelector('[data-style-key="buttonColor"]')?.getAttribute("value")).toBe("#00d9ff");
  });

  it("binds module editor save-delete flows for generic builder modules", async () => {
    const feedModule = getContractFixture("builderModules").feed;
    const currentPage = {
      sections: [
        {
          id: "section-1",
          modules: [feedModule],
        },
      ],
    };
    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderModuleEditorContent({
      currentPage,
      selectedModuleId: feedModule.id,
    });
    document.body.innerHTML = "";
    document.body.appendChild(wrapper);
    wrapper.querySelector('[data-key="heading"]').value = "Updated Feed";
    wrapper.querySelector('[data-key="limit"]').value = "8";
    wrapper.querySelector('[data-key="showMediaButton"]').checked = false;
    wrapper.querySelector('[data-style-key="buttonBgColor"]').value = "#112233";

    const updateModule = vi.fn(async (_id, payload) => ({
      id: feedModule.id,
      config: payload.config,
    }));
    const deleteModule = vi.fn(async () => true);
    const setSelectedModuleId = vi.fn();
    const renderCanvas = vi.fn();
    const renderEditorPanel = vi.fn();

    bindModuleEditorEvents({
      el: { pbModuleEditor: wrapper },
      currentPage,
      selectedModuleId: feedModule.id,
      setSelectedModuleId,
      updateModule,
      deleteModule,
      renderCanvas,
      renderEditorPanel,
      openImagePicker: vi.fn(),
      fetchAssets: vi.fn(async () => []),
      uploadAssetFile: vi.fn(async () => ({})),
    });

    document.getElementById("pbSaveModule")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(updateModule).toHaveBeenCalledWith(
      feedModule.id,
      expect.objectContaining({
        config: expect.objectContaining({
          heading: "Updated Feed",
          limit: 8,
          showMediaButton: false,
          style: expect.objectContaining({
            buttonBgColor: "#112233",
          }),
        }),
      }),
    );
    expect(renderCanvas).toHaveBeenCalled();

    document.getElementById("pbDeleteModule")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(deleteModule).toHaveBeenCalledWith(feedModule.id);
    expect(setSelectedModuleId).toHaveBeenCalledWith(null);
    expect(renderEditorPanel).toHaveBeenCalled();
  });

  it("renders high-value preview modules and preview-only email forms", () => {
    const modules = getContractFixture("builderModules");
    const previewPage = getContractFixture("builderPage");

    const feed = renderPreviewModule(modules.feed);
    const promo = renderPreviewModule(modules.promo);
    const reader = renderPreviewModule(modules.reader);
    const page = renderPreviewPage(previewPage);

    expect(feed).toContain("pb-feed-module");
    expect(promo).toContain("pb-promo-slide");
    expect(reader).toContain("Reader Component");
    expect(page).toContain("--pb-column-gap: 24px;");

    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderPreviewModule(modules["email-signup"]);
    initPreviewEmailForms(wrapper);
    wrapper.querySelector("[data-email-signup]")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(wrapper.querySelector(".pb-email-status")?.textContent).toContain("Preview mode");
  });
});

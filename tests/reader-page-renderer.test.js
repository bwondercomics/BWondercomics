import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderPage, renderModule } from "../reader/page-renderer.js";
import { getContractFixture } from "./helpers/contracts.js";

function parseModuleHtml(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper;
}

describe("reader page renderer", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the supported builder module contracts", () => {
    const modules = getContractFixture("builderModules");
    const expectations = {
      header: (wrapper) => {
        expect(wrapper.querySelector(".pb-header-title")?.textContent).toBe("Battle Bros");
      },
      text: (wrapper) => {
        expect(wrapper.querySelector(".pb-text")?.innerHTML).toContain("<strong>Heroes</strong>");
      },
      image: (wrapper) => {
        expect(wrapper.querySelector(".pb-image img")?.getAttribute("src")).toBe("/media/promo/hero-pose.png");
      },
      gallery: (wrapper) => {
        expect(wrapper.querySelectorAll(".pb-gallery-item")).toHaveLength(2);
      },
      video: (wrapper) => {
        expect(wrapper.querySelector("iframe")?.getAttribute("src")).toBe("https://www.youtube.com/embed/demo123");
      },
      social: (wrapper) => {
        expect(wrapper.querySelector(".pb-social-text")?.textContent).toBe("Bluesky");
      },
      "email-signup": (wrapper) => {
        expect(wrapper.querySelector("[data-email-signup]")).not.toBeNull();
      },
      promo: (wrapper) => {
        expect(wrapper.querySelectorAll(".pb-promo-slide")).toHaveLength(2);
      },
      buttons: (wrapper) => {
        expect(wrapper.querySelectorAll(".pb-btn")).toHaveLength(2);
      },
      divider: (wrapper) => {
        expect(wrapper.querySelector(".pb-divider")?.className).toContain("pb-divider--dashed");
      },
      spacer: (wrapper) => {
        expect(wrapper.querySelector(".pb-spacer")?.getAttribute("style")).toContain("64px");
      },
      reader: (wrapper) => {
        expect(wrapper.querySelector(".pb-reader-mount")?.dataset.showComments).toBe("false");
      },
      "entry-gallery": (wrapper) => {
        expect(wrapper.querySelector(".pb-entry-gallery-mount")?.dataset.columns).toBe("4");
      },
      feed: (wrapper) => {
        expect(wrapper.querySelector(".pb-feed-module")?.dataset.feedLimit).toBe("3");
      },
      html: (wrapper) => {
        expect(wrapper.querySelector(".custom-widget")?.textContent).toBe("Builder HTML");
      },
    };

    Object.entries(expectations).forEach(([key, assertModule]) => {
      const wrapper = parseModuleHtml(renderModule(modules[key]));
      expect(wrapper.querySelector(`.pb-module--${key}`)).not.toBeNull();
      assertModule(wrapper);
    });
  });

  it("renders placeholder states for empty and invalid module configs", () => {
    const image = parseModuleHtml(renderModule({ moduleType: "image", config: {} }));
    const gallery = parseModuleHtml(renderModule({ moduleType: "gallery", config: {} }));
    const video = parseModuleHtml(renderModule({ moduleType: "video", config: {} }));
    const social = parseModuleHtml(renderModule({ moduleType: "social", config: {} }));
    const buttons = parseModuleHtml(renderModule({ moduleType: "buttons", config: {} }));
    const promo = parseModuleHtml(renderModule({ moduleType: "promo", config: {} }));
    const unknown = parseModuleHtml(renderModule({ moduleType: "mystery", config: {} }));

    expect(image.textContent).toContain("No image set");
    expect(gallery.textContent).toContain("No images in gallery");
    expect(video.textContent).toContain("No video URL set");
    expect(social.textContent).toContain("No social buttons configured");
    expect(buttons.textContent).toContain("No buttons configured");
    expect(promo.textContent).toContain("No promos configured");
    expect(unknown.textContent).toContain("[Unknown module: mystery]");
  });

  it("renders page sections with current layout and spacing styles", () => {
    const page = getContractFixture("builderPage");
    const wrapper = parseModuleHtml(renderPage(page));
    const sections = wrapper.querySelectorAll(".pb-section");

    expect(wrapper.querySelector(".pb-page")?.dataset.pageId).toBe(page.id);
    expect(sections).toHaveLength(2);
    expect(sections[1].getAttribute("style")).toContain("--pb-module-gap: 20px;");
    expect(sections[1].querySelectorAll(".pb-column")).toHaveLength(2);
    expect(sections[1].querySelector(".pb-module--feed")).not.toBeNull();
  });
});

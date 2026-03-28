import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../reader/transform.js", () => ({
  clearOnPageFrame: vi.fn(),
  fitHeightFullscreen: vi.fn(),
  fitOnPageFrame: vi.fn(),
}));

import { CONFIG } from "../reader/config.js";
import {
  handleMouseEnterControls,
  handleMouseLeaveControls,
  onFullscreenChange,
  showControlsBar,
  toggleFullscreen,
} from "../reader/fullscreen.js";
import { el } from "../reader/dom.js";
import { state } from "../reader/state.js";
import {
  clearOnPageFrame,
  fitHeightFullscreen,
  fitOnPageFrame,
} from "../reader/transform.js";
import { setFullscreenElement } from "./helpers/reader-fixture.js";

describe("reader fullscreen controls", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    el.topbar = document.createElement("div");
    el.controls = document.createElement("div");
    el.fullscreenBtn = document.createElement("button");
    el.stage = document.createElement("div");
    document.body.append(el.topbar, el.controls, el.fullscreenBtn, el.stage);
    clearOnPageFrame.mockClear();
    fitHeightFullscreen.mockClear();
    fitOnPageFrame.mockClear();
    state.fullscreenBaseScale = 2;
    state.prevTransformOrigin = "left top";
    el.stage.style.transformOrigin = "center center";
    window.matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    global.requestAnimationFrame = (cb) => cb();
    document.documentElement.requestFullscreen = vi.fn(() => Promise.resolve());
    document.exitFullscreen = vi.fn(() => Promise.resolve());
  });

  it("auto-hides the controls after the fullscreen coarse-pointer delay", () => {
    setFullscreenElement(document.documentElement);

    showControlsBar();
    vi.advanceTimersByTime(CONFIG.CONTROLS_HIDE_DELAY + 5999);

    expect(el.topbar.classList.contains("hidden")).toBe(false);
    expect(el.controls.classList.contains("hidden")).toBe(false);

    vi.advanceTimersByTime(1);

    expect(el.topbar.classList.contains("hidden")).toBe(true);
    expect(el.controls.classList.contains("hidden")).toBe(true);
  });

  it("keeps controls visible while hovered and restarts the hide timer on leave", () => {
    setFullscreenElement(document.documentElement);

    showControlsBar();
    handleMouseEnterControls();
    vi.advanceTimersByTime(CONFIG.CONTROLS_HIDE_DELAY + 7000);
    expect(el.topbar.classList.contains("hidden")).toBe(false);

    handleMouseLeaveControls();
    vi.advanceTimersByTime(CONFIG.CONTROLS_HIDE_DELAY + 6000);
    expect(el.topbar.classList.contains("hidden")).toBe(true);
  });

  it("updates the UI and refits the viewport on fullscreen enter and exit", () => {
    setFullscreenElement(document.documentElement);

    onFullscreenChange();

    expect(document.body.classList.contains("fullscreen-active")).toBe(true);
    expect(el.fullscreenBtn.textContent).toBe("EXIT");
    expect(clearOnPageFrame).toHaveBeenCalledTimes(1);
    expect(fitHeightFullscreen).toHaveBeenCalledTimes(1);

    setFullscreenElement(null);
    onFullscreenChange();

    expect(document.body.classList.contains("fullscreen-active")).toBe(false);
    expect(el.fullscreenBtn.textContent).toBe("FULL");
    expect(state.fullscreenBaseScale).toBe(1);
    expect(state.prevTransformOrigin).toBeNull();
    expect(el.stage.style.transformOrigin).toBe("left top");
    expect(fitOnPageFrame).toHaveBeenCalledTimes(1);
  });

  it("toggles browser fullscreen requests", async () => {
    setFullscreenElement(null);
    await toggleFullscreen();
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);

    setFullscreenElement(document.documentElement);
    await toggleFullscreen();
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  });
});

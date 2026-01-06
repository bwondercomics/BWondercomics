import { el } from "./dom.js";
import { DEFAULT_SERIES_ID } from "./state.js";

function createDesigner({ sanitizeSeriesId, getActiveSeriesId, hideAllSections, setActiveNav }) {
  function getDesignerUrl(seriesId) {
    const id = sanitizeSeriesId(seriesId) || DEFAULT_SERIES_ID;
    const params = new URLSearchParams({ series: id, embed: "1" });
    return `designer.html?${params.toString()}`;
  }

  function setDesignerFrameSrc(seriesId, force = false) {
    if (!el.designerFrame) return;
    const id = sanitizeSeriesId(seriesId) || DEFAULT_SERIES_ID;
    if (!force && el.designerFrame.dataset.series === id) return;
    el.designerFrame.dataset.series = id;
    el.designerFrame.src = getDesignerUrl(id);
  }

  function showDesignerSection() {
    hideAllSections();
    if (el.adminDashboard) el.adminDashboard.classList.add("admin-designer-open");
    if (el.designerSection) {
      el.designerSection.style.display = "block";
      el.designerSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setDesignerFrameSrc(getActiveSeriesId());
    setActiveNav(el.btnDesigner);
  }

  function handleDesignerResizeMessage(event) {
    if (!el.designerFrame) return;
    if (event.origin !== window.location.origin) return;
    if (event.source !== el.designerFrame.contentWindow) return;
    const data = event.data;
    if (!data || data.type !== "designer:resize") return;
    const height = Number(data.height);
    if (!Number.isFinite(height) || height <= 0) return;
    el.designerFrame.style.height = `${Math.max(600, Math.ceil(height))}px`;
  }

  function initDesignerFrame() {
    if (!el.designerFrame) return;
    window.addEventListener("message", handleDesignerResizeMessage);
    el.designerFrame.addEventListener("load", () => {
      try {
        const doc = el.designerFrame.contentDocument;
        const height = doc?.documentElement?.scrollHeight;
        if (height) {
          el.designerFrame.style.height = `${Math.max(600, Math.ceil(height))}px`;
        }
      } catch (err) {
        // Ignore cross-origin access failures.
      }
    });
  }

  return {
    initDesignerFrame,
    setDesignerFrameSrc,
    showDesignerSection,
  };
}

export { createDesigner };

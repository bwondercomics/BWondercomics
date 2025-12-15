import { el } from "./dom.js";
import { state } from "./state.js";
import { changeChapter as changeChapterFromOverlays } from "./overlays.js";

const VOLUME_LINK =
  "https://bwondercomics.bigcartel.com/product/battle-bros-volume-1";
const VOLUME_EXCLUSIVES = [
  {
    image: "chapters/volumes/frontBBCOVER.png",
    title: "Physical Volume",
    href: VOLUME_LINK,
    badgeText: "Physical Volume",
    variantClass: "volume-card",
  },
];

function getChapterNumber(chapterName = "") {
  const match = String(chapterName).match(/(\d+)/);
  return match ? match[1] : "";
}

function getLockedCoverUrl(chapterName, meta) {
  if (meta && typeof meta === "object") {
    const configured = (meta.coverImage || meta.cover || "").toString().trim();
    if (configured) return configured;
  }

  // Legacy fallback: reuse existing public covers if present (optional).
  const num = getChapterNumber(chapterName);
  if (num) return `chapters/patreonCh/${num}cover.png`;
  return "";
}

function openCommentsPanel() {
  const overlay = document.getElementById("galleryOverlay");
  if (overlay && overlay.classList.contains("active")) toggleGallery();

  const commentsSection = document.getElementById("comicCommentsSection");
  const toggleBtn = document.getElementById("commentToggleBtn");
  if (commentsSection && commentsSection.classList.contains("collapsed") && toggleBtn) {
    toggleBtn.click();
  }

  if (commentsSection && typeof commentsSection.scrollIntoView === "function") {
    commentsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export function renderGallery(chapterOrder, chapters, options = {}) {
  const grid = document.getElementById("galleryGrid");
  if (!grid) return;

  grid.innerHTML = "";

  const lockedChapters = Array.isArray(options.lockedChapters) ? options.lockedChapters : [];
  const chapterMeta = options.chapterMeta && typeof options.chapterMeta === "object" ? options.chapterMeta : {};

  const names = chapterOrder.length ? chapterOrder : Object.keys(chapters);
  let cardIndex = 0;

  names.forEach((name) => {
    const pages = chapters[name];
    if (!pages || pages.length === 0) return;

    const coverUrl = pages[0];

    const card = document.createElement("div");
    card.className = "chapter-card";
    card.style.setProperty("--card-index", cardIndex++);
    if (name === state.currentChapter) {
      card.classList.add("active");
    }

    card.onclick = () => {
      if (el.chapter) el.chapter.value = name;
      changeChapterFromOverlays(name, chapters);
      toggleGallery();
    };

    const thumb = document.createElement("img");
    thumb.className = "chapter-thumb";
    thumb.src = coverUrl;
    thumb.alt = name;
    thumb.loading = "lazy";

    const info = document.createElement("div");
    info.className = "chapter-info";

    const title = document.createElement("div");
    title.className = "chapter-title";
    title.textContent = name;

    info.appendChild(title);
    card.appendChild(thumb);
    card.appendChild(info);
    grid.appendChild(card);
  });

  const addPromoCard = (cover, variantClass, badgeText) => {
    const card = document.createElement("div");
    card.className = `chapter-card ${variantClass}`;
    card.style.setProperty("--card-index", cardIndex++);

    card.onclick = () => {
      window.open(cover.href, "_blank", "noopener,noreferrer");
    };

    const thumb = document.createElement("img");
    thumb.className = "chapter-thumb";
    thumb.src = cover.image;
    thumb.alt = cover.title;
    thumb.loading = "lazy";

    const info = document.createElement("div");
    info.className = "chapter-info";

    const title = document.createElement("div");
    title.className = "chapter-title";
    title.textContent = cover.title;

    const badge = document.createElement("div");
    badge.className = `${variantClass.replace(/-card$/i, "")}-badge`;
    badge.textContent = badgeText;

    info.appendChild(title);
    info.appendChild(badge);
    card.appendChild(thumb);
    card.appendChild(info);
    grid.appendChild(card);
  };

  lockedChapters.forEach((name) => {
    const meta = chapterMeta?.[name];
    const coverUrl = getLockedCoverUrl(name, meta);

    const card = document.createElement("div");
    card.className = "chapter-card premium-card locked";
    card.style.setProperty("--card-index", cardIndex++);

    card.onclick = () => openCommentsPanel();

    const thumb = document.createElement("img");
    thumb.className = "chapter-thumb";
    if (coverUrl) thumb.src = coverUrl;
    thumb.alt = name;
    thumb.loading = "lazy";
    thumb.onerror = () => {
      // Keep the card usable even if no public cover exists.
      thumb.removeAttribute("src");
    };

    const info = document.createElement("div");
    info.className = "chapter-info";

    const title = document.createElement("div");
    title.className = "chapter-title";
    title.textContent = name;

    const badge = document.createElement("div");
    badge.className = "premium-badge";
    badge.textContent = "Premium • Sign in to unlock";

    info.appendChild(title);
    info.appendChild(badge);
    card.appendChild(thumb);
    card.appendChild(info);
    grid.appendChild(card);
  });

  VOLUME_EXCLUSIVES.forEach((cover) =>
    addPromoCard(cover, cover.variantClass, cover.badgeText),
  );

  const closeBtn = document.getElementById("galleryClose");
  if (closeBtn) {
    closeBtn.onclick = toggleGallery;
  }
}

export function toggleGallery() {
  const overlay = document.getElementById("galleryOverlay");
  if (overlay) {
    overlay.classList.toggle("active");
  }
}

export function attachGalleryButton() {
  const galleryBtn = document.getElementById("galleryBtn");
  if (galleryBtn) galleryBtn.addEventListener("click", toggleGallery);
}

// changeChapter handled via imported alias; no local implementation

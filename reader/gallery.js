import { el } from "./dom.js";
import { state } from "./state.js";
import { changeEntry as changeEntryFromOverlays } from "./overlays.js";

// Entry gallery overlay with lazy-loaded thumbnails and promo cards.

const STORE_BADGE_TEXT = "Physical Volume";

// Lazy-load gallery thumbnails as they enter the viewport.
const imageObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      if (img.dataset.src) {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
        imageObserver.unobserve(img);
      }
    }
  });
}, {
  rootMargin: '50px' // Start loading 50px before image enters viewport
});

function getLockedCoverUrl(chapterName, meta) {
  if (meta && typeof meta === "object") {
    const configured = (meta.coverImage || meta.cover || "").toString().trim();
    if (configured) return configured;
  }
  return "";
}

function getDisplayNumber(meta) {
  if (!meta || typeof meta !== "object") return null;
  const raw = meta.displayNumber;
  const parsed = Number.isFinite(raw) ? raw : parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatEntryLabel(name, meta, unitLabel) {
  const displayNumber = getDisplayNumber(meta);
  if (displayNumber == null) return name;
  const label = String(meta?.entryLabelSingular || unitLabel || "Entry");
  return `${label} ${displayNumber} - ${name}`;
}

function openCommentsPanel() {
  const overlay = document.getElementById("entryCoverGallery");
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

// Build the gallery grid for available and locked entries.
export function renderGallery(entryOrder, entries, options = {}) {
  const grid = document.getElementById("entryCoverGalleryGrid");
  if (!grid) return;

  grid.innerHTML = "";

  const lockedEntries = Array.isArray(options.lockedEntries) ? options.lockedEntries : [];
  const entryMetaPayload = options.entryMeta && typeof options.entryMeta === "object" ? options.entryMeta : {};
  const unitLabel = options.unitLabelSingular || "Entry";

  // Append a promo card for merch or special volume releases.
  const addPromoCard = (cover, variantClass, badgeText) => {
    const card = document.createElement("div");
    card.className = `entry-card ${variantClass}`;
    card.style.setProperty("--card-index", cardIndex++);

    card.onclick = () => {
      window.open(cover.href, "_blank", "noopener,noreferrer");
    };

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "entry-thumb-wrap";

    const thumb = document.createElement("img");
    thumb.className = "entry-thumb";
    thumb.dataset.src = cover.image;
    thumb.alt = cover.title;
    thumb.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='150'%3E%3Crect width='100' height='150' fill='%23111'/%3E%3C/svg%3E";

    if (imageObserver) {
      imageObserver.observe(thumb);
    }

    const info = document.createElement("div");
    info.className = "entry-info";

    const title = document.createElement("div");
    title.className = "entry-title";
    title.textContent = cover.title;

    const badge = document.createElement("div");
    badge.className = `${variantClass.replace(/-card$/i, "")}-badge`;
    badge.textContent = badgeText;

    info.appendChild(title);
    info.appendChild(badge);
    thumbWrap.appendChild(thumb);
    card.appendChild(thumbWrap);
    card.appendChild(info);
    grid.appendChild(card);
  };

  const names = entryOrder.length ? entryOrder : Object.keys(entries);
  let cardIndex = 0;

  names.forEach((name) => {
    const pages = entries[name];
    const meta = entryMetaPayload?.[name] || {};
    const releaseType = String(meta.releaseType || "digital").toLowerCase();
    const showInGallery = meta.showInGallery !== false;
    if (!showInGallery) return;

    if (releaseType === "store") {
      const coverUrl = meta.coverImage || (Array.isArray(pages) ? pages[0] : "");
      const storeUrl = meta.storeUrl;
      if (!storeUrl || !coverUrl) return;
      addPromoCard(
        { image: coverUrl, title: formatEntryLabel(name, meta, unitLabel), href: storeUrl },
        "volume-card",
        STORE_BADGE_TEXT,
      );
      return;
    }

    if (!pages || pages.length === 0) return;

    const coverUrl = pages[0];
    const isPatron = !!meta?.premium;
    const displayTitle = formatEntryLabel(name, meta, unitLabel);

    const card = document.createElement("div");
    card.className = "entry-card";
    card.style.setProperty("--card-index", cardIndex++);
    if (name === state.currentEntry) {
      card.classList.add("active");
    }

    card.onclick = () => {
      if (el.entry) el.entry.value = name;
      changeEntryFromOverlays(name, entries, entryMetaPayload);
      toggleGallery();
    };

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "entry-thumb-wrap";

    const thumb = document.createElement("img");
    thumb.className = "entry-thumb";
    // Use data-src for lazy loading via Intersection Observer
    thumb.dataset.src = coverUrl;
    thumb.alt = name;
    // Lightweight placeholder (1x1 transparent pixel)
    thumb.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='150'%3E%3Crect width='100' height='150' fill='%23111'/%3E%3C/svg%3E";

    // Observe for lazy loading
    if (imageObserver) {
      imageObserver.observe(thumb);
    }

    thumbWrap.appendChild(thumb);

    if (isPatron) {
      const badge = document.createElement("div");
      badge.className = "patron-badge";
      badge.textContent = "Patron";
      thumbWrap.appendChild(badge);
    }

    const info = document.createElement("div");
    info.className = "entry-info";

    const title = document.createElement("div");
    title.className = "entry-title";
    title.textContent = displayTitle;

    info.appendChild(title);
    card.appendChild(thumbWrap);
    card.appendChild(info);
    grid.appendChild(card);
  });

  lockedEntries.forEach((name) => {
    const meta = entryMetaPayload?.[name];
    const coverUrl = getLockedCoverUrl(name, meta);
    const displayTitle = formatEntryLabel(name, meta, unitLabel);

    const card = document.createElement("div");
    card.className = "entry-card premium-card locked";
    card.style.setProperty("--card-index", cardIndex++);

    card.onclick = () => openCommentsPanel();

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "entry-thumb-wrap";

    const thumb = document.createElement("img");
    thumb.className = "entry-thumb";
    if (coverUrl) thumb.dataset.src = coverUrl;
    thumb.alt = name;
    thumb.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='150'%3E%3Crect width='100' height='150' fill='%23111'/%3E%3C/svg%3E";

    if (imageObserver && coverUrl) {
      imageObserver.observe(thumb);
    }

    thumb.onerror = () => {
      // Keep the card usable even if no public cover exists.
      thumb.removeAttribute("src");
    };

    const info = document.createElement("div");
    info.className = "entry-info";

    const title = document.createElement("div");
    title.className = "entry-title";
    title.textContent = displayTitle;

    const badge = document.createElement("div");
    badge.className = "patron-badge";
    badge.textContent = "Patron";

    info.appendChild(title);
    thumbWrap.appendChild(thumb);
    thumbWrap.appendChild(badge);
    card.appendChild(thumbWrap);
    card.appendChild(info);
    grid.appendChild(card);
  });

  const closeBtn = document.getElementById("entryCoverGalleryClose");
  if (closeBtn) {
    closeBtn.onclick = toggleGallery;
  }
}

// Toggle the gallery overlay visibility.
export function toggleGallery() {
  const overlay = document.getElementById("entryCoverGallery");
  if (overlay) {
    overlay.classList.toggle("active");
  }
}

// Wire the gallery button click handler once the DOM is ready.
export function attachGalleryButton() {
  const galleryBtn = document.getElementById("entryCoverGalleryBtn");
  if (galleryBtn) galleryBtn.addEventListener("click", toggleGallery);

  const overlay = document.getElementById("entryCoverGallery");
  if (overlay) {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) toggleGallery();
    });
  }
}

// changeChapter handled via imported alias; no local implementation

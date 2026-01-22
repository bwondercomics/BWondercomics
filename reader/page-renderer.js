/**
 * Page Renderer: Renders pages built with the page builder.
 * Fetches page config from the API and renders modules to HTML.
 */

import { getActiveSeriesId } from "./series.js";
import { logger } from "./logger.js";

/**
 * Fetch a page by slug from the API.
 * @param {string} slug - The page slug (e.g., "reader", "about")
 * @param {string} [seriesId] - Optional series ID override
 * @returns {Promise<object|null>} The page data or null if not found
 */
export async function fetchPage(slug, seriesId = null) {
  const sid = seriesId || getActiveSeriesId();
  try {
    const res = await fetch(`/api/pages/${encodeURIComponent(sid)}/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      if (res.status === 404) {
        logger.log(`Page "${slug}" not found for series "${sid}"`);
        return null;
      }
      throw new Error(`Failed to fetch page: ${res.status}`);
    }
    const data = await res.json();
    return data.page || null;
  } catch (err) {
    logger.error("fetchPage error:", err);
    return null;
  }
}

/**
 * Render a complete page to HTML.
 * @param {object} page - The page data from the API
 * @returns {string} HTML string
 */
export function renderPage(page) {
  if (!page || !page.sections) {
    return '<div class="pb-page-empty">Page not configured.</div>';
  }

  const sectionsHtml = page.sections.map((section) => renderSection(section)).join("");

  return `<div class="pb-page" data-page-id="${page.id}">${sectionsHtml}</div>`;
}

/**
 * Render a section with its columns and modules.
 * @param {object} section - Section data
 * @returns {string} HTML string
 */
function renderSection(section) {
  const layout = section.layout || "1";
  const columnCount = layout.split("-").length;
  const sectionType = section.sectionType || "row";
  const settings = section.settings || {};

  // Build inline styles from settings
  let style = "";
  if (settings.backgroundColor) style += `background-color: ${settings.backgroundColor};`;
  if (settings.paddingTop) style += `padding-top: ${settings.paddingTop}px;`;
  if (settings.paddingBottom) style += `padding-bottom: ${settings.paddingBottom}px;`;

  // Group modules by column
  const columnModules = {};
  for (let i = 0; i < columnCount; i++) {
    columnModules[i] = [];
  }
  for (const mod of section.modules || []) {
    const colIdx = mod.columnIndex || 0;
    if (!columnModules[colIdx]) columnModules[colIdx] = [];
    columnModules[colIdx].push(mod);
  }

  // Render columns
  const columnsHtml = Object.keys(columnModules)
    .sort((a, b) => Number(a) - Number(b))
    .map((colIdx) => {
      const modules = columnModules[colIdx];
      const modulesHtml = modules.map((mod) => renderModule(mod)).join("");
      return `<div class="pb-column">${modulesHtml}</div>`;
    })
    .join("");

  return `
    <section class="pb-section pb-section--${sectionType}" data-layout="${layout}" style="${style}">
      <div class="pb-section-columns pb-layout--${layout}">
        ${columnsHtml}
      </div>
    </section>
  `;
}

/**
 * Render a single module.
 * @param {object} mod - Module data
 * @returns {string} HTML string
 */
function renderModule(mod) {
  const type = mod.moduleType || "text";
  const config = mod.config || {};

  const renderer = MODULE_RENDERERS[type];
  if (!renderer) {
    logger.warn(`Unknown module type: ${type}`);
    return `<div class="pb-module pb-module--unknown">[Unknown module: ${type}]</div>`;
  }

  const content = renderer(config);
  return `<div class="pb-module pb-module--${type}">${content}</div>`;
}

/**
 * Module renderers - each takes a config object and returns HTML.
 */
const MODULE_RENDERERS = {
  header: (config) => {
    const title = escapeHtml(config.title || "");
    const subtitle = escapeHtml(config.subtitle || "");
    return `
      <header class="pb-header">
        <h1 class="pb-header-title">${title}</h1>
        ${subtitle ? `<p class="pb-header-subtitle">${subtitle}</p>` : ""}
      </header>
    `;
  },

  text: (config) => {
    const content = config.content || "";
    const alignment = config.alignment || "left";
    // Content may contain HTML, so we don't escape it
    return `<div class="pb-text" style="text-align: ${alignment};">${content}</div>`;
  },

  image: (config) => {
    const src = escapeHtml(config.src || "");
    const alt = escapeHtml(config.alt || "");
    const caption = escapeHtml(config.caption || "");
    if (!src) return '<div class="pb-image pb-image--empty">No image set</div>';
    return `
      <figure class="pb-image">
        <img src="${src}" alt="${alt}" loading="lazy" />
        ${caption ? `<figcaption>${caption}</figcaption>` : ""}
      </figure>
    `;
  },

  gallery: (config) => {
    const images = config.images || [];
    const columns = config.columns || 3;
    if (images.length === 0) {
      return '<div class="pb-gallery pb-gallery--empty">No images in gallery</div>';
    }
    const imagesHtml = images
      .map((img) => {
        const src = escapeHtml(img.src || img);
        const alt = escapeHtml(img.alt || "");
        return `<div class="pb-gallery-item"><img src="${src}" alt="${alt}" loading="lazy" /></div>`;
      })
      .join("");
    return `<div class="pb-gallery" style="--gallery-columns: ${columns};">${imagesHtml}</div>`;
  },

  video: (config) => {
    const url = config.url || "";
    if (!url) return '<div class="pb-video pb-video--empty">No video URL set</div>';

    // Handle YouTube and Vimeo embeds
    let embedUrl = url;
    const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
    if (youtubeMatch) {
      embedUrl = `https://www.youtube.com/embed/${youtubeMatch[1]}`;
    }
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) {
      embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    }

    return `
      <div class="pb-video">
        <iframe src="${escapeHtml(embedUrl)}" frameborder="0" allowfullscreen loading="lazy"></iframe>
      </div>
    `;
  },

  social: (config) => {
    const buttons = config.buttons || [];
    if (buttons.length === 0) {
      return '<div class="pb-social pb-social--empty">No social buttons configured</div>';
    }
    const buttonsHtml = buttons
      .map((btn) => {
        const icon = escapeHtml(btn.icon || "");
        const text = escapeHtml(btn.text || "");
        const url = escapeHtml(btn.url || "#");
        const isImage = /\.(png|jpe?g|webp|gif|svg)$/i.test(icon);
        const iconHtml = isImage
          ? `<img src="${icon}" alt="${text}" />`
          : `<span class="pb-social-icon-text">${icon}</span>`;
        return `
          <a href="${url}" class="pb-social-btn" target="_blank" rel="noopener noreferrer">
            <span class="pb-social-icon">${iconHtml}</span>
            <span class="pb-social-text">${text}</span>
          </a>
        `;
      })
      .join("");
    return `<div class="pb-social">${buttonsHtml}</div>`;
  },

  "email-signup": (config) => {
    const heading = escapeHtml(config.heading || "Join the List");
    const subtext = escapeHtml(config.subtext || "");
    const placeholder = escapeHtml(config.placeholder || "your@email.com");
    const buttonText = escapeHtml(config.buttonText || "Subscribe");
    const style = config.style || {};

    // Build heading styles
    const headingStyles = [];
    headingStyles.push(`color: ${style.headingColor || "#ffffff"}`);
    if (style.headingFont === "display") {
      headingStyles.push('font-family: "Bebas Neue", sans-serif');
    } else if (style.headingFont === "mono") {
      headingStyles.push('font-family: "JetBrains Mono", monospace');
    }
    if (style.headingGlow) {
      const glowColor = style.headingColor || "#ffffff";
      headingStyles.push(`text-shadow: 0 0 10px ${glowColor}, 0 0 20px ${glowColor}`);
    }

    // Determine input class based on style
    const inputClass = style.inputStyle === "flat" ? "pb-email-input--flat" : "pb-email-input--bubble";

    // Build button styles
    const buttonColor = style.buttonColor || "#00d9ff";
    const buttonStyles = [`--btn-color: ${buttonColor}`];
    const buttonClass = style.buttonGlow ? "pb-email-btn--glow" : "";

    return `
      <div class="email-signup-section pb-email-signup-styled">
        <div class="email-signup-label" style="${headingStyles.join(";")}">${heading}</div>
        ${subtext ? `<div class="email-signup-cta">${subtext}</div>` : ""}
        <form class="email-signup-form" data-email-signup>
          <input type="email" class="email-input ${inputClass}" placeholder="${placeholder}" required />
          <button type="submit" class="email-submit-btn ${buttonClass}" style="${buttonStyles.join(";")}">${buttonText}</button>
        </form>
        <div class="email-form-message pb-email-status"></div>
      </div>
    `;
  },

  buttons: (config) => {
    const buttons = config.buttons || [];
    if (buttons.length === 0) {
      return '<div class="pb-buttons pb-buttons--empty">No buttons configured</div>';
    }
    const buttonsHtml = buttons
      .map((btn) => {
        const text = escapeHtml(btn.text || "Button");
        const url = escapeHtml(btn.url || "#");
        const style = btn.style || "primary";
        const target = url.startsWith("#") ? "" : 'target="_blank" rel="noopener noreferrer"';
        return `<a href="${url}" class="pb-btn pb-btn--${style}" ${target}>${text}</a>`;
      })
      .join("");
    return `<div class="pb-buttons">${buttonsHtml}</div>`;
  },

  spacer: (config) => {
    const height = config.height || 40;
    return `<div class="pb-spacer" style="height: ${height}px;"></div>`;
  },

  divider: (config) => {
    const style = config.style || "solid";
    const color = config.color || "";
    const colorStyle = color ? `border-color: ${escapeHtml(color)};` : "";
    return `<hr class="pb-divider pb-divider--${style}" style="${colorStyle}" />`;
  },

  reader: (config) => {
    // The reader module renders a placeholder that will be hydrated by the main reader app
    const showPanels = config.showPanels !== false;
    const showComments = config.showComments !== false;
    return `
      <div class="pb-reader-mount"
           data-show-panels="${showPanels}"
           data-show-comments="${showComments}">
        <!-- Reader will be mounted here -->
      </div>
    `;
  },

  "entry-gallery": (config) => {
    const columns = config.columns || 3;
    const showLabels = config.showLabels !== false;
    return `
      <div class="pb-entry-gallery-mount"
           data-columns="${columns}"
           data-show-labels="${showLabels}">
        <!-- Entry gallery will be mounted here -->
      </div>
    `;
  },

  feed: (config) => {
    const limit = config.limit || 5;
    return `
      <div class="pb-feed-mount" data-limit="${limit}">
        <!-- Feed will be mounted here -->
      </div>
    `;
  },

  html: (config) => {
    const code = config.code || "";
    // Custom HTML is rendered as-is (be careful with untrusted content)
    return `<div class="pb-html">${code}</div>`;
  },

  promo: (config) => {
    const items = config.items || [];
    if (items.length === 0) {
      return '<div class="pb-promo pb-promo--empty">No promos configured</div>';
    }

    const height = config.height || 400;
    const showNav = config.showNavigation !== false;
    const showIndicators = config.showIndicators !== false;
    const autoRotate = config.autoRotate !== false;
    const interval = config.interval || 5000;
    const transition = config.transition || "fade";

    const slidesHtml = items.map((item, index) => {
      const style = item.style || {};
      const isOverlay = item.textPosition === "overlay";

      // Build inline styles for the slide
      const slideStyles = [];
      if (style.backgroundColor && style.backgroundColor !== "transparent") {
        slideStyles.push(`background-color: ${style.backgroundColor}`);
      }

      // Image styles
      const imageStyles = [];
      if (style.imageBorder) {
        imageStyles.push(`border: 2px solid ${style.imageBorderColor || "#00d9ff"}`);
      }
      if (style.imageGlow) {
        const glowColor = style.imageGlowColor || "#00d9ff";
        const intensity = style.imageGlowIntensity || 0.5;
        imageStyles.push(`box-shadow: 0 0 ${20 * intensity}px ${glowColor}, 0 0 ${40 * intensity}px ${glowColor}`);
      }

      // Top text styles
      const topTextStyles = [];
      topTextStyles.push(`color: ${style.topTextColor || "#ffed00"}`);
      if (style.topTextFont === "display") {
        topTextStyles.push('font-family: "Bebas Neue", sans-serif');
      } else if (style.topTextFont === "mono") {
        topTextStyles.push('font-family: "JetBrains Mono", monospace');
      }
      if (style.topTextGlow) {
        const glowColor = style.topTextGlowColor || "#ffed00";
        topTextStyles.push(`text-shadow: 0 0 10px ${glowColor}, 0 0 20px ${glowColor}`);
      }

      // Bottom text styles
      const bottomTextStyles = [];
      bottomTextStyles.push(`color: ${style.bottomTextColor || "#ffffff"}`);
      if (style.bottomTextFont === "display") {
        bottomTextStyles.push('font-family: "Bebas Neue", sans-serif');
      } else if (style.bottomTextFont === "mono") {
        bottomTextStyles.push('font-family: "JetBrains Mono", monospace');
      }
      if (style.bottomTextGlow) {
        const glowColor = style.bottomTextGlowColor || "#00d9ff";
        bottomTextStyles.push(`text-shadow: 0 0 10px ${glowColor}, 0 0 20px ${glowColor}`);
      }

      const imageSrc = escapeHtml(item.image || "");
      const topText = item.topText ? `<div class="pb-promo-top-text" style="${topTextStyles.join(";")}">${escapeHtml(item.topText)}</div>` : "";
      const bottomText = item.bottomText ? `<div class="pb-promo-bottom-text" style="${bottomTextStyles.join(";")}">${item.bottomText}</div>` : "";

      const imageHtml = imageSrc
        ? `<img src="${imageSrc}" alt="" loading="lazy" style="${imageStyles.join(";")}" />`
        : '<div class="pb-promo-no-image"></div>';

      if (isOverlay) {
        return `
          <div class="pb-promo-slide ${index === 0 ? "active" : ""}" data-index="${index}" style="${slideStyles.join(";")}">
            <div class="pb-promo-image-container">
              ${imageHtml}
              <div class="pb-promo-overlay">
                ${topText}
                ${bottomText}
              </div>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="pb-promo-slide pb-promo-slide--outside ${index === 0 ? "active" : ""}" data-index="${index}" style="${slideStyles.join(";")}">
            ${topText}
            <div class="pb-promo-image-container">
              ${imageHtml}
            </div>
            ${bottomText}
          </div>
        `;
      }
    }).join("");

    const indicatorsHtml = showIndicators && items.length > 1 ? `
      <div class="pb-promo-indicators">
        ${items.map((_, i) => `<button class="pb-promo-indicator ${i === 0 ? "active" : ""}" data-index="${i}" aria-label="Go to slide ${i + 1}"></button>`).join("")}
      </div>
    ` : "";

    const navHtml = showNav && items.length > 1 ? `
      <button class="pb-promo-nav pb-promo-nav--prev" data-dir="prev" aria-label="Previous slide">\u2039</button>
      <button class="pb-promo-nav pb-promo-nav--next" data-dir="next" aria-label="Next slide">\u203A</button>
    ` : "";

    return `
      <div class="pb-promo pb-promo--${transition}"
           style="--promo-height: ${height}px;"
           data-auto-rotate="${autoRotate}"
           data-interval="${interval}"
           data-item-count="${items.length}">
        <div class="pb-promo-slides">
          ${slidesHtml}
        </div>
        ${navHtml}
        ${indicatorsHtml}
      </div>
    `;
  },
};

/**
 * Escape HTML special characters.
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Mount a page into a container element.
 * @param {HTMLElement} container - The container to mount into
 * @param {string} slug - The page slug to load
 * @param {string} [seriesId] - Optional series ID
 */
export async function mountPage(container, slug, seriesId = null) {
  if (!container) {
    logger.error("mountPage: container is required");
    return;
  }

  container.innerHTML = '<div class="pb-loading">Loading...</div>';

  const page = await fetchPage(slug, seriesId);
  if (!page) {
    container.innerHTML = '<div class="pb-error">Page not found.</div>';
    return;
  }

  container.innerHTML = renderPage(page);

  // Initialize interactive modules
  initEmailForms(container);
  initPromoCarousels(container);
}

/**
 * Initialize email signup forms within a container.
 */
function initEmailForms(container) {
  container.querySelectorAll("[data-email-signup]").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = form.querySelector('input[type="email"]');
      const status = form.parentElement.querySelector(".pb-email-status");
      const email = input?.value?.trim();

      if (!email) return;

      try {
        const res = await fetch("/api/email/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        if (res.ok) {
          if (status) status.textContent = "Thanks for subscribing!";
          if (input) input.value = "";
        } else {
          const data = await res.json();
          if (status) status.textContent = data.error || "Failed to subscribe.";
        }
      } catch {
        if (status) status.textContent = "Failed to subscribe.";
      }
    });
  });
}

/**
 * Initialize promo carousel modules within a container.
 */
function initPromoCarousels(container) {
  container.querySelectorAll(".pb-promo[data-item-count]").forEach((promo) => {
    const itemCount = parseInt(promo.dataset.itemCount, 10);
    if (itemCount <= 1) return; // No carousel needed for single item

    const autoRotate = promo.dataset.autoRotate === "true";
    const interval = parseInt(promo.dataset.interval, 10) || 5000;
    const slides = promo.querySelectorAll(".pb-promo-slide");
    const indicators = promo.querySelectorAll(".pb-promo-indicator");
    const prevBtn = promo.querySelector(".pb-promo-nav--prev");
    const nextBtn = promo.querySelector(".pb-promo-nav--next");
    const isSlideTransition = promo.classList.contains("pb-promo--slide");

    let currentIndex = 0;
    let autoRotateTimer = null;
    let isPaused = false;

    function goToSlide(index, direction = "next") {
      // Normalize index
      if (index < 0) index = slides.length - 1;
      if (index >= slides.length) index = 0;

      // Update slides
      slides.forEach((slide, i) => {
        slide.classList.remove("active", "prev");
        if (i === index) {
          slide.classList.add("active");
        } else if (isSlideTransition && i === currentIndex) {
          slide.classList.add(direction === "next" ? "prev" : "");
        }
      });

      // Update indicators
      indicators.forEach((ind, i) => {
        ind.classList.toggle("active", i === index);
      });

      currentIndex = index;
    }

    function nextSlide() {
      goToSlide(currentIndex + 1, "next");
    }

    function prevSlide() {
      goToSlide(currentIndex - 1, "prev");
    }

    function startAutoRotate() {
      if (!autoRotate || isPaused) return;
      stopAutoRotate();
      autoRotateTimer = setInterval(nextSlide, interval);
    }

    function stopAutoRotate() {
      if (autoRotateTimer) {
        clearInterval(autoRotateTimer);
        autoRotateTimer = null;
      }
    }

    // Navigation button events
    prevBtn?.addEventListener("click", () => {
      prevSlide();
      startAutoRotate();
    });

    nextBtn?.addEventListener("click", () => {
      nextSlide();
      startAutoRotate();
    });

    // Indicator click events
    indicators.forEach((indicator) => {
      indicator.addEventListener("click", () => {
        const targetIndex = parseInt(indicator.dataset.index, 10);
        const direction = targetIndex > currentIndex ? "next" : "prev";
        goToSlide(targetIndex, direction);
        startAutoRotate();
      });
    });

    // Pause on hover
    promo.addEventListener("mouseenter", () => {
      isPaused = true;
      stopAutoRotate();
    });

    promo.addEventListener("mouseleave", () => {
      isPaused = false;
      startAutoRotate();
    });

    // Touch/swipe support
    let touchStartX = 0;

    promo.addEventListener("touchstart", (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    promo.addEventListener("touchend", (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      const diff = touchStartX - touchEndX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) {
          nextSlide();
        } else {
          prevSlide();
        }
        startAutoRotate();
      }
    }, { passive: true });

    // Start auto-rotation
    startAutoRotate();

    // Pause when tab is hidden
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopAutoRotate();
      } else if (!isPaused) {
        startAutoRotate();
      }
    });
  });
}

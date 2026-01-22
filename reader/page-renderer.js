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
    const heading = escapeHtml(config.heading || "Subscribe");
    const buttonText = escapeHtml(config.buttonText || "Sign Up");
    return `
      <div class="pb-email-signup">
        <h3>${heading}</h3>
        <form class="pb-email-form" data-email-signup>
          <input type="email" placeholder="Enter your email" required />
          <button type="submit">${buttonText}</button>
        </form>
        <div class="pb-email-status"></div>
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

import { escapeHtml, resolveAssetUrl } from "./helpers.js";
import { renderPromoModule } from "./promo-renderer.js";

export const PREVIEW_RENDERERS = {
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
    return `<div class="pb-text" style="text-align: ${alignment};">${content}</div>`;
  },

  image: (config) => {
    const src = escapeHtml(resolveAssetUrl(config.src || ""));
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
        const src = escapeHtml(resolveAssetUrl(img.src || img));
        const alt = escapeHtml(img.alt || "");
        return `<div class="pb-gallery-item"><img src="${src}" alt="${alt}" loading="lazy" /></div>`;
      })
      .join("");
    return `<div class="pb-gallery" style="--gallery-columns: ${columns};">${imagesHtml}</div>`;
  },

  video: (config) => {
    const url = config.url || "";
    if (!url) return '<div class="pb-video pb-video--empty">No video URL set</div>';

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
        const style = btn.style || {};

        const hexToRgba = (hex, opacity) => {
          const h = (hex || "#000000").replace("#", "");
          const r = parseInt(h.substring(0, 2), 16) || 0;
          const g = parseInt(h.substring(2, 4), 16) || 0;
          const b = parseInt(h.substring(4, 6), 16) || 0;
          return `rgba(${r},${g},${b},${opacity})`;
        };
        const bgOpacity = typeof style.bgOpacity === "number" ? style.bgOpacity : 1;
        const borderOpacity = typeof style.borderOpacity === "number" ? style.borderOpacity : 1;

        const btnStyles = [];
        btnStyles.push(`background-color: ${hexToRgba(style.bgColor || "#00d9ff", bgOpacity)}`);
        if (style.textColor) btnStyles.push(`color: ${style.textColor}`);
        const bw = style.borderWidth ?? 2;
        btnStyles.push(`border: ${bw}px solid ${hexToRgba(style.borderColor || "#00d9ff", borderOpacity)}`);
        if (style.borderRadius != null) btnStyles.push(`border-radius: ${style.borderRadius}px`);
        const styleAttr = btnStyles.length ? ` style="${btnStyles.join(";")}"` : "";

        const isImage = /\.(png|jpe?g|webp|gif|svg)$/i.test(icon);
        const iconSrc = isImage ? resolveAssetUrl(icon) : "";
        const iconHtml = isImage
          ? `<img src="${iconSrc}" alt="${text}" />`
          : `<span class="pb-social-icon-text">${icon}</span>`;
        return `
          <a href="${url}" class="pb-social-btn"${styleAttr} target="_blank" rel="noopener noreferrer">
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

    const inputClass = style.inputStyle === "flat" ? "pb-email-input--flat" : "pb-email-input--bubble";
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
    const showPanels = config.showPanels !== false;
    const showComments = config.showComments !== false;
    return `
      <div class="pb-reader-mount"
           data-show-panels="${showPanels}"
           data-show-comments="${showComments}">
        <div class="pb-mount-placeholder">Reader Component (renders on live page)</div>
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
        <div class="pb-mount-placeholder">Entry Gallery (renders on live page)</div>
      </div>
    `;
  },

  feed: (config, mod) => {
    const limit = Number.isFinite(config.limit) ? config.limit : 5;
    const heading = escapeHtml(config.heading || "BWC FEED");
    const author = escapeHtml(config.author || "DOYLE MELVILLE II");
    const showAuthor = config.showAuthor !== false;
    const showDropdown = config.showDropdown !== false;
    const feedLabel = escapeHtml(config.feedLabel || "Open feed");
    const feedHref = escapeHtml(config.feedHref || "feed.html");
    const showMediaButton = config.showMediaButton !== false;
    const mediaLabel = escapeHtml(config.mediaLabel || "Media");
    const mediaHref = escapeHtml(config.mediaHref || "media.html");
    const moduleId = escapeHtml(mod?.id ? String(mod.id) : `feed-${Math.random().toString(36).slice(2, 9)}`);
    const panelId = `pb-feed-panel-${moduleId}`;

    return `
      <div class="pb-feed-module"
           data-feed-limit="${limit}"
           data-show-dropdown="${showDropdown}"
           data-show-media="${showMediaButton}"
           data-feed-href="${feedHref}"
           data-feed-label="${feedLabel}"
           data-media-href="${mediaHref}"
           data-media-label="${mediaLabel}">
        <div class="right-panel-feed-bar pb-feed-bar" aria-hidden="true">
          <button class="feed-exit-btn pb-feed-exit" type="button" aria-label="Close feed">\u00D7</button>
          <div class="latest-actions">
            <a class="latest-link latest-link--left pb-feed-link" href="${feedHref}">${feedLabel}</a>
            ${showMediaButton ? `<a class="latest-link latest-link--right pb-feed-media" href="${mediaHref}">${mediaLabel}</a>` : ""}
          </div>
        </div>
        <div class="latest-update pb-feed-latest">
          <div class="latest-heading-row">
            <button class="latest-heading pb-feed-toggle" type="button"
              aria-expanded="false" aria-controls="${panelId}">${heading}</button>
            ${showAuthor ? `<div class="latest-author">${author}</div>` : ""}
          </div>
          <div class="latest-body pb-feed-latest-body">
            <div class="latest-loading">Latest update preview</div>
          </div>
        </div>
        <div class="latest-update right-panel-feed pb-feed-panel" id="${panelId}" aria-hidden="true">
          <div class="latest-body pb-feed-body">
            <div class="latest-loading">Feed preview</div>
          </div>
        </div>
      </div>
    `;
  },

  html: (config) => {
    const code = config.code || "";
    return `<div class="pb-html">${code}</div>`;
  },

  promo: (config) =>
    renderPromoModule(config, {
      escapeHtml,
      resolveImageUrl: resolveAssetUrl,
    }),
};

export function renderPreviewModule(mod) {
  const type = mod.moduleType || "text";
  const config = mod.config || {};
  const renderer = PREVIEW_RENDERERS[type];
  if (!renderer) {
    return `<div class="pb-module pb-module--unknown">[Unknown: ${type}]</div>`;
  }
  const moduleIdAttr = mod?.id ? ` data-module-id="${mod.id}"` : "";
  return `<div class="pb-module pb-module--${type}"${moduleIdAttr}>${renderer(config, mod)}</div>`;
}

export function renderPreviewSection(section) {
  const layout = section.layout || "1";
  const columnCount = layout.split("-").length;
  const settings = section.settings || {};

  let style = "";
  if (settings.backgroundColor) style += `background-color: ${settings.backgroundColor};`;
  if (settings.paddingTop) style += `padding-top: ${settings.paddingTop}px;`;
  if (settings.paddingBottom) style += `padding-bottom: ${settings.paddingBottom}px;`;
  if (settings.moduleGap !== undefined && settings.moduleGap !== null) {
    style += `--pb-module-gap: ${Number(settings.moduleGap)}px;`;
  }
  if (settings.columnGap !== undefined && settings.columnGap !== null) {
    style += `--pb-column-gap: ${Number(settings.columnGap)}px;`;
  }
  if (settings.sectionGap !== undefined && settings.sectionGap !== null) {
    style += `--pb-section-gap: ${Number(settings.sectionGap)}px;`;
  }

  const columnModules = {};
  for (let i = 0; i < columnCount; i++) columnModules[i] = [];
  for (const mod of section.modules || []) {
    const colIdx = mod.columnIndex || 0;
    if (!columnModules[colIdx]) columnModules[colIdx] = [];
    columnModules[colIdx].push(mod);
  }

  const columnsHtml = Object.keys(columnModules)
    .sort((a, b) => Number(a) - Number(b))
    .map((colIdx) => {
      const modules = columnModules[colIdx];
      const modulesHtml = modules.map((mod) => renderPreviewModule(mod)).join("");
      return `<div class="pb-column">${modulesHtml}</div>`;
    })
    .join("");

  return `
    <section class="pb-section" data-layout="${layout}" style="${style}">
      <div class="pb-section-columns pb-layout--${layout}">${columnsHtml}</div>
    </section>
  `;
}

export function renderPreviewPage(page) {
  if (!page?.sections) return '<div class="pb-page-empty">No sections configured</div>';
  const sectionsHtml = page.sections.map((s) => renderPreviewSection(s)).join("");
  return `<div class="pb-page">${sectionsHtml}</div>`;
}

export function initPreviewEmailForms(container) {
  container.querySelectorAll("[data-email-signup]").forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const status = form.parentElement.querySelector(".pb-email-status");
      if (status) status.textContent = "Form works! (Preview mode - not submitted)";
    });
  });
}

export function initPreviewPromoCarousels(container) {
  container.querySelectorAll(".pb-promo[data-item-count]").forEach((promo) => {
    const itemCount = parseInt(promo.dataset.itemCount, 10);
    if (itemCount <= 1) return;

    const autoRotate = promo.dataset.autoRotate === "true";
    const interval = parseInt(promo.dataset.interval, 10) || 5000;
    const slides = promo.querySelectorAll(".pb-promo-slide");
    const indicators = promo.querySelectorAll(".pb-promo-indicator");
    const prevBtn = promo.querySelector(".pb-promo-nav--prev");
    const nextBtn = promo.querySelector(".pb-promo-nav--next");

    let currentIndex = 0;
    let timer = null;

    function showSlide(index) {
      currentIndex = (index + itemCount) % itemCount;
      slides.forEach((s, i) => s.classList.toggle("active", i === currentIndex));
      indicators.forEach((ind, i) => ind.classList.toggle("active", i === currentIndex));
    }

    function startTimer() {
      if (autoRotate) {
        stopTimer();
        timer = setInterval(() => showSlide(currentIndex + 1), interval);
      }
    }

    function stopTimer() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    prevBtn?.addEventListener("click", () => {
      showSlide(currentIndex - 1);
      startTimer();
    });
    nextBtn?.addEventListener("click", () => {
      showSlide(currentIndex + 1);
      startTimer();
    });
    indicators.forEach((ind) => {
      ind.addEventListener("click", () => {
        showSlide(parseInt(ind.dataset.index, 10));
        startTimer();
      });
    });
    promo.addEventListener("mouseenter", stopTimer);
    promo.addEventListener("mouseleave", startTimer);
    startTimer();
  });
}

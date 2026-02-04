function clampOpacity(value, fallback = 1) {
  const num = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(1, Math.max(0, num));
}

function hexToRgba(color, opacity) {
  if (!color || color === "transparent") return "transparent";
  if (!color.startsWith("#")) return color;
  const hex = color.replace("#", "");
  const normalized = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (normalized.length !== 6) return color;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function defaultEscape(value) {
  if (!value) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderPromoModule(config = {}, options = {}) {
  const items = config.items || [];
  if (items.length === 0) {
    return '<div class="pb-promo pb-promo--empty">No promos configured</div>';
  }

  const escapeHtml = options.escapeHtml || defaultEscape;
  const resolveImageUrl = options.resolveImageUrl || ((path) => path || "");

  const height = config.height || 400;
  const showNav = config.showNavigation !== false;
  const showIndicators = config.showIndicators !== false;
  const autoRotate = config.autoRotate !== false;
  const interval = config.interval || 5000;
  const transition = config.transition || "fade";

  const hasBlurBackground = items.some((item) => Boolean(item?.style?.backgroundBlur));

  const slidesHtml = items.map((item, index) => {
    const style = item.style || {};
    const isOverlay = item.textPosition === "overlay";

    const slideStyles = [];
    const bgOpacity = clampOpacity(style.backgroundOpacity, 0.6);
    const bgColor = style.backgroundColor || "transparent";
    const blurBackground = Boolean(style.backgroundBlur);
    const bgBaseColor = bgColor === "transparent" ? "#000000" : bgColor;
    const bgRgba = hexToRgba(bgBaseColor, bgOpacity);
    slideStyles.push(`--promo-bg-rgba: ${bgRgba}`);
    slideStyles.push(`--promo-overlay-rgba: ${bgRgba}`);

    const imageStyles = [];
    const frameStyles = [];
    const fit = item.imageFit === "contain" ? "contain" : "cover";
    const objectFit = fit === "contain" ? "contain" : "cover";
    if (style.imageBorder) {
      const borderColor = style.imageBorderColor || "#00d9ff";
      if (fit === "contain") {
        imageStyles.push(`border: 2px solid ${borderColor}`);
      } else {
        frameStyles.push(`border: 2px solid ${borderColor}`);
      }
    }
    if (style.imageGlow) {
      const glowColor = style.imageGlowColor || "#00d9ff";
      const intensity = style.imageGlowIntensity || 0.5;
      const glowValue = `0 0 ${20 * intensity}px ${glowColor}, 0 0 ${40 * intensity}px ${glowColor}`;
      if (fit === "contain") {
        imageStyles.push(`box-shadow: ${glowValue}`);
      } else {
        frameStyles.push(`box-shadow: ${glowValue}`);
      }
    }
    imageStyles.push(`object-fit: ${objectFit}`);
    imageStyles.push(`object-position: center`);

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

    const imageSrc = escapeHtml(resolveImageUrl(item.image || ""));
    const topText = item.topText
      ? `<div class="pb-promo-top-text" style="${topTextStyles.join(";")}">${escapeHtml(item.topText)}</div>`
      : "";
    const bottomText = item.bottomText
      ? `<div class="pb-promo-bottom-text" style="${bottomTextStyles.join(";")}">${item.bottomText}</div>`
      : "";

    const rawLink = item.linkUrl || "";
    const linkUrl = escapeHtml(rawLink);
    const imageFrame = imageSrc
      ? `<div class="pb-promo-image-frame" data-fit="${fit}"${frameStyles.length ? ` style="${frameStyles.join(";")}"` : ""}>
           <img src="${imageSrc}" alt="" loading="lazy" data-fit="${fit}" style="${imageStyles.join(";")}" class="pb-promo-img" />
         </div>`
      : '<div class="pb-promo-no-image"></div>';
    const imageHtml = imageSrc && linkUrl
      ? `<a class="pb-promo-image-link" href="${linkUrl}">${imageFrame}</a>`
      : imageFrame;

    const previewHtml = imageSrc && !isOverlay
      ? `<div class="pb-promo-preview">
           ${imageHtml}
         </div>`
      : imageHtml;

    const slideClasses = [
      "pb-promo-slide",
      index === 0 ? "active" : "",
      blurBackground ? "pb-promo-slide--bg-blur" : "",
    ]
      .filter(Boolean)
      .join(" ");

    if (isOverlay) {
      return `
        <div class="${slideClasses}" data-index="${index}" style="${slideStyles.join(";")}">
          <div class="pb-promo-image-container">
            ${previewHtml}
            <div class="pb-promo-overlay">
              ${topText}
              ${bottomText}
            </div>
          </div>
        </div>
      `;
    }
    return `
      <div class="${slideClasses} pb-promo-slide--outside" data-index="${index}" style="${slideStyles.join(";")}">
        ${item.topText ? `<div class="pb-promo-top-text left-panel-text-top" style="${topTextStyles.join(";")}">${escapeHtml(item.topText)}</div>` : ""}
        <div class="pb-promo-image-container">
          ${previewHtml}
        </div>
        ${item.bottomText ? `<div class="pb-promo-bottom-text left-panel-text-bottom" style="${bottomTextStyles.join(";")}">${item.bottomText}</div>` : ""}
      </div>
    `;
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

  const hasOutside = items.some((item) => item.textPosition === "outside");

  return `
    <div class="pb-promo pb-promo--${transition}" data-bg-blur="${hasBlurBackground}" data-show-indicators="${showIndicators && items.length > 1}"
         data-has-outside="${hasOutside}"
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
}

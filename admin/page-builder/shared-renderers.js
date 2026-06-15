/**
 * Shared page builder module renderers.
 *
 * This is the single source of truth for module HTML output. Both the public
 * reader (reader/page-renderer.js) and the admin preview
 * (admin/page-builder/preview-renderers.js) call createRenderers() with
 * caller-appropriate options instead of maintaining two parallel
 * implementations.
 *
 * @param {Object}                   [options]
 * @param {function(string): string} [options.resolveImageUrl]       - Asset URL resolver
 * @param {function(): string}       [options.getSeriesId]            - Returns current series ID
 * @param {boolean}                  [options.showMountPlaceholders]  - Show text placeholders for
 *                                                                      dynamically-mounted modules
 *                                                                      (reader, entry-gallery)
 * @param {boolean}                  [options.builderEditing]         - Emit admin-only target
 *                                                                      markers for live builder
 *                                                                      editing sessions
 * @param {'desktop'|'tablet'|'mobile'} [options.deviceId]            - Active builder device
 *                                                                      context for sparse
 *                                                                      responsive overrides
 */

import { escapeAttr, escapeHtml } from './helpers.js';
import { renderPromoModule } from './promo-renderer.js';
import {
  normalizeButtonsConfig,
  resolveLinkTargetHref,
  shouldOpenLinkInNewTab,
} from './link-utils.js';
import { appearanceToInlineStyle, mergeAppearance } from './appearance-utils.js';
import {
  getEffectiveModuleConfig,
  getEffectiveSectionLayout,
  getEffectiveSectionSettings,
  isModuleHiddenForDevice,
} from './responsive-overrides.js';
import { getReaderMountDataAttributes } from './reader-config.js';
import {
  sanitizeAssetUrl,
  sanitizeBuilderHtml,
  sanitizeColor,
  sanitizeHref,
  sanitizeKeyword,
  sanitizeNumber,
  sanitizeVideoUrl,
} from './sanitize.js';

export function createRenderers({
  resolveImageUrl = /** @type {function(string): string} */ ((path) => path),
  getSeriesId = /** @type {function(): string} */ (() => ''),
  showMountPlaceholders = false,
  builderEditing = false,
} = {}) {
  function isBuilderEditingEnabled(renderOptions = {}) {
    return renderOptions.builderEditing === undefined
      ? !!builderEditing
      : renderOptions.builderEditing === true;
  }

  function builderMarkerAttrs(attrs = {}, enabled = false) {
    if (!enabled) return '';
    return Object.entries(attrs)
      .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
      .map(([key, value]) => ` ${key}="${escapeHtml(String(value))}"`)
      .join('');
  }

  function resolveModuleImageUrl(path) {
    const raw = sanitizeAssetUrl(path || '');
    if (!raw) return '';
    return resolveImageUrl(raw);
  }

  function normalizeSourceConfig(config = {}) {
    const source = config?.source && typeof config.source === 'object' ? config.source : {};
    const mode = String(source.mode || '').trim();
    const safeSource = {
      mode,
    };
    if (source.seriesId) safeSource.seriesId = String(source.seriesId || '').trim();
    if (source.filters && typeof source.filters === 'object') safeSource.filters = source.filters;
    if (source.sort) safeSource.sort = String(source.sort || '').trim();
    if (source.limit !== undefined) safeSource.limit = source.limit;
    return safeSource;
  }

  function sourceAttrs(config = {}) {
    const source = normalizeSourceConfig(config);
    const json = escapeHtml(JSON.stringify(source));
    return ` data-source-mode="${escapeHtml(source.mode || '')}" data-source-series-id="${escapeHtml(source.seriesId || '')}" data-source-config="${json}"`;
  }

  function dataAttrs(attrs = {}) {
    return Object.entries(attrs)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => ` ${key}="${escapeAttr(String(value))}"`)
      .join('');
  }

  const MODULE_RENDERERS = {
    header: (config) => {
      const title = escapeHtml(config.title || '');
      const subtitle = escapeHtml(config.subtitle || '');
      return `
        <header class="pb-header">
          <h1 class="pb-header-title">${title}</h1>
          ${subtitle ? `<p class="pb-header-subtitle">${subtitle}</p>` : ''}
        </header>
      `;
    },

    text: (config, _mod, renderOptions = {}) => {
      const content = sanitizeBuilderHtml(config.content || '', 'text');
      const alignment = sanitizeKeyword(config.alignment, ['left', 'center', 'right'], 'left');
      const editAttrs = builderMarkerAttrs(
        { 'data-builder-edit-field': 'content' },
        isBuilderEditingEnabled(renderOptions)
      );
      return `<div class="pb-text"${editAttrs} style="text-align: ${alignment};">${content}</div>`;
    },

    image: (config) => {
      const src = escapeHtml(resolveModuleImageUrl(config.src || ''));
      const alt = escapeHtml(config.alt || '');
      const caption = escapeHtml(config.caption || '');
      if (!src) return '<div class="pb-image pb-image--empty">No image set</div>';
      return `
        <figure class="pb-image">
          <img src="${src}" alt="${alt}" loading="lazy" />
          ${caption ? `<figcaption>${caption}</figcaption>` : ''}
        </figure>
      `;
    },

    gallery: (config) => {
      const images = config.images || [];
      const columns = sanitizeNumber(config.columns, 3, 1, 6);
      if (images.length === 0) {
        return '<div class="pb-gallery pb-gallery--empty">No images in gallery</div>';
      }
      const imagesHtml = images
        .map((img) => {
          const src = escapeHtml(resolveModuleImageUrl(img.src || img));
          const alt = escapeHtml(img.alt || '');
          return `<div class="pb-gallery-item"><img src="${src}" alt="${alt}" loading="lazy" /></div>`;
        })
        .join('');
      return `<div class="pb-gallery" style="--gallery-columns: ${columns};">${imagesHtml}</div>`;
    },

    video: (config) => {
      const url = sanitizeVideoUrl(config.url || '');
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
          const rawIcon = String(btn.icon || '');
          const icon = escapeHtml(rawIcon);
          const text = escapeHtml(btn.text || '');
          const url = escapeHtml(sanitizeHref(btn.url || '') || '#');
          const style = btn.style || {};

          const hexToRgba = (hex, opacity) => {
            const h = (hex || '#000000').replace('#', '');
            const r = parseInt(h.substring(0, 2), 16) || 0;
            const g = parseInt(h.substring(2, 4), 16) || 0;
            const b = parseInt(h.substring(4, 6), 16) || 0;
            return `rgba(${r},${g},${b},${opacity})`;
          };
          const bgOpacity = sanitizeNumber(style.bgOpacity, 1, 0, 1);
          const borderOpacity = sanitizeNumber(style.borderOpacity, 1, 0, 1);

          const btnStyles = [];
          btnStyles.push(
            `background-color: ${hexToRgba(sanitizeColor(style.bgColor, '#00d9ff'), bgOpacity)}`
          );
          const textColor = sanitizeColor(style.textColor);
          if (textColor) btnStyles.push(`color: ${textColor}`);
          const bw = sanitizeNumber(style.borderWidth, 2, 0, 10);
          btnStyles.push(
            `border: ${bw}px solid ${hexToRgba(sanitizeColor(style.borderColor, '#00d9ff'), borderOpacity)}`
          );
          if (style.borderRadius != null) {
            btnStyles.push(`border-radius: ${sanitizeNumber(style.borderRadius, 8, 0, 80)}px`);
          }
          const styleAttr = btnStyles.length ? ` style="${btnStyles.join(';')}"` : '';

          const isImage = /\.(png|jpe?g|webp|gif|svg)$/i.test(rawIcon);
          const iconHtml = isImage
            ? `<img src="${escapeHtml(resolveModuleImageUrl(rawIcon))}" alt="${text}" />`
            : `<span class="pb-social-icon-text">${icon}</span>`;
          return `
            <a href="${url}" class="pb-social-btn"${styleAttr} target="_blank" rel="noopener noreferrer">
              <span class="pb-social-icon">${iconHtml}</span>
              <span class="pb-social-text">${text}</span>
            </a>
          `;
        })
        .join('');
      return `<div class="pb-social">${buttonsHtml}</div>`;
    },

    'email-signup': (config) => {
      const heading = escapeHtml(config.heading || 'Join the List');
      const subtext = escapeHtml(config.subtext || '');
      const placeholder = escapeHtml(config.placeholder || 'your@email.com');
      const buttonText = escapeHtml(config.buttonText || 'Subscribe');
      const style = config.style || {};

      const headingStyles = [];
      headingStyles.push(`color: ${sanitizeColor(style.headingColor, '#ffffff')}`);
      if (style.headingFont === 'display') {
        headingStyles.push('font-family: "Bebas Neue", sans-serif');
      } else if (style.headingFont === 'mono') {
        headingStyles.push('font-family: "JetBrains Mono", monospace');
      }
      if (style.headingGlow) {
        const glowColor = sanitizeColor(style.headingColor, '#ffffff');
        headingStyles.push(`text-shadow: 0 0 10px ${glowColor}, 0 0 20px ${glowColor}`);
      }

      const inputClass =
        style.inputStyle === 'flat' ? 'pb-email-input--flat' : 'pb-email-input--bubble';
      const buttonColor = sanitizeColor(style.buttonColor, '#00d9ff');
      const buttonStyles = [`--btn-color: ${buttonColor}`];
      const buttonClass = style.buttonGlow ? 'pb-email-btn--glow' : '';

      return `
        <div class="email-signup-section pb-email-signup-styled">
          <div class="email-signup-label" style="${headingStyles.join(';')}">${heading}</div>
          ${subtext ? `<div class="email-signup-cta">${subtext}</div>` : ''}
          <form class="email-signup-form" data-email-signup>
            <input type="email" class="email-input ${inputClass}" placeholder="${placeholder}" required />
            <button type="submit" class="email-submit-btn ${buttonClass}" style="${buttonStyles.join(';')}">${buttonText}</button>
          </form>
          <div class="email-form-message pb-email-status"></div>
        </div>
      `;
    },

    buttons: (config) => {
      const normalized = normalizeButtonsConfig(config);
      if (normalized.buttons.length === 0) {
        return '<div class="pb-buttons pb-buttons--empty">No buttons configured</div>';
      }
      const seriesId = getSeriesId();
      const defaultsAppearance = normalized.defaults?.appearance || null;
      const buttonsHtml = normalized.buttons
        .map((btn) => {
          if (btn.enabled === false) return '';
          const text = escapeHtml(btn.text || 'Button');
          const href = escapeHtml(resolveLinkTargetHref(btn.link || btn.url, { seriesId }));
          const style = sanitizeKeyword(btn.style, ['primary', 'secondary'], 'primary');
          const target = shouldOpenLinkInNewTab(btn.link || btn.url)
            ? 'target="_blank" rel="noopener noreferrer"'
            : '';
          const inlineStyle = appearanceToInlineStyle(
            mergeAppearance(defaultsAppearance, btn.appearance)
          );

          if (!inlineStyle) {
            return `<a href="${href}" class="pb-btn pb-btn--${style}" ${target}>${text}</a>`;
          }

          return `<a href="${href}" class="pb-btn pb-btn--${style}" style="${inlineStyle}" ${target}>${text}</a>`;
        })
        .filter(Boolean)
        .join('');
      return `<div class="pb-buttons">${buttonsHtml}</div>`;
    },

    spacer: (config) => {
      const height = sanitizeNumber(config.height, 40, 0, 600);
      return `<div class="pb-spacer" style="height: ${height}px;"></div>`;
    },

    divider: (config) => {
      const style = sanitizeKeyword(config.style, ['solid', 'dashed', 'dotted'], 'solid');
      const color = sanitizeColor(config.color);
      const colorStyle = color ? `border-color: ${escapeHtml(color)};` : '';
      return `<hr class="pb-divider pb-divider--${style}" style="${colorStyle}" />`;
    },

    reader: (config) => {
      const readerAttrs = getReaderMountDataAttributes(config);
      const inner = showMountPlaceholders
        ? '<div class="pb-mount-placeholder">Reader Component (renders on live page)</div>'
        : '<!-- Reader will be mounted here -->';
      return `
        <div class="pb-reader-mount"${dataAttrs(readerAttrs)}${sourceAttrs(config)}>
          ${inner}
        </div>
      `;
    },

    'entry-gallery': (config) => {
      const columns = sanitizeNumber(config.columns, 3, 1, 6);
      const showLabels = config.showLabels !== false;
      const inner = showMountPlaceholders
        ? '<div class="pb-mount-placeholder">Entry Gallery (renders on live page)</div>'
        : '<!-- Entry gallery will be mounted here -->';
      return `
        <div class="pb-entry-gallery-mount"
             data-columns="${columns}"
             data-show-labels="${showLabels}"${sourceAttrs(config)}>
          ${inner}
        </div>
      `;
    },

    feed: (config, mod) => {
      const limit = sanitizeNumber(config.limit, 5, 1, 25);
      const heading = escapeHtml(config.heading || 'BWC FEED');
      const author = escapeHtml(config.author || 'DOYLE MELVILLE II');
      const showAuthor = config.showAuthor !== false;
      const showDropdown = config.showDropdown !== false;
      const feedLabel = escapeHtml(config.feedLabel || 'Open feed');
      const feedHref = escapeHtml(sanitizeHref(config.feedHref || 'feed.html') || 'feed.html');
      const showMediaButton = config.showMediaButton !== false;
      const mediaLabel = escapeHtml(config.mediaLabel || 'Media');
      const mediaHref = escapeHtml(sanitizeHref(config.mediaHref || 'media.html') || 'media.html');
      const moduleId = escapeHtml(
        mod?.id ? String(mod.id) : `feed-${Math.random().toString(36).slice(2, 9)}`
      );
      const panelId = `pb-feed-panel-${moduleId}`;
      const style = config.style || {};

      const buttonBgColor = sanitizeColor(style.buttonBgColor, '#00d9ff');
      const buttonTextColor = sanitizeColor(style.buttonTextColor, '#0a0a12');
      const borderColor = sanitizeColor(style.borderColor, '#ffed00');
      const headingBgColor = sanitizeColor(style.headingBgColor, '#ffed00');
      const headingTextColor = sanitizeColor(style.headingTextColor, '#0a0a12');
      const authorColor = sanitizeColor(style.authorColor, '#7ef5e3');
      const safeStyle = {
        ...style,
        buttonBgColor,
        buttonTextColor,
        borderColor,
        headingBgColor,
        headingTextColor,
        authorColor,
      };
      const btnStyle = `background:${buttonBgColor};color:${buttonTextColor};border-color:${buttonBgColor}`;
      const loadingText = showMountPlaceholders ? 'Feed preview' : 'Loading...';
      const latestLoadingText = showMountPlaceholders ? 'Latest update preview' : 'Loading...';

      return `
        <div class="pb-feed-module"
             data-feed-limit="${limit}"
             data-show-dropdown="${showDropdown}"
             data-show-media="${showMediaButton}"
             data-feed-href="${feedHref}"
             data-feed-label="${feedLabel}"
             data-media-href="${mediaHref}"
             data-media-label="${mediaLabel}"
             data-feed-style="${escapeHtml(JSON.stringify(safeStyle))}"${sourceAttrs(config)}>
          <div class="right-panel-feed-bar pb-feed-bar" aria-hidden="true">
            <button class="feed-exit-btn pb-feed-exit" type="button" aria-label="Close feed">\u00D7</button>
            <div class="latest-actions">
              <a class="latest-link latest-link--left pb-feed-link" href="${feedHref}" style="${btnStyle}">${feedLabel}</a>
              ${showMediaButton ? `<a class="latest-link latest-link--right pb-feed-media" href="${mediaHref}" style="${btnStyle}">${mediaLabel}</a>` : ''}
            </div>
          </div>
          <div class="latest-update pb-feed-latest" style="border-color:${borderColor}">
            <div class="latest-heading-row">
              <button class="latest-heading pb-feed-toggle" type="button"
                aria-expanded="false" aria-controls="${panelId}"
                style="background:${headingBgColor};color:${headingTextColor}">${heading}</button>
              ${showAuthor ? `<div class="latest-author" style="color:${authorColor}">${author}</div>` : ''}
            </div>
            <div class="latest-body pb-feed-latest-body">
              <div class="latest-loading">${latestLoadingText}</div>
            </div>
          </div>
          <div class="latest-update right-panel-feed pb-feed-panel" id="${panelId}" aria-hidden="true"
               style="border-color:${borderColor}">
            <div class="latest-body pb-feed-body">
              <div class="latest-loading">${loadingText}</div>
            </div>
          </div>
        </div>
      `;
    },

    'media-gallery': (config) => {
      const columns = sanitizeNumber(config.columns, 3, 1, 6);
      const limit = sanitizeNumber(config.limit, 24, 1, 100);
      const showCaptions = config.showCaptions !== false;
      const includePremium = config.includePremium !== false;
      const inner = showMountPlaceholders
        ? '<div class="pb-mount-placeholder">Media Gallery (renders on live page)</div>'
        : '<!-- Media gallery will be mounted here -->';
      return `
        <div class="pb-media-gallery-mount"
             style="--media-gallery-columns: ${columns};"
             data-columns="${columns}"
             data-limit="${limit}"
             data-show-captions="${showCaptions}"
             data-include-premium="${includePremium}"${sourceAttrs(config)}>
          ${inner}
        </div>
      `;
    },

    html: (config) => {
      const code = sanitizeBuilderHtml(config.code || '', 'html');
      return `<div class="pb-html">${code}</div>`;
    },

    promo: (config) =>
      renderPromoModule(config, {
        escapeHtml,
        resolveImageUrl: resolveModuleImageUrl,
      }),
  };

  function renderModule(mod, renderOptions = {}) {
    const type = mod.moduleType || 'text';
    const safeType = String(type || 'text').replace(/[^a-z0-9_-]/gi, '') || 'unknown';
    const emitMarkers = isBuilderEditingEnabled(renderOptions);
    const hiddenOnDevice = isModuleHiddenForDevice(mod, {
      ...renderOptions,
      builderEditing: emitMarkers,
    });
    if (hiddenOnDevice && !emitMarkers) return '';
    const config = getEffectiveModuleConfig(mod, {
      ...renderOptions,
      builderEditing: emitMarkers,
    });
    const markerAttrs = builderMarkerAttrs(
      {
        'data-builder-module-id': mod?.id,
        'data-builder-module-type': type,
      },
      emitMarkers
    );
    const moduleIdAttr = mod?.id ? ` data-module-id="${escapeHtml(String(mod.id))}"` : '';

    const renderer = MODULE_RENDERERS[type];
    if (!renderer) {
      return `<div class="pb-module pb-module--unknown"${moduleIdAttr}${markerAttrs}>[Unknown module: ${escapeHtml(type)}]</div>`;
    }

    const hiddenClass = hiddenOnDevice ? ' pb-module--hidden-device' : '';
    const content = hiddenOnDevice
      ? '<div class="pb-module-hidden-placeholder">Hidden on this device</div>'
      : renderer(config, mod, { ...renderOptions, builderEditing: emitMarkers });
    return `<div class="pb-module pb-module--${safeType}${hiddenClass}"${moduleIdAttr}${markerAttrs}>${content}</div>`;
  }

  function renderSection(section, renderOptions = {}) {
    const emitMarkers = isBuilderEditingEnabled(renderOptions);
    const layout = sanitizeKeyword(
      getEffectiveSectionLayout(section, { ...renderOptions, builderEditing: emitMarkers }),
      ['1', '1-1', '1-2', '2-1', '1-1-1', '1-3-1'],
      '1'
    );
    const columnCount = layout.split('-').length;
    const settings = getEffectiveSectionSettings(section, {
      ...renderOptions,
      builderEditing: emitMarkers,
    });

    let style = '';
    const backgroundColor = sanitizeColor(settings.backgroundColor);
    const paddingTop = sanitizeNumber(settings.paddingTop, 0, 0, 600);
    const paddingBottom = sanitizeNumber(settings.paddingBottom, 0, 0, 600);
    if (backgroundColor) style += `background-color: ${backgroundColor};`;
    if (paddingTop) style += `padding-top: ${paddingTop}px;`;
    if (paddingBottom) style += `padding-bottom: ${paddingBottom}px;`;
    if (settings.moduleGap !== undefined && settings.moduleGap !== null) {
      style += `--pb-module-gap: ${sanitizeNumber(settings.moduleGap, 0, 0, 600)}px;`;
    }
    if (settings.columnGap !== undefined && settings.columnGap !== null) {
      style += `--pb-column-gap: ${sanitizeNumber(settings.columnGap, 0, 0, 600)}px;`;
    }
    if (settings.sectionGap !== undefined && settings.sectionGap !== null) {
      style += `--pb-section-gap: ${sanitizeNumber(settings.sectionGap, 0, 0, 600)}px;`;
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
        const modulesHtml = modules
          .map((mod) => renderModule(mod, { ...renderOptions, builderEditing: emitMarkers }))
          .join('');
        const columnMarkerAttrs = builderMarkerAttrs(
          {
            'data-builder-column-index': colIdx,
          },
          emitMarkers
        );
        return `<div class="pb-column"${columnMarkerAttrs}>${modulesHtml}</div>`;
      })
      .join('');

    const sectionMarkerAttrs = builderMarkerAttrs(
      {
        'data-builder-section-id': section?.id,
        'data-builder-section-index': renderOptions.sectionIndex,
        'data-builder-layout': layout,
      },
      emitMarkers
    );

    return `
      <section class="pb-section" data-layout="${layout}"${sectionMarkerAttrs} style="${style}">
        <div class="pb-section-columns pb-layout--${layout}">${columnsHtml}</div>
      </section>
    `;
  }

  function renderPage(page, renderOptions = {}) {
    if (!page?.sections) {
      return '<div class="pb-page-empty">No sections configured</div>';
    }
    const emitMarkers = isBuilderEditingEnabled(renderOptions);
    const sectionsHtml = page.sections
      .map((section, sectionIndex) =>
        renderSection(section, { ...renderOptions, builderEditing: emitMarkers, sectionIndex })
      )
      .join('');
    const pageMarkerAttrs = builderMarkerAttrs(
      {
        'data-builder-page-id': page?.id,
      },
      emitMarkers
    );
    return `<div class="pb-page"${pageMarkerAttrs}>${sectionsHtml}</div>`;
  }

  return { MODULE_RENDERERS, renderModule, renderSection, renderPage };
}

/**
 * Public responsive CSS emission for builder sections.
 *
 * The admin live preview applies device overrides by JS-merging the active
 * device branch (see responsive-overrides.js) because it simulates one device at
 * a time. The public runtime renders at real dimensions, so device overrides are
 * emitted as aspect-ratio and width media bands.
 *
 * Each device branch is applied independently onto the global base (mirroring the
 * builder's single-branch merge). Generated declarations use !important so they
 * win over the base inline styles the renderer emits on each element.
 */

import { appearanceToInlineStyle, normalizeAppearance } from './appearance-utils.js';
import { alignmentToAlignSelf, alignmentToJustifySelf } from './layout-utils.js';
import {
  getEffectiveColumnSettings,
  getResponsiveBranch,
  resolveEffectiveColumnLayout,
} from './responsive-overrides.js';
import { normalizeReaderResponsiveBranch } from './reader-config.js';
import { sanitizeColor, sanitizeNumber } from './sanitize.js';

// The original shell contract is ratio-driven: portrait/stacked viewports use Tablet or
// Phone branches, while rotation past 7/5 returns to Desktop layout. Tablet and Phone are
// separated only by the established 480px width boundary. Rules are emitted in this order
// so the later portrait branch wins at the exact 7/5 boundary.
const DEVICE_MEDIA = Object.freeze({
  desktop: '(min-aspect-ratio: 7/5)',
  tablet: '(max-aspect-ratio: 7/5) and (min-width: 481px)',
  mobile: '(max-aspect-ratio: 7/5) and (max-width: 480px)',
});
const DEVICE_ORDER = ['desktop', 'tablet', 'mobile'];

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function important(declarations) {
  return declarations
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `${part} !important`)
    .join('; ');
}

function deviceRules(device, rules) {
  return `@media ${DEVICE_MEDIA[device]} { ${rules.join(' ')} }`;
}

function sectionDeclarations(branch) {
  const decls = [];
  const backgroundColor = sanitizeColor(branch.backgroundColor);
  if (backgroundColor) decls.push(`background-color: ${backgroundColor}`);
  if (branch.paddingTop !== undefined && branch.paddingTop !== null) {
    decls.push(`padding-top: ${sanitizeNumber(branch.paddingTop, 0, 0, 600)}px`);
  }
  if (branch.paddingBottom !== undefined && branch.paddingBottom !== null) {
    decls.push(`padding-bottom: ${sanitizeNumber(branch.paddingBottom, 0, 0, 600)}px`);
  }
  ['moduleGap', 'columnGap', 'sectionGap'].forEach((key) => {
    if (branch[key] === undefined || branch[key] === null) return;
    const cssVar = `--pb-${key.replace('Gap', '')}-gap`;
    decls.push(`${cssVar}: ${sanitizeNumber(branch[key], 0, 0, 600)}px`);
  });
  if (branch.minHeight !== undefined && branch.minHeight !== null && branch.minHeight !== '') {
    decls.push(`min-height: ${sanitizeNumber(branch.minHeight, 0, 0, 2000)}px`);
  }
  return decls;
}

function columnDeclarations(
  branch,
  { visibleDisplay = 'block', alignmentProperty = 'justify-self', includeAppearance = true } = {}
) {
  const decls = [];
  if (Object.prototype.hasOwnProperty.call(branch, 'hidden')) {
    decls.push(branch.hidden === true ? 'display: none' : `display: ${visibleDisplay}`);
  }
  const appearanceStyle = includeAppearance ? appearanceToInlineStyle(branch.appearance) : '';
  if (appearanceStyle) decls.push(appearanceStyle);
  const padding = branch.padding;
  if (isPlainObject(padding)) {
    ['top', 'right', 'bottom', 'left'].forEach((side) => {
      if (padding[side] !== undefined && padding[side] !== null) {
        decls.push(`padding-${side}: ${sanitizeNumber(padding[side], 0, 0, 600)}px`);
      }
    });
  }
  if (branch.alignment) {
    const value =
      alignmentProperty === 'align-self'
        ? alignmentToAlignSelf(branch.alignment)
        : alignmentToJustifySelf(branch.alignment);
    decls.push(`${alignmentProperty}: ${value}`);
  }
  if (branch.minHeight !== undefined && branch.minHeight !== null) {
    decls.push(`min-height: ${sanitizeNumber(branch.minHeight, 0, 0, 2000)}px`);
  }
  return decls;
}

/**
 * Returns true when a section has any device override worth emitting CSS for.
 */
export function sectionHasResponsiveOverrides(section) {
  const settings = section?.settings || {};
  const responsive = settings.responsive;
  if (isPlainObject(responsive)) {
    if (DEVICE_ORDER.some((device) => isPlainObject(responsive[device]))) return true;
  }
  const columns = Array.isArray(settings.columns) ? settings.columns : [];
  return columns.some(
    (column) =>
      isPlainObject(column?.responsive) &&
      DEVICE_ORDER.some((device) => isPlainObject(column.responsive[device]))
  );
}

/**
 * Build media-scoped CSS for a section's device overrides.
 *
 * @param {Object} section            - Builder section record
 * @param {string} scopeSelector      - CSS selector that targets this section
 * @returns {string} CSS text (no <style> wrapper), or '' when nothing to emit.
 */
export function buildSectionResponsiveCss(section, scopeSelector) {
  const settings = section?.settings || {};
  const sectionResponsive = isPlainObject(settings.responsive) ? settings.responsive : {};
  const columns = Array.isArray(settings.columns) ? settings.columns : [];
  const blocks = [];

  DEVICE_ORDER.forEach((device) => {
    const rules = [];
    const sectionBranch = sectionResponsive[device];
    const effectiveLayout = resolveEffectiveColumnLayout(section, {
      deviceId: device,
      resolveResponsive: true,
    });
    const hasColumnOverrides = columns.some(
      (column) => Object.keys(getResponsiveBranch(column, device)).length > 0
    );
    if (isPlainObject(sectionBranch)) {
      const decls = sectionDeclarations(sectionBranch);
      if (decls.length) {
        rules.push(`${scopeSelector} { ${important(decls.join('; '))}; }`);
      }
    }
    if (isPlainObject(sectionBranch) || hasColumnOverrides) {
      rules.push(
        `${scopeSelector} .pb-section-columns { ` +
          `grid-template-columns: ${effectiveLayout.gridTemplate} !important; }`
      );
    }

    columns.forEach((column) => {
      const branch = column?.responsive?.[device];
      if (!isPlainObject(branch)) return;
      const index = Number(column.index);
      if (!Number.isInteger(index) || index < 0) return;
      const effectiveColumn = effectiveLayout.columns.find((item) => item.index === index);
      const decls = columnDeclarations(effectiveColumn?.settings || {});
      if (!decls.length) return;
      const columnSelector = `${scopeSelector} .pb-column:nth-child(${index + 1})`;
      rules.push(`${columnSelector} { ${important(decls.join('; '))}; }`);
    });

    if (rules.length) {
      blocks.push(deviceRules(device, rules));
    }
  });

  return blocks.join('\n');
}

/**
 * Build media-scoped CSS for a single panel column's device overrides.
 *
 * Reader panels render through a flex wrapper rather than the section grid, so this
 * mirrors buildSectionResponsiveCss for one column but (a) targets the panel wrapper
 * selector directly and (b) emits `display: flex` (not block) when a device override
 * makes a hidden column visible again, so module stacking/gap survive the override.
 * Appearance (background/border/text) styles the panel's `<aside>` shell, not the inner
 * wrapper — mirroring the inline path — so those declarations are scoped to
 * `shellSelector` while layout declarations stay on `wrapperSelector`.
 *
 * @param {Object} section        - Builder section that owns the panel (the reader section)
 * @param {number} columnIndex    - The panel's structural column index (0 = left, last = right)
 * @param {Object} selectors      - { wrapperSelector, shellSelector }
 * @returns {string} CSS text (no <style> wrapper), or '' when nothing to emit.
 */
export function buildPanelResponsiveCss(section, columnIndex, { wrapperSelector, shellSelector }) {
  const index = Number(columnIndex);
  const column = (section?.settings?.columns || []).find((col) => Number(col?.index) === index);
  if (!isPlainObject(column)) return '';
  const blocks = [];

  DEVICE_ORDER.forEach((device) => {
    const branch = column?.responsive?.[device];
    if (!isPlainObject(branch)) return;
    const effectiveLayout = resolveEffectiveColumnLayout(section, {
      deviceId: device,
      resolveResponsive: true,
    });
    const effectiveColumn = effectiveLayout.columns.find((item) => item.index === index);
    const wrapperDecls = columnDeclarations(effectiveColumn?.settings || {}, {
      visibleDisplay: 'flex',
      alignmentProperty: 'align-self',
      includeAppearance: false,
    });
    const shellStyle = shellSelector
      ? appearanceToInlineStyle(effectiveColumn?.settings?.appearance)
      : '';
    const rules = [];
    if (wrapperDecls.length) {
      rules.push(`${wrapperSelector} { ${important(wrapperDecls.join('; '))}; }`);
    }
    if (shellStyle) {
      rules.push(`${shellSelector} { ${important(shellStyle)}; }`);
    }
    // A responsive Hidden override must collapse the visible `<aside>` shell too. Hiding
    // only the inner wrapper leaves an empty rail in the reader layout.
    if (shellSelector && Object.prototype.hasOwnProperty.call(branch, 'hidden')) {
      rules.push(
        `${shellSelector} { display: ${branch.hidden === true ? 'none' : 'flex'} !important; }`
      );
    }
    if (!rules.length) return;
    blocks.push(deviceRules(device, rules));
  });

  return blocks.join('\n');
}

function readerControlVarDeclarations(appearance, prefix) {
  const styleText = appearanceToInlineStyle(appearance);
  if (!styleText) return [];
  const vars = {
    background: `${prefix}-bg`,
    color: `${prefix}-color`,
    border: `${prefix}-border`,
    'border-width': `${prefix}-border-width`,
    'border-style': `${prefix}-border-style`,
    'border-color': `${prefix}-border-color`,
    'border-radius': `${prefix}-border-radius`,
    'font-size': `${prefix}-font-size`,
    'font-weight': `${prefix}-font-weight`,
    'text-transform': `${prefix}-text-transform`,
  };
  return styleText
    .split(';')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const separator = token.indexOf(':');
      if (separator === -1) return '';
      const property = token.slice(0, separator).trim();
      const value = token.slice(separator + 1).trim();
      return vars[property] && value ? `${vars[property]}: ${value}` : '';
    })
    .filter(Boolean);
}

/**
 * Emit public media rules for the focused reader-control responsive scope.
 * The live builder merges this same sparse branch before calling the reader runtime.
 */
export function buildReaderControlsResponsiveCss(readerModule, controlsSelector = '#controls') {
  const responsive = readerModule?.config?.responsive;
  if (!isPlainObject(responsive)) return '';
  const blocks = [];
  DEVICE_ORDER.forEach((device) => {
    const branch = normalizeReaderResponsiveBranch(responsive[device]);
    const style = branch?.controls?.style;
    if (!isPlainObject(style)) return;
    const declarations = [
      ...readerControlVarDeclarations(style.defaults?.appearance, '--reader-control'),
      ...readerControlVarDeclarations(style.primary?.appearance, '--reader-primary-control'),
    ];
    if (style.defaults?.padding != null) {
      declarations.push(
        `--reader-control-padding-x: ${sanitizeNumber(style.defaults.padding, 0, 0, 48)}px`
      );
    }
    const barStyle = appearanceToInlineStyle(style.bar?.appearance);
    if (barStyle) declarations.push(barStyle);
    if (declarations.length) {
      blocks.push(
        deviceRules(device, [`${controlsSelector} { ${important(declarations.join('; '))}; }`])
      );
    }
  });
  return blocks.join('\n');
}

/**
 * Emit public media rules for the reader's owning-column border.
 *
 * The reader column has no rendered `.pb-column`; its authored border paints the outer
 * viewport instead (see applyReaderStageBorder in reader/data.js, which handles the base
 * value at mount). Device branches need this CSS path for the published page — only the
 * border is meaningful there, mirroring the inline rule. An authored device border also
 * suppresses the stock per-page frame on that device, matching the base path's
 * `data-reader-stage-column-border` behavior.
 */
export function buildReaderStageResponsiveCss(
  section,
  columnIndex,
  viewportSelector = '#viewport'
) {
  const index = Number(columnIndex);
  const column = (section?.settings?.columns || []).find((col) => Number(col?.index) === index);
  if (!isPlainObject(column?.responsive)) return '';
  const blocks = [];
  DEVICE_ORDER.forEach((device) => {
    const branch = column.responsive[device];
    if (!isPlainObject(branch?.appearance?.border)) return;
    const effective = getEffectiveColumnSettings(section, index, {
      deviceId: device,
      resolveResponsive: true,
    });
    const border = normalizeAppearance({ border: effective?.appearance?.border || {} })?.border;
    const borderStyle = border ? appearanceToInlineStyle({ border }) : '';
    if (!borderStyle) return;
    blocks.push(
      deviceRules(device, [
        `${viewportSelector} { ${important(borderStyle)}; }`,
        `${viewportSelector} .page { border-width: 0 !important; }`,
      ])
    );
  });
  return blocks.join('\n');
}

function moduleLayoutDeclarations(layout) {
  if (!isPlainObject(layout)) return [];
  const declarations = [];
  const mode = String(layout.widthMode || '').trim();
  if (mode === 'percent') {
    const width = sanitizeNumber(layout.width, 0, 5, 100);
    if (width) declarations.push(`width: ${width}%`);
  } else if (mode === 'px') {
    const width = sanitizeNumber(layout.width, 0, 40, 2000);
    if (width) declarations.push(`width: ${width}px`, 'max-width: 100%');
  }
  if (layout.maxWidth !== undefined && layout.maxWidth !== null && layout.maxWidth !== '') {
    const maxWidth = sanitizeNumber(layout.maxWidth, 0, 40, 2400);
    if (maxWidth) declarations.push(`max-width: min(${maxWidth}px, 100%)`);
  }
  if (layout.height !== undefined && layout.height !== null && layout.height !== '') {
    const height = sanitizeNumber(layout.height, 0, 40, 4000);
    if (height) declarations.push(`height: ${height}px`, 'overflow: hidden');
  }
  if (layout.align === 'center') declarations.push('margin-left: auto', 'margin-right: auto');
  else if (layout.align === 'end') declarations.push('margin-left: auto', 'margin-right: 0');
  else if (layout.align === 'start') declarations.push('margin-left: 0', 'margin-right: auto');
  return declarations;
}

/** Build public media rules for the Feed wrapper's focused layout scope. */
export function buildFeedLayoutResponsiveCss(module, scopeSelector) {
  if (module?.moduleType !== 'feed' || !isPlainObject(module?.config?.responsive)) return '';
  const blocks = [];
  DEVICE_ORDER.forEach((device) => {
    const declarations = moduleLayoutDeclarations(module.config.responsive[device]?.layout);
    if (!declarations.length) return;
    // Feed mode makes the wrapper a growing flex child. An authored layout must opt out
    // of that stock fill behavior or width, height, and horizontal auto margins are inert.
    declarations.push('flex: 0 1 auto');
    blocks.push(
      deviceRules(device, [`${scopeSelector} { ${important(declarations.join('; '))}; }`])
    );
  });
  return blocks.join('\n');
}

/**
 * Emit public device rules for module fields whose rendered element is already present in
 * the page. Builder editing resolves these branches in JavaScript so selection placeholders
 * remain usable; the published reader needs real-width media rules instead.
 */
export function buildModuleResponsiveCss(module, scopeSelector) {
  const responsive = module?.config?.responsive;
  if (!scopeSelector || !isPlainObject(responsive)) return '';
  const type = String(module?.moduleType || '');
  const blocks = [];
  DEVICE_ORDER.forEach((device) => {
    const branch = responsive[device];
    if (!isPlainObject(branch)) return;
    const rules = [];
    if (branch.hidden === true) {
      rules.push(`${scopeSelector} { display: none !important; }`);
    }
    if (type === 'text' && ['left', 'center', 'right'].includes(branch.alignment)) {
      rules.push(`${scopeSelector} .pb-text { text-align: ${branch.alignment} !important; }`);
    }
    if (type === 'spacer' && branch.height !== undefined && branch.height !== null) {
      rules.push(
        `${scopeSelector} .pb-spacer { height: ${sanitizeNumber(branch.height, 40, 0, 600)}px !important; }`
      );
    }
    if (type === 'gallery' && branch.columns !== undefined && branch.columns !== null) {
      rules.push(
        `${scopeSelector} .pb-gallery { --gallery-columns: ${sanitizeNumber(branch.columns, 3, 1, 6)} !important; }`
      );
    }
    if (type === 'buttons') {
      const defaultsStyle = appearanceToInlineStyle(branch.defaults?.appearance);
      if (defaultsStyle) {
        rules.push(`${scopeSelector} .pb-buttons .pb-btn { ${important(defaultsStyle)}; }`);
      }
      (Array.isArray(branch.buttons) ? branch.buttons : []).forEach((button) => {
        const id = String(button?.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const style = appearanceToInlineStyle(button?.appearance);
        if (id && style) {
          rules.push(
            `${scopeSelector} .pb-buttons .pb-btn[data-button-id="${id}"] { ${important(style)}; }`
          );
        }
      });
    }
    if (rules.length) blocks.push(deviceRules(device, rules));
  });
  return blocks.join('\n');
}

/**
 * Public responsive CSS emission for builder sections.
 *
 * The admin live preview applies device overrides by JS-merging the active
 * device branch (see responsive-overrides.js) because it simulates one device at
 * a time. The public runtime renders at real widths, so device overrides are
 * emitted here as scoped @media rules instead.
 *
 * Each device branch is applied independently onto the global base (mirroring the
 * builder's single-branch merge), so the media queries are *banded* rather than
 * nested. Generated declarations use !important so they win over the base inline
 * styles the renderer emits on each element.
 */

import { appearanceToInlineStyle } from './appearance-utils.js';
import { alignmentToJustifySelf } from './layout-utils.js';
import { getResponsiveBranch, resolveEffectiveColumnLayout } from './responsive-overrides.js';
import { sanitizeColor, sanitizeNumber } from './sanitize.js';

// Bands align with the builder device widths and existing preview breakpoints.
const DEVICE_MEDIA = Object.freeze({
  desktop: '(min-width: 769px)',
  tablet: '(min-width: 481px) and (max-width: 768px)',
  mobile: '(max-width: 480px)',
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
  return decls;
}

function columnDeclarations(branch, { visibleDisplay = 'block' } = {}) {
  const decls = [];
  if (Object.prototype.hasOwnProperty.call(branch, 'hidden')) {
    decls.push(branch.hidden === true ? 'display: none' : `display: ${visibleDisplay}`);
  }
  const appearanceStyle = appearanceToInlineStyle(branch.appearance);
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
    decls.push(`justify-self: ${alignmentToJustifySelf(branch.alignment)}`);
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
 * Build scoped @media CSS for a section's device overrides.
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
      blocks.push(`@media ${DEVICE_MEDIA[device]} { ${rules.join(' ')} }`);
    }
  });

  return blocks.join('\n');
}

/**
 * Build scoped @media CSS for a single panel column's device overrides.
 *
 * Reader panels render through a flex wrapper rather than the section grid, so this
 * mirrors buildSectionResponsiveCss for one column but (a) targets the panel wrapper
 * selector directly and (b) emits `display: flex` (not block) when a device override
 * makes a hidden column visible again, so module stacking/gap survive the override.
 *
 * @param {Object} section        - Builder section that owns the panel (the reader section)
 * @param {number} columnIndex    - The panel's structural column index (0 = left, last = right)
 * @param {string} scopeSelector  - CSS selector targeting the panel column wrapper
 * @returns {string} CSS text (no <style> wrapper), or '' when nothing to emit.
 */
export function buildPanelResponsiveCss(section, columnIndex, scopeSelector) {
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
    const decls = columnDeclarations(effectiveColumn?.settings || {}, { visibleDisplay: 'flex' });
    if (!decls.length) return;
    blocks.push(
      `@media ${DEVICE_MEDIA[device]} { ${scopeSelector} { ${important(decls.join('; '))}; } }`
    );
  });

  return blocks.join('\n');
}

import { sanitizeColor, sanitizeKeyword, sanitizeNumber } from './sanitize.js';

const BACKGROUND_TYPES = ['solid', 'gradient'];
const BORDER_STYLES = ['solid', 'dashed', 'dotted'];
const HEX_COLOR_WITHOUT_ALPHA_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function normalizeKeyword(source, key, allowed) {
  if (!hasOwn(source, key)) return null;
  return sanitizeKeyword(source[key], allowed, '') || null;
}

function normalizeColor(source, key) {
  if (!hasOwn(source, key)) return null;
  return sanitizeColor(source[key]) || null;
}

function normalizeNumber(source, key, minimum, maximum, integer = false) {
  if (!hasOwn(source, key)) return null;
  const number = sanitizeNumber(source[key], null, minimum, maximum);
  if (number == null) return null;
  return integer ? Math.trunc(number) : number;
}

function createAppearanceShape(background = {}, text = {}, border = {}) {
  return {
    background: {
      type: normalizeKeyword(background, 'type', BACKGROUND_TYPES),
      color: normalizeColor(background, 'color'),
      secondaryColor: normalizeColor(background, 'secondaryColor'),
      angle: normalizeNumber(background, 'angle', 0, 360, true),
      opacity: normalizeNumber(background, 'opacity', 0, 1),
    },
    text: {
      color: normalizeColor(text, 'color'),
    },
    border: {
      width: normalizeNumber(border, 'width', 0, 20, true),
      style: normalizeKeyword(border, 'style', BORDER_STYLES),
      color: normalizeColor(border, 'color'),
      opacity: normalizeNumber(border, 'opacity', 0, 1),
      radius: normalizeNumber(border, 'radius', 0, 200, true),
    },
  };
}

function hasStoredValues(appearance) {
  const background = appearance?.background || {};
  const text = appearance?.text || {};
  const border = appearance?.border || {};
  return [
    background.type,
    background.color,
    background.secondaryColor,
    background.angle,
    background.opacity,
    text.color,
    border.width,
    border.style,
    border.color,
    border.opacity,
    border.radius,
  ].some((value) => value != null);
}

function hexToRgba(color, opacity) {
  if (!color || color === 'transparent') return color || '';
  if (!HEX_COLOR_WITHOUT_ALPHA_RE.test(color)) return color;
  const hex = color.slice(1);
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : hex;
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function applyOpacity(color, opacity) {
  if (!color) return '';
  if (opacity == null || opacity === 1) return color;
  return hexToRgba(color, opacity);
}

function mergeLeaf(baseValue, overrideValue) {
  return overrideValue != null ? overrideValue : baseValue ?? null;
}

function normalizeResolvedAppearance(raw) {
  if (!isObject(raw)) return null;
  const background = isObject(raw.background) ? raw.background : {};
  const text = isObject(raw.text) ? raw.text : {};
  const border = isObject(raw.border) ? raw.border : {};
  const normalized = createAppearanceShape(background, text, border);
  return hasStoredValues(normalized) ? normalized : null;
}

function normalizeAppearance(raw) {
  return normalizeResolvedAppearance(raw);
}

function isAppearanceEmpty(appearance) {
  const normalized = normalizeResolvedAppearance(appearance);
  if (!normalized) return true;
  const background = normalized.background || {};
  const text = normalized.text || {};
  const border = normalized.border || {};
  const hasBackground = !!(background.color || background.secondaryColor);
  const hasText = !!text.color;
  const hasBorder = !!border.color || (border.width != null && border.width > 0);
  return !hasBackground && !hasText && !hasBorder;
}

function mergeAppearance(base, override) {
  const normalizedBase = normalizeResolvedAppearance(base);
  const normalizedOverride = normalizeResolvedAppearance(override);
  if (!normalizedBase && !normalizedOverride) return null;
  if (!normalizedOverride) return normalizedBase;
  if (!normalizedBase) return normalizedOverride;

  const merged = {
    background: {
      type: mergeLeaf(normalizedBase.background.type, normalizedOverride.background.type),
      color: mergeLeaf(normalizedBase.background.color, normalizedOverride.background.color),
      secondaryColor: mergeLeaf(
        normalizedBase.background.secondaryColor,
        normalizedOverride.background.secondaryColor
      ),
      angle: mergeLeaf(normalizedBase.background.angle, normalizedOverride.background.angle),
      opacity: mergeLeaf(normalizedBase.background.opacity, normalizedOverride.background.opacity),
    },
    text: {
      color: mergeLeaf(normalizedBase.text.color, normalizedOverride.text.color),
    },
    border: {
      width: mergeLeaf(normalizedBase.border.width, normalizedOverride.border.width),
      style: mergeLeaf(normalizedBase.border.style, normalizedOverride.border.style),
      color: mergeLeaf(normalizedBase.border.color, normalizedOverride.border.color),
      opacity: mergeLeaf(normalizedBase.border.opacity, normalizedOverride.border.opacity),
      radius: mergeLeaf(normalizedBase.border.radius, normalizedOverride.border.radius),
    },
  };

  return isAppearanceEmpty(merged) ? null : merged;
}

function appearanceToInlineStyle(appearance) {
  const normalized = normalizeResolvedAppearance(appearance);
  if (!normalized) return '';

  const tokens = [];
  const background = normalized.background || {};
  const text = normalized.text || {};
  const border = normalized.border || {};
  const hasBackground = !!background.color;
  const backgroundOpacity = background.opacity ?? 1;
  const backgroundType = background.type || (hasBackground ? 'solid' : null);

  if (hasBackground) {
    if (backgroundType === 'gradient' && background.secondaryColor) {
      const angle = background.angle ?? 135;
      const primaryColor = applyOpacity(background.color, backgroundOpacity);
      const secondaryColor = applyOpacity(background.secondaryColor, backgroundOpacity);
      tokens.push(
        `background: linear-gradient(${angle}deg, ${primaryColor}, ${secondaryColor})`
      );
    } else {
      tokens.push(`background: ${applyOpacity(background.color, backgroundOpacity)}`);
    }
  }

  if (text.color) {
    tokens.push(`color: ${text.color}`);
  }

  const hasVisibleBorder = !!border.color && border.width != null && border.width > 0;
  const hasRadius = border.radius != null && (hasBackground || hasVisibleBorder);
  if (hasVisibleBorder) {
    const borderStyle = border.style || 'solid';
    const borderOpacity = border.opacity ?? 1;
    tokens.push(
      `border: ${border.width}px ${borderStyle} ${applyOpacity(border.color, borderOpacity)}`
    );
  }

  if (hasRadius) {
    tokens.push(`border-radius: ${border.radius}px`);
  }

  return tokens.join('; ');
}

export {
  appearanceToInlineStyle,
  isAppearanceEmpty,
  mergeAppearance,
  normalizeAppearance,
};

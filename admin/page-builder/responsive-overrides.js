import { BUILDER_DEVICE_ORDER, getBuilderDevice, isBuilderDeviceId } from './preview-contract.js';
import { parseLayoutRatios, ratiosToGridTemplate, ratiosToLayout } from './layout-utils.js';
import { getModuleResponsiveOverrides } from './module-descriptors.js';
import { normalizeReaderResponsiveBranch } from './reader-config.js';

export const SECTION_RESPONSIVE_FIELDS = Object.freeze([
  'layout',
  'moduleGap',
  'columnGap',
  'sectionGap',
  'paddingTop',
  'paddingBottom',
  'backgroundColor',
  'minHeight',
]);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function getBuilderDeviceLabel(deviceId) {
  return getBuilderDevice(deviceId).label;
}

export function normalizeBuilderDeviceId(deviceId) {
  const normalized = String(deviceId || '');
  return isBuilderDeviceId(normalized) ? normalized : BUILDER_DEVICE_ORDER[0];
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function pruneEmptyObjects(value) {
  if (Array.isArray(value)) {
    const items = value.map((item) => pruneEmptyObjects(item)).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (!isPlainObject(value)) {
    if (value === '' || value === undefined) return undefined;
    return value;
  }

  const entries = Object.entries(value)
    .map(([key, item]) => [key, pruneEmptyObjects(item)])
    .filter(([, item]) => item !== undefined);
  if (!entries.length) return undefined;
  return Object.fromEntries(entries);
}

export function pruneEmptyResponsiveOverrides(responsive) {
  if (!isPlainObject(responsive)) return {};
  const normalized = {};
  BUILDER_DEVICE_ORDER.forEach((deviceId) => {
    const branch = pruneEmptyObjects(responsive[deviceId]);
    if (branch && isPlainObject(branch)) {
      normalized[deviceId] = branch;
    }
  });
  return normalized;
}

export function getResponsiveBranch(source, deviceId) {
  if (!isPlainObject(source?.responsive)) return {};
  const normalizedDeviceId = normalizeBuilderDeviceId(deviceId);
  const branch = source.responsive[normalizedDeviceId];
  return isPlainObject(branch) ? branch : {};
}

export function getModuleResponsiveFields(moduleType) {
  return Object.freeze(getModuleResponsiveOverrides(moduleType));
}

export function isModuleResponsiveField(moduleType, key) {
  return getModuleResponsiveFields(moduleType).includes(String(key || ''));
}

export function isSectionResponsiveField(key) {
  return SECTION_RESPONSIVE_FIELDS.includes(String(key || ''));
}

export function setResponsiveOverrideValue(source, deviceId, key, value) {
  if (!isPlainObject(source) || !key) return source;
  const normalizedDeviceId = normalizeBuilderDeviceId(deviceId);
  source.responsive = isPlainObject(source.responsive) ? cloneValue(source.responsive) : {};
  source.responsive[normalizedDeviceId] = isPlainObject(source.responsive[normalizedDeviceId])
    ? source.responsive[normalizedDeviceId]
    : {};

  if (value === '' || value === undefined || value === null) {
    delete source.responsive[normalizedDeviceId][key];
  } else {
    source.responsive[normalizedDeviceId][key] = value;
  }

  source.responsive = pruneEmptyResponsiveOverrides(source.responsive);
  if (!Object.keys(source.responsive).length) {
    delete source.responsive;
  }
  return source;
}

function shouldResolveResponsive(renderOptions = {}) {
  return renderOptions.builderEditing === true || renderOptions.resolveResponsive === true;
}

export function getEffectiveSectionLayout(section, renderOptions = {}) {
  const baseLayout = section?.layout || '1';
  if (!shouldResolveResponsive(renderOptions)) return baseLayout;
  const branch = getResponsiveBranch(section?.settings || {}, renderOptions.deviceId);
  if (!branch.layout) return baseLayout;
  const globalColumnCount = parseLayoutRatios(baseLayout).length;
  return ratiosToLayout(parseLayoutRatios(branch.layout).slice(0, globalColumnCount));
}

export function getEffectiveSectionSettings(section, renderOptions = {}) {
  const baseSettings = cloneValue(section?.settings || {}) || {};
  delete baseSettings.responsive;
  if (!shouldResolveResponsive(renderOptions)) return baseSettings;

  const branch = getResponsiveBranch(section?.settings || {}, renderOptions.deviceId);
  SECTION_RESPONSIVE_FIELDS.forEach((key) => {
    if (key === 'layout') return;
    if (Object.prototype.hasOwnProperty.call(branch, key)) {
      baseSettings[key] = branch[key];
    }
  });
  return baseSettings;
}

export const COLUMN_RESPONSIVE_FIELDS = Object.freeze([
  'appearance',
  'padding',
  'alignment',
  'minHeight',
  'hidden',
]);

// Resolve a single column's effective styling. On the public path (builderEditing
// false) device overrides are emitted as scoped @media CSS instead, so this returns
// the base styling; in the admin preview the active device branch is merged in.
export function getEffectiveColumnSettings(section, columnIndex, renderOptions = {}) {
  const columns = section?.settings?.columns;
  const match = Array.isArray(columns)
    ? columns.find((column) => Number(column?.index) === Number(columnIndex))
    : null;
  const base = isPlainObject(match) ? cloneValue(match) : {};
  const responsive = base.responsive;
  delete base.responsive;
  if (!shouldResolveResponsive(renderOptions)) return base;

  const branch = getResponsiveBranch({ responsive }, renderOptions.deviceId);
  COLUMN_RESPONSIVE_FIELDS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(branch, key)) return;
    if (isPlainObject(branch[key]) && isPlainObject(base[key])) {
      base[key] = mergePlainObject(base[key], branch[key]);
    } else {
      base[key] = cloneValue(branch[key]);
    }
  });
  return base;
}

export function resolveEffectiveColumnLayout(section, renderOptions = {}) {
  const globalRatios = parseLayoutRatios(section?.layout || '1');
  const globalColumnIndexes = globalRatios.map((_, index) => index);
  const useResponsive = shouldResolveResponsive(renderOptions);
  const sectionBranch = useResponsive
    ? getResponsiveBranch(section?.settings || {}, renderOptions.deviceId)
    : {};
  const hasResponsiveLayout = !!sectionBranch.layout;
  const trackRatios = hasResponsiveLayout
    ? parseLayoutRatios(sectionBranch.layout).slice(0, globalRatios.length)
    : [...globalRatios];
  const columns = globalColumnIndexes.map((index) => ({
    index,
    settings: getEffectiveColumnSettings(section, index, renderOptions),
  }));
  const visibleColumnIndexes = columns
    .filter((column) => column.settings?.hidden !== true)
    .map((column) => column.index);
  const effectiveTrackRatios = hasResponsiveLayout
    ? trackRatios.slice(0, visibleColumnIndexes.length)
    : visibleColumnIndexes.map((index) => globalRatios[index]);

  return {
    columns,
    effectiveTrackRatios,
    globalColumnIndexes,
    globalRatios,
    gridTemplate: ratiosToGridTemplate(effectiveTrackRatios),
    layout: ratiosToLayout(trackRatios),
    visibleColumnIndexes,
  };
}

function mergePlainObject(base, override) {
  if (!isPlainObject(override)) return cloneValue(base || {});
  if (!isPlainObject(base)) return cloneValue(override);
  const next = cloneValue(base);
  Object.entries(override).forEach(([key, value]) => {
    if (isPlainObject(value) && isPlainObject(next[key])) {
      next[key] = mergePlainObject(next[key], value);
    } else {
      next[key] = cloneValue(value);
    }
  });
  return next;
}

function mergeButtonsResponsiveConfig(baseConfig, branch) {
  const nextConfig = cloneValue(baseConfig || {}) || {};
  if (isPlainObject(branch.defaults)) {
    nextConfig.defaults = mergePlainObject(nextConfig.defaults || {}, branch.defaults);
  }
  if (Array.isArray(branch.buttons) && Array.isArray(nextConfig.buttons)) {
    nextConfig.buttons = nextConfig.buttons.map((button, index) => {
      const override =
        branch.buttons.find((item) => item?.id && item.id === button?.id) || branch.buttons[index];
      return isPlainObject(override) ? mergePlainObject(button, override) : button;
    });
  }
  return nextConfig;
}

function mergeReaderResponsiveConfig(baseConfig, branch) {
  const nextConfig = cloneValue(baseConfig || {}) || {};
  const safeBranch = normalizeReaderResponsiveBranch(branch);
  ['displayMode', 'showComments'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(safeBranch, key)) {
      nextConfig[key] = cloneValue(safeBranch[key]);
    }
  });
  ['controls', 'stage', 'panels'].forEach((key) => {
    if (isPlainObject(safeBranch[key])) {
      nextConfig[key] = mergePlainObject(nextConfig[key] || {}, safeBranch[key]);
    }
  });
  return nextConfig;
}

export function getEffectiveModuleConfig(module, renderOptions = {}) {
  const baseConfig = cloneValue(module?.config || {}) || {};
  const responsive = baseConfig.responsive;
  delete baseConfig.responsive;
  if (renderOptions.builderEditing !== true) return baseConfig;

  const branch = getResponsiveBranch({ responsive }, renderOptions.deviceId);
  const moduleType = module?.moduleType || '';
  let nextConfig = baseConfig;
  getModuleResponsiveFields(moduleType).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(branch, key)) return;
    if (moduleType === 'buttons' && (key === 'defaults' || key === 'buttons')) return;
    if (moduleType === 'reader' && ['controls', 'stage', 'panels'].includes(key)) return;
    nextConfig[key] = cloneValue(branch[key]);
  });
  if (moduleType === 'buttons') {
    nextConfig = mergeButtonsResponsiveConfig(nextConfig, branch);
  }
  if (moduleType === 'reader') {
    nextConfig = mergeReaderResponsiveConfig(nextConfig, branch);
  }
  return nextConfig;
}

export function isModuleHiddenForDevice(module, renderOptions = {}) {
  if (renderOptions.builderEditing !== true) return false;
  const branch = getResponsiveBranch(module?.config || {}, renderOptions.deviceId);
  return branch.hidden === true;
}

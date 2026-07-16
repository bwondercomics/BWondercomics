import {
  BUILDER_DEVICE_ORDER,
  getBuilderDevice,
} from '../../shared/page-builder/preview-contract.js';
import { isModuleHiddenForDevice } from '../../shared/page-builder/responsive-overrides.js';

export const READER_BINDING_DEFAULT_DEVICE = BUILDER_DEVICE_ORDER[0];
export const READER_BINDING_WARNING_CODES = Object.freeze({
  MISSING: 'reader_module_missing',
  DUPLICATE: 'reader_module_duplicate',
  HIDDEN_DEFAULT_DEVICE: 'reader_module_hidden_default_device',
  WRONG_SOURCE: 'reader_module_wrong_source',
});
export const READER_BINDING_ADVISORY_CODES = Object.freeze({
  HIDDEN_CURRENT_DEVICE: 'reader_module_hidden_current_device',
});

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function createWarning(code, message) {
  return {
    role: 'reader',
    code,
    message,
  };
}

function normalizeDeviceId(deviceId) {
  return BUILDER_DEVICE_ORDER.includes(deviceId) ? deviceId : READER_BINDING_DEFAULT_DEVICE;
}

export function getReaderBindingPageId(pageBindings = {}) {
  return pageBindings?.bindings?.reader?.pageId || null;
}

export function isBoundReaderPage(page, pageBindings = {}) {
  return Boolean(page?.id && getReaderBindingPageId(pageBindings) === page.id);
}

export function collectReaderModules(page = {}) {
  const modules = [];
  for (const section of page.sections || []) {
    for (const module of section.modules || []) {
      if (module?.moduleType === 'reader') {
        modules.push({ section, module });
      }
    }
  }
  return modules;
}

function readerModuleHasWrongSource(module = {}) {
  const source =
    module.config?.source && typeof module.config.source === 'object' ? module.config.source : {};
  const mode = String(source.mode || '').trim();
  if (!mode) return false;
  return mode !== 'active-page-series';
}

function validateReaderBindingShape(page, options = {}) {
  if (!page) {
    return [
      createWarning(
        READER_BINDING_WARNING_CODES.MISSING,
        'The bound reader page must contain one Comic Reader module.'
      ),
    ];
  }

  if (page.scope === 'global' || (options.seriesId && page.seriesId !== options.seriesId)) {
    return [
      createWarning(
        'reader_binding_invalid',
        'The reader page binding must point to a same-series page.'
      ),
    ];
  }

  const readerModules = collectReaderModules(page);
  if (!readerModules.length) {
    return [
      createWarning(
        READER_BINDING_WARNING_CODES.MISSING,
        'The bound reader page must contain one Comic Reader module.'
      ),
    ];
  }
  if (readerModules.length > 1) {
    return [
      createWarning(
        READER_BINDING_WARNING_CODES.DUPLICATE,
        'The bound reader page must contain exactly one Comic Reader module.'
      ),
    ];
  }

  const [{ module }] = readerModules;
  const warnings = [];
  if (
    isModuleHiddenForDevice(module, {
      builderEditing: true,
      deviceId: READER_BINDING_DEFAULT_DEVICE,
    })
  ) {
    warnings.push(
      createWarning(
        READER_BINDING_WARNING_CODES.HIDDEN_DEFAULT_DEVICE,
        "The bound reader page's Comic Reader module cannot be hidden on Desktop."
      )
    );
  }
  if (readerModuleHasWrongSource(module)) {
    warnings.push(
      createWarning(
        READER_BINDING_WARNING_CODES.WRONG_SOURCE,
        "The bound reader page's Comic Reader module must use the active page series."
      )
    );
  }
  return warnings;
}

export function validateReaderBindingPage(page, options = {}) {
  return validateReaderBindingShape(page, options);
}

function removeModuleFromPage(page, moduleId) {
  const nextPage = cloneValue(page);
  nextPage.sections = (nextPage.sections || []).map((section) => ({
    ...section,
    modules: (section.modules || []).filter((module) => module.id !== moduleId),
  }));
  return nextPage;
}

function removeSectionFromPage(page, sectionId) {
  const nextPage = cloneValue(page);
  nextPage.sections = (nextPage.sections || []).filter((section) => section.id !== sectionId);
  return nextPage;
}

function hideModuleOnPage(page, moduleId, deviceId) {
  const nextPage = cloneValue(page);
  const safeDeviceId = normalizeDeviceId(deviceId);
  for (const section of nextPage.sections || []) {
    for (const module of section.modules || []) {
      if (module.id !== moduleId) continue;
      module.config = module.config && typeof module.config === 'object' ? module.config : {};
      module.config.responsive =
        module.config.responsive && typeof module.config.responsive === 'object'
          ? module.config.responsive
          : {};
      module.config.responsive[safeDeviceId] =
        module.config.responsive[safeDeviceId] &&
        typeof module.config.responsive[safeDeviceId] === 'object'
          ? module.config.responsive[safeDeviceId]
          : {};
      module.config.responsive[safeDeviceId].hidden = true;
    }
  }
  return nextPage;
}

function buildInvalidationMessage(warnings) {
  const firstMessage = warnings[0]?.message || 'The bound reader page would become invalid.';
  return `${firstMessage} Publishing and reader binding saves will be blocked until the page has exactly one visible Comic Reader module.`;
}

function buildCurrentDeviceHideWarning(nextPage, options = {}) {
  const deviceId = normalizeDeviceId(options.deviceId);
  if (deviceId === READER_BINDING_DEFAULT_DEVICE) return null;

  const readerModules = collectReaderModules(nextPage);
  if (readerModules.length !== 1) return null;
  const [{ module }] = readerModules;
  if (!isModuleHiddenForDevice(module, { builderEditing: true, deviceId })) return null;

  const label = getBuilderDevice(deviceId).label;
  const warnings = [
    createWarning(
      READER_BINDING_ADVISORY_CODES.HIDDEN_CURRENT_DEVICE,
      `The bound reader page's Comic Reader module will be hidden on ${label}.`
    ),
  ];
  return {
    advisory: true,
    warnings,
    message: `${warnings[0].message} Readers using this device preset will not see the reader until the override is removed.`,
  };
}

export function getReaderBindingInvalidationWarning(page, options = {}) {
  if (!isBoundReaderPage(page, options.pageBindings)) return null;

  let nextPage = null;
  let operation = '';
  if (options.removeModuleId) {
    operation = 'remove';
    nextPage = removeModuleFromPage(page, options.removeModuleId);
  } else if (options.removeSectionId) {
    operation = 'remove';
    nextPage = removeSectionFromPage(page, options.removeSectionId);
  } else if (options.hideModuleId) {
    operation = 'hide';
    nextPage = hideModuleOnPage(page, options.hideModuleId, options.deviceId);
  }
  if (!nextPage) return null;

  const warnings = validateReaderBindingShape(nextPage, {
    seriesId: options.seriesId,
  });
  if (warnings.length) {
    return {
      advisory: false,
      warnings,
      message: buildInvalidationMessage(warnings),
    };
  }
  if (operation === 'hide') {
    return buildCurrentDeviceHideWarning(nextPage, options);
  }
  return null;
}

export function isReaderBindingWarningBlocking(warning) {
  return warning?.advisory !== true;
}

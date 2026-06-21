import { isModuleTypeDuplicatable } from './module-descriptors.js';

export function findPageModuleLocation(page, moduleId) {
  if (!moduleId) return null;
  for (const section of page?.sections || []) {
    const module = (section.modules || []).find((item) => item.id === moduleId);
    if (module) return { section, module };
  }
  return null;
}

export function getPageModuleDuplicateEligibility(page, moduleId) {
  const location = findPageModuleLocation(page, moduleId);
  if (!location) {
    return { allowed: false, reason: 'missing', location: null };
  }
  if (!isModuleTypeDuplicatable(location.module.moduleType)) {
    return { allowed: false, reason: 'ineligible', location };
  }
  return { allowed: true, reason: '', location };
}

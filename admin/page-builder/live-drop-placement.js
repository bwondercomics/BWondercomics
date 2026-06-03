import { getModuleDescriptor } from './module-descriptors.js';

export const LIVE_DROP_PLACEMENTS = Object.freeze({
  BEFORE: 'before',
  AFTER: 'after',
  START: 'start',
  END: 'end',
  EMPTY_COLUMN: 'inside-empty-column',
  SECTION_BEFORE: 'section-before',
  SECTION_AFTER: 'section-after',
  PAGE_END: 'page-end',
});

const TARGET_PRIORITY = Object.freeze({
  module: 5,
  column: 4,
  section: 3,
  page: 2,
  header: 1,
});

function sortSections(sections = []) {
  return sections.slice().sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
}

function sortModules(modules = []) {
  return modules.slice().sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
}

function getLayoutColumnCount(layout = '1') {
  return String(layout || '1')
    .split('-')
    .filter(Boolean).length;
}

function getSection(page, sectionId) {
  return (page?.sections || []).find((section) => section.id === sectionId) || null;
}

function getSectionIndex(page, sectionId, excludeSectionId = '') {
  return sortSections(page?.sections || [])
    .filter((section) => section.id !== excludeSectionId)
    .findIndex((section) => section.id === sectionId);
}

function getVisibleModulesForColumn(section, columnIndex, excludeModuleId = '') {
  return sortModules(section?.modules || []).filter(
    (module) =>
      module.moduleType !== 'header' &&
      (Number(module.columnIndex) || 0) === Number(columnIndex) &&
      module.id !== excludeModuleId
  );
}

function findModuleLocation(page, moduleId) {
  for (const section of page?.sections || []) {
    const module = (section.modules || []).find((item) => item.id === moduleId);
    if (module) return { section, module };
  }
  return null;
}

function rectContains(rect = {}, point = {}) {
  const left = Number(rect.left) || 0;
  const right = Number(rect.right) || 0;
  const top = Number(rect.top) || 0;
  const bottom = Number(rect.bottom) || 0;
  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
}

function getRectDistance(rect = {}, point = {}) {
  const left = Number(rect.left) || 0;
  const right = Number(rect.right) || 0;
  const top = Number(rect.top) || 0;
  const bottom = Number(rect.bottom) || 0;
  const dx = point.x < left ? left - point.x : point.x > right ? point.x - right : 0;
  const dy = point.y < top ? top - point.y : point.y > bottom ? point.y - bottom : 0;
  return Math.sqrt(dx * dx + dy * dy);
}

function isAllowedModuleDrag(page, dragState = {}) {
  if (dragState.source === 'section') return true;
  const moduleType =
    dragState.moduleType || findModuleLocation(page, dragState.moduleId)?.module?.moduleType || '';
  const descriptor = getModuleDescriptor(moduleType);
  if (dragState.source === 'block' && descriptor.insertable !== true) return false;
  return descriptor.allowedParents?.includes('section-column') === true;
}

function isColumnValid(section, columnIndex) {
  return Number(columnIndex) >= 0 && Number(columnIndex) < getLayoutColumnCount(section?.layout);
}

function getCandidateTarget(targets = [], point = {}) {
  const visibleTargets = targets.filter((item) => item?.visible !== false && item?.target?.kind);
  const containing = visibleTargets
    .filter((item) => rectContains(item.rect, point))
    .sort((a, b) => {
      const priorityDiff =
        (TARGET_PRIORITY[b.target.kind] || 0) - (TARGET_PRIORITY[a.target.kind] || 0);
      if (priorityDiff) return priorityDiff;
      return (a.order ?? 0) - (b.order ?? 0);
    });
  if (containing.length) return containing[0];

  return visibleTargets.slice().sort((a, b) => {
    const distanceDiff = getRectDistance(a.rect, point) - getRectDistance(b.rect, point);
    if (distanceDiff) return distanceDiff;
    return (TARGET_PRIORITY[b.target.kind] || 0) - (TARGET_PRIORITY[a.target.kind] || 0);
  })[0];
}

function buildPlacement(geometry, placement, details = {}) {
  return {
    target: geometry?.target || null,
    placement,
    ...details,
  };
}

function resolveModulePlacement({ page, geometry, point, dragState }) {
  const target = geometry?.target || {};
  const targetModuleId = target.moduleId;
  const sourceModuleId = dragState?.moduleId || '';
  if (!targetModuleId || (sourceModuleId && targetModuleId === sourceModuleId)) return null;

  const location = findModuleLocation(page, targetModuleId);
  if (!location) return null;
  const columnIndex = Number(location.module.columnIndex) || 0;
  if (!isColumnValid(location.section, columnIndex)) return null;

  const modules = getVisibleModulesForColumn(location.section, columnIndex, sourceModuleId);
  const targetIndex = modules.findIndex((module) => module.id === targetModuleId);
  if (targetIndex < 0) return null;

  const rect = geometry.rect || {};
  const useAfter = Number(point.y) >= (Number(rect.top) + Number(rect.bottom)) / 2;
  return buildPlacement(
    geometry,
    useAfter ? LIVE_DROP_PLACEMENTS.AFTER : LIVE_DROP_PLACEMENTS.BEFORE,
    {
      sectionId: location.section.id,
      columnIndex,
      insertIndex: targetIndex + (useAfter ? 1 : 0),
    }
  );
}

function resolveColumnPlacement({ page, geometry, point, dragState }) {
  const target = geometry?.target || {};
  const section = getSection(page, target.sectionId);
  const columnIndex = Number(target.columnIndex) || 0;
  if (!section || !isColumnValid(section, columnIndex)) return null;

  const modules = getVisibleModulesForColumn(section, columnIndex, dragState?.moduleId || '');
  if (!modules.length) {
    return buildPlacement(geometry, LIVE_DROP_PLACEMENTS.EMPTY_COLUMN, {
      sectionId: section.id,
      columnIndex,
      insertIndex: 0,
    });
  }

  const rect = geometry.rect || {};
  const useEnd = Number(point.y) >= (Number(rect.top) + Number(rect.bottom)) / 2;
  return buildPlacement(geometry, useEnd ? LIVE_DROP_PLACEMENTS.END : LIVE_DROP_PLACEMENTS.START, {
    sectionId: section.id,
    columnIndex,
    insertIndex: useEnd ? modules.length : 0,
  });
}

function resolveSectionPlacement({ page, geometry, point, dragState }) {
  const target = geometry?.target || {};
  const targetSectionId = target.sectionId;
  if (!targetSectionId || targetSectionId === dragState?.sectionId) return null;

  const targetIndex = getSectionIndex(page, targetSectionId, dragState?.sectionId || '');
  if (targetIndex < 0) return null;

  const rect = geometry.rect || {};
  const useAfter = Number(point.y) >= (Number(rect.top) + Number(rect.bottom)) / 2;
  return buildPlacement(
    geometry,
    useAfter ? LIVE_DROP_PLACEMENTS.SECTION_AFTER : LIVE_DROP_PLACEMENTS.SECTION_BEFORE,
    {
      sectionIndex: targetIndex + (useAfter ? 1 : 0),
    }
  );
}

function resolvePagePlacement({ page, geometry, dragState }) {
  const sections = sortSections(page?.sections || []).filter(
    (section) => section.id !== dragState?.sectionId
  );
  return buildPlacement(geometry, LIVE_DROP_PLACEMENTS.PAGE_END, {
    sectionIndex: sections.length,
  });
}

export function resolveLiveDropPlacement({ page, targets = [], point = {}, dragState = {} } = {}) {
  if (!page || !dragState?.source) return null;
  if (!isAllowedModuleDrag(page, dragState)) return null;

  const geometry = getCandidateTarget(targets, point);
  if (!geometry?.target) {
    return resolvePagePlacement({ page, geometry: { target: { kind: 'page' } }, dragState });
  }

  if (dragState.source === 'section') {
    if (geometry.target.kind === 'section') {
      return resolveSectionPlacement({ page, geometry, point, dragState });
    }
    if (geometry.target.kind === 'page') {
      return resolvePagePlacement({ page, geometry, dragState });
    }
    const sectionId = geometry.target.sectionId;
    const sectionGeometry = targets.find(
      (item) => item?.target?.kind === 'section' && item.target.sectionId === sectionId
    );
    return sectionGeometry
      ? resolveSectionPlacement({ page, geometry: sectionGeometry, point, dragState })
      : resolvePagePlacement({ page, geometry, dragState });
  }

  if (geometry.target.kind === 'module') {
    return resolveModulePlacement({ page, geometry, point, dragState });
  }
  if (geometry.target.kind === 'column') {
    return resolveColumnPlacement({ page, geometry, point, dragState });
  }
  if (geometry.target.kind === 'section') {
    return resolveSectionPlacement({ page, geometry, point, dragState });
  }
  if (geometry.target.kind === 'page') {
    return resolvePagePlacement({ page, geometry, dragState });
  }
  return null;
}

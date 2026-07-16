import {
  HEADER_REGION_ORDER,
  HEADER_ROW_ORDER,
  cloneValue,
  normalizeHeaderConfig,
} from '../../shared/page-builder/header-config.js';
import { normalizeHeaderNavItems } from '../../shared/page-builder/link-utils.js';

// Pure placement model used by canvas commands and header-model tests. The editor module owns
// DOM rendering and event binding; this module remains independent of both.
export function findBlockPlacement(header, blockId) {
  for (const rowId of HEADER_ROW_ORDER) {
    for (const region of HEADER_REGION_ORDER) {
      if ((header.layoutRows?.[rowId]?.[region] || []).includes(blockId)) {
        return { rowId, region };
      }
    }
  }
  return { rowId: 'top', region: 'left' };
}

export function moveBlockToPlacement(header, blockId, nextRowId, nextRegion) {
  const nextHeader = normalizeHeaderConfig(cloneValue(header), normalizeHeaderNavItems);
  HEADER_ROW_ORDER.forEach((rowId) => {
    HEADER_REGION_ORDER.forEach((region) => {
      nextHeader.layoutRows[rowId][region] = (nextHeader.layoutRows[rowId][region] || []).filter(
        (id) => id !== blockId
      );
    });
  });
  nextHeader.layoutRows[nextRowId][nextRegion] = nextHeader.layoutRows[nextRowId][nextRegion] || [];
  nextHeader.layoutRows[nextRowId][nextRegion].push(blockId);
  return normalizeHeaderConfig(nextHeader, normalizeHeaderNavItems);
}

export function moveBlockAcrossRegions(header, blockId, direction) {
  const placement = findBlockPlacement(
    normalizeHeaderConfig(header, normalizeHeaderNavItems),
    blockId
  );
  const currentIndex = HEADER_REGION_ORDER.indexOf(placement.region);
  if (currentIndex === -1) {
    return normalizeHeaderConfig(cloneValue(header), normalizeHeaderNavItems);
  }
  const nextRegion = HEADER_REGION_ORDER[currentIndex + direction];
  if (!nextRegion) return normalizeHeaderConfig(cloneValue(header), normalizeHeaderNavItems);
  return moveBlockToPlacement(header, blockId, placement.rowId, nextRegion);
}

export function moveBlockAcrossRows(header, blockId, direction) {
  const placement = findBlockPlacement(
    normalizeHeaderConfig(header, normalizeHeaderNavItems),
    blockId
  );
  const currentIndex = HEADER_ROW_ORDER.indexOf(placement.rowId);
  if (currentIndex === -1) {
    return normalizeHeaderConfig(cloneValue(header), normalizeHeaderNavItems);
  }
  const nextRowId = HEADER_ROW_ORDER[currentIndex + direction];
  if (!nextRowId) return normalizeHeaderConfig(cloneValue(header), normalizeHeaderNavItems);
  return moveBlockToPlacement(header, blockId, nextRowId, placement.region);
}

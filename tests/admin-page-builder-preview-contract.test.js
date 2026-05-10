import { describe, expect, it } from 'vitest';

import {
  BUILDER_PREVIEW_SOURCES,
  BUILDER_PREVIEW_SNAPSHOT_VERSION,
  PREVIEW_VIEWPORT_ORDER,
  PREVIEW_VIEWPORTS,
  getPreviewStatusCopy,
  getPreviewViewport,
  isPreviewSource,
  isPreviewViewportId,
} from '../admin/page-builder/preview-contract.js';

describe('admin page-builder preview contract', () => {
  it('defines ordered viewport presets with iframe dimensions', () => {
    expect(PREVIEW_VIEWPORT_ORDER).toEqual(['desktop', 'tablet', 'mobile']);
    expect(PREVIEW_VIEWPORTS.desktop).toMatchObject({ width: 1280, height: 900 });
    expect(PREVIEW_VIEWPORTS.tablet).toMatchObject({ width: 768, height: 1024 });
    expect(PREVIEW_VIEWPORTS.mobile).toMatchObject({ width: 375, height: 812 });
    expect(BUILDER_PREVIEW_SNAPSHOT_VERSION).toBe(1);
  });

  it('validates viewport ids and falls back to desktop', () => {
    expect(isPreviewViewportId('desktop')).toBe(true);
    expect(isPreviewViewportId('tablet')).toBe(true);
    expect(isPreviewViewportId('mobile')).toBe(true);
    expect(isPreviewViewportId('wide')).toBe(false);

    expect(getPreviewViewport('mobile')).toBe(PREVIEW_VIEWPORTS.mobile);
    expect(getPreviewViewport('wide')).toBe(PREVIEW_VIEWPORTS.desktop);
    expect(getPreviewViewport()).toBe(PREVIEW_VIEWPORTS.desktop);
  });

  it('defines source validation and status copy', () => {
    expect(isPreviewSource(BUILDER_PREVIEW_SOURCES.SAVED)).toBe(true);
    expect(isPreviewSource(BUILDER_PREVIEW_SOURCES.WORKING)).toBe(true);
    expect(isPreviewSource('published')).toBe(false);
    expect(getPreviewStatusCopy(BUILDER_PREVIEW_SOURCES.SAVED)).toBe('Previewing saved draft');
    expect(getPreviewStatusCopy(BUILDER_PREVIEW_SOURCES.WORKING)).toBe(
      'Previewing unsaved working changes'
    );
    expect(getPreviewStatusCopy('unknown')).toBe('Previewing saved draft');
  });
});

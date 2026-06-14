import { describe, expect, it } from 'vitest';

import { MODULE_TYPES } from '../admin/page-builder/constants.js';
import {
  getDefaultConfig,
  getModuleLabel,
  getModulePreview,
} from '../admin/page-builder/helpers.js';
import {
  getInsertableModuleDescriptors,
  getModuleDefaultConfig,
  getModuleDescriptor,
  getModuleDescriptors,
  getModuleResponsiveOverrides,
  getModuleSourceModes,
  getModuleStyleSectors,
} from '../admin/page-builder/module-descriptors.js';
import { getModuleResponsiveFields } from '../admin/page-builder/responsive-overrides.js';

describe('page-builder module descriptors', () => {
  it('provides one descriptor for every compatibility module type', () => {
    const descriptors = getModuleDescriptors();
    const descriptorTypes = descriptors.map((descriptor) => descriptor.type);

    expect(new Set(descriptorTypes).size).toBe(descriptorTypes.length);
    expect(MODULE_TYPES.map((module) => module.type)).toEqual(descriptorTypes);
    expect(MODULE_TYPES.find((module) => module.type === 'feed')).toEqual({
      type: 'feed',
      label: 'Feed',
      icon: '\u{1F4F0}',
      category: 'special',
    });
    expect(MODULE_TYPES.find((module) => module.type === 'media-gallery')).toEqual({
      type: 'media-gallery',
      label: 'Media Gallery',
      icon: '\u{1F5BC}',
      category: 'special',
    });
  });

  it('drives insertable blocks and default configs from descriptors', () => {
    const insertableTypes = getInsertableModuleDescriptors().map((descriptor) => descriptor.type);
    expect(insertableTypes).toContain('text');
    expect(insertableTypes).toContain('reader');
    expect(insertableTypes).toContain('feed');
    expect(insertableTypes).toContain('media-gallery');
    expect(insertableTypes).not.toContain('header');

    const feedConfig = getDefaultConfig('feed');
    expect(feedConfig).toEqual(
      expect.objectContaining({
        limit: 5,
        source: { mode: 'site' },
        showMediaButton: true,
        style: expect.objectContaining({
          headingBgColor: '#ffed00',
          itemBorderColor: '#00d9ff',
        }),
      })
    );

    feedConfig.style.headingBgColor = '#000000';
    expect(getModuleDefaultConfig('feed').style.headingBgColor).toBe('#ffed00');
  });

  it('keeps labels, previews, responsive fields, and style sectors descriptor-backed', () => {
    expect(getModuleLabel('entry-gallery')).toBe('Entries');
    expect(getModulePreview('text', { content: '<p>Hello Builder</p>' })).toBe('Hello Builder');
    expect(getModuleResponsiveFields('buttons')).toEqual(['hidden', 'defaults', 'buttons']);
    expect(getModuleResponsiveOverrides('text')).toEqual(['hidden', 'alignment']);
    expect(getModuleResponsiveOverrides('media-gallery')).toEqual(['hidden', 'columns']);
    expect(getModuleSourceModes('reader')).toEqual(['active-page-series', 'specific-series']);
    expect(getModuleSourceModes('entry-gallery')).toEqual([
      'active-page-series',
      'specific-series',
      'all-series',
    ]);
    expect(getModuleSourceModes('media-gallery')).toEqual(['site']);
    expect(getModuleStyleSectors('buttons')).toEqual(['button-defaults', 'button-overrides']);
    expect(getModuleStyleSectors('html')).toEqual([]);
  });

  it('falls back safely for unknown module types', () => {
    const descriptor = getModuleDescriptor('custom-widget');
    expect(descriptor).toEqual(
      expect.objectContaining({
        type: 'custom-widget',
        label: 'Custom Widget',
        insertable: false,
        defaultConfig: {},
        editorKind: 'raw',
      })
    );
    expect(getModuleDefaultConfig('custom-widget')).toEqual({});
    expect(getModuleResponsiveFields('custom-widget')).toEqual([]);
  });
});

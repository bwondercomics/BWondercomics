import { describe, expect, it } from 'vitest';

import {
  getEffectiveColumnSettings,
  getEffectiveModuleConfig,
  getEffectiveSectionLayout,
  getEffectiveSectionSettings,
  isModuleHiddenForDevice,
  pruneEmptyResponsiveOverrides,
  resolveEffectiveColumnLayout,
  setResponsiveOverrideValue,
} from '../admin/page-builder/responsive-overrides.js';
import { buildSectionResponsiveCss } from '../admin/page-builder/responsive-css.js';

describe('responsive override utilities', () => {
  it('normalizes sparse device branches and prunes empty data', () => {
    expect(
      pruneEmptyResponsiveOverrides({
        desktop: {},
        tablet: { moduleGap: '' },
        mobile: { moduleGap: 12, hidden: false },
        watch: { moduleGap: 99 },
      })
    ).toEqual({
      mobile: { moduleGap: 12, hidden: false },
    });
  });

  it('writes and clears sparse override values', () => {
    const config = { content: '<p>Global</p>' };
    setResponsiveOverrideValue(config, 'mobile', 'alignment', 'right');
    expect(config.responsive.mobile.alignment).toBe('right');

    setResponsiveOverrideValue(config, 'mobile', 'alignment', '');
    expect(config.responsive).toBeUndefined();
  });

  it('resolves section overrides only for builder editing sessions', () => {
    const section = {
      layout: '1-1',
      settings: {
        moduleGap: 20,
        responsive: {
          mobile: {
            layout: '1',
            moduleGap: 8,
          },
        },
      },
    };

    expect(getEffectiveSectionLayout(section, { builderEditing: false, deviceId: 'mobile' })).toBe(
      '1-1'
    );
    expect(
      getEffectiveSectionSettings(section, { builderEditing: false, deviceId: 'mobile' })
    ).toEqual({ moduleGap: 20 });

    expect(getEffectiveSectionLayout(section, { builderEditing: true, deviceId: 'mobile' })).toBe(
      '1'
    );
    expect(
      getEffectiveSectionSettings(section, { builderEditing: true, deviceId: 'mobile' })
    ).toEqual({ moduleGap: 8 });
  });

  it('keeps global columns stable while resolving device tracks and hidden columns', () => {
    const section = {
      layout: '2-1-1-1',
      settings: {
        columns: [
          {
            index: 1,
            alignment: 'center',
            hidden: true,
            responsive: {
              mobile: {
                alignment: 'stretch',
                hidden: false,
              },
            },
          },
          {
            index: 2,
            responsive: {
              mobile: {
                hidden: true,
              },
            },
          },
        ],
        responsive: {
          mobile: {
            layout: '1-2',
          },
        },
      },
    };

    const base = resolveEffectiveColumnLayout(section);
    expect(base.globalColumnIndexes).toEqual([0, 1, 2, 3]);
    expect(base.visibleColumnIndexes).toEqual([0, 2, 3]);
    expect(base.effectiveTrackRatios).toEqual([2, 1, 1]);
    expect(base.gridTemplate).toBe('2fr 1fr 1fr');

    const mobile = resolveEffectiveColumnLayout(section, {
      deviceId: 'mobile',
      resolveResponsive: true,
    });
    expect(mobile.globalColumnIndexes).toEqual([0, 1, 2, 3]);
    expect(mobile.visibleColumnIndexes).toEqual([0, 1, 3]);
    expect(mobile.effectiveTrackRatios).toEqual([1, 2]);
    expect(mobile.gridTemplate).toBe('1fr 2fr');
    expect(
      getEffectiveColumnSettings(section, 1, {
        deviceId: 'mobile',
        resolveResponsive: true,
      })
    ).toEqual(
      expect.objectContaining({
        alignment: 'stretch',
        hidden: false,
      })
    );
  });

  it('emits public responsive CSS from the same effective column layout', () => {
    const section = {
      layout: '1-1-1-1',
      settings: {
        columns: [
          {
            index: 1,
            hidden: true,
            responsive: {
              mobile: {
                hidden: false,
                alignment: 'stretch',
              },
            },
          },
          {
            index: 2,
            responsive: {
              mobile: {
                hidden: true,
              },
            },
          },
        ],
        responsive: {
          desktop: { layout: '1-1-1' },
          mobile: { layout: '2-1' },
        },
      },
    };

    const css = buildSectionResponsiveCss(section, '[data-pb-section="columns"]');
    expect(css).toContain('@media (min-width: 769px)');
    expect(css).toContain('grid-template-columns: 1fr 1fr 1fr !important');
    expect(css).toContain('@media (max-width: 480px)');
    expect(css).toContain('grid-template-columns: 2fr 1fr !important');
    expect(css).toContain('.pb-column:nth-child(2) { display: block !important');
    expect(css).toContain('.pb-column:nth-child(3) { display: none !important');
    expect(css).toContain('justify-self: stretch !important');
  });

  it('resolves module fields and hidden state by active device', () => {
    const module = {
      moduleType: 'text',
      config: {
        content: '<p>Global</p>',
        alignment: 'left',
        responsive: {
          mobile: {
            alignment: 'center',
            hidden: true,
          },
        },
      },
    };

    expect(getEffectiveModuleConfig(module, { builderEditing: false, deviceId: 'mobile' })).toEqual(
      {
        content: '<p>Global</p>',
        alignment: 'left',
      }
    );
    expect(getEffectiveModuleConfig(module, { builderEditing: true, deviceId: 'mobile' })).toEqual({
      content: '<p>Global</p>',
      alignment: 'center',
      hidden: true,
    });
    expect(isModuleHiddenForDevice(module, { builderEditing: true, deviceId: 'mobile' })).toBe(
      true
    );
    expect(isModuleHiddenForDevice(module, { builderEditing: true, deviceId: 'tablet' })).toBe(
      false
    );
  });

  it('merges safe reader customization branches without replacing nested config', () => {
    const module = {
      moduleType: 'reader',
      config: {
        displayMode: 'paged',
        showComments: true,
        controls: {
          placement: 'below',
          size: 'medium',
          style: {
            defaults: { appearance: { text: { color: '#ffffff' } } },
          },
        },
        stage: {
          fit: 'dynamic-frame',
          pageGap: 8,
          frameBorder: true,
          maxWidth: 1200,
        },
        panels: {
          left: { enabled: true },
          right: { enabled: true },
        },
        responsive: {
          mobile: {
            controls: { placement: 'overlay' },
            stage: { pageGap: 24 },
            panels: { right: { enabled: false } },
            showComments: false,
          },
        },
      },
    };

    expect(getEffectiveModuleConfig(module, { builderEditing: true, deviceId: 'mobile' })).toEqual(
      expect.objectContaining({
        showComments: false,
        controls: expect.objectContaining({
          placement: 'overlay',
          size: 'medium',
          style: {
            defaults: { appearance: { text: { color: '#ffffff' } } },
          },
        }),
        stage: expect.objectContaining({
          fit: 'dynamic-frame',
          pageGap: 24,
          frameBorder: true,
          maxWidth: 1200,
        }),
        // Panels are no longer a merged reader customization: the base value passes through
        // untouched (the mobile `right: false` override is ignored) as tolerated dead data.
        panels: {
          left: { enabled: true },
          right: { enabled: true },
        },
      })
    );
  });
});

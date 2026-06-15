import { describe, expect, it } from 'vitest';

import {
  getEffectiveModuleConfig,
  getEffectiveSectionLayout,
  getEffectiveSectionSettings,
  isModuleHiddenForDevice,
  pruneEmptyResponsiveOverrides,
  setResponsiveOverrideValue,
} from '../admin/page-builder/responsive-overrides.js';

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
        panels: {
          left: { enabled: true },
          right: { enabled: false },
        },
      })
    );
  });
});

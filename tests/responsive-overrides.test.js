import { describe, expect, it } from 'vitest';

import {
  BUILDER_RESPONSIVE_CAPABILITIES,
  BUILDER_RESPONSIVE_CONTRACT_VERSION,
  getEffectiveColumnSettings,
  getEffectiveModuleConfig,
  getEffectiveSectionLayout,
  getEffectiveSectionSettings,
  isModuleHiddenForDevice,
  pruneEmptyResponsiveOverrides,
  resolveEffectiveColumnLayout,
  setResponsiveOverrideValue,
  getModuleResponsiveContract,
  moduleResponsiveContractMatches,
  validateBuilderRuntimeContract,
} from '../shared/page-builder/responsive-overrides.js';
import {
  buildFeedLayoutResponsiveCss,
  buildModuleResponsiveCss,
  buildPanelResponsiveCss,
  buildReaderControlsResponsiveCss,
  buildReaderStageResponsiveCss,
  buildSectionResponsiveCss,
} from '../shared/page-builder/responsive-css.js';

describe('responsive override utilities', () => {
  it('validates the loaded API contract and compares only allowed module overrides', () => {
    expect(
      validateBuilderRuntimeContract({
        contractVersion: BUILDER_RESPONSIVE_CONTRACT_VERSION,
        processStartedAt: '2026-07-14T10:00:00+00:00',
        capabilities: BUILDER_RESPONSIVE_CAPABILITIES,
      })
    ).toEqual(
      expect.objectContaining({
        compatible: true,
        processStartedAt: '2026-07-14T10:00:00+00:00',
        missingCapabilities: [],
      })
    );
    expect(validateBuilderRuntimeContract(null).compatible).toBe(false);

    const expected = {
      responsive: {
        tablet: { layout: { widthMode: 'percent', width: 70, align: 'center' } },
        mobile: { layout: { widthMode: 'percent', width: 90, align: 'end' } },
      },
    };
    const reordered = {
      responsive: {
        tablet: { layout: { align: 'center', width: 70, widthMode: 'percent' } },
        mobile: { layout: { align: 'end', width: 90, widthMode: 'percent' } },
      },
    };
    expect(getModuleResponsiveContract('feed', expected)).toEqual(expected.responsive);
    expect(moduleResponsiveContractMatches('feed', expected, reordered)).toBe(true);
    expect(
      moduleResponsiveContractMatches('feed', expected, {
        responsive: { tablet: expected.responsive.tablet },
      })
    ).toBe(false);
  });

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
    expect(css).toContain('@media (min-aspect-ratio: 7/5)');
    expect(css).toContain('grid-template-columns: 1fr 1fr 1fr !important');
    expect(css).toContain('@media (max-aspect-ratio: 7/5) and (max-width: 480px)');
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

  it('emits Feed wrapper layout as ratio-banded public CSS', () => {
    const css = buildFeedLayoutResponsiveCss(
      {
        moduleType: 'feed',
        config: {
          responsive: {
            tablet: { layout: { widthMode: 'percent', width: 60, align: 'center' } },
            mobile: { layout: { maxWidth: 320, height: 400, align: 'end' } },
          },
        },
      },
      '.pb-module[data-module-id="feed-1"]'
    );
    expect(css).toContain('@media (max-aspect-ratio: 7/5) and (min-width: 481px)');
    expect(css).toContain('width: 60% !important');
    expect(css).toContain('@media (max-aspect-ratio: 7/5) and (max-width: 480px)');
    expect(css).toContain('max-width: min(320px, 100%) !important');
    expect(css).toContain('margin-left: auto !important');
    expect(css).toContain('margin-right: 0 !important');
    expect(css).toContain('flex: 0 1 auto !important');
  });

  it('emits public device rules for spacer height and button appearance', () => {
    const spacerCss = buildModuleResponsiveCss(
      {
        moduleType: 'spacer',
        config: { responsive: { tablet: { height: 180 }, mobile: { height: 96 } } },
      },
      '.pb-module[data-module-id="spacer-1"]'
    );
    expect(spacerCss).toContain('@media (max-aspect-ratio: 7/5) and (min-width: 481px)');
    expect(spacerCss).toContain('.pb-spacer { height: 180px !important; }');
    expect(spacerCss).toContain('@media (max-aspect-ratio: 7/5) and (max-width: 480px)');
    expect(spacerCss).toContain('.pb-spacer { height: 96px !important; }');

    const buttonsCss = buildModuleResponsiveCss(
      {
        moduleType: 'buttons',
        config: {
          responsive: {
            mobile: {
              defaults: { appearance: { background: { color: '#101020' } } },
              buttons: [{ id: 'next-button', appearance: { text: { color: '#00d9ff' } } }],
            },
          },
        },
      },
      '.pb-module[data-module-id="buttons-1"]'
    );
    expect(buttonsCss).toContain('.pb-buttons .pb-btn { background: #101020 !important; }');
    expect(buttonsCss).toContain(
      '.pb-buttons .pb-btn[data-button-id="next-button"] { color: #00d9ff !important; }'
    );
  });

  it('emits reader-control style and padding overrides for the public device scopes', () => {
    const css = buildReaderControlsResponsiveCss({
      moduleType: 'reader',
      config: {
        responsive: {
          tablet: {
            controls: {
              style: {
                defaults: {
                  padding: 14,
                  appearance: { background: { color: '#101020' } },
                },
                primary: { appearance: { border: { width: 2, color: '#00d9ff' } } },
                bar: { appearance: { background: { color: '#202030' } } },
              },
            },
          },
        },
      },
    });
    expect(css).toContain('@media (max-aspect-ratio: 7/5) and (min-width: 481px)');
    expect(css).toContain('--reader-control-padding-x: 14px !important');
    expect(css).toContain('--reader-control-bg: #101020 !important');
    expect(css).toContain('--reader-primary-control-border: 2px solid #00d9ff !important');
    expect(css).toContain('background: #202030 !important');
  });

  it('emits viewport border rules for reader-column device branches on the public page', () => {
    const section = {
      layout: '1-3-1',
      settings: {
        columns: [
          { index: 0 },
          {
            index: 1,
            appearance: { border: { width: 2, style: 'solid', color: '#ff0000' } },
            responsive: {
              tablet: { appearance: { border: { color: '#00d9ff', radius: 12 } } },
            },
          },
        ],
      },
    };
    const css = buildReaderStageResponsiveCss(section, 1);
    // The device branch merges onto the base border (width from base, color from tablet).
    expect(css).toContain('@media (max-aspect-ratio: 7/5) and (min-width: 481px)');
    expect(css).toContain('border: 2px solid #00d9ff !important');
    expect(css).toContain('border-radius: 12px !important');
    // The authored device border replaces the stock per-page frame on that device.
    expect(css).toContain('#viewport .page { border-width: 0 !important; }');
    // No rules for devices without an authored border branch.
    expect(css).not.toContain('(max-width: 480px)');
    expect(css).not.toContain('(min-aspect-ratio: 7/5)');
  });

  it('emits no reader-stage rules without device border branches', () => {
    const section = {
      layout: '1-3-1',
      settings: {
        columns: [
          {
            index: 1,
            appearance: { border: { width: 2, style: 'solid', color: '#ff0000' } },
            responsive: { tablet: { minHeight: 400 } },
          },
        ],
      },
    };
    expect(buildReaderStageResponsiveCss(section, 1)).toBe('');
    expect(buildReaderStageResponsiveCss({ layout: '1' }, 0)).toBe('');
  });

  it('collapses the panel shell as well as its wrapper for a hidden device branch', () => {
    const section = {
      layout: '1-1',
      settings: {
        columns: [{ index: 0, responsive: { mobile: { hidden: true } } }],
      },
    };
    const css = buildPanelResponsiveCss(section, 0, {
      wrapperSelector: '#leftPanel .pb-panel-column',
      shellSelector: '#leftPanel',
    });
    expect(css).toContain('#leftPanel .pb-panel-column { display: none !important');
    expect(css).toContain('#leftPanel { display: none !important');
  });

  it('merges only reader control styling per device; global-only fields pass through', () => {
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
            // Legacy device fields the public runtime cannot honor: the preview must
            // ignore them too, or it would show settings the published page drops.
            controls: { placement: 'overlay', style: { defaults: { padding: 30 } } },
            stage: { pageGap: 24 },
            panels: { right: { enabled: false } },
            showComments: false,
          },
        },
      },
    };

    expect(getEffectiveModuleConfig(module, { builderEditing: true, deviceId: 'mobile' })).toEqual(
      expect.objectContaining({
        // Global-only fields keep their base values regardless of device branches.
        displayMode: 'paged',
        showComments: true,
        controls: expect.objectContaining({
          placement: 'below',
          size: 'medium',
          style: {
            defaults: {
              appearance: { text: { color: '#ffffff' } },
              padding: 30,
            },
          },
        }),
        stage: expect.objectContaining({
          fit: 'dynamic-frame',
          pageGap: 8,
          frameBorder: true,
          maxWidth: 1200,
        }),
        panels: {
          left: { enabled: true },
          right: { enabled: true },
        },
      })
    );
  });
});

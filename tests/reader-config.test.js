import { describe, expect, it } from 'vitest';

import {
  getReaderMountDataAttributes,
  getReaderRuntimeConfig,
  normalizeReaderConfig,
  normalizeReaderResponsiveBranch,
} from '../admin/page-builder/reader-config.js';

describe('normalizeReaderConfig', () => {
  it('fills defaults for an empty config', () => {
    const config = normalizeReaderConfig({});
    expect(config.displayMode).toBe('paged');
    expect(config.showComments).toBe(true);
    expect(config.controls.placement).toBe('below');
    expect(config.controls.size).toBe('medium');
    expect(config.controls.style.defaults.appearance).toBe(null);
    expect(config.controls.style.primary.appearance).toBe(null);
    expect(config.stage).toEqual({
      fit: 'dynamic-frame',
      pageGap: 8,
      frameBorder: true,
      maxWidth: null,
    });
    // Panel existence is column-driven; the reader config no longer emits panels/showPanels.
    expect(config.panels).toBeUndefined();
    expect(config.showPanels).toBeUndefined();
  });

  it('coerces unknown keywords back to their defaults', () => {
    const config = normalizeReaderConfig({
      displayMode: 'nope',
      controls: { placement: 'sideways', size: 'huge' },
      stage: { fit: 'diagonal' },
    });
    expect(config.displayMode).toBe('paged');
    expect(config.controls.placement).toBe('below');
    expect(config.controls.size).toBe('medium');
    expect(config.stage.fit).toBe('dynamic-frame');
  });

  it('preserves valid keywords', () => {
    const config = normalizeReaderConfig({
      displayMode: 'vertical-scroll',
      controls: { placement: 'overlay', size: 'large' },
      stage: { fit: 'width' },
    });
    expect(config.displayMode).toBe('vertical-scroll');
    expect(config.controls.placement).toBe('overlay');
    expect(config.controls.size).toBe('large');
    expect(config.stage.fit).toBe('width');
  });

  it('clamps pageGap into [0, 64]', () => {
    expect(normalizeReaderConfig({ stage: { pageGap: -5 } }).stage.pageGap).toBe(0);
    expect(normalizeReaderConfig({ stage: { pageGap: 999 } }).stage.pageGap).toBe(64);
    expect(normalizeReaderConfig({ stage: { pageGap: 20 } }).stage.pageGap).toBe(20);
  });

  it('clamps maxWidth into [320, 2400] and treats empty as Auto (null)', () => {
    expect(normalizeReaderConfig({ stage: { maxWidth: 100 } }).stage.maxWidth).toBe(320);
    expect(normalizeReaderConfig({ stage: { maxWidth: 99999 } }).stage.maxWidth).toBe(2400);
    expect(normalizeReaderConfig({ stage: { maxWidth: 800 } }).stage.maxWidth).toBe(800);
    expect(normalizeReaderConfig({ stage: { maxWidth: null } }).stage.maxWidth).toBe(null);
    expect(normalizeReaderConfig({ stage: { maxWidth: '' } }).stage.maxWidth).toBe(null);
  });

  // F1: JS integer parsing must match Python int() so crafted input agrees
  // across the admin preview and the public/sanitized runtime.
  it('parses integers strictly, matching the backend, for pageGap', () => {
    expect(normalizeReaderConfig({ stage: { pageGap: 'wide' } }).stage.pageGap).toBe(8);
    expect(normalizeReaderConfig({ stage: { pageGap: '480px' } }).stage.pageGap).toBe(8);
    expect(normalizeReaderConfig({ stage: { pageGap: '12.5' } }).stage.pageGap).toBe(8);
    expect(normalizeReaderConfig({ stage: { pageGap: '12px' } }).stage.pageGap).toBe(8);
    expect(normalizeReaderConfig({ stage: { pageGap: '12' } }).stage.pageGap).toBe(12);
    expect(normalizeReaderConfig({ stage: { pageGap: 12 } }).stage.pageGap).toBe(12);
  });

  it('parses integers strictly, matching the backend, for maxWidth', () => {
    expect(normalizeReaderConfig({ stage: { maxWidth: 'wide' } }).stage.maxWidth).toBe(null);
    expect(normalizeReaderConfig({ stage: { maxWidth: '480px' } }).stage.maxWidth).toBe(null);
    expect(normalizeReaderConfig({ stage: { maxWidth: '12.5' } }).stage.maxWidth).toBe(null);
    expect(normalizeReaderConfig({ stage: { maxWidth: '500' } }).stage.maxWidth).toBe(500);
  });

  it('ignores legacy panels / showPanels input without emitting them', () => {
    // Old configs may still carry panels/showPanels; normalization tolerates them (never
    // throws) but never emits them, so nothing downstream can reintroduce a panel toggle.
    expect(normalizeReaderConfig({ showPanels: false }).showPanels).toBeUndefined();
    expect(
      normalizeReaderConfig({ panels: { left: { enabled: false }, right: { enabled: false } } })
        .panels
    ).toBeUndefined();
    expect(() =>
      normalizeReaderConfig({ showPanels: false, panels: { left: { enabled: true } } })
    ).not.toThrow();
  });
});

describe('normalizeReaderResponsiveBranch', () => {
  it('keeps only explicitly present keys', () => {
    expect(normalizeReaderResponsiveBranch({})).toEqual({});
    expect(normalizeReaderResponsiveBranch({ displayMode: 'vertical-scroll' })).toEqual({
      displayMode: 'vertical-scroll',
    });
    expect(normalizeReaderResponsiveBranch({ controls: { placement: 'overlay' } })).toEqual({
      controls: { placement: 'overlay' },
    });
  });

  it('drops device-unsafe stage fields, keeping only fit and pageGap', () => {
    expect(
      normalizeReaderResponsiveBranch({
        stage: { fit: 'width', frameBorder: false, maxWidth: 500 },
      })
    ).toEqual({ stage: { fit: 'width' } });
  });

  // Panel existence is column-driven, so a responsive branch never emits a `panels`
  // override, even when legacy input carries one.
  it('never emits a panels branch', () => {
    expect(normalizeReaderResponsiveBranch({ panels: { left: {} } })).toEqual({});
    expect(normalizeReaderResponsiveBranch({ panels: { left: { enabled: false } } })).toEqual({});
    expect(
      normalizeReaderResponsiveBranch({
        panels: { left: { enabled: false }, right: { enabled: true } },
      })
    ).toEqual({});
  });
});

describe('getReaderRuntimeConfig', () => {
  it('honors the authored display mode and mirrors it in requestedDisplayMode', () => {
    const runtime = getReaderRuntimeConfig({ displayMode: 'vertical-scroll' });
    expect(runtime.displayMode).toBe('vertical-scroll');
    expect(runtime.requestedDisplayMode).toBe('vertical-scroll');
  });

  it('defaults to paged when no display mode is authored', () => {
    const runtime = getReaderRuntimeConfig({});
    expect(runtime.displayMode).toBe('paged');
    expect(runtime.requestedDisplayMode).toBe('paged');
  });
});

describe('getReaderMountDataAttributes', () => {
  it('serializes normalized config to string data attributes', () => {
    const attrs = getReaderMountDataAttributes({
      controls: { placement: 'overlay', size: 'large' },
      stage: { pageGap: 12, frameBorder: false, maxWidth: 800 },
    });
    expect(attrs['data-display-mode']).toBe('paged');
    expect(attrs['data-controls-placement']).toBe('overlay');
    expect(attrs['data-controls-size']).toBe('large');
    expect(attrs['data-stage-page-gap']).toBe('12');
    expect(attrs['data-stage-frame-border']).toBe('false');
    expect(attrs['data-stage-max-width']).toBe('800');
    // Panel existence is column-driven — no panel-enablement attributes are emitted.
    expect(attrs['data-left-panel-enabled']).toBeUndefined();
    expect(attrs['data-right-panel-enabled']).toBeUndefined();
    expect(attrs['data-show-panels']).toBeUndefined();
  });

  it('emits an empty string for an Auto (null) maxWidth', () => {
    expect(getReaderMountDataAttributes({})['data-stage-max-width']).toBe('');
  });
});

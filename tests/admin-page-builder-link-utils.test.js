import { describe, expect, it } from 'vitest';

import {
  isBuilderPageTargetMissing,
  normalizeButtonItem,
  normalizeButtonsConfig,
  normalizeLinkTarget,
  normalizeHeaderNavItem,
  resolveLinkTargetHref,
  shouldOpenLinkInNewTab,
} from '../shared/page-builder/link-utils.js';

describe('admin page-builder link utilities', () => {
  it('normalizes unsafe urls to safe inert targets', () => {
    const normalized = normalizeLinkTarget({
      kind: 'url',
      url: 'javascript:alert(1)',
      openInNewTab: true,
    });

    expect(normalized).toEqual({
      kind: 'url',
      pageScope: 'series',
      seriesId: '',
      pageSlug: '',
      url: '#',
      hash: '',
      openInNewTab: false,
    });
    expect(resolveLinkTargetHref({ kind: 'url', url: '//evil.example' })).toBe('#');
    expect(resolveLinkTargetHref({ kind: 'url', url: 'javascript:alert(2)' })).toBe('#');
    expect(resolveLinkTargetHref({ kind: 'url', url: 'https://evil.example/a\u00a0b' })).toBe('#');
    expect(resolveLinkTargetHref({ kind: 'url', url: 'https://evil.example/a\u2028b' })).toBe('#');
    expect(
      shouldOpenLinkInNewTab({ kind: 'url', url: 'javascript:alert(3)', openInNewTab: true })
    ).toBe(false);
  });

  it('keeps valid builder-page and anchor targets in safe canonical form', () => {
    expect(
      normalizeLinkTarget({
        kind: 'builder-page',
        pageSlug: ' About Us!! ',
        seriesId: ' Space Saga ',
      })
    ).toEqual({
      kind: 'builder-page',
      pageScope: 'series',
      seriesId: 'space-saga',
      pageSlug: 'about-us',
      url: '',
      hash: '',
      openInNewTab: false,
    });

    expect(normalizeLinkTarget({ kind: 'anchor', hash: 'hero-section' }).hash).toBe(
      '#hero-section'
    );
    expect(normalizeLinkTarget({ kind: 'anchor', hash: '"><script>' }).hash).toBe('#');
  });

  it('uses seriesId when resolving and validating series builder-page targets', () => {
    const link = {
      kind: 'builder-page',
      pageScope: 'series',
      seriesId: 'space-saga',
      pageSlug: 'about',
    };

    expect(resolveLinkTargetHref(link)).toBe('index.html?series=space-saga&page=about');
    expect(
      isBuilderPageTargetMissing(link, [
        { scope: 'series', seriesId: 'battle-bros', slug: 'about' },
        { scope: 'global', seriesId: null, slug: 'about' },
      ])
    ).toBe(true);
    expect(
      isBuilderPageTargetMissing(link, [{ scope: 'series', seriesId: 'space-saga', slug: 'about' }])
    ).toBe(false);
    expect(isBuilderPageTargetMissing({ kind: 'builder-page', pageSlug: 'about' }, [])).toBe(true);
  });

  it('normalizeHeaderNavItem carries a style field defaulting to primary', () => {
    // No stored style → defaults to primary
    const defaultItem = normalizeHeaderNavItem({
      label: 'About',
      link: { kind: 'url', url: 'about.html' },
    });
    expect(defaultItem.style).toBe('primary');

    // Explicit secondary is preserved
    const secondaryItem = normalizeHeaderNavItem({
      label: 'Comics',
      style: 'secondary',
      link: { kind: 'url', url: 'comics.html' },
    });
    expect(secondaryItem.style).toBe('secondary');

    // Unknown/invalid style falls back to primary
    const badStyleItem = normalizeHeaderNavItem({
      label: 'Shop',
      style: 'danger',
      link: { kind: 'url', url: 'shop.html' },
    });
    expect(badStyleItem.style).toBe('primary');

    // Explicit primary is preserved
    const primaryItem = normalizeHeaderNavItem({
      label: 'Home',
      style: 'primary',
      link: { kind: 'builder-page', pageSlug: 'reader' },
    });
    expect(primaryItem.style).toBe('primary');
  });

  it('normalizeHeaderNavItem preserves a valid appearance payload', () => {
    const item = normalizeHeaderNavItem({
      label: 'About',
      appearance: {
        background: {
          color: '#123456',
          opacity: 0.5,
        },
        text: {
          color: '#ffffff',
        },
      },
      link: { kind: 'url', url: 'about.html' },
    });

    expect(item.appearance).toEqual({
      background: {
        type: null,
        color: '#123456',
        secondaryColor: null,
        angle: null,
        opacity: 0.5,
      },
      text: {
        color: '#ffffff',
        size: null,
        weight: null,
        transform: null,
      },
      border: {
        width: null,
        style: null,
        color: null,
        opacity: null,
        radius: null,
      },
    });
  });

  it('normalizeHeaderNavItem returns appearance null when none is provided', () => {
    const item = normalizeHeaderNavItem({
      label: 'About',
      link: { kind: 'url', url: 'about.html' },
    });

    expect(item.appearance).toBeNull();
  });

  it('normalizeButtonItem preserves a valid appearance payload', () => {
    const button = normalizeButtonItem({
      text: 'Read More',
      appearance: {
        border: {
          width: 2,
          style: 'dashed',
          color: '#00d9ff',
        },
      },
      link: { kind: 'builder-page', pageSlug: 'reader' },
    });

    expect(button.appearance).toEqual({
      background: {
        type: null,
        color: null,
        secondaryColor: null,
        angle: null,
        opacity: null,
      },
      text: {
        color: null,
        size: null,
        weight: null,
        transform: null,
      },
      border: {
        width: 2,
        style: 'dashed',
        color: '#00d9ff',
        opacity: null,
        radius: null,
      },
    });
  });

  it('normalizeButtonsConfig normalizes defaults.appearance', () => {
    const config = normalizeButtonsConfig({
      defaults: {
        appearance: {
          background: {
            color: '#222222',
          },
        },
      },
      buttons: [],
      heading: 'CTA',
    });

    expect(config.heading).toBe('CTA');
    expect(config.defaults).toEqual({
      appearance: {
        background: {
          type: null,
          color: '#222222',
          secondaryColor: null,
          angle: null,
          opacity: null,
        },
        text: {
          color: null,
          size: null,
          weight: null,
          transform: null,
        },
        border: {
          width: null,
          style: null,
          color: null,
          opacity: null,
          radius: null,
        },
      },
    });
  });
});

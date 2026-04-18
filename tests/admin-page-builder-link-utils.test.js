import { describe, expect, it } from 'vitest';

import {
  normalizeLinkTarget,
  normalizeHeaderNavItem,
  resolveLinkTargetHref,
  shouldOpenLinkInNewTab,
} from '../admin/page-builder/link-utils.js';

describe('admin page-builder link utilities', () => {
  it('normalizes unsafe urls to safe inert targets', () => {
    const normalized = normalizeLinkTarget({
      kind: 'url',
      url: 'javascript:alert(1)',
      openInNewTab: true,
    });

    expect(normalized).toEqual({
      kind: 'url',
      pageSlug: '',
      url: '#',
      hash: '',
      openInNewTab: false,
    });
    expect(resolveLinkTargetHref({ kind: 'url', url: '//evil.example' })).toBe('#');
    expect(resolveLinkTargetHref({ kind: 'url', url: 'javascript:alert(2)' })).toBe('#');
    expect(shouldOpenLinkInNewTab({ kind: 'url', url: 'javascript:alert(3)', openInNewTab: true })).toBe(false);
  });

  it('keeps valid builder-page and anchor targets in safe canonical form', () => {
    expect(
      normalizeLinkTarget({
        kind: 'builder-page',
        pageSlug: ' About Us!! ',
      })
    ).toEqual({
      kind: 'builder-page',
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

  it('normalizeHeaderNavItem carries a style field defaulting to primary', () => {
    // No stored style → defaults to primary
    const defaultItem = normalizeHeaderNavItem({ label: 'About', link: { kind: 'url', url: 'about.html' } });
    expect(defaultItem.style).toBe('primary');

    // Explicit secondary is preserved
    const secondaryItem = normalizeHeaderNavItem({ label: 'Comics', style: 'secondary', link: { kind: 'url', url: 'comics.html' } });
    expect(secondaryItem.style).toBe('secondary');

    // Unknown/invalid style falls back to primary
    const badStyleItem = normalizeHeaderNavItem({ label: 'Shop', style: 'danger', link: { kind: 'url', url: 'shop.html' } });
    expect(badStyleItem.style).toBe('primary');

    // Explicit primary is preserved
    const primaryItem = normalizeHeaderNavItem({ label: 'Home', style: 'primary', link: { kind: 'builder-page', pageSlug: 'reader' } });
    expect(primaryItem.style).toBe('primary');
  });
});


import { afterEach, describe, expect, it, vi } from 'vitest';

import { initEntryGalleryModules } from '../reader/entry-gallery-module.js';
import { initMediaGalleryModules } from '../reader/media-gallery-module.js';

function jsonResponse(body, options = {}) {
  const { ok = true, status = 200, statusText = 'OK' } = options;
  return {
    ok,
    status,
    statusText,
    json: async () => body,
  };
}

describe('reader CMS builder modules', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('mounts media-gallery from media.json and filters private/premium items', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        expect(url).toBe('/media.json');
        return jsonResponse([
          { path: 'media/public.jpg', access: 'public', tags: ['covers'] },
          { path: 'protected/media/premium.jpg', access: 'premium', tags: ['covers'] },
          { path: 'media/private.jpg', access: 'private', tags: ['covers'] },
        ]);
      })
    );
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="pb-media-gallery-mount"
        data-columns="2"
        data-limit="10"
        data-show-captions="true"
        data-include-premium="false"
        data-source-config='{"mode":"site","filters":{"access":"all"},"sort":"path"}'></div>
    `;

    await initMediaGalleryModules(root);

    const items = root.querySelectorAll('.pb-media-gallery-item');
    expect(items).toHaveLength(1);
    expect(items[0].querySelector('img')?.getAttribute('src')).toBe('/media/public.jpg');
    expect(root.textContent).toContain('covers');
  });

  it('mounts entry-gallery for a specific series and all series', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url === '/series.json') {
          return jsonResponse({ series: [{ id: 'battle-bros' }, { id: 'other-series' }] });
        }
        if (url === 'data.json') {
          return jsonResponse({
            entries: { Issue: ['media/issue.jpg'] },
            entryMeta: { Issue: { displayNumber: 1, showInGallery: true } },
            unitLabelSingular: 'Issue',
          });
        }
        if (url === 'series/other-series/data.json') {
          return jsonResponse({
            entries: { Special: ['protected/comics/special.jpg'] },
            entryMeta: { Special: { displayNumber: 2, showInGallery: true, premium: true } },
            unitLabelSingular: 'Special',
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      })
    );
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="pb-entry-gallery-mount"
        data-columns="3"
        data-show-labels="true"
        data-source-config='{"mode":"all-series","filters":{"access":"all"},"sort":"title"}'></div>
    `;

    await initEntryGalleryModules(root);

    const items = root.querySelectorAll('.pb-entry-gallery-item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Issue 1 - Issue');
    expect(items[1].querySelector('img')?.getAttribute('src')).toBe(
      '/api/protected/comics/special.jpg'
    );
  });
});

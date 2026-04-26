/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountAdminDom, stubAdminGlobals } from './helpers/admin-fixture.js';

describe('admin media manager', () => {
  beforeEach(() => {
    vi.resetModules();
    mountAdminDom();
    stubAdminGlobals(vi);
  });

  it('renders the empty media state in the live admin markup', async () => {
    const [{ createMediaManager }, { state }] = await Promise.all([
      import('../admin/media.js'),
      import('../admin/state.js'),
    ]);

    state.pageConfig = { site: {} };
    state.posts = [];
    state.mediaItems = [];

    const manager = createMediaManager({
      hideAllSections: vi.fn(),
      setActiveNav: vi.fn(),
    });

    manager.showMediaSection();

    expect(document.getElementById('mediaSection').style.display).toBe('block');
    expect(document.getElementById('mediaList').textContent).toContain(
      'No media found. Add an item above.'
    );
    expect(document.getElementById('mediaGallery').textContent).toContain('No media to preview.');
  });
});

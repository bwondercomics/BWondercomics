import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flushAdminUi, mountAdminDom, stubAdminGlobals } from './helpers/admin-fixture.js';

async function setupDesigner() {
  vi.resetModules();
  mountAdminDom();
  stubAdminGlobals(vi);

  const { createDesigner } = await import('../admin/designer.js');
  const hideAllSections = vi.fn();
  const setActiveNav = vi.fn();
  const manager = createDesigner({
    sanitizeSeriesId: (value) =>
      String(value || '')
        .trim()
        .toLowerCase(),
    getActiveSeriesId: () => 'battle-bros',
    hideAllSections,
    setActiveNav,
  });

  return { manager, hideAllSections, setActiveNav };
}

describe('admin designer', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('builds the designer iframe URL and shows the designer section for the active series', async () => {
    const { manager, hideAllSections, setActiveNav } = await setupDesigner();

    manager.showDesignerSection();
    await flushAdminUi(2);

    const frame = document.getElementById('designerFrame');
    expect(hideAllSections).toHaveBeenCalled();
    expect(frame?.dataset.series).toBe('battle-bros');
    expect(frame?.getAttribute('src')).toContain('designer.html?series=battle-bros&embed=1');
    expect(document.getElementById('designerSection')?.style.display).toBe('block');
    expect(setActiveNav).toHaveBeenCalled();
  });

  it('does not rewrite the iframe src for the same series unless forced', async () => {
    const { manager } = await setupDesigner();
    const frame = document.getElementById('designerFrame');

    manager.setDesignerFrameSrc('battle-bros');
    const initialSrc = frame?.getAttribute('src');
    manager.setDesignerFrameSrc('battle-bros');
    expect(frame?.getAttribute('src')).toBe(initialSrc);

    manager.setDesignerFrameSrc('stealth-mode', true);
    expect(frame?.getAttribute('src')).toContain('series=stealth-mode');
  });

  it('applies resize messages only from the live designer iframe and same origin', async () => {
    const { manager } = await setupDesigner();
    const frame = document.getElementById('designerFrame');
    manager.initDesignerFrame();
    manager.setDesignerFrameSrc('battle-bros', true);

    const sourceWindow = frame?.contentWindow;
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        source: sourceWindow,
        data: { type: 'designer:resize', height: 720 },
      })
    );
    expect(frame?.style.height).toBe('720px');

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://evil.example',
        source: sourceWindow,
        data: { type: 'designer:resize', height: 1100 },
      })
    );
    expect(frame?.style.height).toBe('720px');
  });
});

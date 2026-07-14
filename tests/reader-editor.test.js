import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bindReaderEditorEvents,
  normalizeReaderDraftConfig,
  renderReaderEditor,
} from '../admin/page-builder/reader-editor.js';

function mountReaderEditor({
  draftConfig = {},
  deviceOnly = false,
  activeDeviceId = 'desktop',
  responsiveEditScope = 'global',
  withSourceFields = false,
} = {}) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderReaderEditor(draftConfig, { deviceOnly });

  if (withSourceFields) {
    const modeSelect = document.createElement('select');
    modeSelect.setAttribute('data-source-key', 'mode');
    modeSelect.innerHTML =
      '<option value="active-page-series">Active</option>' +
      '<option value="specific-series">Specific</option>';
    modeSelect.value = draftConfig?.source?.mode || 'active-page-series';
    const seriesInput = document.createElement('input');
    seriesInput.type = 'text';
    seriesInput.setAttribute('data-source-key', 'seriesId');
    seriesInput.value = draftConfig?.source?.seriesId || '';
    wrapper.appendChild(modeSelect);
    wrapper.appendChild(seriesInput);
  }

  document.body.innerHTML = '';
  document.body.appendChild(wrapper);

  const setDraftConfig = vi.fn();
  const markDirty = vi.fn();
  const renderEditorPanel = vi.fn();

  bindReaderEditorEvents({
    el: { pbModuleEditor: wrapper },
    draftConfig,
    setDraftConfig,
    renderEditorPanel,
    markDirty,
    activeDeviceId,
    responsiveEditScope,
  });

  return { wrapper, setDraftConfig, markDirty, renderEditorPanel };
}

describe('renderReaderEditor', () => {
  it('renders all four inspector sections in global scope', () => {
    const html = renderReaderEditor({});
    expect(html).toContain('Display And Controls');
    expect(html).toContain('Reader Controls');
    expect(html).toContain('Stage');
    // Panel on/off toggles were retired; panels are styled via the Column/Panel inspector.
    expect(html).toContain('Comments');
    expect(html).not.toContain('data-reader-key="panels.left.enabled"');
    expect(html).not.toContain('data-reader-key="panels.right.enabled"');
    expect(html).toContain('data-reader-key="controls.placement"');
    expect(html).toContain('data-reader-key="stage.maxWidth"');
  });

  it('offers a selectable vertical-scroll display mode', () => {
    const html = renderReaderEditor({});
    expect(html).toContain('value="vertical-scroll"');
    expect(html).not.toContain('value="vertical-scroll" disabled');
  });

  it('marks vertical-scroll as selected when authored', () => {
    expect(renderReaderEditor({ displayMode: 'vertical-scroll' })).toMatch(
      /value="vertical-scroll"\s+selected/
    );
  });

  it('offers only button padding and control appearance in deviceOnly scope', () => {
    const html = renderReaderEditor({}, { deviceOnly: true });
    expect(html).toContain('Reader Controls');
    expect(html).toContain('data-reader-key="controls.style.defaults.padding"');
    // Global-only fields must not be authorable per device: the published page applies
    // them at mount and cannot vary them, so offering them here would preview settings
    // the public page ignores.
    expect(html).not.toContain('data-reader-key="displayMode"');
    expect(html).not.toContain('data-reader-key="controls.placement"');
    expect(html).not.toContain('data-reader-key="controls.size"');
    expect(html).not.toContain('data-reader-key="stage.fit"');
    expect(html).not.toContain('data-reader-key="stage.pageGap"');
    expect(html).not.toContain('data-reader-key="showComments"');
    expect(html).not.toContain('data-reader-key="controls.style.glow"');
    expect(html).not.toContain('data-reader-key="stage.frameBorder"');
    expect(html).not.toContain('data-reader-key="stage.maxWidth"');
  });
});

describe('normalizeReaderDraftConfig', () => {
  it('prunes empty responsive overrides and absent appearance', () => {
    const next = normalizeReaderDraftConfig({
      source: { mode: 'active-page-series' },
      responsive: {},
    });
    expect(next.responsive).toBeUndefined();
    expect(next.controls.style).toBeUndefined();
    expect(next.controls.placement).toBe('below');
  });
});

describe('bindReaderEditorEvents', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('commits reader-key changes to the config root in global scope', () => {
    const { wrapper, setDraftConfig, markDirty, renderEditorPanel } = mountReaderEditor();

    const placement = wrapper.querySelector('[data-reader-key="controls.placement"]');
    placement.value = 'overlay';
    placement.dispatchEvent(new Event('change', { bubbles: true }));

    expect(setDraftConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        controls: expect.objectContaining({ placement: 'overlay' }),
      })
    );
    expect(markDirty).toHaveBeenCalledWith('module');
    // Selects trigger a re-render so appearance controls can refresh.
    expect(renderEditorPanel).toHaveBeenCalled();
  });

  it('writes reader-key changes into responsive[deviceId] in device scope', () => {
    const { wrapper, setDraftConfig } = mountReaderEditor({
      deviceOnly: true,
      activeDeviceId: 'mobile',
      responsiveEditScope: 'device',
    });

    const padding = wrapper.querySelector('[data-reader-key="controls.style.defaults.padding"]');
    padding.value = '30';
    padding.dispatchEvent(new Event('input', { bubbles: true }));

    const committed = setDraftConfig.mock.lastCall[0];
    expect(committed.responsive.mobile).toEqual({
      controls: { style: { defaults: { padding: 30 } } },
    });
    // Device overrides must not leak into the base config.
    expect(committed.controls.style?.defaults?.padding).toBeUndefined();
  });

  it('syncs source fields into config.source in global scope', () => {
    const { wrapper, setDraftConfig } = mountReaderEditor({
      draftConfig: { source: { mode: 'specific-series', seriesId: 'battle-bros' } },
      withSourceFields: true,
    });

    const seriesInput = wrapper.querySelector('[data-source-key="seriesId"]');
    seriesInput.value = 'kid-cosmic';
    seriesInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(setDraftConfig.mock.lastCall[0].source).toEqual(
      expect.objectContaining({ mode: 'specific-series', seriesId: 'kid-cosmic' })
    );
  });

  it('drops seriesId when the source mode is not specific-series', () => {
    const { wrapper, setDraftConfig } = mountReaderEditor({
      draftConfig: { source: { mode: 'specific-series', seriesId: 'battle-bros' } },
      withSourceFields: true,
    });

    const modeSelect = wrapper.querySelector('[data-source-key="mode"]');
    modeSelect.value = 'active-page-series';
    modeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const committed = setDraftConfig.mock.lastCall[0];
    expect(committed.source.mode).toBe('active-page-series');
    expect(committed.source.seriesId).toBeUndefined();
  });

  it('does not sync source fields in device scope', () => {
    const { wrapper, setDraftConfig } = mountReaderEditor({
      deviceOnly: true,
      activeDeviceId: 'mobile',
      responsiveEditScope: 'device',
      withSourceFields: true,
    });

    const modeSelect = wrapper.querySelector('[data-source-key="mode"]');
    modeSelect.value = 'specific-series';
    modeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    expect(setDraftConfig).not.toHaveBeenCalled();
  });
});

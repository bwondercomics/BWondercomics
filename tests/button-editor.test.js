import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bindButtonsEditorEvents,
  renderButtonsEditor,
} from '../admin/page-builder/button-editor.js';

function mountButtonsEditor({
  draftConfig = {
    buttons: [
      {
        text: 'About',
        style: 'primary',
        link: {
          kind: 'builder-page',
          pageSlug: 'about',
        },
      },
    ],
  },
  pages = [
    { slug: 'about', title: 'About' },
    { slug: 'reader', title: 'Reader' },
  ],
} = {}) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderButtonsEditor(draftConfig, pages);
  document.body.innerHTML = '';
  document.body.appendChild(wrapper);

  const setDraftConfig = vi.fn();
  const markDirty = vi.fn();
  const renderEditorPanel = vi.fn();

  bindButtonsEditorEvents({
    el: { pbModuleEditor: wrapper },
    draftConfig,
    setDraftConfig,
    renderEditorPanel,
    markDirty,
  });

  return {
    wrapper,
    setDraftConfig,
    markDirty,
    renderEditorPanel,
  };
}

function getAppearanceControl(wrapper, { scope, key, kind, index = 0 }) {
  return wrapper.querySelector(
    [
      kind === 'toggle' ? '[data-appearance-toggle="true"]' : '[data-appearance-input="true"]',
      `[data-appearance-scope="${scope}"]`,
      `[data-appearance-key="${key}"]`,
      scope === 'button' ? `[data-item-index="${index}"]` : '',
    ].join('')
  );
}

describe('button editor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('writes defaults appearance controls into config.defaults.appearance', () => {
    const { wrapper, setDraftConfig, markDirty, renderEditorPanel } = mountButtonsEditor();

    const colorInput = getAppearanceControl(wrapper, {
      scope: 'defaults',
      key: 'background.color',
      kind: 'input',
    });
    const colorToggle = getAppearanceControl(wrapper, {
      scope: 'defaults',
      key: 'background.color',
      kind: 'toggle',
    });

    colorInput.value = '#112233';
    colorToggle.checked = true;
    colorToggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(setDraftConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        defaults: {
          appearance: {
            background: {
              color: '#112233',
            },
          },
        },
      })
    );
    expect(markDirty).toHaveBeenCalledWith('module');
    expect(renderEditorPanel).toHaveBeenCalledTimes(1);
  });

  it('writes per-button appearance controls into buttons[*].appearance', () => {
    const { wrapper, setDraftConfig, renderEditorPanel } = mountButtonsEditor();

    const textColorInput = getAppearanceControl(wrapper, {
      scope: 'button',
      key: 'text.color',
      kind: 'input',
    });
    const textColorToggle = getAppearanceControl(wrapper, {
      scope: 'button',
      key: 'text.color',
      kind: 'toggle',
    });

    textColorInput.value = '#ffee00';
    textColorToggle.checked = true;
    textColorToggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(setDraftConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        buttons: [
          expect.objectContaining({
            appearance: {
              text: {
                color: '#ffee00',
              },
            },
          }),
        ],
      })
    );
    expect(renderEditorPanel).toHaveBeenCalledTimes(1);
  });

  it('removes unchecked appearance leaves while keeping sibling overrides', () => {
    const { wrapper, setDraftConfig, renderEditorPanel } = mountButtonsEditor({
      draftConfig: {
        buttons: [
          {
            text: 'About',
            style: 'primary',
            link: {
              kind: 'builder-page',
              pageSlug: 'about',
            },
            appearance: {
              background: {
                color: '#112233',
              },
              border: {
                color: '#445566',
              },
            },
          },
        ],
      },
    });

    const borderToggle = getAppearanceControl(wrapper, {
      scope: 'button',
      key: 'border.color',
      kind: 'toggle',
    });

    borderToggle.checked = false;
    borderToggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(setDraftConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        buttons: [
          expect.objectContaining({
            appearance: {
              background: {
                color: '#112233',
              },
            },
          }),
        ],
      })
    );
    expect(setDraftConfig.mock.lastCall[0].buttons[0].appearance.border).toBeUndefined();
    expect(renderEditorPanel).toHaveBeenCalledTimes(1);
  });

  it('keeps preset and link editing working alongside appearance controls', () => {
    const { wrapper, setDraftConfig, markDirty, renderEditorPanel } = mountButtonsEditor();

    const styleSelect = wrapper.querySelector('[data-item-key="style"]');
    styleSelect.value = 'secondary';
    styleSelect.dispatchEvent(new Event('change', { bubbles: true }));

    expect(setDraftConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        buttons: [
          expect.objectContaining({
            style: 'secondary',
          }),
        ],
      })
    );

    const pageSelect = wrapper.querySelector('[data-item-key="pageSlug"]');
    pageSelect.value = 'reader';
    pageSelect.dispatchEvent(new Event('change', { bubbles: true }));

    expect(setDraftConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        buttons: [
          expect.objectContaining({
            link: expect.objectContaining({
              kind: 'builder-page',
              pageSlug: 'reader',
            }),
          }),
        ],
      })
    );
    expect(markDirty).toHaveBeenCalledWith('module');
    expect(renderEditorPanel).not.toHaveBeenCalled();
  });
});

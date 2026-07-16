import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BUILDER_PREVIEW_MESSAGE_TYPES,
  BUILDER_PREVIEW_SNAPSHOT_VERSION,
  PREVIEW_VIEWPORTS,
  buildPreviewInlineEditMessage,
  buildPreviewMetricsMessage,
  buildPreviewTargetMessage,
} from '../shared/page-builder/preview-contract.js';
import { buildContractFixture, getContractFixture } from './helpers/contracts.js';
import { flushAdminUi } from './helpers/admin-fixture.js';
import {
  createDataTransfer,
  createDragLikeEvent,
  createKeyboardLikeEvent,
  enterChromePreview,
  enterEditMode,
  enterPreviewMode,
  getCssRule,
  getInspectorSectionContaining,
  getPreviewFrame,
  getPreviewIframe,
  getPreviewScaleShell,
  getPreviewStatus,
  openBuilderPage,
  readCss,
  requestCurrentPreviewSnapshot,
  restoreChromePreview,
  selectCanvasColumn,
  sendPreviewTargetSelect,
  sendPreviewTargets,
  setViewportWidth,
  setupPageBuilder,
  withReaderModule,
  attachPreviewIframeWindow,
  dispatchPreviewMessageFromIframe,
} from './helpers/admin-page-builder-shell.js';

describe('page-builder section settings and target selection', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('opens section settings and supports discard/save flows', async () => {
    const selectedPage = getContractFixture('builderPage');
    const editableSection = selectedPage.sections[1];
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      updateSectionResult: {
        id: editableSection.id,
        settings: {
          moduleGap: 28,
          columnGap: 24,
          sectionGap: 40,
        },
      },
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] [data-action="toggle-section-settings"]`
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    expect(
      document.querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-input[data-setting="moduleGap"]`
      )?.value
    ).toBe('20');
    expect(
      document.querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-input[data-setting="columnGap"]`
      )?.value
    ).toBe('24');

    const moduleGapInput = document.querySelector(
      `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-input[data-setting="moduleGap"]`
    );
    if (moduleGapInput) {
      moduleGapInput.value = '28';
      moduleGapInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await flushAdminUi(1);

    expect(
      document.querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-status`
      )?.textContent
    ).toContain('unsaved changes');

    document
      .querySelector('[data-action="discard-section-settings"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    expect(
      document.querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-input[data-setting="moduleGap"]`
      )?.value
    ).toBe('20');

    const savedModuleGapInput = document.querySelector(
      `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-input[data-setting="moduleGap"]`
    );
    const savedSectionGapInput = document.querySelector(
      `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-input[data-setting="sectionGap"]`
    );
    if (savedModuleGapInput) {
      savedModuleGapInput.value = '28';
      savedModuleGapInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (savedSectionGapInput) {
      savedSectionGapInput.value = '40';
      savedSectionGapInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await flushAdminUi(1);

    document
      .querySelector('[data-action="save-section-settings"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.updateSection).toHaveBeenCalledWith(
      editableSection.id,
      {
        layout: '1-1',
        settings: {
          moduleGap: 28,
          columnGap: 24,
          panelEnabled: {
            left: true,
            right: true,
          },
          sectionGap: 40,
        },
      },
      expect.objectContaining({
        onError: expect.any(Function),
      })
    );
    expect(
      document.querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-input[data-setting="moduleGap"]`
      )?.value
    ).toBe('28');
    expect(
      document.querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-input[data-setting="sectionGap"]`
      )?.value
    ).toBe('40');
  });

  it('edits column count, ratios, and per-column styling and saves layout atomically', async () => {
    const selectedPage = getContractFixture('builderPage');
    const editableSection = selectedPage.sections[1]; // layout '1-1'
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      updateSectionResult: {
        id: editableSection.id,
        layout: '40-20-20-20',
        settings: { columns: [{ index: 0, appearance: { background: { color: '#123456' } } }] },
      },
      useRealEditors: true,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] [data-action="toggle-section-settings"]`
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    // Grow to 4 columns.
    const countSelect = document.getElementById('pbEditSectionColumnCount');
    expect(countSelect).not.toBeNull();
    countSelect.value = '4';
    countSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);

    // Four column cards now render.
    expect(document.querySelectorAll('[data-column-ratio]').length).toBe(4);

    // Widen the first column (widths are percents of the row; the others renormalize)
    // and give it a background through the shared sanitized appearance editor.
    const ratioInput = document.querySelector('[data-column-ratio][data-column-index="0"]');
    ratioInput.value = '40';
    ratioInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);

    await selectCanvasColumn(editableSection.id, 0);

    const backgroundToggle = document.querySelector(
      '[data-appearance-toggle="true"][data-appearance-scope="section-column"][data-appearance-key="background.color"][data-item-index="0"]'
    );
    backgroundToggle.checked = true;
    backgroundToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);

    const backgroundInput = document.querySelector(
      '[data-appearance-input="true"][data-appearance-input-kind="hex"][data-appearance-scope="section-column"][data-appearance-key="background.color"][data-item-index="0"]'
    );
    backgroundInput.value = '#123456';
    backgroundInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAdminUi(2);

    document
      .querySelector('[data-action="save-section-settings"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.updateSection).toHaveBeenCalledWith(
      editableSection.id,
      expect.objectContaining({
        layout: '40-20-20-20',
        settings: expect.objectContaining({
          columns: expect.arrayContaining([
            expect.objectContaining({
              index: 0,
              appearance: { background: { color: '#123456' } },
            }),
          ]),
        }),
      }),
      expect.objectContaining({
        onError: expect.any(Function),
      })
    );
  });

  it('preserves section inspector option state across draft rerenders', async () => {
    const selectedPage = getContractFixture('builderPage');
    const editableSection = selectedPage.sections[1]; // layout '1-1'
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] [data-action="toggle-section-settings"]`
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    getInspectorSectionContaining('#pbEditSectionColumnCount').open = true;
    getInspectorSectionContaining('#pbEditSectionModuleGap').open = true;

    const countSelect = document.getElementById('pbEditSectionColumnCount');
    countSelect.value = '4';
    countSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);

    expect(getInspectorSectionContaining('#pbEditSectionColumnCount')?.open).toBe(true);
    expect(getInspectorSectionContaining('#pbEditSectionModuleGap')?.open).toBe(true);

    getInspectorSectionContaining('#pbEditSectionModuleGap').open = false;

    const ratioInput = document.querySelector('[data-column-ratio][data-column-index="0"]');
    ratioInput.value = '2';
    ratioInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);

    expect(getInspectorSectionContaining('#pbEditSectionColumnCount')?.open).toBe(true);
    expect(getInspectorSectionContaining('#pbEditSectionModuleGap')?.open).toBe(false);

    await selectCanvasColumn(editableSection.id, 0);

    const backgroundToggleSelector =
      '[data-appearance-toggle="true"][data-appearance-scope="section-column"]' +
      '[data-appearance-key="background.color"][data-item-index="0"]';
    const backgroundToggle = document.querySelector(backgroundToggleSelector);
    const backgroundGroup = backgroundToggle.closest('details.pb-appearance-group');
    backgroundGroup.open = true;
    backgroundToggle.checked = true;
    backgroundToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);

    expect(
      document.querySelector(backgroundToggleSelector)?.closest('details.pb-appearance-group')?.open
    ).toBe(true);
  });

  it('sends unsaved section layout and appearance drafts to live preview and restores on discard', async () => {
    const selectedPage = getContractFixture('builderPage');
    const editableSection = selectedPage.sections[1];
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    enterPreviewMode();
    document
      .querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] [data-action="toggle-section-settings"]`
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    const countSelect = document.getElementById('pbEditSectionColumnCount');
    countSelect.value = '4';
    countSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);

    const ratioInput = document.querySelector('[data-column-ratio][data-column-index="0"]');
    ratioInput.value = '40';
    ratioInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);

    await selectCanvasColumn(editableSection.id, 0);

    const backgroundToggle = document.querySelector(
      '[data-appearance-toggle="true"][data-appearance-scope="section-column"][data-appearance-key="background.color"][data-item-index="0"]'
    );
    backgroundToggle.checked = true;
    backgroundToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);
    const backgroundInput = document.querySelector(
      '[data-appearance-input="true"][data-appearance-input-kind="hex"][data-appearance-scope="section-column"][data-appearance-key="background.color"][data-item-index="0"]'
    );
    backgroundInput.value = '#123456';
    backgroundInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAdminUi(2);

    const draftSnapshot = requestCurrentPreviewSnapshot();
    const draftSection = draftSnapshot.page.sections.find(
      (section) => section.id === editableSection.id
    );
    expect(draftSnapshot.source).toBe('working');
    expect(draftSection.layout).toBe('40-20-20-20');
    expect(draftSection.settings.columns[0].appearance.background.color).toBe('#123456');
    expect(editableSection.layout).toBe('1-1');
    expect(mocks.updateSection).not.toHaveBeenCalled();

    document
      .querySelector('[data-action="discard-current"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    const restoredSnapshot = requestCurrentPreviewSnapshot();
    const restoredSection = restoredSnapshot.page.sections.find(
      (section) => section.id === editableSection.id
    );
    expect(restoredSnapshot.source).toBe('saved');
    expect(restoredSection.layout).toBe('1-1');
    expect(restoredSection.settings.columns).toBeUndefined();
    expect(mocks.updateSection).not.toHaveBeenCalled();
  });

  it('authors responsive track layouts and per-device column styles without changing structure', async () => {
    const selectedPage = getContractFixture('builderPage');
    const editableSection = selectedPage.sections[1];
    editableSection.layout = '1-1-1-1';
    editableSection.settings = {
      ...(editableSection.settings || {}),
      columns: [{ index: 0, alignment: 'center' }],
    };
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      updateSectionResult: {
        ...editableSection,
        settings: {
          ...editableSection.settings,
          responsive: { mobile: { layout: '50-25-25' } },
          columns: [
            {
              index: 0,
              alignment: 'center',
              responsive: {
                mobile: {
                  appearance: { text: { color: '#abcdef' } },
                  padding: { top: 12 },
                  alignment: 'stretch',
                  minHeight: 240,
                  hidden: true,
                },
              },
            },
          ],
        },
      },
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] [data-action="toggle-section-settings"]`
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    document
      .querySelector('#pbWidthToggles [data-width="mobile"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);
    const scopeSelect = document.querySelector('[data-responsive-edit-scope]');
    scopeSelect.value = 'device';
    scopeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);

    const countSelect = document.getElementById('pbEditSectionColumnCount');
    expect(
      Array.from(countSelect.options)
        .map((option) => option.value)
        .slice(-4)
    ).toEqual(['1', '2', '3', '4']);
    countSelect.value = '3';
    countSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);

    const firstRatio = document.querySelector('[data-column-ratio][data-column-index="0"]');
    firstRatio.value = '50';
    firstRatio.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);

    await selectCanvasColumn(editableSection.id, 0);

    const textToggle = document.querySelector(
      '[data-appearance-toggle="true"][data-appearance-scope="section-column"][data-appearance-key="text.color"][data-item-index="0"]'
    );
    textToggle.checked = true;
    textToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);
    const textInput = document.querySelector(
      '[data-appearance-input="true"][data-appearance-input-kind="hex"][data-appearance-scope="section-column"][data-appearance-key="text.color"][data-item-index="0"]'
    );
    textInput.value = '#abcdef';
    textInput.dispatchEvent(new Event('input', { bubbles: true }));

    const paddingInput = document.querySelector(
      '[data-column-field="paddingTop"][data-column-index="0"]'
    );
    paddingInput.value = '12';
    paddingInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);
    const alignmentSelect = document.querySelector(
      '[data-column-field="alignment"][data-column-index="0"]'
    );
    alignmentSelect.value = 'stretch';
    alignmentSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);
    const minHeightInput = document.querySelector(
      '[data-column-field="minHeight"][data-column-index="0"]'
    );
    minHeightInput.value = '240';
    minHeightInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);
    const visibilitySelect = document.querySelector(
      '[data-column-field="hidden"][data-column-index="0"]'
    );
    visibilitySelect.value = 'true';
    visibilitySelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);

    document
      .querySelector('[data-action="save-section-settings"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.updateSection).toHaveBeenCalledWith(
      editableSection.id,
      expect.objectContaining({
        layout: '1-1-1-1',
        settings: expect.objectContaining({
          responsive: {
            mobile: {
              layout: '50-25-25',
            },
          },
          columns: expect.arrayContaining([
            expect.objectContaining({
              index: 0,
              responsive: {
                mobile: {
                  appearance: { text: { color: '#abcdef' } },
                  padding: { top: 12 },
                  alignment: 'stretch',
                  minHeight: 240,
                  hidden: true,
                },
              },
            }),
          ]),
        }),
      }),
      expect.objectContaining({
        onError: expect.any(Function),
      })
    );
  });

  it('wires the complete column appearance editor into undo, clearing, and discard', async () => {
    const selectedPage = getContractFixture('builderPage');
    const editableSection = selectedPage.sections[1];
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] [data-action="toggle-section-settings"]`
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    await selectCanvasColumn(editableSection.id, 0);

    const appearanceKeys = Array.from(
      document.querySelectorAll(
        '[data-appearance-toggle="true"][data-appearance-scope="section-column"][data-item-index="0"]'
      )
    ).map((toggle) => toggle.dataset.appearanceKey);
    expect(appearanceKeys).toEqual(
      expect.arrayContaining([
        'background.type',
        'background.color',
        'background.opacity',
        'text.color',
        'border.width',
        'border.style',
        'border.color',
        'border.opacity',
        'border.radius',
      ])
    );
    // Gradient-only fields are hidden while the background type is Solid (the default).
    expect(appearanceKeys).not.toContain('background.secondaryColor');
    expect(appearanceKeys).not.toContain('background.angle');

    const setAppearanceField = async (key, value, inputKind = '') => {
      const toggleSelector =
        `[data-appearance-toggle="true"][data-appearance-scope="section-column"]` +
        `[data-appearance-key="${key}"][data-item-index="0"]`;
      const toggle = document.querySelector(toggleSelector);
      if (!toggle.checked) {
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
        await flushAdminUi(2);
      }
      const kindSelector = inputKind
        ? `[data-appearance-input-kind="${inputKind}"]`
        : ':not([data-appearance-input-kind="hex"])';
      const input = document.querySelector(
        `[data-appearance-input="true"]${kindSelector}` +
          `[data-appearance-scope="section-column"][data-appearance-key="${key}"]` +
          '[data-item-index="0"]'
      );
      input.value = String(value);
      input.dispatchEvent(
        new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })
      );
      await flushAdminUi(2);
    };

    await setAppearanceField('background.type', 'gradient');
    await setAppearanceField('background.color', '#112233', 'hex');
    await setAppearanceField('background.secondaryColor', '#445566', 'hex');
    await setAppearanceField('background.opacity', '0.5');
    await setAppearanceField('text.color', '#ffffff', 'hex');
    await setAppearanceField('border.width', '2');
    await setAppearanceField('border.style', 'dashed');
    await setAppearanceField('border.color', '#778899', 'hex');
    await setAppearanceField('border.opacity', '0.75');
    await setAppearanceField('border.radius', '14');

    let snapshot = requestCurrentPreviewSnapshot();
    let appearance = snapshot.page.sections.find((section) => section.id === editableSection.id)
      .settings.columns[0].appearance;
    expect(appearance).toEqual({
      background: {
        type: 'gradient',
        color: '#112233',
        secondaryColor: '#445566',
        opacity: 0.5,
      },
      text: { color: '#ffffff' },
      border: {
        width: 2,
        style: 'dashed',
        color: '#778899',
        opacity: 0.75,
        radius: 14,
      },
    });

    document
      .querySelector('[data-action="undo-current"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);
    snapshot = requestCurrentPreviewSnapshot();
    appearance = snapshot.page.sections.find((section) => section.id === editableSection.id)
      .settings.columns[0].appearance;
    expect(appearance.border.radius).toBe(6);

    const textToggle = document.querySelector(
      '[data-appearance-toggle="true"][data-appearance-scope="section-column"][data-appearance-key="text.color"][data-item-index="0"]'
    );
    textToggle.checked = false;
    textToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);
    snapshot = requestCurrentPreviewSnapshot();
    appearance = snapshot.page.sections.find((section) => section.id === editableSection.id)
      .settings.columns[0].appearance;
    expect(appearance.text).toBeUndefined();

    document
      .querySelector('[data-action="discard-current"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);
    snapshot = requestCurrentPreviewSnapshot();
    expect(
      snapshot.page.sections.find((section) => section.id === editableSection.id).settings.columns
    ).toBeUndefined();
    expect(mocks.updateSection).not.toHaveBeenCalled();
  });

  it('supports undo and redo of section column-count changes', async () => {
    const selectedPage = getContractFixture('builderPage');
    const editableSection = selectedPage.sections[1]; // layout '1-1'
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] [data-action="toggle-section-settings"]`
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    const columnCount = () => {
      const layout = requestCurrentPreviewSnapshot().page.sections.find(
        (section) => section.id === editableSection.id
      ).layout;
      return String(layout || '1').split('-').length;
    };

    expect(columnCount()).toBe(2);

    const countSelect = document.getElementById('pbEditSectionColumnCount');
    countSelect.value = '4';
    countSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);
    expect(columnCount()).toBe(4);

    document
      .querySelector('[data-action="undo-current"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);
    expect(columnCount()).toBe(2);

    document
      .querySelector('[data-action="redo-current"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);
    expect(columnCount()).toBe(4);
  });

  it('redoes a per-column style edit after undo', async () => {
    const selectedPage = getContractFixture('builderPage');
    const editableSection = selectedPage.sections[1];
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] [data-action="toggle-section-settings"]`
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    await selectCanvasColumn(editableSection.id, 0);

    const setAppearanceField = async (key, value) => {
      const toggle = document.querySelector(
        `[data-appearance-toggle="true"][data-appearance-scope="section-column"]` +
          `[data-appearance-key="${key}"][data-item-index="0"]`
      );
      if (!toggle.checked) {
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
        await flushAdminUi(2);
      }
      const input = document.querySelector(
        `[data-appearance-input="true"]:not([data-appearance-input-kind="hex"])` +
          `[data-appearance-scope="section-column"][data-appearance-key="${key}"][data-item-index="0"]`
      );
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await flushAdminUi(2);
    };

    const columnRadius = () =>
      requestCurrentPreviewSnapshot().page.sections.find(
        (section) => section.id === editableSection.id
      ).settings.columns[0].appearance.border.radius;

    await setAppearanceField('border.radius', '14');
    expect(columnRadius()).toBe(14);

    document
      .querySelector('[data-action="undo-current"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);
    expect(columnRadius()).not.toBe(14);

    document
      .querySelector('[data-action="redo-current"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);
    expect(columnRadius()).toBe(14);
  });

  it('selects a column from the canvas and opens the unified column inspector', async () => {
    const selectedPage = getContractFixture('builderPage');
    const editableSection = selectedPage.sections[1]; // layout '1-1'
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    await selectCanvasColumn(editableSection.id, 1);

    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Column 2');
    expect(
      document.querySelector('[data-column-field="minHeight"][data-column-index="1"]')
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-appearance-toggle="true"][data-appearance-scope="section-column"][data-item-index="1"]'
      )
    ).not.toBeNull();
    // A normal column keeps its alignment control (only reader panels hide it).
    expect(
      document.querySelector('[data-column-field="alignment"][data-column-index="1"]')
    ).not.toBeNull();
  });

  it('escalates from a populated module to its parent column via the module inspector', async () => {
    const selectedPage = getContractFixture('builderPage');
    const feedModule = selectedPage.sections[1].modules.find(
      (module) => module.moduleType === 'feed'
    ); // columnIndex 1
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    document
      .querySelector(`.pb-module[data-module-id="${feedModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);
    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Feed Module');

    const parentButton = document.getElementById('pbEditParentColumn');
    expect(parentButton).not.toBeNull();
    parentButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Column 2');
    expect(
      document.querySelector('[data-column-field="minHeight"][data-column-index="1"]')
    ).not.toBeNull();
  });

  it('edits a reader panel column: shows column-owned Panel Surface controls and saves panelGap onto the column', async () => {
    const selectedPage = getContractFixture('builderPage');
    const readerSection = selectedPage.sections[1]; // layout '1-1' -> left/right panels
    selectedPage.meta = {
      ...selectedPage.meta,
      panelBackgrounds: {},
      panelSpacing: {},
    };
    readerSection.settings = {
      ...readerSection.settings,
      columns: [
        {
          index: 0,
          panelBackground: {
            path: 'media/panels/column-left.png',
            fit: 'cover',
            focus: 'center',
            opacity: 0.5,
          },
          panelGap: 14,
        },
      ],
    };
    // Make it a reader section so column 0/last map to the left/right panels.
    readerSection.modules = [
      ...readerSection.modules,
      {
        id: 'reader-mod-panel-test',
        moduleType: 'reader',
        columnIndex: 0,
        sortIndex: 0,
        config: { showComments: false },
      },
    ];
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    await selectCanvasColumn(readerSection.id, 0);

    // Panel-specific inspector: labelled as the left panel, exposes the relocated Panel Surface
    // controls, and (since the align-self fix) the alignment control too.
    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Left Panel');
    const bgPath = document.querySelector('.pb-column-panel-bg-path');
    const bgPick = document.querySelector('.pb-column-panel-bg-pick');
    expect(bgPath?.value).toBe('media/panels/column-left.png');
    expect(bgPath?.disabled).toBe(false);
    expect(bgPath?.dataset.panelLegacyFallback).toBeUndefined();
    expect(bgPick).not.toBeNull();
    expect(bgPick?.disabled).toBe(false);
    expect(
      document.querySelector('[data-column-field="alignment"][data-column-index="0"]')
    ).not.toBeNull();

    const gapInput = document.querySelector(
      '[data-column-field="panelGap"][data-column-index="0"]'
    );
    expect(gapInput).not.toBeNull();
    gapInput.value = '18';
    gapInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);

    // Draft-backed: the edit is reflected before saving (the input re-renders from the draft).
    expect(
      document
        .querySelector('[data-column-field="panelGap"][data-column-index="0"]')
        ?.getAttribute('value')
    ).toBe('18');

    document
      .querySelector('[data-action="save-section-settings"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.updateSection).toHaveBeenCalledWith(
      readerSection.id,
      expect.objectContaining({
        settings: expect.objectContaining({
          columns: expect.arrayContaining([expect.objectContaining({ index: 0, panelGap: 18 })]),
        }),
      }),
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it('master border switch writes width 0 when turned off and restores a visible border when turned on', async () => {
    const selectedPage = getContractFixture('builderPage');
    const readerSection = selectedPage.sections[1]; // layout '1-1' -> left/right panels
    readerSection.settings = {
      ...readerSection.settings,
      columns: [
        {
          index: 0,
          appearance: { border: { width: 3, style: 'dashed', color: '#ff00ea' } },
        },
      ],
    };
    readerSection.modules = [
      ...readerSection.modules,
      {
        id: 'reader-mod-border-toggle-test',
        moduleType: 'reader',
        columnIndex: 0,
        sortIndex: 0,
        config: { showComments: false },
      },
    ];
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    await selectCanvasColumn(readerSection.id, 0);

    const masterSelector = '[data-appearance-border-master="true"][data-item-index="0"]';
    const widthSelector =
      '[data-appearance-input="true"][data-appearance-scope="section-column"][data-appearance-key="border.width"][data-item-index="0"]';
    let master = document.querySelector(masterSelector);
    expect(master).not.toBeNull();
    expect(master.checked).toBe(true);
    expect(master.dataset.prevWidth).toBe('3');

    // Off: explicit width 0 (renders `border: none`); other border fields are preserved.
    master.checked = false;
    master.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);
    expect(document.querySelector(widthSelector)?.getAttribute('value')).toBe('0');

    // On again: a visible width comes back (the re-rendered toggle falls back to the
    // default width once the stored width is 0).
    master = document.querySelector(masterSelector);
    expect(master.checked).toBe(false);
    master.checked = true;
    master.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAdminUi(2);
    expect(document.querySelector(widthSelector)?.getAttribute('value')).toBe('2');

    document
      .querySelector('[data-action="save-section-settings"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.updateSection).toHaveBeenCalledWith(
      readerSection.id,
      expect.objectContaining({
        settings: expect.objectContaining({
          columns: expect.arrayContaining([
            expect.objectContaining({
              index: 0,
              appearance: expect.objectContaining({
                border: expect.objectContaining({ width: 2, style: 'dashed', color: '#ff00ea' }),
              }),
            }),
          ]),
        }),
      }),
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it('shows legacy meta-only panel surface values as disabled fallback fields', async () => {
    const selectedPage = getContractFixture('builderPage');
    const readerSection = selectedPage.sections[1]; // layout '1-1' -> left/right panels
    selectedPage.meta = {
      ...selectedPage.meta,
      panelBackgrounds: {
        left: {
          path: 'media/panels/legacy-left.png',
          fit: 'contain',
          focus: 'top',
          opacity: 0.4,
          hideEmptyText: true,
        },
      },
      panelSpacing: {
        left: 22,
      },
    };
    readerSection.settings = {
      ...readerSection.settings,
      columns: [{ index: 0, padding: { top: 4 } }],
    };
    readerSection.modules = [
      ...readerSection.modules,
      {
        id: 'reader-mod-panel-fallback-test',
        moduleType: 'reader',
        columnIndex: 0,
        sortIndex: 0,
        config: { showComments: false },
      },
    ];
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      useRealEditors: true,
    });

    await openBuilderPage(manager);
    await selectCanvasColumn(readerSection.id, 0);

    const bgPath = document.querySelector('.pb-column-panel-bg-path');
    const bgPick = document.querySelector('.pb-column-panel-bg-pick');
    const bgClear = document.querySelector('.pb-column-panel-bg-clear');
    const opacity = document.querySelector('.pb-column-panel-bg-opacity');
    const emptyToggle = document.querySelector('.pb-column-panel-empty-toggle');
    const gapInput = document.querySelector(
      '[data-column-field="panelGap"][data-column-index="0"]'
    );

    expect(bgPath?.value).toBe('media/panels/legacy-left.png');
    expect(bgPath?.dataset.panelLegacyFallback).toBe('true');
    expect(bgPath?.disabled).toBe(true);
    expect(bgPick?.dataset.panelLegacyFallback).toBe('true');
    expect(bgPick?.disabled).toBe(true);
    expect(bgClear?.disabled).toBe(true);
    expect(opacity?.value).toBe('0.4');
    expect(opacity?.disabled).toBe(true);
    expect(emptyToggle?.checked).toBe(true);
    expect(emptyToggle?.disabled).toBe(true);
    expect(gapInput?.value).toBe('22');
    expect(gapInput?.dataset.panelLegacyFallback).toBe('true');
    expect(gapInput?.disabled).toBe(true);
    expect(document.querySelector('.pb-column-panel-legacy-note')?.textContent).toContain(
      'migration'
    );

    gapInput.value = '30';
    gapInput.dispatchEvent(new Event('change', { bubbles: true }));
    bgClear.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    expect(mocks.updateSection).not.toHaveBeenCalled();
  });

  it('clears selected module state when a module is deleted from the canvas', async () => {
    const selectedPage = getContractFixture('builderPage');
    const feedModule = selectedPage.sections[1].modules.find(
      (module) => module.moduleType === 'feed'
    );
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      deleteModuleResult: true,
      useRealEditors: true,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector(`.pb-module[data-module-id="${feedModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    expect(document.getElementById('pbEditorTitle')?.textContent).toContain('Feed Module');

    document
      .querySelector(`.pb-module[data-module-id="${feedModule.id}"] [data-action="delete-module"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.deleteModule).toHaveBeenCalledWith(feedModule.id);
    expect(document.querySelector(`.pb-module[data-module-id="${feedModule.id}"]`)).toBeNull();
    expect(document.querySelector('.pb-module.selected')).toBeNull();
    expect(document.getElementById('pbEditorTitle')?.textContent).toContain(
      'Choose Something to Edit'
    );
    expect(document.getElementById('pbSaveModule')).toBeNull();
  });

  it('clears open section settings and stale selected module state when deleting a section', async () => {
    const selectedPage = getContractFixture('builderPage');
    const editableSection = selectedPage.sections[1];
    const textModule = editableSection.modules.find((module) => module.moduleType === 'text');
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
      deleteSectionResult: true,
      useRealEditors: true,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector(`.pb-module[data-module-id="${textModule.id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    document
      .querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] [data-action="toggle-section-settings"]`
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    expect(
      document.querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-card`
      )
    ).not.toBeNull();

    document
      .querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] [data-action="delete-section"]`
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.deleteSection).toHaveBeenCalledWith(editableSection.id);
    expect(
      document.querySelector(`.pb-section[data-section-id="${editableSection.id}"]`)
    ).toBeNull();
    expect(document.querySelector('.pb-module.selected')).toBeNull();
    expect(document.querySelector('.pb-section-settings-card')).toBeNull();
    expect(document.getElementById('pbEditorTitle')?.textContent).toContain(
      'Choose Something to Edit'
    );
  });

  it('preserves publication on Save Page and uses explicit publish-state actions', async () => {
    const selectedPage = getContractFixture('builderPage');
    const { manager, mocks } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();

    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(document.getElementById('pbPageTitle')?.textContent).not.toContain('Page ID:');
    expect(document.getElementById('pbPageTitle')?.textContent).toContain('reader');
    expect(document.getElementById('pbPageTitle')?.textContent).toContain('Published');
    expect(document.getElementById('pbPageTitle')?.textContent).toContain('Homepage');
    expect(document.getElementById('pbPageTitle')?.textContent).toContain(
      'Published page. Open Reader matches the public reader.'
    );

    const link = document.querySelector('.pb-open-reader-link');
    expect(link?.getAttribute('href')).toContain('../index.html?series=battle-bros&page=reader');
    expect(link?.getAttribute('href')).not.toContain('draft=1');
    expect(link?.textContent).toContain('Open Reader');

    document
      .getElementById('pbSaveDraft')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.updatePage).toHaveBeenCalledWith(
      selectedPage.id,
      expect.objectContaining({ isPublished: true })
    );
    expect(document.getElementById('pbPageTitle')?.textContent).toContain('Published');
    expect(document.getElementById('pbPageTitle')?.textContent).toContain(
      'Published page. Open Reader matches the public reader.'
    );
    expect(document.querySelector('.pb-open-reader-link')?.getAttribute('href')).not.toContain(
      'draft=1'
    );
    expect(document.querySelector('.pb-open-reader-link')?.textContent).toContain('Open Reader');
    expect(document.getElementById('pbSaveDraft')?.textContent).toBe('Save Page');
    expect(document.getElementById('pbPublish')?.textContent).toBe('Unpublish');

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    document.getElementById('pbPublish')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    expect(mocks.updatePage).toHaveBeenCalledWith(
      selectedPage.id,
      expect.objectContaining({ isPublished: false })
    );
    expect(window.confirm).toHaveBeenCalledWith(
      'Unpublish this page? It will no longer be public.'
    );
    expect(document.getElementById('pbPageTitle')?.textContent).toContain('Draft');
    expect(document.getElementById('pbPageTitle')?.textContent).toContain(
      'Draft page. Open Reader loads the draft preview until you publish changes.'
    );
    expect(document.querySelector('.pb-open-reader-link')?.getAttribute('href')).toContain(
      'draft=1'
    );
    expect(document.querySelector('.pb-open-reader-link')?.textContent).toContain(
      'Open Draft Preview'
    );
    expect(document.getElementById('pbPublish')?.textContent).toBe('Publish');
  });

  it('blocks page-header selection while section settings have unsaved changes', async () => {
    const selectedPage = getContractFixture('builderPage');
    const editableSection = selectedPage.sections[1];
    const { manager } = await setupPageBuilder({
      fetchPagesResults: [[selectedPage]],
      fetchPageResult: selectedPage,
    });

    await manager.showPageBuilderSection();
    document
      .querySelector('.pb-page-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(3);

    document
      .querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] [data-action="toggle-section-settings"]`
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(1);

    const moduleGapInput = document.querySelector(
      `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-input[data-setting="moduleGap"]`
    );
    if (moduleGapInput) {
      moduleGapInput.value = '28';
      moduleGapInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await flushAdminUi(1);

    document
      .querySelector('[data-action="select-page-header"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAdminUi(2);

    expect(document.getElementById('pbEditorTitle')?.textContent).not.toContain('Header Settings');
    expect(document.getElementById('pbSaveHeader')).toBeNull();
    expect(
      document.querySelector(
        `.pb-section[data-section-id="${editableSection.id}"] .pb-section-settings-card`
      )
    ).not.toBeNull();
    expect(document.querySelector('.pb-canvas-notice')?.textContent).toContain(
      'Save or discard your current changes before switching to the page header.'
    );
  });
});

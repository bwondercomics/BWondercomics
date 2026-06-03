import {
  cloneValue,
  isObject,
  removeAppearanceLeaf,
  renderAppearanceControls,
  setAppearanceLeaf,
  syncAppearanceColorInputs,
  toSparseAppearance,
} from './appearance-editor.js';
import { escapeAttr, escapeHtml } from './helpers.js';
import { renderInspectorSection } from './inspector-sections.js';
import { pruneEmptyResponsiveOverrides } from './responsive-overrides.js';
import {
  isBuilderPageTargetMissing,
  normalizeButtonsConfig,
  normalizeLinkTarget,
} from './link-utils.js';

function removeAppearanceProperty(source = {}) {
  const next = { ...source };
  delete next.appearance;
  return next;
}

function toSparseButtonsConfig(rawConfig = {}) {
  const normalized = normalizeButtonsConfig(rawConfig);
  const defaultsAppearance = toSparseAppearance(normalized.defaults?.appearance);
  const defaultsWithoutAppearance = removeAppearanceProperty(normalized.defaults || {});
  return {
    ...normalized,
    defaults: defaultsAppearance
      ? { ...defaultsWithoutAppearance, appearance: defaultsAppearance }
      : defaultsWithoutAppearance,
    buttons: normalized.buttons.map((button) => {
      const buttonWithoutAppearance = removeAppearanceProperty(button);
      const appearance = toSparseAppearance(button.appearance);
      return appearance ? { ...buttonWithoutAppearance, appearance } : buttonWithoutAppearance;
    }),
  };
}

function normalizeButtonsDraftConfig(rawConfig = {}) {
  const next = toSparseButtonsConfig(rawConfig);
  next.responsive = pruneEmptyResponsiveOverrides(next.responsive);
  if (!Object.keys(next.responsive).length) {
    delete next.responsive;
  }
  return next;
}

function renderLinkFields(button, index, pages) {
  const link = normalizeLinkTarget(button.link, '');
  const isMissingPage = isBuilderPageTargetMissing(link, pages);
  const options = pages
    .map((page) => {
      const slug = String(page?.slug || '').trim();
      const label = page?.title || slug || 'Untitled page';
      return `<option value="${escapeAttr(slug)}" ${link.pageSlug === slug ? 'selected' : ''}>${escapeHtml(label)} (${escapeHtml(slug)})</option>`;
    })
    .join('');

  return `
    <div class="pb-editor-field">
      <label class="pb-editor-label">Target Type</label>
      <select class="pb-editor-select pb-button-input" data-item-index="${index}" data-item-key="kind">
        <option value="builder-page" ${link.kind === 'builder-page' ? 'selected' : ''}>Builder Page</option>
        <option value="url" ${link.kind === 'url' ? 'selected' : ''}>URL</option>
        <option value="anchor" ${link.kind === 'anchor' ? 'selected' : ''}>Anchor</option>
      </select>
    </div>
    ${
      link.kind === 'builder-page'
        ? `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Builder Page</label>
        <select class="pb-editor-select pb-button-input" data-item-index="${index}" data-item-key="pageSlug">
          <option value="">Select a page</option>
          ${options}
        </select>
        ${
          isMissingPage
            ? '<p class="pb-editor-help" data-status="warning">Saved page slug is not in the current series.</p>'
            : ''
        }
      </div>
    `
        : ''
    }
    ${
      link.kind === 'url'
        ? `
      <div class="pb-editor-field">
        <label class="pb-editor-label">URL</label>
        <input type="text" class="pb-editor-input pb-button-input" data-item-index="${index}" data-item-key="url" value="${escapeAttr(link.url || '')}">
      </div>
      <div class="pb-editor-field">
        <label class="pb-editor-label">
          <input type="checkbox" class="pb-button-input" data-item-index="${index}" data-item-key="openInNewTab" ${link.openInNewTab ? 'checked' : ''}> Open external links in new tab
        </label>
      </div>
    `
        : ''
    }
    ${
      link.kind === 'anchor'
        ? `
      <div class="pb-editor-field">
        <label class="pb-editor-label">Anchor</label>
        <input type="text" class="pb-editor-input pb-button-input" data-item-index="${index}" data-item-key="hash" value="${escapeAttr(link.hash || '')}" placeholder="#section-id">
      </div>
    `
        : ''
    }
  `;
}

export function renderButtonsEditor(config = {}, pages = [], options = {}) {
  const normalized = normalizeButtonsConfig(config);
  const deviceOnly = options.deviceOnly === true;
  const styleOnly = options.styleOnly === true;
  const appearanceOnly = deviceOnly || styleOnly;
  const defaultsHtml = renderAppearanceControls(
    normalized.defaults?.appearance,
    'defaults',
    null,
    'Button Defaults',
    'Set sparse appearance defaults that buttons inherit unless a button override is enabled.'
  );
  const buttonsHtml = normalized.buttons
    .map(
      (button, index) => `
      <div class="pb-social-item pb-button-item" data-item-index="${index}">
        <div class="pb-promo-item-header">
          <div>
            <strong>${escapeHtml(button.text || `Button ${index + 1}`)}</strong>
            <div class="pb-editor-help">${
              deviceOnly
                ? 'Configure appearance overrides for this device.'
                : styleOnly
                  ? 'Configure appearance without changing labels or destinations.'
                  : 'Configure the label, style, and destination.'
            }</div>
          </div>
          ${
            appearanceOnly
              ? ''
              : `
          <div class="pb-promo-item-actions">
            <button type="button" class="pb-promo-action" data-action="move-up" ${index === 0 ? 'disabled' : ''} title="Move up">\u2191</button>
            <button type="button" class="pb-promo-action" data-action="move-down" ${index === normalized.buttons.length - 1 ? 'disabled' : ''} title="Move down">\u2193</button>
            <button type="button" class="pb-promo-action danger" data-action="remove" title="Remove">\u00D7</button>
          </div>
          `
          }
        </div>
        ${
          appearanceOnly
            ? ''
            : `
        <div class="pb-editor-field">
          <label class="pb-editor-label">Label</label>
          <input type="text" class="pb-editor-input pb-button-input" data-item-index="${index}" data-item-key="text" value="${escapeAttr(button.text || '')}">
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">Style</label>
          <select class="pb-editor-select pb-button-input" data-item-index="${index}" data-item-key="style">
            <option value="primary" ${button.style === 'primary' ? 'selected' : ''}>Primary</option>
            <option value="secondary" ${button.style === 'secondary' ? 'selected' : ''}>Secondary</option>
          </select>
        </div>
        <div class="pb-editor-field">
          <label class="pb-editor-label">
            <input type="checkbox" class="pb-button-input" data-item-index="${index}" data-item-key="enabled" ${button.enabled !== false ? 'checked' : ''}> Enabled
          </label>
        </div>
        ${renderLinkFields(button, index, pages)}
        `
        }
        ${renderAppearanceControls(
          button.appearance,
          'button',
          index,
          'Appearance Overrides',
          'Enable only the leaves you want to override for this button.'
        )}
      </div>
    `
    )
    .join('');

  return `
    ${renderInspectorSection({
      kicker: 'Appearance',
      title: 'Button Defaults',
      summary: normalized.defaults?.appearance ? 'Custom' : 'Default',
      copy: 'Define optional inline appearance defaults for the module before per-button overrides are applied.',
      body: defaultsHtml,
    })}
    ${renderInspectorSection({
      kicker: 'Navigation',
      title: appearanceOnly ? 'Button Appearance' : 'Buttons',
      summary: `${normalized.buttons.length} button${normalized.buttons.length === 1 ? '' : 's'}`,
      copy: appearanceOnly
        ? 'Tune button appearance without changing labels, links, or order.'
        : 'Create reusable buttons with internal page targets, anchors, or URLs.',
      body: `
        <div class="pb-promo-editor-list">
          ${buttonsHtml || '<div class="pb-promo-empty">No buttons configured.</div>'}
        </div>
        ${
          appearanceOnly
            ? ''
            : `
        <div class="pb-editor-actions">
          <button type="button" class="btn-secondary" id="pbButtonsAddButton">+ Add Button</button>
        </div>
        `
        }
      `,
    })}
  `;
}

function setLinkValue(button, key, input) {
  const nextLink = normalizeLinkTarget(button.link, '');
  if (key === 'kind') {
    nextLink.kind = input.value;
    nextLink.pageSlug = '';
    nextLink.url = '';
    nextLink.hash = '';
    nextLink.openInNewTab = false;
  } else if (key === 'openInNewTab') {
    nextLink.openInNewTab = input.checked;
  } else {
    nextLink[key] = input.value;
  }
  button.link = normalizeLinkTarget(nextLink, '');
}

export function bindButtonsEditorEvents({
  el,
  draftConfig,
  setDraftConfig,
  renderEditorPanel,
  markDirty,
  activeDeviceId = 'desktop',
  responsiveEditScope = 'global',
  styleOnly = false,
}) {
  let config = normalizeButtonsDraftConfig(draftConfig);
  const useDeviceAppearance = responsiveEditScope === 'device';

  const commit = (nextConfig, rerender = false) => {
    config = normalizeButtonsDraftConfig(nextConfig);
    setDraftConfig(config);
    markDirty('module');
    if (rerender) {
      renderEditorPanel();
    }
  };

  const resolveAppearanceTarget = (nextConfig, scope, index) => {
    if (useDeviceAppearance) {
      nextConfig.responsive =
        nextConfig.responsive && typeof nextConfig.responsive === 'object'
          ? nextConfig.responsive
          : {};
      const branch =
        nextConfig.responsive[activeDeviceId] &&
        typeof nextConfig.responsive[activeDeviceId] === 'object'
          ? nextConfig.responsive[activeDeviceId]
          : {};
      nextConfig.responsive[activeDeviceId] = branch;
      if (scope === 'defaults') {
        if (!isObject(branch.defaults)) branch.defaults = {};
        return branch.defaults;
      }
      if (!Number.isInteger(index)) return null;
      branch.buttons = Array.isArray(branch.buttons) ? branch.buttons : [];
      if (!isObject(branch.buttons[index])) {
        branch.buttons[index] = {};
      }
      const baseButton = nextConfig.buttons?.[index];
      if (baseButton?.id) {
        branch.buttons[index].id = baseButton.id;
      }
      return branch.buttons[index];
    }
    if (scope === 'defaults') {
      if (!isObject(nextConfig.defaults)) nextConfig.defaults = {};
      return nextConfig.defaults;
    }
    return Number.isInteger(index) ? nextConfig.buttons[index] : null;
  };

  const updateAppearanceTarget = (nextConfig, scope, index, key, value) => {
    const target = resolveAppearanceTarget(nextConfig, scope, index);
    if (!target || !key) return;
    const appearance = cloneValue(target.appearance) || {};
    setAppearanceLeaf(appearance, key, value);
    const sparse = toSparseAppearance(appearance);
    if (sparse) {
      target.appearance = sparse;
    } else {
      delete target.appearance;
    }
  };

  const removeAppearanceFromTarget = (nextConfig, scope, index, key) => {
    const target = resolveAppearanceTarget(nextConfig, scope, index);
    if (!target?.appearance || !key) return;
    const appearance = cloneValue(target.appearance);
    removeAppearanceLeaf(appearance, key);
    const sparse = toSparseAppearance(appearance);
    if (sparse) {
      target.appearance = sparse;
    } else {
      delete target.appearance;
    }
  };

  const getAppearanceInput = ({ scope, index, key }) =>
    el.pbModuleEditor.querySelector(
      [
        '[data-appearance-input="true"]',
        `[data-appearance-scope="${scope}"]`,
        `[data-appearance-key="${key}"]`,
        scope === 'button' ? `[data-item-index="${index}"]` : '',
      ].join('')
    );

  if (!useDeviceAppearance && !styleOnly) {
    document.getElementById('pbButtonsAddButton')?.addEventListener('click', () => {
      const nextConfig = normalizeButtonsConfig(config);
      nextConfig.buttons.push({
        id: `btn-${Date.now()}`,
        text: 'New Button',
        enabled: true,
        style: 'primary',
        link: normalizeLinkTarget({ kind: 'builder-page' }),
      });
      commit(nextConfig, true);
    });

    el.pbModuleEditor.querySelectorAll('.pb-button-item').forEach((itemEl) => {
      const index = parseInt(itemEl.dataset.itemIndex, 10);

      itemEl.querySelector('[data-action="remove"]')?.addEventListener('click', () => {
        const nextConfig = normalizeButtonsConfig(config);
        nextConfig.buttons.splice(index, 1);
        commit(nextConfig, true);
      });

      itemEl.querySelector('[data-action="move-up"]')?.addEventListener('click', () => {
        if (index <= 0) return;
        const nextConfig = normalizeButtonsConfig(config);
        [nextConfig.buttons[index - 1], nextConfig.buttons[index]] = [
          nextConfig.buttons[index],
          nextConfig.buttons[index - 1],
        ];
        commit(nextConfig, true);
      });

      itemEl.querySelector('[data-action="move-down"]')?.addEventListener('click', () => {
        if (index >= config.buttons.length - 1) return;
        const nextConfig = normalizeButtonsConfig(config);
        [nextConfig.buttons[index], nextConfig.buttons[index + 1]] = [
          nextConfig.buttons[index + 1],
          nextConfig.buttons[index],
        ];
        commit(nextConfig, true);
      });
    });

    el.pbModuleEditor.querySelectorAll('.pb-button-input').forEach((input) => {
      const eventName =
        input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(eventName, () => {
        const index = parseInt(input.dataset.itemIndex, 10);
        const key = input.dataset.itemKey;
        const nextConfig = normalizeButtonsConfig(config);
        const button = nextConfig.buttons[index];
        if (!button || !key) return;
        if (['kind', 'pageSlug', 'url', 'hash', 'openInNewTab'].includes(key)) {
          setLinkValue(button, key, input);
          commit(nextConfig, key === 'kind');
          return;
        }
        if (input.type === 'checkbox') {
          button[key] = input.checked;
        } else {
          button[key] = input.value;
        }
        commit(nextConfig);
      });
    });
  }

  el.pbModuleEditor.querySelectorAll('[data-appearance-toggle="true"]').forEach((toggle) => {
    toggle.addEventListener('change', () => {
      const scope = toggle.dataset.appearanceScope;
      const key = toggle.dataset.appearanceKey;
      const index = toggle.dataset.itemIndex ? parseInt(toggle.dataset.itemIndex, 10) : null;
      if (!scope || !key) return;
      const nextConfig = normalizeButtonsConfig(config);
      if (toggle.checked) {
        const pairedInput = getAppearanceInput({ scope, index, key });
        if (!pairedInput) return;
        updateAppearanceTarget(nextConfig, scope, index, key, pairedInput.value);
      } else {
        removeAppearanceFromTarget(nextConfig, scope, index, key);
      }
      commit(nextConfig, true);
    });
  });

  el.pbModuleEditor.querySelectorAll('[data-appearance-input="true"]').forEach((input) => {
    const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      if (input.disabled) return;
      const scope = input.dataset.appearanceScope;
      const key = input.dataset.appearanceKey;
      const index = input.dataset.itemIndex ? parseInt(input.dataset.itemIndex, 10) : null;
      if (!scope || !key) return;
      const value = syncAppearanceColorInputs(el.pbModuleEditor, input);
      if (value === null) return;
      const nextConfig = normalizeButtonsConfig(config);
      updateAppearanceTarget(nextConfig, scope, index, key, value);
      commit(nextConfig);
    });
  });
}

export function cloneButtonsConfig(config = {}) {
  return cloneValue(normalizeButtonsDraftConfig(config));
}

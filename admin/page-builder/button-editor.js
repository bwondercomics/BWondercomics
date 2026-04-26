import { escapeAttr, escapeHtml } from './helpers.js';
import { normalizeAppearance } from './appearance-utils.js';
import {
  isBuilderPageTargetMissing,
  normalizeButtonsConfig,
  normalizeLinkTarget,
} from './link-utils.js';

const APPEARANCE_GROUPS = [
  {
    title: 'Background',
    fields: [
      {
        key: 'background.type',
        label: 'Type',
        inputType: 'select',
        defaultValue: 'solid',
        options: [
          ['solid', 'Solid'],
          ['gradient', 'Gradient'],
        ],
      },
      {
        key: 'background.color',
        label: 'Color',
        inputType: 'color',
        defaultValue: '#00d9ff',
      },
      {
        key: 'background.secondaryColor',
        label: 'Secondary Color',
        inputType: 'color',
        defaultValue: '#ffed00',
      },
      {
        key: 'background.angle',
        label: 'Angle',
        inputType: 'number',
        defaultValue: 135,
        min: 0,
        max: 360,
        step: 1,
      },
      {
        key: 'background.opacity',
        label: 'Opacity',
        inputType: 'range',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.05,
      },
    ],
  },
  {
    title: 'Text',
    fields: [
      {
        key: 'text.color',
        label: 'Color',
        inputType: 'color',
        defaultValue: '#ffffff',
      },
    ],
  },
  {
    title: 'Border',
    fields: [
      {
        key: 'border.width',
        label: 'Width',
        inputType: 'number',
        defaultValue: 2,
        min: 0,
        max: 20,
        step: 1,
      },
      {
        key: 'border.style',
        label: 'Style',
        inputType: 'select',
        defaultValue: 'solid',
        options: [
          ['solid', 'Solid'],
          ['dashed', 'Dashed'],
          ['dotted', 'Dotted'],
        ],
      },
      {
        key: 'border.color',
        label: 'Color',
        inputType: 'color',
        defaultValue: '#00d9ff',
      },
      {
        key: 'border.opacity',
        label: 'Opacity',
        inputType: 'range',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.05,
      },
      {
        key: 'border.radius',
        label: 'Radius',
        inputType: 'number',
        defaultValue: 6,
        min: 0,
        max: 200,
        step: 1,
      },
    ],
  },
];

const APPEARANCE_FIELDS = APPEARANCE_GROUPS.flatMap((group) => group.fields);

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getAppearanceLeaf(appearance, path) {
  return path.split('.').reduce((value, segment) => {
    if (!isObject(value)) return null;
    return value[segment] ?? null;
  }, appearance);
}

function setAppearanceLeaf(target, path, value) {
  const segments = path.split('.');
  let cursor = target;
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      cursor[segment] = value;
      return;
    }
    if (!isObject(cursor[segment])) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  });
}

function pruneEmptyBranches(target) {
  if (!isObject(target)) return true;
  Object.keys(target).forEach((key) => {
    if (isObject(target[key]) && pruneEmptyBranches(target[key])) {
      delete target[key];
    }
  });
  return Object.keys(target).length === 0;
}

function removeAppearanceLeaf(target, path) {
  const segments = path.split('.');
  let cursor = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    if (!isObject(cursor?.[segments[index]])) return;
    cursor = cursor[segments[index]];
  }
  delete cursor?.[segments[segments.length - 1]];
  pruneEmptyBranches(target);
}

function toSparseAppearance(appearance) {
  const normalized = normalizeAppearance(appearance);
  if (!normalized) return null;
  const sparse = {};
  APPEARANCE_FIELDS.forEach((field) => {
    const value = getAppearanceLeaf(normalized, field.key);
    if (value != null) {
      setAppearanceLeaf(sparse, field.key, value);
    }
  });
  return Object.keys(sparse).length ? sparse : null;
}

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

function renderAppearanceInput(field, scope, index, value, checked) {
  const indexAttr = scope === 'button' ? ` data-item-index="${index}"` : '';
  const disabledAttr = checked ? '' : ' disabled';
  const commonAttrs = `class="pb-editor-input pb-button-appearance-input" data-appearance-input="true" data-appearance-scope="${scope}" data-appearance-key="${field.key}"${indexAttr}${disabledAttr}`;

  if (field.inputType === 'select') {
    const options = field.options
      .map(
        ([optionValue, optionLabel]) =>
          `<option value="${escapeAttr(optionValue)}" ${optionValue === value ? 'selected' : ''}>${escapeHtml(optionLabel)}</option>`
      )
      .join('');
    return `<select class="pb-editor-select pb-button-appearance-input" data-appearance-input="true" data-appearance-scope="${scope}" data-appearance-key="${field.key}"${indexAttr}${disabledAttr}>${options}</select>`;
  }

  if (field.inputType === 'color') {
    return `<input type="color" class="pb-promo-style-color pb-button-appearance-input" data-appearance-input="true" data-appearance-scope="${scope}" data-appearance-key="${field.key}"${indexAttr} value="${escapeAttr(String(value))}"${disabledAttr}>`;
  }

  if (field.inputType === 'range') {
    return `<input type="range" class="pb-promo-style-range pb-button-appearance-input" data-appearance-input="true" data-appearance-scope="${scope}" data-appearance-key="${field.key}"${indexAttr} min="${field.min}" max="${field.max}" step="${field.step}" value="${escapeAttr(String(value))}"${disabledAttr}>`;
  }

  return `<input type="number" ${commonAttrs} min="${field.min}" max="${field.max}" step="${field.step}" value="${escapeAttr(String(value))}">`;
}

function renderAppearanceControls(appearance, scope, index = null, title, copy) {
  const groupsHtml = APPEARANCE_GROUPS.map((group) => {
    const fieldsHtml = group.fields
      .map((field) => {
        const value = getAppearanceLeaf(appearance, field.key);
        const checked = value != null;
        const resolvedValue = checked ? value : field.defaultValue;
        const indexAttr = scope === 'button' ? ` data-item-index="${index}"` : '';

        return `
          <div class="pb-editor-field pb-editor-field--row pb-button-appearance-row">
            <label class="pb-button-appearance-toggle">
              <input type="checkbox" class="pb-button-appearance-enable" data-appearance-toggle="true" data-appearance-scope="${scope}" data-appearance-key="${field.key}"${indexAttr} ${checked ? 'checked' : ''}>
              <span>${escapeHtml(field.label)}</span>
            </label>
            ${renderAppearanceInput(field, scope, index, resolvedValue, checked)}
          </div>
        `;
      })
      .join('');

    return `
      <div class="pb-style-group">
        <div class="pb-style-group-title">${escapeHtml(group.title)}</div>
        ${fieldsHtml}
      </div>
    `;
  }).join('');

  return `
    <div class="pb-button-appearance-card">
      <div class="pb-editor-section-head pb-editor-section-head--compact">
        <div>
          <h5 class="pb-editor-section-title">${escapeHtml(title)}</h5>
        </div>
        <p class="pb-editor-section-copy">${escapeHtml(copy)}</p>
      </div>
      <div class="pb-button-appearance-groups">
        ${groupsHtml}
      </div>
    </div>
  `;
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

export function renderButtonsEditor(config = {}, pages = []) {
  const normalized = normalizeButtonsConfig(config);
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
            <div class="pb-editor-help">Configure the label, style, and destination.</div>
          </div>
          <div class="pb-promo-item-actions">
            <button type="button" class="pb-promo-action" data-action="move-up" ${index === 0 ? 'disabled' : ''} title="Move up">\u2191</button>
            <button type="button" class="pb-promo-action" data-action="move-down" ${index === normalized.buttons.length - 1 ? 'disabled' : ''} title="Move down">\u2193</button>
            <button type="button" class="pb-promo-action danger" data-action="remove" title="Remove">\u00D7</button>
          </div>
        </div>
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
    <section class="pb-editor-section-card">
      <div class="pb-editor-section-head">
        <div>
          <span class="pb-editor-section-kicker">Appearance</span>
          <h4 class="pb-editor-section-title">Button Defaults</h4>
        </div>
        <p class="pb-editor-section-copy">Define optional inline appearance defaults for the module before per-button overrides are applied.</p>
      </div>
      ${defaultsHtml}
    </section>
    <section class="pb-editor-section-card">
      <div class="pb-editor-section-head">
        <div>
          <span class="pb-editor-section-kicker">Navigation</span>
          <h4 class="pb-editor-section-title">Buttons</h4>
        </div>
        <p class="pb-editor-section-copy">Create reusable buttons with internal page targets, anchors, or URLs.</p>
      </div>
      <div class="pb-promo-editor-list">
        ${buttonsHtml || '<div class="pb-promo-empty">No buttons. Click "+ Add Button" to create one.</div>'}
      </div>
      <div class="pb-editor-actions">
        <button type="button" class="btn-secondary" id="pbButtonsAddButton">+ Add Button</button>
      </div>
    </section>
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
}) {
  let config = toSparseButtonsConfig(draftConfig);

  const commit = (nextConfig, rerender = false) => {
    config = toSparseButtonsConfig(nextConfig);
    setDraftConfig(config);
    markDirty('module');
    if (rerender) {
      renderEditorPanel();
    }
  };

  const resolveAppearanceTarget = (nextConfig, scope, index) => {
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
    const eventName = input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';
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
      const nextConfig = normalizeButtonsConfig(config);
      updateAppearanceTarget(nextConfig, scope, index, key, input.value);
      commit(nextConfig);
    });
  });
}

export function cloneButtonsConfig(config = {}) {
  return cloneValue(toSparseButtonsConfig(config));
}

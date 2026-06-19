import { escapeAttr, escapeHtml } from './helpers.js';
import { normalizeAppearance } from './appearance-utils.js';

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
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

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

function renderAppearanceInput(field, scope, index, value, checked, ariaLabel = field.label) {
  const indexAttr = Number.isInteger(index) ? ` data-item-index="${index}"` : '';
  const disabledAttr = checked ? '' : ' disabled';
  const labelAttr = ` aria-label="${escapeAttr(ariaLabel)}"`;
  const commonAttrs = `class="pb-editor-input pb-appearance-input" data-appearance-input="true" data-appearance-scope="${scope}" data-appearance-key="${field.key}"${indexAttr}${disabledAttr}${labelAttr}`;

  if (field.inputType === 'select') {
    const options = field.options
      .map(
        ([optionValue, optionLabel]) =>
          `<option value="${escapeAttr(optionValue)}" ${optionValue === value ? 'selected' : ''}>${escapeHtml(optionLabel)}</option>`
      )
      .join('');
    return `<select class="pb-editor-select pb-appearance-input" data-appearance-input="true" data-appearance-scope="${scope}" data-appearance-key="${field.key}"${indexAttr}${disabledAttr}${labelAttr}>${options}</select>`;
  }

  if (field.inputType === 'color') {
    const colorValue = isValidHexColor(value) ? String(value) : field.defaultValue;
    return `
      <div class="pb-appearance-color-control">
        <input type="color" class="pb-promo-style-color pb-appearance-input" data-appearance-input="true" data-appearance-input-kind="picker" data-appearance-scope="${scope}" data-appearance-key="${field.key}"${indexAttr} value="${escapeAttr(colorValue)}"${disabledAttr}${labelAttr}>
        <input type="text" class="pb-editor-input pb-appearance-input pb-appearance-color-hex" data-appearance-input="true" data-appearance-input-kind="hex" data-appearance-scope="${scope}" data-appearance-key="${field.key}"${indexAttr} value="${escapeAttr(String(value))}" maxlength="7" spellcheck="false"${disabledAttr} aria-label="${escapeAttr(`${ariaLabel} Hex`)}">
      </div>
    `;
  }

  if (field.inputType === 'range') {
    return `<input type="range" class="pb-promo-style-range pb-appearance-input" data-appearance-input="true" data-appearance-scope="${scope}" data-appearance-key="${field.key}"${indexAttr} min="${field.min}" max="${field.max}" step="${field.step}" value="${escapeAttr(String(value))}"${disabledAttr}${labelAttr}>`;
  }

  return `<input type="number" ${commonAttrs} min="${field.min}" max="${field.max}" step="${field.step}" value="${escapeAttr(String(value))}">`;
}

function renderAppearanceControls(appearance, scope, index = null, title = '', copy = '') {
  const groupsHtml = APPEARANCE_GROUPS.map((group) => {
    const fieldsHtml = group.fields
      .map((field) => {
        const value = getAppearanceLeaf(appearance, field.key);
        const checked = value != null;
        const resolvedValue = checked ? value : field.defaultValue;
        const indexAttr = Number.isInteger(index) ? ` data-item-index="${index}"` : '';
        const inputLabel = [title, group.title, field.label].filter(Boolean).join(' ');

        return `
          <div class="pb-editor-field pb-editor-field--row pb-appearance-row">
            <label class="pb-appearance-toggle">
              <input type="checkbox" class="pb-appearance-enable" data-appearance-toggle="true" data-appearance-scope="${scope}" data-appearance-key="${field.key}"${indexAttr} ${checked ? 'checked' : ''}>
              <span title="${escapeAttr(field.label)}">${escapeHtml(field.label)}</span>
            </label>
            ${renderAppearanceInput(field, scope, index, resolvedValue, checked, inputLabel)}
          </div>
        `;
      })
      .join('');

    return `
      <details class="pb-style-group pb-editor-accordion pb-appearance-group">
        <summary class="pb-style-group-title pb-editor-accordion-toggle">${escapeHtml(group.title)}</summary>
        <div class="pb-editor-accordion-content">
        ${fieldsHtml}
        </div>
      </details>
    `;
  }).join('');

  return `
    <div class="pb-appearance-card">
      <div class="pb-editor-section-head pb-editor-section-head--compact">
        <div>
          <h5 class="pb-editor-section-title">${escapeHtml(title)}</h5>
        </div>
        <p class="pb-editor-section-copy">${escapeHtml(copy)}</p>
      </div>
      <div class="pb-appearance-groups">
        ${groupsHtml}
      </div>
    </div>
  `;
}

function isValidHexColor(value) {
  return HEX_COLOR_RE.test(String(value || '').trim());
}

function getAppearanceInputValue(input) {
  if (input?.dataset?.appearanceInputKind === 'hex') {
    const value = String(input.value || '').trim();
    const valid = isValidHexColor(value);
    if (valid) {
      input.removeAttribute('aria-invalid');
    } else {
      input.setAttribute('aria-invalid', 'true');
    }
    return valid ? value : null;
  }
  input?.removeAttribute?.('aria-invalid');
  return input?.value;
}

function syncAppearanceColorInputs(root, input) {
  const value = getAppearanceInputValue(input);
  if (value === null) return null;
  if (!input?.dataset?.appearanceInputKind) return value;

  const scope = input.dataset.appearanceScope;
  const key = input.dataset.appearanceKey;
  const index = input.dataset.itemIndex;
  const selector = [
    '[data-appearance-input="true"]',
    '[data-appearance-input-kind]',
    `[data-appearance-scope="${scope}"]`,
    `[data-appearance-key="${key}"]`,
    index !== undefined ? `[data-item-index="${index}"]` : ':not([data-item-index])',
  ].join('');
  root?.querySelectorAll(selector).forEach((pairedInput) => {
    if (pairedInput === input) return;
    pairedInput.value = value;
    pairedInput.removeAttribute('aria-invalid');
  });
  return value;
}

export {
  APPEARANCE_FIELDS,
  APPEARANCE_GROUPS,
  cloneValue,
  getAppearanceLeaf,
  getAppearanceInputValue,
  isObject,
  isValidHexColor,
  pruneEmptyBranches,
  removeAppearanceLeaf,
  renderAppearanceControls,
  setAppearanceLeaf,
  syncAppearanceColorInputs,
  toSparseAppearance,
};

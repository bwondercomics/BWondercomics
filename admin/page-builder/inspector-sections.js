import { escapeAttr, escapeHtml } from './helpers.js';

function renderInspectorSection({
  kicker = '',
  title = '',
  summary = '',
  copy = '',
  body = '',
  className = '',
  open = false,
  stateKey = '',
}) {
  const classes = ['pb-editor-section-card', 'pb-inspector-section', className]
    .filter(Boolean)
    .join(' ');
  const openAttr = open ? ' open' : '';
  const summaryText = summary && summary !== title ? summary : '';
  const sectionKey = stateKey || [kicker, title].filter(Boolean).join(':') || title || kicker;
  const stateKeyAttr = sectionKey ? ` data-inspector-section-key="${escapeAttr(sectionKey)}"` : '';

  return `
    <details class="${escapeAttr(classes)}"${openAttr}${stateKeyAttr}>
      <summary class="pb-inspector-section-summary">
        <span class="pb-inspector-section-text">
          ${kicker ? `<span class="pb-editor-section-kicker">${escapeHtml(kicker)}</span>` : ''}
          <span class="pb-editor-section-title pb-truncate" title="${escapeAttr(title)}">${escapeHtml(title)}</span>
        </span>
        ${
          summaryText
            ? `<span class="pb-inspector-section-meta">${escapeHtml(summaryText)}</span>`
            : ''
        }
      </summary>
      <div class="pb-inspector-section-body">
        ${copy ? `<p class="pb-editor-section-copy">${escapeHtml(copy)}</p>` : ''}
        ${body}
      </div>
    </details>
  `;
}

export { renderInspectorSection };

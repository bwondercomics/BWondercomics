import { escapeAttr } from '../../shared/page-builder/helpers.js';
import { renderInspectorCard } from './inspector-sections.js';

function renderFeedStyleSection(feedStyle = {}) {
  return renderInspectorCard(
    'Appearance',
    'Color Styling',
    'Tune headings, buttons, feed items, and the outer frame.',
    `
      <details class="pb-editor-accordion">
        <summary class="pb-editor-accordion-toggle">Color Options</summary>
        <div class="pb-editor-accordion-content">
          <div class="pb-style-group">
            <div class="pb-style-group-title">Heading & Author</div>
            <div class="pb-editor-field pb-editor-field--row">
              <label class="pb-editor-label">Heading Background</label>
              <input type="color" class="pb-promo-style-color" data-style-key="headingBgColor" value="${feedStyle.headingBgColor || '#ffed00'}">
            </div>
            <div class="pb-editor-field pb-editor-field--row">
              <label class="pb-editor-label">Heading Text</label>
              <input type="color" class="pb-promo-style-color" data-style-key="headingTextColor" value="${feedStyle.headingTextColor || '#0a0a12'}">
            </div>
            <div class="pb-editor-field pb-editor-field--row">
              <label class="pb-editor-label">Author Color</label>
              <input type="color" class="pb-promo-style-color" data-style-key="authorColor" value="${feedStyle.authorColor || '#7ef5e3'}">
            </div>
          </div>
          <div class="pb-style-group">
            <div class="pb-style-group-title">Buttons</div>
            <div class="pb-editor-field pb-editor-field--row">
              <label class="pb-editor-label">Button Background</label>
              <input type="color" class="pb-promo-style-color" data-style-key="buttonBgColor" value="${feedStyle.buttonBgColor || '#00d9ff'}">
            </div>
            <div class="pb-editor-field pb-editor-field--row">
              <label class="pb-editor-label">Button Text</label>
              <input type="color" class="pb-promo-style-color" data-style-key="buttonTextColor" value="${feedStyle.buttonTextColor || '#0a0a12'}">
            </div>
          </div>
          <div class="pb-style-group">
            <div class="pb-style-group-title">Feed Items</div>
            <div class="pb-editor-field pb-editor-field--row">
              <label class="pb-editor-label">Item Title</label>
              <input type="color" class="pb-promo-style-color" data-style-key="itemTitleColor" value="${feedStyle.itemTitleColor || '#ffed00'}">
            </div>
            <div class="pb-editor-field pb-editor-field--row">
              <label class="pb-editor-label">Item Date</label>
              <input type="color" class="pb-promo-style-color" data-style-key="itemDateColor" value="${feedStyle.itemDateColor || '#00d9ff'}">
            </div>
            <div class="pb-editor-field pb-editor-field--row">
              <label class="pb-editor-label">Item Border</label>
              <input type="color" class="pb-promo-style-color" data-style-key="itemBorderColor" value="${feedStyle.itemBorderColor || '#00d9ff'}">
            </div>
          </div>
          <div class="pb-style-group">
            <div class="pb-style-group-title">Container</div>
            <div class="pb-editor-field pb-editor-field--row">
              <label class="pb-editor-label">Border Color</label>
              <input type="color" class="pb-promo-style-color" data-style-key="borderColor" value="${feedStyle.borderColor || '#ffed00'}">
            </div>
          </div>
        </div>
      </details>
    `
  );
}

// Registry entry for the module editor (see module-editor-registry.js for the contract).
export const feedModuleEditor = {
  retainsRawCard: true,
  deviceBindsGeneric: true,
  renderContent: ({ config, currentPage, pages, moduleType, shared }) => [
    shared.renderCmsSourceCard(moduleType, config, currentPage, pages),
    renderInspectorCard(
      'Content',
      'Feed Copy',
      'Set the heading, author treatment, and destination links shown in the module.',
      `
          <div class="pb-editor-field">
            <label class="pb-editor-label">Heading</label>
            <input type="text" class="pb-editor-input" data-key="heading" value="${escapeAttr(config.heading || 'BWC FEED')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Author Label</label>
            <input type="text" class="pb-editor-input" data-key="author" value="${escapeAttr(config.author || '')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Feed Button Label</label>
            <input type="text" class="pb-editor-input" data-key="feedLabel" value="${escapeAttr(config.feedLabel || 'Open feed')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Feed Link</label>
            <input type="text" class="pb-editor-input" data-key="feedHref" value="${escapeAttr(config.feedHref || 'feed.html')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Media Button Label</label>
            <input type="text" class="pb-editor-input" data-key="mediaLabel" value="${escapeAttr(config.mediaLabel || 'Media')}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Media Link</label>
            <input type="text" class="pb-editor-input" data-key="mediaHref" value="${escapeAttr(config.mediaHref || 'media.html')}">
          </div>
        `
    ),
    renderInspectorCard(
      'Behavior',
      'Display Rules',
      'Choose how much of the feed UI is enabled in this module instance.',
      `
          <div class="pb-editor-field">
            <label class="pb-editor-label">
              <input type="checkbox" data-key="showAuthor" ${config.showAuthor !== false ? 'checked' : ''}> Show Author
            </label>
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">Feed Limit</label>
            <input type="number" class="pb-editor-input" data-key="limit" value="${config.limit || 5}">
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">
              <input type="checkbox" data-key="showDropdown" ${config.showDropdown !== false ? 'checked' : ''}> Enable Dropdown Feed
            </label>
          </div>
          <div class="pb-editor-field">
            <label class="pb-editor-label">
              <input type="checkbox" data-key="showMediaButton" ${config.showMediaButton !== false ? 'checked' : ''}> Show Media Button
            </label>
          </div>
        `
    ),
    renderFeedStyleSection(config.style || {}),
  ],
  renderDeviceOverrides: ({ config, responsiveFields, shared }) =>
    responsiveFields.includes('layout') ? [shared.renderModuleLayoutCard(config)] : [],
  renderStyle: ({ config }) => [renderFeedStyleSection(config.style || {})],
};

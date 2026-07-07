function cloneValue(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function stripHtml(value = '') {
  return String(value || '').replace(/<[^>]*>/g, '');
}

function formatTypeLabel(moduleType) {
  return String(moduleType || 'module')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const DEFAULT_QUICK_ACTIONS = Object.freeze(['settings', 'delete']);
const DEFAULT_ALLOWED_PARENTS = Object.freeze(['section-column']);
const HIDDEN_ONLY_RESPONSIVE_FIELDS = Object.freeze(['hidden']);
const SOURCE_ACTIVE_PAGE_SERIES = 'active-page-series';
const SOURCE_SPECIFIC_SERIES = 'specific-series';
const SOURCE_ALL_SERIES = 'all-series';
const SOURCE_SITE = 'site';

function createSourceConfig(mode, extras = {}) {
  return {
    mode,
    ...extras,
  };
}

const MODULE_DESCRIPTOR_DEFS = [
  {
    type: 'header',
    label: 'Header',
    icon: '\u{1F4F0}',
    category: 'content',
    insertable: false,
    defaultConfig: { title: 'Page Title', subtitle: '' },
    editorKind: 'header',
    allowedParents: [],
    quickActions: ['settings'],
    responsiveOverrides: HIDDEN_ONLY_RESPONSIVE_FIELDS,
    appearanceSectors: [],
    requiredContext: [],
    preview: (config = {}) => config.title || 'Untitled',
  },
  {
    type: 'text',
    label: 'Text',
    icon: '\u{1F4DD}',
    category: 'content',
    defaultConfig: { content: '<p>Enter your text here...</p>', alignment: 'left' },
    editorKind: 'text',
    responsiveOverrides: ['hidden', 'alignment'],
    appearanceSectors: [],
    preview: (config = {}) => stripHtml(config.content).slice(0, 50) || 'Empty text',
  },
  {
    type: 'image',
    label: 'Image',
    icon: '\u{1F5BC}',
    category: 'media',
    defaultConfig: { src: '', alt: '', caption: '' },
    editorKind: 'image',
    responsiveOverrides: HIDDEN_ONLY_RESPONSIVE_FIELDS,
    appearanceSectors: [],
    preview: (config = {}) => (config.src ? String(config.src).split('/').pop() : 'No image'),
  },
  {
    type: 'gallery',
    label: 'Gallery',
    icon: '\u{1F3B4}',
    category: 'media',
    defaultConfig: { images: [], columns: 3 },
    editorKind: 'gallery',
    responsiveOverrides: ['hidden', 'columns'],
    appearanceSectors: [],
    preview: (config = {}) => {
      const count = config.images?.length || 0;
      return count === 0 ? 'No images' : `${count} image${count > 1 ? 's' : ''}`;
    },
  },
  {
    type: 'video',
    label: 'Video',
    icon: '\u{1F3AC}',
    category: 'media',
    defaultConfig: { url: '', autoplay: false },
    editorKind: 'video',
    responsiveOverrides: HIDDEN_ONLY_RESPONSIVE_FIELDS,
    appearanceSectors: [],
    preview: (config = {}) => config.url || 'No video URL',
  },
  {
    type: 'social',
    label: 'Social',
    icon: '\u{1F517}',
    category: 'engagement',
    defaultConfig: { buttons: [] },
    editorKind: 'social',
    responsiveOverrides: HIDDEN_ONLY_RESPONSIVE_FIELDS,
    appearanceSectors: [],
  },
  {
    type: 'email-signup',
    label: 'Email',
    icon: '\u{1F4E7}',
    category: 'engagement',
    defaultConfig: {
      heading: 'Join the List',
      subtext: '',
      placeholder: 'your@email.com',
      buttonText: 'Subscribe',
      style: {
        headingFont: 'display',
        headingColor: '#ffffff',
        headingGlow: false,
        inputStyle: 'bubble',
        buttonColor: '#00d9ff',
        buttonGlow: true,
      },
    },
    editorKind: 'email-signup',
    responsiveOverrides: HIDDEN_ONLY_RESPONSIVE_FIELDS,
    appearanceSectors: ['email-signup-style'],
  },
  {
    type: 'promo',
    label: 'Promo',
    icon: '\u{1F3AF}',
    category: 'engagement',
    defaultConfig: {
      items: [],
      autoRotate: true,
      interval: 5000,
      showNavigation: true,
      showIndicators: true,
      height: 400,
      transition: 'fade',
    },
    editorKind: 'promo',
    responsiveOverrides: HIDDEN_ONLY_RESPONSIVE_FIELDS,
    appearanceSectors: [],
    preview: (config = {}) => {
      const count = config.items?.length || 0;
      return count === 0 ? 'No promos' : `${count} promo${count > 1 ? 's' : ''}`;
    },
  },
  {
    type: 'buttons',
    label: 'Buttons',
    icon: '\u{1F518}',
    category: 'navigation',
    defaultConfig: { buttons: [] },
    editorKind: 'buttons',
    responsiveOverrides: ['hidden', 'defaults', 'buttons'],
    appearanceSectors: ['button-defaults', 'button-overrides'],
  },
  {
    type: 'spacer',
    label: 'Spacer',
    icon: '\u2195',
    category: 'layout',
    defaultConfig: { height: 40 },
    editorKind: 'spacer',
    responsiveOverrides: ['hidden', 'height'],
    appearanceSectors: [],
  },
  {
    type: 'divider',
    label: 'Divider',
    icon: '\u2796',
    category: 'layout',
    defaultConfig: { style: 'solid', color: '' },
    editorKind: 'divider',
    responsiveOverrides: HIDDEN_ONLY_RESPONSIVE_FIELDS,
    appearanceSectors: [],
    preview: (config = {}) =>
      `${config.style === 'dashed' || config.style === 'dotted' ? config.style.charAt(0).toUpperCase() + config.style.slice(1) : 'Solid'} line`,
  },
  {
    type: 'reader',
    label: 'Comic Reader',
    icon: '\u{1F4D6}',
    category: 'special',
    defaultConfig: {
      source: createSourceConfig(SOURCE_ACTIVE_PAGE_SERIES),
      displayMode: 'paged',
      showPanels: true,
      showComments: true,
      controls: {
        placement: 'below',
        size: 'medium',
        style: {},
      },
      stage: {
        fit: 'dynamic-frame',
        pageGap: 8,
        frameBorder: true,
        maxWidth: null,
      },
      panels: {
        left: { enabled: true },
        right: { enabled: true },
      },
    },
    editorKind: 'reader',
    duplicatable: false,
    responsiveOverrides: ['hidden', 'displayMode', 'controls', 'stage', 'panels', 'showComments'],
    appearanceSectors: [],
    requiredContext: [],
    sourceModes: [SOURCE_ACTIVE_PAGE_SERIES, SOURCE_SPECIFIC_SERIES],
  },
  {
    type: 'entry-gallery',
    label: 'Entries',
    icon: '\u{1F4DA}',
    category: 'special',
    defaultConfig: {
      source: createSourceConfig(SOURCE_ACTIVE_PAGE_SERIES, { filters: {}, sort: 'sort-index' }),
      columns: 3,
      showLabels: true,
    },
    editorKind: 'entry-gallery',
    responsiveOverrides: ['hidden', 'columns'],
    appearanceSectors: [],
    requiredContext: [],
    sourceModes: [SOURCE_ACTIVE_PAGE_SERIES, SOURCE_SPECIFIC_SERIES, SOURCE_ALL_SERIES],
    preview: (config = {}) => `Series entries (${config.columns || 3} cols)`,
  },
  {
    type: 'feed',
    label: 'Feed',
    icon: '\u{1F4F0}',
    category: 'special',
    defaultConfig: {
      source: createSourceConfig(SOURCE_SITE),
      limit: 5,
      heading: 'BWC FEED',
      author: 'DOYLE MELVILLE II',
      showAuthor: true,
      showDropdown: true,
      feedLabel: 'Open feed',
      feedHref: 'feed.html',
      showMediaButton: true,
      mediaLabel: 'Media',
      mediaHref: 'media.html',
      style: {
        headingBgColor: '#ffed00',
        headingTextColor: '#0a0a12',
        authorColor: '#7ef5e3',
        buttonBgColor: '#00d9ff',
        buttonTextColor: '#0a0a12',
        itemTitleColor: '#ffed00',
        itemDateColor: '#00d9ff',
        itemBorderColor: '#00d9ff',
        borderColor: '#ffed00',
      },
    },
    editorKind: 'feed',
    responsiveOverrides: HIDDEN_ONLY_RESPONSIVE_FIELDS,
    appearanceSectors: ['feed-style'],
    sourceModes: [SOURCE_SITE],
    preview: (config = {}) => `Feed (limit ${config.limit || 0})`,
  },
  {
    type: 'media-gallery',
    label: 'Media Gallery',
    icon: '\u{1F5BC}',
    category: 'special',
    defaultConfig: {
      source: createSourceConfig(SOURCE_SITE, { filters: {}, sort: 'path' }),
      columns: 3,
      limit: 24,
      showCaptions: true,
      includePremium: true,
    },
    editorKind: 'media-gallery',
    responsiveOverrides: ['hidden', 'columns'],
    appearanceSectors: [],
    sourceModes: [SOURCE_SITE],
    preview: (config = {}) => `Media gallery (${config.columns || 3} cols)`,
  },
  {
    type: 'html',
    label: 'HTML',
    icon: '\u{1F4BB}',
    category: 'advanced',
    defaultConfig: { code: '' },
    editorKind: 'html',
    responsiveOverrides: HIDDEN_ONLY_RESPONSIVE_FIELDS,
    appearanceSectors: [],
    preview: (config = {}) => config.code?.slice(0, 30) || 'Empty HTML',
  },
  // Shell chrome as blocks (roadmap Phase 6): the Account Settings gear and the 9-dot
  // links button, placeable in any panel/column. When a page places one, the hardcoded
  // shell button hides; pages without the module keep today's fixed buttons.
  {
    type: 'account',
    label: 'Account',
    icon: '⚙',
    category: 'special',
    defaultConfig: { iconColor: '' },
    editorKind: 'account',
    responsiveOverrides: HIDDEN_ONLY_RESPONSIVE_FIELDS,
    appearanceSectors: [],
    preview: () => 'Account Settings button',
  },
  {
    type: 'links-grid',
    label: 'Links Grid',
    icon: '\u{1F533}',
    category: 'special',
    defaultConfig: { iconColor: '' },
    editorKind: 'links-grid',
    responsiveOverrides: HIDDEN_ONLY_RESPONSIVE_FIELDS,
    appearanceSectors: [],
    preview: () => 'Links grid button',
  },
];

function normalizeDescriptor(definition) {
  return Object.freeze({
    ...definition,
    insertable: definition.insertable !== false,
    duplicatable: definition.duplicatable !== false,
    allowedParents: Object.freeze([...(definition.allowedParents || DEFAULT_ALLOWED_PARENTS)]),
    quickActions: Object.freeze([...(definition.quickActions || DEFAULT_QUICK_ACTIONS)]),
    responsiveOverrides: Object.freeze([...(definition.responsiveOverrides || [])]),
    appearanceSectors: Object.freeze([...(definition.appearanceSectors || [])]),
    requiredContext: Object.freeze([...(definition.requiredContext || [])]),
    sourceModes: Object.freeze([...(definition.sourceModes || [])]),
  });
}

const MODULE_DESCRIPTORS = Object.freeze(MODULE_DESCRIPTOR_DEFS.map(normalizeDescriptor));
const MODULE_DESCRIPTOR_BY_TYPE = Object.freeze(
  Object.fromEntries(MODULE_DESCRIPTORS.map((descriptor) => [descriptor.type, descriptor]))
);

function getFallbackDescriptor(moduleType) {
  const type = String(moduleType || 'module');
  return Object.freeze({
    type,
    label: formatTypeLabel(type),
    icon: '?',
    category: 'advanced',
    insertable: false,
    defaultConfig: {},
    editorKind: 'raw',
    allowedParents: Object.freeze([]),
    quickActions: Object.freeze(['settings']),
    responsiveOverrides: Object.freeze([]),
    appearanceSectors: Object.freeze([]),
    requiredContext: Object.freeze([]),
    sourceModes: Object.freeze([]),
    preview: () => type,
  });
}

export function getModuleDescriptors() {
  return MODULE_DESCRIPTORS;
}

export function getModuleDescriptor(moduleType) {
  return MODULE_DESCRIPTOR_BY_TYPE[String(moduleType || '')] || getFallbackDescriptor(moduleType);
}

export function getInsertableModuleDescriptors() {
  return MODULE_DESCRIPTORS.filter((descriptor) => descriptor.insertable);
}

export function isModuleTypeDuplicatable(moduleType) {
  return getModuleDescriptor(moduleType).duplicatable !== false;
}

export function getModuleDefaultConfig(moduleType) {
  return cloneValue(getModuleDescriptor(moduleType).defaultConfig || {});
}

export function getModuleResponsiveOverrides(moduleType) {
  return [...(getModuleDescriptor(moduleType).responsiveOverrides || [])];
}

export function getModuleStyleSectors(moduleType) {
  return [...(getModuleDescriptor(moduleType).appearanceSectors || [])];
}

export function getModuleSourceModes(moduleType) {
  return [...(getModuleDescriptor(moduleType).sourceModes || [])];
}

export function getModuleEditorKind(moduleType) {
  return getModuleDescriptor(moduleType).editorKind || 'raw';
}

export function getModulePreviewText(moduleType, config = {}) {
  const descriptor = getModuleDescriptor(moduleType);
  if (typeof descriptor.preview === 'function') {
    return descriptor.preview(config || {});
  }
  return descriptor.type;
}

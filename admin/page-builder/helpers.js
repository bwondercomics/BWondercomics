import { MODULE_TYPES } from './constants.js';

export function normalizeFit(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  return raw === 'contain' ? 'contain' : 'cover';
}

export function parseFocus(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw || raw === 'center') return { x: 50, y: 50 };
  if (raw.includes('%')) {
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const x = parseFloat(parts[0]);
      const y = parseFloat(parts[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
      }
    }
  }
  const map = {
    top: [50, 0],
    bottom: [50, 100],
    left: [0, 50],
    right: [100, 50],
    'top left': [0, 0],
    'left top': [0, 0],
    'top right': [100, 0],
    'right top': [100, 0],
    'bottom left': [0, 100],
    'left bottom': [0, 100],
    'bottom right': [100, 100],
    'right bottom': [100, 100],
  };
  if (map[raw]) {
    const [x, y] = map[raw];
    return { x, y };
  }
  return { x: 50, y: 50 };
}

export function formatFocus({ x, y }) {
  const safeX = Math.max(0, Math.min(100, Math.round(Number(x) || 50)));
  const safeY = Math.max(0, Math.min(100, Math.round(Number(y) || 50)));
  return `${safeX}% ${safeY}%`;
}

export function resolveAssetUrl(path = '') {
  if (!path) return '';
  const raw = String(path || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  const cleaned = raw.replace(/^assets\//, '');
  return `/assets/${cleaned}`;
}

export function cloneValue(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

export function getDefaultConfig(moduleType) {
  switch (moduleType) {
    case 'header':
      return { title: 'Page Title', subtitle: '' };
    case 'text':
      return { content: '<p>Enter your text here...</p>', alignment: 'left' };
    case 'image':
      return { src: '', alt: '', caption: '' };
    case 'gallery':
      return { images: [], columns: 3 };
    case 'video':
      return { url: '', autoplay: false };
    case 'social':
      return { buttons: [] };
    case 'email-signup':
      return {
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
      };
    case 'promo':
      return {
        items: [],
        autoRotate: true,
        interval: 5000,
        showNavigation: true,
        showIndicators: true,
        height: 400,
        transition: 'fade',
      };
    case 'buttons':
      return { buttons: [] };
    case 'spacer':
      return { height: 40 };
    case 'divider':
      return { style: 'solid', color: '' };
    case 'reader':
      return { showPanels: true, showComments: true };
    case 'entry-gallery':
      return { columns: 3, showLabels: true };
    case 'feed':
      return {
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
      };
    case 'html':
      return { code: '' };
    default:
      return {};
  }
}

export function getModuleLabel(moduleType) {
  const match = MODULE_TYPES.find((item) => item.type === moduleType);
  if (match?.label) return match.label;
  return String(moduleType || 'module')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getModulePreview(moduleType, config) {
  switch (moduleType) {
    case 'header':
      return config.title || 'Untitled';
    case 'text':
      return config.content?.replace(/<[^>]*>/g, '').slice(0, 50) || 'Empty text';
    case 'image':
      return config.src ? config.src.split('/').pop() : 'No image';
    case 'html':
      return config.code?.slice(0, 30) || 'Empty HTML';
    case 'promo': {
      const promoCount = config.items?.length || 0;
      return promoCount === 0 ? 'No promos' : `${promoCount} promo${promoCount > 1 ? 's' : ''}`;
    }
    case 'feed':
      return `Feed (limit ${config.limit || 0})`;
    case 'gallery': {
      const galleryCount = config.images?.length || 0;
      return galleryCount === 0
        ? 'No images'
        : `${galleryCount} image${galleryCount > 1 ? 's' : ''}`;
    }
    case 'video':
      return config.url || 'No video URL';
    case 'divider':
      return `${config.style === 'dashed' || config.style === 'dotted' ? config.style.charAt(0).toUpperCase() + config.style.slice(1) : 'Solid'} line`;
    case 'entry-gallery':
      return `Series entries (${config.columns || 3} cols)`;
    default:
      return moduleType;
  }
}

export function getPageDisplayTitle(page) {
  return page?.title || page?.slug || 'Untitled page';
}

export function renderPageStatusBadges(page) {
  if (!page) return '';
  const badges = [
    `<span class="pb-page-status ${page.isPublished ? 'published' : 'draft'}">${page.isPublished ? 'Published' : 'Draft'}</span>`,
  ];
  if (page.isHomepage) {
    badges.push('<span class="pb-page-status homepage">Homepage</span>');
  }
  return badges.join('');
}

export function getReaderLinkLabel(page) {
  return page?.isPublished === false ? 'Open Draft Preview' : 'Open Reader';
}

export function getReaderPreviewNote(page) {
  if (page?.isPublished === false) {
    return 'Draft page. Open Reader loads the draft preview until you publish changes.';
  }
  return 'Published page. Open Reader matches the public reader.';
}

export function getReaderPreviewStatus(page) {
  return page?.isPublished === false ? 'warning' : 'neutral';
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

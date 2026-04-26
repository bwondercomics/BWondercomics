const TEXT_TAGS = new Set([
  'p',
  'br',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'a',
  'h2',
  'h3',
  'h4',
]);

const HTML_TAGS = new Set([
  ...TEXT_TAGS,
  'div',
  'span',
  'section',
  'article',
  'figure',
  'figcaption',
  'hr',
  'h1',
  'h5',
  'h6',
  'img',
]);

const DROP_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'link',
  'meta',
]);

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTION_COLOR_RE = /^(?:rgb|rgba|hsl|hsla)\(\s*[-\d.%\s,]+\s*\)$/i;
const NAMED_COLOR_RE = /^[a-z]+$/i;
const ANCHOR_RE = /^[A-Za-z][A-Za-z0-9_:\-.]*$/;
const URL_UNSAFE_PUNCTUATION = new Set(['"', "'", '<', '>', '`', '\\']);
const URL_UNSAFE_WHITESPACE_RE = /\s/u;

function hasUnsafeUrlChars(value = '') {
  for (const char of String(value || '')) {
    const code = char.charCodeAt(0);
    if (
      code <= 0x20 ||
      code === 0x7f ||
      URL_UNSAFE_WHITESPACE_RE.test(char) ||
      URL_UNSAFE_PUNCTUATION.has(char)
    ) {
      return true;
    }
  }
  return false;
}

function sanitizeClassValue(value) {
  return String(value || '')
    .split(/\s+/)
    .map((token) => token.replace(/[^A-Za-z0-9_-]+/g, ''))
    .filter(Boolean)
    .slice(0, 12)
    .join(' ');
}

function sanitizeIdLike(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_:\-.]+/g, '')
    .slice(0, 120);
}

export function sanitizeAnchor(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.startsWith('#') ? raw.slice(1) : raw;
  if (!ANCHOR_RE.test(normalized)) return '';
  return `#${normalized}`;
}

function sanitizeSimpleUrl(
  value,
  {
    allowedSchemes = ['http', 'https'],
    allowRootRelative = true,
    allowRelative = true,
    allowAnchor = false,
  } = {}
) {
  const raw = String(value || '').trim();
  if (!raw || hasUnsafeUrlChars(raw) || raw.startsWith('//')) return '';
  if (allowAnchor && raw.startsWith('#')) return sanitizeAnchor(raw);
  if (raw.startsWith('/')) return allowRootRelative ? raw : '';

  let parsed;
  try {
    parsed = new URL(raw, 'https://example.invalid');
  } catch {
    return '';
  }

  const hasExplicitScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw);
  if (hasExplicitScheme) {
    if (!allowedSchemes.includes(parsed.protocol.replace(/:$/, '').toLowerCase())) return '';
    if (parsed.protocol === 'mailto:' || parsed.protocol === 'tel:') return raw;
    if (!parsed.hostname) return '';
    return raw;
  }

  if (!allowRelative) return '';
  return raw;
}

export function sanitizeHref(value = '') {
  return sanitizeSimpleUrl(value, {
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowRootRelative: true,
    allowRelative: true,
    allowAnchor: true,
  });
}

export function sanitizeAssetUrl(value = '') {
  return sanitizeSimpleUrl(value, {
    allowedSchemes: ['http', 'https'],
    allowRootRelative: true,
    allowRelative: true,
    allowAnchor: false,
  });
}

export function sanitizeVideoUrl(value = '') {
  const raw = sanitizeSimpleUrl(value, {
    allowedSchemes: ['https'],
    allowRootRelative: false,
    allowRelative: false,
    allowAnchor: false,
  });
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (
      ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(
        host
      ) ||
      ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)
    ) {
      return raw;
    }
  } catch {
    return '';
  }
  return '';
}

export function sanitizeColor(value = '', fallback = '') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (raw.toLowerCase() === 'transparent') return 'transparent';
  if (HEX_COLOR_RE.test(raw) || FUNCTION_COLOR_RE.test(raw) || NAMED_COLOR_RE.test(raw)) {
    return raw;
  }
  return fallback;
}

export function sanitizeKeyword(value = '', allowed = [], fallback = '') {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  return allowed.includes(raw) ? raw : fallback;
}

export function sanitizeNumber(value, fallback, min = 0, max = 10000) {
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeElementAttributes(source, target, tagName) {
  for (const attr of Array.from(source.attributes || [])) {
    const name = attr.name.toLowerCase();
    const value = attr.value;
    if (name.startsWith('on') || name === 'style') continue;

    let sanitized = '';
    if (name === 'href' && tagName === 'a') {
      sanitized = sanitizeHref(value);
    } else if (name === 'src' && tagName === 'img') {
      sanitized = sanitizeAssetUrl(value);
    } else if (name === 'class') {
      sanitized = sanitizeClassValue(value);
    } else if (name === 'id' || name === 'role') {
      sanitized = sanitizeIdLike(value);
    } else if (
      name === 'title' ||
      name === 'alt' ||
      name.startsWith('data-') ||
      name.startsWith('aria-')
    ) {
      sanitized = String(value || '')
        .trim()
        .slice(0, 300);
    } else {
      continue;
    }

    if (sanitized) {
      target.setAttribute(name, sanitized);
    }
  }
}

function sanitizeNode(node, doc, allowedTags) {
  if (node.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(node.textContent || '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return doc.createDocumentFragment();
  }

  const tagName = node.tagName.toLowerCase();
  if (DROP_TAGS.has(tagName)) {
    return doc.createDocumentFragment();
  }

  if (!allowedTags.has(tagName)) {
    const fragment = doc.createDocumentFragment();
    Array.from(node.childNodes).forEach((child) => {
      fragment.appendChild(sanitizeNode(child, doc, allowedTags));
    });
    return fragment;
  }

  const el = doc.createElement(tagName);
  sanitizeElementAttributes(node, el, tagName);
  Array.from(node.childNodes).forEach((child) => {
    el.appendChild(sanitizeNode(child, doc, allowedTags));
  });
  return el;
}

export function sanitizeBuilderHtml(value = '', mode = 'text') {
  const raw = String(value || '').trim();
  if (!raw || typeof document === 'undefined') return '';
  const sourceDoc = document.implementation.createHTMLDocument('');
  const outputDoc = document.implementation.createHTMLDocument('');
  const allowedTags = mode === 'html' ? HTML_TAGS : TEXT_TAGS;
  sourceDoc.body.innerHTML = raw;
  Array.from(sourceDoc.body.childNodes).forEach((child) => {
    outputDoc.body.appendChild(sanitizeNode(child, outputDoc, allowedTags));
  });
  return outputDoc.body.innerHTML;
}

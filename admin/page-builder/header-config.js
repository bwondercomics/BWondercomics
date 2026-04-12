const HEADER_REGION_ORDER = ['left', 'center', 'right'];
const HEADER_BLOCK_IDS = ['brand', 'patron', 'status', 'entryControls', 'nav'];

const HEADER_BLOCK_DEFS = [
  {
    id: 'brand',
    label: 'Logo / Title',
    description: 'Shows the site branding, page title, and subtitle.',
  },
  {
    id: 'patron',
    label: 'Welcome Badge',
    description: 'Greets logged-in supporters and premium readers.',
  },
  {
    id: 'status',
    label: 'Status Message',
    description: 'Displays the live status or announcement message.',
  },
  {
    id: 'entryControls',
    label: 'Entry Picker',
    description: 'Lets readers jump between entries or chapters.',
  },
  {
    id: 'nav',
    label: 'Navigation Buttons',
    description: 'Shows page links, section jumps, and other header buttons.',
  },
];

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function getHeaderBlockDefinition(blockId) {
  return HEADER_BLOCK_DEFS.find((block) => block.id === blockId) || null;
}

function createDefaultHeaderConfig() {
  return {
    version: 2,
    regions: {
      left: ['brand'],
      center: ['patron', 'status'],
      right: ['entryControls', 'nav'],
    },
    blocks: Object.fromEntries(HEADER_BLOCK_IDS.map((id) => [id, { enabled: true }])),
    nav: {
      items: [
        {
          id: 'comics',
          label: 'Comics',
          enabled: true,
          link: {
            kind: 'url',
            url: 'comics.html',
            openInNewTab: false,
          },
        },
      ],
    },
  };
}

function createDefaultHeaderCopy(page = null) {
  return {
    title: String(page?.title || '').trim() || 'Page Title',
    subtitle: '',
    subtitles: [],
  };
}

function normalizeRegions(rawRegions = {}) {
  const defaults = createDefaultHeaderConfig().regions;
  const normalized = {
    left: Array.isArray(rawRegions.left) ? rawRegions.left.slice() : defaults.left.slice(),
    center: Array.isArray(rawRegions.center) ? rawRegions.center.slice() : defaults.center.slice(),
    right: Array.isArray(rawRegions.right) ? rawRegions.right.slice() : defaults.right.slice(),
  };
  const seen = new Set();
  HEADER_REGION_ORDER.forEach((region) => {
    normalized[region] = normalized[region].filter((id) => {
      if (!HEADER_BLOCK_IDS.includes(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  });
  HEADER_BLOCK_IDS.forEach((id) => {
    if (!seen.has(id)) {
      const fallbackRegion = defaults.left.includes(id)
        ? 'left'
        : defaults.center.includes(id)
          ? 'center'
          : 'right';
      normalized[fallbackRegion].push(id);
    }
  });
  return normalized;
}

function normalizeBlocks(rawBlocks = {}, rawNav = {}) {
  const blocks = {};
  HEADER_BLOCK_IDS.forEach((id) => {
    const block = rawBlocks?.[id];
    const enabledFallback = id === 'nav' ? rawNav?.enabled !== false : true;
    blocks[id] = {
      enabled: block?.enabled !== undefined ? block.enabled !== false : enabledFallback,
    };
  });
  return blocks;
}

function normalizeHeaderConfig(rawConfig = null, normalizeNavItems = (items) => items || []) {
  const defaults = createDefaultHeaderConfig();
  const config =
    rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig) ? rawConfig : {};
  const blocks = normalizeBlocks(config.blocks, config.nav);
  return {
    version: 2,
    regions: normalizeRegions(config.regions),
    blocks,
    nav: {
      items: normalizeNavItems(config.nav?.items || defaults.nav.items),
    },
  };
}

function normalizeHeaderOverrides(rawOverrides = null) {
  const overrides =
    rawOverrides && typeof rawOverrides === 'object' && !Array.isArray(rawOverrides)
      ? rawOverrides
      : {};
  return {
    hiddenBlockIds: Array.isArray(overrides.hiddenBlockIds)
      ? overrides.hiddenBlockIds.filter((id) => HEADER_BLOCK_IDS.includes(id))
      : [],
  };
}

function normalizeHeaderCopy(rawCopy = null, fallback = {}) {
  const copy =
    rawCopy && typeof rawCopy === 'object' && !Array.isArray(rawCopy) ? rawCopy : {};
  const fallbackTitle = String(fallback.title || '').trim() || 'Page Title';
  const fallbackSubtitle = String(fallback.subtitle || '').trim();
  const fallbackSubtitles = Array.isArray(fallback.subtitles)
    ? fallback.subtitles.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const title = String(copy.title || '').trim() || fallbackTitle;
  const subtitle = String(copy.subtitle || '').trim() || fallbackSubtitle;
  const subtitles = Array.isArray(copy.subtitles)
    ? copy.subtitles.map((item) => String(item || '').trim()).filter(Boolean)
    : fallbackSubtitles;
  return {
    title,
    subtitle,
    subtitles,
  };
}

function getLegacyHeaderModuleCopy(page = null) {
  if (!page?.sections) return null;
  for (const section of page.sections) {
    for (const mod of section.modules || []) {
      if (mod?.moduleType === 'header' && mod.config && typeof mod.config === 'object') {
        return mod.config;
      }
    }
  }
  return null;
}

function getLegacyHeaderCopyFallback(page = null, pageConfig = null) {
  const legacyPageHeader =
    pageConfig?.content?.header &&
    typeof pageConfig.content.header === 'object' &&
    !Array.isArray(pageConfig.content.header)
      ? pageConfig.content.header
      : {};
  return normalizeHeaderCopy(getLegacyHeaderModuleCopy(page), {
    title: legacyPageHeader.title || createDefaultHeaderCopy(page).title,
    subtitle: legacyPageHeader.subtitle || '',
    subtitles: Array.isArray(legacyPageHeader.subtitles) ? legacyPageHeader.subtitles : [],
  });
}

function createPageHeaderMeta(
  rawHeader = null,
  rawCopy = null,
  normalizeNavItems = (items) => items || [],
  options = {}
) {
  const page = options.page || null;
  const layout = normalizeHeaderConfig(rawHeader, normalizeNavItems);
  const copy = normalizeHeaderCopy(rawCopy, options.copyFallback || createDefaultHeaderCopy(page));
  return {
    version: 3,
    copy,
    regions: layout.regions,
    blocks: layout.blocks,
    nav: layout.nav,
  };
}

function createEffectivePageHeader(
  page = null,
  pageConfig = null,
  normalizeNavItems = (items) => items || []
) {
  const rawHeader =
    page?.meta?.header && typeof page.meta.header === 'object' && !Array.isArray(page.meta.header)
      ? page.meta.header
      : null;
  const builtInCopy = createDefaultHeaderCopy(page);
  const legacyCopy = getLegacyHeaderCopyFallback(page, pageConfig);

  if (rawHeader) {
    return createPageHeaderMeta(rawHeader, rawHeader.copy, normalizeNavItems, {
      page,
      copyFallback: Number(rawHeader.version || 0) >= 3 ? builtInCopy : legacyCopy,
    });
  }

  if (pageConfig?.site?.header || page?.meta?.headerOverrides) {
    const header = createPageHeaderMeta(pageConfig?.site?.header, legacyCopy, normalizeNavItems, {
      page,
      copyFallback: legacyCopy,
    });
    const hiddenBlockIds = normalizeHeaderOverrides(page?.meta?.headerOverrides).hiddenBlockIds;
    hiddenBlockIds.forEach((blockId) => {
      if (header.blocks[blockId]) {
        header.blocks[blockId].enabled = false;
      }
    });
    return header;
  }

  return createPageHeaderMeta(createDefaultHeaderConfig(), legacyCopy, normalizeNavItems, {
    page,
    copyFallback: legacyCopy,
  });
}

function createEffectiveHeaderConfig(
  page = null,
  pageConfig = null,
  normalizeNavItems = (items) => items || []
) {
  return normalizeHeaderConfig(
    createEffectivePageHeader(page, pageConfig, normalizeNavItems),
    normalizeNavItems
  );
}

export {
  HEADER_BLOCK_DEFS,
  HEADER_BLOCK_IDS,
  HEADER_REGION_ORDER,
  cloneValue,
  createDefaultHeaderConfig,
  createDefaultHeaderCopy,
  createEffectiveHeaderConfig,
  createEffectivePageHeader,
  createPageHeaderMeta,
  getHeaderBlockDefinition,
  getLegacyHeaderCopyFallback,
  getLegacyHeaderModuleCopy,
  normalizeHeaderConfig,
  normalizeHeaderCopy,
  normalizeHeaderOverrides,
};

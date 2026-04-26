import { mergeAppearance, normalizeAppearance } from './appearance-utils.js';

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

function normalizeHeaderShellAppearance(rawAppearance = null) {
  const source =
    rawAppearance && typeof rawAppearance === 'object' && !Array.isArray(rawAppearance)
      ? rawAppearance
      : {};
  const normalized = {
    top: normalizeAppearance(source.top),
    scrolled: normalizeAppearance(source.scrolled),
    navItemDefaults: normalizeAppearance(source.navItemDefaults),
  };
  return normalized.top || normalized.scrolled || normalized.navItemDefaults ? normalized : null;
}

function resolveHeaderShellTopAppearance(header = null) {
  return normalizeAppearance(header?.appearance?.top);
}

function resolveHeaderShellScrolledAppearance(header = null) {
  return mergeAppearance(resolveHeaderShellTopAppearance(header), header?.appearance?.scrolled);
}

function resolveHeaderNavItemAppearance(header = null, item = null) {
  // This merge intentionally crosses branches: defaults live on header.appearance,
  // while per-item overrides live on header.nav.items[*].appearance.
  return mergeAppearance(header?.appearance?.navItemDefaults, item?.appearance);
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
    appearance: normalizeHeaderShellAppearance(config.appearance),
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
  const copy = rawCopy && typeof rawCopy === 'object' && !Array.isArray(rawCopy) ? rawCopy : {};
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
    appearance: layout.appearance,
  };
}

function getPageHeaderSource(page = null) {
  const rawHeader =
    page?.meta?.header && typeof page.meta.header === 'object' && !Array.isArray(page.meta.header)
      ? page.meta.header
      : null;
  if (!rawHeader) return 'legacy-import';
  return Number(rawHeader.version || 0) >= 3 ? 'page-meta-v3' : 'page-meta-stale';
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

function resolvePageHeaderState(options = {}) {
  const {
    page = null,
    pageConfig = null,
    draftState = null,
    normalizeNavItems = (items) => items || [],
  } = options;
  const hasDraftState = !!(draftState?.header || draftState?.copy);
  const meta = hasDraftState
    ? createPageHeaderMeta(draftState?.header, draftState?.copy, normalizeNavItems, { page })
    : createEffectivePageHeader(page, pageConfig, normalizeNavItems);
  return {
    source: draftState?.source || getPageHeaderSource(page),
    meta,
    header: normalizeHeaderConfig(meta, normalizeNavItems),
    copy: normalizeHeaderCopy(meta.copy, createDefaultHeaderCopy(page)),
  };
}

function createEffectiveHeaderConfig(
  page = null,
  pageConfig = null,
  normalizeNavItems = (items) => items || []
) {
  return resolvePageHeaderState({
    page,
    pageConfig,
    normalizeNavItems,
  }).header;
}

/**
 * Audit a single builder page for remaining legacy fallback dependencies.
 *
 * Fallback buckets checked:
 *   - `missingHeader`      – page.meta.header is absent; reader falls back through
 *                            legacy page-config + headerOverrides.
 *                            Gate: bulk backfill writes meta.header.version = 3.
 *   - `staleHeaderVersion` – meta.header.version < 3; effective header still falls
 *                            back to getLegacyHeaderCopyFallback for copy.
 *                            Gate: header editor normalises to v3 on save; backfill
 *                            ensures all existing pages are normalised.
 *   - `headerOverrides`    – page.meta.headerOverrides is present; reader applies
 *                            legacy per-page block overrides on top of shared config.
 *                            Gate: no pages depend on headerOverrides (audit clean).
 *   - `legacyHeaderModule` – a module of type 'header' exists in sections on a page
 *                            that still depends on legacy fallback for header copy.
 *                            Once canonical v3 meta.header exists, the stored module
 *                            is inert cleanup debt and does not block runtime removal.
 *
 * @param {Object|null} page - A builder page object
 * @returns {{ pageId: string, slug: string, issues: Array<{bucket: string, gate: string}> }}
 */
export function auditPageFallbacks(page) {
  const pageId = page?.id || '(unknown)';
  const slug = page?.slug || '(unknown)';
  const issues = [];

  const rawHeader =
    page?.meta?.header && typeof page.meta.header === 'object' && !Array.isArray(page.meta.header)
      ? page.meta.header
      : null;

  if (!rawHeader) {
    issues.push({
      bucket: 'missingHeader',
      gate: 'Bulk backfill writes page.meta.header.version = 3 for all builder pages.',
    });
  } else if (Number(rawHeader.version || 0) < 3) {
    issues.push({
      bucket: 'staleHeaderVersion',
      gate: 'Header editor normalises to v3 on save; backfill ensures all existing pages are normalised.',
    });
  }

  if (page?.meta?.headerOverrides && typeof page.meta.headerOverrides === 'object') {
    issues.push({
      bucket: 'headerOverrides',
      gate: 'Remove after audit shows zero builder pages with headerOverrides and v3 header is universal.',
    });
  }

  const dependsOnLegacyCopy = !rawHeader || Number(rawHeader.version || 0) < 3;
  if (dependsOnLegacyCopy) {
    for (const section of page?.sections || []) {
      for (const mod of section.modules || []) {
        if (mod?.moduleType === 'header') {
          issues.push({
            bucket: 'legacyHeaderModule',
            gate: 'Backfill canonical v3 page.meta.header first; remove stored legacy header modules in a later cleanup pass.',
          });
          break; // report once per page
        }
      }
      if (issues.some((i) => i.bucket === 'legacyHeaderModule')) break;
    }
  }

  return { pageId, slug, issues };
}

/**
 * Aggregate fallback audit across multiple builder pages.
 *
 * To use this as the legacy-reader removal gate, pass the complete admin page
 * list for exactly one series (for example the full result of fetchPages()).
 *
 * @param {Array<Object>} pages - Array of builder page objects for one series
 * @returns {{
 *   clean: boolean,
 *   pageReports: Array,
 *   bucketSummary: Object,
 *   removalReadiness: {
 *     hasPublishedReaderPage: boolean,
 *     canRemoveLegacyReaderFallback: boolean
 *   }
 * }}
 */
export function auditPagesFallbacks(pages = []) {
  const pageReports = pages.map(auditPageFallbacks);
  const bucketSummary = {};
  const hasPublishedReaderPage = pages.some(
    (page) => String(page?.slug || '').trim() === 'reader' && page?.isPublished === true
  );

  for (const report of pageReports) {
    for (const issue of report.issues) {
      if (!bucketSummary[issue.bucket]) {
        bucketSummary[issue.bucket] = { count: 0, gate: issue.gate, pageIds: [] };
      }
      bucketSummary[issue.bucket].count++;
      bucketSummary[issue.bucket].pageIds.push(report.pageId);
    }
  }

  if (!hasPublishedReaderPage) {
    bucketSummary.missingPublishedReaderPage = {
      count: 1,
      gate: "Remove source:'legacy' only after the series has a published builder page with slug 'reader'.",
      pageIds: [],
    };
  }

  const pageIssuesClean = pageReports.every((report) => report.issues.length === 0);
  const canRemoveLegacyReaderFallback = pageIssuesClean && hasPublishedReaderPage;

  return {
    clean: canRemoveLegacyReaderFallback,
    pageReports,
    bucketSummary,
    removalReadiness: {
      hasPublishedReaderPage,
      canRemoveLegacyReaderFallback,
    },
  };
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
  getPageHeaderSource,
  normalizeHeaderConfig,
  normalizeHeaderCopy,
  normalizeHeaderOverrides,
  resolveHeaderNavItemAppearance,
  resolvePageHeaderState,
  resolveHeaderShellScrolledAppearance,
  resolveHeaderShellTopAppearance,
};

import { expect, test } from '@playwright/test';

import {
  PREVIEW_VIEWPORT_ORDER,
  PREVIEW_VIEWPORTS,
} from '../../admin/page-builder/preview-contract.js';
import { getContractFixtures } from '../helpers/contracts.js';

const fixtures = getContractFixtures();
const VISUAL_BASE_URL =
  process.env.PLAYWRIGHT_VISUAL_BASE_URL ||
  `http://127.0.0.1:${process.env.PLAYWRIGHT_VISUAL_PORT || '3107'}`;
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAIAAAD7G0uFAAAAOElEQVR4nO3NQQEAAAgDINc/9K3hApIgqnSze7MzAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4G29yACUvxiZ5AAAAAElFTkSuQmCC',
  'base64'
);
const FIXED_NOW = '2026-05-11T12:00:00.000Z';
const SERIES_ID = 'battle-bros';
const TEXT_MODULE_ID = 'fffffff1-ffff-4fff-8fff-ffffffffff02';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function json(body) {
  return {
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

function emptyDashboardPayload(pathname) {
  if (pathname.includes('/comments')) return { comments: [] };
  if (pathname.includes('/users')) return { users: [] };
  if (pathname.includes('/analytics/reader')) return { series: [], totals: {} };
  if (pathname.includes('/analytics/weekly-digest')) return { items: [] };
  if (pathname.includes('/analytics')) return { totals: {}, pages: [] };
  if (pathname.includes('/bluesky/notifications')) return { notifications: [], unreadCount: 0 };
  if (pathname.includes('/bluesky/status')) return { connected: false };
  if (pathname.includes('/todos')) return { todos: [] };
  return {};
}

function isDeterministicImageRequest(pathname) {
  return (
    pathname.startsWith('/media/') ||
    pathname.startsWith('/assets/media/') ||
    pathname.startsWith('/api/protected/') ||
    ((pathname.startsWith('/assets/') ||
      pathname.startsWith('/comics/') ||
      pathname.startsWith('/com1cshare/')) &&
      /\.(?:png|jpe?g|gif|webp|svg)$/i.test(pathname))
  );
}

function makeWorkflowPage(overrides = {}) {
  const page = {
    ...clone(fixtures.builderPage),
    ...clone(overrides),
  };
  page.scope = page.scope || 'series';
  page.seriesId = page.scope === 'global' ? null : page.seriesId || SERIES_ID;
  page.sections = Array.isArray(page.sections) ? page.sections : [];
  if (
    !page.sections.some((section) =>
      (section.modules || []).some((mod) => mod.moduleType === 'reader')
    )
  ) {
    page.sections = page.sections.map((section, index) => ({
      ...section,
      sortIndex: index + 1,
    }));
    page.sections.unshift({
      id: 'phase-12-reader-section',
      sectionType: 'row',
      layout: '1',
      sortIndex: 0,
      settings: {},
      modules: [
        {
          id: 'phase-12-reader-module',
          moduleType: 'reader',
          columnIndex: 0,
          sortIndex: 0,
          config: { source: { mode: 'active-page-series' } },
        },
      ],
    });
  }
  for (const section of page.sections) {
    section.modules = Array.isArray(section.modules) ? section.modules : [];
    for (const mod of section.modules) {
      if (mod.moduleType === 'promo' && mod.config) {
        mod.config.autoRotate = false;
        mod.config.transition = 'fade';
      }
    }
  }
  return page;
}

function createWorkflowState({ seriesPage = makeWorkflowPage() } = {}) {
  const state = {
    seriesPages: [seriesPage],
    globalPages: [],
    pageBindings: {
      reader: {
        pageId: seriesPage.id,
        slug: seriesPage.slug,
        title: seriesPage.title,
        scope: 'series',
        seriesId: SERIES_ID,
      },
    },
    nextPageNumber: 1,
    nextSectionNumber: 1,
    nextModuleNumber: 1,
  };

  state.allPages = () => [...state.seriesPages, ...state.globalPages];
  state.findPageById = (pageId) => state.allPages().find((page) => page.id === pageId) || null;
  state.findSeriesPageBySlug = (slug) =>
    state.seriesPages.find((page) => page.slug === slug && page.seriesId === SERIES_ID) || null;
  state.findGlobalPageBySlug = (slug) =>
    state.globalPages.find((page) => page.slug === slug) || null;
  state.findSection = (sectionId) => {
    for (const page of state.allPages()) {
      const section = (page.sections || []).find((candidate) => candidate.id === sectionId);
      if (section) return { page, section };
    }
    return { page: null, section: null };
  };
  state.findModule = (moduleId) => {
    for (const page of state.allPages()) {
      for (const section of page.sections || []) {
        const module = (section.modules || []).find((candidate) => candidate.id === moduleId);
        if (module) return { page, section, module };
      }
    }
    return { page: null, section: null, module: null };
  };
  state.textModule = () => state.findModule(TEXT_MODULE_ID).module;
  return state;
}

function createBlankPage({ scope, slug, title, state }) {
  const id = `phase-12-page-${state.nextPageNumber++}`;
  return {
    ...clone(fixtures.builderPageDraft),
    id,
    scope,
    seriesId: scope === 'global' ? null : SERIES_ID,
    slug,
    title,
    pageType: 'custom',
    isPublished: true,
    sortIndex: scope === 'global' ? state.globalPages.length : state.seriesPages.length,
    sections: [],
  };
}

function createSection({ page, sectionType = 'row', layout = '1', state }) {
  return {
    id: `phase-12-section-${state.nextSectionNumber++}`,
    sectionType,
    layout,
    sortIndex: page.sections?.length || 0,
    settings: {},
    modules: [],
  };
}

function createModule({
  section,
  moduleType,
  columnIndex = 0,
  sortIndex = null,
  config = {},
  state,
}) {
  const nextSortIndex =
    sortIndex ??
    (section.modules || []).filter((module) => Number(module.columnIndex || 0) === columnIndex)
      .length;
  return {
    id: `phase-12-module-${state.nextModuleNumber++}`,
    moduleType,
    columnIndex,
    sortIndex: nextSortIndex,
    config: clone(config),
  };
}

function replacePage(state, nextPage) {
  const collection = nextPage.scope === 'global' ? state.globalPages : state.seriesPages;
  const index = collection.findIndex((page) => page.id === nextPage.id);
  if (index !== -1) collection[index] = nextPage;
}

async function requestJson(request) {
  const body = request.postData();
  return body ? JSON.parse(body) : {};
}

async function installWorkflowRoutes(page, state) {
  const adminPosts = Object.values(fixtures.posts || {});

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();
    const frameUrl = request.frame()?.url() || '';
    const isAdminFrame = frameUrl.includes('/admin/');

    if (isDeterministicImageRequest(pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: PLACEHOLDER_PNG,
      });
      return;
    }

    if (pathname === '/analytics.js') {
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      return;
    }

    if (pathname === '/api/session') {
      await route.fulfill(
        json({
          user: isAdminFrame
            ? { id: 'admin-phase-12', email: 'admin@example.com', role: 'admin' }
            : null,
        })
      );
      return;
    }

    if (pathname === '/series.json') {
      await route.fulfill(json(fixtures.seriesIndex));
      return;
    }

    if (pathname === '/data.json') {
      await route.fulfill(json(fixtures.seriesData));
      return;
    }

    if (pathname === '/page-config.json') {
      await route.fulfill(json(fixtures.pageConfig));
      return;
    }

    if (pathname === '/media.json') {
      await route.fulfill(json(fixtures.mediaItems || []));
      return;
    }

    if (pathname.startsWith(`/api/pages/${SERIES_ID}/`)) {
      const slug = decodeURIComponent(pathname.slice(`/api/pages/${SERIES_ID}/`.length));
      const foundPage = state.findSeriesPageBySlug(slug);
      await route.fulfill(foundPage ? json({ page: foundPage }) : { status: 404, ...json({}) });
      return;
    }

    if (pathname.startsWith('/api/pages/global/by-slug/')) {
      const slug = decodeURIComponent(pathname.slice('/api/pages/global/by-slug/'.length));
      const foundPage = state.findGlobalPageBySlug(slug);
      await route.fulfill(foundPage ? json({ page: foundPage }) : { status: 404, ...json({}) });
      return;
    }

    if (pathname === `/api/admin/pages/series/${SERIES_ID}`) {
      if (method === 'GET') {
        await route.fulfill(json({ pages: state.seriesPages }));
        return;
      }
      if (method === 'POST') {
        const payload = await requestJson(request);
        const nextPage = createBlankPage({
          scope: 'series',
          slug: payload.slug,
          title: payload.title,
          state,
        });
        state.seriesPages.push(nextPage);
        await route.fulfill(json({ page: nextPage }));
        return;
      }
    }

    if (pathname === '/api/admin/pages/global') {
      if (method === 'GET') {
        await route.fulfill(json({ pages: state.globalPages }));
        return;
      }
      if (method === 'POST') {
        const payload = await requestJson(request);
        const nextPage = createBlankPage({
          scope: 'global',
          slug: payload.slug,
          title: payload.title,
          state,
        });
        state.globalPages.push(nextPage);
        await route.fulfill(json({ page: nextPage }));
        return;
      }
    }

    if (
      pathname === `/api/admin/pages/series/${SERIES_ID}/reorder` ||
      pathname === '/api/admin/pages/global/reorder'
    ) {
      const payload = await requestJson(request);
      const pageIds = payload.page_ids || [];
      const collection = pathname.includes('/global/') ? state.globalPages : state.seriesPages;
      const reordered = pageIds.map((pageId) => collection.find((page) => page.id === pageId));
      if (reordered.some((item) => !item)) {
        await route.fulfill({ status: 400, ...json({ error: 'invalid page order' }) });
        return;
      }
      reordered.forEach((pageItem, index) => {
        pageItem.sortIndex = index;
      });
      collection.splice(0, collection.length, ...reordered);
      await route.fulfill(json({ ok: true }));
      return;
    }

    if (pathname === '/api/admin/pages' && url.searchParams.get('series_id') === SERIES_ID) {
      await route.fulfill(json({ pages: state.seriesPages }));
      return;
    }

    if (pathname === `/api/admin/page-bindings/${SERIES_ID}`) {
      if (method === 'GET') {
        await route.fulfill(
          json({
            seriesId: SERIES_ID,
            bindings: clone(state.pageBindings),
            warnings: [],
          })
        );
        return;
      }
      if (method === 'PUT') {
        const payload = await requestJson(request);
        state.pageBindings = {
          ...state.pageBindings,
          ...(payload.bindings || {}),
        };
        await route.fulfill(json({ seriesId: SERIES_ID, bindings: clone(state.pageBindings) }));
        return;
      }
    }

    const pageMatch = pathname.match(/^\/api\/admin\/pages\/([^/]+)$/);
    if (pageMatch) {
      const pageId = decodeURIComponent(pageMatch[1]);
      const foundPage = state.findPageById(pageId);
      if (!foundPage) {
        await route.fulfill({ status: 404, ...json({ error: 'missing page' }) });
        return;
      }
      if (method === 'GET') {
        await route.fulfill(json({ page: foundPage }));
        return;
      }
      if (method === 'PUT') {
        const payload = await requestJson(request);
        Object.assign(foundPage, clone(payload));
        replacePage(state, foundPage);
        await route.fulfill(json({ page: foundPage }));
        return;
      }
      if (method === 'DELETE') {
        state.seriesPages = state.seriesPages.filter((pageItem) => pageItem.id !== pageId);
        state.globalPages = state.globalPages.filter((pageItem) => pageItem.id !== pageId);
        await route.fulfill(json({ ok: true }));
        return;
      }
    }

    const addSectionMatch = pathname.match(/^\/api\/admin\/pages\/([^/]+)\/sections$/);
    if (addSectionMatch && method === 'POST') {
      const pageId = decodeURIComponent(addSectionMatch[1]);
      const foundPage = state.findPageById(pageId);
      if (!foundPage) {
        await route.fulfill({ status: 404, ...json({ error: 'missing page' }) });
        return;
      }
      const payload = await requestJson(request);
      const section = createSection({
        page: foundPage,
        sectionType: payload.sectionType || 'row',
        layout: payload.layout || '1',
        state,
      });
      foundPage.sections = foundPage.sections || [];
      foundPage.sections.push(section);
      await route.fulfill(json({ section }));
      return;
    }

    const reorderSectionsMatch = pathname.match(
      /^\/api\/admin\/pages\/([^/]+)\/sections\/reorder$/
    );
    if (reorderSectionsMatch && method === 'POST') {
      const pageId = decodeURIComponent(reorderSectionsMatch[1]);
      const foundPage = state.findPageById(pageId);
      const payload = await requestJson(request);
      const sectionIds = payload.sectionIds || [];
      if (!foundPage) {
        await route.fulfill({ status: 404, ...json({ error: 'missing page' }) });
        return;
      }
      const reordered = sectionIds.map((sectionId) =>
        (foundPage.sections || []).find((section) => section.id === sectionId)
      );
      if (reordered.some((section) => !section)) {
        await route.fulfill({ status: 400, ...json({ error: 'invalid section order' }) });
        return;
      }
      reordered.forEach((section, index) => {
        section.sortIndex = index;
      });
      foundPage.sections.splice(0, foundPage.sections.length, ...reordered);
      await route.fulfill(json({ ok: true }));
      return;
    }

    const sectionMatch = pathname.match(/^\/api\/admin\/sections\/([^/]+)$/);
    if (sectionMatch && method === 'PUT') {
      const sectionId = decodeURIComponent(sectionMatch[1]);
      const { section } = state.findSection(sectionId);
      if (!section) {
        await route.fulfill({ status: 404, ...json({ error: 'missing section' }) });
        return;
      }
      Object.assign(section, clone(await requestJson(request)));
      await route.fulfill(json({ section }));
      return;
    }

    const addModuleMatch = pathname.match(/^\/api\/admin\/sections\/([^/]+)\/modules$/);
    if (addModuleMatch && method === 'POST') {
      const sectionId = decodeURIComponent(addModuleMatch[1]);
      const { section } = state.findSection(sectionId);
      if (!section) {
        await route.fulfill({ status: 404, ...json({ error: 'missing section' }) });
        return;
      }
      const payload = await requestJson(request);
      const module = createModule({
        section,
        moduleType: payload.moduleType,
        columnIndex: Number(payload.columnIndex || 0),
        sortIndex: payload.sortIndex ?? null,
        config: payload.config || {},
        state,
      });
      section.modules = section.modules || [];
      section.modules.push(module);
      await route.fulfill(json({ module }));
      return;
    }

    const reorderModulesMatch = pathname.match(
      /^\/api\/admin\/sections\/([^/]+)\/modules\/reorder$/
    );
    if (reorderModulesMatch && method === 'POST') {
      const sectionId = decodeURIComponent(reorderModulesMatch[1]);
      const { section } = state.findSection(sectionId);
      const payload = await requestJson(request);
      const columnIndex = Number(payload.columnIndex || 0);
      const moduleIds = payload.moduleIds || [];
      if (!section) {
        await route.fulfill({ status: 404, ...json({ error: 'missing section' }) });
        return;
      }
      const columnModules = moduleIds.map((moduleId) =>
        (section.modules || []).find((module) => module.id === moduleId)
      );
      if (columnModules.some((module) => !module)) {
        await route.fulfill({ status: 400, ...json({ error: 'invalid module order' }) });
        return;
      }
      columnModules.forEach((module, index) => {
        module.columnIndex = columnIndex;
        module.sortIndex = index;
      });
      await route.fulfill(json({ ok: true }));
      return;
    }

    const updateModuleMatch = pathname.match(/^\/api\/admin\/modules\/([^/]+)$/);
    if (updateModuleMatch && method === 'PUT') {
      const moduleId = decodeURIComponent(updateModuleMatch[1]);
      const { module } = state.findModule(moduleId);
      if (!module) {
        await route.fulfill({ status: 404, ...json({ error: 'missing module' }) });
        return;
      }
      const payload = await requestJson(request);
      Object.assign(module, clone(payload));
      await route.fulfill(json({ module }));
      return;
    }

    if (pathname === '/api/admin/posts') {
      await route.fulfill(json({ posts: adminPosts }));
      return;
    }

    if (pathname === '/api/posts/latest') {
      await route.fulfill(json({ post: fixtures.latestPost }));
      return;
    }

    if (pathname === '/api/posts') {
      await route.fulfill(json({ posts: fixtures.feedPosts || [] }));
      return;
    }

    if (pathname === '/api/track/visitor') {
      await route.fulfill(json({ ok: true }));
      return;
    }

    if (pathname === '/api/list-media') {
      await route.fulfill(json({ paths: [] }));
      return;
    }

    if (pathname === '/api/admin/inner-net/target') {
      await route.fulfill(json({ url: '', host: '', port: '', source: 'phase-12-test' }));
      return;
    }

    if (pathname === '/api/admin/assets') {
      await route.fulfill(json({ items: [] }));
      return;
    }

    if (pathname === '/api/comments') {
      await route.fulfill(json({ comments: [] }));
      return;
    }

    if (pathname.startsWith('/api/admin/')) {
      await route.fulfill(json(emptyDashboardPayload(pathname)));
      return;
    }

    await route.continue();
  });
}

async function installStableRuntime(page) {
  await page.addInitScript((fixedNow) => {
    const RealDate = Date;
    const fixedTime = new RealDate(fixedNow).getTime();
    class StableDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedTime]));
      }
      static now() {
        return fixedTime;
      }
    }
    StableDate.UTC = RealDate.UTC;
    StableDate.parse = RealDate.parse;
    window.Date = StableDate;
    Math.random = () => 0;

    const style = document.createElement('style');
    style.setAttribute('data-visual-test-stability', 'true');
    style.textContent = `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
      body::before,
      body::after {
        animation: none !important;
        display: none !important;
      }
    `;
    const install = () => document.head?.appendChild(style);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
      install();
    }
  }, FIXED_NOW);
}

async function prepareWorkflowPage(page, state) {
  await page.setViewportSize({ width: 1920, height: 1300 });
  await installWorkflowRoutes(page, state);
  await installStableRuntime(page);
}

async function gotoAppPage(page, path) {
  const url = new URL(path, VISUAL_BASE_URL).toString();
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  expect(
    response?.ok(),
    `${path} should load successfully; status=${response?.status() || 'none'} url=${page.url()}`
  ).toBe(true);
  return response;
}

async function openBuilder(page, slug = 'reader') {
  await gotoAppPage(
    page,
    `/admin/index.html?view=designer&series=${SERIES_ID}&page=${slug}&surface=header`
  );
  await expect(page.locator('#pageBuilderSection')).toBeVisible();
  await expect(page.locator('#pbViewPreview')).toHaveClass(/pb-view-toggle--active/);
  await waitForPreviewReady(page);
}

async function getPreviewFrame(page) {
  const iframeHandle = await page.locator('.pb-preview-iframe').elementHandle();
  const frame = await iframeHandle?.contentFrame();
  if (!frame) throw new Error('Preview iframe content frame was not available.');
  return frame;
}

async function waitForPreviewReady(page, viewportId = '') {
  const selector = viewportId
    ? `.pb-preview-frame[data-preview-ready="true"][data-width="${viewportId}"][data-metrics-preset="${viewportId}"]`
    : '.pb-preview-frame[data-preview-ready="true"]';
  await page.waitForSelector(selector, { timeout: 15_000 });
}

async function openInspectorField(page, selector) {
  const field = page.locator(selector).first();
  const details = page.locator('.pb-inspector-section').filter({ has: field }).first();
  if ((await details.count()) > 0) {
    await details.evaluate((section) => {
      section.open = true;
    });
  }
  await expect(field).toBeVisible();
  return field;
}

async function waitForState(page, predicate) {
  await expect
    .poll(async () => predicate(), {
      timeout: 7_500,
    })
    .toBe(true);
  await page.waitForTimeout(50);
}

async function selectTextModule(page, { openContent = true } = {}) {
  const frame = await getPreviewFrame(page);
  await page.waitForSelector('.pb-preview-frame[data-target-count]');
  await frame.locator(`[data-builder-module-id="${TEXT_MODULE_ID}"]`).click();
  await expect(page.locator('.pb-preview-target-box--selected')).toBeVisible();
  await expect(page.locator('.pb-preview-target-toolbar')).toBeVisible();
  if (openContent) {
    await openInspectorField(page, '[data-key="content"]');
  }
  return frame;
}

async function saveActiveDraft(page) {
  await page.locator('.pb-editor-footer[data-scope="module"] [data-action="save-current"]').click();
  await expect(page.locator('.pb-editor-footer-status')).not.toContainText('unsaved');
}

test.describe('builder Phase 12 authoring workflows', () => {
  test('opens a bound series reader page, switches exact device widths, and restores chrome preview', async ({
    page,
  }) => {
    const state = createWorkflowState();
    state.seriesPages[0].meta.header.blocks.status.enabled = false;
    await prepareWorkflowPage(page, state);
    await openBuilder(page);

    await page.locator('[data-tab="layers"]').click();
    await page.locator('[data-layer-action="select-page-header"]').click();
    const visiblePlacementCard = page.locator('.pb-header-layout-card[data-block-id="brand"]');
    const hiddenPlacementCard = page.locator('.pb-header-layout-card[data-block-id="status"]');
    await page
      .locator('.pb-inspector-section')
      .filter({ has: visiblePlacementCard })
      .evaluate((section) => {
        section.open = true;
      });
    await expect(visiblePlacementCard).toHaveAccessibleName('Logo / Title / Subtitle');
    await expect(visiblePlacementCard).toHaveAccessibleDescription('Visible');
    await expect(hiddenPlacementCard).toHaveAccessibleName('Status Message');
    await expect(hiddenPlacementCard).toHaveAccessibleDescription('Hidden on this page');

    await expect(page.locator('.pb-page-item.active')).toContainText('Reader');
    expect(state.pageBindings.reader.pageId).toBe(state.seriesPages[0].id);
    const initialPreviewFrame = await getPreviewFrame(page);
    await expect(initialPreviewFrame.locator('body')).toHaveAttribute(
      'data-reader-shell',
      'active'
    );
    await expect(
      initialPreviewFrame.locator(`[data-builder-module-id="${TEXT_MODULE_ID}"]`)
    ).toBeVisible();

    for (const viewportId of PREVIEW_VIEWPORT_ORDER) {
      const viewport = PREVIEW_VIEWPORTS[viewportId];
      await page.locator(`#pbWidthToggles [data-width="${viewportId}"]`).click();
      await waitForPreviewReady(page, viewportId);

      const previewFrame = await getPreviewFrame(page);
      const innerWidth = await previewFrame.evaluate(() => window.innerWidth);
      const innerHeight = await previewFrame.evaluate(() => window.innerHeight);
      expect(innerWidth).toBe(viewport.width);
      expect(innerHeight).toBe(viewport.height);

      const frameScale = await page.locator('.pb-preview-frame').evaluate((frame) => ({
        scale: Number(frame.dataset.previewScale || '1'),
        viewportWidth: Number(frame.dataset.viewportWidth || '0'),
        viewportHeight: Number(frame.dataset.viewportHeight || '0'),
      }));
      expect(frameScale.viewportWidth).toBe(viewport.width);
      expect(frameScale.viewportHeight).toBe(viewport.height);
      if (viewportId === 'desktop') {
        expect(frameScale.scale).toBeGreaterThan(0);
        expect(frameScale.scale).toBeLessThan(1);
      }
      const iframeBox = await page.locator('.pb-preview-iframe').boundingBox();
      expect(
        Math.abs((iframeBox?.width || 0) - viewport.width * frameScale.scale)
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs((iframeBox?.height || 0) - viewport.height * frameScale.scale)
      ).toBeLessThanOrEqual(2);
    }

    await selectTextModule(page);
    const beforeChrome = await page.locator('.pb-preview-frame').evaluate((frame) => ({
      previewSession: frame.dataset.previewSession,
      src: frame.querySelector('iframe')?.getAttribute('src'),
      width: frame.dataset.width,
    }));

    await page.locator('#pbEnterPreview').click();
    await expect(page.locator('#pbRestorePreviewChrome')).toBeVisible();
    await expect(page.locator('#pbBuilderToolbar')).toBeHidden();
    await expect(page.locator('#pbBuilderSidePanel')).toBeHidden();
    await expect(page.locator('.pb-preview-frame')).toHaveAttribute(
      'data-builder-editing',
      'false'
    );
    await expect(page.locator('.pb-preview-target-overlay')).toHaveCount(0);

    const duringChrome = await page.locator('.pb-preview-frame').evaluate((frame) => ({
      previewSession: frame.dataset.previewSession,
      src: frame.querySelector('iframe')?.getAttribute('src'),
      width: frame.dataset.width,
    }));
    expect(duringChrome).toEqual(beforeChrome);

    await page.locator('#pbRestorePreviewChrome').click();
    await waitForPreviewReady(page, beforeChrome.width);
    await expect(page.locator('#pbBuilderToolbar')).toBeVisible();
    await expect(page.locator('#pbBuilderSidePanel')).toBeVisible();
    await expect(page.locator('.pb-preview-frame')).toHaveAttribute('data-builder-editing', 'true');
    await expect(page.locator('.pb-preview-target-box--selected')).toBeVisible();
  });

  test('saves side-panel, current-device, and inline text edits through persisted reloads', async ({
    page,
  }) => {
    const state = createWorkflowState();
    await prepareWorkflowPage(page, state);
    await openBuilder(page);

    await selectTextModule(page);
    await page.locator('[data-key="content"]').fill('<p>Browser side-panel save</p>');
    await expect(page.locator('.pb-editor-footer-status')).toContainText('unsaved');
    await saveActiveDraft(page);
    expect(state.textModule()?.config.content).toBe('<p>Browser side-panel save</p>');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForPreviewReady(page);
    let previewFrame = await selectTextModule(page);
    await expect(
      previewFrame.locator(`[data-builder-module-id="${TEXT_MODULE_ID}"]`)
    ).toContainText('Browser side-panel save');

    await page.locator('#pbWidthToggles [data-width="mobile"]').click();
    await waitForPreviewReady(page, 'mobile');
    await selectTextModule(page);
    await (await openInspectorField(page, '[data-responsive-edit-scope]')).selectOption('device');
    const alignmentSelect = await openInspectorField(page, '[data-key="alignment"]');
    await expect(alignmentSelect).toHaveValue('center');
    await alignmentSelect.selectOption('right');
    await saveActiveDraft(page);
    expect(state.textModule()?.config.alignment).toBe('center');
    expect(state.textModule()?.config.responsive.mobile.alignment).toBe('right');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForPreviewReady(page);
    await page.locator('#pbWidthToggles [data-width="mobile"]').click();
    await waitForPreviewReady(page, 'mobile');
    await selectTextModule(page);
    await (await openInspectorField(page, '[data-responsive-edit-scope]')).selectOption('device');
    await expect(await openInspectorField(page, '[data-key="alignment"]')).toHaveValue('right');

    await page.locator('#pbWidthToggles [data-width="desktop"]').click();
    await waitForPreviewReady(page, 'desktop');
    previewFrame = await selectTextModule(page, { openContent: false });
    await (await openInspectorField(page, '[data-responsive-edit-scope]')).selectOption('global');
    await openInspectorField(page, '[data-key="content"]');
    await page.locator('[data-preview-target-action="edit-text"]').click();
    const editableText = previewFrame
      .locator(`[data-builder-module-id="${TEXT_MODULE_ID}"] [data-builder-edit-field="content"]`)
      .first();
    await expect(editableText).toHaveAttribute('contenteditable', 'true');
    await editableText.fill('Inline browser save');
    await expect(page.locator('[data-key="content"]')).toHaveValue(/Inline browser save/);
    await saveActiveDraft(page);
    expect(state.textModule()?.config.content).toContain('Inline browser save');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForPreviewReady(page);
    previewFrame = await selectTextModule(page);
    await expect(
      previewFrame.locator(`[data-builder-module-id="${TEXT_MODULE_ID}"]`)
    ).toContainText('Inline browser save');

    await page.locator('[data-preview-target-action="edit-text"]').click();
    const discardEditableText = previewFrame
      .locator(`[data-builder-module-id="${TEXT_MODULE_ID}"] [data-builder-edit-field="content"]`)
      .first();
    await expect(discardEditableText).toHaveAttribute('contenteditable', 'true');
    await discardEditableText.fill('Inline browser discard');
    await expect(page.locator('[data-key="content"]')).toHaveValue(/Inline browser discard/);
    await page
      .locator('.pb-editor-footer[data-scope="module"] [data-action="discard-current"]')
      .click();
    await expect(page.locator('[data-key="content"]')).toHaveValue(/Inline browser save/);
    expect(state.textModule()?.config.content).toContain('Inline browser save');
    expect(state.textModule()?.config.content).not.toContain('Inline browser discard');
  });

  test('persists live block drops and creates a global Feed template page', async ({ page }) => {
    const state = createWorkflowState();
    await prepareWorkflowPage(page, state);
    await openBuilder(page);
    await page.waitForSelector('.pb-preview-frame[data-target-count]');
    await page.getByRole('button', { name: 'Blocks' }).click();

    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await page.locator('.pb-module-type[data-module-type="text"]').dispatchEvent('dragstart', {
      dataTransfer,
    });
    await expect(page.locator('.pb-preview-target-overlay')).toHaveClass(/is-live-dragging/);
    const dropPoint = await page.locator('.pb-preview-frame').evaluate((frame, moduleId) => {
      const iframe = frame.querySelector('.pb-preview-iframe');
      const target = iframe?.contentDocument?.querySelector(
        `[data-builder-module-id="${moduleId}"]`
      );
      if (!iframe || !target) return { clientX: 120, clientY: 120 };
      const frameRect = frame.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const scale = Number(frame.dataset.previewScale || '1') || 1;
      return {
        clientX: frameRect.left + (targetRect.left + targetRect.width / 2) * scale,
        clientY: frameRect.top + (targetRect.bottom + 4) * scale,
      };
    }, TEXT_MODULE_ID);
    await page.locator('.pb-preview-target-overlay').dispatchEvent('dragover', {
      dataTransfer,
      clientX: dropPoint.clientX,
      clientY: dropPoint.clientY,
    });
    await expect(page.locator('.pb-preview-drop-guide')).toBeVisible();
    await page.locator('.pb-preview-target-overlay').dispatchEvent('drop', {
      dataTransfer,
      clientX: dropPoint.clientX,
      clientY: dropPoint.clientY,
    });

    await waitForState(page, () =>
      state.seriesPages[0].sections.some(
        (section) =>
          (section.modules || []).filter((module) => module.moduleType === 'text').length > 1
      )
    );
    const textModules = state.seriesPages[0].sections
      .flatMap((section) => section.modules || [])
      .filter((module) => module.moduleType === 'text');
    expect(textModules).toHaveLength(2);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForPreviewReady(page);
    const previewFrame = await getPreviewFrame(page);
    await expect(previewFrame.locator('[data-builder-module-type="text"]')).toHaveCount(2);

    await page.locator('.pb-page-scope-toggle[data-page-scope="global"]').click();
    await expect(page.locator('#pbPageList')).toContainText('No global pages yet');
    await page.locator('#pbAddPage').click();
    await page.locator('#pbPageSlugInput').fill('site-feed');
    await page.locator('#pbPageTitleInput').fill('Site Feed');
    await page.locator('#pbPageTemplateSelect').selectOption('feed');
    await page.locator('#pbAddPageForm').evaluate((form) => form.requestSubmit());

    await waitForState(
      page,
      () =>
        state.globalPages.length === 1 &&
        state.globalPages[0].sections.some((section) =>
          (section.modules || []).some((module) => module.moduleType === 'feed')
        )
    );
    expect(state.globalPages[0].scope).toBe('global');
    expect(state.globalPages[0].seriesId).toBeNull();
    expect(state.globalPages[0].pageType).toBe('feed');
    await expect(page.locator('.pb-page-scope-toggle.active')).toContainText('Global Pages');
    await expect(page.locator('.pb-page-item.active')).toContainText('Site Feed');
  });
});

import { expect, test } from '@playwright/test';

import {
  PREVIEW_MEDIA_QUERIES,
  PREVIEW_VIEWPORT_ORDER,
  PREVIEW_VIEWPORTS,
} from '../../shared/page-builder/preview-contract.js';
import { getContractFixtures } from '../helpers/contracts.js';

const fixtures = getContractFixtures();
const VISUAL_BASE_URL =
  process.env.PLAYWRIGHT_VISUAL_BASE_URL ||
  `http://127.0.0.1:${process.env.PLAYWRIGHT_VISUAL_PORT || '3107'}`;
const VISUAL_CAPTURE_SELECTOR = '#visualParityCapture';
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAIAAAD7G0uFAAAAOElEQVR4nO3NQQEAAAgDINc/9K3hApIgqnSze7MzAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4G29yACUvxiZ5AAAAAElFTkSuQmCC',
  'base64'
);
const FIXED_NOW = '2026-05-11T12:00:00.000Z';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stabilizeVisualPage(page) {
  for (const section of page.sections || []) {
    for (const mod of section.modules || []) {
      if (mod.moduleType === 'promo' && mod.config) {
        mod.config.autoRotate = false;
        mod.config.transition = 'fade';
      }
    }
  }
  return page;
}

function buildVisualPage() {
  const page = stabilizeVisualPage(clone(fixtures.builderPage));
  const readerModule = clone(fixtures.builderModules.reader);
  // Panels are reader-owned and fed from the reader's own section, so co-locate the
  // reader and its panel content in one multi-column section (the canonical model).
  const panelSection = (page.sections || []).find((section) =>
    (section.modules || []).some((module) => module.moduleType === 'promo')
  ) || {
    id: 'visual-reader-shell-section',
    sectionType: 'row',
    layout: '1-1',
    settings: {},
    modules: [],
  };
  panelSection.modules = [
    {
      ...readerModule,
      id: 'visual-reader-shell-module',
      columnIndex: 0,
      sortIndex: -1,
      config: {
        ...readerModule.config,
        source: { mode: 'active-page-series' },
        showPanels: true,
        showComments: true,
      },
    },
    ...panelSection.modules,
  ];
  if (!page.sections.includes(panelSection)) {
    page.sections.push(panelSection);
  }
  return page;
}

function buildNoReaderVisualPage() {
  return stabilizeVisualPage(
    Object.assign(clone(fixtures.builderPage), {
      id: 'visual-about-page',
      slug: 'about',
      title: 'About Battle Bros',
      pageType: 'custom',
      isHomepage: false,
    })
  );
}

function buildCustomizedReaderVisualPage() {
  const page = buildVisualPage();
  Object.assign(page, {
    id: 'visual-custom-reader-page',
    slug: 'custom-reader',
    title: 'Custom Reader',
    pageType: 'custom',
    isHomepage: false,
  });
  const readerModule = page.sections
    .flatMap((section) => section.modules || [])
    .find((module) => module.moduleType === 'reader');
  readerModule.config = {
    ...readerModule.config,
    controls: { placement: 'overlay', size: 'large' },
    stage: {
      fit: 'width',
      pageGap: 24,
      frameBorder: false,
      maxWidth: 1280,
    },
    panels: {
      left: { enabled: false },
      right: { enabled: false },
    },
    showComments: false,
  };
  return page;
}

function buildVerticalReaderVisualPage() {
  const page = buildVisualPage();
  Object.assign(page, {
    id: 'visual-vertical-reader-page',
    slug: 'vertical-reader',
    title: 'Vertical Reader',
    pageType: 'custom',
    isHomepage: false,
  });
  const readerModule = page.sections
    .flatMap((section) => section.modules || [])
    .find((module) => module.moduleType === 'reader');
  readerModule.config = {
    ...readerModule.config,
    displayMode: 'vertical-scroll',
    controls: { placement: 'below', size: 'medium' },
    stage: {
      fit: 'width',
      pageGap: 16,
      frameBorder: false,
      maxWidth: 1024,
    },
    panels: {
      left: { enabled: false },
      right: { enabled: false },
    },
    showComments: false,
  };
  return page;
}

function buildPhase5ColumnsVisualPage() {
  const page = buildVisualPage();
  Object.assign(page, {
    id: 'visual-phase5-layout-page',
    slug: 'phase5-layout',
    title: 'Phase 5 Layout',
    pageType: 'reader',
    isHomepage: false,
  });
  const readerSection = page.sections.find((section) =>
    (section.modules || []).some((module) => module.moduleType === 'reader')
  );
  const textModule = (id, columnIndex, label) => ({
    id,
    moduleType: 'text',
    columnIndex,
    sortIndex: 0,
    config: {
      content: `<p>${label}</p>`,
    },
  });

  const aboveSection = {
    id: 'phase5-above-reader',
    sectionType: 'row',
    layout: '1',
    settings: {
      columnGap: 12,
      columns: [
        {
          index: 0,
          appearance: {
            background: { color: '#132238' },
            text: { color: '#f4f8ff' },
            border: { width: 1, color: '#35557d', radius: 12 },
          },
          padding: { top: 12, right: 12, bottom: 12, left: 12 },
        },
      ],
    },
    modules: [textModule('phase5-above-copy', 0, 'Authored content above the reader')],
  };
  const fourColumnSection = {
    id: 'phase5-four-columns',
    sectionType: 'row',
    layout: '2-1-1-1',
    settings: {
      columnGap: 10,
      columns: [
        {
          index: 0,
          appearance: {
            background: {
              type: 'gradient',
              color: '#193552',
              secondaryColor: '#245b72',
              angle: 135,
              opacity: 0.9,
            },
            text: { color: '#ffffff' },
            border: { width: 1, color: '#4f9db5', radius: 10 },
          },
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
          minHeight: 84,
        },
        {
          index: 1,
          appearance: {
            background: { color: '#2f2440', opacity: 0.9 },
            text: { color: '#f8efff' },
            border: { width: 1, color: '#8a67aa', radius: 10 },
          },
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        {
          index: 2,
          appearance: {
            background: { color: '#3f2b1d' },
            text: { color: '#fff6e8' },
            border: { width: 1, color: '#a66b35', radius: 10 },
          },
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
          responsive: {
            mobile: {
              hidden: true,
            },
          },
        },
        {
          index: 3,
          appearance: {
            background: { color: '#18382b' },
            text: { color: '#ecfff6' },
            border: { width: 1, color: '#3c9168', radius: 10 },
          },
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
          responsive: {
            tablet: {
              alignment: 'center',
              minHeight: 96,
            },
          },
        },
      ],
      responsive: {
        tablet: { layout: '1-1' },
        mobile: { layout: '1' },
      },
    },
    modules: Array.from({ length: 4 }, (_, index) =>
      textModule(`phase5-four-${index}`, index, `Four column ${index + 1}`)
    ),
  };
  const sixColumnSection = {
    id: 'phase5-six-columns',
    sectionType: 'row',
    layout: '1-1-1-1-1-1',
    settings: {
      columnGap: 8,
      columns: Array.from({ length: 6 }, (_, index) => ({
        index,
        appearance: {
          background: { color: index % 2 ? '#252b38' : '#1d2330' },
          text: { color: '#f5f7fb' },
          border: { width: 1, color: '#4b5568', radius: 8 },
        },
        padding: { top: 8, right: 8, bottom: 8, left: 8 },
        ...(index === 4 ? { hidden: true } : {}),
      })),
      responsive: {
        tablet: { layout: '1-1-1' },
        mobile: { layout: '1-1' },
      },
    },
    modules: Array.from({ length: 6 }, (_, index) =>
      textModule(`phase5-six-${index}`, index, `Six column ${index + 1}`)
    ),
  };

  const twoColumnSection = {
    id: 'phase5-two-columns',
    sectionType: 'row',
    layout: '1-1',
    settings: {
      columnGap: 12,
      columns: [
        {
          index: 0,
          appearance: {
            background: { color: '#1f2a44' },
            text: { color: '#f4f8ff' },
            border: { width: 2, color: '#4f9db5', radius: 12 },
          },
          padding: { top: 14, right: 14, bottom: 14, left: 14 },
          minHeight: 80,
        },
        {
          index: 1,
          appearance: {
            background: { color: '#44261f' },
            text: { color: '#fff6ef' },
            border: { width: 2, color: '#b5734f', radius: 12 },
          },
          padding: { top: 14, right: 14, bottom: 14, left: 14 },
          minHeight: 80,
        },
      ],
      responsive: { mobile: { layout: '1' } },
    },
    modules: Array.from({ length: 2 }, (_, index) =>
      textModule(`phase5-two-${index}`, index, `Two column ${index + 1}`)
    ),
  };
  const threeColumnSection = {
    id: 'phase5-three-columns',
    sectionType: 'row',
    layout: '1-1-1',
    settings: {
      columnGap: 10,
      columns: Array.from({ length: 3 }, (_, index) => ({
        index,
        appearance: {
          background: { color: ['#203a2b', '#2b2440', '#3a3320'][index] },
          text: { color: '#f6fff9' },
          border: { width: 2, color: '#5f8f6f', radius: 8 },
        },
        padding: { top: 12, right: 12, bottom: 12, left: 12 },
      })),
      responsive: { tablet: { layout: '1-1' }, mobile: { layout: '1' } },
    },
    modules: Array.from({ length: 3 }, (_, index) =>
      textModule(`phase5-three-${index}`, index, `Three column ${index + 1}`)
    ),
  };

  page.sections = [
    aboveSection,
    readerSection,
    twoColumnSection,
    threeColumnSection,
    fourColumnSection,
    sixColumnSection,
  ];
  return page;
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

async function gotoAppPage(page, path) {
  const url = new URL(path, VISUAL_BASE_URL).toString();
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  expect(
    response?.ok(),
    `${path} should load successfully; status=${response?.status() || 'none'} url=${page.url()}`
  ).toBe(true);
  return response;
}

async function installVisualRoutes(page) {
  const visualPage = buildVisualPage();
  const noReaderPage = buildNoReaderVisualPage();
  const customReaderPage = buildCustomizedReaderVisualPage();
  const verticalReaderPage = buildVerticalReaderVisualPage();
  const phase5ColumnsPage = buildPhase5ColumnsVisualPage();
  const adminPosts = Object.values(fixtures.posts || {});

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
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
            ? { id: 'admin-visual', email: 'admin@example.com', role: 'admin' }
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

    if (pathname === '/api/pages/battle-bros/reader') {
      await route.fulfill(json({ page: visualPage }));
      return;
    }

    if (pathname === '/api/pages/battle-bros/about') {
      await route.fulfill(json({ page: noReaderPage }));
      return;
    }

    if (pathname === '/api/pages/battle-bros/custom-reader') {
      await route.fulfill(json({ page: customReaderPage }));
      return;
    }

    if (pathname === '/api/pages/battle-bros/vertical-reader') {
      await route.fulfill(json({ page: verticalReaderPage }));
      return;
    }

    if (pathname === '/api/pages/battle-bros/phase5-layout') {
      await route.fulfill(json({ page: phase5ColumnsPage }));
      return;
    }

    if (pathname === '/api/admin/pages/series/battle-bros') {
      await route.fulfill(
        json({
          pages: [
            visualPage,
            noReaderPage,
            customReaderPage,
            verticalReaderPage,
            phase5ColumnsPage,
          ],
        })
      );
      return;
    }

    if (pathname === '/api/admin/pages/global') {
      await route.fulfill(json({ pages: [] }));
      return;
    }

    if (pathname === '/api/admin/pages' && url.searchParams.get('series_id') === 'battle-bros') {
      await route.fulfill(
        json({
          pages: [
            visualPage,
            noReaderPage,
            customReaderPage,
            verticalReaderPage,
            phase5ColumnsPage,
          ],
        })
      );
      return;
    }

    if (pathname === '/api/admin/page-bindings/battle-bros') {
      await route.fulfill(
        json({
          seriesId: 'battle-bros',
          bindings: { reader: visualPage.id },
          warnings: [],
        })
      );
      return;
    }

    if (pathname === `/api/admin/pages/${visualPage.id}`) {
      await route.fulfill(json({ page: visualPage }));
      return;
    }

    if (pathname === `/api/admin/pages/${noReaderPage.id}`) {
      await route.fulfill(json({ page: noReaderPage }));
      return;
    }

    if (pathname === `/api/admin/pages/${customReaderPage.id}`) {
      await route.fulfill(json({ page: customReaderPage }));
      return;
    }

    if (pathname === `/api/admin/pages/${verticalReaderPage.id}`) {
      await route.fulfill(json({ page: verticalReaderPage }));
      return;
    }

    if (pathname === `/api/admin/pages/${phase5ColumnsPage.id}`) {
      await route.fulfill(json({ page: phase5ColumnsPage }));
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
      await route.fulfill(json({ url: '', host: '', port: '', source: 'visual-test' }));
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

async function preparePage(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await installVisualRoutes(page);
  await installStableRuntime(page);
}

async function waitForAssets(target) {
  await target.evaluate(async () => {
    const timeout = new Promise((resolve) => setTimeout(resolve, 2_500));
    const fontsReady = document.fonts?.ready?.catch(() => undefined) || Promise.resolve();
    const imagePromises = Array.from(document.images)
      .map((img) => {
        img.loading = 'eager';
        return img;
      })
      .filter((img) => !img.complete)
      .map(
        (img) =>
          new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          })
      );
    await Promise.race([Promise.all([fontsReady, ...imagePromises]), timeout]);
  });
}

async function waitForReaderReady(page) {
  await page.waitForSelector('html:not(.reader-bootstrap-loading)');
  await expect(page.locator('header.topbar')).toBeVisible();
  await expect(page.locator('.viewerWrap')).toBeVisible();
  await expect(page.locator('#leftPanel .panel-builder--left')).toBeVisible();
  await expect(page.locator('#rightPanel .panel-builder--right')).toBeVisible();
  await expect(page.locator('#leftPanel .pb-module--text')).toBeVisible();
  await expect(page.locator('#leftPanel .pb-module--image')).toBeVisible();
  await expect(page.locator('#leftPanel .pb-module--promo')).toBeVisible();
  await expect(page.locator('#rightPanel .pb-module--feed')).toBeVisible();
  await expect(page.locator('header.topbar .nav-link').filter({ hasText: 'About' })).toBeVisible();
  await waitForAssets(page);
}

async function waitForFrameAssets(frame) {
  await frame.evaluate(async () => {
    const timeout = new Promise((resolve) => setTimeout(resolve, 2_500));
    const fontsReady = document.fonts?.ready?.catch(() => undefined) || Promise.resolve();
    const imagePromises = Array.from(document.images)
      .map((img) => {
        img.loading = 'eager';
        return img;
      })
      .filter((img) => !img.complete)
      .map(
        (img) =>
          new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          })
      );
    await Promise.race([Promise.all([fontsReady, ...imagePromises]), timeout]);
  });
}

async function lockScreenshotViewport(target, viewport) {
  await target.evaluate(({ captureHeight, captureWidth, height, width }) => {
    const screenshotWidth = captureWidth || width;
    const screenshotHeight = captureHeight || height;
    const style = document.createElement('style');
    style.setAttribute('data-visual-test-viewport-lock', 'true');
    style.textContent = `
      html,
      body {
        border: 0 !important;
        box-sizing: border-box !important;
        width: ${width}px !important;
        min-width: ${width}px !important;
        max-width: ${width}px !important;
        height: ${height}px !important;
        min-height: ${height}px !important;
        max-height: ${height}px !important;
        margin: 0 !important;
        overflow: hidden !important;
        padding: 0 !important;
        scrollbar-width: none !important;
      }
      html::-webkit-scrollbar,
      body::-webkit-scrollbar {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    let capture = document.getElementById('visualParityCapture');
    if (!capture) {
      capture = document.createElement('div');
      capture.id = 'visualParityCapture';
      const content = document.createElement('div');
      content.id = 'visualParityContent';
      const bodyChildren = Array.from(document.body.children).filter((child) => {
        if (child.id === 'visualParityCapture') return false;
        if (child.id === 'visualParityContent') return false;
        if (child.matches('script, style')) return false;
        return true;
      });
      for (const child of bodyChildren) {
        content.appendChild(child);
      }
      capture.appendChild(content);
      document.body.prepend(capture);
    }

    const bodyStyle = window.getComputedStyle(document.body);
    const content = document.getElementById('visualParityContent');
    if (content) {
      content.style.border = '0';
      content.style.boxSizing = 'border-box';
      content.style.display = 'block';
      content.style.height = `${height}px`;
      content.style.margin = '0';
      content.style.maxHeight = `${height}px`;
      content.style.maxWidth = `${width}px`;
      content.style.minHeight = `${height}px`;
      content.style.minWidth = `${width}px`;
      content.style.overflow = 'hidden';
      content.style.padding = '0';
      content.style.width = `${width}px`;
    }
    capture.style.border = '0';
    capture.style.boxSizing = 'border-box';
    capture.style.contain = 'layout paint size';
    capture.style.display = 'block';
    capture.style.flex = 'none';
    capture.style.position = 'relative';
    capture.style.width = `${screenshotWidth}px`;
    capture.style.minWidth = `${screenshotWidth}px`;
    capture.style.maxWidth = `${screenshotWidth}px`;
    capture.style.height = `${screenshotHeight}px`;
    capture.style.minHeight = `${screenshotHeight}px`;
    capture.style.maxHeight = `${screenshotHeight}px`;
    capture.style.margin = '0';
    capture.style.overflow = 'clip';
    capture.style.padding = '0';
    capture.style.background = bodyStyle.background;
  }, viewport);
}

function getReaderCaptureViewport(viewport, viewportId) {
  return {
    ...viewport,
    captureWidth: viewport.width + (viewportId === 'mobile' ? 1 : 0),
    captureHeight: viewport.height + 1,
  };
}

function snapshotOptions(viewportId) {
  return viewportId === 'mobile' ? { maxDiffPixelRatio: 0.06 } : { maxDiffPixelRatio: 0.02 };
}

function adminPreviewSnapshotOptions(viewportId) {
  // Chromium rasterizes iframe text/borders with slight subpixel differences even
  // when the computed layout and capture geometry match the top-level reader.
  return viewportId === 'mobile' ? snapshotOptions(viewportId) : { maxDiffPixelRatio: 0.025 };
}

async function getPreviewFrame(page) {
  const iframeHandle = await page.locator('.pb-preview-iframe').elementHandle();
  const frame = await iframeHandle?.contentFrame();
  if (!frame) throw new Error('Preview iframe content frame was not available.');
  return frame;
}

async function waitForPreviewReady(page, viewportId = '') {
  try {
    const selector = viewportId
      ? `.pb-preview-frame[data-preview-ready="true"][data-width="${viewportId}"][data-metrics-preset="${viewportId}"]`
      : '.pb-preview-frame[data-preview-ready="true"]';
    await page.waitForSelector(selector, { timeout: 15_000 });
  } catch (error) {
    const diagnostics = await page.locator('.pb-preview-frame').evaluate((frame) => ({
      ...frame.dataset,
    }));
    throw new Error(
      `Preview iframe did not become ready. error=${diagnostics.previewError || 'none'} diagnostics=${JSON.stringify(diagnostics)}`
    );
  }
}

async function assertPreviewShell(frame) {
  await expect(frame.locator('header.topbar')).toBeVisible();
  await expect(frame.locator('.viewerWrap')).toBeVisible();
  await expect(frame.locator('#leftPanel .panel-builder--left')).toBeVisible();
  await expect(frame.locator('#rightPanel .panel-builder--right')).toBeVisible();
  await expect(frame.locator('#leftPanel .pb-module--text')).toBeVisible();
  await expect(frame.locator('#leftPanel .pb-module--image')).toBeVisible();
  await expect(frame.locator('#leftPanel .pb-module--promo')).toBeVisible();
  await expect(frame.locator('#rightPanel .pb-module--feed')).toBeVisible();
  await expect(frame.locator('header.topbar .nav-link').filter({ hasText: 'About' })).toBeVisible();
}

async function assertNoReaderBuilderPage(target) {
  await expect(target.locator('body')).toHaveAttribute('data-reader-shell', 'inactive');
  await expect(target.locator('header.topbar')).toBeVisible();
  await expect(target.locator('.viewerWrap')).toBeHidden();
  await expect(target.locator('#leftPanel')).toBeHidden();
  await expect(target.locator('#rightPanel')).toBeHidden();
  await expect(target.locator('#controls')).toBeHidden();
  await expect(target.locator('#comicCommentsSection')).toBeHidden();
  await expect(target.locator('.entry-controls')).toBeHidden();
  await expect(target.locator('#entry')).toBeHidden();
  await expect(target.locator('#entryCoverGalleryBtn')).toBeHidden();
  await expect(target.locator('#statusPanel')).toBeHidden();
  await expect(target.locator('#builderPageContent')).toBeVisible();
  await expect(target.locator('#builderPageContent .pb-page')).toBeVisible();
  await expect(target.locator('#builderPageContent .pb-module--text').first()).toBeVisible();
  await expect(target.locator('.pb-reader-mount')).toHaveCount(0);
}

async function assertCustomizedPagedReader(target) {
  await expect(target.locator('body')).toHaveAttribute('data-reader-shell', 'active');
  await expect(target.locator('body')).toHaveAttribute('data-reader-display-mode', 'paged');
  await expect(target.locator('.viewerWrap')).toBeVisible();
  await expect(target.locator('#mainContent')).toHaveAttribute(
    'data-reader-controls-placement',
    'overlay'
  );
  await expect(target.locator('#controls')).toBeVisible();
  await expect(target.locator('#controls')).toHaveAttribute('data-reader-controls-size', 'large');
  await expect(target.locator('#stageWrap')).toHaveAttribute('data-reader-stage-fit', 'width');
  await expect(target.locator('#stageWrap')).toHaveAttribute(
    'data-reader-stage-frame-border',
    'false'
  );
  await expect(target.locator('#stageWrap')).toHaveAttribute('data-reader-stage-max-width', '1280');
  // Panel existence is column-driven (Phase 4): the reader section is 2-column, so both
  // panels exist and are visible. The legacy reader-module `panels: { enabled: false }`
  // toggle in this fixture is inert and can no longer hide them.
  await expect(target.locator('#leftPanel')).toBeVisible();
  await expect(target.locator('#rightPanel')).toBeVisible();
  await expect(target.locator('#comicCommentsSection')).toBeHidden();
  await expect(target.locator('#commentToggleBtn')).toBeHidden();
}

async function assertVerticalReader(target) {
  await expect(target.locator('body')).toHaveAttribute('data-reader-shell', 'active');
  await expect(target.locator('body')).toHaveAttribute(
    'data-reader-display-mode',
    'vertical-scroll'
  );
  // The vertical strip mounts every page; the paged stage is hidden (not removed).
  await expect(target.locator('#verticalStrip')).toBeVisible();
  expect(await target.locator('#verticalStrip .verticalPage img').count()).toBeGreaterThan(0);
  await expect(target.locator('#stageWrap')).toBeHidden();
  // Paged-only controls are hidden in vertical mode.
  await expect(target.locator('#zoomIn')).toBeHidden();
  await expect(target.locator('#zoomOut')).toBeHidden();
  await expect(target.locator('#fullscreenBtn')).toBeHidden();
  // Entry navigation controls remain.
  await expect(target.locator('#prevBtn')).toBeVisible();
  await expect(target.locator('#nextBtn')).toBeVisible();
}

async function collectPhase5ColumnState(target) {
  return target.evaluate(() => {
    const collectSection = (sectionId) => {
      const section =
        document.querySelector(`[data-builder-section-id="${sectionId}"]`) ||
        document.querySelector(`[data-pb-section="${sectionId}"]`);
      if (!section) return null;
      const grid = section.querySelector('.pb-section-columns');
      const columns = Array.from(grid?.children || []);
      const gridTemplate = window.getComputedStyle(grid).gridTemplateColumns;
      const moduleOwners = {};
      section.querySelectorAll('[data-module-id]').forEach((module) => {
        const column = module.closest('.pb-column');
        moduleOwners[module.getAttribute('data-module-id')] = columns.indexOf(column);
      });
      const styles = columns.map((column) => {
        const computed = window.getComputedStyle(column);
        return {
          backgroundColor: computed.backgroundColor,
          borderTopWidth: computed.borderTopWidth,
          borderTopStyle: computed.borderTopStyle,
          borderTopLeftRadius: computed.borderTopLeftRadius,
          paddingTop: computed.paddingTop,
          paddingLeft: computed.paddingLeft,
          minHeight: computed.minHeight,
        };
      });
      return {
        columnCount: columns.length,
        displays: columns.map((column) => window.getComputedStyle(column).display),
        gridTemplate,
        moduleOwners,
        styles,
        trackCount:
          !gridTemplate || gridTemplate === 'none'
            ? 0
            : gridTemplate.split(/\s+/).filter(Boolean).length,
      };
    };

    return {
      aboveSectionCount: document.querySelectorAll('#builderAboveReader .pb-section').length,
      belowSectionCount: document.querySelectorAll('#builderBelowReader .pb-section').length,
      two: collectSection('phase5-two-columns'),
      three: collectSection('phase5-three-columns'),
      four: collectSection('phase5-four-columns'),
      six: collectSection('phase5-six-columns'),
    };
  });
}

async function collectPreviewMetricsDataset(page) {
  return page.locator('.pb-preview-frame').evaluate((frame) => ({
    ...frame.dataset,
  }));
}

async function assertSelectedOverlayAlignment(page) {
  const alignment = await page.locator('.pb-preview-frame').evaluate((frame) => {
    const iframe = frame.querySelector('.pb-preview-iframe');
    const target = iframe?.contentDocument?.querySelector('[data-builder-module-type="text"]');
    const selected = frame.querySelector('.pb-preview-target-box--selected');
    if (!iframe || !target || !selected) {
      return { ready: false };
    }
    const frameRect = frame.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const selectedRect = selected.getBoundingClientRect();
    const scale = Number(frame.dataset.previewScale || '1') || 1;
    return {
      ready: true,
      top: Math.abs(selectedRect.top - (frameRect.top + targetRect.top * scale)),
      left: Math.abs(selectedRect.left - (frameRect.left + targetRect.left * scale)),
      width: Math.abs(selectedRect.width - targetRect.width * scale),
      height: Math.abs(selectedRect.height - targetRect.height * scale),
    };
  });
  expect(alignment.ready).toBe(true);
  expect(alignment.top).toBeLessThanOrEqual(2);
  expect(alignment.left).toBeLessThanOrEqual(2);
  expect(alignment.width).toBeLessThanOrEqual(2);
  expect(alignment.height).toBeLessThanOrEqual(2);
}

test.describe('builder preview visual parity', () => {
  test('no-reader custom pages render authored content without reader shell chrome', async ({
    browser,
  }) => {
    const viewport = PREVIEW_VIEWPORTS.desktop;
    const readerContext = await browser.newContext({
      baseURL: VISUAL_BASE_URL,
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'UTC',
    });
    const readerPage = await readerContext.newPage();
    await preparePage(readerPage, viewport);
    await gotoAppPage(readerPage, '/index.html?series=battle-bros&page=about');
    await readerPage.waitForSelector('html:not(.reader-bootstrap-loading)');
    await assertNoReaderBuilderPage(readerPage);

    const adminContext = await browser.newContext({
      baseURL: VISUAL_BASE_URL,
      viewport: { width: 1920, height: 1300 },
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'UTC',
    });
    const adminPage = await adminContext.newPage();
    await installVisualRoutes(adminPage);
    await installStableRuntime(adminPage);
    await gotoAppPage(
      adminPage,
      '/admin/index.html?view=designer&series=battle-bros&page=about&surface=header'
    );
    await expect(adminPage.locator('#pageBuilderSection')).toBeVisible();
    await waitForPreviewReady(adminPage, 'desktop');

    const previewFrame = await getPreviewFrame(adminPage);
    await assertNoReaderBuilderPage(previewFrame);
    await waitForFrameAssets(previewFrame);

    const metrics = await collectPreviewMetricsDataset(adminPage);
    expect(metrics.metricsPreset).toBe('desktop');
    expect(metrics.metricsInnerWidth).toBe(String(viewport.width));
    expect(metrics.metricsHasOverflow).toBe('false');
    await adminPage.waitForSelector('.pb-preview-frame[data-target-count]');
    const targetCount = Number((await collectPreviewMetricsDataset(adminPage)).targetCount || '0');
    expect(targetCount).toBeGreaterThan(0);

    await adminContext.close();
    await readerContext.close();
  });

  test('customized paged reader settings match public reader and admin live preview', async ({
    browser,
  }) => {
    const viewport = PREVIEW_VIEWPORTS.desktop;
    const readerContext = await browser.newContext({
      baseURL: VISUAL_BASE_URL,
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'UTC',
    });
    const readerPage = await readerContext.newPage();
    await preparePage(readerPage, viewport);
    await gotoAppPage(readerPage, '/index.html?series=battle-bros&page=custom-reader');
    await readerPage.waitForSelector('html:not(.reader-bootstrap-loading)');
    await assertCustomizedPagedReader(readerPage);

    const adminContext = await browser.newContext({
      baseURL: VISUAL_BASE_URL,
      viewport: { width: 1920, height: 1300 },
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'UTC',
    });
    const adminPage = await adminContext.newPage();
    await installVisualRoutes(adminPage);
    await installStableRuntime(adminPage);
    await gotoAppPage(
      adminPage,
      '/admin/index.html?view=designer&series=battle-bros&page=custom-reader&surface=header'
    );
    await expect(adminPage.locator('#pageBuilderSection')).toBeVisible();
    await waitForPreviewReady(adminPage, 'desktop');

    const previewFrame = await getPreviewFrame(adminPage);
    await assertCustomizedPagedReader(previewFrame);
    await waitForFrameAssets(previewFrame);

    const metrics = await collectPreviewMetricsDataset(adminPage);
    expect(metrics.metricsPreset).toBe('desktop');
    expect(metrics.metricsInnerWidth).toBe(String(viewport.width));
    expect(metrics.metricsHasOverflow).toBe('false');

    await adminContext.close();
    await readerContext.close();
  });

  for (const viewportId of PREVIEW_VIEWPORT_ORDER) {
    const viewport = PREVIEW_VIEWPORTS[viewportId];

    test(`vertical-scroll reader matches public reader and admin preview (${viewport.label})`, async ({
      browser,
    }) => {
      const readerContext = await browser.newContext({
        baseURL: VISUAL_BASE_URL,
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'UTC',
      });
      const readerPage = await readerContext.newPage();
      await preparePage(readerPage, viewport);
      await gotoAppPage(readerPage, '/index.html?series=battle-bros&page=vertical-reader');
      await readerPage.waitForSelector('html:not(.reader-bootstrap-loading)');
      await assertVerticalReader(readerPage);

      const adminContext = await browser.newContext({
        baseURL: VISUAL_BASE_URL,
        viewport: {
          width: Math.max(1920, viewport.width + 640),
          height: Math.max(1300, viewport.height + 260),
        },
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'UTC',
      });
      const adminPage = await adminContext.newPage();
      await installVisualRoutes(adminPage);
      await installStableRuntime(adminPage);
      await gotoAppPage(
        adminPage,
        '/admin/index.html?view=designer&series=battle-bros&page=vertical-reader&surface=header'
      );
      await expect(adminPage.locator('#pageBuilderSection')).toBeVisible();
      await adminPage.locator(`#pbWidthToggles [data-width="${viewportId}"]`).click();
      await waitForPreviewReady(adminPage, viewportId);

      const previewFrame = await getPreviewFrame(adminPage);
      await assertVerticalReader(previewFrame);

      await adminContext.close();
      await readerContext.close();
    });

    test(`Phase 5 column layouts match public output (${viewport.label})`, async ({ browser }) => {
      const readerContext = await browser.newContext({
        baseURL: VISUAL_BASE_URL,
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'UTC',
      });
      const readerPage = await readerContext.newPage();
      await preparePage(readerPage, viewport);
      await gotoAppPage(readerPage, '/index.html?series=battle-bros&page=phase5-layout');
      await readerPage.waitForSelector('html:not(.reader-bootstrap-loading)');
      await expect(readerPage.locator('#builderAboveReader .pb-section')).toHaveCount(1);
      await expect(readerPage.locator('#builderBelowReader .pb-section')).toHaveCount(4);
      const publicState = await collectPhase5ColumnState(readerPage);

      await waitForAssets(readerPage);
      await lockScreenshotViewport(readerPage, getReaderCaptureViewport(viewport, viewportId));
      const phase5Screenshot = await readerPage.locator(VISUAL_CAPTURE_SELECTOR).screenshot({
        animations: 'disabled',
        scale: 'css',
      });
      expect(phase5Screenshot).toMatchSnapshot(
        `builder-preview-parity-phase5-${viewportId}.png`,
        snapshotOptions(viewportId)
      );

      const adminContext = await browser.newContext({
        baseURL: VISUAL_BASE_URL,
        viewport: {
          width: Math.max(1920, viewport.width + 640),
          height: Math.max(1300, viewport.height + 260),
        },
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'UTC',
      });
      const adminPage = await adminContext.newPage();
      await installVisualRoutes(adminPage);
      await installStableRuntime(adminPage);
      await gotoAppPage(
        adminPage,
        '/admin/index.html?view=designer&series=battle-bros&page=phase5-layout&surface=header'
      );
      await expect(adminPage.locator('#pageBuilderSection')).toBeVisible();
      await adminPage.locator(`#pbWidthToggles [data-width="${viewportId}"]`).click();
      await waitForPreviewReady(adminPage, viewportId);
      const previewFrame = await getPreviewFrame(adminPage);
      await expect(previewFrame.locator('#builderAboveReader .pb-section')).toHaveCount(1);
      await expect(previewFrame.locator('#builderBelowReader .pb-section')).toHaveCount(4);
      const previewState = await collectPhase5ColumnState(previewFrame);

      expect(previewState).toEqual(publicState);
      await waitForAssets(previewFrame);
      await lockScreenshotViewport(previewFrame, {
        ...viewport,
        captureHeight: viewport.height + 1,
      });
      const adminPreviewScreenshot = await previewFrame
        .locator(VISUAL_CAPTURE_SELECTOR)
        .screenshot({
          animations: 'disabled',
          scale: 'css',
        });
      expect(adminPreviewScreenshot).toMatchSnapshot(
        `builder-preview-parity-phase5-${viewportId}.png`,
        adminPreviewSnapshotOptions(viewportId)
      );
      expect(publicState.four.columnCount).toBe(4);
      expect(publicState.six.columnCount).toBe(6);
      expect(publicState.four.trackCount).toBe({ desktop: 4, tablet: 2, mobile: 1 }[viewportId]);
      expect(publicState.six.trackCount).toBe({ desktop: 5, tablet: 3, mobile: 2 }[viewportId]);
      expect(publicState.six.displays[4]).toBe('none');
      expect(publicState.four.displays[2]).toBe(viewportId === 'mobile' ? 'none' : 'block');
      for (let index = 0; index < 4; index += 1) {
        expect(publicState.four.moduleOwners[`phase5-four-${index}`]).toBe(index);
      }
      for (let index = 0; index < 6; index += 1) {
        expect(publicState.six.moduleOwners[`phase5-six-${index}`]).toBe(index);
      }

      // Styled 2- and 3-column layouts keep their authored global column count and
      // per-column styling while reflowing grid tracks across device widths.
      expect(publicState.two.columnCount).toBe(2);
      expect(publicState.three.columnCount).toBe(3);
      expect(publicState.two.trackCount).toBe({ desktop: 2, tablet: 2, mobile: 1 }[viewportId]);
      expect(publicState.three.trackCount).toBe({ desktop: 3, tablet: 2, mobile: 1 }[viewportId]);
      for (let index = 0; index < 2; index += 1) {
        expect(publicState.two.moduleOwners[`phase5-two-${index}`]).toBe(index);
      }
      for (let index = 0; index < 3; index += 1) {
        expect(publicState.three.moduleOwners[`phase5-three-${index}`]).toBe(index);
      }
      // Authored appearance/padding lands on the column element as computed styles.
      expect(publicState.two.styles[0]).toMatchObject({
        backgroundColor: 'rgb(31, 42, 68)',
        borderTopWidth: '2px',
        borderTopStyle: 'solid',
        borderTopLeftRadius: '12px',
        paddingTop: '14px',
        paddingLeft: '14px',
        minHeight: '80px',
      });
      expect(publicState.three.styles[1]).toMatchObject({
        backgroundColor: 'rgb(43, 36, 64)',
        borderTopWidth: '2px',
        borderTopLeftRadius: '8px',
        paddingTop: '12px',
      });

      await adminContext.close();
      await readerContext.close();
    });

    test(`${viewport.label} preview matches reader route`, async ({ browser }) => {
      const readerContext = await browser.newContext({
        baseURL: VISUAL_BASE_URL,
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'UTC',
      });
      const readerPage = await readerContext.newPage();
      await preparePage(readerPage, viewport);
      await gotoAppPage(readerPage, '/index.html?series=battle-bros&page=reader');
      await waitForReaderReady(readerPage);
      await lockScreenshotViewport(readerPage, getReaderCaptureViewport(viewport, viewportId));

      const readerScreenshot = await readerPage.locator(VISUAL_CAPTURE_SELECTOR).screenshot({
        animations: 'disabled',
        scale: 'css',
      });
      expect(readerScreenshot).toMatchSnapshot(
        `builder-preview-parity-${viewportId}.png`,
        snapshotOptions(viewportId)
      );

      const adminContext = await browser.newContext({
        baseURL: VISUAL_BASE_URL,
        viewport: {
          width: Math.max(1920, viewport.width + 640),
          height: Math.max(1300, viewport.height + 260),
        },
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'UTC',
      });
      const adminPage = await adminContext.newPage();
      await installVisualRoutes(adminPage);
      await installStableRuntime(adminPage);
      await gotoAppPage(
        adminPage,
        '/admin/index.html?view=designer&series=battle-bros&page=reader&surface=header'
      );

      await expect(adminPage.locator('#pageBuilderSection')).toBeVisible();
      await expect(adminPage.locator('#pbViewPreview')).toHaveClass(/pb-view-toggle--active/);
      await expect(adminPage.locator('.pb-preview-frame')).toBeVisible();
      await adminPage.locator('#pbViewEdit').click();
      await adminPage.locator('#pbViewPreview').click();

      await expect(adminPage.locator('#pbWidthToggles')).toBeVisible();
      await adminPage.locator(`#pbWidthToggles [data-width="${viewportId}"]`).click();
      await waitForPreviewReady(adminPage, viewportId);

      const previewFrame = await getPreviewFrame(adminPage);
      await assertPreviewShell(previewFrame);
      await waitForFrameAssets(previewFrame);

      const innerWidth = await previewFrame.evaluate(() => window.innerWidth);
      expect(innerWidth).toBe(viewport.width);

      const metrics = await collectPreviewMetricsDataset(adminPage);
      expect(metrics.metricsPreset).toBe(viewportId);
      expect(metrics.metricsInnerWidth).toBe(String(viewport.width));
      const branchFlags = JSON.parse(metrics.metricsBranchFlags || '{}');
      for (const [key, query] of Object.entries(PREVIEW_MEDIA_QUERIES)) {
        expect(branchFlags[key], `${viewportId} ${query.label}`).toBe(query.expected[viewportId]);
      }
      if (viewportId === 'mobile') {
        expect(metrics.metricsHasOverflow).toBe('false');
      }

      await lockScreenshotViewport(previewFrame, {
        ...viewport,
        captureHeight: viewport.height + 1,
      });
      const previewScreenshot = await previewFrame.locator(VISUAL_CAPTURE_SELECTOR).screenshot({
        animations: 'disabled',
        scale: 'css',
      });
      expect(previewScreenshot).toMatchSnapshot(
        `builder-preview-parity-${viewportId}.png`,
        snapshotOptions(viewportId)
      );

      await adminPage.waitForSelector('.pb-preview-frame[data-target-count]');
      const textTarget = previewFrame.locator('[data-builder-module-type="text"]').first();
      await textTarget.hover();
      await expect(adminPage.locator('.pb-preview-target-box--hover')).toBeVisible();
      await textTarget.click();
      await expect(adminPage.locator('.pb-preview-target-box--selected')).toBeVisible();
      await expect(adminPage.locator('.pb-preview-target-toolbar')).toBeVisible();
      await assertSelectedOverlayAlignment(adminPage);
      await previewFrame.evaluate(() => window.scrollTo(0, 48));
      await adminPage.waitForTimeout(120);
      await assertSelectedOverlayAlignment(adminPage);

      const frameBeforeChrome = await collectPreviewMetricsDataset(adminPage);
      await adminPage.locator('#pbEnterPreview').click();
      await expect(adminPage.locator('#pbRestorePreviewChrome')).toBeVisible();
      await expect(adminPage.locator('#pbBuilderToolbar')).toBeHidden();
      await expect(adminPage.locator('#pbBuilderSidePanel')).toBeHidden();
      await expect(adminPage.locator('.pb-preview-status')).toBeHidden();
      await expect(adminPage.locator('.pb-preview-target-overlay')).toHaveCount(0);
      await expect(adminPage.locator('.pb-preview-frame')).toHaveAttribute(
        'data-builder-editing',
        'false'
      );
      const frameDuringChrome = await collectPreviewMetricsDataset(adminPage);
      expect(frameDuringChrome.previewSession).toBe(frameBeforeChrome.previewSession);
      expect(frameDuringChrome.width).toBe(viewportId);
      expect(frameDuringChrome.viewportWidth).toBe(String(viewport.width));
      expect(frameDuringChrome.viewportHeight).toBe(String(viewport.height));

      await adminPage.locator('#pbRestorePreviewChrome').click();
      await waitForPreviewReady(adminPage, viewportId);
      await adminPage.waitForSelector('.pb-preview-frame[data-target-count]');
      await expect(adminPage.locator('#pbBuilderToolbar')).toBeVisible();
      await expect(adminPage.locator('#pbBuilderSidePanel')).toBeVisible();
      await expect(adminPage.locator('.pb-preview-frame')).toHaveAttribute(
        'data-builder-editing',
        'true'
      );
      await expect(adminPage.locator('.pb-preview-target-box--selected')).toBeVisible();
      await expect(adminPage.locator('.pb-preview-target-toolbar')).toBeVisible();

      await adminContext.close();
      await readerContext.close();
    });
  }
});

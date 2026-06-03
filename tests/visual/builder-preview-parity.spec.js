import { expect, test } from '@playwright/test';

import {
  PREVIEW_MEDIA_QUERIES,
  PREVIEW_VIEWPORT_ORDER,
  PREVIEW_VIEWPORTS,
} from '../../admin/page-builder/preview-contract.js';
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

function buildVisualPage() {
  const page = clone(fixtures.builderPage);
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

    if (pathname === '/api/admin/pages' && url.searchParams.get('series_id') === 'battle-bros') {
      await route.fulfill(json({ pages: [visualPage] }));
      return;
    }

    if (pathname === `/api/admin/pages/${visualPage.id}`) {
      await route.fulfill(json({ page: visualPage }));
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
    return {
      ready: true,
      top: Math.abs(selectedRect.top - (frameRect.top + targetRect.top)),
      left: Math.abs(selectedRect.left - (frameRect.left + targetRect.left)),
      width: Math.abs(selectedRect.width - targetRect.width),
      height: Math.abs(selectedRect.height - targetRect.height),
    };
  });
  expect(alignment.ready).toBe(true);
  expect(alignment.top).toBeLessThanOrEqual(2);
  expect(alignment.left).toBeLessThanOrEqual(2);
  expect(alignment.width).toBeLessThanOrEqual(2);
  expect(alignment.height).toBeLessThanOrEqual(2);
}

test.describe('builder preview visual parity', () => {
  for (const viewportId of PREVIEW_VIEWPORT_ORDER) {
    const viewport = PREVIEW_VIEWPORTS[viewportId];

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

      await lockScreenshotViewport(previewFrame, viewport);
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

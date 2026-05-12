import { defineConfig, devices } from '@playwright/test';

const VISUAL_HOST = '127.0.0.1';
const VISUAL_PORT = process.env.PLAYWRIGHT_VISUAL_PORT || '3107';
const VISUAL_BASE_URL = `http://${VISUAL_HOST}:${VISUAL_PORT}`;

export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: false,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
    toMatchSnapshot: {
      maxDiffPixelRatio: 0.02,
    },
  },
  use: {
    baseURL: VISUAL_BASE_URL,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: {
    command: `node ./node_modules/vite/bin/vite.js --host ${VISUAL_HOST} --port ${VISUAL_PORT} --strictPort`,
    url: VISUAL_BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

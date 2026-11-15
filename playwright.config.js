import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests run against the Vite dev server in a real Chrome.
 * `channel: 'chrome'` uses the locally installed Google Chrome, so no
 * browser download is needed. Use `npx playwright install chromium` and
 * remove `channel` if Chrome is not installed.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5180',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: 'npm run dev -- --port 5180 --strictPort',
    url: 'http://localhost:5180',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

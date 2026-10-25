import { defineConfig, devices } from '@playwright/test';

/**
 * UACM Playwright E2E Configuration
 * Optimized for manual on-demand execution, interactive UI mode, and mobile ad simulation testing.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  /* Do not fail on accidental .only in local debugging */
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5020',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'ar-SA',
    timezoneId: 'Asia/Riyadh',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14 Pro'] },
    },
  ],
  /* Automatically reuse or start Next.js dev server on port 5020 */
  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:5020',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});

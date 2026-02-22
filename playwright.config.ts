import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],
  projects: [
    { name: 'default', use: { baseURL: 'http://localhost:4173' } },
    {
      name: 'live',
      use: { baseURL: process.env.LIVE_BASE_URL || 'http://localhost:5173' },
      // No webServer — user runs `npm run dev` manually
    },
  ],
  use: {
    viewport: { width: 1280, height: 720 },
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/start-e2e-server.mjs',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});


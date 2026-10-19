import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  globalTeardown: './tests/fixtures/teardown.mjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: process.env.NEXUS_TEST_CHROME ? { executablePath: process.env.NEXUS_TEST_CHROME } : {},
  },
  webServer: [
    {
      command: 'node tests/fixtures/auth-server.mjs',
      url: 'http://127.0.0.1:4181/__fixture/state',
      timeout: 15000,
      reuseExistingServer: false,
    },
    {
      command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173/login',
      timeout: 60000,
      reuseExistingServer: false,
    },
  ],
});

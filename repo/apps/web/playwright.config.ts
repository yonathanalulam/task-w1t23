import { defineConfig } from '@playwright/test';

const baseURL = process.env.PW_BASE_URL ?? 'http://127.0.0.1:4173';
const useEmbeddedWebServer = process.env.PW_USE_WEB_SERVER === '1';

export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL
  },
  ...(useEmbeddedWebServer
    ? {
        webServer: {
          command: 'npm run dev',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000
        }
      }
    : {})
});

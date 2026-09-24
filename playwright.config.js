import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4320', browserName: 'chromium', headless: true },
  webServer: {
    command: 'node server/index.js', url: 'http://127.0.0.1:4320/api/health',
    reuseExistingServer: false,
    env: { PORT: '4320', HOST: '127.0.0.1', DEMO_MODE: 'true', ENABLE_WECHAT_NOTIFY: 'false', GOOGLE_REVIEW_URL: '' },
  },
});
